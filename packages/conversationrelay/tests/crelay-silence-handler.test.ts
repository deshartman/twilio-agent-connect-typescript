import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger';
import { SilenceHandler, type SilenceHandlerConfig } from '../src/lib/silence-handler';

describe('SilenceHandler (per-session)', () => {
  let handler: SilenceHandler;
  let onSilenceMock: ReturnType<typeof vi.fn>;
  const logger = createLogger({ name: 'test', level: 'silent' });

  beforeEach(() => {
    vi.useFakeTimers();
    onSilenceMock = vi.fn();
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
        onSilence: onSilenceMock,
        ...overrides,
      },
      logger
    );

  // ===========================================================================
  // 1. Basic timer
  // ===========================================================================

  describe('basic timer', () => {
    it('fires onSilence after threshold', () => {
      handler = make();
      handler.reset();

      vi.advanceTimersByTime(4999);
      expect(onSilenceMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
      expect(onSilenceMock).toHaveBeenCalledWith('Are you still there?', true);
    });

    it('does not fire before threshold', () => {
      handler = make({ thresholdSeconds: 10 });
      handler.reset();
      vi.advanceTimersByTime(9999);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('converts seconds to milliseconds', () => {
      handler = make({ thresholdSeconds: 2 });
      handler.reset();
      vi.advanceTimersByTime(2000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing if reset() has not been called', () => {
      handler = make();
      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 2. Progressive reminders
  // ===========================================================================

  describe('progressive reminders', () => {
    it('fires reminders in sequence, marking the last one terminal', () => {
      handler = make({ reminders: ['First', 'Second', 'Final'] });
      handler.reset();

      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenLastCalledWith('First', false);

      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenLastCalledWith('Second', false);

      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenLastCalledWith('Final', true);
      expect(onSilenceMock).toHaveBeenCalledTimes(3);
    });

    it('single-reminder config marks the only reminder terminal', () => {
      handler = make({ reminders: ['Only'] });
      handler.reset();
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledWith('Only', true);
    });

    it('stops scheduling after the terminal reminder', () => {
      handler = make({ reminders: ['First', 'Last'] });
      handler.reset();

      vi.advanceTimersByTime(5000); // First
      vi.advanceTimersByTime(5000); // Last (terminal)
      expect(onSilenceMock).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).toHaveBeenCalledTimes(2);
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
      expect(onSilenceMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('reset() clears the reminder index', () => {
      handler = make({ reminders: ['First', 'Second', 'Third'] });
      handler.reset();
      vi.advanceTimersByTime(5000); // First fires

      handler.reset();
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith('First', false);
    });

    it('stop() cancels the timer without firing', () => {
      handler = make();
      handler.reset();
      vi.advanceTimersByTime(3000);

      handler.stop();

      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).not.toHaveBeenCalled();
      expect(handler.isActive()).toBe(false);
    });

    it('stop() clears the reminder index', () => {
      handler = make({ reminders: ['First', 'Second'] });
      handler.reset();
      vi.advanceTimersByTime(5000); // First fires

      handler.stop();

      handler.reset();
      vi.advanceTimersByTime(5000);

      expect(onSilenceMock).toHaveBeenCalledTimes(2);
      expect(onSilenceMock).toHaveBeenLastCalledWith('First', false);
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
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
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
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('reset() while disabled is a no-op for timer scheduling', () => {
      handler = make();
      handler.setEnabled(false);
      handler.reset();
      expect(handler.isActive()).toBe(false);

      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();
    });

    it('setEnabled(true) does NOT auto-restart the timer — caller must reset()', () => {
      handler = make();
      handler.reset();
      handler.setEnabled(false);

      handler.setEnabled(true);
      expect(handler.isActive()).toBe(false);

      vi.advanceTimersByTime(10000);
      expect(onSilenceMock).not.toHaveBeenCalled();

      handler.reset();
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
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
      const onSilence1 = vi.fn();
      const onSilence2 = vi.fn();

      const h1 = new SilenceHandler(
        { thresholdSeconds: 5, reminders: ['Reminder'], onSilence: onSilence1 },
        logger
      );
      const h2 = new SilenceHandler(
        { thresholdSeconds: 5, reminders: ['Reminder'], onSilence: onSilence2 },
        logger
      );

      h1.reset();
      vi.advanceTimersByTime(2000);
      h2.reset();

      vi.advanceTimersByTime(3000); // 5000 total for h1
      expect(onSilence1).toHaveBeenCalledTimes(1);
      expect(onSilence2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000); // 5000 total for h2
      expect(onSilence2).toHaveBeenCalledTimes(1);

      h1.stop();
      h2.stop();
    });
  });

  // ===========================================================================
  // 6. Edge cases
  // ===========================================================================

  describe('edge cases', () => {
    it('empty reminders array falls back to default text', () => {
      handler = make({ reminders: [] });
      handler.reset();
      vi.advanceTimersByTime(5000);
      expect(onSilenceMock).toHaveBeenCalledWith('Are you still there?', true);
    });

    it('sub-second thresholds fire correctly', () => {
      handler = make({ thresholdSeconds: 0.1 });
      handler.reset();
      vi.advanceTimersByTime(100);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });

    it('long thresholds fire at the right time', () => {
      handler = make({ thresholdSeconds: 3600 });
      handler.reset();
      vi.advanceTimersByTime(3599999);
      expect(onSilenceMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onSilenceMock).toHaveBeenCalledTimes(1);
    });
  });
});
