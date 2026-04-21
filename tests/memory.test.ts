import { describe, it, expect, vi } from 'vitest';
import {
  TAC,
  TACConfig,
  ConversationSession,
  MemoryRetrievalResponse,
  ProfileResponse,
  Communication,
  TACMemoryResponse,
  MemoryCommunication,
} from '@twilio/tac-core';

describe('Memory Functionality', () => {
  const getTestConfigWithoutMemory = () => ({

    twilioAccountSid: 'ACtest123',
    twilioAuthToken: 'test_token_123',
    twilioApiKey: 'test_api_key',
    twilioApiToken: 'test_api_token',
    twilioPhoneNumber: '+15551234567',
    conversationServiceId: 'conv_configuration_01testconfigabc123xyzabcde',
  });

  const getTestConfigWithMemory = () => ({
    ...getTestConfigWithoutMemory(),
    memoryStoreId: 'mem_store_01testmemorystore000000000',
  });

  describe('isMemoryEnabled()', () => {
    it('should return true when memory configured', () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      expect(tac.isMemoryEnabled()).toBe(true);
    });

    it('should return false when memory not configured', () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      expect(tac.isMemoryEnabled()).toBe(false);
    });
  });

  describe('retrieveMemory() with Memory Service', () => {
    it('should retrieve memory with profile_id provided', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const mockMemoryResponse: MemoryRetrievalResponse = {
        observations: [],
        summaries: [],
        communications: [],
        meta: {
          queryTime: 0,
        },
      };

      // Mock the memory client method
      const memoryClient = tac.getMemoryClient();
      expect(memoryClient).toBeDefined();
      vi.spyOn(memoryClient!, 'retrieveMemories').mockResolvedValue(mockMemoryResponse);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: 'mem_profile_01ktestghijklmnopqrstuvwxy',
        channel: 'sms',
        startedAt: new Date(),
      };

      const result = await tac.retrieveMemory(session, 'test query');

      // Result is wrapped in TACMemoryResponse
      expect(result).toBeInstanceOf(TACMemoryResponse);
      expect(result.hasMemoryFeatures).toBe(true);
      expect(result.rawData).toEqual(mockMemoryResponse);
      expect(memoryClient!.retrieveMemories).toHaveBeenCalledWith(
        'mem_store_01testmemorystore000000000',
        'mem_profile_01ktestghijklmnopqrstuvwxy',
        { query: 'test query' }
      );
    });

    it('should auto-lookup profile when missing', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const mockLookupResponse = {
        normalizedValue: '+13175556789',
        profiles: ['mem_profile_01ktestghijklmnopqrstuvwxy'],
      };

      const mockMemoryResponse: MemoryRetrievalResponse = {
        observations: [],
        summaries: [],
        communications: [],
        meta: {
          queryTime: 0,
        },
      };

      const memoryClient = tac.getMemoryClient();
      expect(memoryClient).toBeDefined();
      vi.spyOn(memoryClient!, 'lookupProfile').mockResolvedValue(mockLookupResponse);
      vi.spyOn(memoryClient!, 'retrieveMemories').mockResolvedValue(mockMemoryResponse);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
        authorInfo: {
          address: '+1 (317) 555-6789',
          participantId: 'conv_participant_01partic12345678901',
        },
      };

      const result = await tac.retrieveMemory(session, 'test query');

      // Verify profile was looked up
      expect(memoryClient!.lookupProfile).toHaveBeenCalledWith(
        'mem_store_01testmemorystore000000000',
        'phone',
        '+1 (317) 555-6789'
      );

      // Verify profile_id was assigned
      expect(session.profileId).toBe('mem_profile_01ktestghijklmnopqrstuvwxy');

      // Verify memory was retrieved with the looked up profile_id
      expect(memoryClient!.retrieveMemories).toHaveBeenCalledWith(
        'mem_store_01testmemorystore000000000',
        'mem_profile_01ktestghijklmnopqrstuvwxy',
        { query: 'test query' }
      );

      // Result is wrapped in TACMemoryResponse
      expect(result).toBeInstanceOf(TACMemoryResponse);
      expect(result.rawData).toEqual(mockMemoryResponse);
    });

    it('should use first profile when multiple found', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const mockLookupResponse = {
        normalizedValue: '+13175556789',
        profiles: [
          'mem_profile_01ktest01ijklmnopqrstuvwxy',
          'mem_profile_01ktest02ijklmnopqrstuvwxy',
          'mem_profile_01ktest03ijklmnopqrstuvwxy',
        ],
      };

      const mockMemoryResponse: MemoryRetrievalResponse = {
        observations: [],
        summaries: [],
        communications: [],
        meta: {
          queryTime: 0,
        },
      };

      const memoryClient = tac.getMemoryClient();
      vi.spyOn(memoryClient!, 'lookupProfile').mockResolvedValue(mockLookupResponse);
      vi.spyOn(memoryClient!, 'retrieveMemories').mockResolvedValue(mockMemoryResponse);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
        authorInfo: { address: '+13175556789' },
      };

      await tac.retrieveMemory(session);

      // Verify first profile was used
      expect(session.profileId).toBe('mem_profile_01ktest01ijklmnopqrstuvwxy');
      expect(memoryClient!.retrieveMemories).toHaveBeenCalledWith(
        'mem_store_01testmemorystore000000000',
        'mem_profile_01ktest01ijklmnopqrstuvwxy',
        { query: undefined }
      );
    });

    it('should throw error when profile_id and author_info both missing', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
        authorInfo: undefined,
      };

      await expect(tac.retrieveMemory(session)).rejects.toThrow(
        'profileId is required for memory retrieval'
      );
    });

    it('should throw error when author_info exists but address is empty', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
        authorInfo: {
          address: '',
          participantId: 'conv_participant_01partic12345678901',
        },
      };

      await expect(tac.retrieveMemory(session)).rejects.toThrow(
        'profileId is required for memory retrieval'
      );
    });

    it('should throw error when profile lookup returns no profiles', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const mockLookupResponse = {
        normalizedValue: '+13175556789',
        profiles: [],
      };

      const memoryClient = tac.getMemoryClient();
      vi.spyOn(memoryClient!, 'lookupProfile').mockResolvedValue(mockLookupResponse);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
        authorInfo: { address: '+13175556789' },
      };

      await expect(tac.retrieveMemory(session)).rejects.toThrow(
        'No profile found for phone +13175556789'
      );
    });

    it('should handle profile lookup API errors', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const memoryClient = tac.getMemoryClient();
      vi.spyOn(memoryClient!, 'lookupProfile').mockRejectedValue(
        new Error('Profile lookup API error')
      );

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
        authorInfo: { address: '+13175556789' },
      };

      await expect(tac.retrieveMemory(session)).rejects.toThrow('Profile lookup API error');
    });
  });

  describe('retrieveMemory() fallback to Conversations Service', () => {
    it('should fallback when memory not configured', async () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      const mockCommunications: Communication[] = [
        {
          id: 'comm_123',
          conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
          accountId: 'AC123456',
          author: {
            address: '+12025551234',
            channel: 'SMS',
            participantId: 'conv_participant_01part12345678901234',
          },
          content: {
            type: 'TEXT',
            text: 'Hello',
          },
          recipients: [
            {
              address: '+12025555678',
              channel: 'SMS',
              participantId: 'conv_participant_01part45678901234567',
            },
          ],
          createdAt: '2019-08-24T14:15:22Z',
          updatedAt: '2019-08-24T14:15:22Z',
        },
      ];

      const conversationClient = tac.getConversationClient();
      vi.spyOn(conversationClient, 'listCommunications').mockResolvedValue(mockCommunications);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
      };

      const result = await tac.retrieveMemory(session);

      // Verify fallback was called
      expect(conversationClient.listCommunications).toHaveBeenCalledWith(
        'conv_conversation_01ktestabcdefghijklmnopqrs'
      );

      // Result is wrapped in TACMemoryResponse
      expect(result).toBeInstanceOf(TACMemoryResponse);
      expect(result.hasMemoryFeatures).toBe(false); // Maestro fallback

      // Check response structure - observations and summaries are empty for fallback
      expect(result.observations).toEqual([]);
      expect(result.summaries).toEqual([]);

      // Communications are converted to unified TACCommunication format
      expect(result.communications).toHaveLength(1);
      expect(result.communications[0].id).toBe('comm_123');
    });

    it('should handle empty communications list', async () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      const conversationClient = tac.getConversationClient();
      vi.spyOn(conversationClient, 'listCommunications').mockResolvedValue([]);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
      };

      const result = await tac.retrieveMemory(session);

      // Result is wrapped in TACMemoryResponse
      expect(result).toBeInstanceOf(TACMemoryResponse);
      expect(result.hasMemoryFeatures).toBe(false);
      expect(result.communications).toEqual([]);
      expect(result.observations).toEqual([]);
      expect(result.summaries).toEqual([]);
    });

    it('should propagate Conversations Service API errors', async () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      const conversationClient = tac.getConversationClient();
      vi.spyOn(conversationClient, 'listCommunications').mockRejectedValue(
        new Error('Conversations Service API Error')
      );

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
      };

      await expect(tac.retrieveMemory(session)).rejects.toThrow('Conversations Service API Error');
    });

    it('should work with multiple communications', async () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      const mockCommunications: Communication[] = Array.from({ length: 5 }, (_, i) => ({
        id: `comm_${i}`,
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        accountId: 'AC123456',
        author: {
          address: '+12025551234',
          channel: 'SMS' as const,
          participantId: 'conv_participant_01part12345678901234',
        },
        content: {
          type: 'TEXT' as const,
          text: `Message ${i}`,
        },
        recipients: [
          {
            address: '+12025555678',
            channel: 'SMS' as const,
            participantId: 'conv_participant_01part45678901234567',
          },
        ],
        createdAt: '2019-08-24T14:15:22Z',
        updatedAt: '2019-08-24T14:15:22Z',
      }));

      const conversationClient = tac.getConversationClient();
      vi.spyOn(conversationClient, 'listCommunications').mockResolvedValue(mockCommunications);

      const session: ConversationSession = {
        conversationId: 'conv_conversation_01ktestabcdefghijklmnopqrs',
        profileId: undefined,
        channel: 'sms',
        startedAt: new Date(),
      };

      const result = await tac.retrieveMemory(session);

      // Result is wrapped in TACMemoryResponse
      expect(result).toBeInstanceOf(TACMemoryResponse);
      expect(result.communications).toHaveLength(5);
      result.communications.forEach((comm: MemoryCommunication, i: number) => {
        expect(comm.id).toBe(`comm_${i}`);
        expect(comm.content.text).toBe(`Message ${i}`);
      });
    });
  });

  describe('fetchProfile()', () => {
    it('should fetch profile successfully', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const mockProfileResponse: ProfileResponse = {
        id: 'mem_profile_01testprofile0000000000001',
        createdAt: '2024-01-01T00:00:00Z',
        traits: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      const memoryClient = tac.getMemoryClient();
      vi.spyOn(memoryClient!, 'getProfile').mockResolvedValue(mockProfileResponse);

      const result = await tac.fetchProfile('mem_profile_01testprofile0000000000001');

      expect(result).toEqual(mockProfileResponse);
      expect(memoryClient!.getProfile).toHaveBeenCalledWith(
        'mem_store_01testmemorystore000000000',
        'mem_profile_01testprofile0000000000001',
        undefined
      );
    });

    it('should return undefined when memory not configured', async () => {
      const config = new TACConfig(getTestConfigWithoutMemory());
      const tac = new TAC({ config });

      const result = await tac.fetchProfile('mem_profile_01testprofile0000000000001');

      expect(result).toBeUndefined();
    });

    it('should return undefined when profileId is empty', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const result = await tac.fetchProfile('');

      expect(result).toBeUndefined();
    });

    it('should handle API errors gracefully', async () => {
      const config = new TACConfig(getTestConfigWithMemory());
      const tac = new TAC({ config });

      const memoryClient = tac.getMemoryClient();
      vi.spyOn(memoryClient!, 'getProfile').mockRejectedValue(new Error('API error'));

      const result = await tac.fetchProfile('mem_profile_01testprofile0000000000001');

      expect(result).toBeUndefined();
    });
  });

  describe('TACCommunication conversion', () => {
    it('should populate Memory-only fields from Memory communication', () => {
      const memoryCommunications: MemoryCommunication[] = [
        {
          id: 'mem_comm_123',
          author: {
            id: 'author_123',
            name: 'John Doe',
            type: 'CUSTOMER',
            address: '+15551234567',
            channel: 'SMS',
            profile_id: 'profile_456',
          },
          content: { text: 'Hello from Memory' },
          recipients: [
            {
              id: 'recipient_789',
              name: 'AI Agent',
              type: 'AI_AGENT',
              address: '+15559876543',
              channel: 'SMS',
            },
          ],
          channel_id: 'SM123',
          created_at: '2025-01-15T10:15:30Z',
        },
      ];

      const response = new TACMemoryResponse({
        observations: [],
        summaries: [],
        communications: memoryCommunications,
      });

      const comm = response.communications[0];

      // Memory-only fields populated
      expect(comm.author.id).toBe('author_123');
      expect(comm.author.name).toBe('John Doe');
      expect(comm.author.type).toBe('CUSTOMER');
      expect(comm.author.profileId).toBe('profile_456');

      // Maestro-only fields are undefined
      expect(comm.author.participantId).toBeUndefined();
      expect(comm.conversationId).toBeUndefined();
      expect(comm.accountId).toBeUndefined();
      expect(comm.content.type).toBeUndefined();
    });

    it('should populate Maestro-only fields from Maestro communication', () => {
      const response = new TACMemoryResponse([
        {
          id: 'comm_789',
          conversationId: 'CONV123',
          accountId: 'AC456',
          author: { address: '+15551234567', channel: 'SMS', participantId: 'conv_participant_01customer12345678' },
          content: { type: 'TEXT', text: 'Hello from Maestro' },
          recipients: [
            {
              address: '+15559876543',
              channel: 'SMS',
              participantId: 'conv_participant_01agent123456789012',
              deliveryStatus: 'DELIVERED',
            },
          ],
          channelId: 'SM456',
        },
      ]);

      const comm = response.communications[0];

      // Maestro-only fields populated
      expect(comm.conversationId).toBe('CONV123');
      expect(comm.accountId).toBe('AC456');
      expect(comm.author.participantId).toBe('conv_participant_01customer12345678');
      expect(comm.content.type).toBe('TEXT');
      expect(comm.recipients[0].deliveryStatus).toBe('DELIVERED');

      // Memory-only fields are undefined
      expect(comm.author.id).toBeUndefined();
      expect(comm.author.name).toBeUndefined();
      expect(comm.author.type).toBeUndefined();
      expect(comm.author.profileId).toBeUndefined();
    });

    it('should parse TRANSCRIPTION content with nested transcription', () => {
      const response = new TACMemoryResponse([
        {
          id: 'comm_voice',
          conversationId: 'CONV_VOICE',
          accountId: 'AC_VOICE',
          author: { address: '+15551234567', channel: 'VOICE', participantId: 'conv_participant_01voice123456789012' },
          content: {
            type: 'TRANSCRIPTION',
            text: 'Hello, I need help',
            transcription: {
              channel: 0,
              confidence: 0.95,
              engine: 'google',
              words: [
                {
                  text: 'Hello',
                  startTime: '2025-01-15T12:00:00.100Z',
                  endTime: '2025-01-15T12:00:00.300Z',
                },
                { text: 'I', startTime: '2025-01-15T12:00:00.400Z' },
              ],
            },
          },
          recipients: [{ address: '+15559876543', channel: 'VOICE', participantId: 'conv_participant_01agent123456789012' }],
        },
      ]);

      const comm = response.communications[0];

      expect(comm.content.type).toBe('TRANSCRIPTION');
      expect(comm.content.transcription?.channel).toBe(0);
      expect(comm.content.transcription?.confidence).toBe(0.95);
      expect(comm.content.transcription?.engine).toBe('google');
      expect(comm.content.transcription?.words).toHaveLength(2);
      expect(comm.content.transcription?.words?.[0].text).toBe('Hello');
      expect(comm.content.transcription?.words?.[0].startTime).toBe('2025-01-15T12:00:00.100Z');
    });
  });
});
