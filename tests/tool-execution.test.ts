import { describe, it, expect } from 'vitest';
import { defineTool, TACTool } from '../src/index';
import type { JSONSchema, ToolFunction } from '../src/index';

describe('Tool Execution Integration', () => {

  describe('Tool Definition', () => {
    it('should create tool with explicit types', () => {
      interface TestParams {
        name: string;
        age: number;
      }

      interface TestResult {
        greeting: string;
      }

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const implementation: ToolFunction<TestParams, TestResult> = async (params) => {
        return { greeting: `Hello ${params.name}, you are ${params.age} years old` };
      };

      const tool = defineTool<TestParams, TestResult>(
        'greet',
        'Greet a user by name and age',
        schema,
        implementation
      );

      expect(tool).toBeInstanceOf(TACTool);
      expect(tool.name).toBe('greet');
      expect(tool.description).toBe('Greet a user by name and age');
      expect(tool.parameters).toEqual(schema);
    });

    it('should create tool without explicit types (uses unknown)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
      };

      const implementation = async (params: unknown) => {
        // Must narrow type since params is unknown
        if (typeof params === 'object' && params !== null && 'value' in params) {
          return { result: String((params as { value: string }).value) };
        }
        throw new Error('Invalid parameters');
      };

      const tool = defineTool('process', 'Process a value', schema, implementation);

      expect(tool).toBeInstanceOf(TACTool);
      expect(tool.name).toBe('process');
    });
  });

  describe('OpenAI Format Conversion', () => {
    it('should convert to OpenAI function calling format', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      };

      const tool = defineTool('search', 'Search for information', schema, async () => ({
        results: [],
      }));

      const openaiFormat = tool.toOpenAIFormat();

      expect(openaiFormat).toEqual({
        type: 'function',
        function: {
          name: 'search',
          description: 'Search for information',
          parameters: schema,
        },
      });
    });
  });

  describe('Anthropic Format Conversion', () => {
    it('should convert to Anthropic tool calling format', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      };

      const tool = defineTool('search', 'Search for information', schema, async () => ({
        results: [],
      }));

      const anthropicFormat = tool.toAnthropicFormat();

      expect(anthropicFormat).toEqual({
        name: 'search',
        description: 'Search for information',
        input_schema: schema,
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute tool with valid parameters', async () => {
      interface CalculateParams {
        a: number;
        b: number;
        operation: string;
      }

      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
          operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
        },
        required: ['a', 'b', 'operation'],
      };

      const calculator = defineTool<CalculateParams, number>(
        'calculate',
        'Perform basic arithmetic',
        schema,
        async (params) => {
          switch (params.operation) {
            case 'add':
              return params.a + params.b;
            case 'subtract':
              return params.a - params.b;
            case 'multiply':
              return params.a * params.b;
            case 'divide':
              return params.a / params.b;
            default:
              throw new Error('Invalid operation');
          }
        }
      );

      // Execute the tool
      const result = await calculator.implementation({ a: 10, b: 5, operation: 'add' });
      expect(result).toBe(15);

      const result2 = await calculator.implementation({ a: 10, b: 5, operation: 'multiply' });
      expect(result2).toBe(50);
    });

    it('should handle async tool execution', async () => {
      const asyncTool = defineTool<{ delay: number }, string>(
        'delay',
        'Delay execution',
        {
          type: 'object',
          properties: {
            delay: { type: 'number' },
          },
          required: ['delay'],
        },
        async (params) => {
          await new Promise((resolve) => setTimeout(resolve, params.delay));
          return `Delayed ${params.delay}ms`;
        }
      );

      // Test async tool execution completes successfully
      const result = await asyncTool.implementation({ delay: 50 });

      expect(result).toBe('Delayed 50ms');
    });

    it('should handle tool execution errors', async () => {
      const errorTool = defineTool<{ shouldFail: boolean }, string>(
        'error_tool',
        'Tool that can fail',
        {
          type: 'object',
          properties: {
            shouldFail: { type: 'boolean' },
          },
          required: ['shouldFail'],
        },
        async (params) => {
          if (params.shouldFail) {
            throw new Error('Tool execution failed');
          }
          return 'Success';
        }
      );

      // Should succeed
      const result = await errorTool.implementation({ shouldFail: false });
      expect(result).toBe('Success');

      // Should fail
      await expect(errorTool.implementation({ shouldFail: true })).rejects.toThrow(
        'Tool execution failed'
      );
    });
  });

  describe('Built-in Tool Patterns', () => {
    it('should define memory retrieval tool pattern', () => {
      interface MemoryParams {
        query?: string;
        start_date?: string;
        end_date?: string;
      }

      const memoryTool = defineTool<MemoryParams, unknown>(
        'retrieve_memory',
        'Retrieve user memories',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            start_date: { type: 'string', description: 'Start date (ISO 8601)' },
            end_date: { type: 'string', description: 'End date (ISO 8601)' },
          },
          required: [],
        },
        async (params) => {
          // Mock implementation
          return {
            observations: [],
            summaries: [],
            query: params.query,
          };
        }
      );

      expect(memoryTool.name).toBe('retrieve_memory');
      expect(memoryTool.parameters.required).toEqual([]);
    });

    it('should define messaging tool pattern', () => {
      interface MessageParams {
        recipient: string;
        message: string;
        channel: string;
      }

      const messagingTool = defineTool<MessageParams, { status: string }>(
        'send_message',
        'Send a message to a user',
        {
          type: 'object',
          properties: {
            recipient: { type: 'string', description: 'Recipient address' },
            message: { type: 'string', description: 'Message content' },
            channel: { type: 'string', enum: ['sms', 'chat', 'voice'] },
          },
          required: ['recipient', 'message', 'channel'],
        },
        async (params) => {
          // Mock implementation
          return { status: `Sent to ${params.recipient} via ${params.channel}` };
        }
      );

      expect(messagingTool.name).toBe('send_message');
      expect(messagingTool.parameters.required).toEqual(['recipient', 'message', 'channel']);
    });

    it('should define handoff tool pattern', () => {
      interface HandoffParams {
        reason: string;
        department?: string;
        priority?: string;
      }

      const handoffTool = defineTool<HandoffParams, { transferred: boolean }>(
        'handoff_to_human',
        'Transfer conversation to human agent',
        {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for handoff' },
            department: { type: 'string', description: 'Target department' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['reason'],
        },
        async (params) => {
          // Mock implementation
          return { transferred: true };
        }
      );

      expect(handoffTool.name).toBe('handoff_to_human');
      expect(handoffTool.parameters.required).toEqual(['reason']);
    });

    it('should define knowledge search tool pattern', () => {
      interface KnowledgeParams {
        query: string;
        limit?: number;
      }

      interface KnowledgeResult {
        results: Array<{ content: string; source: string }>;
      }

      const knowledgeTool = defineTool<KnowledgeParams, KnowledgeResult>(
        'search_knowledge',
        'Search knowledge base',
        {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Maximum results' },
          },
          required: ['query'],
        },
        async (params) => {
          // Mock implementation
          return {
            results: [
              { content: 'Result 1', source: 'doc1.pdf' },
              { content: 'Result 2', source: 'doc2.pdf' },
            ].slice(0, params.limit || 5),
          };
        }
      );

      expect(knowledgeTool.name).toBe('search_knowledge');
      expect(knowledgeTool.parameters.required).toEqual(['query']);
    });
  });

  describe('Tool Parameter Validation', () => {
    it('should define tool with complex nested parameters', () => {
      const complexSchema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
              preferences: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['name'],
          },
          options: {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['json', 'xml', 'text'] },
              verbose: { type: 'boolean' },
            },
          },
        },
        required: ['user'],
      };

      const tool = defineTool('complex', 'Complex tool', complexSchema, async () => ({}));

      expect(tool.parameters).toEqual(complexSchema);
      expect(tool.parameters.required).toEqual(['user']);
    });

    it('should define tool with optional parameters', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          required_param: { type: 'string' },
          optional_param: { type: 'string' },
        },
        required: ['required_param'],
      };

      const tool = defineTool('optional', 'Tool with optional params', schema, async () => ({}));

      expect(tool.parameters.required).toEqual(['required_param']);
      expect(tool.parameters.properties).toHaveProperty('optional_param');
    });
  });

  describe('Tool Chaining', () => {
    it('should support sequential tool execution', async () => {
      const results: string[] = [];

      const tool1 = defineTool<{ input: string }, string>(
        'step1',
        'First step',
        {
          type: 'object',
          properties: { input: { type: 'string' } },
          required: ['input'],
        },
        async (params) => {
          const result = `Step1: ${params.input}`;
          results.push(result);
          return result;
        }
      );

      const tool2 = defineTool<{ input: string }, string>(
        'step2',
        'Second step',
        {
          type: 'object',
          properties: { input: { type: 'string' } },
          required: ['input'],
        },
        async (params) => {
          const result = `Step2: ${params.input}`;
          results.push(result);
          return result;
        }
      );

      // Execute in sequence
      const result1 = await tool1.implementation({ input: 'initial' });
      const result2 = await tool2.implementation({ input: result1 });

      expect(results).toEqual(['Step1: initial', 'Step2: Step1: initial']);
      expect(result2).toBe('Step2: Step1: initial');
    });

    it('should support dependent tool results', async () => {
      const fetchDataTool = defineTool<{ id: string }, { data: string }>(
        'fetch_data',
        'Fetch data',
        {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        async (params) => {
          return { data: `data_for_${params.id}` };
        }
      );

      const processDataTool = defineTool<{ data: string }, { result: string }>(
        'process_data',
        'Process data',
        {
          type: 'object',
          properties: { data: { type: 'string' } },
          required: ['data'],
        },
        async (params) => {
          return { result: params.data.toUpperCase() };
        }
      );

      // First tool fetches data
      const fetchResult = await fetchDataTool.implementation({ id: '123' });
      expect(fetchResult.data).toBe('data_for_123');

      // Second tool processes the fetched data
      const processResult = await processDataTool.implementation({ data: fetchResult.data });
      expect(processResult.result).toBe('DATA_FOR_123');
    });
  });

  describe('Tool JSON Serialization', () => {
    it('should serialize tool to JSON string', () => {
      const tool = defineTool(
        'test',
        'Test tool',
        {
          type: 'object',
          properties: { param: { type: 'string' } },
        },
        async () => ({})
      );

      const json = tool.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed).toEqual({
        type: 'function',
        function: {
          name: 'test',
          description: 'Test tool',
          parameters: {
            type: 'object',
            properties: { param: { type: 'string' } },
          },
        },
      });
    });
  });
});
