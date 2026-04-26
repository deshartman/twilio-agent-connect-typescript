/**
 * set_silence_detection built-in tool + executeTool silenceEnabled
 * result-convention.
 *
 * Tool body is pure; returns {success, message, silenceEnabled}. CR's
 * executeTool applies the side effect via `session.silenceHandler.setEnabled`
 * (and reset() on enable).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import { setSilenceDetectionTool } from '../src/tools/set-silence-detection';
import type { CallSid } from '../src/types';

describe('ConversationRelay: set_silence_detection tool + silenceEnabled convention', () => {
  let cr: ConversationRelay;
  const logger = createLogger({ name: 'test', level: 'silent' });
  const CALL_SID: CallSid = 'CA1234567890abcdef1234567890abcdef' as CallSid;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createMockWebSocket(): any {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      _handlers: handlers,
      simulateMessage(data: unknown): void {
        for (const h of handlers['message'] || []) {
          h(Buffer.from(JSON.stringify(data)));
        }
      },
    };
  }

  const openSession = (): ReturnType<typeof createMockWebSocket> => {
    const ws = createMockWebSocket();
    cr.handleConnection(ws);
    ws.simulateMessage({
      type: 'setup',
      sessionId: 'sess_test',
      callSid: CALL_SID,
      from: '+15551234567',
      to: '+15559876543',
      direction: 'inbound',
      callType: 'PSTN',
      callStatus: 'ringing',
      accountSid: 'ACtest123',
    });
    return ws;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (cr) cr.shutdown();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ===========================================================================
  // 1. Pure tool body
  // ===========================================================================

  describe('tool body (pure)', () => {
    it('returns silenceEnabled=true for enabled=true', async () => {
      const result = (await setSilenceDetectionTool.implementation({ enabled: true })) as {
        success: boolean;
        silenceEnabled: boolean;
      };
      expect(result.success).toBe(true);
      expect(result.silenceEnabled).toBe(true);
    });

    it('returns silenceEnabled=false for enabled=false', async () => {
      const result = (await setSilenceDetectionTool.implementation({ enabled: false })) as {
        success: boolean;
        silenceEnabled: boolean;
      };
      expect(result.silenceEnabled).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Registration
  // ===========================================================================

  describe('registration', () => {
    it('appears in listTools() for a silence-configured CR', () => {
      cr = new ConversationRelay(logger, { silence: {} });
      const names = cr.getToolRegistry().list().map(t => t.name);
      expect(names).toContain('set_silence_detection');
    });

    it('appears in listTools() even when CR has no silence config', () => {
      // Tool is registered regardless; it's just a no-op when invoked on a
      // session that has no silence handler.
      cr = new ConversationRelay(logger);
      const names = cr.getToolRegistry().list().map(t => t.name);
      expect(names).toContain('set_silence_detection');
    });
  });

  // ===========================================================================
  // 3. executeTool — silenceEnabled convention with silence handler present
  // ===========================================================================

  describe('executeTool with silence handler', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger, { silence: { thresholdSeconds: 5 } });
    });

    it('enabled=false stops the silence timer', async () => {
      const ws = openSession();

      await cr.getSession(CALL_SID)!.executeTool('set_silence_detection', { enabled: false });

      vi.advanceTimersByTime(10000); // past threshold
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('enabled=true re-arms the silence timer from zero', async () => {
      const ws = openSession();
      await cr.getSession(CALL_SID)!.executeTool('set_silence_detection', { enabled: false });

      // Disabled — 4s pass, no fire
      vi.advanceTimersByTime(4000);
      expect(ws.send).not.toHaveBeenCalled();

      await cr.getSession(CALL_SID)!.executeTool('set_silence_detection', { enabled: true });

      // Re-armed from zero — 4s from now is still not enough
      vi.advanceTimersByTime(4000);
      expect(ws.send).not.toHaveBeenCalled();

      // Full 5s from re-arm does fire
      vi.advanceTimersByTime(1000);
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('text');
      expect(sent.token).toBe('Are you still there?');
    });

    it('returns the tool result to the caller', async () => {
      openSession();
      const result = (await cr.getSession(CALL_SID)!.executeTool('set_silence_detection', {
        enabled: false,
      })) as { success: boolean; silenceEnabled: boolean };
      expect(result.success).toBe(true);
      expect(result.silenceEnabled).toBe(false);
    });
  });

  // ===========================================================================
  // 4. executeTool — no silence handler → no-op
  // ===========================================================================

  describe('executeTool without silence handler', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger); // no silence config
    });

    it('is a no-op — tool result still returns, but no session side-effect', async () => {
      openSession();

      const result = (await cr.getSession(CALL_SID)!.executeTool('set_silence_detection', {
        enabled: true,
      })) as { success: boolean };
      expect(result.success).toBe(true);

      // The session has no silenceHandler to toggle; verify that.
      const session = cr.getSession(CALL_SID);
      expect(session?.silenceHandler).toBeUndefined();
    });
  });
});
