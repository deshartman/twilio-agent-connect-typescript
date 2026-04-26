/**
 * ToolRegistry — named lookup for ConversationRelay tools.
 *
 * Tools are not part of the Twilio ConversationRelay wire protocol; they are a
 * separate concern shared by every active session. One `ToolRegistry` instance
 * is passed to a `ConversationRelay` at construction, and `ConversationRelay`
 * hands the same reference to each `ConversationRelaySession`. Registering a
 * tool makes it available to every in-flight call immediately.
 */

import { ConversationRelayTool } from './define-tool';
import {
  playMediaTool,
  sendDigitsTool,
  switchLanguageTool,
  endCallTool,
  liveAgentHandoffTool,
  setListenModeTool,
  setSilenceDetectionTool,
} from '../tools/index';

/**
 * The seven CR built-in tools. Exported so users can compose their own
 * registry — either by passing this array verbatim (default), by filtering
 * it to opt out of a built-in, or by concatenating extra tools onto it.
 *
 * @example
 * ```ts
 * // Default — all built-ins
 * const registry = new ToolRegistry(CONVERSATION_RELAY_TOOLS);
 *
 * // Opt out of end_call
 * const registry = new ToolRegistry(
 *   CONVERSATION_RELAY_TOOLS.filter(t => t.name !== 'end_call'),
 * );
 *
 * // Add a user tool
 * const registry = new ToolRegistry([...CONVERSATION_RELAY_TOOLS, myTool]);
 * ```
 */
export const CONVERSATION_RELAY_TOOLS: readonly ConversationRelayTool[] = [
  // Cast through `unknown` — each tool is `ConversationRelayTool<SpecificParams, SpecificResult>`
  // but the registry holds the base `ConversationRelayTool<unknown, unknown>`. TypeScript's
  // strict invariance on generics requires the widening cast.
  playMediaTool as unknown as ConversationRelayTool,
  sendDigitsTool as unknown as ConversationRelayTool,
  switchLanguageTool as unknown as ConversationRelayTool,
  endCallTool as unknown as ConversationRelayTool,
  liveAgentHandoffTool as unknown as ConversationRelayTool,
  setListenModeTool as unknown as ConversationRelayTool,
  setSilenceDetectionTool as unknown as ConversationRelayTool,
];

/**
 * Named-lookup container for `ConversationRelayTool` instances. Later registrations overwrite
 * earlier ones with the same name (last-write-wins). Ownership is by reference
 * — `ConversationRelaySession` reads from the shared instance.
 */
export class ToolRegistry {
  private readonly tools: Map<string, ConversationRelayTool> = new Map();

  constructor(initial: readonly ConversationRelayTool[] = []) {
    for (const tool of initial) {
      this.tools.set(tool.name, tool);
    }
  }

  /** Register a tool. Overwrites any tool previously registered under the same name. */
  public register(tool: ConversationRelayTool): void {
    this.tools.set(tool.name, tool);
  }

  /** Remove a tool by name. No-op if no tool by that name was registered. */
  public unregister(name: string): void {
    this.tools.delete(name);
  }

  /** Whether a tool with the given name is registered. */
  public has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Fetch a registered tool by name, or `undefined` if not registered. */
  public get(name: string): ConversationRelayTool | undefined {
    return this.tools.get(name);
  }

  /**
   * All registered tools, in registration order. Feed the results into the
   * LLM via `tool.toOpenAIFormat()` / `toAnthropicFormat()`.
   */
  public list(): ConversationRelayTool[] {
    return Array.from(this.tools.values());
  }
}
