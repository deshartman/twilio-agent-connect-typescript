/**
 * Listen-mode state tests.
 *
 * Listen-mode + suppressed-count live on ConversationRelaySession after the
 * WS-SESSIONS refactor. Out-of-band callers with only a CallSid still
 * resolve the session via `cr.getSession(callSid)` first.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import type { CallSid } from '../src/types';

describe('ConversationRelaySession: listen-mode state', () => {
  let cr: ConversationRelay;
  const logger = createLogger({ name: 'test', level: 'silent' });
  const CALL_SID: CallSid = 'CA1234567890abcdef1234567890abcdef' as CallSid;
  const CALL_SID_2: CallSid = 'CAfedcba0987654321fedcba0987654321' as CallSid;

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

  const openSession = (callSid: CallSid = CALL_SID): ReturnType<typeof createMockWebSocket> => {
    const ws = createMockWebSocket();
    cr.handleConnection(ws);
    ws.simulateMessage({
      type: 'setup',
      sessionId: `sess_${callSid}`,
      callSid,
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
  // 1. Default state
  // ===========================================================================

  describe('default state', () => {
    it('new sessions default to listen-mode off', () => {
      openSession();
      const session = cr.getSession(CALL_SID)!;
      expect(session.isListenMode()).toBe(false);
    });

    it('new sessions have zero suppressed-message count', () => {
      openSession();
      const session = cr.getSession(CALL_SID)!;
      expect(session.getSuppressedMessageCount()).toBe(0);
    });
  });

  // ===========================================================================
  // 2. setListenMode / isListenMode
  // ===========================================================================

  describe('setListenMode', () => {
    it('flips the flag from false to true', () => {
      openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);
      expect(session.isListenMode()).toBe(true);
    });

    it('flips the flag from true back to false', () => {
      openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);
      session.setListenMode(false);
      expect(session.isListenMode()).toBe(false);
    });

    it('is a no-op for unknown CallSid — getSession returns undefined', () => {
      const unknown = 'CA00000000000000000000000000000000' as CallSid;
      expect(cr.getSession(unknown)).toBeUndefined();
    });

    it('tracks listen-mode independently per session', () => {
      openSession(CALL_SID);
      openSession(CALL_SID_2);

      cr.getSession(CALL_SID)!.setListenMode(true);

      expect(cr.getSession(CALL_SID)!.isListenMode()).toBe(true);
      expect(cr.getSession(CALL_SID_2)!.isListenMode()).toBe(false);
    });
  });

  // ===========================================================================
  // 3. Lookup for unknown CallSid
  // ===========================================================================

  describe('getSession on unknown CallSid', () => {
    it('returns undefined', () => {
      expect(cr.getSession('CAunknown' as CallSid)).toBeUndefined();
    });
  });

  // ===========================================================================
  // 4. Session lifecycle
  // ===========================================================================

  describe('session lifecycle', () => {
    it('state is released when the WS closes', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);
      expect(session.isListenMode()).toBe(true);

      ws.simulateClose();

      // Session map entry gone.
      expect(cr.getSession(CALL_SID)).toBeUndefined();
      expect(cr.hasSession(CALL_SID)).toBe(false);
    });

    it('a new session for the same CallSid starts fresh', () => {
      const ws1 = openSession();
      cr.getSession(CALL_SID)!.setListenMode(true);
      ws1.simulateClose();

      openSession();
      expect(cr.getSession(CALL_SID)!.isListenMode()).toBe(false);
    });
  });

  // ===========================================================================
  // 5. Gating — text/play/language suppressed; sendDigits/end pass
  // ===========================================================================

  describe('outgoing-message gating', () => {
    it('listen-mode off: all sends go through', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.sendText('Hello');
      session.sendPlay('https://example.com/audio.mp3');
      session.sendDigits('1234');
      session.switchLanguage({ ttsLanguage: 'es-ES' });
      session.endCall();

      expect(ws.send).toHaveBeenCalledTimes(5);
      expect(session.getSuppressedMessageCount()).toBe(0);
    });

    it('listen-mode on: text is suppressed, sendDigits passes through', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);

      session.sendText('Hello');
      session.sendDigits('1234');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('sendDigits');
      expect(session.getSuppressedMessageCount()).toBe(1);
    });

    it('listen-mode on: play is suppressed', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);

      session.sendPlay('https://example.com/audio.mp3');

      expect(ws.send).not.toHaveBeenCalled();
      expect(session.getSuppressedMessageCount()).toBe(1);
    });

    it('listen-mode on: switchLanguage is suppressed', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);

      session.switchLanguage({ ttsLanguage: 'es-ES' });

      expect(ws.send).not.toHaveBeenCalled();
      expect(session.getSuppressedMessageCount()).toBe(1);
    });

    it('listen-mode on: endCall passes through (must always be able to hang up)', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);

      session.endCall();

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('end');
      expect(session.getSuppressedMessageCount()).toBe(0);
    });

    it('suppressedCount accumulates across multiple suppressed sends', () => {
      openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);

      session.sendText('one');
      session.sendText('two');
      session.sendPlay('https://example.com/a.mp3');

      expect(session.getSuppressedMessageCount()).toBe(3);
    });

    it('flipping listen-mode off unblocks sends (counter does NOT reset)', () => {
      const ws = openSession();
      const session = cr.getSession(CALL_SID)!;
      session.setListenMode(true);
      session.sendText('suppressed');
      expect(session.getSuppressedMessageCount()).toBe(1);

      session.setListenMode(false);
      session.sendText('now sent');

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(session.getSuppressedMessageCount()).toBe(1);
    });

    it('gate applies per-session (siblings unaffected)', () => {
      const ws1 = openSession(CALL_SID);
      const ws2 = openSession(CALL_SID_2);

      const s1 = cr.getSession(CALL_SID)!;
      const s2 = cr.getSession(CALL_SID_2)!;

      s1.setListenMode(true);
      s1.sendText('suppressed');
      s2.sendText('goes through');

      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalledTimes(1);
      expect(s1.getSuppressedMessageCount()).toBe(1);
      expect(s2.getSuppressedMessageCount()).toBe(0);
    });
  });
});
