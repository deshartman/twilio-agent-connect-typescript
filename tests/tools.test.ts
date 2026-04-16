import { describe, it, expect, vi } from 'vitest';
import { defineTool, createSendMessageTool, createHandoffTool } from '@twilio/tac-tools';
import { TAC, TACConfig, CallSid, ConversationId } from '@twilio/tac-core';

describe('Tool System', () => {
  describe('defineTool', () => {
    it('should create a tool with basic parameters', () => {
      const tool = defineTool(
        'test_tool',
        'A test tool',
        {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to process',
            },
          },
          required: ['message'],
          description: 'Test tool parameters',
        },
        async (params: { message: string }) => {
          return `Processed: ${params.message}`;
        }
      );

      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties.message.type).toBe('string');
      expect(tool.parameters.required).toContain('message');
    });

    it('should execute tool implementation', async () => {
      const tool = defineTool(
        'echo_tool',
        'Echoes input',
        {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to echo' },
          },
          required: ['text'],
          description: 'Echo parameters',
        },
        async (params: { text: string }) => {
          return `Echo: ${params.text}`;
        }
      );

      const result = await tool.implementation({ text: 'hello world' });
      expect(result).toBe('Echo: hello world');
    });

    it('should handle multiple parameter types', () => {
      const tool = defineTool(
        'multi_param_tool',
        'Tool with multiple parameters',
        {
          type: 'object',
          properties: {
            stringParam: { type: 'string', description: 'A string parameter' },
            numberParam: { type: 'number', description: 'A number parameter' },
            booleanParam: { type: 'boolean', description: 'A boolean parameter' },
            arrayParam: {
              type: 'array',
              items: { type: 'string' },
              description: 'An array parameter',
            },
          },
          required: ['stringParam', 'numberParam'],
          description: 'Multi-parameter tool',
        },
        async params => params
      );

      expect(tool.parameters.properties.stringParam.type).toBe('string');
      expect(tool.parameters.properties.numberParam.type).toBe('number');
      expect(tool.parameters.properties.booleanParam.type).toBe('boolean');
      expect(tool.parameters.properties.arrayParam.type).toBe('array');
      expect(tool.parameters.required).toEqual(['stringParam', 'numberParam']);
    });

    it('should handle optional parameters', () => {
      const tool = defineTool(
        'optional_tool',
        'Tool with optional params',
        {
          type: 'object',
          properties: {
            required_param: { type: 'string', description: 'Required parameter' },
            optional_param: { type: 'string', description: 'Optional parameter' },
          },
          required: ['required_param'],
          description: 'Tool with optional parameters',
        },
        async params => params
      );

      expect(tool.parameters.required).toEqual(['required_param']);
      expect(tool.parameters.required).not.toContain('optional_param');
    });

    it('should handle enum parameters', () => {
      const tool = defineTool(
        'enum_tool',
        'Tool with enum parameter',
        {
          type: 'object',
          properties: {
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Priority level',
            },
          },
          required: ['priority'],
          description: 'Tool with enum parameter',
        },
        async params => params
      );

      expect(tool.parameters.properties.priority.enum).toEqual(['low', 'medium', 'high']);
    });
  });

  describe('tool validation', () => {
    it('should create valid JSON schema', () => {
      const tool = defineTool(
        'schema_tool',
        'Tool for schema testing',
        {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name field' },
            age: { type: 'number', description: 'Age field' },
            active: { type: 'boolean', description: 'Active status' },
          },
          required: ['name'],
          description: 'Schema validation tool',
        },
        async params => params
      );

      // Verify schema structure
      expect(tool.parameters).toMatchObject({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
        required: ['name'],
      });
    });
  });

  describe('tool execution', () => {
    it('should handle sync and async implementations', async () => {
      const syncTool = defineTool(
        'sync_tool',
        'Synchronous tool',
        {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'Value to double' },
          },
          required: ['value'],
          description: 'Sync tool parameters',
        },
        (params: { value: number }) => params.value * 2
      );

      const asyncTool = defineTool(
        'async_tool',
        'Asynchronous tool',
        {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'Value to triple' },
          },
          required: ['value'],
          description: 'Async tool parameters',
        },
        async (params: { value: number }) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return params.value * 3;
        }
      );

      // Both should work with await
      const syncResult = await syncTool.implementation({ value: 5 });
      const asyncResult = await asyncTool.implementation({ value: 5 });

      expect(syncResult).toBe(10);
      expect(asyncResult).toBe(15);
    });
  });

  describe('TACTool helper methods', () => {
    it('should convert to OpenAI format', () => {
      const tool = defineTool(
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

      const openaiFormat = tool.toOpenAIFormat();

      expect(openaiFormat).toEqual({
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

    it('should convert to Anthropic format', () => {
      const tool = defineTool(
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

      const anthropicFormat = tool.toAnthropicFormat();

      expect(anthropicFormat).toEqual({
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

    it('should convert to JSON string', () => {
      const tool = defineTool(
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

      const json = tool.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe('function');
      expect(parsed.function.name).toBe('test_tool');
      expect(parsed.function.description).toBe('A test tool');
    });
  });

  describe('built-in tools with ConversationId', () => {
    const getTestConfig = () => ({
      environment: 'dev' as const,
      twilioAccountSid: 'ACtest123456789',
      twilioAuthToken: 'test_token_123',
      twilioApiKey: 'test_api_key',
      twilioApiToken: 'test_api_token',
      twilioPhoneNumber: '+15551234567',
      conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
    });

    describe('createSendMessageTool', () => {
      it('should accept ConversationId (Maestro channel)', async () => {
        const mockChannel = {
          channelType: 'sms' as const,
          sendResponse: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          getConversationSession: vi.fn(),
          isConversationActive: vi.fn(),
          shutdown: vi.fn(),
        };

        const conversationId = 'conv_conversation_01ktest1abcdefghijklmnopqr' as ConversationId;
        const tool = createSendMessageTool(mockChannel, conversationId);

        const result = await tool.implementation({ message: 'Test message' });

        expect(result.success).toBe(true);
        expect(mockChannel.sendResponse).toHaveBeenCalledWith(
          conversationId,
          'Test message',
          undefined
        );
      });

      it('should accept CallSid (CRelay channel)', async () => {
        const mockChannel = {
          channelType: 'voice' as const,
          sendResponse: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          getConversationSession: vi.fn(),
          isConversationActive: vi.fn(),
          shutdown: vi.fn(),
        };

        const callSid = 'CA1234567890abcdef1234567890abcdef' as CallSid;
        const tool = createSendMessageTool(mockChannel, callSid);

        const result = await tool.implementation({ message: 'Test message' });

        expect(result.success).toBe(true);
        expect(mockChannel.sendResponse).toHaveBeenCalledWith(callSid, 'Test message', undefined);
      });

      it('should handle sendResponse failures gracefully', async () => {
        const mockChannel = {
          channelType: 'sms' as const,
          sendResponse: vi.fn().mockRejectedValue(new Error('Network error')),
          on: vi.fn(),
          getConversationSession: vi.fn(),
          isConversationActive: vi.fn(),
          shutdown: vi.fn(),
        };

        const conversationId = 'conv_conversation_01ktest1abcdefghijklmnopqr' as ConversationId;
        const tool = createSendMessageTool(mockChannel, conversationId);

        const result = await tool.implementation({ message: 'Test message' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
      });

      it('should include metadata when provided', async () => {
        const mockChannel = {
          channelType: 'sms' as const,
          sendResponse: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          getConversationSession: vi.fn(),
          isConversationActive: vi.fn(),
          shutdown: vi.fn(),
        };

        const conversationId = 'conv_conversation_01ktest1abcdefghijklmnopqr' as ConversationId;
        const tool = createSendMessageTool(mockChannel, conversationId);
        const metadata = { custom: 'data' };

        await tool.implementation({ message: 'Test', metadata });

        expect(mockChannel.sendResponse).toHaveBeenCalledWith(
          conversationId,
          'Test',
          metadata
        );
      });
    });

    describe('createHandoffTool', () => {
      it('should accept ConversationId (Maestro mode)', async () => {
        const config = new TACConfig(getTestConfig());
        const tac = new TAC({ config });
        const triggerHandoffSpy = vi.spyOn(tac, 'triggerHandoff').mockResolvedValue();

        const conversationId = 'conv_conversation_01ktest1abcdefghijklmnopqr' as ConversationId;
        const tool = createHandoffTool(tac, conversationId);

        const result = await tool.implementation({ reason: 'User requested agent' });

        expect(result.success).toBe(true);
        expect(triggerHandoffSpy).toHaveBeenCalledWith(
          conversationId,
          'User requested agent'
        );
      });

      it('should accept CallSid (CRelay mode)', async () => {
        const config = new TACConfig(getTestConfig());
        const tac = new TAC({ config });
        const triggerHandoffSpy = vi.spyOn(tac, 'triggerHandoff').mockResolvedValue();

        const callSid = 'CA1234567890abcdef1234567890abcdef' as CallSid;
        const tool = createHandoffTool(tac, callSid);

        const result = await tool.implementation({ reason: 'Urgent issue' });

        expect(result.success).toBe(true);
        expect(triggerHandoffSpy).toHaveBeenCalledWith(callSid, 'Urgent issue');
      });

      it('should include urgency and context in handoff reason', async () => {
        const config = new TACConfig(getTestConfig());
        const tac = new TAC({ config });
        const triggerHandoffSpy = vi.spyOn(tac, 'triggerHandoff').mockResolvedValue();

        const conversationId = 'conv_conversation_01ktest1abcdefghijklmnopqr' as ConversationId;
        const tool = createHandoffTool(tac, conversationId);

        await tool.implementation({
          reason: 'Complex issue',
          urgency: 'high',
          context: 'Customer has been waiting 15 minutes',
        });

        expect(triggerHandoffSpy).toHaveBeenCalledWith(
          conversationId,
          expect.stringContaining('Complex issue')
        );
        expect(triggerHandoffSpy).toHaveBeenCalledWith(
          conversationId,
          expect.stringContaining('Additional Context: Customer has been waiting 15 minutes')
        );
        expect(triggerHandoffSpy).toHaveBeenCalledWith(
          conversationId,
          expect.stringContaining('Urgency: high')
        );
      });

      it('should handle triggerHandoff failures gracefully', async () => {
        const config = new TACConfig(getTestConfig());
        const tac = new TAC({ config });
        vi.spyOn(tac, 'triggerHandoff').mockRejectedValue(new Error('Handoff failed'));

        const conversationId = 'conv_conversation_01ktest1abcdefghijklmnopqr' as ConversationId;
        const tool = createHandoffTool(tac, conversationId);

        const result = await tool.implementation({ reason: 'Test' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Handoff failed');
      });
    });
  });
});
