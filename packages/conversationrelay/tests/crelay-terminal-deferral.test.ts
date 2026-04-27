/**
 * Terminal-message deferral — the new behaviour introduced by WS-SESSIONS.
 *
 * When a tool's result-convention `outgoingMessage` is `type: 'end'`, the
 * session does NOT ship it immediately. It stashes the frame and flushes
 * it after the next `sendText(..., last: true)` — giving the LLM's streaming
 * farewell line a chance to reach TTS before Twilio hangs up.
 *
 * Direct calls to `session.endCall(...)` still ship immediately — that path
 * bypasses the registry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import { defineTool } from '../src/lib/define-tool';
import type { CallSid } from '../src/types';

describe('ConversationRelaySession: terminal-message deferral', () => {
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

  describe('executeTool → tool returns outgoingMessage type=end', () => {
    it('does NOT ship the terminal frame immediately', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('end_call', { reason: 'user asked' });

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('flushes the terminal frame after sendText(last=true)', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('end_call', { reason: 'user asked' });
      session.sendText('Goodbye!', true);

      expect(ws.send).toHaveBeenCalledTimes(2);
      const text = JSON.parse(ws.send.mock.calls[0][0] as string);
      const end = JSON.parse(ws.send.mock.calls[1][0] as string);
      expect(text).toEqual({ type: 'text', token: 'Goodbye!', last: true });
      expect(end.type).toBe('end');
    });

    it('does NOT flush on sendText(last=false)', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('end_call', { reason: 'mid-stream' });
      session.sendText('Streaming', false);

      expect(ws.send).toHaveBeenCalledTimes(1);
      const text = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(text.type).toBe('text');
      expect(text.last).toBe(false);
    });

    it('flushes on the FIRST last=true token, not subsequent ones', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('end_call', { reason: 'done' });

      session.sendText('tok-a', false);
      session.sendText('tok-b', false);
      session.sendText('tok-c', true); // flushes terminal
      session.sendText('tok-d', true); // no more terminal to flush

      const frames = ws.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string));
      const endFrames = frames.filter((f: { type: string }) => f.type === 'end');
      expect(endFrames).toHaveLength(1);
    });

    it('works for a user tool returning its own end outgoingMessage', async () => {
      const customEnd = defineTool(
        'custom_goodbye',
        'User tool that ends the call',
        { type: 'object' },
        () => ({
          success: true,
          outgoingMessage: {
            type: 'end',
            handoffData: JSON.stringify({ reason: 'custom' }),
          },
        })
      );
      cr.getToolRegistry().register(customEnd);

      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('custom_goodbye', {});
      expect(ws.send).not.toHaveBeenCalled();

      session.sendText('Bye.', true);
      expect(ws.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('direct session.endCall(...) bypasses the deferral', () => {
    it('ships immediately — no stash, no flush needed', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      session.endCall({ reason: 'bypass' });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('end');
    });
  });

  describe('listen-mode × deferred terminal', () => {
    it('suppresses the text frame but still flushes the stashed terminal', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      session.setListenMode(true);
      await session.executeTool('end_call', { reason: 'listen-mode farewell' });
      session.sendText('Goodbye!', true);

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('end');
      expect(session.getSuppressedMessageCount()).toBe(1);
    });
  });

  describe('non-terminal tool frames ship immediately', () => {
    it('sendDigits ships without deferral', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('send_digits', { digits: '1234' });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent).toEqual({ type: 'sendDigits', digits: '1234' });
    });

    it('play ships without deferral', async () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      await session.executeTool('play_media', { source: 'https://example.com/a.mp3' });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('play');
    });
  });

  describe('sendText awaits in-flight executeTool on terminal (last=true)', () => {
    it('awaits a slow tool so its stashed terminal frame lands before the flush', async () => {
      // Tool that resolves after a tick. Simulates the real-world shape:
      // caller fires executeTool(...) without awaiting, then hits the end
      // of the LLM stream and calls sendText('', true). Without the await
      // inside sendText, the terminal flush would run first and miss the
      // stash.
      let resolveTool!: () => void;
      const slowTool = defineTool(
        'slow_end',
        'tool that resolves after a tick with end frame',
        { type: 'object' },
        async () => {
          await new Promise<void>(resolve => {
            resolveTool = resolve;
          });
          return { outgoingMessage: { type: 'end', handoffData: undefined } };
        }
      );
      cr.getToolRegistry().register(slowTool);

      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      // Fire without awaiting — tool is in flight.
      const toolPromise = session.executeTool('slow_end', {});

      // Start the terminal send; it should await the in-flight tool.
      const sendPromise = session.sendText('', true);

      // Release the tool — its result-convention stashes the `end` frame.
      resolveTool();
      await toolPromise;
      await sendPromise;

      expect(ws.send).toHaveBeenCalledTimes(2);
      const text = JSON.parse(ws.send.mock.calls[0][0] as string);
      const end = JSON.parse(ws.send.mock.calls[1][0] as string);
      expect(text).toEqual({ type: 'text', token: '', last: true });
      expect(end.type).toBe('end');
    });

    it('does NOT await tools on last=false', async () => {
      // Per-token calls must stay cheap — no promise allSettled overhead.
      // Verify by firing a tool that never resolves and calling sendText(token, false):
      // if the token call awaited, the test would hang.
      const neverResolvingTool = defineTool(
        'never',
        'never resolves',
        { type: 'object' },
        () => new Promise(() => {}) // infinite
      );
      cr.getToolRegistry().register(neverResolvingTool);

      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      void session.executeTool('never', {}); // kick off, ignore

      // If sendText awaited the never-resolving tool, this would hang.
      await session.sendText('token', false);

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('flushes the terminal text even if the in-flight tool rejects', async () => {
      // Promise.allSettled — a failing tool shouldn't block the turn-end text.
      const failingTool = defineTool(
        'boom',
        'rejects',
        { type: 'object' },
        async () => {
          await Promise.resolve();
          throw new Error('kaboom');
        }
      );
      cr.getToolRegistry().register(failingTool);

      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      // Catch the expected rejection so vitest doesn't flag it.
      const toolPromise = session.executeTool('boom', {}).catch(() => {});

      await session.sendText('', true);
      await toolPromise;

      expect(ws.send).toHaveBeenCalledTimes(1);
      const text = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(text).toEqual({ type: 'text', token: '', last: true });
    });

    it('handles multiple concurrent tool calls — last-write-wins on the stash slot', async () => {
      // Two tools both emit terminal frames; the stash slot is scalar, so
      // the second write overwrites the first. Either way, exactly one `end`
      // frame ships after the flush.
      const end1 = defineTool(
        'end_one',
        'first terminal tool',
        { type: 'object' },
        () => ({ outgoingMessage: { type: 'end', handoffData: 'one' } })
      );
      const end2 = defineTool(
        'end_two',
        'second terminal tool',
        { type: 'object' },
        () => ({ outgoingMessage: { type: 'end', handoffData: 'two' } })
      );
      cr.getToolRegistry().register(end1);
      cr.getToolRegistry().register(end2);

      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;

      const p1 = session.executeTool('end_one', {});
      const p2 = session.executeTool('end_two', {});
      await Promise.all([p1, p2]);

      await session.sendText('', true);

      const frames = ws.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string));
      const endFrames = frames.filter((f: { type: string }) => f.type === 'end');
      expect(endFrames).toHaveLength(1);
    });
  });
});
