/**
 * SilenceHandler — Progressive reminder system for silent callers (per-session).
 *
 * One instance per WebSocket session. Scalar state only — the handler lives
 * and dies with its session. Constructed by `ConversationRelay` on CR `setup`
 * (if silence config was supplied), and stopped on WS close.
 *
 * Based on the simple-conversation-relay SilenceHandler pattern.
 */

import type { Logger } from './logger';

/**
 * Configuration for silence handling behavior
 */
export interface SilenceHandlerConfig {
  /** Threshold in seconds before triggering the onSilence callback */
  thresholdSeconds: number;
  /** Array of reminder messages to send on each silence timeout */
  reminders: string[];
  /**
   * Callback fired on each silence timeout. `isTerminal` is true on the final
   * reminder — typical handling is to end the call via `endCall` rather than
   * send another reminder.
   */
  onSilence: (reminder: string, isTerminal: boolean) => void;
}

/**
 * SilenceHandler — per-session silence monitor.
 *
 * @example
 * ```typescript
 * const handler = new SilenceHandler(
 *   {
 *     thresholdSeconds: 20,
 *     reminders: [
 *       'Are you still there?',
 *       'Hello? Can you hear me?',
 *       'Ending call due to inactivity',
 *     ],
 *     onSilence: (reminder, isTerminal) => {
 *       if (isTerminal) cr.endCall(callSid);
 *       else cr.sendText(callSid, reminder);
 *     },
 *   },
 *   logger
 * );
 *
 * handler.reset();                 // start (or restart) the timer
 * handler.setEnabled(false);       // disable (clears timer; reset is caller's job)
 * handler.stop();                  // stop monitoring for good
 * ```
 */
export class SilenceHandler {
  private timer: NodeJS.Timeout | null = null;
  private reminderIndex = 0;
  private enabled = true;
  private readonly config: SilenceHandlerConfig;
  private readonly logger: Logger;

  constructor(config: SilenceHandlerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'silence-handler' });
  }

  /**
   * Reset the silence timer. Call on any signal of life from the caller
   * (prompt, interrupt, DTMF). Also used to start the timer for the first
   * time. No-op if the handler is currently disabled.
   */
  public reset(): void {
    this.clearTimer();
    this.reminderIndex = 0;
    if (this.enabled) {
      this.startTimer();
    }
    this.logger.debug({ enabled: this.enabled }, 'Silence timer reset');
  }

  /**
   * Stop monitoring. Clears the timer and resets the reminder index. Call on
   * session end.
   */
  public stop(): void {
    this.clearTimer();
    this.reminderIndex = 0;
    this.logger.debug('Silence monitoring stopped');
  }

  /**
   * Enable or disable silence handling.
   *
   * When disabled: the active timer is cleared, `reset()` becomes a no-op,
   * and no reminders fire. When re-enabled: the caller must invoke `reset()`
   * to re-arm the timer — this is deliberate, so the re-enabler decides when
   * the clock restarts.
   */
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.clearTimer();
    }
    this.logger.info({ enabled }, `Silence handling ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Whether silence handling is currently enabled */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether a timer is currently scheduled */
  public isActive(): boolean {
    return this.timer !== null;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private startTimer(): void {
    this.timer = setTimeout(() => {
      const index = this.reminderIndex;
      const isTerminal = index >= this.config.reminders.length - 1;
      const reminder =
        this.config.reminders[index] ||
        this.config.reminders[this.config.reminders.length - 1] ||
        'Are you still there?';

      this.logger.info({ reminder_index: index, is_terminal: isTerminal }, 'Silence detected');

      this.config.onSilence(reminder, isTerminal);

      if (!isTerminal) {
        this.reminderIndex = index + 1;
        this.startTimer();
      } else {
        // Terminal reminder — stop monitoring.
        this.stop();
      }
    }, this.config.thresholdSeconds * 1000);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
