/**
 * SilenceHandler - Progressive reminder system for silent callers
 *
 * Monitors call silence and triggers progressive reminders after a threshold.
 * Based on the simple-conversation-relay SilenceHandler pattern.
 */

import type { CallSid } from '../types';
import type { Logger } from './logger';

/**
 * Configuration for silence handling behavior
 */
export interface SilenceHandlerConfig {
  /** Threshold in seconds before triggering silence callback */
  thresholdSeconds: number;
  /** Array of reminder messages to send on each silence timeout */
  reminders: string[];
  /** Callback when silence is detected */
  onSilence: (callSid: CallSid, reminder: string, isTerminal: boolean) => void;
}

/**
 * SilenceHandler monitors call silence and triggers progressive reminders
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
 *     onSilence: (callSid, reminder, isTerminal) => {
 *       if (isTerminal) {
 *         crelayVoice.endCall(callSid);
 *       } else {
 *         crelayVoice.sendResponse(callSid, reminder);
 *       }
 *     },
 *   },
 *   logger
 * );
 *
 * // Reset timer when user speaks
 * handler.reset(callSid);
 *
 * // Stop monitoring when call ends
 * handler.stop(callSid);
 *
 * // Disable without losing state (resumes on setEnabled(true))
 * handler.setEnabled(false);
 * ```
 */
export class SilenceHandler {
  private readonly timers: Map<CallSid, NodeJS.Timeout> = new Map();
  private readonly reminderIndex: Map<CallSid, number> = new Map();
  private readonly config: SilenceHandlerConfig;
  private readonly logger: Logger;
  private enabled = true;

  constructor(config: SilenceHandlerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'silence-handler' });
  }

  /**
   * Reset the silence timer for a call
   * Call this whenever the user provides input (prompt, DTMF, etc.)
   */
  public reset(callSid: CallSid): void {
    this.clearTimer(callSid);
    this.reminderIndex.set(callSid, 0);
    if (this.enabled) {
      this.startTimer(callSid);
    }
    this.logger.debug({ call_sid: callSid, enabled: this.enabled }, 'Silence timer reset');
  }

  /**
   * Stop monitoring silence for a call
   * Call this when the call ends or silence handling should be disabled
   */
  public stop(callSid: CallSid): void {
    this.clearTimer(callSid);
    this.reminderIndex.delete(callSid);
    this.logger.debug({ call_sid: callSid }, 'Silence monitoring stopped');
  }

  /**
   * Enable or disable silence handling globally.
   *
   * When disabled: timers are cleared for all active calls, no new timers
   * fire on `reset()`. When re-enabled: callers must invoke `reset()` to
   * start timers again (this is deliberate — the re-enabler decides which
   * calls still deserve silence monitoring).
   */
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      for (const callSid of Array.from(this.timers.keys())) {
        this.clearTimer(callSid);
      }
    }
    this.logger.info({ enabled }, `Silence handling ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Whether silence handling is currently enabled */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start the silence timer for a call
   * @private Internal method
   */
  private startTimer(callSid: CallSid): void {
    const timer = setTimeout(() => {
      const index = this.reminderIndex.get(callSid) || 0;
      const isTerminal = index >= this.config.reminders.length - 1;
      const reminder =
        this.config.reminders[index] ||
        this.config.reminders[this.config.reminders.length - 1] ||
        'Are you still there?';

      this.logger.info(
        { call_sid: callSid, reminder_index: index, is_terminal: isTerminal },
        'Silence detected'
      );

      this.config.onSilence(callSid, reminder, isTerminal);

      if (!isTerminal) {
        this.reminderIndex.set(callSid, index + 1);
        this.startTimer(callSid);
      } else {
        // Terminal reminder - stop monitoring
        this.stop(callSid);
      }
    }, this.config.thresholdSeconds * 1000);

    this.timers.set(callSid, timer);
  }

  /**
   * Clear the active timer for a call
   * @private Internal method
   */
  private clearTimer(callSid: CallSid): void {
    const timer = this.timers.get(callSid);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(callSid);
    }
  }

  /**
   * Shutdown the handler and clear all timers
   * Call this when the application is shutting down
   */
  public shutdown(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.reminderIndex.clear();
    this.logger.info('Silence handler shutdown complete');
  }

  /**
   * Get the number of active silence monitors
   */
  public getActiveCount(): number {
    return this.timers.size;
  }

  /**
   * Check if silence monitoring is active for a call
   */
  public isActive(callSid: CallSid): boolean {
    return this.timers.has(callSid);
  }
}
