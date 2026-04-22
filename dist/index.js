import { z } from 'zod';
export { z } from 'zod';
import pino from 'pino';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { WebSocket } from 'ws';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import Fastify2 from 'fastify';
import formbody2 from '@fastify/formbody';
import websocket2 from '@fastify/websocket';
import gracefulShutdown2 from 'fastify-graceful-shutdown';
import twilio2 from 'twilio';

// packages/core/src/types/config.ts
var ChannelTypeSchema = z.enum(["sms", "voice", "chat"]);
var TACConfigSchema = z.object({
  accountSid: z.string().min(1, "Twilio Account SID is required"),
  authToken: z.string().min(1, "Twilio Auth Token is required"),
  apiKey: z.string().min(1, "Twilio API Key is required"),
  apiSecret: z.string().min(1, "Twilio API Secret is required"),
  phoneNumber: z.string().min(1, "Twilio Phone Number is required"),
  traitGroups: z.array(z.string()).optional(),
  conversationConfigurationId: z.string().regex(/^conv_configuration_[0-9a-z]{26}$/, "Invalid Conversation Configuration ID format"),
  voicePublicDomain: z.string().url().optional(),
  cintelConfigurationId: z.string().optional(),
  cintelObservationOperatorSid: z.string().optional(),
  cintelSummaryOperatorSid: z.string().optional(),
  region: z.string().max(63, "Invalid Twilio region format (must be a valid DNS label)").regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Invalid Twilio region format (must be a valid DNS label)"
  ).optional()
});
var EnvironmentVariables = {
  TWILIO_ACCOUNT_SID: "TWILIO_ACCOUNT_SID",
  TWILIO_AUTH_TOKEN: "TWILIO_AUTH_TOKEN",
  TWILIO_API_KEY: "TWILIO_API_KEY",
  TWILIO_API_SECRET: "TWILIO_API_SECRET",
  TWILIO_PHONE_NUMBER: "TWILIO_PHONE_NUMBER",
  TRAIT_GROUPS: "TRAIT_GROUPS",
  TWILIO_CONVERSATION_CONFIGURATION_ID: "TWILIO_CONVERSATION_CONFIGURATION_ID",
  VOICE_PUBLIC_DOMAIN: "VOICE_PUBLIC_DOMAIN",
  TWILIO_TAC_CI_CONFIGURATION_ID: "TWILIO_TAC_CI_CONFIGURATION_ID",
  TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID: "TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID",
  TWILIO_TAC_CI_SUMMARY_OPERATOR_SID: "TWILIO_TAC_CI_SUMMARY_OPERATOR_SID",
  TWILIO_REGION: "TWILIO_REGION"
};
var VoiceServerConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  // Port 0 asks the OS to assign an ephemeral port (used by parallel test workers
  // to avoid EADDRINUSE collisions). Server startup logs read the actual bound
  // port from `fastify.server.address()`, not this configured value.
  port: z.number().int().nonnegative().default(3e3)
});
var MessageDirectionSchema = z.enum(["inbound", "outbound"]);
var MemoryChannelTypeSchema = z.enum([
  "VOICE",
  "SMS",
  "RCS",
  "EMAIL",
  "WHATSAPP",
  "CHAT",
  "API",
  "SYSTEM"
]);
var MemoryParticipantTypeSchema = z.enum(["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]);
var MemoryDeliveryStatusSchema = z.enum([
  "INITIATED",
  "IN_PROGRESS",
  "DELIVERED",
  "COMPLETED",
  "FAILED"
]);
var MemoryParticipantSchema = z.object({
  id: z.string(),
  name: z.string().max(256),
  address: z.string().max(254),
  channel: MemoryChannelTypeSchema,
  type: MemoryParticipantTypeSchema.optional(),
  profile_id: z.string().optional(),
  delivery_status: MemoryDeliveryStatusSchema.optional()
});
var MemoryCommunicationContentSchema = z.object({
  text: z.string().max(8388608).optional()
});
var MemoryCommunicationSchema = z.object({
  id: z.string(),
  author: MemoryParticipantSchema,
  content: MemoryCommunicationContentSchema,
  recipients: z.array(MemoryParticipantSchema).max(100),
  channel_id: z.string().max(256).optional(),
  created_at: z.string(),
  updated_at: z.string().optional()
});
var SessionMessageSchema = z.object({
  direction: MessageDirectionSchema,
  channel: z.string(),
  from_address: z.string().optional(),
  to_address: z.string().optional(),
  content: z.string(),
  timestamp: z.string().datetime()
});
var SessionInfoSchema = z.object({
  session_id: z.string(),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().optional(),
  channel: z.string(),
  messages: z.array(SessionMessageSchema)
});
var ObservationInfoSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  occurredAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  conversationIds: z.array(z.string()).nullable().optional(),
  source: z.string().optional()
});
var SummaryInfoSchema = z.object({
  id: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  conversationIds: z.array(z.string()).optional()
});
var MemoryRetrievalRequestSchema = z.object({
  query: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  observation_limit: z.number().int().positive().optional().default(10),
  summary_limit: z.number().int().positive().optional().default(5),
  session_limit: z.number().int().positive().optional().default(3)
});
var MemoryRetrievalResponseSchema = z.object({
  observations: z.array(ObservationInfoSchema),
  summaries: z.array(SummaryInfoSchema),
  communications: z.array(MemoryCommunicationSchema).optional().default([]),
  meta: z.object({
    queryTime: z.number().optional()
  }).optional()
});
var ProfileLookupResponseSchema = z.object({
  normalizedValue: z.string().max(255),
  profiles: z.array(z.string()).max(100).nullable().transform((v) => v ?? [])
});
var ProfileResponseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  traits: z.record(z.unknown())
});
var EMPTY_MEMORY_RESPONSE = {
  observations: [],
  summaries: [],
  communications: []
};
var CreateObservationResponseSchema = z.object({
  content: z.string(),
  source: z.string(),
  occurredAt: z.string(),
  conversationIds: z.array(z.string())
});
var CreateConversationSummariesResponseSchema = z.object({
  message: z.string()
});
var ParticipantAddressTypeSchema = z.enum([
  "VOICE",
  "SMS",
  "RCS",
  "EMAIL",
  "WHATSAPP",
  "CHAT",
  "API",
  "SYSTEM"
]);
var ParticipantAddressSchema = z.object({
  channel: ParticipantAddressTypeSchema,
  address: z.string().min(1, "Address is required"),
  channelId: z.string().nullable().optional()
});
var CommunicationParticipantSchema = z.object({
  address: z.string().max(254),
  channel: ParticipantAddressTypeSchema,
  participantId: z.string(),
  deliveryStatus: z.enum(["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]).optional()
});
var TranscriptionWordSchema = z.object({
  text: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional()
});
var TranscriptionSchema = z.object({
  channel: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  engine: z.string().optional(),
  words: z.array(TranscriptionWordSchema).optional()
});
var CommunicationContentSchema = z.object({
  type: z.enum(["TEXT", "TRANSCRIPTION"]),
  text: z.string().max(8388608),
  transcription: TranscriptionSchema.optional()
});
var CommunicationSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  accountId: z.string(),
  author: CommunicationParticipantSchema,
  content: CommunicationContentSchema,
  recipients: z.array(CommunicationParticipantSchema),
  channelId: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  occurredAt: z.string().nullable().optional()
});
var ListCommunicationsResponseSchema = z.object({
  communications: z.array(CommunicationSchema)
});
var SendCommunicationParticipantAddressSchema = z.object({
  address: z.string().min(1, "Address is required").max(254),
  channel: ParticipantAddressTypeSchema,
  participantId: z.string().optional()
});
var SendCommunicationRequestSchema = z.object({
  author: SendCommunicationParticipantAddressSchema,
  content: z.object({
    type: z.enum(["TEXT", "TRANSCRIPTION"]),
    text: z.string(),
    transcription: TranscriptionSchema.optional()
  }),
  recipients: z.array(SendCommunicationParticipantAddressSchema).min(1),
  channelId: z.string().optional()
});
var SendCommunicationResponseSchema = z.object({
  message: z.string(),
  conversationId: z.string(),
  channelId: z.string().nullable()
});
var AuthorInfoSchema = z.object({
  address: z.string(),
  participantId: z.string().optional()
});
var ConversationSessionSchema = z.object({
  // Base SessionContext fields
  conversationId: z.string().min(1, "Conversation ID is required"),
  channel: ChannelTypeSchema,
  startedAt: z.date(),
  metadata: z.record(z.unknown()).optional().default({}),
  // Maestro-specific fields
  profileId: z.string().optional(),
  serviceId: z.string().optional(),
  authorInfo: AuthorInfoSchema.optional(),
  profile: z.custom().optional()
});
function isConversationId(value) {
  return /^conv_conversation_[0-7][0-9a-z]{25}$/.test(value);
}
function isProfileId(value) {
  return /^mem_profile_[0-7][0-9a-z]{25}$/.test(value);
}
function isParticipantId(value) {
  return /^conv_participant_[0-7][0-9a-z]{25}$/.test(value);
}
function isMemoryStoreId(value) {
  return /^mem_store_[0-7][0-9a-z]{25}$/.test(value);
}
var ConversationResponseSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  status: z.string().optional(),
  name: z.string().nullish(),
  // API returns null when not set
  configurationId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
var ListConversationsResponseSchema = z.object({
  conversations: z.array(ConversationResponseSchema)
});
var ConversationAddressSchema = z.object({
  channel: ParticipantAddressTypeSchema,
  address: z.string(),
  channelId: z.string().nullish()
  // API returns null when not set
});
var ConversationParticipantSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  accountId: z.string(),
  name: z.string().optional(),
  type: z.enum(["HUMAN_AGENT", "CUSTOMER", "AI_AGENT", "AGENT", "UNKNOWN"]).optional(),
  profileId: z.string().nullable().optional(),
  addresses: z.array(ConversationAddressSchema).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
var ListParticipantsResponseSchema = z.object({
  participants: z.array(ConversationParticipantSchema)
});
var StatusTimeoutsSchema = z.object({
  inactive: z.number().int().gte(1).nullable().optional(),
  closed: z.number().int().gte(1)
});
var CaptureRuleSchema = z.object({
  from: z.string(),
  to: z.string(),
  metadata: z.record(z.string()).nullable().optional()
});
var ChannelSettingsSchema = z.object({
  statusTimeouts: StatusTimeoutsSchema.nullable().optional(),
  captureRules: z.array(CaptureRuleSchema).nullable().optional()
});
var StatusCallbackSchema = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "GET", "PUT", "DELETE", "PATCH"]).optional().default("POST")
});
var ConversationGroupingTypeSchema = z.enum([
  "GROUP_BY_PARTICIPANT_ADDRESSES",
  "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE"
]);
var ConversationConfigurationSchema = z.object({
  id: z.string(),
  displayName: z.string().max(32).regex(/^[a-zA-Z0-9-_ ]+$/).nullable().optional(),
  description: z.string(),
  conversationGroupingType: ConversationGroupingTypeSchema,
  memoryStoreId: z.string().regex(/^mem_store_[0-7][0-9a-z]{25}$/, "Invalid Memory Store ID format"),
  channelSettings: z.record(ChannelSettingsSchema).nullable().optional(),
  statusCallbacks: z.array(StatusCallbackSchema).max(20).nullable().optional(),
  intelligenceConfigurationIds: z.array(z.string()).max(5).nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  version: z.number().int().nullable().optional()
});
var TACCustomParametersSchema = z.object({
  conversation_id: z.string().optional(),
  profile_id: z.string().optional(),
  customer_participant_id: z.string().optional(),
  ai_agent_participant_id: z.string().optional()
});
z.object({
  /** Language code (e.g., 'en-US', 'es-ES', 'en-AU') */
  code: z.string(),
  /** TTS provider for this language */
  ttsProvider: z.string().optional(),
  /** TTS voice for this language */
  voice: z.string().optional(),
  /** TTS language (may differ from code) */
  ttsLanguage: z.string().optional(),
  /** Transcription provider for this language */
  transcriptionProvider: z.string().optional(),
  /** Speech model for transcription */
  speechModel: z.string().optional(),
  /** Transcription language (may differ from code) */
  transcriptionLanguage: z.string().optional()
});
z.object({
  /** WebSocket URL for ConversationRelay (required) */
  url: z.string().url(),
  // Welcome greeting settings
  /** Initial greeting to play when call connects */
  welcomeGreeting: z.string().optional(),
  /** Whether welcome greeting can be interrupted */
  welcomeGreetingInterruptible: z.enum(["any", "speech", "none"]).optional(),
  // Transcription settings
  /** Transcription provider (e.g., 'Deepgram', 'Google') */
  transcriptionProvider: z.string().optional(),
  /** Language for transcription (e.g., 'en-US') */
  transcriptionLanguage: z.string().optional(),
  /** Speech model for transcription (e.g., 'nova-3-general') */
  speechModel: z.string().optional(),
  // TTS settings
  /** Text-to-speech provider (e.g., 'Google', 'ElevenLabs') */
  ttsProvider: z.string().optional(),
  /** Language for TTS (e.g., 'en-US') */
  ttsLanguage: z.string().optional(),
  /** Voice identifier for TTS (e.g., 'en-US-Journey-O') */
  voice: z.string().optional(),
  /** ElevenLabs text normalization setting */
  elevenlabsTextNormalization: z.string().optional(),
  // Interaction settings
  /** When agent speech can be interrupted */
  interruptible: z.enum(["any", "speech", "none"]).optional(),
  /** Interrupt detection sensitivity */
  interruptSensitivity: z.enum(["low", "medium", "high"]).optional(),
  /** Enable DTMF tone detection */
  dtmfDetection: z.boolean().optional(),
  /** Recognition hints for domain-specific vocabulary */
  hints: z.string().optional(),
  /** Whether prompts should be reported when TTS is playing and interrupt is disabled */
  reportInputDuringAgentSpeech: z.boolean().optional(),
  // Advanced settings
  /** Enable partial prompts (streaming) */
  partialPrompts: z.boolean().optional(),
  /** Enable profanity filtering */
  profanityFilter: z.boolean().optional(),
  /** Allow preemption of agent speech */
  preemptible: z.boolean().optional(),
  /** Default language code */
  language: z.string().optional(),
  /** Debug options for troubleshooting (string per SDK, not boolean) */
  debug: z.string().optional(),
  // Intelligence service
  /** Conversational Intelligence Service ID or unique name */
  intelligenceService: z.string().optional(),
  // Conversation orchestrator
  /** Twilio Conversation Orchestrator configuration ID */
  conversationConfiguration: z.string().optional()
});
z.record(z.unknown());
var JSONSchemaSchema = z.object({
  type: z.enum(["object", "string", "number", "boolean", "array"]),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional(),
  items: z.any().optional(),
  enum: z.array(z.any()).optional(),
  description: z.string().optional()
});
var OpenAIToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: JSONSchemaSchema
  })
});
var ToolExecutionResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});
var BuiltInTools = {
  RETRIEVE_MEMORY: "retrieve_profile_memory",
  SEND_MESSAGE: "send_message",
  ESCALATE_TO_HUMAN: "escalate_to_human",
  SEARCH_KNOWLEDGE: "search_knowledge"
};
var CintelParticipantSchema = z.object({
  type: z.string(),
  profileId: z.string().optional(),
  mediaParticipantId: z.string().optional()
});
var ExecutionDetailsSchema = z.object({
  participants: z.array(CintelParticipantSchema).optional()
});
var OperatorSchema = z.object({
  id: z.string(),
  name: z.string().optional()
});
var OperatorResultSchema = z.object({
  id: z.string(),
  operator: OperatorSchema,
  outputFormat: z.string(),
  result: z.unknown(),
  dateCreated: z.string(),
  referenceIds: z.array(z.string()).optional().default([]),
  executionDetails: ExecutionDetailsSchema.optional()
});
var IntelligenceConfigurationSchema = z.object({
  id: z.string(),
  friendlyName: z.string().optional()
});
var OperatorResultEventSchema = z.object({
  accountId: z.string(),
  conversationId: z.string(),
  memoryStoreId: z.string().optional(),
  intelligenceConfiguration: IntelligenceConfigurationSchema,
  operatorResults: z.array(OperatorResultSchema)
});
var OperatorProcessingResultSchema = z.object({
  success: z.boolean(),
  eventType: z.string().optional(),
  skipped: z.boolean().default(false),
  skipReason: z.string().optional(),
  error: z.string().optional(),
  createdCount: z.number().default(0)
});
var ConversationIntelligenceConfigSchema = z.object({
  configurationId: z.string(),
  observationOperatorSid: z.string().optional(),
  summaryOperatorSid: z.string().optional()
});
var ConversationSummaryItemSchema = z.object({
  content: z.string(),
  conversationId: z.string(),
  occurredAt: z.string(),
  source: z.string().optional()
});
var TACChannelTypeSchema = z.enum([
  "VOICE",
  "SMS",
  "RCS",
  "EMAIL",
  "WHATSAPP",
  "CHAT",
  "API",
  "SYSTEM"
]);
var TACDeliveryStatusSchema = z.enum([
  "INITIATED",
  "IN_PROGRESS",
  "DELIVERED",
  "COMPLETED",
  "FAILED"
]);
var TACParticipantTypeSchema = z.enum(["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]);
var TACCommunicationAuthorSchema = z.object({
  // Common fields (both APIs)
  address: z.string(),
  channel: TACChannelTypeSchema,
  // Maestro-only fields
  participantId: z.string().optional(),
  deliveryStatus: TACDeliveryStatusSchema.optional(),
  // Memory-only fields
  id: z.string().optional(),
  name: z.string().optional(),
  type: TACParticipantTypeSchema.optional(),
  profileId: z.string().optional()
});
var TACCommunicationContentSchema = z.object({
  // Maestro-only: content type discriminator
  type: z.enum(["TEXT", "TRANSCRIPTION"]).optional(),
  // Both APIs: message text (optional in unified model to handle both)
  text: z.string().optional(),
  // Maestro-only: transcription metadata
  transcription: TranscriptionSchema.optional()
});
var TACCommunicationSchema = z.object({
  // Common fields (both APIs)
  id: z.string(),
  author: TACCommunicationAuthorSchema,
  content: TACCommunicationContentSchema,
  recipients: z.array(TACCommunicationAuthorSchema).default([]),
  channelId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // Maestro-only fields
  conversationId: z.string().optional(),
  accountId: z.string().optional()
});
function isKnowledgeBaseId(value) {
  return /^know_knowledgebase_[0-7][0-9a-z]{25}$/.test(value);
}
function isKnowledgeId(value) {
  return /^know_knowledge_[0-7][0-9a-z]{25}$/.test(value);
}
var KnowledgeBaseStatusSchema = z.enum([
  "QUEUED",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "DELETING"
]);
var KnowledgeBaseSchema = z.object({
  id: z.string().regex(/^know_knowledgebase_[0-7][0-9a-z]{25}$/, "Invalid KnowledgeBase ID format"),
  displayName: z.string(),
  description: z.string().optional(),
  status: KnowledgeBaseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number()
});
var KnowledgeChunkResultSchema = z.object({
  content: z.string().max(65536),
  knowledgeId: z.string().regex(/^know_knowledge_[0-7][0-9a-z]{25}$/),
  createdAt: z.string(),
  score: z.number()
});
var KnowledgeSearchResponseSchema = z.object({
  chunks: z.array(KnowledgeChunkResultSchema)
});

// packages/core/src/lib/tac-memory-response.ts
function isMemoryRetrievalResponse(data) {
  return !Array.isArray(data);
}
function normalizeMemoryCommunication(comm) {
  return {
    ...comm,
    channelId: comm.channel_id,
    createdAt: comm.created_at,
    updatedAt: comm.updated_at,
    author: {
      ...comm.author,
      profileId: comm.author.profile_id,
      deliveryStatus: comm.author.delivery_status
    },
    recipients: comm.recipients.map((r) => ({
      ...r,
      profileId: r.profile_id,
      deliveryStatus: r.delivery_status
    }))
  };
}
var TACMemoryResponse = class {
  _data;
  _communications;
  /**
   * Initialize wrapper with either Memory or Maestro data.
   *
   * @param data - Either MemoryRetrievalResponse (Memory) or Communication[] (Maestro)
   */
  constructor(data) {
    this._data = data;
    if (isMemoryRetrievalResponse(data)) {
      this._communications = (data.communications ?? []).map(
        (comm) => TACCommunicationSchema.parse(normalizeMemoryCommunication(comm))
      );
    } else {
      this._communications = data.map((comm) => TACCommunicationSchema.parse(comm));
    }
  }
  /**
   * Get observation memories.
   *
   * @returns List of observations if Memory is configured, empty array for Maestro fallback
   */
  get observations() {
    if (isMemoryRetrievalResponse(this._data)) {
      return this._data.observations;
    }
    return [];
  }
  /**
   * Get summary memories.
   *
   * @returns List of summaries if Memory is configured, empty array for Maestro fallback
   */
  get summaries() {
    if (isMemoryRetrievalResponse(this._data)) {
      return this._data.summaries;
    }
    return [];
  }
  /**
   * Get communications in unified format with all available fields.
   *
   * Communications are converted to a common format during initialization that includes
   * all fields from both Memory and Maestro APIs. Fields not available from a particular
   * API will be undefined.
   *
   * @returns List of unified communications with all available fields
   */
  get communications() {
    return this._communications;
  }
  /**
   * Check if Memory API is configured and providing full features.
   *
   * @returns true if Memory is configured (observations/summaries available),
   *          false if using Maestro fallback (only communications available)
   */
  get hasMemoryFeatures() {
    return isMemoryRetrievalResponse(this._data);
  }
  /**
   * Access raw underlying data for advanced use cases.
   *
   * Use this when you need access to all fields from the original API responses,
   * not just the unified common fields.
   *
   * @returns Either MemoryRetrievalResponse or Communication[] depending on configuration
   */
  get rawData() {
    return this._data;
  }
};

// packages/core/src/lib/config.ts
var TACConfig = class _TACConfig {
  accountSid;
  authToken;
  apiKey;
  apiSecret;
  phoneNumber;
  traitGroups;
  conversationConfigurationId;
  voicePublicDomain;
  cintelConfigurationId;
  cintelObservationOperatorSid;
  cintelSummaryOperatorSid;
  /** Optional Twilio region subdomain for API routing (e.g. transforms base URLs to `https://{product}.{region}.twilio.com`) */
  region;
  constructor(data) {
    const validatedConfig = TACConfigSchema.parse(data);
    this.accountSid = validatedConfig.accountSid;
    this.authToken = validatedConfig.authToken;
    this.apiKey = validatedConfig.apiKey;
    this.apiSecret = validatedConfig.apiSecret;
    this.phoneNumber = validatedConfig.phoneNumber;
    this.conversationConfigurationId = validatedConfig.conversationConfigurationId;
    if (validatedConfig.traitGroups) {
      this.traitGroups = validatedConfig.traitGroups;
    }
    if (validatedConfig.voicePublicDomain) {
      this.voicePublicDomain = validatedConfig.voicePublicDomain;
    }
    if (validatedConfig.cintelConfigurationId) {
      this.cintelConfigurationId = validatedConfig.cintelConfigurationId;
    }
    if (validatedConfig.cintelObservationOperatorSid) {
      this.cintelObservationOperatorSid = validatedConfig.cintelObservationOperatorSid;
    }
    if (validatedConfig.cintelSummaryOperatorSid) {
      this.cintelSummaryOperatorSid = validatedConfig.cintelSummaryOperatorSid;
    }
    if (validatedConfig.region) {
      this.region = validatedConfig.region;
    }
  }
  /**
   * Create TACConfig from environment variables.
   *
   * Loads configuration from the following environment variables:
   * - TWILIO_ACCOUNT_SID: Twilio Account SID (required)
   * - TWILIO_AUTH_TOKEN: Twilio Auth Token (required)
   * - TWILIO_API_KEY: Twilio API Key (required)
   * - TWILIO_API_SECRET: Twilio API Secret (required)
   * - TWILIO_PHONE_NUMBER: Twilio Phone Number (required)
   * - TWILIO_CONVERSATION_CONFIGURATION_ID: Twilio Conversation Configuration ID (required)
   * - TRAIT_GROUPS: Comma-separated trait group names (optional, for profile fetching)
   * - VOICE_PUBLIC_DOMAIN: Public domain for voice webhooks (optional)
   * - TWILIO_REGION: Twilio region subdomain for API routing (optional, e.g. transforms base URLs to `https://{product}.{region}.twilio.com`)
   *
   * @throws Error if required environment variables are not set or invalid
   *
   * @example
   * ```typescript
   * // Ensure env vars are set before calling (e.g. via dotenv, Docker, CI, etc.)
   * const config = TACConfig.fromEnv();
   *
   * // Use in TAC initialization
   * const tac = new TAC({ config });
   * ```
   */
  static fromEnv() {
    const requiredVars = [
      { key: EnvironmentVariables.TWILIO_ACCOUNT_SID, name: "TWILIO_ACCOUNT_SID" },
      { key: EnvironmentVariables.TWILIO_AUTH_TOKEN, name: "TWILIO_AUTH_TOKEN" },
      { key: EnvironmentVariables.TWILIO_API_KEY, name: "TWILIO_API_KEY" },
      { key: EnvironmentVariables.TWILIO_API_SECRET, name: "TWILIO_API_SECRET" },
      { key: EnvironmentVariables.TWILIO_PHONE_NUMBER, name: "TWILIO_PHONE_NUMBER" },
      {
        key: EnvironmentVariables.TWILIO_CONVERSATION_CONFIGURATION_ID,
        name: "TWILIO_CONVERSATION_CONFIGURATION_ID"
      }
    ];
    for (const { key, name } of requiredVars) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${name}`);
      }
    }
    const rawConfig = {
      accountSid: process.env[EnvironmentVariables.TWILIO_ACCOUNT_SID],
      authToken: process.env[EnvironmentVariables.TWILIO_AUTH_TOKEN],
      apiKey: process.env[EnvironmentVariables.TWILIO_API_KEY],
      apiSecret: process.env[EnvironmentVariables.TWILIO_API_SECRET],
      phoneNumber: process.env[EnvironmentVariables.TWILIO_PHONE_NUMBER],
      conversationConfigurationId: process.env[EnvironmentVariables.TWILIO_CONVERSATION_CONFIGURATION_ID],
      traitGroups: process.env[EnvironmentVariables.TRAIT_GROUPS]?.split(","),
      voicePublicDomain: process.env[EnvironmentVariables.VOICE_PUBLIC_DOMAIN],
      cintelConfigurationId: process.env[EnvironmentVariables.TWILIO_TAC_CI_CONFIGURATION_ID],
      cintelObservationOperatorSid: process.env[EnvironmentVariables.TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID],
      cintelSummaryOperatorSid: process.env[EnvironmentVariables.TWILIO_TAC_CI_SUMMARY_OPERATOR_SID],
      region: process.env[EnvironmentVariables.TWILIO_REGION]
    };
    return new _TACConfig(rawConfig);
  }
  /**
   * Get basic auth credentials for Twilio APIs
   */
  getBasicAuthCredentials() {
    return {
      username: this.accountSid,
      password: this.authToken
    };
  }
};
function createLogger(options) {
  const level = options?.level || process.env.TWILIO_LOG_LEVEL || "info";
  const isDevelopment = process.env.NODE_ENV !== "production";
  const usePretty = options?.pretty !== void 0 ? options.pretty : isDevelopment;
  const pinoOptions = {
    level,
    ...options?.name && { name: options.name }
  };
  if (usePretty) {
    return pino({
      ...pinoOptions,
      transport: {
        target: "pino-pretty",
        options: {}
      }
    });
  }
  return pino(pinoOptions);
}

// package.json
var package_default = {
  version: "1.0.0"};
function buildUserAgent() {
  return `twilio-agent-connect-typescript/${package_default.version}`;
}
var BaseClient = class {
  baseUrl;
  logger;
  axiosInstance;
  constructor(baseUrl, config, logger2) {
    this.baseUrl = baseUrl;
    this.logger = logger2 || createLogger({ name: this.constructor.name });
    const authHeader = "Basic " + Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
    const baseOrigin = new URL(baseUrl).origin;
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 3e4,
      maxRedirects: 5,
      headers: {
        "User-Agent": buildUserAgent(),
        Authorization: authHeader
      },
      beforeRedirect: (options, _responseDetails) => {
        const redirectUrl = new URL(
          String(options.path || ""),
          `${String(options.protocol)}//${String(options.host)}`
        );
        if (redirectUrl.origin === baseOrigin && options.headers) {
          options.headers.Authorization = authHeader;
        }
      }
    });
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount),
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error);
      }
    });
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const logContext = {
            error: error.message,
            method: error.config?.method,
            url: error.config?.url,
            status
          };
          if (status !== void 0 && status >= 400 && status < 500) {
            this.logger.warn(logContext, "HTTP request client error");
          } else {
            this.logger.error(logContext, "HTTP request error");
          }
        }
        throw error;
      }
    );
  }
  /**
   * Make an HTTP request with automatic header injection and error handling
   *
   * @param url - The URL path (relative to baseURL)
   * @param method - HTTP method (GET, POST, etc.)
   * @param data - Optional request body (will be automatically serialized to JSON)
   * @param params - Optional query string parameters
   * @returns Promise resolving to the response data (already parsed from JSON)
   * @throws Error on timeout, HTTP errors, or network failures
   */
  async makeRequest(url, method, data, params) {
    const response = await this.axiosInstance.request({
      url,
      method,
      data,
      params
    });
    return response.data;
  }
};

// packages/core/src/clients/memory.ts
var MemoryClient = class extends BaseClient {
  constructor(config, logger2) {
    const baseUrl = config.region ? `https://memory.${config.region}.twilio.com` : "https://memory.twilio.com";
    super(baseUrl, config, logger2);
  }
  /**
   * Retrieve memories for a specific profile
   *
   * @param serviceSid - The memory service SID
   * @param profileId - The profile ID to retrieve memories for
   * @param request - Optional request parameters for filtering results
   * @returns Promise containing memory retrieval response
   */
  async retrieveMemories(serviceSid, profileId, request = {}) {
    try {
      const url = `/v1/Stores/${serviceSid}/Profiles/${profileId}/Recall`;
      this.logger.debug(
        {
          memory_store_id: serviceSid,
          profile_id: profileId,
          request
        },
        "Retrieving memories"
      );
      const requestBody = {
        query: request.query,
        start_date: request.start_date,
        end_date: request.end_date,
        observation_limit: request.observation_limit ?? 10,
        summary_limit: request.summary_limit ?? 5,
        session_limit: request.session_limit ?? 3
      };
      const cleanedBody = Object.fromEntries(
        Object.entries(requestBody).filter(([_, value]) => value !== void 0)
      );
      const data = await this.makeRequest(url, "POST", cleanedBody);
      this.logger.debug(
        {
          memory_store_id: serviceSid,
          profile_id: profileId
        },
        "Raw memory response received"
      );
      const validatedResponse = MemoryRetrievalResponseSchema.safeParse(data);
      if (!validatedResponse.success) {
        this.logger.warn(
          {
            profile_id: profileId,
            memory_store_id: serviceSid,
            validation_errors: validatedResponse.error.errors
          },
          "Invalid memory response format"
        );
        return EMPTY_MEMORY_RESPONSE;
      }
      this.logger.debug(
        {
          memory_store_id: serviceSid,
          profile_id: profileId,
          observation_count: validatedResponse.data.observations.length,
          summary_count: validatedResponse.data.summaries.length
        },
        "Memory retrieval succeeded"
      );
      return validatedResponse.data;
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          profile_id: profileId,
          memory_store_id: serviceSid
        },
        "Memory retrieval error"
      );
      return EMPTY_MEMORY_RESPONSE;
    }
  }
  /**
   * Find profiles that contain a specific identifier value
   *
   * @param serviceSid - The memory service SID
   * @param idType - Identifier type (e.g., 'phone', 'email')
   * @param value - Raw value captured for the identifier
   * @returns Promise containing profile lookup response with normalized value and matching profile IDs
   */
  async lookupProfile(serviceSid, idType, value) {
    const url = `/v1/Stores/${serviceSid}/Profiles/Lookup`;
    const requestBody = {
      idType,
      value
    };
    try {
      const data = await this.makeRequest(url, "POST", requestBody);
      return ProfileLookupResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to lookup profile: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  /**
   * Fetch profile information with traits
   *
   * @param serviceSid - The memory service SID
   * @param profileId - The profile ID to fetch
   * @param traitGroups - Optional list of trait group names to include
   * @returns Promise containing profile response with ID, created timestamp, and traits
   */
  async getProfile(serviceSid, profileId, traitGroups) {
    const url = `/v1/Stores/${serviceSid}/Profiles/${profileId}`;
    const params = {};
    if (traitGroups && traitGroups.length > 0) {
      params.traitGroups = traitGroups.join(",");
    }
    try {
      const data = await this.makeRequest(
        url,
        "GET",
        void 0,
        Object.keys(params).length > 0 ? params : void 0
      );
      return ProfileResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to get profile: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  /**
   * Create an observation for a profile
   *
   * @param serviceSid - The memory service SID
   * @param profileId - The profile ID to create the observation for
   * @param content - The observation content
   * @param source - Source of the observation (default: 'conversation-intelligence')
   * @param conversationIds - Optional array of conversation IDs associated with this observation
   * @param occurredAt - Optional timestamp when the observation occurred
   * @returns Promise containing the created observation
   */
  async createObservation(serviceSid, profileId, content, source = "conversation-intelligence", conversationIds, occurredAt) {
    const url = `/v1/Stores/${serviceSid}/Profiles/${profileId}/Observations`;
    const requestBody = {
      content,
      source
    };
    if (conversationIds && conversationIds.length > 0) {
      requestBody.conversationIds = conversationIds;
    }
    if (occurredAt) {
      requestBody.occurredAt = occurredAt;
    }
    try {
      const data = await this.makeRequest(url, "POST", requestBody);
      return CreateObservationResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to create observation: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  /**
   * Create conversation summaries for a profile
   *
   * @param serviceSid - The memory service SID
   * @param profileId - The profile ID to create summaries for
   * @param summaries - Array of summary items to create
   * @returns Promise containing a success message for the created conversation summaries
   */
  async createConversationSummaries(serviceSid, profileId, summaries) {
    const url = `/v1/Stores/${serviceSid}/Profiles/${profileId}/ConversationSummaries`;
    const requestBody = {
      summaries: summaries.map((s) => ({
        content: s.content,
        conversationId: s.conversationId,
        occurredAt: s.occurredAt,
        source: s.source ?? "conversation-intelligence"
      }))
    };
    try {
      const data = await this.makeRequest(
        url,
        "POST",
        requestBody
      );
      return CreateConversationSummariesResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to create conversation summaries: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
};
function isHttpStatus(err, status) {
  const chain = [err];
  if (err instanceof Error && err.cause !== void 0) {
    chain.push(err.cause);
  }
  return chain.some((e) => axios.isAxiosError(e) && e.response?.status === status);
}
var ConversationClient = class extends BaseClient {
  conversationConfigurationId;
  constructor(config, logger2) {
    const baseUrl = config.region ? `https://conversations.${config.region}.twilio.com` : "https://conversations.twilio.com";
    super(baseUrl, config, logger2);
    this.conversationConfigurationId = config.conversationConfigurationId;
  }
  /**
   * Send a communication using the Conversation Orchestrator Send API
   *
   * @param conversationId - The conversation ID
   * @param request - Send communication request
   * @returns Promise containing communication response
   */
  async sendCommunication(conversationId, request) {
    const url = `/v2/Communications`;
    const requestBody = {
      conversationId,
      ...request
    };
    try {
      const data = await this.makeRequest(url, "POST", requestBody);
      return SendCommunicationResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to send communication: ${error instanceof Error ? error.message : String(error)}`,
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
  async listCommunications(conversationId) {
    const url = `/v2/Conversations/${conversationId}/Communications`;
    try {
      const data = await this.makeRequest(url, "GET");
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
  async createConversation(name) {
    const url = `/v2/Conversations`;
    const requestBody = {
      configurationId: this.conversationConfigurationId
    };
    if (name) {
      requestBody.name = name;
    }
    try {
      const data = await this.makeRequest(url, "POST", requestBody);
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
  async addParticipant(conversationId, addresses, participantType) {
    const url = `/v2/Conversations/${conversationId}/Participants`;
    const requestBody = {
      type: participantType,
      addresses
    };
    try {
      const data = await this.makeRequest(url, "POST", requestBody);
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
  async addOrFetchParticipant(conversationId, addresses, participantType) {
    const existingParticipants = await this.listParticipants(conversationId);
    const existingParticipant = existingParticipants.find((p) => {
      if (p.type !== participantType) return false;
      return addresses.every((reqAddr) => {
        return p.addresses.some((existingAddr) => {
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
          addresses: addresses.map((a) => `${a.channel}:${a.address}`)
        },
        "Participant already exists with all requested addresses"
      );
      return existingParticipant;
    }
    this.logger.info(
      { conversation_id: conversationId, participant_type: participantType },
      "Adding new participant"
    );
    try {
      return await this.addParticipant(conversationId, addresses, participantType);
    } catch (error) {
      if (isHttpStatus(error, 409)) {
        this.logger.info(
          { conversation_id: conversationId, participant_type: participantType },
          "Caught 409 conflict - participant was added by Maestro between check and add, fetching existing participant"
        );
        const updatedParticipants = await this.listParticipants(conversationId);
        const nowExistingParticipant = updatedParticipants.find((p) => {
          if (p.type !== participantType) return false;
          return addresses.every((reqAddr) => {
            return p.addresses.some((existingAddr) => {
              const channelMatch = existingAddr.channel === reqAddr.channel;
              const addressMatch = existingAddr.address === reqAddr.address;
              const channelIdMatch = !reqAddr.channelId || existingAddr.channelId === reqAddr.channelId;
              return channelMatch && addressMatch && channelIdMatch;
            });
          });
        });
        if (nowExistingParticipant) {
          return nowExistingParticipant;
        }
        this.logger.error(
          { conversation_id: conversationId, participant_type: participantType },
          "409 conflict but participant not found after re-fetch - this should not happen"
        );
      }
      throw error;
    }
  }
  /**
   * List participants in a conversation
   *
   * @param conversationId - The conversation ID
   * @returns Promise containing array of participants
   */
  async listParticipants(conversationId) {
    const url = `/v2/Conversations/${conversationId}/Participants`;
    try {
      const data = await this.makeRequest(url, "GET");
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
  async listConversations(filters) {
    const url = `/v2/Conversations`;
    const params = {};
    if (filters?.channelId) {
      params.channelId = filters.channelId;
    }
    if (filters?.status && filters.status.length > 0) {
      params.status = filters.status.join(",");
    }
    try {
      const data = await this.makeRequest(
        url,
        "GET",
        void 0,
        Object.keys(params).length > 0 ? params : void 0
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
  async updateConversation(conversationId, status) {
    const url = `/v2/Conversations/${conversationId}`;
    const requestBody = { status };
    try {
      const data = await this.makeRequest(url, "PUT", requestBody);
      return ConversationResponseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to update conversation: ${error instanceof Error ? error.message : String(error)}`,
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
  async getConfiguration(configurationId) {
    const url = `/v2/ControlPlane/Configurations/${configurationId}`;
    try {
      const data = await this.makeRequest(url, "GET");
      return ConversationConfigurationSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to get configuration: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
};

// packages/core/src/clients/knowledge.ts
var KnowledgeClient = class extends BaseClient {
  constructor(config, logger2) {
    const baseUrl = config.region ? `https://knowledge.${config.region}.twilio.com` : "https://knowledge.twilio.com";
    super(baseUrl, config, logger2);
  }
  /**
   * Get knowledge base metadata
   *
   * @param knowledgeBaseId - The knowledge base ID (format: know_knowledgebase_*)
   * @returns Promise containing knowledge base metadata
   */
  async getKnowledgeBase(knowledgeBaseId) {
    const url = `/v2/ControlPlane/KnowledgeBases/${knowledgeBaseId}`;
    try {
      const data = await this.makeRequest(url, "GET");
      return KnowledgeBaseSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to get knowledge base: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  /**
   * Search knowledge base for relevant content
   *
   * @param knowledgeBaseId - The knowledge base ID (format: know_knowledgebase_*)
   * @param query - Search query (max 2048 characters)
   * @param topK - Maximum number of results to return (default: 5, max: 20)
   * @param knowledgeIds - Optional list of knowledge IDs to filter results
   * @returns Promise containing array of search result chunks
   */
  async searchKnowledgeBase(knowledgeBaseId, query, topK = 5, knowledgeIds) {
    const url = `/v2/KnowledgeBases/${knowledgeBaseId}/Search`;
    const requestBody = {
      query,
      top: Math.min(Math.max(topK, 1), 20)
      // Clamp to 1-20
    };
    if (knowledgeIds && knowledgeIds.length > 0) {
      requestBody.knowledgeIds = knowledgeIds;
    }
    try {
      const data = await this.makeRequest(url, "POST", requestBody);
      const validated = KnowledgeSearchResponseSchema.parse(data);
      return validated.chunks;
    } catch (error) {
      throw new Error(
        `Failed to search knowledge base: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
};

// packages/core/src/lib/operator-result-processor.ts
function extractProfileIds(operatorResult, logger2) {
  const profileIds = [];
  if (operatorResult.executionDetails?.participants) {
    for (const participant of operatorResult.executionDetails.participants) {
      if (participant.profileId) {
        if (isProfileId(participant.profileId)) {
          profileIds.push(participant.profileId);
        } else {
          logger2.warn(
            {
              invalid_profile_id: participant.profileId,
              operator_id: operatorResult.operator.id,
              expected_format: "mem_profile_[0-9a-z]{26}"
            },
            "Invalid profile ID format from Cintel operator, skipping participant"
          );
        }
      }
    }
  }
  return profileIds;
}
function generateContent(operatorResult) {
  const result = operatorResult.result;
  if (result === null || result === void 0) {
    return void 0;
  }
  if (typeof result === "string") {
    return result.trim() || void 0;
  }
  const jsonString = JSON.stringify(result);
  return jsonString === "{}" || jsonString === "[]" ? void 0 : jsonString;
}
function parseObservationsContent(jsonContent) {
  try {
    const parsed = JSON.parse(jsonContent);
    if (typeof parsed === "object" && parsed !== null && "observations" in parsed) {
      const observations = parsed.observations;
      if (Array.isArray(observations)) {
        return observations.filter(
          (obs) => typeof obs === "string" && obs.trim() !== ""
        );
      }
    }
    return [];
  } catch {
    return [];
  }
}
function parseSummariesContent(jsonContent) {
  try {
    const parsed = JSON.parse(jsonContent);
    if (typeof parsed === "object" && parsed !== null && "summaries" in parsed) {
      const summaries = parsed.summaries;
      if (Array.isArray(summaries)) {
        return summaries.filter((s) => typeof s === "string" && s.trim() !== "");
      }
    }
    return [];
  } catch {
    return [];
  }
}
var OperatorResultProcessor = class {
  memoryClient;
  config;
  logger;
  constructor(memoryClient, config, logger2) {
    this.memoryClient = memoryClient;
    this.config = config;
    this.logger = logger2 ?? createLogger({ name: "cintel-processor" });
  }
  /**
   * Process an operator result event webhook payload
   *
   * @param payload - The raw webhook payload
   * @returns Processing result indicating success/failure and details
   */
  async processEvent(payload) {
    const parseResult = OperatorResultEventSchema.safeParse(payload);
    if (!parseResult.success) {
      this.logger.warn(
        { validation_errors: parseResult.error.errors },
        "Invalid operator result event payload"
      );
      return {
        success: false,
        skipped: false,
        error: `Invalid payload: ${parseResult.error.message}`,
        createdCount: 0
      };
    }
    const event = parseResult.data;
    if (!isConversationId(event.conversationId)) {
      return {
        success: false,
        skipped: false,
        error: `Invalid conversationId format in Cintel webhook: ${event.conversationId}. Expected format: conv_conversation_[0-9a-z]{26}`,
        createdCount: 0
      };
    }
    if (event.memoryStoreId && !isMemoryStoreId(event.memoryStoreId)) {
      return {
        success: false,
        skipped: false,
        error: `Invalid memoryStoreId format in Cintel webhook: ${event.memoryStoreId}. Expected format: mem_store_[0-9a-z]{26}`,
        createdCount: 0
      };
    }
    if (event.intelligenceConfiguration.id !== this.config.configurationId) {
      this.logger.debug(
        {
          received_config_id: event.intelligenceConfiguration.id,
          expected_config_id: this.config.configurationId
        },
        "Skipping event from different CI configuration"
      );
      return {
        success: true,
        skipped: true,
        skipReason: `Event from different CI configuration: ${event.intelligenceConfiguration.id}`,
        createdCount: 0
      };
    }
    const results = [];
    for (const operatorResult of event.operatorResults) {
      const result = await this.processOperatorResult(event, operatorResult);
      results.push(result);
    }
    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const errorCount = results.filter((r) => !r.success).length;
    const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);
    const eventTypes = results.filter((r) => r.success && !r.skipped && r.eventType).map((r) => r.eventType);
    const uniqueEventTypes = [...new Set(eventTypes)];
    const eventType = uniqueEventTypes.length === 1 ? uniqueEventTypes[0] : uniqueEventTypes.length > 1 ? "mixed" : void 0;
    if (errorCount > 0) {
      const errors = results.filter((r) => !r.success).map((r) => r.error);
      return {
        success: false,
        eventType,
        skipped: false,
        error: `${errorCount} operator(s) failed: ${errors.join("; ")}`,
        createdCount: totalCreated
      };
    }
    if (skippedCount === results.length) {
      return {
        success: true,
        skipped: true,
        skipReason: "All operator results were skipped",
        createdCount: 0
      };
    }
    this.logger.info(
      {
        conversation_id: event.conversationId,
        success_count: successCount,
        skipped_count: skippedCount,
        created_count: totalCreated,
        event_type: eventType
      },
      "Processed operator result event"
    );
    return {
      success: true,
      eventType,
      skipped: false,
      createdCount: totalCreated
    };
  }
  /**
   * Process an individual operator result
   */
  async processOperatorResult(event, operatorResult) {
    const operatorSid = operatorResult.operator.id;
    const isObservationOperator = this.config.observationOperatorSid === operatorSid;
    const isSummaryOperator = this.config.summaryOperatorSid === operatorSid;
    if (!isObservationOperator && !isSummaryOperator) {
      this.logger.debug(
        {
          operator_sid: operatorSid,
          observation_operator_sid: this.config.observationOperatorSid,
          summary_operator_sid: this.config.summaryOperatorSid
        },
        "Skipping unconfigured operator"
      );
      return {
        success: true,
        skipped: true,
        skipReason: `Operator ${operatorSid} is not configured for processing`,
        createdCount: 0
      };
    }
    const content = generateContent(operatorResult);
    if (!content) {
      this.logger.debug(
        { operator_sid: operatorSid },
        "Skipping operator result with empty content"
      );
      return {
        success: true,
        skipped: true,
        skipReason: "Operator result has empty content",
        createdCount: 0
      };
    }
    const profileIds = extractProfileIds(operatorResult, this.logger);
    if (profileIds.length === 0) {
      this.logger.warn(
        { operator_sid: operatorSid, conversation_id: event.conversationId },
        "No profile IDs found in operator result"
      );
      return {
        success: true,
        skipped: true,
        skipReason: "No profile IDs found in operator result execution details",
        createdCount: 0
      };
    }
    if (!event.memoryStoreId) {
      this.logger.warn({ conversation_id: event.conversationId }, "No memory store ID in event");
      return {
        success: false,
        skipped: false,
        error: "No memory store ID provided in event",
        createdCount: 0
      };
    }
    if (isObservationOperator) {
      return this.processObservationEvent(event, operatorResult, content, profileIds);
    } else {
      return this.processSummaryEvent(event, operatorResult, content, profileIds);
    }
  }
  /**
   * Process an observation operator result
   */
  async processObservationEvent(event, operatorResult, content, profileIds) {
    const observations = parseObservationsContent(content);
    if (observations.length === 0) {
      this.logger.debug(
        { operator_sid: operatorResult.operator.id },
        "No observations found in content"
      );
      return {
        success: true,
        eventType: "observation",
        skipped: true,
        skipReason: "No observations found in operator result content",
        createdCount: 0
      };
    }
    if (!event.memoryStoreId) {
      return {
        success: false,
        skipped: false,
        error: "memoryStoreId is required for observation events",
        createdCount: 0
      };
    }
    let createdCount = 0;
    for (const profileId of profileIds) {
      for (const observation of observations) {
        try {
          await this.memoryClient.createObservation(
            event.memoryStoreId,
            profileId,
            observation,
            "conversation-intelligence",
            [event.conversationId],
            operatorResult.dateCreated
          );
          createdCount++;
          this.logger.debug(
            {
              profile_id: profileId,
              conversation_id: event.conversationId,
              observation_preview: observation.substring(0, 100)
            },
            "Created observation"
          );
        } catch (error) {
          this.logger.error(
            {
              err: error,
              profile_id: profileId,
              conversation_id: event.conversationId
            },
            "Failed to create observation"
          );
          return {
            success: false,
            eventType: "observation",
            skipped: false,
            error: `Failed to create observation: ${error instanceof Error ? error.message : String(error)}`,
            createdCount
          };
        }
      }
    }
    return {
      success: true,
      eventType: "observation",
      skipped: false,
      createdCount
    };
  }
  /**
   * Process a summary operator result
   */
  async processSummaryEvent(event, operatorResult, content, profileIds) {
    const summaries = parseSummariesContent(content);
    if (summaries.length === 0) {
      this.logger.debug(
        { operator_sid: operatorResult.operator.id },
        "No summaries found in content"
      );
      return {
        success: true,
        eventType: "summary",
        skipped: true,
        skipReason: "No summaries found in operator result content",
        createdCount: 0
      };
    }
    if (!event.memoryStoreId) {
      return {
        success: false,
        skipped: false,
        error: "memoryStoreId is required for summary events",
        createdCount: 0
      };
    }
    let createdCount = 0;
    for (const profileId of profileIds) {
      try {
        const summaryItems = summaries.map((summaryContent) => ({
          content: summaryContent,
          conversationId: event.conversationId,
          occurredAt: operatorResult.dateCreated,
          source: "conversation-intelligence"
        }));
        await this.memoryClient.createConversationSummaries(
          event.memoryStoreId,
          profileId,
          summaryItems
        );
        createdCount += summaries.length;
        this.logger.debug(
          {
            profile_id: profileId,
            conversation_id: event.conversationId,
            summary_count: summaries.length
          },
          "Created conversation summaries"
        );
      } catch (error) {
        this.logger.error(
          {
            err: error,
            profile_id: profileId,
            conversation_id: event.conversationId
          },
          "Failed to create conversation summaries"
        );
        return {
          success: false,
          eventType: "summary",
          skipped: false,
          error: `Failed to create summaries: ${error instanceof Error ? error.message : String(error)}`,
          createdCount
        };
      }
    }
    return {
      success: true,
      eventType: "summary",
      skipped: false,
      createdCount
    };
  }
};

// packages/core/src/lib/tac.ts
var TAC = class _TAC {
  static FACTORY_TOKEN = /* @__PURE__ */ Symbol("TAC.create");
  config;
  logger;
  memoryClient;
  knowledgeClient;
  conversationClient;
  channels;
  cintelProcessor;
  memoryStoreId;
  // Callback registrations
  messageReadyCallback;
  handoffCallback;
  conversationEndedCallback;
  errorCallback;
  constructor(token, options = {}) {
    if (token !== _TAC.FACTORY_TOKEN) {
      throw new Error("TAC constructor is private. Use TAC.create() instead of new TAC().");
    }
    const finalConfig = options.config ? options.config instanceof TACConfig ? options.config : new TACConfig(options.config) : TACConfig.fromEnv();
    const finalLogger = options.logger ?? createLogger({ name: "tac" });
    this.config = finalConfig;
    this.logger = finalLogger;
    this.channels = /* @__PURE__ */ new Map();
    this.conversationClient = new ConversationClient(
      this.config,
      this.logger.child({ component: "conversation" })
    );
    this.logger.info("ConversationClient initialized");
  }
  static async create(options = {}) {
    const tac = new _TAC(_TAC.FACTORY_TOKEN, options);
    try {
      const conversationConfig = await tac.conversationClient.getConfiguration(
        tac.config.conversationConfigurationId
      );
      const fetchedMemoryStoreId = conversationConfig.memoryStoreId;
      if (!isMemoryStoreId(fetchedMemoryStoreId)) {
        throw new Error(
          `Invalid memoryStoreId from conversation configuration: ${fetchedMemoryStoreId}. Expected format: mem_store_[0-9a-z]{26}.`
        );
      }
      tac.memoryStoreId = fetchedMemoryStoreId;
      tac.memoryClient = new MemoryClient(tac.config, tac.logger.child({ component: "memory" }));
      tac.knowledgeClient = new KnowledgeClient(
        tac.config,
        tac.logger.child({ component: "knowledge" })
      );
      if (tac.config.cintelConfigurationId) {
        tac.cintelProcessor = new OperatorResultProcessor(
          tac.memoryClient,
          {
            configurationId: tac.config.cintelConfigurationId,
            observationOperatorSid: tac.config.cintelObservationOperatorSid,
            summaryOperatorSid: tac.config.cintelSummaryOperatorSid
          },
          tac.logger.child({ component: "cintel" })
        );
      }
      return tac;
    } catch (error) {
      tac.logger.error({ err: error }, "TAC initialization failed");
      throw error;
    }
  }
  /**
   * Register a channel with the framework
   */
  registerChannel(channel) {
    this.logger.info({ channel: channel.channelType }, "Registering channel");
    const existingChannel = this.channels.get(channel.channelType);
    if (existingChannel) {
      this.logger.info({ channel: channel.channelType }, "Replacing existing channel registration");
      existingChannel.shutdown();
    }
    this.channels.set(channel.channelType, channel);
    this.setupChannelEventListeners(channel);
    this.logger.info({ channel: channel.channelType }, "Channel registration complete");
  }
  /**
   * Set up event listeners for a channel.
   *
   * All channels emit three unified events:
   * - 'message': ChannelMessage (user or system messages)
   * - 'conversationEnded': { session: ConversationSession }
   * - 'error': { error: Error; context?: Record<string, unknown> }
   */
  setupChannelEventListeners(channel) {
    channel.on("message", (message) => {
      void this.handleMessage(message).catch((err) => {
        this.logger.error(
          { err, conversation_id: message.conversationId },
          "Message handler error"
        );
      });
    });
    channel.on(
      "conversationEnded",
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Intentionally async event handler
      async ({ session }) => {
        if (this.conversationEndedCallback) {
          try {
            await this.conversationEndedCallback({ session });
          } catch (error) {
            this.logger.error(
              { err: error, conversation_id: session.conversationId },
              "Conversation ended callback error"
            );
          }
        }
      }
    );
    channel.on(
      "error",
      ({ error, context }) => {
        this.logger.error({ err: error, ...context }, "Channel error");
        this.errorCallback?.({ error, context });
      }
    );
  }
  /**
   * Handle unified message from channels — pure pass-through to developer callback
   */
  async handleMessage(message) {
    if (!this.messageReadyCallback) {
      this.logger.warn("No message ready callback registered");
      return;
    }
    this.logger.debug(
      {
        conversation_id: message.conversationId,
        message_type: message.messageType,
        channel: message.channel,
        metadata_type: message.metadata?.type
      },
      "Forwarding message to callback"
    );
    try {
      await this.messageReadyCallback(message);
    } catch (error) {
      this.logger.error(
        { err: error, conversation_id: message.conversationId },
        "Message ready callback error"
      );
    }
  }
  /**
   * Register callback for when messages are ready to be processed
   */
  onMessageReady(callback) {
    this.messageReadyCallback = callback;
  }
  /**
   * Register callback for channel errors
   */
  onError(callback) {
    this.errorCallback = callback;
  }
  /**
   * Register callback for human handoff
   */
  onHandoff(callback) {
    this.handoffCallback = callback;
  }
  /**
   * Register callback for when a conversation ends.
   *
   * The callback is triggered by channels when a conversation is closed
   * (e.g., SMS conversation status changed to CLOSED, or voice WebSocket
   * disconnected). The callback receives the full ConversationSession before
   * it is cleaned up.
   */
  onConversationEnded(callback) {
    this.conversationEndedCallback = callback;
  }
  /**
   * Trigger handoff callback
   */
  async triggerHandoff(conversationId, reason) {
    if (!this.handoffCallback) {
      this.logger.warn({ conversation_id: conversationId }, "No handoff callback registered");
      return;
    }
    const channel = this.getChannelByConversationId(conversationId);
    const session = channel?.getConversationSession(conversationId);
    if (!session) {
      throw new Error(`No session found for ${conversationId}`);
    }
    try {
      await this.handoffCallback({
        conversationId: session.conversationId,
        profileId: session.profileId,
        reason,
        session
      });
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, "Handoff callback error");
    }
  }
  /**
   * Get channel by conversation ID
   */
  getChannelByConversationId(conversationId) {
    for (const channel of this.channels.values()) {
      if (channel.isConversationActive(conversationId)) {
        return channel;
      }
    }
    return void 0;
  }
  /**
   * Get registered channel by type
   */
  getChannel(channelType) {
    return this.channels.get(channelType);
  }
  /**
   * Get configuration
   */
  getConfig() {
    return this.config;
  }
  /**
   * Get memory client for advanced memory operations
   */
  getMemoryClient() {
    return this.memoryClient;
  }
  /**
   * Get knowledge client for knowledge base operations
   */
  getKnowledgeClient() {
    return this.knowledgeClient;
  }
  /**
   * Get conversation client for advanced conversation operations
   */
  getConversationClient() {
    return this.conversationClient;
  }
  /**
   * Create a MemoryRetriever function for channel dependency injection.
   */
  createMemoryRetriever() {
    return (session, query) => this.retrieveMemory(session, query);
  }
  /**
   * Get channel dependencies for creating channels (VoiceChannel, MessagingChannel subclasses).
   * Returns all dependencies needed to construct a channel.
   */
  getChannelDeps() {
    return {
      config: this.config,
      logger: this.logger,
      conversationClient: this.conversationClient,
      memoryRetriever: this.createMemoryRetriever()
    };
  }
  /**
   * Check if Conversation Intelligence processing is enabled
   *
   * @returns true if CI processor is initialized, false otherwise
   */
  isCintelEnabled() {
    return this.cintelProcessor !== void 0;
  }
  /**
   * Process a Conversation Intelligence operator result webhook event
   *
   * @param payload - The raw webhook payload from CI
   * @returns Promise containing the processing result
   * @throws Error if CI processor is not initialized
   */
  async processCintelEvent(payload) {
    if (!this.cintelProcessor) {
      throw new Error(
        "Conversation Intelligence processor is not initialized. Ensure cintelConfigurationId is provided in TAC configuration."
      );
    }
    return this.cintelProcessor.processEvent(payload);
  }
  /**
   * Retrieve memories from Memory API with automatic fallback to Conversations API
   *
   * @param session - Conversation session context
   * @param query - Optional semantic search query
   * @returns Promise containing TACMemoryResponse wrapper providing unified access to memory data.
   *
   * Attempts to retrieve from Memory API first:
   * - observations, summaries, and communications available
   * - communications include author name and type
   *
   * Falls back to Conversations API on error:
   * - observations and summaries are empty arrays
   * - communications have basic fields only (no author name/type)
   */
  async retrieveMemory(session, query) {
    try {
      if (!session.profileId) {
        if (!session.authorInfo || !session.authorInfo.address) {
          throw new Error(
            "profileId is required for memory retrieval but was not found in conversation context. Additionally, authorInfo.address is not available for profile lookup. Ensure either profileId or authorInfo.address is provided when creating the ConversationSession."
          );
        }
        const address = session.authorInfo.address;
        let identityType;
        if (address.includes("@")) {
          identityType = "email";
        } else if (address.startsWith("+")) {
          identityType = "phone";
        } else {
          throw new Error(
            `Unsupported authorInfo.address format '${address}'. Expected an email address containing '@' or a phone number starting with '+'.`
          );
        }
        this.logger.debug(
          { identityType, address, channel: session.channel },
          "profileId not found, attempting to lookup profile"
        );
        const lookupResponse = await this.memoryClient.lookupProfile(
          this.memoryStoreId,
          identityType,
          session.authorInfo.address
        );
        if (!lookupResponse.profiles || lookupResponse.profiles.length === 0) {
          throw new Error(
            `No profile found for ${identityType} ${session.authorInfo.address}. Profile lookup returned no results. Ensure the identity is registered in the identity resolution system.`
          );
        }
        const profileIdCandidate = lookupResponse.profiles[0];
        if (!profileIdCandidate || !isProfileId(profileIdCandidate)) {
          throw new Error(
            `Invalid profile ID format from identity resolution API: ${profileIdCandidate}. Expected format: mem_profile_[0-9a-z]{26}. This indicates a configuration issue with the identity resolution service.`
          );
        }
        session.profileId = profileIdCandidate;
      }
      const memoryResponse = await this.memoryClient.retrieveMemories(
        this.memoryStoreId,
        session.profileId,
        { query }
      );
      return new TACMemoryResponse(memoryResponse);
    } catch (error) {
      this.logger.warn(
        { err: error },
        "Failed to retrieve memory from Memory API, falling back to Conversations API"
      );
      try {
        const communications = await this.conversationClient.listCommunications(
          session.conversationId
        );
        return new TACMemoryResponse(communications);
      } catch (fallbackError) {
        this.logger.error({ err: fallbackError }, "Failed to retrieve communications");
        throw fallbackError;
      }
    }
  }
  /**
   * Fetch profile information with traits
   *
   * @param profileId - Profile ID to fetch
   * @returns Promise containing profile response or undefined if not available
   */
  async fetchProfile(profileId) {
    if (!profileId) {
      this.logger.warn("profile_id is required for profile fetching but was not provided");
      return void 0;
    }
    try {
      const traitGroups = this.config.traitGroups;
      const profileResponse = await this.memoryClient.getProfile(
        this.memoryStoreId,
        profileId,
        traitGroups
      );
      return profileResponse;
    } catch (error) {
      this.logger.error({ err: error }, `Failed to fetch profile for ${profileId}`);
      return void 0;
    }
  }
  /**
   * Shutdown TAC and cleanup resources
   */
  shutdown() {
    for (const channel of this.channels.values()) {
      this.logger.debug({ channel: channel.channelType }, "Shutting down channel");
      channel.shutdown();
    }
    this.channels.clear();
    this.logger.info("TAC shutdown complete");
  }
};

// packages/core/src/channels/messaging.ts
var DEFAULT_DEDUP_CAPACITY = 1e4;
var MessagingChannel = class {
  config;
  logger;
  conversationClient;
  activeConversations;
  callbacks;
  memoryRetriever;
  processedTokens = /* @__PURE__ */ new Set();
  maxTrackedTokens;
  tools = /* @__PURE__ */ new Map();
  constructor(deps, channelConfig) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: "channel" });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;
    this.activeConversations = /* @__PURE__ */ new Map();
    this.callbacks = {};
    const capacity = channelConfig?.dedupCapacity ?? DEFAULT_DEDUP_CAPACITY;
    if (capacity < 1 || !Number.isInteger(capacity)) {
      throw new Error("dedupCapacity must be a positive integer");
    }
    this.maxTrackedTokens = capacity;
  }
  /**
   * Check if a webhook has already been processed, and if not, record the token immediately.
   * This is intentionally a single synchronous check-and-record to prevent race conditions
   * where a duplicate arrives while the first request is still awaiting async work.
   * Uses a sliding window with FIFO eviction at capacity.
   */
  isDuplicateWebhook(idempotencyToken) {
    if (this.processedTokens.has(idempotencyToken)) {
      return true;
    }
    if (this.processedTokens.size >= this.maxTrackedTokens) {
      const oldest = this.processedTokens.values().next().value;
      this.processedTokens.delete(oldest);
    }
    this.processedTokens.add(idempotencyToken);
    return false;
  }
  /**
   * Start a new conversation session
   */
  startConversation(conversationId, profileId, serviceId) {
    if (this.activeConversations.has(conversationId)) {
      this.logger.debug(
        {
          conversation_id: conversationId,
          profile_id: this.activeConversations.get(conversationId)?.profileId,
          service_id: this.activeConversations.get(conversationId)?.serviceId
        },
        "Conversation already active"
      );
      return this.activeConversations.get(conversationId);
    }
    const session = {
      // Base SessionContext fields
      conversationId,
      channel: this.channelType,
      startedAt: /* @__PURE__ */ new Date(),
      metadata: {},
      // Maestro-specific fields
      profileId,
      serviceId
    };
    this.activeConversations.set(conversationId, session);
    this.logger.debug(
      {
        conversation_id: conversationId,
        profile_id: profileId,
        service_id: serviceId,
        channel: this.channelType
      },
      "Conversation started"
    );
    if (this.callbacks.onConversationStarted) {
      this.callbacks.onConversationStarted({ session });
    }
    return session;
  }
  /**
   * End a conversation session.
   *
   * Triggers the onConversationEnded callback BEFORE removing the session,
   * so the callback receives the full ConversationSession data.
   * Errors in the callback do not prevent session cleanup.
   */
  async endConversation(conversationId) {
    const session = this.activeConversations.get(conversationId);
    if (session) {
      if (this.callbacks.onConversationEnded) {
        try {
          await this.callbacks.onConversationEnded({ session });
        } catch (error) {
          this.logger.error(
            { err: error, conversation_id: conversationId },
            "Error in conversation ended callback"
          );
        }
      }
      this.activeConversations.delete(conversationId);
      this.logger.debug(
        {
          conversation_id: conversationId,
          channel: this.channelType,
          service_id: session.serviceId
        },
        "Conversation ended"
      );
    } else {
      this.logger.debug(
        { conversation_id: conversationId, channel: this.channelType },
        "Conversation end requested but no active session found"
      );
    }
  }
  /**
   * Get an active conversation session
   */
  getConversationSession(conversationId) {
    return this.activeConversations.get(conversationId);
  }
  /**
   * Check if a conversation is active
   */
  isConversationActive(conversationId) {
    return this.activeConversations.has(conversationId);
  }
  /**
   * Handle errors with proper context
   */
  handleError(error, context) {
    this.logger.error({ err: error, ...context }, "Channel error");
    if (this.callbacks.onError) {
      if (context) {
        this.callbacks.onError({ error, context });
      } else {
        this.callbacks.onError({ error });
      }
    }
  }
  /**
   * Cleanup resources when shutting down
   */
  shutdown() {
    this.activeConversations.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }
  /**
   * Register event callbacks (override for messaging-specific events)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic event callback needs to accept any args
  on(event, callback) {
    switch (event) {
      case "message":
        this.callbacks.onMessage = callback;
        break;
      case "conversationStarted":
        this.callbacks.onConversationStarted = callback;
        break;
      case "conversationEnded":
        this.callbacks.onConversationEnded = callback;
        break;
      case "error":
        this.callbacks.onError = callback;
        break;
    }
  }
  /**
   * List tools registered on this channel (for LLM discovery).
   * MessagingChannel starts with an empty registry; future messaging tools
   * (e.g., send_mms) can be added via `registerTool`.
   */
  listTools() {
    return Array.from(this.tools.values());
  }
  /**
   * Register a tool on this channel. Overwrites any tool with the same name.
   */
  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }
  /**
   * Execute a registered tool by name.
   *
   * Messaging tools are plain side-effect functions — unlike VoiceChannel,
   * there is no `outgoingMessage` auto-shipping. The tool's result is
   * returned unchanged for the caller to feed back to the LLM loop.
   */
  executeTool(_conversationId, name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return Promise.resolve(tool.implementation(args));
  }
  /**
   * Check if this webhook event belongs to this channel.
   * Returns false if the event is clearly for a different channel type.
   */
  isEventForThisChannel(webhookData) {
    const eventType = webhookData.eventType;
    const authorChannel = webhookData.data?.author?.channel;
    if (eventType === "COMMUNICATION_CREATED") {
      if (!authorChannel) {
        return false;
      }
      return authorChannel === this.channelType.toUpperCase();
    }
    if (eventType === "CONVERSATION_UPDATED") {
      const conversationId = this.extractConversationId(webhookData);
      if (conversationId && !this.isConversationActive(conversationId)) {
        return false;
      }
    }
    return true;
  }
  /**
   * Process messaging channel webhook from Twilio Conversations Service
   */
  async processWebhook(payload, idempotencyToken) {
    this.logger.debug({ operation: "webhook_processing", payload }, "Processing webhook");
    try {
      if (idempotencyToken && this.isDuplicateWebhook(idempotencyToken)) {
        this.logger.debug({ idempotency_token: idempotencyToken }, "Skipping duplicate webhook");
        return;
      }
      if (!this.validateWebhookPayload(payload)) {
        throw new Error("Invalid webhook payload");
      }
      const webhookData = payload;
      const eventType = webhookData.eventType;
      const conversationId = webhookData.data?.conversationId || webhookData.data?.id;
      if (!this.isEventForThisChannel(webhookData)) {
        this.logger.debug(
          { event_type: eventType, channel: this.channelType, conversation_id: conversationId },
          "Ignoring event for different channel type"
        );
        return;
      }
      this.logger.info(
        {
          event_type: eventType,
          raw_event_type: webhookData.eventType,
          conversation_id: conversationId
        },
        "Processing webhook event"
      );
      switch (eventType) {
        case "CONVERSATION_CREATED":
          this.logger.debug(
            { conversation_id: conversationId, profile_id: webhookData.data?.profileId },
            "Handling CONVERSATION_CREATED"
          );
          this.handleConversationCreated(webhookData);
          break;
        case "PARTICIPANT_ADDED":
          this.logger.debug(
            { conversation_id: conversationId, profile_id: webhookData.data?.profileId },
            "Handling PARTICIPANT_ADDED"
          );
          this.handleParticipantAdded(webhookData);
          break;
        case "COMMUNICATION_CREATED":
          this.logger.debug({ conversation_id: conversationId }, "Handling COMMUNICATION_CREATED");
          await this.handleCommunicationCreated(webhookData);
          break;
        case "CONVERSATION_UPDATED":
          this.logger.debug(
            { conversation_id: conversationId, status: webhookData.data?.status },
            "Handling CONVERSATION_UPDATED"
          );
          await this.handleConversationUpdated(webhookData);
          break;
        default:
          this.logger.warn(
            {
              event_type: eventType,
              raw_event_type: webhookData.eventType,
              conversation_id: conversationId,
              payload
            },
            "Unhandled event type - this event will be ignored"
          );
      }
      this.logger.debug({ event_type: eventType }, "Webhook processing completed");
    } catch (error) {
      if (idempotencyToken) {
        this.processedTokens.delete(idempotencyToken);
      }
      this.logger.error(
        { err: error, operation: "webhook_processing" },
        "Webhook processing error"
      );
      this.handleError(error instanceof Error ? error : new Error(String(error)), { payload });
    }
  }
  /**
   * Handle conversation creation event
   */
  handleConversationCreated(payload) {
    const conversationId = this.extractConversationId(payload);
    const profileId = this.extractProfileId(payload);
    if (!conversationId) {
      this.logger.warn(
        { payload, operation: "handle_conversation_created" },
        "Missing conversation ID in conversation.created event"
      );
      throw new Error("Missing conversation ID in conversation.created event");
    }
    this.startConversation(conversationId, profileId ?? void 0, payload.data?.serviceId);
  }
  /**
   * Handle participant added event
   */
  handleParticipantAdded(payload) {
    const conversationId = this.extractConversationId(payload);
    const profileId = this.extractProfileId(payload);
    if (!conversationId) {
      this.logger.warn(
        { payload, operation: "handle_participant_added" },
        "Missing conversation ID in participant.added event"
      );
      throw new Error("Missing conversation ID in participant.added event");
    }
    if (this.isConversationActive(conversationId)) {
      const session = this.getConversationSession(conversationId);
      if (session) {
        if (profileId) {
          this.logger.debug(
            {
              conversation_id: conversationId,
              old_profile_id: session.profileId,
              new_profile_id: profileId
            },
            "Updating conversation profile ID from participant.added"
          );
          session.profileId = profileId;
        }
        if (payload.data?.serviceId && session.serviceId !== payload.data.serviceId) {
          this.logger.debug(
            {
              conversation_id: conversationId,
              old_service_id: session.serviceId,
              new_service_id: payload.data.serviceId
            },
            "Updating conversation configuration ID from participant.added"
          );
          session.serviceId = payload.data.serviceId;
        }
      }
    } else {
      this.logger.debug(
        { conversation_id: conversationId, profile_id: profileId },
        "Auto-starting conversation from participant.added"
      );
      this.startConversation(conversationId, profileId ?? void 0, payload.data?.serviceId);
    }
  }
  /**
   * Handle new communication event (incoming message)
   */
  async handleCommunicationCreated(payload) {
    const conversationId = this.extractConversationId(payload);
    const profileId = this.extractProfileId(payload);
    const message = payload.data?.content?.text?.trim();
    const author = payload.data?.author?.address || "unknown";
    this.logger.info(
      {
        conversation_id: conversationId,
        profile_id: profileId,
        author,
        message,
        message_length: message?.length,
        operation: "handle_communication_created"
      },
      "Handling communication.created"
    );
    if (!conversationId) {
      this.logger.warn(
        { payload, operation: "handle_communication_created" },
        "Missing conversation ID in communication.created event"
      );
      throw new Error("Missing conversation ID in communication.created event");
    }
    if (!message) {
      this.logger.info({ conversation_id: conversationId }, "Ignoring empty message");
      return;
    }
    if (this.isOwnMessage(author)) {
      this.logger.info(
        {
          conversation_id: conversationId,
          author_address: author
        },
        "Ignoring message from AI agent"
      );
      return;
    }
    if (!this.isConversationActive(conversationId)) {
      this.logger.debug({ conversation_id: conversationId }, "Starting new conversation");
      this.startConversation(conversationId, profileId ?? void 0, payload.data?.serviceId);
    } else if (payload.data?.serviceId) {
      const session2 = this.getConversationSession(conversationId);
      if (session2 && session2.serviceId !== payload.data.serviceId) {
        this.logger.debug(
          {
            conversation_id: conversationId,
            old_service_id: session2.serviceId,
            new_service_id: payload.data.serviceId
          },
          "Updating conversation configuration ID from communication.created"
        );
        session2.serviceId = payload.data.serviceId;
      }
    }
    const session = this.getConversationSession(conversationId);
    if (session) {
      session.authorInfo = {
        address: author,
        participantId: payload.data?.author?.participantId
      };
      if (payload.data?.channelId) {
        if (!session.metadata) {
          session.metadata = {};
        }
        session.metadata.channelId = payload.data.channelId;
        this.logger.debug(
          { conversation_id: conversationId, channel_id: payload.data.channelId },
          "Stored channelId in session metadata"
        );
      }
    }
    let userMemory;
    if (session) {
      this.logger.debug({ conversation_id: conversationId, author }, "Retrieving user memory");
      try {
        userMemory = await this.memoryRetriever(session, message);
        this.logger.debug(
          { conversation_id: conversationId, profile_id: session.profileId },
          "User memory retrieved"
        );
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          "Failed to retrieve user memory"
        );
      }
    }
    if (this.callbacks.onMessage) {
      this.logger.debug({ conversation_id: conversationId }, "Emitting message event");
      const channelMessage = {
        conversationId,
        messageType: "user",
        message,
        channel: this.channelType,
        metadata: { type: "communication_created" },
        conversation: session ? {
          profileId: session.profileId ?? profileId ?? void 0,
          memory: userMemory,
          author,
          serviceId: session.serviceId,
          authorInfo: session.authorInfo ? { address: session.authorInfo.address } : void 0,
          startedAt: session.startedAt
        } : void 0
      };
      void Promise.resolve(this.callbacks.onMessage(channelMessage)).catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.handleError(error, { conversationId, event: "message" });
      });
    }
  }
  /**
   * Handle conversation updated event
   */
  async handleConversationUpdated(payload) {
    const conversationId = this.extractConversationId(payload);
    if (!conversationId) {
      throw new Error("Missing conversation ID in conversation.updated event");
    }
    if (payload.data?.status === "CLOSED") {
      this.logger.info(
        { conversation_id: conversationId, status: payload.data.status },
        "Conversation closed, cleaning up"
      );
      await this.endConversation(conversationId);
    }
  }
  /**
   * Extract conversation ID from webhook payload
   */
  extractConversationId(payload) {
    const webhookData = payload;
    const conversationId = webhookData.data?.conversationId || webhookData.data?.id;
    if (conversationId && isConversationId(conversationId)) {
      return conversationId;
    }
    if (conversationId) {
      this.logger.warn(
        {
          provided_id: conversationId,
          operation: "extract_conversation_id",
          expected_pattern: "^conv_conversation_[0-9a-z]{26}$"
        },
        "Invalid conversation ID format in webhook payload"
      );
    } else {
      this.logger.debug(
        { operation: "extract_conversation_id" },
        "Conversation ID missing in webhook payload"
      );
    }
    return null;
  }
  /**
   * Extract profile ID from webhook payload
   */
  extractProfileId(payload) {
    const webhookData = payload;
    const conversationId = webhookData.data?.conversationId;
    const profileId = webhookData.data?.profileId;
    if (profileId && isProfileId(profileId)) {
      return profileId;
    }
    if (profileId) {
      this.logger.warn(
        {
          provided_id: profileId,
          operation: "extract_profile_id",
          expected_pattern: "^mem_profile_[0-9a-z]{26}$",
          conversation_id: conversationId
        },
        "Invalid profile ID format in webhook payload"
      );
    } else {
      this.logger.debug(
        {
          operation: "extract_profile_id",
          conversation_id: conversationId
        },
        "Profile ID missing in webhook payload"
      );
    }
    return null;
  }
  /**
   * Validate messaging channel webhook payload structure
   */
  validateWebhookPayload(payload) {
    if (payload === null || payload === void 0) {
      return false;
    }
    const webhookData = payload;
    return typeof webhookData === "object" && typeof webhookData.eventType === "string" && webhookData.eventType.length > 0;
  }
};

// packages/core/src/channels/sms.ts
var SMSChannel = class extends MessagingChannel {
  get channelType() {
    return "sms";
  }
  /**
   * Check if a message is from the bot itself (by phone number)
   */
  isOwnMessage(authorAddress) {
    return authorAddress === this.config.phoneNumber;
  }
  /**
   * Send SMS response using Conversation Orchestrator Send API
   */
  async sendResponse(conversationId, message, metadata) {
    this.logger.debug(
      {
        conversation_id: conversationId,
        message_length: message.length,
        operation: "send_response"
      },
      "Sending SMS response"
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
      const recipientAddress = session.authorInfo.address;
      const participants = await this.conversationClient.listParticipants(conversationId);
      const smsParticipants = participants.filter(
        (p) => Array.isArray(p.addresses) && p.addresses.some(
          (addr) => addr.channel === "SMS" && addr.address === this.config.phoneNumber
        )
      );
      const agentParticipant = smsParticipants.find(
        (p) => p.type === "AI_AGENT" || p.type === "HUMAN_AGENT" || p.type === "AGENT"
      ) ?? smsParticipants[0];
      if (!agentParticipant) {
        throw new Error(
          `Agent participant not found for conversation ${conversationId} with phone ${this.config.phoneNumber}`
        );
      }
      this.logger.debug(
        {
          conversation_id: conversationId,
          recipient_address: recipientAddress,
          recipient_participant_id: session.authorInfo.participantId,
          agent_participant_id: agentParticipant.id,
          from_number: this.config.phoneNumber
        },
        "Sending SMS via Send API"
      );
      await this.conversationClient.sendCommunication(conversationId, {
        author: {
          address: this.config.phoneNumber,
          channel: "SMS",
          participantId: agentParticipant.id
        },
        recipients: [
          {
            address: recipientAddress,
            channel: "SMS",
            participantId: session.authorInfo.participantId
          }
        ],
        content: {
          type: "TEXT",
          text: message
        }
      });
      this.logger.info(
        { conversation_id: conversationId, recipient_address: recipientAddress },
        "SMS sent successfully via Send API"
      );
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, "Send response error");
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata
      });
      throw error;
    }
  }
};

// packages/core/src/channels/chat.ts
var ChatChannel = class extends MessagingChannel {
  agentAddress;
  constructor(deps, config) {
    super(deps, config);
    this.agentAddress = config?.agentAddress ?? "ai-assistant";
  }
  get channelType() {
    return "chat";
  }
  /**
   * Check if a message is from the bot itself (by agent address)
   */
  isOwnMessage(authorAddress) {
    return authorAddress === this.agentAddress;
  }
  /**
   * Send chat response using Conversation Orchestrator Send API
   */
  async sendResponse(conversationId, message, metadata) {
    this.logger.debug(
      {
        conversation_id: conversationId,
        message_length: message.length,
        operation: "send_response"
      },
      "Sending chat response"
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
      const chatChannelSid = typeof session.metadata?.channelId === "string" ? session.metadata.channelId : void 0;
      if (!chatChannelSid) {
        throw new Error(
          `No channelId found in session metadata for conversation ${conversationId}`
        );
      }
      const recipientAddress = session.authorInfo.address;
      const participants = await this.conversationClient.listParticipants(conversationId);
      let agentParticipant = participants.find((p) => p.type === "AI_AGENT" || p.type === "AGENT");
      if (!agentParticipant) {
        this.logger.debug(
          {
            conversation_id: conversationId,
            agent_address: this.agentAddress,
            channel_id: chatChannelSid
          },
          "No AI_AGENT participant found, creating one"
        );
        try {
          agentParticipant = await this.conversationClient.addParticipant(
            conversationId,
            [{ channel: "CHAT", address: this.agentAddress, channelId: chatChannelSid }],
            "AI_AGENT"
          );
          this.logger.info(
            {
              conversation_id: conversationId,
              participant_id: agentParticipant.id,
              agent_address: this.agentAddress,
              channel_id: chatChannelSid
            },
            "Created AI_AGENT participant"
          );
        } catch (error) {
          this.logger.warn(
            { err: error, conversation_id: conversationId },
            "Failed to create AI_AGENT participant, attempting to list participants again"
          );
          const retriedParticipants = await this.conversationClient.listParticipants(conversationId);
          agentParticipant = retriedParticipants.find(
            (p) => p.type === "AI_AGENT" || p.type === "AGENT"
          );
          if (!agentParticipant) {
            throw new Error(
              `Failed to create or find AI_AGENT participant for conversation ${conversationId}`
            );
          }
        }
      }
      this.logger.debug(
        {
          conversation_id: conversationId,
          recipient_address: recipientAddress,
          recipient_participant_id: session.authorInfo.participantId,
          agent_participant_id: agentParticipant.id,
          agent_address: this.agentAddress
        },
        "Sending chat message via Send API"
      );
      const sendRequest = {
        author: {
          address: this.agentAddress,
          channel: "CHAT",
          participantId: agentParticipant.id
        },
        recipients: [
          {
            address: recipientAddress,
            channel: "CHAT",
            participantId: session.authorInfo.participantId
          }
        ],
        content: {
          type: "TEXT",
          text: message
        },
        channelId: chatChannelSid
      };
      await this.conversationClient.sendCommunication(conversationId, sendRequest);
      this.logger.info(
        { conversation_id: conversationId, channel_id: chatChannelSid },
        "Chat message sent successfully via Send API"
      );
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, "Send response error");
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata
      });
      throw error;
    }
  }
};
function createLogger2(options) {
  const level = options?.level || process.env.TWILIO_LOG_LEVEL || "info";
  const isDevelopment = process.env.NODE_ENV !== "production";
  const usePretty = options?.pretty !== void 0 ? options.pretty : isDevelopment;
  const pinoOptions = {
    level,
    ...options?.name && { name: options.name }
  };
  if (usePretty) {
    return pino({
      ...pinoOptions,
      transport: {
        target: "pino-pretty",
        options: {}
      }
    });
  }
  return pino(pinoOptions);
}
var SetupMessageSchema = z.object({
  type: z.literal("setup"),
  sessionId: z.string(),
  callSid: z.string(),
  parentCallSid: z.string().optional(),
  from: z.string(),
  to: z.string(),
  forwardedFrom: z.string().optional(),
  callerName: z.string().optional(),
  direction: z.string(),
  callType: z.string(),
  callStatus: z.string(),
  accountSid: z.string(),
  customParameters: z.record(z.string(), z.string()).optional()
});
var PromptMessageSchema = z.object({
  type: z.literal("prompt"),
  voicePrompt: z.string(),
  lang: z.string().optional(),
  last: z.boolean().optional(),
  agentSpeaking: z.string().optional()
});
var InterruptMessageSchema = z.object({
  type: z.literal("interrupt"),
  utteranceUntilInterrupt: z.string().optional(),
  durationUntilInterruptMs: z.number().optional()
});
var DtmfMessageSchema = z.object({
  type: z.literal("dtmf"),
  digit: z.string()
});
var InfoMessageSchema = z.object({
  type: z.literal("info"),
  info: z.record(z.unknown()).optional()
});
var ErrorMessageSchema = z.object({
  type: z.literal("error"),
  description: z.string().optional()
});
var WebSocketMessageSchema = z.discriminatedUnion("type", [
  SetupMessageSchema,
  PromptMessageSchema,
  InterruptMessageSchema,
  DtmfMessageSchema,
  InfoMessageSchema,
  ErrorMessageSchema
]);
var TextTokenMessageSchema = z.object({
  type: z.literal("text"),
  token: z.string(),
  last: z.boolean().optional().default(true)
});
var PlayMessageSchema = z.object({
  type: z.literal("play"),
  source: z.string().url(),
  loop: z.number().int().min(0).optional(),
  interruptible: z.boolean().optional(),
  preemptible: z.boolean().optional()
});
var SendDigitsMessageSchema = z.object({
  type: z.literal("sendDigits"),
  digits: z.string().regex(/^[0-9w*#]+$/)
});
var SwitchLanguageMessageBaseSchema = z.object({
  type: z.literal("language"),
  ttsLanguage: z.string().optional(),
  transcriptionLanguage: z.string().optional()
});
SwitchLanguageMessageBaseSchema.refine(
  (data) => data.ttsLanguage || data.transcriptionLanguage,
  {
    message: "At least one language must be specified"
  }
);
var EndMessageSchema = z.object({
  type: z.literal("end"),
  handoffData: z.string().optional()
  // JSON string
});
var OutgoingMessageSchema = z.discriminatedUnion("type", [
  TextTokenMessageSchema,
  PlayMessageSchema,
  SendDigitsMessageSchema,
  SwitchLanguageMessageBaseSchema,
  EndMessageSchema
]);
var LanguageAttributesSchema2 = z.object({
  /** Language code (e.g., 'en-US', 'es-ES', 'en-AU') */
  code: z.string(),
  /** TTS provider for this language */
  ttsProvider: z.string().optional(),
  /** TTS voice for this language */
  voice: z.string().optional(),
  /** TTS language (may differ from code) */
  ttsLanguage: z.string().optional(),
  /** Transcription provider for this language */
  transcriptionProvider: z.string().optional(),
  /** Speech model for transcription */
  speechModel: z.string().optional(),
  /** Transcription language (may differ from code) */
  transcriptionLanguage: z.string().optional()
});
var ConversationRelayAttributesSchema2 = z.object({
  /** WebSocket URL for ConversationRelay (required) */
  url: z.string().url(),
  // Welcome greeting settings
  /** Initial greeting to play when call connects */
  welcomeGreeting: z.string().optional(),
  /** Whether welcome greeting can be interrupted */
  welcomeGreetingInterruptible: z.enum(["any", "speech", "none"]).optional(),
  // Transcription settings
  /** Transcription provider (e.g., 'Deepgram', 'Google') */
  transcriptionProvider: z.string().optional(),
  /** Language for transcription (e.g., 'en-US') */
  transcriptionLanguage: z.string().optional(),
  /** Speech model for transcription (e.g., 'nova-3-general') */
  speechModel: z.string().optional(),
  // TTS settings
  /** Text-to-speech provider (e.g., 'Google', 'ElevenLabs') */
  ttsProvider: z.string().optional(),
  /** Language for TTS (e.g., 'en-US') */
  ttsLanguage: z.string().optional(),
  /** Voice identifier for TTS (e.g., 'en-US-Journey-O') */
  voice: z.string().optional(),
  /** ElevenLabs text normalization setting */
  elevenlabsTextNormalization: z.string().optional(),
  // Interaction settings
  /** When agent speech can be interrupted */
  interruptible: z.enum(["any", "speech", "none"]).optional(),
  /** Interrupt detection sensitivity */
  interruptSensitivity: z.enum(["low", "medium", "high"]).optional(),
  /** Enable DTMF tone detection */
  dtmfDetection: z.boolean().optional(),
  /** Recognition hints for domain-specific vocabulary */
  hints: z.string().optional(),
  /** Whether prompts should be reported when TTS is playing and interrupt is disabled */
  reportInputDuringAgentSpeech: z.boolean().optional(),
  // Advanced settings
  /** Enable partial prompts (streaming) */
  partialPrompts: z.boolean().optional(),
  /** Enable profanity filtering */
  profanityFilter: z.boolean().optional(),
  /** Allow preemption of agent speech */
  preemptible: z.boolean().optional(),
  /** Default language code */
  language: z.string().optional(),
  /** Debug options for troubleshooting (string per SDK, not boolean) */
  debug: z.string().optional(),
  // Intelligence service
  /** Conversational Intelligence Service ID or unique name */
  intelligenceService: z.string().optional()
});
var ConversationRelayConfigSchema = ConversationRelayAttributesSchema2.extend({
  /** Optional language configurations as child <Language> elements */
  languages: z.array(LanguageAttributesSchema2).optional()
});
var CustomParametersSchema2 = z.record(z.string(), z.string()).refine(
  (params) => {
    return Object.keys(params).every((key) => key.trim().length > 0);
  },
  { message: "Custom parameter keys must be non-empty strings" }
);
var ConversationRelayCallbackPayloadSchema = z.object({
  // Core Twilio identifiers (required)
  AccountSid: z.string(),
  CallSid: z.string(),
  /** Call status with strict type checking for all valid Twilio call states */
  CallStatus: z.enum([
    "queued",
    "initiated",
    "ringing",
    "in-progress",
    "completed",
    "busy",
    "no-answer",
    "failed",
    "canceled"
  ]),
  // Call participants (required)
  From: z.string(),
  To: z.string(),
  /** Direction of the call */
  Direction: z.enum(["inbound", "outbound-api", "outbound-dial"]),
  // Standard voice webhook parameters (optional)
  ApiVersion: z.string().optional(),
  ForwardedFrom: z.string().optional(),
  CallerName: z.string().optional(),
  ParentCallSid: z.string().optional(),
  ApplicationSid: z.string().optional(),
  // ConversationRelay session information (optional)
  SessionId: z.string().optional(),
  SessionStatus: z.string().optional(),
  SessionDuration: z.string().optional(),
  HandoffData: z.string().optional()
  // JSON string
});
var HandoffDataSchema = z.object({
  reason: z.string(),
  call_summary: z.string(),
  sentiment: z.string()
});
z.object({
  type: z.enum(["object", "string", "number", "boolean", "array"]),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional(),
  items: z.any().optional(),
  enum: z.array(z.any()).optional(),
  description: z.string().optional()
});
var CRTool = class {
  constructor(name, description, parameters, implementation) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.implementation = implementation;
  }
  toOpenAIFormat() {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }
  toAnthropicFormat() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.parameters
    };
  }
  toJSON() {
    return JSON.stringify(this.toOpenAIFormat(), null, 2);
  }
};
function defineTool(name, description, parameters, implementation) {
  if (!name) {
    throw new Error("Tool name is required");
  }
  if (!description) {
    throw new Error("Tool description is required");
  }
  if (!parameters) {
    throw new Error("Tool parameters schema is required");
  }
  if (!implementation) {
    throw new Error("Tool implementation is required");
  }
  return new CRTool(name, description, parameters, implementation);
}

// packages/conversationrelay/src/tools/play-media.ts
var playMediaTool = defineTool(
  "play_media",
  "Play audio file from URL to caller",
  {
    type: "object",
    properties: {
      source: {
        type: "string",
        format: "uri",
        description: "URL of audio file to play (must be accessible to Twilio)"
      },
      loop: {
        type: "number",
        minimum: 0,
        description: "Number of times to loop (0 = 1000 times max, default = 1)"
      },
      interruptible: {
        type: "boolean",
        description: "Allow user to interrupt playback with speech or DTMF"
      },
      preemptible: {
        type: "boolean",
        description: "Allow subsequent messages to preempt this playback"
      }
    },
    required: ["source"]
  },
  (params) => {
    return {
      success: true,
      message: `Playing media: ${params.source}`,
      outgoingMessage: {
        type: "play",
        source: params.source,
        loop: params.loop,
        interruptible: params.interruptible,
        preemptible: params.preemptible
      }
    };
  }
);

// packages/conversationrelay/src/tools/send-digits.ts
var sendDigitsTool = defineTool(
  "send_digits",
  "Send DTMF digits to caller",
  {
    type: "object",
    properties: {
      digits: {
        type: "string",
        pattern: "^[0-9w*#]+$",
        description: "Digits to send (0-9, w=500ms pause, *, #)"
      }
    },
    required: ["digits"]
  },
  (params) => {
    return {
      success: true,
      message: `Sending DTMF: ${params.digits}`,
      outgoingMessage: {
        type: "sendDigits",
        digits: params.digits
      }
    };
  }
);

// packages/conversationrelay/src/tools/switch-language.ts
var switchLanguageTool = defineTool(
  "switch_language",
  "Change TTS or transcription language during call",
  {
    type: "object",
    properties: {
      ttsLanguage: {
        type: "string",
        description: "Language code for text-to-speech (e.g., en-US, es-ES, fr-FR)"
      },
      transcriptionLanguage: {
        type: "string",
        description: "Language code for speech-to-text (e.g., en-US, es-ES, fr-FR)"
      }
    }
  },
  (params) => {
    if (!params.ttsLanguage && !params.transcriptionLanguage) {
      return {
        success: false,
        message: "At least one language must be specified"
      };
    }
    return {
      success: true,
      message: `Switching language: TTS=${params.ttsLanguage || "unchanged"}, STT=${params.transcriptionLanguage || "unchanged"}`,
      outgoingMessage: {
        type: "language",
        ttsLanguage: params.ttsLanguage,
        transcriptionLanguage: params.transcriptionLanguage
      }
    };
  }
);

// packages/conversationrelay/src/tools/end-call.ts
var endCallTool = defineTool(
  "end_call",
  "End the call with optional handoff data",
  {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Reason for ending the call"
      },
      handoffData: {
        type: "object",
        description: "Optional handoff metadata (JSON object sent to ConversationRelay callback webhook)"
      }
    },
    required: ["reason"]
  },
  (params) => {
    return {
      success: true,
      message: `Ending call: ${params.reason}`,
      outgoingMessage: {
        type: "end",
        handoffData: params.handoffData ? JSON.stringify(params.handoffData) : void 0
      }
    };
  }
);

// packages/conversationrelay/src/crelay.ts
var ConversationRelay = class _ConversationRelay {
  logger;
  connections;
  sessions;
  tools;
  callbacks;
  constructor(logger2) {
    this.logger = logger2 ?? createLogger2({ name: "conversation-relay" });
    this.connections = /* @__PURE__ */ new Map();
    this.sessions = /* @__PURE__ */ new Map();
    this.callbacks = {};
    this.tools = /* @__PURE__ */ new Map();
    const builtIns = [playMediaTool, sendDigitsTool, switchLanguageTool, endCallTool];
    for (const tool of builtIns) {
      this.tools.set(tool.name, tool);
    }
  }
  // ===========================================================================
  // Callback Registration
  // ===========================================================================
  /** Register callback for session started (setup message received) */
  onSessionStarted(callback) {
    this.callbacks.onSessionStarted = callback;
  }
  /** Register callback for user prompt (transcribed speech from the caller) */
  onPrompt(callback) {
    this.callbacks.onPrompt = callback;
  }
  /** Register callback for user interrupt */
  onInterrupt(callback) {
    this.callbacks.onInterrupt = callback;
  }
  /** Register callback for DTMF input (placeholder) */
  onDtmf(callback) {
    this.callbacks.onDtmf = callback;
  }
  /** Register callback for info events (placeholder) */
  onInfo(callback) {
    this.callbacks.onInfo = callback;
  }
  /** Register callback for session ended (WebSocket closed) */
  onSessionEnded(callback) {
    this.callbacks.onSessionEnded = callback;
  }
  /** Register callback for errors */
  onError(callback) {
    this.callbacks.onError = callback;
  }
  // ===========================================================================
  // Tool Registry
  // ===========================================================================
  /** Register an additional tool. Overwrites any tool with the same name. */
  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }
  /** Unregister a tool by name. */
  unregisterTool(name) {
    this.tools.delete(name);
  }
  /**
   * List all registered tools (built-in protocol tools + user-registered).
   * Feed the results into your LLM via `tool.toOpenAIFormat()` / `toAnthropicFormat()`.
   */
  listTools() {
    return Array.from(this.tools.values());
  }
  /**
   * Execute a registered tool by name. If the tool returns an object with an
   * `outgoingMessage` field (the built-in CR protocol tools), CR validates it
   * against `OutgoingMessageSchema` and ships it via the WebSocket automatically.
   * The tool result is returned so the caller can feed it back to the LLM loop.
   *
   * @throws if the tool is not registered or if an `outgoingMessage` fails schema validation.
   */
  async executeTool(callSid, name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const result = await tool.implementation(args);
    if (result !== null && typeof result === "object" && "outgoingMessage" in result && result.outgoingMessage !== void 0) {
      const candidate = result.outgoingMessage;
      const validated = OutgoingMessageSchema.safeParse(candidate);
      if (!validated.success) {
        this.logger.error(
          { tool: name, errors: validated.error.errors, outgoingMessage: candidate },
          "Tool produced invalid outgoingMessage \u2014 not shipping"
        );
        throw new Error(`Tool '${name}' produced invalid outgoingMessage`);
      }
      this.sendRawMessage(callSid, validated.data);
    }
    return result;
  }
  // ===========================================================================
  // WebSocket Connection Handling
  // ===========================================================================
  /**
   * Handle incoming WebSocket connection from Twilio ConversationRelay.
   * Extracts CallSid from setup message and routes subsequent messages.
   */
  handleConnection(ws) {
    let callSid = null;
    ws.on("message", (data) => {
      try {
        if (!Buffer.isBuffer(data)) {
          this.logger.error(
            {
              data_type: data instanceof ArrayBuffer ? "ArrayBuffer" : "Buffer[]",
              call_sid: callSid
            },
            "Unexpected WebSocket data type - expected Buffer from ConversationRelay"
          );
          return;
        }
        const messageText = data.toString();
        const messageData = JSON.parse(messageText);
        this.logger.debug({ raw_message: messageData }, "Received ConversationRelay message");
        const validatedMessage = WebSocketMessageSchema.safeParse(messageData);
        if (!validatedMessage.success) {
          this.logger.error(
            { validation_errors: validatedMessage.error.errors, raw_message: messageData },
            "Invalid ConversationRelay message"
          );
          return;
        }
        const message = validatedMessage.data;
        switch (message.type) {
          case "setup": {
            callSid = message.callSid;
            this.connections.set(callSid, ws);
            const session = {
              callSid,
              from: message.from,
              to: message.to,
              startedAt: /* @__PURE__ */ new Date(),
              customParameters: message.customParameters
            };
            this.sessions.set(callSid, session);
            this.callbacks.onSessionStarted?.(callSid, session, message);
            break;
          }
          case "prompt":
            if (callSid) {
              this.callbacks.onPrompt?.(callSid, message.voicePrompt, message);
            }
            break;
          case "interrupt":
            if (callSid) {
              this.callbacks.onInterrupt?.(callSid, message);
            }
            break;
          case "dtmf":
            if (callSid) {
              this.callbacks.onDtmf?.(callSid, message);
            }
            break;
          case "info":
            if (callSid) {
              this.callbacks.onInfo?.(callSid, message);
            }
            break;
          case "error":
            if (callSid) {
              const err = new Error(message.description ?? "ConversationRelay error");
              this.callbacks.onError?.(callSid, err);
            }
            break;
          default:
            this.logger.warn(
              { call_sid: callSid, message: messageData },
              "Unhandled ConversationRelay message type"
            );
            break;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error({ err, call_sid: callSid }, "Error processing ConversationRelay message");
        if (callSid) {
          this.callbacks.onError?.(callSid, err);
        }
      }
    });
    ws.on("close", () => {
      if (callSid) {
        this.connections.delete(callSid);
        this.sessions.delete(callSid);
        this.logger.debug({ call_sid: callSid }, "ConversationRelay WebSocket closed");
        this.callbacks.onSessionEnded?.(callSid);
      }
    });
    ws.on("error", (error) => {
      this.logger.error({ err: error, call_sid: callSid }, "ConversationRelay WebSocket error");
      if (callSid) {
        this.callbacks.onError?.(callSid, error);
      }
    });
  }
  // ===========================================================================
  // Session Access
  // ===========================================================================
  /** Get session for a CallSid */
  getSession(callSid) {
    return this.sessions.get(callSid);
  }
  /** Check if a session exists for a CallSid */
  hasSession(callSid) {
    return this.sessions.has(callSid);
  }
  // ===========================================================================
  // Response Sending
  // ===========================================================================
  /**
   * Send a text response to a call via WebSocket
   */
  sendResponse(callSid, message, last = true) {
    const ws = this.connections.get(callSid);
    if (!ws) {
      throw new Error(`No WebSocket connection found for CallSid: ${callSid}`);
    }
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not open for CallSid: ${callSid} (state: ${ws.readyState})`);
    }
    const textMessage = {
      type: "text",
      token: message,
      last
    };
    ws.send(JSON.stringify(textMessage));
    this.logger.debug({ call_sid: callSid, last }, "Sent text response");
  }
  /**
   * Send a raw message object via WebSocket
   */
  sendMessage(callSid, message) {
    const ws = this.connections.get(callSid);
    if (!ws) {
      throw new Error(`No WebSocket connection found for CallSid: ${callSid}`);
    }
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not open for CallSid: ${callSid} (state: ${ws.readyState})`);
    }
    ws.send(JSON.stringify(message));
    this.logger.debug({ call_sid: callSid, message_type: message.type }, "Sent ConversationRelay message");
  }
  /**
   * Play media from URL to the caller
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#play-message
   */
  sendPlay(callSid, source, options) {
    const message = {
      type: "play",
      source,
      ...options
    };
    this.sendRawMessage(callSid, message);
  }
  /**
   * Send DTMF digits to the caller
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#send-digits-message
   */
  sendDigits(callSid, digits) {
    const message = {
      type: "sendDigits",
      digits
    };
    this.sendRawMessage(callSid, message);
  }
  /**
   * Switch TTS or transcription language mid-call
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#language-message
   */
  switchLanguage(callSid, options) {
    const message = {
      type: "language",
      ...options
    };
    this.sendRawMessage(callSid, message);
  }
  /**
   * End the call with optional handoff data
   * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#end-message
   */
  endCall(callSid, handoffData) {
    const message = {
      type: "end",
      handoffData: handoffData ? JSON.stringify(handoffData) : void 0
    };
    this.sendRawMessage(callSid, message);
  }
  /**
   * Send a raw outgoing message via WebSocket.
   * @private Internal helper for sending any outgoing message type.
   */
  sendRawMessage(callSid, message) {
    const ws = this.connections.get(callSid);
    if (!ws) {
      throw new Error(`No WebSocket connection found for CallSid: ${callSid}`);
    }
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`WebSocket not open for CallSid: ${callSid} (state: ${ws.readyState})`);
    }
    ws.send(JSON.stringify(message));
    this.logger.debug({ call_sid: callSid, message_type: message.type }, "Sent CR message");
  }
  // ===========================================================================
  // TwiML Generation
  // ===========================================================================
  /**
   * Generate TwiML for a ConversationRelay connection.
   *
   * Produces a <Response><Connect><ConversationRelay> TwiML document
   * with optional <Parameter> child elements and <Language> configurations.
   */
  generateTwiML(config, parameters, options) {
    const validationResult = ConversationRelayConfigSchema.safeParse(config);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      throw new Error(`Invalid ConversationRelay configuration: ${errorMessage}`);
    }
    const validatedConfig = validationResult.data;
    if (parameters) {
      const paramsValidation = CustomParametersSchema2.safeParse(parameters);
      if (!paramsValidation.success) {
        const errorMessage = paramsValidation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
        throw new Error(`Invalid custom parameters: ${errorMessage}`);
      }
    }
    const { languages, ...conversationRelayAttributes } = validatedConfig;
    const filteredConfig = _ConversationRelay.filterUnsetValues(conversationRelayAttributes);
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);
    if (languages && languages.length > 0) {
      for (const lang of languages) {
        const filteredLang = _ConversationRelay.filterUnsetValues(lang);
        relay.language(filteredLang);
      }
    }
    if (parameters) {
      for (const [name, value] of Object.entries(parameters)) {
        relay.parameter({ name, value });
      }
    }
    return response.toString();
  }
  // ===========================================================================
  // Connection Management
  // ===========================================================================
  /** Get WebSocket connection for a CallSid */
  getWebSocket(callSid) {
    return this.connections.get(callSid) || null;
  }
  /** Close a specific connection */
  closeConnection(callSid) {
    const ws = this.connections.get(callSid);
    if (ws) {
      ws.close();
      this.connections.delete(callSid);
      this.sessions.delete(callSid);
      this.logger.debug({ call_sid: callSid }, "Closed ConversationRelay connection");
    }
  }
  /** Shutdown — close all connections */
  shutdown() {
    for (const [callSid, ws] of this.connections.entries()) {
      ws.close();
      this.logger.debug({ call_sid: callSid }, "Shutdown: closed ConversationRelay connection");
    }
    this.connections.clear();
    this.sessions.clear();
  }
  // ===========================================================================
  // Private Utilities
  // ===========================================================================
  /**
   * Filter undefined/null values from object for clean TwiML attributes
   */
  static filterUnsetValues(obj) {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, value]) => value !== void 0 && value !== null)
    );
  }
};

// packages/core/src/channels/voice.ts
var VoiceChannel = class {
  config;
  logger;
  conversationClient;
  activeConversations;
  callbacks;
  conversationRelay;
  callSidToConversationId;
  memoryRetriever;
  constructor(deps) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: "channel" });
    this.conversationClient = deps.conversationClient;
    this.memoryRetriever = deps.memoryRetriever;
    this.activeConversations = /* @__PURE__ */ new Map();
    this.callbacks = {};
    this.callSidToConversationId = /* @__PURE__ */ new Map();
    this.conversationRelay = new ConversationRelay(deps.logger.child({ component: "crelay" }));
    this.conversationRelay.onSessionStarted((callSid, _session, data) => {
      this.handleSetupFromRelay(callSid, data);
    });
    this.conversationRelay.onPrompt((callSid, _message, data) => {
      this.handlePromptFromRelay(callSid, data);
    });
    this.conversationRelay.onInterrupt((callSid, data) => {
      this.handleInterruptFromRelay(callSid, data);
    });
    this.conversationRelay.onDtmf((callSid, data) => {
      const conversationId = this.callSidToConversationId.get(callSid);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: "system",
          message: `User pressed ${data.digit}`,
          metadata: { type: "dtmf", digit: data.digit }
        });
      }
    });
    this.conversationRelay.onInfo((callSid, data) => {
      const conversationId = this.callSidToConversationId.get(callSid);
      if (conversationId) {
        this.emitMessage(conversationId, {
          messageType: "system",
          message: JSON.stringify(data.info ?? {}),
          metadata: { type: "info", info: data.info }
        });
      }
    });
    this.conversationRelay.onSessionEnded((callSid) => {
      this.handleCloseFromRelay(callSid);
    });
    this.conversationRelay.onError((callSid, error) => {
      this.handleError(error, { callSid });
    });
    this.logger.info("VoiceChannel initialized with Maestro support");
  }
  get channelType() {
    return "voice";
  }
  // ===========================================================================
  // Unified Message Emission
  // ===========================================================================
  emitMessage(conversationId, msg) {
    const session = this.getConversationSession(conversationId);
    const channelMessage = {
      conversationId,
      messageType: msg.messageType,
      message: msg.message,
      channel: "voice",
      metadata: msg.metadata,
      conversation: session ? {
        profileId: session.profileId,
        memory: msg.memory,
        author: session.authorInfo?.address ?? "unknown",
        serviceId: session.serviceId,
        authorInfo: session.authorInfo ? { address: session.authorInfo.address } : void 0,
        startedAt: session.startedAt
      } : void 0
    };
    if (this.callbacks.onMessage) {
      void Promise.resolve(this.callbacks.onMessage(channelMessage)).catch((err) => {
        this.logger.error({ err, conversation_id: conversationId }, "Error in message callback");
      });
    }
  }
  // ===========================================================================
  // ConversationRelay → VoiceChannel Bridge
  // ===========================================================================
  handleSetupFromRelay(_callSid, data) {
    const conversationId = this.handleSetupMessage(data);
    this.emitMessage(conversationId, {
      messageType: "system",
      message: `Call details: from ${data.from}, to ${data.to}, callSid ${data.callSid}`,
      metadata: {
        type: "setup",
        callSid: data.callSid,
        from: data.from,
        to: data.to,
        direction: data.direction
      }
    });
  }
  handlePromptFromRelay(callSid, data) {
    const conversationId = this.callSidToConversationId.get(callSid);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, "No conversation found for CallSid in prompt");
      return;
    }
    void this.handlePromptMessage(conversationId, data).catch((err) => {
      this.logger.error(
        { err, conversation_id: conversationId },
        "Failed to handle prompt message"
      );
    });
  }
  handleInterruptFromRelay(callSid, data) {
    const conversationId = this.callSidToConversationId.get(callSid);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, "No conversation found for CallSid in interrupt");
      return;
    }
    const parts = ["User interrupted"];
    if (data.durationUntilInterruptMs !== void 0) {
      parts.push(`after ${data.durationUntilInterruptMs}ms`);
    }
    if (data.utteranceUntilInterrupt) {
      parts.push(`Last heard: '${data.utteranceUntilInterrupt}'`);
    }
    this.emitMessage(conversationId, {
      messageType: "system",
      message: parts.join(". "),
      metadata: {
        type: "interrupt",
        utteranceUntilInterrupt: data.utteranceUntilInterrupt,
        durationUntilInterruptMs: data.durationUntilInterruptMs
      }
    });
  }
  handleCloseFromRelay(callSid) {
    const conversationId = this.callSidToConversationId.get(callSid);
    if (!conversationId) {
      this.logger.warn({ call_sid: callSid }, "No conversation found for CallSid in close");
      return;
    }
    void this.handleWebSocketDisconnect(conversationId).catch((err) => {
      this.logger.error(
        { err, conversation_id: conversationId },
        "WebSocket disconnect handler error"
      );
    });
  }
  // ===========================================================================
  // Message Handlers
  // ===========================================================================
  handleSetupMessage(message) {
    const { callSid, from, customParameters } = message;
    let conversationId;
    let profileId;
    if (customParameters?.conversation_id && typeof customParameters.conversation_id === "string" && isConversationId(customParameters.conversation_id)) {
      conversationId = customParameters.conversation_id;
    } else {
      conversationId = callSid;
    }
    if (customParameters?.profile_id && typeof customParameters.profile_id === "string" && isProfileId(customParameters.profile_id)) {
      profileId = customParameters.profile_id;
    }
    this.callSidToConversationId.set(callSid, conversationId);
    const session = this.startConversation(conversationId, profileId);
    session.authorInfo = { address: from };
    return conversationId;
  }
  async handlePromptMessage(conversationId, message) {
    const transcript = message.voicePrompt;
    const session = this.getConversationSession(conversationId);
    let userMemory;
    if (session) {
      try {
        userMemory = await this.memoryRetriever(session, transcript);
        this.logger.debug({ conversation_id: conversationId }, "Retrieved memory for voice prompt");
      } catch (error) {
        this.logger.warn(
          { err: error, conversation_id: conversationId },
          "Failed to retrieve memory for voice prompt"
        );
      }
    }
    this.emitMessage(conversationId, {
      messageType: "user",
      message: transcript,
      metadata: { type: "prompt", lang: message.lang, last: message.last },
      memory: userMemory
    });
  }
  async handleWebSocketDisconnect(conversationId) {
    for (const [callSid, cId] of this.callSidToConversationId.entries()) {
      if (cId === conversationId) {
        this.callSidToConversationId.delete(callSid);
        break;
      }
    }
    await this.endConversation(conversationId);
  }
  // ===========================================================================
  // Channel Interface
  // ===========================================================================
  getWebsocket(conversationId) {
    for (const [callSid, convId] of this.callSidToConversationId.entries()) {
      if (convId === conversationId) {
        return this.conversationRelay.getWebSocket(callSid);
      }
    }
    return null;
  }
  // Wrapping sync code in async to honor Channel interface's Promise<void> contract
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendResponse(conversationId, message, metadata) {
    try {
      let callSid;
      for (const [cSid, cId] of this.callSidToConversationId.entries()) {
        if (cId === conversationId) {
          callSid = cSid;
          break;
        }
      }
      if (!callSid) {
        throw new Error(`No CallSid found for conversation ${conversationId}`);
      }
      const last = metadata?.last === void 0 ? true : metadata.last;
      this.conversationRelay.sendResponse(callSid, message, last);
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata
      });
      throw error;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic event callback needs to accept any args
  on(event, callback) {
    switch (event) {
      case "message":
        this.callbacks.onMessage = callback;
        break;
      case "conversationStarted":
        this.callbacks.onConversationStarted = callback;
        break;
      case "conversationEnded":
        this.callbacks.onConversationEnded = callback;
        break;
      case "error":
        this.callbacks.onError = callback;
        break;
    }
  }
  getConversationSession(conversationId) {
    return this.activeConversations.get(conversationId);
  }
  isConversationActive(conversationId) {
    return this.activeConversations.has(conversationId);
  }
  shutdown() {
    this.conversationRelay.shutdown();
    this.callSidToConversationId.clear();
    this.activeConversations.clear();
    delete this.callbacks.onConversationStarted;
    delete this.callbacks.onConversationEnded;
    delete this.callbacks.onError;
    delete this.callbacks.onMessage;
  }
  handleWebSocketConnection(ws) {
    this.conversationRelay.handleConnection(ws);
  }
  // ===========================================================================
  // Tool Registry (delegated to embedded ConversationRelay)
  // ===========================================================================
  /**
   * List tools registered on this channel (for LLM discovery).
   * Includes CR built-in protocol tools (playMedia, sendDigits, switchLanguage, endCall)
   * plus any user-registered tools.
   */
  listTools() {
    return this.conversationRelay.listTools();
  }
  /**
   * Register a tool on this channel. Overwrites any tool with the same name.
   */
  registerTool(tool) {
    this.conversationRelay.registerTool(tool);
  }
  /**
   * Execute a registered tool by name.
   *
   * If the tool returns an `outgoingMessage` (CR protocol tool), it is validated
   * and auto-shipped via the ConversationRelay WebSocket. The tool's result is
   * returned unchanged for the caller to feed back to the LLM loop.
   */
  async executeTool(conversationId, name, args) {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    return this.conversationRelay.executeTool(callSid, name, args);
  }
  /**
   * Send DTMF digits to the caller.
   * @throws if no active CallSid is mapped to the conversationId
   */
  sendDigits(conversationId, digits) {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    this.conversationRelay.sendDigits(callSid, digits);
  }
  /**
   * Play media from a URL to the caller.
   * @throws if no active CallSid is mapped to the conversationId
   */
  sendPlay(conversationId, source, options) {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    this.conversationRelay.sendPlay(callSid, source, options);
  }
  /**
   * End the call with optional handoff data.
   * @throws if no active CallSid is mapped to the conversationId
   */
  endCall(conversationId, handoffData) {
    const callSid = this.findCallSid(conversationId);
    if (!callSid) {
      throw new Error(`No CallSid found for conversation ${conversationId}`);
    }
    this.conversationRelay.endCall(callSid, handoffData);
  }
  findCallSid(conversationId) {
    for (const [callSid, convId] of this.callSidToConversationId.entries()) {
      if (convId === conversationId) {
        return callSid;
      }
    }
    return void 0;
  }
  // ===========================================================================
  // Session Management
  // ===========================================================================
  startConversation(conversationId, profileId, serviceId) {
    if (this.activeConversations.has(conversationId)) {
      this.logger.debug({ conversation_id: conversationId }, "Conversation already active");
      return this.activeConversations.get(conversationId);
    }
    const session = {
      conversationId,
      channel: this.channelType,
      startedAt: /* @__PURE__ */ new Date(),
      metadata: {},
      profileId,
      serviceId
    };
    this.activeConversations.set(conversationId, session);
    this.logger.debug(
      { conversation_id: conversationId, profile_id: profileId },
      "Conversation started"
    );
    this.callbacks.onConversationStarted?.({ session });
    return session;
  }
  async endConversation(conversationId) {
    const session = this.activeConversations.get(conversationId);
    if (session) {
      if (this.callbacks.onConversationEnded) {
        try {
          await this.callbacks.onConversationEnded({ session });
        } catch (error) {
          this.logger.error(
            { err: error, conversation_id: conversationId },
            "Error in conversation ended callback"
          );
        }
      }
      this.activeConversations.delete(conversationId);
      this.logger.debug({ conversation_id: conversationId }, "Conversation ended");
    }
  }
  handleError(error, context) {
    this.logger.error({ err: error, ...context }, "Channel error");
    if (this.callbacks.onError) {
      if (context) {
        this.callbacks.onError({ error, context });
      } else {
        this.callbacks.onError({ error });
      }
    }
  }
  // ===========================================================================
  // Incoming Call Handling — Maestro Only
  // ===========================================================================
  async handleIncomingCall(options) {
    const { toNumber, fromNumber, callSid, actionUrl, conversationRelayConfig } = options;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replaceAll(/[-:.]/g, "").slice(0, 15) + "Z";
    const conversationName = `tac-voice-${fromNumber}-${timestamp}`;
    const conversation = await this.conversationClient.createConversation(conversationName);
    if (!isConversationId(conversation.id)) {
      throw new Error(
        `Invalid conversation ID returned from Conversation Service: ${conversation.id}. Expected format: conv_conversation_[0-9a-z]{26}. This indicates an issue with the Conversations API.`
      );
    }
    const conversationId = conversation.id;
    this.logger.debug(
      { conversation_id: conversationId, call_sid: callSid },
      "Created Maestro conversation for voice call"
    );
    const customerParticipant = await this.conversationClient.addOrFetchParticipant(
      conversationId,
      [{ channel: "VOICE", address: fromNumber, channelId: callSid }],
      "CUSTOMER"
    );
    const profileId = customerParticipant.profileId || "";
    const customerParticipantId = customerParticipant.id;
    const aiAgentParticipant = await this.conversationClient.addOrFetchParticipant(
      conversationId,
      [{ channel: "VOICE", address: toNumber, channelId: callSid }],
      "AI_AGENT"
    );
    const aiAgentParticipantId = aiAgentParticipant.id;
    return this.conversationRelay.generateTwiML(
      conversationRelayConfig,
      {
        conversation_id: conversationId,
        profile_id: profileId,
        customer_participant_id: customerParticipantId,
        ai_agent_participant_id: aiAgentParticipantId
      },
      actionUrl ? { actionUrl } : void 0
    );
  }
  // ===========================================================================
  // ConversationRelay Callback Handling
  // ===========================================================================
  async handleConversationRelayCallback(payload, handoffHandler) {
    this.logger.debug(
      { call_sid: payload.CallSid, call_status: payload.CallStatus },
      "ConversationRelay callback received"
    );
    if (payload.CallStatus === "in-progress" && payload.HandoffData) {
      if (handoffHandler) {
        try {
          const response = await handoffHandler(payload);
          return { status: 200, content: response, contentType: "application/xml" };
        } catch (error) {
          this.logger.error({ err: error }, "Handoff handler failed");
          return { status: 500, content: "Handoff handler error", contentType: "text/plain" };
        }
      }
      return { status: 501, content: "No handoff handler registered", contentType: "text/plain" };
    }
    if (payload.CallStatus === "completed") {
      await this.closeConversationsForCall(payload.CallSid);
    }
    return { status: 200, content: "OK", contentType: "text/plain" };
  }
  async closeConversationsForCall(callSid) {
    try {
      const conversations = await this.conversationClient.listConversations({ channelId: callSid });
      this.logger.info(
        { call_sid: callSid, count: conversations.length },
        "Closing conversations for completed call"
      );
      for (const conversation of conversations) {
        if (!isConversationId(conversation.id)) {
          this.logger.warn(
            { conversation_id: conversation.id, call_sid: callSid },
            "Invalid conversation ID format from Conversation Service. Skipping conversation close."
          );
          continue;
        }
        try {
          await this.conversationClient.updateConversation(conversation.id, "CLOSED");
          this.logger.debug({ conversation_id: conversation.id }, "Closed conversation");
        } catch (error) {
          this.logger.error(
            { err: error, conversation_id: conversation.id },
            "Failed to close conversation"
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error, call_sid: callSid }, "Failed to list conversations for call");
    }
  }
};

// packages/core/src/channels/voice-webhook.ts
var VoiceWebhookChannel = class extends MessagingChannel {
  agentAddress;
  constructor(deps, config) {
    super(deps, config);
    this.agentAddress = config?.agentAddress ?? this.config.phoneNumber;
  }
  get channelType() {
    return "voice";
  }
  /**
   * Check if a message is from the bot itself (by agent address/phone number)
   */
  isOwnMessage(authorAddress) {
    return authorAddress === this.agentAddress;
  }
  /**
   * Send voice response using Maestro Send API.
   *
   * The Send API records the communication in Maestro.
   * The customer's own CR server is responsible for actual TTS playback.
   * channelId (CallSid) is required for VOICE participants.
   */
  async sendResponse(conversationId, message, metadata) {
    this.logger.debug(
      {
        conversation_id: conversationId,
        message_length: message.length,
        operation: "send_response"
      },
      "Sending voice response via Maestro Send API"
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
      const channelId = typeof session.metadata?.channelId === "string" ? session.metadata.channelId : void 0;
      if (!channelId) {
        throw new Error(
          `No channelId (CallSid) found in session metadata for conversation ${conversationId}`
        );
      }
      const recipientAddress = session.authorInfo.address;
      const participants = await this.conversationClient.listParticipants(conversationId);
      const voiceParticipants = participants.filter(
        (p) => Array.isArray(p.addresses) && p.addresses.some((addr) => addr.channel === "VOICE" && addr.address === this.agentAddress)
      );
      const agentParticipant = voiceParticipants.find((p) => p.type === "AI_AGENT" || p.type === "HUMAN_AGENT") ?? voiceParticipants[0];
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
          channel_id: channelId
        },
        "Sending voice message via Send API"
      );
      await this.conversationClient.sendCommunication(conversationId, {
        author: {
          address: this.agentAddress,
          channel: "VOICE",
          participantId: agentParticipant.id
        },
        recipients: [
          {
            address: recipientAddress,
            channel: "VOICE",
            participantId: session.authorInfo.participantId
          }
        ],
        content: {
          type: "TEXT",
          text: message
        },
        channelId
      });
      this.logger.info(
        { conversation_id: conversationId, channel_id: channelId },
        "Voice response sent successfully via Send API"
      );
    } catch (error) {
      this.logger.error({ err: error, conversation_id: conversationId }, "Send response error");
      this.handleError(error instanceof Error ? error : new Error(String(error)), {
        conversationId,
        message,
        metadata
      });
      throw error;
    }
  }
};
var logger = createLogger({ name: "tac-flex" });
function handleFlexHandoffLogic(formData, flexWorkflowSid) {
  if (!flexWorkflowSid) {
    logger.error("No Flex workflow SID configured");
    return {
      success: false,
      status: 400,
      content: "Invalid handoff data",
      contentType: "text/plain"
    };
  }
  const response = new VoiceResponse();
  const handoffDataRaw = formData["HandoffData"] || "";
  if (handoffDataRaw) {
    let handoffData;
    try {
      handoffData = HandoffDataSchema.parse(JSON.parse(handoffDataRaw));
    } catch (error) {
      logger.error({ err: error }, "Invalid handoff data");
      return {
        success: false,
        status: 400,
        content: "Invalid handoff data",
        contentType: "text/plain"
      };
    }
    const enqueue = response.enqueue({
      workflowSid: flexWorkflowSid
    });
    enqueue.task(
      {
        priority: 5
      },
      JSON.stringify(handoffData)
    );
    logger.debug(
      { workflow_sid: flexWorkflowSid, handoff_data: handoffData },
      "Generated Flex handoff TwiML"
    );
    return {
      success: true,
      status: 200,
      content: response.toString(),
      contentType: "application/xml"
    };
  } else {
    if (formData["CallStatus"] === "completed") {
      return {
        success: true,
        status: 200,
        content: "Call Completed",
        contentType: "application/xml"
      };
    } else {
      return {
        success: false,
        status: 400,
        content: "Handoff Data is Missing",
        contentType: "application/xml"
      };
    }
  }
}

// packages/tools/src/lib/builder.ts
var TACTool = class {
  constructor(name, description, parameters, implementation) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.implementation = implementation;
  }
  /**
   * Convert to OpenAI function calling format
   */
  toOpenAIFormat() {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }
  /**
   * Convert to Anthropic tool calling format
   */
  toAnthropicFormat() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.parameters
    };
  }
  /**
   * Convert to JSON string (OpenAI format by default)
   */
  toJSON() {
    return JSON.stringify(this.toOpenAIFormat(), null, 2);
  }
};
function defineTool2(name, description, parameters, implementation) {
  if (!name) {
    throw new Error("Tool name is required");
  }
  if (!description) {
    throw new Error("Tool description is required");
  }
  if (!parameters) {
    throw new Error("Tool parameters schema is required");
  }
  if (!implementation) {
    throw new Error("Tool implementation is required");
  }
  return new TACTool(name, description, parameters, implementation);
}

// packages/tools/src/built-in/memory.ts
function createMemoryRetrievalTool(memoryClient, memoryStoreId, profileId) {
  return defineTool2(
    BuiltInTools.RETRIEVE_MEMORY,
    "Retrieve user memories including observations, summaries, and conversation history",
    {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional semantic search query to filter memories"
        },
        start_date: {
          type: "string",
          description: "Optional start date for filtering memories (ISO 8601 format)"
        },
        end_date: {
          type: "string",
          description: "Optional end date for filtering memories (ISO 8601 format)"
        },
        observation_limit: {
          type: "number",
          description: "Maximum number of observations to retrieve (default: 10)"
        },
        summary_limit: {
          type: "number",
          description: "Maximum number of summaries to retrieve (default: 5)"
        },
        session_limit: {
          type: "number",
          description: "Maximum number of sessions to retrieve (default: 3)"
        }
      },
      required: [],
      // No required parameters
      description: "Retrieve memories for the current user"
    },
    async (params) => {
      if (!profileId) {
        throw new Error("No profile ID available for memory retrieval");
      }
      const request = {
        query: params.query,
        start_date: params.start_date,
        end_date: params.end_date,
        observation_limit: params.observation_limit ?? 10,
        summary_limit: params.summary_limit ?? 5,
        session_limit: params.session_limit ?? 3
      };
      return memoryClient.retrieveMemories(memoryStoreId, profileId, request);
    }
  );
}
function createMemoryTools(memoryClient, memoryStoreId) {
  return {
    /**
     * Create memory tool for specific profile
     */
    forProfile: (profileId) => createMemoryRetrievalTool(memoryClient, memoryStoreId, profileId),
    /**
     * Create memory tool for current session
     */
    forSession: (profileId) => createMemoryRetrievalTool(memoryClient, memoryStoreId, profileId)
  };
}

// packages/tools/src/built-in/messaging.ts
function createSendMessageTool(channel, conversationId) {
  return defineTool2(
    BuiltInTools.SEND_MESSAGE,
    "Send a message to the user in the current conversation",
    {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message content to send to the user"
        },
        metadata: {
          type: "object",
          description: "Optional metadata to include with the message"
        }
      },
      required: ["message"],
      description: "Send a message to the user"
    },
    async (params) => {
      try {
        await channel.sendResponse(conversationId, params.message, params.metadata);
        return {
          success: true,
          message_id: `msg_${Date.now()}`
          // Simple ID generation
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
}
function createMessagingTools() {
  return {
    /**
     * Create send message tool for specific channel and session
     *
     * @param channel - The channel to send messages through
     * @param conversationId - The conversation ID
     */
    forSession: (channel, conversationId) => createSendMessageTool(channel, conversationId)
  };
}

// packages/tools/src/built-in/handoff.ts
function createHandoffTool(tac, conversationId) {
  return defineTool2(
    BuiltInTools.ESCALATE_TO_HUMAN,
    "Escalate the conversation to a human agent when the AI cannot help further",
    {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "The reason for escalating to a human agent"
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "The urgency level of the handoff (default: medium)"
        },
        context: {
          type: "string",
          description: "Additional context to provide to the human agent"
        },
        metadata: {
          type: "object",
          description: "Optional metadata for the handoff"
        }
      },
      required: ["reason"],
      description: "Escalate to human agent"
    },
    async (params) => {
      try {
        let fullReason = params.reason;
        if (params.context) {
          fullReason += `

Additional Context: ${params.context}`;
        }
        if (params.urgency) {
          fullReason += `

Urgency: ${params.urgency}`;
        }
        await tac.triggerHandoff(conversationId, fullReason);
        return {
          success: true,
          handoff_id: `handoff_${Date.now()}`,
          estimated_wait_time: getEstimatedWaitTime(params.urgency ?? "medium")
        };
      } catch (error) {
        return {
          success: false,
          handoff_id: `failed_${Date.now()}`,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
}
function getEstimatedWaitTime(urgency) {
  switch (urgency) {
    case "high":
      return "< 2 minutes";
    case "medium":
      return "2-5 minutes";
    case "low":
      return "5-10 minutes";
    default:
      return "2-5 minutes";
  }
}
function createHandoffTools() {
  return {
    /**
     * Create handoff tool for specific TAC instance and session
     *
     * @param tac - The TAC instance
     * @param conversationId - The conversation ID
     */
    forSession: (tac, conversationId) => createHandoffTool(tac, conversationId)
  };
}

// packages/tools/src/built-in/knowledge.ts
function createKnowledgeSearchTool(knowledgeClient, knowledgeBaseId, config) {
  const topK = config.topK ?? 5;
  return defineTool2(
    config.name,
    config.description,
    {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant knowledge"
        }
      },
      required: ["query"],
      description: config.description
    },
    async (params) => {
      return knowledgeClient.searchKnowledgeBase(knowledgeBaseId, params.query, topK);
    }
  );
}
async function createKnowledgeSearchToolAsync(knowledgeClient, knowledgeBaseId, config) {
  let name = config?.name;
  let description = config?.description;
  if (!name || !description) {
    const kb = await knowledgeClient.getKnowledgeBase(knowledgeBaseId);
    if (!name) {
      const normalized = kb.displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
      name = normalized ? `search_${normalized}` : "search_knowledge_base";
    }
    if (!description) {
      description = kb.description || `Search the ${kb.displayName} knowledge base`;
    }
  }
  const toolConfig = {
    name,
    description
  };
  if (config?.topK !== void 0) {
    toolConfig.topK = config.topK;
  }
  return createKnowledgeSearchTool(knowledgeClient, knowledgeBaseId, toolConfig);
}
function createKnowledgeTools(knowledgeClient) {
  return {
    /**
     * Create knowledge search tool with explicit config
     */
    forKnowledgeBase: (knowledgeBaseId, config) => createKnowledgeSearchTool(knowledgeClient, knowledgeBaseId, config),
    /**
     * Create knowledge search tool with auto-fetched metadata
     */
    forKnowledgeBaseAsync: (knowledgeBaseId, config) => createKnowledgeSearchToolAsync(knowledgeClient, knowledgeBaseId, config)
  };
}
var DEFAULT_CONFIG = {
  voice: {
    host: "0.0.0.0",
    port: 3e3
  },
  webhookPaths: {
    messaging: "/webhook",
    twiml: "/twiml",
    ws: "/ws",
    conversationRelayCallback: "/conversation-relay-callback"
  },
  conversationRelayConfig: {
    welcomeGreeting: "Hello! Set up your welcome greeting in the server config."
  },
  development: false,
  validateWebhooks: true
};
var TACServer = class {
  fastify;
  tac;
  config;
  /** All enabled messaging channels — webhooks are fanned out to each one */
  messagingChannels;
  /** Voice channel instance */
  voiceChannel;
  constructor(tac, config = {}) {
    this.tac = tac;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // Deep merge webhookPaths to preserve defaults while allowing overrides
      webhookPaths: {
        ...DEFAULT_CONFIG.webhookPaths,
        ...config.webhookPaths
      },
      // Deep merge conversationRelayConfig to preserve defaults while allowing overrides
      conversationRelayConfig: {
        ...DEFAULT_CONFIG.conversationRelayConfig,
        ...config.conversationRelayConfig
      }
    };
    this.voiceChannel = config.voiceChannel ?? tac.getChannel("voice");
    this.messagingChannels = config.messagingChannels ?? [tac.getChannel("sms"), tac.getChannel("chat")].filter((ch) => ch != null);
    if (this.messagingChannels.length === 0) {
      this.tac.logger.warn(
        "TACServer: No messaging channels (SMS/Chat) configured. Messaging webhooks will not be registered. Register a MessagingChannel with tac.registerChannel() before creating TACServer to enable SMS/Chat."
      );
    }
    if (config.fastifyInstance) {
      this.fastify = config.fastifyInstance;
    } else {
      this.fastify = Fastify2({
        logger: this.config.development ? {
          level: process.env.TWILIO_LOG_LEVEL || "info",
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true
            }
          }
        } : {
          level: process.env.TWILIO_LOG_LEVEL || "info"
        },
        ...config.fastify
      });
    }
  }
  /**
   * Get the full URL for webhook validation
   * Handles X-Forwarded-* headers for proxy/ngrok scenarios
   */
  getWebhookUrl(request) {
    const proto = request.headers["x-forwarded-proto"] || "https";
    const host = request.headers["x-forwarded-host"] || request.headers.host || "";
    return `${proto}://${host}${request.url}`;
  }
  /**
   * Register global Twilio webhook signature validation hook
   */
  registerWebhookValidation() {
    if (!this.config.validateWebhooks) {
      return;
    }
    this.fastify.addHook("preHandler", async (request, reply) => {
      if (request.method === "GET") {
        return;
      }
      const signature = request.headers["x-twilio-signature"];
      const url = this.getWebhookUrl(request);
      const authToken = this.tac.getConfig().authToken;
      let isValid;
      if (request.url.includes("bodySHA256=")) {
        const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
        isValid = twilio2.validateRequestWithBody(authToken, signature, url, body);
      } else {
        const params = request.body || {};
        isValid = twilio2.validateRequest(authToken, signature, url, params);
      }
      if (!isValid) {
        this.fastify.log.warn(
          { url, hasSignature: !!signature },
          "Invalid Twilio webhook signature"
        );
        return reply.code(403).send({ error: "Invalid webhook signature" });
      }
    });
  }
  /**
   * Setup routes — registers all routes for conversation mode (voice + messaging + optional cintel).
   */
  async setupRoutes() {
    this.fastify.post(
      this.config.webhookPaths.twiml || "/twiml",
      async (request, reply) => {
        try {
          const formData = request.body;
          const callSid = formData["CallSid"] || "";
          const fromNumber = formData["From"] || "";
          const toNumber = formData["To"] || "";
          const protocol = request.headers["x-forwarded-proto"] || "http";
          const host = request.headers.host;
          const websocketUrl = `${protocol === "https" ? "wss" : "ws"}://${host}${this.config.webhookPaths.ws || "/ws"}`;
          const callbackUrl = `${protocol}://${host}${this.config.webhookPaths.conversationRelayCallback || "/conversation-relay-callback"}`;
          if (!this.voiceChannel) {
            await reply.code(500).send({ error: "Voice channel not available" });
            return;
          }
          const twiml = await this.voiceChannel.handleIncomingCall({
            toNumber,
            fromNumber,
            callSid,
            actionUrl: callbackUrl,
            conversationRelayConfig: {
              url: websocketUrl,
              ...this.config.conversationRelayConfig
            }
          });
          await reply.type("application/xml").send(twiml);
        } catch (error) {
          this.fastify.log.error(
            "TwiML generation error: " + (error instanceof Error ? error.message : String(error))
          );
          await reply.code(500).send({
            error: "Internal server error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    );
    this.fastify.post(
      this.config.webhookPaths.conversationRelayCallback || "/conversation-relay-callback",
      async (request, reply) => {
        try {
          if (!this.voiceChannel) {
            await reply.code(500).send({ error: "Voice channel not available" });
            return;
          }
          const formData = request.body;
          const parseResult = ConversationRelayCallbackPayloadSchema.safeParse(formData);
          if (!parseResult.success) {
            this.fastify.log.error(
              { errors: parseResult.error.errors },
              "Invalid ConversationRelay callback payload"
            );
            await reply.code(400).send({ error: "Invalid payload" });
            return;
          }
          const result = await this.voiceChannel.handleConversationRelayCallback(
            parseResult.data,
            this.config.handoffHandler
          );
          await reply.code(result.status).type(result.contentType).send(result.content);
        } catch (error) {
          this.fastify.log.error(
            "ConversationRelay callback error: " + (error instanceof Error ? error.message : String(error))
          );
          await reply.code(500).send({ error: "Internal server error" });
        }
      }
    );
    await this.fastify.register((fastify) => {
      fastify.get(
        this.config.webhookPaths.ws || "/ws",
        { websocket: true },
        (socket) => {
          if (this.voiceChannel) {
            this.voiceChannel.handleWebSocketConnection(socket);
          } else {
            socket.terminate();
          }
        }
      );
    });
    if (this.messagingChannels.length > 0) {
      this.fastify.post(
        this.config.webhookPaths.messaging || "/webhook",
        async (request, reply) => {
          const rawHeader = request.headers["i-twilio-idempotency-token"];
          const idempotencyToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
          for (const channel of this.messagingChannels) {
            channel.processWebhook(request.body, idempotencyToken).catch((err) => {
              this.fastify.log.error(
                { err, channel: channel.channelType },
                "Messaging webhook processing error"
              );
            });
          }
          await reply.code(200).send({ status: "ok" });
        }
      );
    }
    if (this.config.webhookPaths.cintel) {
      this.fastify.post(
        this.config.webhookPaths.cintel,
        async (request, reply) => {
          if (!this.tac.isCintelEnabled()) {
            await reply.code(400).send({
              error: "Conversation Intelligence is not enabled",
              message: "Set TWILIO_TAC_CI_CONFIGURATION_ID and memory credentials to enable CI processing"
            });
            return;
          }
          try {
            this.fastify.log.info("Processing Conversation Intelligence webhook");
            const result = await this.tac.processCintelEvent(request.body);
            if (result.success) {
              if (result.skipped) {
                this.fastify.log.debug({ reason: result.skipReason }, "CI event skipped");
              } else {
                this.fastify.log.info(
                  { eventType: result.eventType, createdCount: result.createdCount },
                  "CI event processed"
                );
              }
            } else {
              this.fastify.log.error({ error: result.error }, "CI event processing failed");
            }
            await reply.send(result);
          } catch (error) {
            this.fastify.log.error(
              "CI webhook error: " + (error instanceof Error ? error.message : String(error))
            );
            await reply.code(500).send({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      );
    }
  }
  /**
   * Start the server
   */
  async start() {
    try {
      if (!this.fastify.hasContentTypeParser("application/x-www-form-urlencoded")) {
        await this.fastify.register(formbody2);
      }
      if (!this.fastify.hasDecorator("websocketServer")) {
        await this.fastify.register(websocket2);
      }
      if (!this.fastify.hasDecorator("gracefulShutdown")) {
        await this.fastify.register(gracefulShutdown2);
      }
      this.registerWebhookValidation();
      await this.setupRoutes();
      this.fastify.gracefulShutdown(async (signal) => {
        this.fastify.log.info({ signal }, "Received shutdown signal");
        this.tac.shutdown();
        await this.waitForWebSocketsToClose();
      });
      const voiceConfig = VoiceServerConfigSchema.parse(this.config.voice);
      await this.fastify.listen({
        host: voiceConfig.host,
        port: voiceConfig.port
      });
      const address = this.fastify.server.address();
      const boundPort = typeof address === "object" && address ? address.port : voiceConfig.port;
      this.fastify.log.info(
        {
          host: voiceConfig.host,
          port: boundPort,
          twiml_webhook: this.config.webhookPaths.twiml,
          ws_websocket: this.config.webhookPaths.ws,
          conversation_relay_callback: this.config.webhookPaths.conversationRelayCallback,
          messaging_webhook: this.config.webhookPaths.messaging,
          ...this.config.webhookPaths.cintel && {
            cintel_webhook: this.config.webhookPaths.cintel
          },
          webhook_validation: this.config.validateWebhooks ? "enabled" : "disabled"
        },
        "TAC Server started"
      );
      if (!this.config.validateWebhooks) {
        this.fastify.log.warn(
          "Webhook signature validation is DISABLED. Enable in production for security."
        );
      }
    } catch (error) {
      this.fastify.log.error({ err: error }, "Failed to start TAC Server");
      throw error;
    }
  }
  /**
   * Wait for all WebSocket connections to close
   */
  async waitForWebSocketsToClose(timeoutMs = 3e4) {
    const wsServer = this.fastify.websocketServer;
    if (!wsServer || wsServer.clients.size === 0) {
      return;
    }
    this.fastify.log.info(
      { websocket_count: wsServer.clients.size },
      "Waiting for WebSocket connections to close..."
    );
    const startTime = Date.now();
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const clientCount = wsServer.clients.size;
        if (clientCount === 0) {
          clearInterval(checkInterval);
          this.fastify.log.info("All WebSocket connections closed");
          resolve();
          return;
        }
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(checkInterval);
          this.fastify.log.warn(
            { remaining_websockets: clientCount },
            "Timeout waiting for WebSockets to close, proceeding with shutdown"
          );
          resolve();
          return;
        }
        this.fastify.log.info(
          { remaining_websockets: clientCount },
          "Waiting for WebSockets to close..."
        );
      }, 5e3);
    });
  }
  /**
   * Stop the server gracefully
   */
  async stop() {
    try {
      await this.fastify.close();
      this.fastify.log.info("TAC Server stopped");
    } catch (error) {
      this.fastify.log.error({ err: error }, "Error stopping TAC Server");
      throw error;
    }
  }
};

export { AuthorInfoSchema, BaseClient, BuiltInTools, CaptureRuleSchema, ChannelSettingsSchema, ChannelTypeSchema, ChatChannel, CintelParticipantSchema, CommunicationContentSchema, CommunicationParticipantSchema, CommunicationSchema, ConversationAddressSchema, ConversationClient, ConversationConfigurationSchema, ConversationGroupingTypeSchema, ConversationIntelligenceConfigSchema, ConversationParticipantSchema, ConversationResponseSchema, ConversationSessionSchema, ConversationSummaryItemSchema, CreateConversationSummariesResponseSchema, CreateObservationResponseSchema, EMPTY_MEMORY_RESPONSE, EnvironmentVariables, ExecutionDetailsSchema, IntelligenceConfigurationSchema, JSONSchemaSchema, KnowledgeBaseSchema, KnowledgeBaseStatusSchema, KnowledgeChunkResultSchema, KnowledgeClient, KnowledgeSearchResponseSchema, ListCommunicationsResponseSchema, ListConversationsResponseSchema, ListParticipantsResponseSchema, MemoryChannelTypeSchema, MemoryClient, MemoryCommunicationContentSchema, MemoryCommunicationSchema, MemoryDeliveryStatusSchema, MemoryParticipantSchema, MemoryParticipantTypeSchema, MemoryRetrievalRequestSchema, MemoryRetrievalResponseSchema, MessageDirectionSchema, MessagingChannel, ObservationInfoSchema, OpenAIToolSchema, OperatorProcessingResultSchema, OperatorResultEventSchema, OperatorResultProcessor, OperatorResultSchema, OperatorSchema, ParticipantAddressSchema, ParticipantAddressTypeSchema, ProfileLookupResponseSchema, ProfileResponseSchema, SMSChannel, SendCommunicationParticipantAddressSchema, SendCommunicationRequestSchema, SendCommunicationResponseSchema, SessionInfoSchema, SessionMessageSchema, StatusCallbackSchema, StatusTimeoutsSchema, SummaryInfoSchema, TAC, TACChannelTypeSchema, TACCommunicationAuthorSchema, TACCommunicationContentSchema, TACCommunicationSchema, TACConfig, TACConfigSchema, TACCustomParametersSchema, TACDeliveryStatusSchema, TACMemoryResponse, TACParticipantTypeSchema, TACServer, TACTool, ToolExecutionResultSchema, TranscriptionSchema, TranscriptionWordSchema, VoiceChannel, VoiceServerConfigSchema, VoiceWebhookChannel, createHandoffTool, createHandoffTools, createKnowledgeSearchTool, createKnowledgeSearchToolAsync, createKnowledgeTools, createLogger, createMemoryRetrievalTool, createMemoryTools, createMessagingTools, createSendMessageTool, defineTool2 as defineTool, handleFlexHandoffLogic, isConversationId, isKnowledgeBaseId, isKnowledgeId, isMemoryStoreId, isParticipantId, isProfileId };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map