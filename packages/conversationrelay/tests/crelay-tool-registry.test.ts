import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { WebSocket } from 'ws';
import { ConversationRelay } from '../src/crelay';
import { ToolRegistry, CONVERSATION_RELAY_TOOLS } from '../src/lib/tool-registry';
import { defineTool } from '../src/lib/define-tool';
import type { CallSid } from '../src/types';

/**
 * Tests for the tool registry + executeTool dispatch.
 *
 * Registry contract (ToolRegistry, not ConversationRelay):
 * - CONVERSATION_RELAY_TOOLS contains the seven CR built-ins.
 * - register / unregister / get / has / list manage the registry.
 *
 * Dispatch contract (ConversationRelaySession.executeTool):
 * - Looks up by name in the shared ToolRegistry.
 * - If the tool result carries a valid non-terminal `outgoingMessage`, ships
 *   it via the WebSocket automatically. Terminal (`type: 'end'`) frames are
 *   deferred for the next sendText(last=true) flush — see crelay-terminal-
 *   deferral.test.ts for that path.
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

  describe('ToolRegistry (direct)', () => {
    it('CONVERSATION_RELAY_TOOLS contains the seven built-ins', () => {
      const names = CONVERSATION_RELAY_TOOLS.map(t => t.name);
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

    it('register adds a user tool', () => {
      const registry = new ToolRegistry(CONVERSATION_RELAY_TOOLS);
      const userTool = defineTool(
        'lookup_order',
        'Fetch order status',
        { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        async () => ({ status: 'ok' })
      );
      registry.register(userTool);
      expect(registry.has('lookup_order')).toBe(true);
      expect(registry.list()).toHaveLength(8);
    });

    it('register overwrites a tool with the same name', () => {
      const registry = new ToolRegistry(CONVERSATION_RELAY_TOOLS);
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
      registry.register(first);
      registry.register(second);
      expect(registry.get('custom')?.description).toBe('second');
    });

    it('unregister removes a built-in tool', () => {
      const registry = new ToolRegistry(CONVERSATION_RELAY_TOOLS);
      registry.unregister('end_call');
      expect(registry.has('end_call')).toBe(false);
    });

    it('empty construction yields an empty registry', () => {
      const registry = new ToolRegistry();
      expect(registry.list()).toHaveLength(0);
    });

    it('construction from a filtered subset lets callers opt out of built-ins', () => {
      const registry = new ToolRegistry(CONVERSATION_RELAY_TOOLS.filter(t => t.name !== 'end_call'));
      expect(registry.has('end_call')).toBe(false);
      expect(registry.list()).toHaveLength(6);
    });
  });

  describe('ConversationRelay.getToolRegistry()', () => {
    it('returns the default registry populated with CONVERSATION_RELAY_TOOLS', () => {
      const cr = new ConversationRelay(createTestLogger());
      const names = cr.getToolRegistry().list().map(t => t.name);
      expect(names).toHaveLength(7);
    });

    it('honors a user-supplied registry', () => {
      const registry = new ToolRegistry();
      const cr = new ConversationRelay(createTestLogger(), { tools: registry });
      expect(cr.getToolRegistry()).toBe(registry);
      expect(cr.getToolRegistry().list()).toHaveLength(0);
    });
  });

  describe('ConversationRelaySession.executeTool', () => {
    let conversationRelay: ConversationRelay;
    beforeEach(() => {
      conversationRelay = new ConversationRelay(createTestLogger());
    });

    it('throws on unknown tool name', async () => {
      const ws = createMockWebSocket();
      conversationRelay.handleConnection(ws);
      emitSetup(ws, 'CA_unknown_tool');
      const session = conversationRelay.getSession('CA_unknown_tool' as CallSid)!;

      await expect(session.executeTool('nope', {})).rejects.toThrow('Unknown tool: nope');
    });

    it('auto-ships a valid protocol outgoingMessage via the WebSocket', async () => {
      const ws = createMockWebSocket();
      conversationRelay.handleConnection(ws);
      emitSetup(ws, 'CA_auto_ship');
      const session = conversationRelay.getSession('CA_auto_ship' as CallSid)!;

      const result = (await session.executeTool('send_digits', { digits: '1234' })) as {
        success: boolean;
        outgoingMessage: { type: string; digits: string };
      };

      expect(result.success).toBe(true);

      const shippedFrames = ws.send.mock.calls.map((call: unknown[]) =>
        JSON.parse(call[0] as string)
      );
      expect(shippedFrames).toContainEqual(
        expect.objectContaining({ type: 'sendDigits', digits: '1234' })
      );
    });

    it('rejects an invalid outgoingMessage without shipping', async () => {
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
      cr.getToolRegistry().register(badTool);

      const ws = createMockWebSocket();
      cr.handleConnection(ws);
      emitSetup(ws, 'CA_bad_msg');
      const session = cr.getSession('CA_bad_msg' as CallSid)!;

      await expect(session.executeTool('bad_protocol', {})).rejects.toThrow(
        "Tool 'bad_protocol' produced invalid outgoingMessage"
      );

      expect(ws.send).not.toHaveBeenCalled();

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
      conversationRelay.getToolRegistry().register(lookupTool);

      const ws = createMockWebSocket();
      conversationRelay.handleConnection(ws);
      emitSetup(ws, 'CA_plain_tool');
      const session = conversationRelay.getSession('CA_plain_tool' as CallSid)!;

      const result = await session.executeTool('lookup_order', { id: 'ord_42' });
      expect(result).toEqual({ id: 'ord_42', status: 'shipped' });
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
