import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { WebSocket } from 'ws';
import { ConversationRelay } from '../src/crelay';
import { defineTool } from '../src/lib/define-tool';
import type { CallSid } from '../src/types';

/**
 * Tests for the ConversationRelay tool registry and executeTool dispatch.
 *
 * Registry contract:
 * - Four CR built-in protocol tools are auto-registered in the constructor.
 * - registerTool / unregisterTool / listTools manage the registry.
 * - executeTool runs the tool's implementation and, if the result carries a valid
 *   `outgoingMessage`, validates it and ships it via the WebSocket automatically.
 */
describe('ConversationRelay tool registry', () => {
  const createTestLogger = () => pino({ level: 'silent' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockWebSocket = (): any => {
    const handlers: Record<string, ((...args: any[]) => void)[]> = {};
    return {
      on(event: string, handler: (...args: any[]) => void) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      _emit(event: string, ...args: any[]) {
        for (const h of handlers[event] || []) h(...args);
      },
    };
  };

  const emitSetup = (ws: ReturnType<typeof createMockWebSocket>, callSid: string): void => {
    const setupMessage = JSON.stringify({
      type: 'setup',
      sessionId: 'sess_test',
      callSid,
      from: '+15551234567',
      to: '+15559876543',
      direction: 'inbound',
      callType: 'PSTN',
      callStatus: 'ringing',
      accountSid: 'ACtest',
    });
    ws._emit('message', Buffer.from(setupMessage));
  };

  let conversationRelay: ConversationRelay;
  beforeEach(() => {
    conversationRelay = new ConversationRelay(createTestLogger());
  });

  describe('listTools / registerTool / unregisterTool', () => {
    it('auto-registers the seven built-in tools', () => {
      const names = conversationRelay.listTools().map(t => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'play_media',
          'send_digits',
          'switch_language',
          'end_call',
          'live_agent_handoff',
          'set_listen_mode',
          'set_silence_detection',
        ])
      );
      expect(names).toHaveLength(7);
    });

    it('registerTool adds a user tool', () => {
      const userTool = defineTool(
        'lookup_order',
        'Fetch order status',
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        async () => ({ status: 'ok' })
      );
      conversationRelay.registerTool(userTool);
      const names = conversationRelay.listTools().map(t => t.name);
      expect(names).toContain('lookup_order');
      expect(conversationRelay.listTools()).toHaveLength(8);
    });

    it('registerTool overwrites a tool with the same name', () => {
      const first = defineTool(
        'custom',
        'first',
        { type: 'object' },
        () => ({ which: 'first' })
      );
      const second = defineTool(
        'custom',
        'second',
        { type: 'object' },
        () => ({ which: 'second' })
      );
      conversationRelay.registerTool(first);
      conversationRelay.registerTool(second);
      const tool = conversationRelay.listTools().find(t => t.name === 'custom');
      expect(tool?.description).toBe('second');
    });

    it('unregisterTool removes a built-in tool', () => {
      conversationRelay.unregisterTool('end_call');
      const names = conversationRelay.listTools().map(t => t.name);
      expect(names).not.toContain('end_call');
    });
  });

  describe('executeTool', () => {
    it('throws on unknown tool name', async () => {
      await expect(
        conversationRelay.executeTool('CA_unused' as CallSid, 'nope', {})
      ).rejects.toThrow('Unknown tool: nope');
    });

    it('auto-ships a valid protocol outgoingMessage via the WebSocket', async () => {
      const ws = createMockWebSocket();
      conversationRelay.handleConnection(ws);
      emitSetup(ws, 'CA_auto_ship');

      const result = (await conversationRelay.executeTool('CA_auto_ship' as CallSid, 'send_digits', {
        digits: '1234',
      })) as { success: boolean; outgoingMessage: { type: string; digits: string } };

      expect(result.success).toBe(true);

      // The WebSocket should have received the sendDigits frame
      const shippedFrames = ws.send.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string)
      );
      expect(shippedFrames).toContainEqual(
        expect.objectContaining({ type: 'sendDigits', digits: '1234' })
      );
    });

    it('rejects an invalid outgoingMessage without shipping', async () => {
      // Inject a logger with a spy on error() so we can assert the diagnostic
      // alongside the thrown error — breaking either surface should fail this test.
      const errorSpy = vi.fn();
      const loggerWithSpy = Object.assign(pino({ level: 'silent' }), { error: errorSpy });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr = new ConversationRelay(loggerWithSpy as any);

      const badTool = defineTool(
        'bad_protocol',
        'returns invalid outgoingMessage',
        { type: 'object' },
        () => ({ outgoingMessage: { type: 'not-a-real-type', payload: 'nope' } })
      );
      cr.registerTool(badTool);

      const ws = createMockWebSocket();
      cr.handleConnection(ws);
      emitSetup(ws, 'CA_bad_msg');

      await expect(
        cr.executeTool('CA_bad_msg' as CallSid, 'bad_protocol', {})
      ).rejects.toThrow("Tool 'bad_protocol' produced invalid outgoingMessage");

      // Nothing should have been sent after the setup
      expect(ws.send).not.toHaveBeenCalled();

      // The validation error must be logged so invalid protocol frames leave a
      // trail — silent failures here would be very hard to debug in production.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'bad_protocol',
          errors: expect.any(Array),
          outgoingMessage: { type: 'not-a-real-type', payload: 'nope' },
        }),
        expect.stringContaining('invalid outgoingMessage')
      );
    });

    it('returns the plain result unchanged for non-protocol tools', async () => {
      const lookupTool = defineTool(
        'lookup_order',
        'Fetch order status',
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        async ({ id }: { id: string }) => ({ id, status: 'shipped' })
      );
      conversationRelay.registerTool(lookupTool);

      const ws = createMockWebSocket();
      conversationRelay.handleConnection(ws);
      emitSetup(ws, 'CA_plain_tool');

      const result = await conversationRelay.executeTool(
        'CA_plain_tool' as CallSid,
        'lookup_order',
        { id: 'ord_42' }
      );
      expect(result).toEqual({ id: 'ord_42', status: 'shipped' });

      // No outgoingMessage, so nothing ships after setup
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
