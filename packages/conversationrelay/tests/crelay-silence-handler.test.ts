import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { SilenceHandler, type SilenceHandlerConfig } from '../src/lib/silence-handler';
import type { CallSid } from '../src/types';

describe('SilenceHandler', () => {
  let handler: SilenceHandler;
  let onSilenceMock: ReturnType<typeof vi.fn>;
  const logger = createLogger({ name: 'test', level: 'silent' });
  const CALL_SID: CallSid = 'CA1234567890abcdef1234567890abcdef' as CallSid;
  const CALL_SID_2: CallSid = 'CAfedcba0987654321fedcba0987654321' as CallSid;

  beforeEach(() => {
    vi.useFakeTimers();
    onSilenceMock = vi.fn();
  });

  afterEach(() => {
    if (handler) {
      handler.shutdown();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. Basic Timer Functionality
  // =========================================================================

  describe('basic timer functionality', () => {
    it('should trigger onSilence callback after threshold', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Are you still there?'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);

      // Fast forward just under threshold
      vi.advanceTimersByTime(4999);
      expect(onSilenceMock).not.toHaveBeenCalled();

      // Cross threshold
      vi.advanceTimersByTime(1);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'Are you still there?', true);
    });

    it('should not trigger callback before threshold', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 10,
        reminders: ['Still there?'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(9999);

      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('should convert seconds to milliseconds correctly', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 2,
        reminders: ['Quick reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(2000);

      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. Progressive Reminders
  // =========================================================================

  describe('progressive reminders', () => {
    it('should send first reminder, then second, then third', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First reminder', 'Second reminder', 'Final warning'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);

      // First reminder
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'First reminder', false);

      // Second reminder
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'Second reminder', false);

      // Third reminder (terminal)
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(3);
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'Final warning', true);
    });

    it('should mark last reminder as terminal', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Only reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'Only reminder', true);
    });

    it('should mark non-last reminders as non-terminal', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Second'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'First', false);
    });

    it('should stop scheduling after terminal reminder', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Last'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);

      // First reminder
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);

      // Last reminder (terminal)
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith(CALL_SID, 'Last', true);

      // No more reminders scheduled
      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).toHaveBeenCalledTimes(2);
    });

    it('should use last reminder if index exceeds array length', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Last'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);

      // Manually advance past expected reminders
      vi.advanceTimersByTime(5000); // First
      vi.advanceTimersByTime(5000); // Last (terminal - stops here)

      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith(CALL_SID, 'Last', true);
    });
  });

  // =========================================================================
  // 3. Reset Behavior
  // =========================================================================

  describe('reset behavior', () => {
    it('should cancel existing timer and start new one on reset', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(3000);

      // Reset timer
      handler.reset(CALL_SID);

      // Old timer should be cancelled, new one starts from 0
      vi.advanceTimersByTime(4999);
      expect(onSilenceMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('should reset reminder index when reset is called', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Second', 'Third'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000); // First reminder

      // Reset - should start from first reminder again
      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith(CALL_SID, 'First', false);
    });

    it('should handle reset on inactive call (no existing timer)', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      // Reset without previous timer
      expect(() => handler.reset(CALL_SID)).not.toThrow();

      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Stop Behavior
  // =========================================================================

  describe('stop behavior', () => {
    it('should cancel timer and not trigger callback', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(3000);

      handler.stop(CALL_SID);

      // Advance past original threshold
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('should clear reminder index when stopped', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Second'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000); // First reminder

      handler.stop(CALL_SID);

      // Start fresh - should begin at first reminder
      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith(CALL_SID, 'First', false);
    });

    it('should handle stop on inactive call (no existing timer)', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      // Stop without previous timer
      expect(() => handler.stop(CALL_SID)).not.toThrow();
    });
  });

  // =========================================================================
  // 5. Multi-Call Support
  // =========================================================================

  describe('multi-call support', () => {
    it('should track timers independently for different calls', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(2000);

      handler.reset(CALL_SID_2);

      // First call triggers
      vi.advanceTimersByTime(3000); // Total: 5000ms for CALL_SID
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'Reminder', true);

      // Second call triggers
      vi.advanceTimersByTime(2000); // Total: 5000ms for CALL_SID_2
      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith(CALL_SID_2, 'Reminder', true);
    });

    it('should stop only specified call without affecting others', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      handler.reset(CALL_SID_2);

      vi.advanceTimersByTime(3000);

      // Stop first call
      handler.stop(CALL_SID);

      // Second call continues
      vi.advanceTimersByTime(2000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID_2, 'Reminder', true);
    });

    it('should track separate reminder indices for each call', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Second', 'Third'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000); // CALL_SID: First reminder

      handler.reset(CALL_SID_2);
      vi.advanceTimersByTime(5000); // CALL_SID: Second, CALL_SID_2: First

      expect(onSilenceMock).toHaveBeenCalledTimes(3);
      expect(onSilenceMock).toHaveBeenNthCalledWith(1, CALL_SID, 'First', false);
      expect(onSilenceMock).toHaveBeenNthCalledWith(2, CALL_SID, 'Second', false);
      expect(onSilenceMock).toHaveBeenNthCalledWith(3, CALL_SID_2, 'First', false);
    });
  });

  // =========================================================================
  // 6. Shutdown
  // =========================================================================

  describe('shutdown', () => {
    it('should clear all timers', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      handler.reset(CALL_SID_2);

      handler.shutdown();

      // No callbacks should fire after shutdown
      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('should clear all reminder indices', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['First', 'Second'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000); // First reminder

      handler.shutdown();

      // Can be used again after shutdown (would start fresh)
      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith(CALL_SID, 'First', false);
    });

    it('should be safe to call shutdown multiple times', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      handler.shutdown();

      expect(() => handler.shutdown()).not.toThrow();
    });

    it('should be safe to call shutdown with no active timers', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      expect(() => handler.shutdown()).not.toThrow();
    });
  });

  // =========================================================================
  // 7. Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle empty reminders array with fallback', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: [],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);

      // Should use fallback reminder
      expect(onSilenceMock).toHaveBeenCalledWith(CALL_SID, 'Are you still there?', true);
    });

    it('should handle very short threshold', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 0.1,
        reminders: ['Quick'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(100);

      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('should handle very long threshold', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 3600, // 1 hour
        reminders: ['After long silence'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      handler.reset(CALL_SID);
      vi.advanceTimersByTime(3599999);
      expect(onSilenceMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid reset calls', () => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      handler = new SilenceHandler(config, logger);

      // Rapid resets
      handler.reset(CALL_SID);
      handler.reset(CALL_SID);
      handler.reset(CALL_SID);

      // Only the last reset should count
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 8. setEnabled / isEnabled
  // =========================================================================

  describe('setEnabled / isEnabled', () => {
    const makeHandler = (): SilenceHandler => {
      const config: SilenceHandlerConfig = {
        thresholdSeconds: 5,
        reminders: ['Reminder'],
        onSilence: onSilenceMock,
      };
      return new SilenceHandler(config, logger);
    };

    it('is enabled by default', () => {
      handler = makeHandler();
      expect(handler.isEnabled()).toBe(true);
    });

    it('setEnabled(false) clears active timers and suppresses firing', () => {
      handler = makeHandler();
      handler.reset(CALL_SID);
      handler.reset(CALL_SID_2);
      expect(handler.getActiveCount()).toBe(2);

      handler.setEnabled(false);

      expect(handler.isEnabled()).toBe(false);
      expect(handler.getActiveCount()).toBe(0);

      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('reset() while disabled is a no-op for timer scheduling', () => {
      handler = makeHandler();
      handler.setEnabled(false);

      handler.reset(CALL_SID);
      expect(handler.getActiveCount()).toBe(0);

      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('setEnabled(true) does NOT auto-restart timers — caller must reset()', () => {
      handler = makeHandler();
      handler.reset(CALL_SID);
      handler.setEnabled(false);
      expect(handler.getActiveCount()).toBe(0);

      handler.setEnabled(true);
      expect(handler.getActiveCount()).toBe(0);

      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();

      // Caller re-arms explicitly
      handler.reset(CALL_SID);
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the state is already at the requested value', () => {
      handler = makeHandler();
      handler.reset(CALL_SID);
      const before = handler.getActiveCount();

      handler.setEnabled(true); // already true
      expect(handler.getActiveCount()).toBe(before);
    });
  });
});
