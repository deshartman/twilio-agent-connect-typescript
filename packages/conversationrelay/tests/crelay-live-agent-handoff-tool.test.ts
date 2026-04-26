/**
 * live_agent_handoff built-in tool.
 *
 * Preset over end_call: emits {type:'end', handoffData:<JSON string>} with a
 * reasonCode: 'live-agent-handoff' payload. Uses the existing
 * outgoingMessage result-convention (no new plumbing in executeTool).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import { liveAgentHandoffTool } from '../src/tools/live-agent-handoff';
import type { CallSid } from '../src/types';

describe('ConversationRelay: live_agent_handoff tool', () => {
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
    cr = new ConversationRelay(logger);
  });

  afterEach(() => {
    cr.shutdown();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Tool body
  // ===========================================================================

  describe('tool body', () => {
    it('builds an end outgoingMessage with JSON-stringified handoffData', async () => {
      const result = (await liveAgentHandoffTool.implementation({
        summary: 'Billing dispute',
      })) as {
        success: boolean;
        outgoingMessage: { type: string; handoffData: string };
      };

      expect(result.success).toBe(true);
      expect(result.outgoingMessage.type).toBe('end');
      const parsed = JSON.parse(result.outgoingMessage.handoffData) as Record<string, unknown>;
      expect(parsed.reasonCode).toBe('live-agent-handoff');
      expect(parsed.reason).toBe('Billing dispute');
    });

    it('merges extra fields into handoffData', async () => {
      const result = (await liveAgentHandoffTool.implementation({
        summary: 'Escalating',
        extra: { priority: 'high', skill: 'billing' },
      })) as { outgoingMessage: { handoffData: string } };

      const parsed = JSON.parse(result.outgoingMessage.handoffData) as Record<string, unknown>;
      expect(parsed.reasonCode).toBe('live-agent-handoff');
      expect(parsed.reason).toBe('Escalating');
      expect(parsed.priority).toBe('high');
      expect(parsed.skill).toBe('billing');
    });
  });

  // ===========================================================================
  // 2. Registration
  // ===========================================================================

  describe('registration', () => {
    it('appears in the tool registry', () => {
      const names = cr.getToolRegistry().list().map(t => t.name);
      expect(names).toContain('live_agent_handoff');
    });
  });

  // ===========================================================================
  // 3. executeTool defers the end frame until sendText(last=true) flush
  // ===========================================================================

  describe('executeTool (terminal deferral)', () => {
    it('does NOT ship the end frame immediately — stashes it for deferred flush', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('live_agent_handoff', {
        summary: 'Customer needs a human',
      });

      // Terminal frame is deferred — the LLM's farewell stream gets to reach
      // TTS before Twilio hangs up. See WS-SESSIONS plan for the race this fixes.
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('flushes the end frame after sendText(last=true)', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('live_agent_handoff', {
        summary: 'Customer needs a human',
      });

      // LLM streams its farewell line
      session.sendText('Transferring you now.', true);

      expect(ws.send).toHaveBeenCalledTimes(2);
      const text = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(text.type).toBe('text');
      expect(text.token).toBe('Transferring you now.');
      expect(text.last).toBe(true);

      const end = JSON.parse(ws.send.mock.calls[1][0] as string);
      expect(end.type).toBe('end');
      const handoff = JSON.parse(end.handoffData) as Record<string, unknown>;
      expect(handoff.reasonCode).toBe('live-agent-handoff');
      expect(handoff.reason).toBe('Customer needs a human');
    });
  });
});
