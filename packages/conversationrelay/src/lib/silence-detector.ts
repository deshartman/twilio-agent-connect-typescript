/**
 * SilenceDetector - Progressive reminder system for silent callers
 *
 * Monitors call silence and triggers progressive reminders after a threshold.
 * Based on the simple-conversation-relay SilenceHandler pattern.
 */

import type { CallSid } from '../types.js';
import type { Logger } from 'pino';

/**
 * Configuration for silence detection behavior
 */
export interface SilenceDetectorConfig {
  /** Threshold in seconds before triggering silence callback */
  thresholdSeconds: number;
  /** Array of reminder messages to send on each silence timeout */
  reminders: string[];
  /** Callback when silence is detected */
  onSilence: (callSid: CallSid, reminder: string, isTerminal: boolean) => void;
}

/**
 * SilenceDetector monitors call silence and triggers progressive reminders
 *
 * @example
 * ```typescript
 * const detector = new SilenceDetector(
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
 * detector.reset(callSid);
 *
 * // Stop monitoring when call ends
 * detector.stop(callSid);
 * ```
 */
export class SilenceDetector {
  private readonly timers: Map<CallSid, NodeJS.Timeout> = new Map();
  private readonly reminderIndex: Map<CallSid, number> = new Map();
  private readonly config: SilenceDetectorConfig;
  private readonly logger: Logger;

  constructor(config: SilenceDetectorConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'silence-detector' });
  }

  /**
   * Reset the silence timer for a call
   * Call this whenever the user provides input (prompt, DTMF, etc.)
   */
  public reset(callSid: CallSid): void {
    this.clearTimer(callSid);
    this.reminderIndex.set(callSid, 0);
    this.startTimer(callSid);
    this.logger.debug({ call_sid: callSid }, 'Silence timer reset');
  }

  /**
   * Stop monitoring silence for a call
   * Call this when the call ends or silence detection should be disabled
   */
  public stop(callSid: CallSid): void {
    this.clearTimer(callSid);
    this.reminderIndex.delete(callSid);
    this.logger.debug({ call_sid: callSid }, 'Silence monitoring stopped');
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
   * Shutdown the detector and clear all timers
   * Call this when the application is shutting down
   */
  public shutdown(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.reminderIndex.clear();
    this.logger.info('Silence detector shutdown complete');
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
