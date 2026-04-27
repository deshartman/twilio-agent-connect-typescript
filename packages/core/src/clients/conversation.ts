import axios from 'axios';
import {
  ActionResponse,
  ActionResponseSchema,
  Communication,
  ConversationResponse,
  ConversationResponseSchema,
  ConversationAddress,
  ConversationParticipant,
  ConversationParticipantSchema,
  SendMessageActionRequest,
  ConversationConfiguration,
  ConversationConfigurationSchema,
  ListCommunicationsResponse,
  ListCommunicationsResponseSchema,
  ListParticipantsResponse,
  ListParticipantsResponseSchema,
  ListConversationsResponse,
  ListConversationsResponseSchema,
  ConversationId,
} from '../types';
import { TACConfig } from '../lib/config';
import { Logger } from '../lib/logger';
import { BaseClient } from './base';

// Walks the error chain (error and its `cause` recursively) looking for an
// axios error with the given HTTP status. addParticipant wraps the raw axios
// error with `new Error(..., { cause: error })`, so the structured status lives
// on `.cause` — but if any future caller double-wraps, this still finds it.
// Cycle-guarded via a Set in case `.cause` references are circular.
function isHttpStatus(err: unknown, status: number): boolean {
  const seen = new Set<object>();
  let current: unknown = err;
  while (current !== undefined) {
    if ((typeof current === 'object' || typeof current === 'function') && current !== null) {
      if (seen.has(current)) break;
      seen.add(current);
    }
    if (axios.isAxiosError(current) && current.response?.status === status) {
      return true;
    }
    if (!(current instanceof Error) || current.cause === undefined) break;
    current = current.cause;
  }
  return false;
}

/**
 * Conversation client for interacting with Twilio Conversations Service
 */
export class ConversationClient extends BaseClient {
  private readonly conversationConfigurationId: string;

  constructor(config: TACConfig, logger?: Logger) {
    const baseUrl = config.region
      ? `https://conversations.${config.region}.twilio.com`
      : 'https://conversations.twilio.com';
    super(baseUrl, config, logger);
    this.conversationConfigurationId = config.conversationConfigurationId;
  }

  /**
   * Create an action on a conversation via the Conversation Orchestrator Actions API.
   *
   * Currently supports SEND_MESSAGE actions. Returns 202 Accepted; the action is
   * processed asynchronously and delivered via COMMUNICATION_CREATED webhook.
   *
   * @param conversationId - The conversation ID
   * @param request - The action request ({type, payload})
   * @returns Promise containing the ActionResponse
   */
  public async createAction(
    conversationId: ConversationId,
    request: SendMessageActionRequest
  ): Promise<ActionResponse> {
    const url = `/v2/Conversations/${conversationId}/Actions`;

    try {
      const data = await this.makeRequest<ActionResponse>(url, 'POST', request);
      return ActionResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to create action: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * List communications for a conversation
   *
   * @param conversationId - The conversation ID
   * @returns Promise containing array of communications
   */
  public async listCommunications(conversationId: ConversationId): Promise<Communication[]> {
    const url = `/v2/Conversations/${conversationId}/Communications`;

    try {
      const data = await this.makeRequest<ListCommunicationsResponse>(url, 'GET');
      const validated = ListCommunicationsResponseSchema.parse(data);
      return validated.communications;
    } catch (error) {
      throw new Error(
        `Failed to list communications: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Create a new conversation
   *
   * @param name - Optional conversation name
   * @returns Promise containing conversation response
   */
  public async createConversation(name?: string): Promise<ConversationResponse> {
    const url = `/v2/Conversations`;

    const requestBody: Record<string, string> = {
      configurationId: this.conversationConfigurationId,
    };

    if (name) {
      requestBody.name = name;
    }

    try {
      const data = await this.makeRequest<ConversationResponse>(url, 'POST', requestBody);
      return ConversationResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to create conversation: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Add a participant to a conversation
   *
   * @param conversationId - The conversation ID
   * @param addresses - Array of participant addresses
   * @param participantType - Type of participant (CUSTOMER, AI_AGENT, HUMAN_AGENT)
   * @returns Promise containing participant response
   */
  public async addParticipant(
    conversationId: ConversationId,
    addresses: ConversationAddress[],
    participantType: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_AGENT'
  ): Promise<ConversationParticipant> {
    const url = `/v2/Conversations/${conversationId}/Participants`;

    const requestBody = {
      type: participantType,
      addresses,
    };

    try {
      const data = await this.makeRequest<ConversationParticipant>(url, 'POST', requestBody);
      return ConversationParticipantSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to add participant: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Add a participant to a conversation, or fetch existing if already added
   *
   * This method handles the race condition where Maestro capture rules
   * and TAC both try to add participants simultaneously. It checks first,
   * then adds if missing, and catches 409 Conflict to re-fetch what Maestro added.
   *
   * @param conversationId - The conversation ID
   * @param addresses - Array of participant addresses
   * @param participantType - Type of participant (CUSTOMER, AI_AGENT, HUMAN_AGENT)
   * @returns Promise containing participant response
   */
  public async addOrFetchParticipant(
    conversationId: ConversationId,
    addresses: ConversationAddress[],
    participantType: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_AGENT'
  ): Promise<ConversationParticipant> {
    // First, check if participant already exists (e.g., added by Maestro capture rules)
    const existingParticipants = await this.listParticipants(conversationId);

    // Match on both type AND addresses to handle multiple participants of same type
    // (e.g., CUSTOMER with SMS + VOICE addresses)
    const existingParticipant = existingParticipants.find(p => {
      if (p.type !== participantType) return false;

      // Check if participant has ALL requested addresses
      return addresses.every(reqAddr => {
        return p.addresses.some(existingAddr => {
          const channelMatch = existingAddr.channel === reqAddr.channel;
          const addressMatch = existingAddr.address === reqAddr.address;
          const channelIdMatch = !reqAddr.channelId || existingAddr.channelId === reqAddr.channelId;
          return channelMatch && addressMatch && channelIdMatch;
        });
      });
    });

    if (existingParticipant) {
      this.logger.info(
        {
          conversation_id: conversationId,
          participant_type: participantType,
          addresses: addresses.map(a => `${a.channel}:${a.address}`),
        },
        'Participant already exists with all requested addresses'
      );
      return existingParticipant;
    }

    // Participant doesn't exist, add it
    this.logger.info(
      { conversation_id: conversationId, participant_type: participantType },
      'Adding new participant'
    );
    try {
      return await this.addParticipant(conversationId, addresses, participantType);
    } catch (error) {
      // If we get a 409 Conflict, it means Maestro added the participant between our check and our add
      // (TOCTOU race condition). Re-fetch the participant list to get the one Maestro just added.
      if (isHttpStatus(error, 409)) {
        this.logger.info(
          { conversation_id: conversationId, participant_type: participantType },
          'Caught 409 conflict - participant was added by Maestro between check and add, fetching existing participant'
        );
        const updatedParticipants = await this.listParticipants(conversationId);
        // Use same matching logic as above - match on type AND addresses
        const nowExistingParticipant = updatedParticipants.find(p => {
          if (p.type !== participantType) return false;
          return addresses.every(reqAddr => {
            return p.addresses.some(existingAddr => {
              const channelMatch = existingAddr.channel === reqAddr.channel;
              const addressMatch = existingAddr.address === reqAddr.address;
              const channelIdMatch =
                !reqAddr.channelId || existingAddr.channelId === reqAddr.channelId;
              return channelMatch && addressMatch && channelIdMatch;
            });
          });
        });
        if (nowExistingParticipant) {
          return nowExistingParticipant;
        }
        // Participant still not found after 409, which should be impossible - re-throw
        this.logger.error(
          { conversation_id: conversationId, participant_type: participantType },
          '409 conflict but participant not found after re-fetch - this should not happen'
        );
      }
      // Not a 409 or couldn't find the participant after re-fetch, re-throw
      throw error;
    }
  }

  /**
   * List participants in a conversation
   *
   * @param conversationId - The conversation ID
   * @returns Promise containing array of participants
   */
  public async listParticipants(
    conversationId: ConversationId
  ): Promise<ConversationParticipant[]> {
    const url = `/v2/Conversations/${conversationId}/Participants`;

    try {
      const data = await this.makeRequest<ListParticipantsResponse>(url, 'GET');
      const validated = ListParticipantsResponseSchema.parse(data);
      return validated.participants;
    } catch (error) {
      throw new Error(
        `Failed to list participants: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * List conversations with optional filters
   *
   * @param filters - Optional filters (channelId, status)
   * @returns Promise containing array of conversations
   */
  public async listConversations(filters?: {
    channelId?: string;
    status?: string[];
  }): Promise<ConversationResponse[]> {
    const url = `/v2/Conversations`;

    const params: Record<string, string> = {};
    if (filters?.channelId) {
      params.channelId = filters.channelId;
    }
    if (filters?.status && filters.status.length > 0) {
      params.status = filters.status.join(',');
    }

    try {
      const data = await this.makeRequest<ListConversationsResponse>(
        url,
        'GET',
        undefined,
        Object.keys(params).length > 0 ? params : undefined
      );
      const validated = ListConversationsResponseSchema.parse(data);
      return validated.conversations;
    } catch (error) {
      throw new Error(
        `Failed to list conversations: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Update conversation status
   *
   * @param conversationId - The conversation ID
   * @param status - New status (ACTIVE, INACTIVE, CLOSED)
   * @returns Promise containing updated conversation
   */
  public async updateConversation(
    conversationId: ConversationId,
    status: 'ACTIVE' | 'INACTIVE' | 'CLOSED'
  ): Promise<ConversationResponse> {
    const url = `/v2/Conversations/${conversationId}`;

    const requestBody = { status };

    try {
      const data = await this.makeRequest<ConversationResponse>(url, 'PUT', requestBody);
      return ConversationResponseSchema.parse(data);
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const statusSuffix = status !== undefined ? ` (HTTP ${status})` : '';
      throw new Error(
        `Failed to update conversation${statusSuffix}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Retrieve the details for a single configuration
   *
   * @param configurationId - The configuration ID to retrieve
   * @returns Promise containing configuration details
   */
  public async getConfiguration(configurationId: string): Promise<ConversationConfiguration> {
    const url = `/v2/ControlPlane/Configurations/${configurationId}`;

    try {
      const data = await this.makeRequest<ConversationConfiguration>(url, 'GET');
      return ConversationConfigurationSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to get configuration: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
}
