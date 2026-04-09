/**
 * VoiceWebhookChannel — Passive mode voice channel (TAC_MODE=passive)
 *
 * Handles voice conversations via Maestro webhooks ONLY (no ConversationRelay).
 * Customer has their own CR server; TAC handles Maestro orchestration.
 * Follows the same MessagingChannel pattern as SMSChannel and ChatChannel.
 *
 * Messages arrive as transcribed text via COMMUNICATION_CREATED with author.channel='VOICE'.
 * Responses are sent via Maestro Send API with channel='VOICE'.
 */

import { ChannelType, ConversationId } from '../types/index';
import { MessagingChannel, MessagingChannelConfig } from './messaging';
import type { TAC } from '../lib/tac';

/**
 * VoiceWebhookChannel configuration options
 */
export interface VoiceWebhookChannelConfig extends MessagingChannelConfig {
  /** Voice agent address identifier (defaults to the configured Twilio phone number) */
  agentAddress?: string | undefined;
}

/**
 * Voice Webhook Channel — passive mode (Maestro webhooks only, no CR)
 *
 * Extends MessagingChannel with channelType='voice' and filters for
 * author.channel='VOICE' in webhook events. Responses use Maestro Send API.
 */
export class VoiceWebhookChannel extends MessagingChannel {
  private readonly agentAddress: string;

  constructor(tac: TAC, config?: VoiceWebhookChannelConfig) {
    super(tac, config);
    this.agentAddress = config?.agentAddress ?? this.config.twilioPhoneNumber;
  }

  public get channelType(): ChannelType {
    return 'voice';
  }

  /**
   * Check if a message is from the bot itself (by agent address/phone number)
   */
  protected isOwnMessage(authorAddress: string): boolean {
    return authorAddress === this.agentAddress;
  }

  /**
   * Send voice response using Maestro Send API.
   *
   * In passive mode, the Send API records the communication in Maestro.
   * The customer's own CR server is responsible for actual TTS playback.
   * channelId (CallSid) is required for VOICE participants.
   */
  public async sendResponse(
    conversationId: ConversationId,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.logger.debug(
      {
        conversation_id: conversationId,
        message_length: message.length,
        operation: 'send_response',
      },
      'Sending voice response via Maestro Send API'
    );

    try {
      const session = this.getConversationSession(conversationId);

      if (!session) {
        throw new Error(`No active session found for conversation ${conversationId}`);
      }

      if (!session.authorInfo) {
        throw new Error(
          `No author info found for conversation ${conversationId} - no inbound message received yet`
        );
      }

      // channelId (CallSid) is required for VOICE participants
      const channelId =
        typeof session.metadata?.channelId === 'string' ? session.metadata.channelId : undefined;

      const recipientAddress = session.authorInfo.address;

      // Fetch current participants from Maestro
      const participants = await this.conversationClient.listParticipants(conversationId);

      // Find voice participants with agent address
      const voiceParticipants = participants.filter(
        p =>
          Array.isArray(p.addresses) &&
          p.addresses.some(
            addr => addr.channel === 'VOICE' && addr.address === this.agentAddress
          )
      );

      // Prefer AI/HUMAN agent participants
      const agentParticipant =
        voiceParticipants.find(p => p.type === 'AI_AGENT' || p.type === 'HUMAN_AGENT') ??
        voiceParticipants[0];

      if (!agentParticipant) {
        throw new Error(
          `Agent participant not found for conversation ${conversationId} with address ${this.agentAddress}`
        );
      }

      this.logger.debug(
        {
          conversation_id: conversationId,
          recipient_address: recipientAddress,
          agent_participant_id: agentParticipant.id,
          channel_id: channelId,
        },
        'Sending voice message via Send API'
      );

      await this.conversationClient.sendCommunication(conversationId, {
        author: {
          address: this.agentAddress,
          channel: 'VOICE',
          participantId: agentParticipant.id,
        },
        recipients: [
          {
            address: recipientAddress,
            channel: 'VOICE',
            participantId: session.authorInfo.participantId,
          },
        ],
        content: {
          type: 'TEXT',
          text: message,
        },
        ...(channelId !== undefined && { channelId }),
      });

      this.logger.info(
        { conversation_id: conversationId, channel_id: channelId },
        'Voice response sent successfully via Send API'
      );
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, 'Send response error');
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata,
      });
      throw error;
    }
  }
}
