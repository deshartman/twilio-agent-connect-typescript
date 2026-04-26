/**
 * CR Tool definition helpers.
 *
 * Vendored locally so the ConversationRelay package stays free of any
 * dependency on @twilio/tac-tools. CR tools are only invoked by CR itself.
 */

import { z } from 'zod';

export const JSONSchemaSchema = z.object({
  type: z.enum(['object', 'string', 'number', 'boolean', 'array']),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional(),
  items: z.any().optional(),
  enum: z.array(z.any()).optional(),
  description: z.string().optional(),
});

export type JSONSchema = z.infer<typeof JSONSchemaSchema>;

export type ToolFunction<TParams = unknown, TResult = unknown> = (
  params: TParams
) => Promise<TResult> | TResult;

/**
 * ConversationRelay tool with LLM-format conversion helpers.
 */
export class CRTool<TParams = unknown, TResult = unknown> {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly parameters: JSONSchema,
    public readonly implementation: ToolFunction<TParams, TResult>
  ) {}

  toOpenAIFormat(): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  toAnthropicFormat(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.parameters,
    };
  }

  toJSON(): string {
    return JSON.stringify(this.toOpenAIFormat(), null, 2);
  }
}

export function defineTool<TParams = unknown, TResult = unknown>(
  name: string,
  description: string,
  parameters: JSONSchema,
  implementation: ToolFunction<TParams, TResult>
): CRTool<TParams, TResult> {
  if (!name) {
    throw new Error('Tool name is required');
  }
  if (!description) {
    throw new Error('Tool description is required');
  }
  if (!parameters) {
    throw new Error('Tool parameters schema is required');
  }
  if (!implementation) {
    throw new Error('Tool implementation is required');
  }

  return new CRTool(name, description, parameters, implementation);
}
