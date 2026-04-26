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
    it('appears in listTools()', () => {
      const names = cr.listTools().map(t => t.name);
      expect(names).toContain('live_agent_handoff');
    });
  });

  // ===========================================================================
  // 3. executeTool ships the end frame to Twilio
  // ===========================================================================

  describe('executeTool', () => {
    it('ships an end frame with live-agent-handoff reasonCode', async () => {
      const ws = openSession();

      await cr.executeTool(CALL_SID, 'live_agent_handoff', {
        summary: 'Customer needs a human',
      });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('end');
      const handoff = JSON.parse(sent.handoffData) as Record<string, unknown>;
      expect(handoff.reasonCode).toBe('live-agent-handoff');
      expect(handoff.reason).toBe('Customer needs a human');
    });
  });
});
