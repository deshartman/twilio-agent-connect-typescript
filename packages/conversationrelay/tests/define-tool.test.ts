import { describe, it, expect } from 'vitest';
import { defineTool, ConversationRelayTool } from '../src/lib/define-tool';

describe('CR defineTool', () => {
  describe('defineTool factory', () => {
    it('creates a tool with basic parameters', () => {
      const tool = defineTool(
        'test_tool',
        'A test tool',
        {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The message to process' },
          },
          required: ['message'],
          description: 'Test tool parameters',
        },
        async (params: { message: string }) => `Processed: ${params.message}`
      );

      expect(tool).toBeInstanceOf(ConversationRelayTool);
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.required).toContain('message');
    });

    it('executes the tool implementation', async () => {
      const tool = defineTool(
        'echo_tool',
        'Echoes input',
        {
          type: 'object',
          properties: { text: { type: 'string', description: 'Text to echo' } },
          required: ['text'],
        },
        async (params: { text: string }) => `Echo: ${params.text}`
      );

      const result = await tool.implementation({ text: 'hello world' });
      expect(result).toBe('Echo: hello world');
    });

    it('handles sync and async implementations', async () => {
      const syncTool = defineTool(
        'sync_tool',
        'Synchronous tool',
        {
          type: 'object',
          properties: { value: { type: 'number', description: 'Value to double' } },
          required: ['value'],
        },
        (params: { value: number }) => params.value * 2
      );

      const asyncTool = defineTool(
        'async_tool',
        'Asynchronous tool',
        {
          type: 'object',
          properties: { value: { type: 'number', description: 'Value to triple' } },
          required: ['value'],
        },
        async (params: { value: number }) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return params.value * 3;
        }
      );

      expect(await syncTool.implementation({ value: 5 })).toBe(10);
      expect(await asyncTool.implementation({ value: 5 })).toBe(15);
    });

    it('throws when name is empty', () => {
      expect(() => defineTool('', 'desc', { type: 'object' }, () => undefined)).toThrow(
        'Tool name is required'
      );
    });

    it('throws when description is empty', () => {
      expect(() => defineTool('name', '', { type: 'object' }, () => undefined)).toThrow(
        'Tool description is required'
      );
    });

    it('throws when parameters are missing', () => {
      expect(() =>
        defineTool('name', 'desc', undefined as unknown as { type: 'object' }, () => undefined)
      ).toThrow('Tool parameters schema is required');
    });

    it('throws when implementation is missing', () => {
      expect(() =>
        defineTool('name', 'desc', { type: 'object' }, undefined as unknown as () => void)
      ).toThrow('Tool implementation is required');
    });
  });

  describe('ConversationRelayTool format conversions', () => {
    const buildTool = () =>
      defineTool(
        'test_tool',
        'A test tool',
        {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Test message' },
          },
          required: ['message'],
          description: 'Test parameters',
        },
        async (params: { message: string }) => params.message
      );

    it('converts to OpenAI format', () => {
      const tool = buildTool();

      expect(tool.toOpenAIFormat()).toEqual({
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Test message' },
            },
            required: ['message'],
            description: 'Test parameters',
          },
        },
      });
    });

    it('converts to Anthropic format', () => {
      const tool = buildTool();

      expect(tool.toAnthropicFormat()).toEqual({
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Test message' },
          },
          required: ['message'],
          description: 'Test parameters',
        },
      });
    });

    it('serializes to JSON string', () => {
      const tool = buildTool();
      const parsed = JSON.parse(tool.toJSON());

      expect(parsed.type).toBe('function');
      expect(parsed.function.name).toBe('test_tool');
      expect(parsed.function.description).toBe('A test tool');
      expect(parsed.function.parameters.required).toEqual(['message']);
    });
  });
});
