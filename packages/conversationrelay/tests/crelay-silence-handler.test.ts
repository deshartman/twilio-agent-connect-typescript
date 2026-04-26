import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { SilenceHandler, type SilenceHandlerConfig } from '../src/lib/silence-handler';

describe('SilenceHandler (per-session)', () => {
  let handler: SilenceHandler;
  let onReminderMock: ReturnType<typeof vi.fn>;
  let onTerminateMock: ReturnType<typeof vi.fn>;
  const logger = createLogger({ name: 'test', level: 'silent' });

  beforeEach(() => {
    vi.useFakeTimers();
    onReminderMock = vi.fn();
    onTerminateMock = vi.fn();
  });

  afterEach(() => {
    if (handler) {
      handler.stop();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const make = (overrides: Partial<SilenceHandlerConfig> = {}): SilenceHandler =>
    new SilenceHandler(
      {
        thresholdSeconds: 5,
        reminders: ['Are you still there?'],
        onReminder: onReminderMock,
        onTerminate: onTerminateMock,
        ...overrides,
      },
      logger
    );

  // ===========================================================================
  // 1. Basic progression
  // ===========================================================================

  describe('basic progression', () => {
    it('fires the first reminder after threshold, terminates on the next breach', () => {
      handler = make();
      handler.reset();

      vi.advanceTimersByTime(4999);
      expect(onReminderMock).not.toHaveBeenCalled();
      expect(onTerminateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
      expect(onReminderMock).toHaveBeenCalledWith('Are you still there?');
      expect(onTerminateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
      expect(onTerminateMock).toHaveBeenCalledTimes(1);
    });

    it('does not fire anything before threshold', () => {
      handler = make({ thresholdSeconds: 10 });
      handler.reset();
      vi.advanceTimersByTime(9999);
      expect(onReminderMock).not.toHaveBeenCalled();
      expect(onTerminateMock).not.toHaveBeenCalled();
    });

    it('converts seconds to milliseconds', () => {
      handler = make({ thresholdSeconds: 2 });
      handler.reset();
      vi.advanceTimersByTime(2000);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing if reset() has not been called', () => {
      handler = make();
      vi.advanceTimersByTime(10000);
      expect(onReminderMock).not.toHaveBeenCalled();
      expect(onTerminateMock).not.toHaveBeenCalled();
    });

    it('empty reminders list terminates immediately on first breach', () => {
      handler = make({ reminders: [] });
      handler.reset();
      vi.advanceTimersByTime(5000);
      expect(onReminderMock).not.toHaveBeenCalled();
      expect(onTerminateMock).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 2. Progressive reminders
  // ===========================================================================

  describe('progressive reminders', () => {
    it('fires reminders in order, then calls onTerminate on the next breach', () => {
      handler = make({ reminders: ['First', 'Second', 'Final'] });
      handler.reset();

      vi.advanceTimersByTime(5000);
      expect(onReminderMock).toHaveBeenLastCalledWith('First');

      vi.advanceTimersByTime(5000);
      expect(onReminderMock).toHaveBeenLastCalledWith('Second');

      vi.advanceTimersByTime(5000);
      expect(onReminderMock).toHaveBeenLastCalledWith('Final');
      expect(onReminderMock).toHaveBeenCalledTimes(3);
      expect(onTerminateMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(onTerminateMock).toHaveBeenCalledTimes(1);
    });

    it('stops scheduling after onTerminate fires', () => {
      handler = make({ reminders: ['First'] });
      handler.reset();

      vi.advanceTimersByTime(5000); // First fires
      vi.advanceTimersByTime(5000); // onTerminate fires
      expect(onReminderMock).toHaveBeenCalledTimes(1);
      expect(onTerminateMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10000);
      expect(onTerminateMock).toHaveBeenCalledTimes(1);
      expect(handler.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // 3. reset / stop
  // ===========================================================================

  describe('reset / stop', () => {
    it('reset() cancels the existing timer and starts a new one from zero', () => {
      handler = make();
      handler.reset();
      vi.advanceTimersByTime(3000);

      handler.reset();

      vi.advanceTimersByTime(4999);
      expect(onReminderMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
    });

    it('reset() clears the reminder index', () => {
      handler = make({ reminders: ['First', 'Second', 'Third'] });
      handler.reset();
      vi.advanceTimersByTime(5000); // First

      handler.reset();
      vi.advanceTimersByTime(5000);

      expect(onReminderMock).toHaveBeenCalledTimes(2);
      expect(onReminderMock).toHaveBeenLastCalledWith('First');
    });

    it('stop() cancels the timer without firing', () => {
      handler = make();
      handler.reset();
      vi.advanceTimersByTime(3000);

      handler.stop();

      vi.advanceTimersByTime(5000);
      expect(onReminderMock).not.toHaveBeenCalled();
      expect(onTerminateMock).not.toHaveBeenCalled();
      expect(handler.isActive()).toBe(false);
    });

    it('stop() clears the reminder index', () => {
      handler = make({ reminders: ['First', 'Second'] });
      handler.reset();
      vi.advanceTimersByTime(5000); // First fires

      handler.stop();

      handler.reset();
      vi.advanceTimersByTime(5000);

      expect(onReminderMock).toHaveBeenCalledTimes(2);
      expect(onReminderMock).toHaveBeenLastCalledWith('First');
    });

    it('stop() is safe when no timer is scheduled', () => {
      handler = make();
      expect(() => handler.stop()).not.toThrow();
    });

    it('rapid reset() calls schedule only the last timer', () => {
      handler = make();
      handler.reset();
      handler.reset();
      handler.reset();

      vi.advanceTimersByTime(5000);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 4. setEnabled / isEnabled
  // ===========================================================================

  describe('setEnabled / isEnabled', () => {
    it('is enabled by default', () => {
      handler = make();
      expect(handler.isEnabled()).toBe(true);
    });

    it('setEnabled(false) clears the active timer and suppresses firing', () => {
      handler = make();
      handler.reset();
      expect(handler.isActive()).toBe(true);

      handler.setEnabled(false);

      expect(handler.isEnabled()).toBe(false);
      expect(handler.isActive()).toBe(false);

      vi.advanceTimersByTime(10000);
      expect(onReminderMock).not.toHaveBeenCalled();
      expect(onTerminateMock).not.toHaveBeenCalled();
    });

    it('reset() while disabled is a no-op for timer scheduling', () => {
      handler = make();
      handler.setEnabled(false);
      handler.reset();
      expect(handler.isActive()).toBe(false);

      vi.advanceTimersByTime(10000);
      expect(onReminderMock).not.toHaveBeenCalled();
    });

    it('setEnabled(true) does NOT auto-restart the timer — caller must reset()', () => {
      handler = make();
      handler.reset();
      handler.setEnabled(false);

      handler.setEnabled(true);
      expect(handler.isActive()).toBe(false);

      vi.advanceTimersByTime(10000);
      expect(onReminderMock).not.toHaveBeenCalled();

      handler.reset();
      vi.advanceTimersByTime(5000);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the state is already at the requested value', () => {
      handler = make();
      handler.reset();
      const wasActive = handler.isActive();

      handler.setEnabled(true);
      expect(handler.isActive()).toBe(wasActive);
    });
  });

  // ===========================================================================
  // 5. Multi-session independence (two separate instances)
  // ===========================================================================

  describe('multi-session independence', () => {
    it('two handler instances track their own timers independently', () => {
      const onReminder1 = vi.fn();
      const onReminder2 = vi.fn();

      const h1 = new SilenceHandler(
        {
          thresholdSeconds: 5,
          reminders: ['Reminder'],
          onReminder: onReminder1,
          onTerminate: vi.fn(),
        },
        logger
      );
      const h2 = new SilenceHandler(
        {
          thresholdSeconds: 5,
          reminders: ['Reminder'],
          onReminder: onReminder2,
          onTerminate: vi.fn(),
        },
        logger
      );

      h1.reset();
      vi.advanceTimersByTime(2000);
      h2.reset();

      vi.advanceTimersByTime(3000); // 5000 total for h1
      expect(onReminder1).toHaveBeenCalledTimes(1);
      expect(onReminder2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000); // 5000 total for h2
      expect(onReminder2).toHaveBeenCalledTimes(1);

      h1.stop();
      h2.stop();
    });
  });

  // ===========================================================================
  // 6. Edge cases
  // ===========================================================================

  describe('edge cases', () => {
    it('sub-second thresholds fire correctly', () => {
      handler = make({ thresholdSeconds: 0.1 });
      handler.reset();
      vi.advanceTimersByTime(100);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
    });

    it('long thresholds fire at the right time', () => {
      handler = make({ thresholdSeconds: 3600 });
      handler.reset();
      vi.advanceTimersByTime(3599999);
      expect(onReminderMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onReminderMock).toHaveBeenCalledTimes(1);
    });
  });
});
