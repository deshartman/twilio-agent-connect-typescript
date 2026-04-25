/**
 * Listen-mode state tests (Step 3 of CR-SILENCE-LISTEN-MODE).
 *
 * Covers the state/lookup surface only — no send-method gating yet (that
 * arrives in Step 4, where sendResponse/sendPlay/switchLanguage route through
 * sendRawMessage and check session.listenMode).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { ConversationRelay } from '../src/crelay';
import type { CallSid } from '../src/types';

describe('ConversationRelay: listen-mode state', () => {
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
      expect(cr.isListenMode(CALL_SID)).toBe(false);
    });

    it('new sessions have zero suppressed-message count', () => {
      openSession();
      expect(cr.getSuppressedMessageCount(CALL_SID)).toBe(0);
    });
  });

  // ===========================================================================
  // 2. setListenMode / isListenMode
  // ===========================================================================

  describe('setListenMode', () => {
    it('flips the flag from false to true', () => {
      openSession();
      cr.setListenMode(CALL_SID, true);
      expect(cr.isListenMode(CALL_SID)).toBe(true);
    });

    it('flips the flag from true back to false', () => {
      openSession();
      cr.setListenMode(CALL_SID, true);
      cr.setListenMode(CALL_SID, false);
      expect(cr.isListenMode(CALL_SID)).toBe(false);
    });

    it('is a no-op for unknown CallSid — does not throw', () => {
      const unknown = 'CA00000000000000000000000000000000' as CallSid;
      expect(() => cr.setListenMode(unknown, true)).not.toThrow();
      expect(cr.isListenMode(unknown)).toBe(false);
    });

    it('tracks listen-mode independently per session', () => {
      openSession(CALL_SID);
      openSession(CALL_SID_2);

      cr.setListenMode(CALL_SID, true);

      expect(cr.isListenMode(CALL_SID)).toBe(true);
      expect(cr.isListenMode(CALL_SID_2)).toBe(false);
    });
  });

  // ===========================================================================
  // 3. isListenMode / getSuppressedMessageCount for unknown CallSid
  // ===========================================================================

  describe('getters on unknown CallSid', () => {
    it('isListenMode returns false', () => {
      expect(cr.isListenMode('CAunknown' as CallSid)).toBe(false);
    });

    it('getSuppressedMessageCount returns 0', () => {
      expect(cr.getSuppressedMessageCount('CAunknown' as CallSid)).toBe(0);
    });
  });

  // ===========================================================================
  // 4. Session lifecycle
  // ===========================================================================

  describe('session lifecycle', () => {
    it('state is released when the WS closes', () => {
      const ws = openSession();
      cr.setListenMode(CALL_SID, true);
      expect(cr.isListenMode(CALL_SID)).toBe(true);

      ws.simulateClose();

      // Session map entry gone → getter falls back to false.
      expect(cr.isListenMode(CALL_SID)).toBe(false);
      expect(cr.hasSession(CALL_SID)).toBe(false);
    });

    it('a new session for the same CallSid starts fresh', () => {
      const ws1 = openSession();
      cr.setListenMode(CALL_SID, true);
      ws1.simulateClose();

      openSession();
      expect(cr.isListenMode(CALL_SID)).toBe(false);
    });
  });
});
