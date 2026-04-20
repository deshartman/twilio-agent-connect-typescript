/**
 * ResponseService Interface Pattern
 *
 * Optional abstraction for LLM integration with ConversationRelay.
 * Based on the simple-conversation-relay ResponseService pattern.
 *
 * This is a GUIDANCE PATTERN, not a requirement. Users can integrate their
 * LLM directly (like the quickstart example) or adopt this interface for
 * cleaner separation of concerns.
 */

import type { CallSid } from '../types.js';

/**
 * Content response event - text token from LLM
 */
export interface ContentResponse {
  callSid: CallSid;
  content: string;
  last: boolean;
}

/**
 * Tool result event - result from tool execution
 */
export interface ToolResultEvent {
  callSid: CallSid;
  toolName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: { success: boolean; message: string; outgoingMessage?: any };
}

/**
 * Response handler for LLM events
 *
 * Dependency injection pattern - passed to ResponseService to handle events.
 */
export interface ResponseHandler {
  /**
   * Handle content token from LLM
   */
  content(response: ContentResponse): void;

  /**
   * Handle tool result from tool execution
   */
  toolResult(result: ToolResultEvent): void;

  /**
   * Handle error during response generation
   */
  error(error: Error, callSid?: CallSid): void;
}

/**
 * ResponseService interface for LLM integration
 *
 * Abstraction for LLM response generation that works with ConversationRelay.
 * Implementations handle streaming, tool execution, and conversation state.
 *
 * @example
 * ```typescript
 * class OpenAIResponseService implements ResponseService {
 *   private handler?: ResponseHandler;
 *
 *   createResponseHandler(handler: ResponseHandler): void {
 *     this.handler = handler;
 *   }
 *
 *   async generateResponse(callSid: CallSid, role: 'user' | 'system', prompt: string): Promise<void> {
 *     const stream = await openai.chat.completions.create({
 *       model: 'gpt-4',
 *       messages: this.conversationHistory[callSid],
 *       stream: true,
 *       tools: this.tools,
 *     });
 *
 *     for await (const chunk of stream) {
 *       const delta = chunk.choices[0]?.delta;
 *       if (delta.content) {
 *         this.handler?.content({
 *           callSid,
 *           content: delta.content,
 *           last: chunk.choices[0]?.finish_reason === 'stop',
 *         });
 *       }
 *       if (delta.tool_calls) {
 *         const result = await this.executeTool(delta.tool_calls[0]);
 *         this.handler?.toolResult({ callSid, toolName: result.name, result });
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface ResponseService {
  /**
   * Register the response handler for events
   */
  createResponseHandler(handler: ResponseHandler): void;

  /**
   * Generate a response for user or system input
   *
   * @param callSid - Call identifier
   * @param role - Role of the message sender
   * @param prompt - Message content
   */
  generateResponse(callSid: CallSid, role: 'user' | 'system', prompt: string): Promise<void>;

  /**
   * Insert a message into conversation history without generating a response
   *
   * @param callSid - Call identifier
   * @param role - Role of the message sender
   * @param message - Message content
   */
  insertMessage(
    callSid: CallSid,
    role: 'system' | 'user' | 'assistant',
    message: string
  ): Promise<void>;

  /**
   * Interrupt the current response generation
   *
   * @param callSid - Call identifier
   */
  interrupt(callSid: CallSid): void;

  /**
   * Clean up resources for a call
   *
   * @param callSid - Call identifier
   */
  cleanup(callSid: CallSid): void;
}
