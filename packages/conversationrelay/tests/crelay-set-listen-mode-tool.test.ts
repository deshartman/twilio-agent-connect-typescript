/**
 * set_listen_mode built-in tool + executeTool listenMode result-convention.
 *
 * Tool body is pure — returns {success, message, listenMode}. CR's
 * executeTool inspects the result, finds the listenMode field, and calls
 * setListenMode(callSid, ...) internally. No CR reference, no callSid
 * threading through the tool.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import { setListenModeTool } from '../src/tools/set-listen-mode';
import type { CallSid } from '../src/types';

describe('ConversationRelay: set_listen_mode tool + executeTool listenMode convention', () => {
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
  // 1. Pure tool body
  // ===========================================================================

  describe('tool body (pure function)', () => {
    it('returns {success, message, listenMode: true} when enabled=true', async () => {
      const result = (await setListenModeTool.implementation({ enabled: true })) as {
        success: boolean;
        message: string;
        listenMode: boolean;
      };
      expect(result.success).toBe(true);
      expect(result.listenMode).toBe(true);
      expect(result.message).toContain('enabled');
    });

    it('returns {success, message, listenMode: false} when enabled=false', async () => {
      const result = (await setListenModeTool.implementation({ enabled: false })) as {
        success: boolean;
        message: string;
        listenMode: boolean;
      };
      expect(result.success).toBe(true);
      expect(result.listenMode).toBe(false);
      expect(result.message).toContain('disabled');
    });
  });

  // ===========================================================================
  // 2. Tool is auto-registered and discoverable
  // ===========================================================================

  describe('registration', () => {
    it('appears in listTools()', () => {
      const names = cr.listTools().map(t => t.name);
      expect(names).toContain('set_listen_mode');
    });

    it('can be removed via unregisterTool()', () => {
      cr.unregisterTool('set_listen_mode');
      const names = cr.listTools().map(t => t.name);
      expect(names).not.toContain('set_listen_mode');
    });

    it('has an OpenAI-format export', () => {
      const tool = cr.listTools().find(t => t.name === 'set_listen_mode');
      expect(tool).toBeDefined();
      const format = tool?.toOpenAIFormat() as { type: string; function: { name: string } };
      expect(format.type).toBe('function');
      expect(format.function.name).toBe('set_listen_mode');
    });
  });

  // ===========================================================================
  // 3. executeTool applies the listenMode result-convention
  // ===========================================================================

  describe('executeTool — listenMode result-convention', () => {
    it('enabled=true flips session listen-mode to true', async () => {
      openSession();
      expect(cr.isListenMode(CALL_SID)).toBe(false);

      await cr.executeTool(CALL_SID, 'set_listen_mode', { enabled: true });

      expect(cr.isListenMode(CALL_SID)).toBe(true);
    });

    it('enabled=false flips session listen-mode to false', async () => {
      openSession();
      cr.setListenMode(CALL_SID, true);
      expect(cr.isListenMode(CALL_SID)).toBe(true);

      await cr.executeTool(CALL_SID, 'set_listen_mode', { enabled: false });

      expect(cr.isListenMode(CALL_SID)).toBe(false);
    });

    it('subsequent sendText is suppressed after enabled=true', async () => {
      const ws = openSession();
      await cr.executeTool(CALL_SID, 'set_listen_mode', { enabled: true });

      cr.sendText(CALL_SID, 'Hello');

      expect(ws.send).not.toHaveBeenCalled();
      expect(cr.getSuppressedMessageCount(CALL_SID)).toBe(1);
    });

    it('returns the tool result to the caller (for LLM feedback loop)', async () => {
      openSession();
      const result = (await cr.executeTool(CALL_SID, 'set_listen_mode', { enabled: true })) as {
        success: boolean;
        listenMode: boolean;
      };
      expect(result.success).toBe(true);
      expect(result.listenMode).toBe(true);
    });

    it('a user tool returning listenMode also triggers the side-effect', async () => {
      // Custom user tool that happens to return listenMode in its result.
      // This proves the convention is honored generically, not keyed on tool name.
      const { defineTool } = await import('../src/tools/define-tool');
      const customTool = defineTool(
        'force_listen',
        'Test tool',
        { type: 'object', properties: {}, required: [] },
        () => ({ success: true, listenMode: true, reason: 'custom' })
      );
      cr.registerTool(customTool);
      openSession();

      await cr.executeTool(CALL_SID, 'force_listen', {});

      expect(cr.isListenMode(CALL_SID)).toBe(true);
    });
  });
});
