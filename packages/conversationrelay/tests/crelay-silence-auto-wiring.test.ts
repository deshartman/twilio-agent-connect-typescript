/**
 * Step 6: silence auto-wiring.
 *
 * Exercises `new ConversationRelay(logger, { silence: ... })` — CR constructs
 * a per-session SilenceHandler on setup, resets it on prompt/interrupt/dtmf,
 * stops it on WS close, and disables it when listen-mode flips on.
 *
 * Uses fake timers so we can advance the 20s threshold deterministically
 * without slowing the suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import type { CallSid } from '../src/types';

describe('ConversationRelay: silence auto-wiring on session setup', () => {
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
      simulateClose(): void {
        for (const h of handlers['close'] || []) {
          h();
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
  // 1. No config → no handler
  // ===========================================================================

  describe('when silence config is omitted', () => {
    it('does not attach a silenceHandler to the session', () => {
      cr = new ConversationRelay(logger);
      openSession();

      const session = cr.getSession(CALL_SID);
      expect(session?.silenceHandler).toBeUndefined();
    });

    it('does not fire reminders after threshold', () => {
      cr = new ConversationRelay(logger);
      const ws = openSession();

      vi.advanceTimersByTime(60000); // one minute of "silence"
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 2. silence: {} — defaults applied
  // ===========================================================================

  describe('when silence: {} (defaults)', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger, { silence: {} });
    });

    it('attaches a silenceHandler to the session on setup', () => {
      openSession();
      const session = cr.getSession(CALL_SID);
      expect(session?.silenceHandler).toBeDefined();
    });

    it('fires the default reminder after 20s of silence', () => {
      const ws = openSession();

      vi.advanceTimersByTime(20000);
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('text');
      expect(sent.token).toBe('Are you still there?');
    });

    it('terminates via endCall on the 2nd breach with only default prompt', () => {
      const ws = openSession();

      vi.advanceTimersByTime(20000); // 1st breach — reminder fires
      vi.advanceTimersByTime(20000); // 2nd breach — terminal

      expect(ws.send).toHaveBeenCalledTimes(2);
      const terminal = JSON.parse(ws.send.mock.calls[1][0] as string);
      expect(terminal.type).toBe('end');
      // endCall stringifies handoffData
      const handoff = JSON.parse(terminal.handoffData);
      expect(handoff.reasonCode).toBe('unresponsive');
    });
  });

  // ===========================================================================
  // 3. Custom threshold + additional prompts
  // ===========================================================================

  describe('with custom threshold and additionalPrompts', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger, {
        silence: {
          thresholdSeconds: 5,
          additionalPrompts: ['Just checking in', 'Last chance'],
        },
      });
    });

    it('fires default, then additionalPrompts in order, then terminal end', () => {
      const ws = openSession();

      vi.advanceTimersByTime(5000);
      expect(JSON.parse(ws.send.mock.calls[0][0] as string).token).toBe('Are you still there?');

      vi.advanceTimersByTime(5000);
      expect(JSON.parse(ws.send.mock.calls[1][0] as string).token).toBe('Just checking in');

      vi.advanceTimersByTime(5000);
      expect(JSON.parse(ws.send.mock.calls[2][0] as string).token).toBe('Last chance');

      // 4th breach is the sentinel terminal — no text reminder, just endCall.
      vi.advanceTimersByTime(5000);
      const terminal = JSON.parse(ws.send.mock.calls[3][0] as string);
      expect(terminal.type).toBe('end');
      expect(ws.send).toHaveBeenCalledTimes(4);
    });
  });

  // ===========================================================================
  // 4. Signal-of-life events reset the timer
  // ===========================================================================

  describe('signal-of-life resets', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger, { silence: { thresholdSeconds: 5 } });
    });

    it('prompt resets the timer', () => {
      const ws = openSession();

      vi.advanceTimersByTime(4000);
      // User speaks — prompt fires reset
      ws.simulateMessage({
        type: 'prompt',
        voicePrompt: 'hello',
      });

      vi.advanceTimersByTime(4000);
      expect(ws.send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000); // 5s after the reset
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('interrupt resets the timer', () => {
      const ws = openSession();

      vi.advanceTimersByTime(4000);
      ws.simulateMessage({
        type: 'interrupt',
        utteranceUntilInterrupt: 'I was saying',
        durationUntilInterruptMs: 1000,
      });

      vi.advanceTimersByTime(4000);
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('dtmf resets the timer (common footgun)', () => {
      const ws = openSession();

      vi.advanceTimersByTime(4000);
      ws.simulateMessage({
        type: 'dtmf',
        digit: '5',
      });

      vi.advanceTimersByTime(4000);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 5. WS close stops the timer
  // ===========================================================================

  describe('session lifecycle', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger, { silence: { thresholdSeconds: 5 } });
    });

    it('stops the handler on WS close (no stale fires)', () => {
      const ws = openSession();

      vi.advanceTimersByTime(3000);
      ws.simulateClose();

      // Advance past when the timer would have fired.
      vi.advanceTimersByTime(10000);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 6. Listen-mode × silence interaction
  // ===========================================================================

  describe('listen-mode interaction', () => {
    beforeEach(() => {
      cr = new ConversationRelay(logger, { silence: { thresholdSeconds: 5 } });
    });

    it('setListenMode(true) stops the silence timer', () => {
      const ws = openSession();

      cr.getSession(CALL_SID)!.setListenMode(true);
      vi.advanceTimersByTime(10000); // past threshold

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('setListenMode(false) re-arms silence timer from zero', () => {
      const ws = openSession();
      cr.getSession(CALL_SID)!.setListenMode(true);

      // Advance 10s with listen-mode on — no fire
      vi.advanceTimersByTime(10000);

      cr.getSession(CALL_SID)!.setListenMode(false);

      // Only 3s should not fire yet
      vi.advanceTimersByTime(3000);
      expect(ws.send).not.toHaveBeenCalled();

      // Full 5s from the re-arm point does fire
      vi.advanceTimersByTime(2000);
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('set_listen_mode tool flips silence off then back on', async () => {
      const ws = openSession();

      await cr.getSession(CALL_SID)!.executeTool('set_listen_mode', { enabled: true });
      vi.advanceTimersByTime(10000);
      expect(ws.send).not.toHaveBeenCalled();

      await cr.getSession(CALL_SID)!.executeTool('set_listen_mode', { enabled: false });
      vi.advanceTimersByTime(5000);
      // One message was sent — but it was the tool-result side-effect path,
      // which doesn't write to WS, so the one send here is the silence reminder.
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('text');
      expect(sent.token).toBe('Are you still there?');
    });
  });
});
