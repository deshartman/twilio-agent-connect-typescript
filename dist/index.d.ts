import { z } from 'zod';
export { z } from 'zod';
import pino from 'pino';
import { AxiosInstance } from 'axios';
import { WebSocket } from 'ws';
import { FastifyInstance, FastifyServerOptions } from 'fastify';

/**
 * Channel types supported by the framework
 */
declare const ChannelTypeSchema: z.ZodEnum<["sms", "voice", "chat"]>;
type ChannelType = z.infer<typeof ChannelTypeSchema>;
/**
 * TAC configuration schema
 */
declare const TACConfigSchema: z.ZodObject<{
    accountSid: z.ZodString;
    authToken: z.ZodString;
    apiKey: z.ZodString;
    apiSecret: z.ZodString;
    phoneNumber: z.ZodString;
    memoryStoreId: z.ZodOptional<z.ZodString>;
    traitGroups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    conversationConfigurationId: z.ZodString;
    voicePublicDomain: z.ZodOptional<z.ZodString>;
    cintelConfigurationId: z.ZodOptional<z.ZodString>;
    cintelObservationOperatorSid: z.ZodOptional<z.ZodString>;
    cintelSummaryOperatorSid: z.ZodOptional<z.ZodString>;
    region: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    accountSid: string;
    authToken: string;
    apiKey: string;
    apiSecret: string;
    phoneNumber: string;
    conversationConfigurationId: string;
    memoryStoreId?: string | undefined;
    traitGroups?: string[] | undefined;
    voicePublicDomain?: string | undefined;
    cintelConfigurationId?: string | undefined;
    cintelObservationOperatorSid?: string | undefined;
    cintelSummaryOperatorSid?: string | undefined;
    region?: string | undefined;
}, {
    accountSid: string;
    authToken: string;
    apiKey: string;
    apiSecret: string;
    phoneNumber: string;
    conversationConfigurationId: string;
    memoryStoreId?: string | undefined;
    traitGroups?: string[] | undefined;
    voicePublicDomain?: string | undefined;
    cintelConfigurationId?: string | undefined;
    cintelObservationOperatorSid?: string | undefined;
    cintelSummaryOperatorSid?: string | undefined;
    region?: string | undefined;
}>;
type TACConfigData = z.infer<typeof TACConfigSchema>;
/**
 * Environment variable mapping for configuration
 */
declare const EnvironmentVariables: {
    readonly TWILIO_ACCOUNT_SID: "TWILIO_ACCOUNT_SID";
    readonly TWILIO_AUTH_TOKEN: "TWILIO_AUTH_TOKEN";
    readonly TWILIO_API_KEY: "TWILIO_API_KEY";
    readonly TWILIO_API_SECRET: "TWILIO_API_SECRET";
    readonly TWILIO_PHONE_NUMBER: "TWILIO_PHONE_NUMBER";
    readonly MEMORY_STORE_ID: "MEMORY_STORE_ID";
    readonly TRAIT_GROUPS: "TRAIT_GROUPS";
    readonly TWILIO_CONVERSATION_CONFIGURATION_ID: "TWILIO_CONVERSATION_CONFIGURATION_ID";
    readonly VOICE_PUBLIC_DOMAIN: "VOICE_PUBLIC_DOMAIN";
    readonly TWILIO_TAC_CI_CONFIGURATION_ID: "TWILIO_TAC_CI_CONFIGURATION_ID";
    readonly TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID: "TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID";
    readonly TWILIO_TAC_CI_SUMMARY_OPERATOR_SID: "TWILIO_TAC_CI_SUMMARY_OPERATOR_SID";
    readonly TWILIO_REGION: "TWILIO_REGION";
};
/**
 * Server configuration for built-in Fastify setup
 */
declare const VoiceServerConfigSchema: z.ZodObject<{
    host: z.ZodDefault<z.ZodString>;
    port: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    host: string;
    port: number;
}, {
    host?: string | undefined;
    port?: number | undefined;
}>;
type VoiceServerConfig = z.infer<typeof VoiceServerConfigSchema>;

/**
 * Message direction in a conversation
 */
declare const MessageDirectionSchema: z.ZodEnum<["inbound", "outbound"]>;
type MessageDirection = z.infer<typeof MessageDirectionSchema>;
/**
 * Channel type for Memory communications
 */
declare const MemoryChannelTypeSchema: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
type MemoryChannelType = z.infer<typeof MemoryChannelTypeSchema>;
/**
 * Participant type in Memory API
 */
declare const MemoryParticipantTypeSchema: z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>;
type MemoryParticipantType = z.infer<typeof MemoryParticipantTypeSchema>;
/**
 * Delivery status for Memory communications
 */
declare const MemoryDeliveryStatusSchema: z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>;
type MemoryDeliveryStatus = z.infer<typeof MemoryDeliveryStatusSchema>;
/**
 * Participant in a Memory communication (author or recipient).
 *
 * Memory API has different field requirements than Maestro:
 * - Uses `id` and `name` instead of just `participant_id`
 * - Includes `type` and `profile_id` fields
 */
declare const MemoryParticipantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    address: z.ZodString;
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
    profile_id: z.ZodOptional<z.ZodString>;
    delivery_status: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
    profile_id?: string | undefined;
    delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
}, {
    id: string;
    name: string;
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
    profile_id?: string | undefined;
    delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
}>;
type MemoryParticipant = z.infer<typeof MemoryParticipantSchema>;
/**
 * Content of a Memory communication.
 *
 * Memory API content is simpler than Maestro - no type discriminator field.
 * The `text` field is optional in Memory API models.
 */
declare const MemoryCommunicationContentSchema: z.ZodObject<{
    text: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text?: string | undefined;
}, {
    text?: string | undefined;
}>;
type MemoryCommunicationContent = z.infer<typeof MemoryCommunicationContentSchema>;
/**
 * A communication from Memory API (historical conversation data).
 *
 * Memory API has different field requirements than Maestro:
 * - No `conversation_id`, `account_id`, or `content.type` fields
 * - Participants use `id`, `name`, `type`, `profile_id`
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_memory_v1.json
 */
declare const MemoryCommunicationSchema: z.ZodObject<{
    id: z.ZodString;
    author: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
        profile_id: z.ZodOptional<z.ZodString>;
        delivery_status: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }, {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }>;
    content: z.ZodObject<{
        text: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
    }, {
        text?: string | undefined;
    }>;
    recipients: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
        profile_id: z.ZodOptional<z.ZodString>;
        delivery_status: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }, {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }>, "many">;
    channel_id: z.ZodOptional<z.ZodString>;
    created_at: z.ZodString;
    updated_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    author: {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    };
    content: {
        text?: string | undefined;
    };
    recipients: {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }[];
    created_at: string;
    channel_id?: string | undefined;
    updated_at?: string | undefined;
}, {
    id: string;
    author: {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    };
    content: {
        text?: string | undefined;
    };
    recipients: {
        id: string;
        name: string;
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        profile_id?: string | undefined;
        delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }[];
    created_at: string;
    channel_id?: string | undefined;
    updated_at?: string | undefined;
}>;
type MemoryCommunication = z.infer<typeof MemoryCommunicationSchema>;
/**
 * Individual session message
 */
declare const SessionMessageSchema: z.ZodObject<{
    direction: z.ZodEnum<["inbound", "outbound"]>;
    channel: z.ZodString;
    from_address: z.ZodOptional<z.ZodString>;
    to_address: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    channel: string;
    content: string;
    direction: "inbound" | "outbound";
    timestamp: string;
    from_address?: string | undefined;
    to_address?: string | undefined;
}, {
    channel: string;
    content: string;
    direction: "inbound" | "outbound";
    timestamp: string;
    from_address?: string | undefined;
    to_address?: string | undefined;
}>;
type SessionMessage = z.infer<typeof SessionMessageSchema>;
/**
 * Session information containing conversation history
 */
declare const SessionInfoSchema: z.ZodObject<{
    session_id: z.ZodString;
    started_at: z.ZodString;
    ended_at: z.ZodOptional<z.ZodString>;
    channel: z.ZodString;
    messages: z.ZodArray<z.ZodObject<{
        direction: z.ZodEnum<["inbound", "outbound"]>;
        channel: z.ZodString;
        from_address: z.ZodOptional<z.ZodString>;
        to_address: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        channel: string;
        content: string;
        direction: "inbound" | "outbound";
        timestamp: string;
        from_address?: string | undefined;
        to_address?: string | undefined;
    }, {
        channel: string;
        content: string;
        direction: "inbound" | "outbound";
        timestamp: string;
        from_address?: string | undefined;
        to_address?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    channel: string;
    session_id: string;
    started_at: string;
    messages: {
        channel: string;
        content: string;
        direction: "inbound" | "outbound";
        timestamp: string;
        from_address?: string | undefined;
        to_address?: string | undefined;
    }[];
    ended_at?: string | undefined;
}, {
    channel: string;
    session_id: string;
    started_at: string;
    messages: {
        channel: string;
        content: string;
        direction: "inbound" | "outbound";
        timestamp: string;
        from_address?: string | undefined;
        to_address?: string | undefined;
    }[];
    ended_at?: string | undefined;
}>;
type SessionInfo = z.infer<typeof SessionInfoSchema>;
/**
 * Individual observation extracted from conversations
 */
declare const ObservationInfoSchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    createdAt: z.ZodString;
    occurredAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    conversationIds: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    content: string;
    createdAt: string;
    occurredAt?: string | undefined;
    updatedAt?: string | undefined;
    conversationIds?: string[] | null | undefined;
    source?: string | undefined;
}, {
    id: string;
    content: string;
    createdAt: string;
    occurredAt?: string | undefined;
    updatedAt?: string | undefined;
    conversationIds?: string[] | null | undefined;
    source?: string | undefined;
}>;
type ObservationInfo = z.infer<typeof ObservationInfoSchema>;
/**
 * Conversation summary information
 */
declare const SummaryInfoSchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
    conversationIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    content: string;
    createdAt: string;
    updatedAt?: string | undefined;
    conversationIds?: string[] | undefined;
}, {
    id: string;
    content: string;
    createdAt: string;
    updatedAt?: string | undefined;
    conversationIds?: string[] | undefined;
}>;
type SummaryInfo = z.infer<typeof SummaryInfoSchema>;
/**
 * Memory retrieval request parameters
 */
declare const MemoryRetrievalRequestSchema: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodString>;
    observation_limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    summary_limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    session_limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    observation_limit: number;
    summary_limit: number;
    session_limit: number;
    query?: string | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}, {
    query?: string | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
    observation_limit?: number | undefined;
    summary_limit?: number | undefined;
    session_limit?: number | undefined;
}>;
type MemoryRetrievalRequest = z.infer<typeof MemoryRetrievalRequestSchema>;
/**
 * Memory retrieval response from the Memory API /Recall endpoint.
 *
 * Contains observations, summaries, and communications from Memory API.
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_memory_v1.json
 */
declare const MemoryRetrievalResponseSchema: z.ZodObject<{
    observations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        createdAt: z.ZodString;
        occurredAt: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodOptional<z.ZodString>;
        conversationIds: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
        source: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        content: string;
        createdAt: string;
        occurredAt?: string | undefined;
        updatedAt?: string | undefined;
        conversationIds?: string[] | null | undefined;
        source?: string | undefined;
    }, {
        id: string;
        content: string;
        createdAt: string;
        occurredAt?: string | undefined;
        updatedAt?: string | undefined;
        conversationIds?: string[] | null | undefined;
        source?: string | undefined;
    }>, "many">;
    summaries: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodOptional<z.ZodString>;
        conversationIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        content: string;
        createdAt: string;
        updatedAt?: string | undefined;
        conversationIds?: string[] | undefined;
    }, {
        id: string;
        content: string;
        createdAt: string;
        updatedAt?: string | undefined;
        conversationIds?: string[] | undefined;
    }>, "many">;
    communications: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        author: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            address: z.ZodString;
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
            type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
            profile_id: z.ZodOptional<z.ZodString>;
            delivery_status: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }, {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }>;
        content: z.ZodObject<{
            text: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            text?: string | undefined;
        }, {
            text?: string | undefined;
        }>;
        recipients: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            address: z.ZodString;
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
            type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
            profile_id: z.ZodOptional<z.ZodString>;
            delivery_status: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }, {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }>, "many">;
        channel_id: z.ZodOptional<z.ZodString>;
        created_at: z.ZodString;
        updated_at: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        author: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            text?: string | undefined;
        };
        recipients: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        created_at: string;
        channel_id?: string | undefined;
        updated_at?: string | undefined;
    }, {
        id: string;
        author: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            text?: string | undefined;
        };
        recipients: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        created_at: string;
        channel_id?: string | undefined;
        updated_at?: string | undefined;
    }>, "many">>>;
    meta: z.ZodOptional<z.ZodObject<{
        queryTime: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        queryTime?: number | undefined;
    }, {
        queryTime?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    observations: {
        id: string;
        content: string;
        createdAt: string;
        occurredAt?: string | undefined;
        updatedAt?: string | undefined;
        conversationIds?: string[] | null | undefined;
        source?: string | undefined;
    }[];
    summaries: {
        id: string;
        content: string;
        createdAt: string;
        updatedAt?: string | undefined;
        conversationIds?: string[] | undefined;
    }[];
    communications: {
        id: string;
        author: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            text?: string | undefined;
        };
        recipients: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        created_at: string;
        channel_id?: string | undefined;
        updated_at?: string | undefined;
    }[];
    meta?: {
        queryTime?: number | undefined;
    } | undefined;
}, {
    observations: {
        id: string;
        content: string;
        createdAt: string;
        occurredAt?: string | undefined;
        updatedAt?: string | undefined;
        conversationIds?: string[] | null | undefined;
        source?: string | undefined;
    }[];
    summaries: {
        id: string;
        content: string;
        createdAt: string;
        updatedAt?: string | undefined;
        conversationIds?: string[] | undefined;
    }[];
    communications?: {
        id: string;
        author: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            text?: string | undefined;
        };
        recipients: {
            id: string;
            name: string;
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
            profile_id?: string | undefined;
            delivery_status?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        created_at: string;
        channel_id?: string | undefined;
        updated_at?: string | undefined;
    }[] | undefined;
    meta?: {
        queryTime?: number | undefined;
    } | undefined;
}>;
type MemoryRetrievalResponse = z.infer<typeof MemoryRetrievalResponseSchema>;
/**
 * Profile lookup response
 */
declare const ProfileLookupResponseSchema: z.ZodObject<{
    normalizedValue: z.ZodString;
    profiles: z.ZodEffects<z.ZodNullable<z.ZodArray<z.ZodString, "many">>, string[], string[] | null>;
}, "strip", z.ZodTypeAny, {
    normalizedValue: string;
    profiles: string[];
}, {
    normalizedValue: string;
    profiles: string[] | null;
}>;
type ProfileLookupResponse = z.infer<typeof ProfileLookupResponseSchema>;
/**
 * Profile response with traits
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_memory_v1.json
 */
declare const ProfileResponseSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodString;
    traits: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    traits: Record<string, unknown>;
}, {
    id: string;
    createdAt: string;
    traits: Record<string, unknown>;
}>;
type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
/**
 * Empty memory response for error fallback
 */
declare const EMPTY_MEMORY_RESPONSE: MemoryRetrievalResponse;
/**
 * Response from creating an observation
 */
declare const CreateObservationResponseSchema: z.ZodObject<{
    content: z.ZodString;
    source: z.ZodString;
    occurredAt: z.ZodString;
    conversationIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    content: string;
    occurredAt: string;
    conversationIds: string[];
    source: string;
}, {
    content: string;
    occurredAt: string;
    conversationIds: string[];
    source: string;
}>;
type CreateObservationResponse = z.infer<typeof CreateObservationResponseSchema>;
/**
 * Response from creating conversation summaries
 */
declare const CreateConversationSummariesResponseSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
type CreateConversationSummariesResponse = z.infer<typeof CreateConversationSummariesResponseSchema>;

/**
 * Session Types
 *
 * Generic session abstractions that work with any identifier (CallSid, ConversationId, etc.)
 */

/**
 * Base session context - works with any session identifier
 *
 * This minimal interface supports both standalone CR (CallSid) and
 * Maestro-backed channels (ConversationId) without forcing conversation concepts.
 */
interface SessionContext {
    /**
     * Conversation identifier
     */
    conversationId: string;
    /**
     * Channel type for this session
     */
    channel: ChannelType;
    /**
     * When the session started
     */
    startedAt: Date;
    /**
     * Arbitrary metadata for this session
     */
    metadata: Record<string, unknown>;
}

/**
 * Participant address type for different communication channels
 */
declare const ParticipantAddressTypeSchema: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
type ParticipantAddressType = z.infer<typeof ParticipantAddressTypeSchema>;
/**
 * Participant address containing channel and address
 */
declare const ParticipantAddressSchema: z.ZodObject<{
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    address: z.ZodString;
    channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    channelId?: string | null | undefined;
}, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    channelId?: string | null | undefined;
}>;
type ParticipantAddress = z.infer<typeof ParticipantAddressSchema>;
/**
 * Communication participant for Conversations Service API (Maestro).
 *
 * Note: participantId is required for SDK validation when creating communications.
 */
declare const CommunicationParticipantSchema: z.ZodObject<{
    address: z.ZodString;
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    participantId: z.ZodString;
    deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
}, "strip", z.ZodTypeAny, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    participantId: string;
    deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
}, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    participantId: string;
    deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
}>;
type CommunicationParticipant = z.infer<typeof CommunicationParticipantSchema>;
/**
 * Word-level transcription data with timing information.
 */
declare const TranscriptionWordSchema: z.ZodObject<{
    text: z.ZodString;
    startTime: z.ZodOptional<z.ZodString>;
    endTime: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    startTime?: string | undefined;
    endTime?: string | undefined;
}, {
    text: string;
    startTime?: string | undefined;
    endTime?: string | undefined;
}>;
type TranscriptionWord = z.infer<typeof TranscriptionWordSchema>;
/**
 * Transcription metadata for communication content.
 */
declare const TranscriptionSchema: z.ZodObject<{
    channel: z.ZodOptional<z.ZodNumber>;
    confidence: z.ZodOptional<z.ZodNumber>;
    engine: z.ZodOptional<z.ZodString>;
    words: z.ZodOptional<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        startTime: z.ZodOptional<z.ZodString>;
        endTime: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        startTime?: string | undefined;
        endTime?: string | undefined;
    }, {
        text: string;
        startTime?: string | undefined;
        endTime?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    channel?: number | undefined;
    confidence?: number | undefined;
    engine?: string | undefined;
    words?: {
        text: string;
        startTime?: string | undefined;
        endTime?: string | undefined;
    }[] | undefined;
}, {
    channel?: number | undefined;
    confidence?: number | undefined;
    engine?: string | undefined;
    words?: {
        text: string;
        startTime?: string | undefined;
        endTime?: string | undefined;
    }[] | undefined;
}>;
type Transcription = z.infer<typeof TranscriptionSchema>;
/**
 * Communication content (ContentText or ContentTranscription).
 *
 * Note: In Maestro API, both `type` and `text` are required fields.
 */
declare const CommunicationContentSchema: z.ZodObject<{
    type: z.ZodEnum<["TEXT", "TRANSCRIPTION"]>;
    text: z.ZodString;
    transcription: z.ZodOptional<z.ZodObject<{
        channel: z.ZodOptional<z.ZodNumber>;
        confidence: z.ZodOptional<z.ZodNumber>;
        engine: z.ZodOptional<z.ZodString>;
        words: z.ZodOptional<z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            startTime: z.ZodOptional<z.ZodString>;
            endTime: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }, {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    }, {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "TEXT" | "TRANSCRIPTION";
    text: string;
    transcription?: {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    } | undefined;
}, {
    type: "TEXT" | "TRANSCRIPTION";
    text: string;
    transcription?: {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    } | undefined;
}>;
type CommunicationContent = z.infer<typeof CommunicationContentSchema>;
/**
 * Communication from Conversations Service API (Maestro).
 *
 * Note: `createdAt` is optional per API spec.
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_conversations_v2.json
 */
declare const CommunicationSchema: z.ZodObject<{
    id: z.ZodString;
    conversationId: z.ZodString;
    accountId: z.ZodString;
    author: z.ZodObject<{
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        participantId: z.ZodString;
        deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }>;
    content: z.ZodObject<{
        type: z.ZodEnum<["TEXT", "TRANSCRIPTION"]>;
        text: z.ZodString;
        transcription: z.ZodOptional<z.ZodObject<{
            channel: z.ZodOptional<z.ZodNumber>;
            confidence: z.ZodOptional<z.ZodNumber>;
            engine: z.ZodOptional<z.ZodString>;
            words: z.ZodOptional<z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                startTime: z.ZodOptional<z.ZodString>;
                endTime: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }, {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        }, {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    }, {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    }>;
    recipients: z.ZodArray<z.ZodObject<{
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        participantId: z.ZodString;
        deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }>, "many">;
    channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    occurredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    author: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    };
    content: {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    };
    recipients: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }[];
    conversationId: string;
    accountId: string;
    createdAt?: string | null | undefined;
    occurredAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    channelId?: string | null | undefined;
}, {
    id: string;
    author: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    };
    content: {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    };
    recipients: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId: string;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    }[];
    conversationId: string;
    accountId: string;
    createdAt?: string | null | undefined;
    occurredAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    channelId?: string | null | undefined;
}>;
/**
 * Communication type inferred from schema.
 *
 * Note: Uses plain string for conversationId (not branded ConversationId).
 * This matches the API response structure where IDs are returned as strings.
 * The branded ConversationId type is used for function parameters and session state,
 * but not within API response objects themselves.
 */
type Communication = z.infer<typeof CommunicationSchema>;
/**
 * List communications response
 */
declare const ListCommunicationsResponseSchema: z.ZodObject<{
    communications: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        accountId: z.ZodString;
        author: z.ZodObject<{
            address: z.ZodString;
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
            participantId: z.ZodString;
            deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }, {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }>;
        content: z.ZodObject<{
            type: z.ZodEnum<["TEXT", "TRANSCRIPTION"]>;
            text: z.ZodString;
            transcription: z.ZodOptional<z.ZodObject<{
                channel: z.ZodOptional<z.ZodNumber>;
                confidence: z.ZodOptional<z.ZodNumber>;
                engine: z.ZodOptional<z.ZodString>;
                words: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    text: z.ZodString;
                    startTime: z.ZodOptional<z.ZodString>;
                    endTime: z.ZodOptional<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }, {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }>, "many">>;
            }, "strip", z.ZodTypeAny, {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            }, {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            type: "TEXT" | "TRANSCRIPTION";
            text: string;
            transcription?: {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            } | undefined;
        }, {
            type: "TEXT" | "TRANSCRIPTION";
            text: string;
            transcription?: {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            } | undefined;
        }>;
        recipients: z.ZodArray<z.ZodObject<{
            address: z.ZodString;
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
            participantId: z.ZodString;
            deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }, {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }>, "many">;
        channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        occurredAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        author: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            type: "TEXT" | "TRANSCRIPTION";
            text: string;
            transcription?: {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            } | undefined;
        };
        recipients: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        conversationId: string;
        accountId: string;
        createdAt?: string | null | undefined;
        occurredAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        channelId?: string | null | undefined;
    }, {
        id: string;
        author: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            type: "TEXT" | "TRANSCRIPTION";
            text: string;
            transcription?: {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            } | undefined;
        };
        recipients: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        conversationId: string;
        accountId: string;
        createdAt?: string | null | undefined;
        occurredAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        channelId?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    communications: {
        id: string;
        author: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            type: "TEXT" | "TRANSCRIPTION";
            text: string;
            transcription?: {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            } | undefined;
        };
        recipients: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        conversationId: string;
        accountId: string;
        createdAt?: string | null | undefined;
        occurredAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        channelId?: string | null | undefined;
    }[];
}, {
    communications: {
        id: string;
        author: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        };
        content: {
            type: "TEXT" | "TRANSCRIPTION";
            text: string;
            transcription?: {
                channel?: number | undefined;
                confidence?: number | undefined;
                engine?: string | undefined;
                words?: {
                    text: string;
                    startTime?: string | undefined;
                    endTime?: string | undefined;
                }[] | undefined;
            } | undefined;
        };
        recipients: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            participantId: string;
            deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        }[];
        conversationId: string;
        accountId: string;
        createdAt?: string | null | undefined;
        occurredAt?: string | null | undefined;
        updatedAt?: string | null | undefined;
        channelId?: string | null | undefined;
    }[];
}>;
type ListCommunicationsResponse = z.infer<typeof ListCommunicationsResponseSchema>;
/**
 * Send API author/recipient address (ParticipantAddress)
 */
declare const SendCommunicationParticipantAddressSchema: z.ZodObject<{
    address: z.ZodString;
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    participantId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    participantId?: string | undefined;
}, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    participantId?: string | undefined;
}>;
type SendCommunicationParticipantAddress = z.infer<typeof SendCommunicationParticipantAddressSchema>;
/**
 * Send API request fields for POST /v2/Communications.
 * Note: conversationId is supplied separately as a parameter to sendCommunication()
 * and merged into the JSON payload by the client before sending.
 */
declare const SendCommunicationRequestSchema: z.ZodObject<{
    author: z.ZodObject<{
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        participantId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    }>;
    content: z.ZodObject<{
        type: z.ZodEnum<["TEXT", "TRANSCRIPTION"]>;
        text: z.ZodString;
        transcription: z.ZodOptional<z.ZodObject<{
            channel: z.ZodOptional<z.ZodNumber>;
            confidence: z.ZodOptional<z.ZodNumber>;
            engine: z.ZodOptional<z.ZodString>;
            words: z.ZodOptional<z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                startTime: z.ZodOptional<z.ZodString>;
                endTime: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }, {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        }, {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    }, {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    }>;
    recipients: z.ZodArray<z.ZodObject<{
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        participantId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    }>, "many">;
    channelId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    author: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    };
    content: {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    };
    recipients: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    }[];
    channelId?: string | undefined;
}, {
    author: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    };
    content: {
        type: "TEXT" | "TRANSCRIPTION";
        text: string;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    };
    recipients: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        participantId?: string | undefined;
    }[];
    channelId?: string | undefined;
}>;
type SendCommunicationRequest = z.infer<typeof SendCommunicationRequestSchema>;
/**
 * Send API response from POST /v2/Communications endpoint
 * Returns 202 Accepted with async job status.
 * The Communication record is created asynchronously after message delivery.
 * Listen for COMMUNICATION_CREATED webhook to get the full Communication.
 */
declare const SendCommunicationResponseSchema: z.ZodObject<{
    message: z.ZodString;
    conversationId: z.ZodString;
    channelId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    channelId: string | null;
    conversationId: string;
}, {
    message: string;
    channelId: string | null;
    conversationId: string;
}>;
/**
 * Send communication response type.
 *
 * Note: Uses plain string for conversationId (not branded ConversationId).
 * This matches the API response structure. No Omit pattern is needed here.
 */
type SendCommunicationResponse = z.infer<typeof SendCommunicationResponseSchema>;
/**
 * Author information for a conversation session
 */
declare const AuthorInfoSchema: z.ZodObject<{
    address: z.ZodString;
    participantId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    address: string;
    participantId?: string | undefined;
}, {
    address: string;
    participantId?: string | undefined;
}>;
type AuthorInfo = z.infer<typeof AuthorInfoSchema>;
/**
 * Profile information for a conversation participant
 */
interface Profile {
    profileId: ProfileId;
    traits?: Record<string, unknown>;
}
/**
 * Branded types for type safety
 */
type ConversationId = string & {
    readonly _brand: 'ConversationId';
};
type ProfileId = string & {
    readonly _brand: 'ProfileId';
};
type ParticipantId = string & {
    readonly _brand: 'ParticipantId';
};
type MemoryStoreId = string & {
    readonly _brand: 'MemoryStoreId';
};
/**
 * Conversation session context
 *
 * Extends SessionContext with Maestro-specific fields (participant, profile, service data).
 */
declare const ConversationSessionSchema: z.ZodObject<{
    conversationId: z.ZodString;
    channel: z.ZodEnum<["sms", "voice", "chat"]>;
    startedAt: z.ZodDate;
    metadata: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    profileId: z.ZodOptional<z.ZodString>;
    serviceId: z.ZodOptional<z.ZodString>;
    authorInfo: z.ZodOptional<z.ZodObject<{
        address: z.ZodString;
        participantId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        participantId?: string | undefined;
    }, {
        address: string;
        participantId?: string | undefined;
    }>>;
    profile: z.ZodOptional<z.ZodType<Profile, z.ZodTypeDef, Profile>>;
}, "strip", z.ZodTypeAny, {
    channel: "sms" | "voice" | "chat";
    conversationId: string;
    startedAt: Date;
    metadata: Record<string, unknown>;
    profileId?: string | undefined;
    serviceId?: string | undefined;
    authorInfo?: {
        address: string;
        participantId?: string | undefined;
    } | undefined;
    profile?: Profile | undefined;
}, {
    channel: "sms" | "voice" | "chat";
    conversationId: string;
    startedAt: Date;
    metadata?: Record<string, unknown> | undefined;
    profileId?: string | undefined;
    serviceId?: string | undefined;
    authorInfo?: {
        address: string;
        participantId?: string | undefined;
    } | undefined;
    profile?: Profile | undefined;
}>;
/**
 * ConversationSession type with branded IDs
 *
 * Note: Zod schema validates as plain strings, but TypeScript type uses branded types.
 * Cast at parse boundaries: ConversationSessionSchema.parse(data) as ConversationSession
 */
type ConversationSession = Omit<z.infer<typeof ConversationSessionSchema>, 'conversationId' | 'profileId' | 'serviceId'> & {
    conversationId: ConversationId;
    profileId?: ProfileId | undefined;
    serviceId?: string | undefined;
};
/**
 * Type guards for branded types with format validation
 * All Twilio Type IDs (TTID) follow: prefix + 26 character ULID ([0-9a-z]{26})
 */
declare function isConversationId(value: string): value is ConversationId;
declare function isProfileId(value: string): value is ProfileId;
declare function isParticipantId(value: string): value is ParticipantId;
declare function isMemoryStoreId(value: string): value is MemoryStoreId;
/**
 * Conversation response from Conversations Service API
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_conversations_v2.json
 */
declare const ConversationResponseSchema: z.ZodObject<{
    id: z.ZodString;
    accountId: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    configurationId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    accountId: string;
    status?: string | undefined;
    name?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    configurationId?: string | undefined;
}, {
    id: string;
    accountId: string;
    status?: string | undefined;
    name?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    configurationId?: string | undefined;
}>;
type ConversationResponse = z.infer<typeof ConversationResponseSchema>;
/**
 * List conversations response
 */
declare const ListConversationsResponseSchema: z.ZodObject<{
    conversations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        accountId: z.ZodString;
        status: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        configurationId: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        accountId: string;
        status?: string | undefined;
        name?: string | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        configurationId?: string | undefined;
    }, {
        id: string;
        accountId: string;
        status?: string | undefined;
        name?: string | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        configurationId?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    conversations: {
        id: string;
        accountId: string;
        status?: string | undefined;
        name?: string | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        configurationId?: string | undefined;
    }[];
}, {
    conversations: {
        id: string;
        accountId: string;
        status?: string | undefined;
        name?: string | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        configurationId?: string | undefined;
    }[];
}>;
type ListConversationsResponse = z.infer<typeof ListConversationsResponseSchema>;
/**
 * Participant address from Conversations Service API (camelCase format)
 */
declare const ConversationAddressSchema: z.ZodObject<{
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    address: z.ZodString;
    channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    channelId?: string | null | undefined;
}, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    channelId?: string | null | undefined;
}>;
type ConversationAddress = z.infer<typeof ConversationAddressSchema>;
/**
 * Participant response from Conversations Service API
 */
declare const ConversationParticipantSchema: z.ZodObject<{
    id: z.ZodString;
    conversationId: z.ZodString;
    accountId: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT", "AGENT", "UNKNOWN"]>>;
    profileId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    addresses: z.ZodDefault<z.ZodArray<z.ZodObject<{
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        address: z.ZodString;
        channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        channelId?: string | null | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        channelId?: string | null | undefined;
    }>, "many">>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    conversationId: string;
    accountId: string;
    addresses: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        channelId?: string | null | undefined;
    }[];
    type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | "AGENT" | "UNKNOWN" | undefined;
    name?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    profileId?: string | null | undefined;
}, {
    id: string;
    conversationId: string;
    accountId: string;
    type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | "AGENT" | "UNKNOWN" | undefined;
    name?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    profileId?: string | null | undefined;
    addresses?: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        channelId?: string | null | undefined;
    }[] | undefined;
}>;
type ConversationParticipant = z.infer<typeof ConversationParticipantSchema>;
/**
 * List participants response
 */
declare const ListParticipantsResponseSchema: z.ZodObject<{
    participants: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        accountId: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT", "AGENT", "UNKNOWN"]>>;
        profileId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        addresses: z.ZodDefault<z.ZodArray<z.ZodObject<{
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
            address: z.ZodString;
            channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            channelId?: string | null | undefined;
        }, {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            channelId?: string | null | undefined;
        }>, "many">>;
        createdAt: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        conversationId: string;
        accountId: string;
        addresses: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            channelId?: string | null | undefined;
        }[];
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | "AGENT" | "UNKNOWN" | undefined;
        name?: string | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        profileId?: string | null | undefined;
    }, {
        id: string;
        conversationId: string;
        accountId: string;
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | "AGENT" | "UNKNOWN" | undefined;
        name?: string | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        profileId?: string | null | undefined;
        addresses?: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            channelId?: string | null | undefined;
        }[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    participants: {
        id: string;
        conversationId: string;
        accountId: string;
        addresses: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            channelId?: string | null | undefined;
        }[];
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | "AGENT" | "UNKNOWN" | undefined;
        name?: string | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        profileId?: string | null | undefined;
    }[];
}, {
    participants: {
        id: string;
        conversationId: string;
        accountId: string;
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | "AGENT" | "UNKNOWN" | undefined;
        name?: string | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
        profileId?: string | null | undefined;
        addresses?: {
            address: string;
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            channelId?: string | null | undefined;
        }[] | undefined;
    }[];
}>;
type ListParticipantsResponse = z.infer<typeof ListParticipantsResponseSchema>;
/**
 * Timeout settings for channel status transitions
 */
declare const StatusTimeoutsSchema: z.ZodObject<{
    inactive: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    closed: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    closed: number;
    inactive?: number | null | undefined;
}, {
    closed: number;
    inactive?: number | null | undefined;
}>;
type StatusTimeouts = z.infer<typeof StatusTimeoutsSchema>;
/**
 * Capture rule with from/to addresses and optional metadata
 */
declare const CaptureRuleSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    metadata?: Record<string, string> | null | undefined;
}, {
    from: string;
    to: string;
    metadata?: Record<string, string> | null | undefined;
}>;
type CaptureRule = z.infer<typeof CaptureRuleSchema>;
/**
 * Configuration settings for a specific channel type
 */
declare const ChannelSettingsSchema: z.ZodObject<{
    statusTimeouts: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        inactive: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        closed: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        closed: number;
        inactive?: number | null | undefined;
    }, {
        closed: number;
        inactive?: number | null | undefined;
    }>>>;
    captureRules: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodString>>>;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
        metadata?: Record<string, string> | null | undefined;
    }, {
        from: string;
        to: string;
        metadata?: Record<string, string> | null | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    statusTimeouts?: {
        closed: number;
        inactive?: number | null | undefined;
    } | null | undefined;
    captureRules?: {
        from: string;
        to: string;
        metadata?: Record<string, string> | null | undefined;
    }[] | null | undefined;
}, {
    statusTimeouts?: {
        closed: number;
        inactive?: number | null | undefined;
    } | null | undefined;
    captureRules?: {
        from: string;
        to: string;
        metadata?: Record<string, string> | null | undefined;
    }[] | null | undefined;
}>;
type ChannelSettings = z.infer<typeof ChannelSettingsSchema>;
/**
 * Webhook configuration for status callbacks
 */
declare const StatusCallbackSchema: z.ZodObject<{
    url: z.ZodString;
    method: z.ZodDefault<z.ZodOptional<z.ZodEnum<["POST", "GET", "PUT", "DELETE", "PATCH"]>>>;
}, "strip", z.ZodTypeAny, {
    url: string;
    method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH";
}, {
    url: string;
    method?: "POST" | "GET" | "PUT" | "DELETE" | "PATCH" | undefined;
}>;
type StatusCallback = z.infer<typeof StatusCallbackSchema>;
/**
 * Conversation grouping type
 */
declare const ConversationGroupingTypeSchema: z.ZodEnum<["GROUP_BY_PARTICIPANT_ADDRESSES", "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE"]>;
type ConversationGroupingType = z.infer<typeof ConversationGroupingTypeSchema>;
/**
 * Configuration settings for a conversation
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_conversations_v2.json
 */
declare const ConversationConfigurationSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodString;
    conversationGroupingType: z.ZodEnum<["GROUP_BY_PARTICIPANT_ADDRESSES", "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE"]>;
    memoryStoreId: z.ZodString;
    channelSettings: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodObject<{
        statusTimeouts: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            inactive: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            closed: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            closed: number;
            inactive?: number | null | undefined;
        }, {
            closed: number;
            inactive?: number | null | undefined;
        }>>>;
        captureRules: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            metadata: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodString>>>;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
            metadata?: Record<string, string> | null | undefined;
        }, {
            from: string;
            to: string;
            metadata?: Record<string, string> | null | undefined;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        statusTimeouts?: {
            closed: number;
            inactive?: number | null | undefined;
        } | null | undefined;
        captureRules?: {
            from: string;
            to: string;
            metadata?: Record<string, string> | null | undefined;
        }[] | null | undefined;
    }, {
        statusTimeouts?: {
            closed: number;
            inactive?: number | null | undefined;
        } | null | undefined;
        captureRules?: {
            from: string;
            to: string;
            metadata?: Record<string, string> | null | undefined;
        }[] | null | undefined;
    }>>>>;
    statusCallbacks: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        method: z.ZodDefault<z.ZodOptional<z.ZodEnum<["POST", "GET", "PUT", "DELETE", "PATCH"]>>>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH";
    }, {
        url: string;
        method?: "POST" | "GET" | "PUT" | "DELETE" | "PATCH" | undefined;
    }>, "many">>>;
    intelligenceConfigurationIds: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    version: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    memoryStoreId: string;
    id: string;
    description: string;
    conversationGroupingType: "GROUP_BY_PARTICIPANT_ADDRESSES" | "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE";
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    displayName?: string | null | undefined;
    channelSettings?: Record<string, {
        statusTimeouts?: {
            closed: number;
            inactive?: number | null | undefined;
        } | null | undefined;
        captureRules?: {
            from: string;
            to: string;
            metadata?: Record<string, string> | null | undefined;
        }[] | null | undefined;
    }> | null | undefined;
    statusCallbacks?: {
        url: string;
        method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH";
    }[] | null | undefined;
    intelligenceConfigurationIds?: string[] | null | undefined;
    version?: number | null | undefined;
}, {
    memoryStoreId: string;
    id: string;
    description: string;
    conversationGroupingType: "GROUP_BY_PARTICIPANT_ADDRESSES" | "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE";
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
    displayName?: string | null | undefined;
    channelSettings?: Record<string, {
        statusTimeouts?: {
            closed: number;
            inactive?: number | null | undefined;
        } | null | undefined;
        captureRules?: {
            from: string;
            to: string;
            metadata?: Record<string, string> | null | undefined;
        }[] | null | undefined;
    }> | null | undefined;
    statusCallbacks?: {
        url: string;
        method?: "POST" | "GET" | "PUT" | "DELETE" | "PATCH" | undefined;
    }[] | null | undefined;
    intelligenceConfigurationIds?: string[] | null | undefined;
    version?: number | null | undefined;
}>;
type ConversationConfiguration = z.infer<typeof ConversationConfigurationSchema>;

/**
 * Channel type for communications
 */
declare const TACChannelTypeSchema: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
type TACChannelType = z.infer<typeof TACChannelTypeSchema>;
/**
 * Delivery status for communications
 */
declare const TACDeliveryStatusSchema: z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>;
type TACDeliveryStatus = z.infer<typeof TACDeliveryStatusSchema>;
/**
 * Participant type
 */
declare const TACParticipantTypeSchema: z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>;
type TACParticipantType = z.infer<typeof TACParticipantTypeSchema>;
/**
 * Unified author model with all fields from both Memory and Maestro APIs.
 *
 * Fields not available from a particular API will be undefined.
 */
declare const TACCommunicationAuthorSchema: z.ZodObject<{
    address: z.ZodString;
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    participantId: z.ZodOptional<z.ZodString>;
    deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
    profileId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
    id?: string | undefined;
    name?: string | undefined;
    participantId?: string | undefined;
    deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    profileId?: string | undefined;
}, {
    address: string;
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
    id?: string | undefined;
    name?: string | undefined;
    participantId?: string | undefined;
    deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
    profileId?: string | undefined;
}>;
type TACCommunicationAuthor = z.infer<typeof TACCommunicationAuthorSchema>;
/**
 * Unified content model with all fields from both Memory and Maestro APIs.
 */
declare const TACCommunicationContentSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["TEXT", "TRANSCRIPTION"]>>;
    text: z.ZodOptional<z.ZodString>;
    transcription: z.ZodOptional<z.ZodObject<{
        channel: z.ZodOptional<z.ZodNumber>;
        confidence: z.ZodOptional<z.ZodNumber>;
        engine: z.ZodOptional<z.ZodString>;
        words: z.ZodOptional<z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            startTime: z.ZodOptional<z.ZodString>;
            endTime: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }, {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    }, {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    type?: "TEXT" | "TRANSCRIPTION" | undefined;
    text?: string | undefined;
    transcription?: {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    } | undefined;
}, {
    type?: "TEXT" | "TRANSCRIPTION" | undefined;
    text?: string | undefined;
    transcription?: {
        channel?: number | undefined;
        confidence?: number | undefined;
        engine?: string | undefined;
        words?: {
            text: string;
            startTime?: string | undefined;
            endTime?: string | undefined;
        }[] | undefined;
    } | undefined;
}>;
type TACCommunicationContent = z.infer<typeof TACCommunicationContentSchema>;
/**
 * Unified communication model with all fields from both Memory and Maestro APIs.
 *
 * Provides complete access to all communication fields regardless of the source.
 * Fields not available from a particular API will be undefined.
 */
declare const TACCommunicationSchema: z.ZodObject<{
    id: z.ZodString;
    author: z.ZodObject<{
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        participantId: z.ZodOptional<z.ZodString>;
        deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
        profileId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    }>;
    content: z.ZodObject<{
        type: z.ZodOptional<z.ZodEnum<["TEXT", "TRANSCRIPTION"]>>;
        text: z.ZodOptional<z.ZodString>;
        transcription: z.ZodOptional<z.ZodObject<{
            channel: z.ZodOptional<z.ZodNumber>;
            confidence: z.ZodOptional<z.ZodNumber>;
            engine: z.ZodOptional<z.ZodString>;
            words: z.ZodOptional<z.ZodArray<z.ZodObject<{
                text: z.ZodString;
                startTime: z.ZodOptional<z.ZodString>;
                endTime: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }, {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        }, {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        type?: "TEXT" | "TRANSCRIPTION" | undefined;
        text?: string | undefined;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    }, {
        type?: "TEXT" | "TRANSCRIPTION" | undefined;
        text?: string | undefined;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    }>;
    recipients: z.ZodDefault<z.ZodArray<z.ZodObject<{
        address: z.ZodString;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        participantId: z.ZodOptional<z.ZodString>;
        deliveryStatus: z.ZodOptional<z.ZodEnum<["INITIATED", "IN_PROGRESS", "DELIVERED", "COMPLETED", "FAILED"]>>;
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodEnum<["HUMAN_AGENT", "CUSTOMER", "AI_AGENT"]>>;
        profileId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    }, {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    }>, "many">>;
    channelId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    author: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    };
    content: {
        type?: "TEXT" | "TRANSCRIPTION" | undefined;
        text?: string | undefined;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    };
    recipients: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    }[];
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    channelId?: string | undefined;
    conversationId?: string | undefined;
    accountId?: string | undefined;
}, {
    id: string;
    author: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    };
    content: {
        type?: "TEXT" | "TRANSCRIPTION" | undefined;
        text?: string | undefined;
        transcription?: {
            channel?: number | undefined;
            confidence?: number | undefined;
            engine?: string | undefined;
            words?: {
                text: string;
                startTime?: string | undefined;
                endTime?: string | undefined;
            }[] | undefined;
        } | undefined;
    };
    recipients?: {
        address: string;
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        type?: "HUMAN_AGENT" | "CUSTOMER" | "AI_AGENT" | undefined;
        id?: string | undefined;
        name?: string | undefined;
        participantId?: string | undefined;
        deliveryStatus?: "INITIATED" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "FAILED" | undefined;
        profileId?: string | undefined;
    }[] | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    channelId?: string | undefined;
    conversationId?: string | undefined;
    accountId?: string | undefined;
}>;
type TACCommunication = z.infer<typeof TACCommunicationSchema>;

/**
 * Unified response wrapper for TAC.retrieveMemory().
 *
 * Provides a consistent interface for accessing memory data regardless of whether
 * Memory API is configured or falling back to Maestro Communications API.
 *
 * Memory configured:
 * - observations, summaries, communications all populated
 * - communications include Memory-specific fields (author id, name, type, profileId)
 *
 * Maestro fallback:
 * - observations and summaries are empty arrays
 * - communications include Maestro-specific fields (conversationId, accountId, etc.)
 */
declare class TACMemoryResponse {
    private readonly _data;
    private readonly _communications;
    /**
     * Initialize wrapper with either Memory or Maestro data.
     *
     * @param data - Either MemoryRetrievalResponse (Memory) or Communication[] (Maestro)
     */
    constructor(data: MemoryRetrievalResponse | Communication[]);
    /**
     * Get observation memories.
     *
     * @returns List of observations if Memory is configured, empty array for Maestro fallback
     */
    get observations(): ObservationInfo[];
    /**
     * Get summary memories.
     *
     * @returns List of summaries if Memory is configured, empty array for Maestro fallback
     */
    get summaries(): SummaryInfo[];
    /**
     * Get communications in unified format with all available fields.
     *
     * Communications are converted to a common format during initialization that includes
     * all fields from both Memory and Maestro APIs. Fields not available from a particular
     * API will be undefined.
     *
     * @returns List of unified communications with all available fields
     */
    get communications(): TACCommunication[];
    /**
     * Check if Memory API is configured and providing full features.
     *
     * @returns true if Memory is configured (observations/summaries available),
     *          false if using Maestro fallback (only communications available)
     */
    get hasMemoryFeatures(): boolean;
    /**
     * Access raw underlying data for advanced use cases.
     *
     * Use this when you need access to all fields from the original API responses,
     * not just the unified common fields.
     *
     * @returns Either MemoryRetrievalResponse or Communication[] depending on configuration
     */
    get rawData(): MemoryRetrievalResponse | Communication[];
}

/**
 * ConversationRelay Type Definitions
 *
 * Single source of truth for all ConversationRelay types and Zod schemas.
 * Compile-time SDK drift guards ensure schemas stay in sync with the Twilio SDK.
 *
 * @see https://www.twilio.com/docs/voice/conversationrelay
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun
 */

/**
 * CallSid - Twilio call identifier (branded for type safety)
 */
type CallSid = string & {
    readonly _brand: 'CallSid';
};
/**
 * Language configuration for multi-language ConversationRelay support
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun#language-attributes
 */
declare const LanguageAttributesSchema: z.ZodObject<{
    /** Language code (e.g., 'en-US', 'es-ES', 'en-AU') */
    code: z.ZodString;
    /** TTS provider for this language */
    ttsProvider: z.ZodOptional<z.ZodString>;
    /** TTS voice for this language */
    voice: z.ZodOptional<z.ZodString>;
    /** TTS language (may differ from code) */
    ttsLanguage: z.ZodOptional<z.ZodString>;
    /** Transcription provider for this language */
    transcriptionProvider: z.ZodOptional<z.ZodString>;
    /** Speech model for transcription */
    speechModel: z.ZodOptional<z.ZodString>;
    /** Transcription language (may differ from code) */
    transcriptionLanguage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    voice?: string | undefined;
    ttsLanguage?: string | undefined;
    transcriptionLanguage?: string | undefined;
    ttsProvider?: string | undefined;
    transcriptionProvider?: string | undefined;
    speechModel?: string | undefined;
}, {
    code: string;
    voice?: string | undefined;
    ttsLanguage?: string | undefined;
    transcriptionLanguage?: string | undefined;
    ttsProvider?: string | undefined;
    transcriptionProvider?: string | undefined;
    speechModel?: string | undefined;
}>;
type LanguageAttributes = z.infer<typeof LanguageAttributesSchema>;
/**
 * ConversationRelay attributes for TwiML configuration
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun
 */
declare const ConversationRelayAttributesSchema: z.ZodObject<{
    /** WebSocket URL for ConversationRelay (required) */
    url: z.ZodString;
    /** Initial greeting to play when call connects */
    welcomeGreeting: z.ZodOptional<z.ZodString>;
    /** Whether welcome greeting can be interrupted */
    welcomeGreetingInterruptible: z.ZodOptional<z.ZodEnum<["any", "speech", "none"]>>;
    /** Transcription provider (e.g., 'Deepgram', 'Google') */
    transcriptionProvider: z.ZodOptional<z.ZodString>;
    /** Language for transcription (e.g., 'en-US') */
    transcriptionLanguage: z.ZodOptional<z.ZodString>;
    /** Speech model for transcription (e.g., 'nova-3-general') */
    speechModel: z.ZodOptional<z.ZodString>;
    /** Text-to-speech provider (e.g., 'Google', 'ElevenLabs') */
    ttsProvider: z.ZodOptional<z.ZodString>;
    /** Language for TTS (e.g., 'en-US') */
    ttsLanguage: z.ZodOptional<z.ZodString>;
    /** Voice identifier for TTS (e.g., 'en-US-Journey-O') */
    voice: z.ZodOptional<z.ZodString>;
    /** ElevenLabs text normalization setting */
    elevenlabsTextNormalization: z.ZodOptional<z.ZodString>;
    /** When agent speech can be interrupted */
    interruptible: z.ZodOptional<z.ZodEnum<["any", "speech", "none"]>>;
    /** Interrupt detection sensitivity */
    interruptSensitivity: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    /** Enable DTMF tone detection */
    dtmfDetection: z.ZodOptional<z.ZodBoolean>;
    /** Recognition hints for domain-specific vocabulary */
    hints: z.ZodOptional<z.ZodString>;
    /** Whether prompts should be reported when TTS is playing and interrupt is disabled */
    reportInputDuringAgentSpeech: z.ZodOptional<z.ZodBoolean>;
    /** Enable partial prompts (streaming) */
    partialPrompts: z.ZodOptional<z.ZodBoolean>;
    /** Enable profanity filtering */
    profanityFilter: z.ZodOptional<z.ZodBoolean>;
    /** Allow preemption of agent speech */
    preemptible: z.ZodOptional<z.ZodBoolean>;
    /** Default language code */
    language: z.ZodOptional<z.ZodString>;
    /** Debug options for troubleshooting (string per SDK, not boolean) */
    debug: z.ZodOptional<z.ZodString>;
    /** Conversational Intelligence Service ID or unique name */
    intelligenceService: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    voice?: string | undefined;
    debug?: string | undefined;
    interruptible?: "any" | "speech" | "none" | undefined;
    preemptible?: boolean | undefined;
    language?: string | undefined;
    ttsLanguage?: string | undefined;
    transcriptionLanguage?: string | undefined;
    ttsProvider?: string | undefined;
    transcriptionProvider?: string | undefined;
    speechModel?: string | undefined;
    welcomeGreeting?: string | undefined;
    welcomeGreetingInterruptible?: "any" | "speech" | "none" | undefined;
    elevenlabsTextNormalization?: string | undefined;
    interruptSensitivity?: "low" | "medium" | "high" | undefined;
    dtmfDetection?: boolean | undefined;
    hints?: string | undefined;
    reportInputDuringAgentSpeech?: boolean | undefined;
    partialPrompts?: boolean | undefined;
    profanityFilter?: boolean | undefined;
    intelligenceService?: string | undefined;
}, {
    url: string;
    voice?: string | undefined;
    debug?: string | undefined;
    interruptible?: "any" | "speech" | "none" | undefined;
    preemptible?: boolean | undefined;
    language?: string | undefined;
    ttsLanguage?: string | undefined;
    transcriptionLanguage?: string | undefined;
    ttsProvider?: string | undefined;
    transcriptionProvider?: string | undefined;
    speechModel?: string | undefined;
    welcomeGreeting?: string | undefined;
    welcomeGreetingInterruptible?: "any" | "speech" | "none" | undefined;
    elevenlabsTextNormalization?: string | undefined;
    interruptSensitivity?: "low" | "medium" | "high" | undefined;
    dtmfDetection?: boolean | undefined;
    hints?: string | undefined;
    reportInputDuringAgentSpeech?: boolean | undefined;
    partialPrompts?: boolean | undefined;
    profanityFilter?: boolean | undefined;
    intelligenceService?: string | undefined;
}>;
type ConversationRelayAttributes = z.infer<typeof ConversationRelayAttributesSchema>;
/**
 * Extended ConversationRelay configuration that includes child elements.
 * Includes all ConversationRelayAttributes fields plus support for languages array.
 *
 * Note: The type is defined as an explicit interface and the schema is annotated
 * with z.ZodType<ConversationRelayConfig> to prevent TypeScript's type inference
 * from collapsing to `any` when resolving complex Zod generics with many optional
 * fields (especially under exactOptionalPropertyTypes).
 */
interface ConversationRelayConfig extends ConversationRelayAttributes {
    /** Optional language configurations as child <Language> elements */
    languages?: LanguageAttributes[] | undefined;
}
/**
 * ConversationRelay callback payload from Twilio webhook
 *
 * Sent when a ConversationRelay session ends or transitions state.
 * Includes standard voice webhook parameters plus ConversationRelay-specific fields.
 *
 * @see https://www.twilio.com/docs/voice/twiml#request-parameters
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun#statuscallback
 */
declare const ConversationRelayCallbackPayloadSchema: z.ZodObject<{
    AccountSid: z.ZodString;
    CallSid: z.ZodString;
    /** Call status with strict type checking for all valid Twilio call states */
    CallStatus: z.ZodEnum<["queued", "initiated", "ringing", "in-progress", "completed", "busy", "no-answer", "failed", "canceled"]>;
    From: z.ZodString;
    To: z.ZodString;
    /** Direction of the call */
    Direction: z.ZodEnum<["inbound", "outbound-api", "outbound-dial"]>;
    ApiVersion: z.ZodOptional<z.ZodString>;
    ForwardedFrom: z.ZodOptional<z.ZodString>;
    CallerName: z.ZodOptional<z.ZodString>;
    ParentCallSid: z.ZodOptional<z.ZodString>;
    ApplicationSid: z.ZodOptional<z.ZodString>;
    SessionId: z.ZodOptional<z.ZodString>;
    SessionStatus: z.ZodOptional<z.ZodString>;
    SessionDuration: z.ZodOptional<z.ZodString>;
    HandoffData: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    CallSid: string;
    AccountSid: string;
    CallStatus: "queued" | "initiated" | "ringing" | "in-progress" | "completed" | "busy" | "no-answer" | "failed" | "canceled";
    From: string;
    To: string;
    Direction: "inbound" | "outbound-api" | "outbound-dial";
    ApiVersion?: string | undefined;
    ForwardedFrom?: string | undefined;
    CallerName?: string | undefined;
    ParentCallSid?: string | undefined;
    ApplicationSid?: string | undefined;
    SessionId?: string | undefined;
    SessionStatus?: string | undefined;
    SessionDuration?: string | undefined;
    HandoffData?: string | undefined;
}, {
    CallSid: string;
    AccountSid: string;
    CallStatus: "queued" | "initiated" | "ringing" | "in-progress" | "completed" | "busy" | "no-answer" | "failed" | "canceled";
    From: string;
    To: string;
    Direction: "inbound" | "outbound-api" | "outbound-dial";
    ApiVersion?: string | undefined;
    ForwardedFrom?: string | undefined;
    CallerName?: string | undefined;
    ParentCallSid?: string | undefined;
    ApplicationSid?: string | undefined;
    SessionId?: string | undefined;
    SessionStatus?: string | undefined;
    SessionDuration?: string | undefined;
    HandoffData?: string | undefined;
}>;
type ConversationRelayCallbackPayload = z.infer<typeof ConversationRelayCallbackPayloadSchema>;

/**
 * CR Tool definition helpers.
 *
 * Vendored locally so the ConversationRelay package stays free of any
 * dependency on @twilio/tac-tools. CR tools are only invoked by CR itself.
 */

declare const JSONSchemaSchema$1: z.ZodObject<{
    type: z.ZodEnum<["object", "string", "number", "boolean", "array"]>;
    properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    items: z.ZodOptional<z.ZodAny>;
    enum: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description?: string | undefined;
    properties?: Record<string, any> | undefined;
    required?: string[] | undefined;
    items?: any;
    enum?: any[] | undefined;
}, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description?: string | undefined;
    properties?: Record<string, any> | undefined;
    required?: string[] | undefined;
    items?: any;
    enum?: any[] | undefined;
}>;
type JSONSchema$1 = z.infer<typeof JSONSchemaSchema$1>;
type ToolFunction$1<TParams = unknown, TResult = unknown> = (params: TParams) => Promise<TResult> | TResult;
/**
 * ConversationRelay tool with LLM-format conversion helpers.
 */
declare class CRTool<TParams = unknown, TResult = unknown> {
    readonly name: string;
    readonly description: string;
    readonly parameters: JSONSchema$1;
    readonly implementation: ToolFunction$1<TParams, TResult>;
    constructor(name: string, description: string, parameters: JSONSchema$1, implementation: ToolFunction$1<TParams, TResult>);
    toOpenAIFormat(): Record<string, unknown>;
    toAnthropicFormat(): Record<string, unknown>;
    toJSON(): string;
}

/**
 * Channel interface definitions
 *
 * Minimal contract that TAC requires from all channel implementations.
 * Channels use composition instead of inheritance.
 */

/**
 * Unified message shape emitted by all channels via the 'message' event.
 *
 * - messageType 'user': generate a response (prompt, SMS text, voice webhook text)
 * - messageType 'system': add to LLM context but don't necessarily respond (setup, interrupt, dtmf)
 * - metadata.type identifies the source message type for programmatic handling
 * - conversation bundle is only present in Conversation/Passive modes (Maestro)
 */
interface ChannelMessage {
    conversationId: ConversationId;
    messageType: 'user' | 'system';
    message: string;
    channel: ChannelType;
    metadata?: Record<string, unknown> | undefined;
    conversation?: {
        profileId?: ProfileId | undefined;
        memory?: TACMemoryResponse | undefined;
        author: string;
        serviceId?: string | undefined;
        authorInfo?: {
            address: string;
        } | undefined;
        startedAt: Date;
    } | undefined;
}
/**
 * Function that retrieves memory for a conversation session.
 * Injected into Maestro channels (VoiceChannel, MessagingChannel subclasses)
 * to decouple them from the TAC instance.
 */
type MemoryRetriever = (session: ConversationSession, query?: string) => Promise<TACMemoryResponse | undefined>;
/**
 * Base channel event callbacks
 */
interface ChannelEvents {
    onMessage?: (message: ChannelMessage) => Promise<void> | void;
    onConversationStarted?: (data: {
        session: ConversationSession;
    }) => void;
    onConversationEnded?: (data: {
        session: ConversationSession;
    }) => Promise<void> | void;
    onError?: (data: {
        error: Error;
        context?: Record<string, unknown>;
    }) => void;
}
/**
 * Base interface for all channel implementations
 *
 * Defines the minimal contract that TAC requires:
 * - Send responses to users
 * - Register event callbacks
 * - Provide session lookup
 * - Lifecycle management
 */
interface Channel {
    /**
     * Channel type identifier
     */
    readonly channelType: ChannelType;
    /**
     * Send a response message to the user
     *
     * @param conversationId - Conversation identifier
     * @param message - The message text to send
     * @param metadata - Optional metadata to include
     */
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Register event callback for TAC integration
     *
     * @param event - Event name (e.g., 'message', 'conversationStarted', 'conversationEnded', 'error')
     * @param callback - Event handler function
     */
    on(event: string, callback: (...args: any[]) => void): void;
    /**
     * Get conversation session by identifier
     *
     * @param conversationId - Conversation identifier
     * @returns Session if active, undefined otherwise
     */
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    /**
     * Check if conversation is active
     *
     * @param conversationId - Conversation identifier
     * @returns True if conversation is active
     */
    isConversationActive(conversationId: ConversationId): boolean;
    /**
     * Shutdown channel and cleanup resources
     */
    shutdown(): void;
    /**
     * List all tools registered on this channel (for LLM discovery).
     * Feed the results into your LLM via `tool.toOpenAIFormat()` / `toAnthropicFormat()`.
     */
    listTools(): CRTool[];
    /**
     * Register an additional tool on this channel. Overwrites any tool with the same name.
     */
    registerTool(tool: CRTool): void;
    /**
     * Execute a registered tool by name.
     *
     * VoiceChannel auto-ships any `outgoingMessage` the tool produces via the CR
     * WebSocket. MessagingChannel subclasses simply invoke the tool's implementation.
     *
     * @param conversationId - Conversation identifier to scope the execution
     * @param name - Registered tool name
     * @param args - Arguments forwarded to the tool's implementation
     * @returns The tool's result (to feed back to the LLM loop)
     */
    executeTool(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
}

/**
 * TAC Custom Parameters — Maestro-specific parameters for TwiML <Parameter> elements
 *
 * These are TAC's own structured parameters for bridging ConversationRelay calls
 * to Maestro Conversations. NOT generic CR parameters (those live in the CR package).
 */
declare const TACCustomParametersSchema: z.ZodObject<{
    conversation_id: z.ZodOptional<z.ZodString>;
    profile_id: z.ZodOptional<z.ZodString>;
    customer_participant_id: z.ZodOptional<z.ZodString>;
    ai_agent_participant_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    profile_id?: string | undefined;
    conversation_id?: string | undefined;
    customer_participant_id?: string | undefined;
    ai_agent_participant_id?: string | undefined;
}, {
    profile_id?: string | undefined;
    conversation_id?: string | undefined;
    customer_participant_id?: string | undefined;
    ai_agent_participant_id?: string | undefined;
}>;
type TACCustomParameters = z.infer<typeof TACCustomParametersSchema>;

/**
 * JSON Schema definition for tool parameters
 */
declare const JSONSchemaSchema: z.ZodObject<{
    type: z.ZodEnum<["object", "string", "number", "boolean", "array"]>;
    properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    items: z.ZodOptional<z.ZodAny>;
    enum: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description?: string | undefined;
    properties?: Record<string, any> | undefined;
    required?: string[] | undefined;
    items?: any;
    enum?: any[] | undefined;
}, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description?: string | undefined;
    properties?: Record<string, any> | undefined;
    required?: string[] | undefined;
    items?: any;
    enum?: any[] | undefined;
}>;
type JSONSchema = z.infer<typeof JSONSchemaSchema>;
/**
 * Tool function signature
 */
type ToolFunction<TParams = unknown, TResult = unknown> = (params: TParams) => Promise<TResult> | TResult;
/**
 * OpenAI tool format
 */
declare const OpenAIToolSchema: z.ZodObject<{
    type: z.ZodLiteral<"function">;
    function: z.ZodObject<{
        name: z.ZodString;
        description: z.ZodString;
        parameters: z.ZodObject<{
            type: z.ZodEnum<["object", "string", "number", "boolean", "array"]>;
            properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
            required: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            items: z.ZodOptional<z.ZodAny>;
            enum: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "string" | "number" | "boolean" | "object" | "array";
            description?: string | undefined;
            properties?: Record<string, any> | undefined;
            required?: string[] | undefined;
            items?: any;
            enum?: any[] | undefined;
        }, {
            type: "string" | "number" | "boolean" | "object" | "array";
            description?: string | undefined;
            properties?: Record<string, any> | undefined;
            required?: string[] | undefined;
            items?: any;
            enum?: any[] | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            description?: string | undefined;
            properties?: Record<string, any> | undefined;
            required?: string[] | undefined;
            items?: any;
            enum?: any[] | undefined;
        };
    }, {
        name: string;
        description: string;
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            description?: string | undefined;
            properties?: Record<string, any> | undefined;
            required?: string[] | undefined;
            items?: any;
            enum?: any[] | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    function: {
        name: string;
        description: string;
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            description?: string | undefined;
            properties?: Record<string, any> | undefined;
            required?: string[] | undefined;
            items?: any;
            enum?: any[] | undefined;
        };
    };
    type: "function";
}, {
    function: {
        name: string;
        description: string;
        parameters: {
            type: "string" | "number" | "boolean" | "object" | "array";
            description?: string | undefined;
            properties?: Record<string, any> | undefined;
            required?: string[] | undefined;
            items?: any;
            enum?: any[] | undefined;
        };
    };
    type: "function";
}>;
type OpenAITool = z.infer<typeof OpenAIToolSchema>;

/**
 * Tool execution context
 */
interface ToolContext {
    conversationId?: ConversationId;
    profileId?: ProfileId;
    memoryStoreId?: MemoryStoreId;
    channel?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Tool execution result
 */
declare const ToolExecutionResultSchema: z.ZodObject<{
    success: z.ZodBoolean;
    data: z.ZodOptional<z.ZodAny>;
    error: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    metadata?: Record<string, unknown> | undefined;
    error?: string | undefined;
    data?: any;
}, {
    success: boolean;
    metadata?: Record<string, unknown> | undefined;
    error?: string | undefined;
    data?: any;
}>;
type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;
/**
 * Built-in tool types
 */
declare const BuiltInTools: {
    readonly RETRIEVE_MEMORY: "retrieve_profile_memory";
    readonly SEND_MESSAGE: "send_message";
    readonly ESCALATE_TO_HUMAN: "escalate_to_human";
    readonly SEARCH_KNOWLEDGE: "search_knowledge";
};
type BuiltInToolName = (typeof BuiltInTools)[keyof typeof BuiltInTools];

/**
 * Conversation Intelligence Types
 *
 * These types represent the webhook payloads and configuration for
 * processing Conversation Intelligence operator results.
 */
/**
 * Participant in operator execution (e.g., CUSTOMER, AGENT)
 */
declare const CintelParticipantSchema: z.ZodObject<{
    type: z.ZodString;
    profileId: z.ZodOptional<z.ZodString>;
    mediaParticipantId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: string;
    profileId?: string | undefined;
    mediaParticipantId?: string | undefined;
}, {
    type: string;
    profileId?: string | undefined;
    mediaParticipantId?: string | undefined;
}>;
type CintelParticipant = z.infer<typeof CintelParticipantSchema>;
/**
 * Execution details for an operator result
 */
declare const ExecutionDetailsSchema: z.ZodObject<{
    participants: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        profileId: z.ZodOptional<z.ZodString>;
        mediaParticipantId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        profileId?: string | undefined;
        mediaParticipantId?: string | undefined;
    }, {
        type: string;
        profileId?: string | undefined;
        mediaParticipantId?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    participants?: {
        type: string;
        profileId?: string | undefined;
        mediaParticipantId?: string | undefined;
    }[] | undefined;
}, {
    participants?: {
        type: string;
        profileId?: string | undefined;
        mediaParticipantId?: string | undefined;
    }[] | undefined;
}>;
type ExecutionDetails = z.infer<typeof ExecutionDetailsSchema>;
/**
 * Operator metadata
 */
declare const OperatorSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name?: string | undefined;
}, {
    id: string;
    name?: string | undefined;
}>;
type Operator = z.infer<typeof OperatorSchema>;
/**
 * Individual operator result from Conversation Intelligence
 */
declare const OperatorResultSchema: z.ZodObject<{
    id: z.ZodString;
    operator: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name?: string | undefined;
    }, {
        id: string;
        name?: string | undefined;
    }>;
    outputFormat: z.ZodString;
    result: z.ZodUnknown;
    dateCreated: z.ZodString;
    referenceIds: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    executionDetails: z.ZodOptional<z.ZodObject<{
        participants: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodString;
            profileId: z.ZodOptional<z.ZodString>;
            mediaParticipantId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: string;
            profileId?: string | undefined;
            mediaParticipantId?: string | undefined;
        }, {
            type: string;
            profileId?: string | undefined;
            mediaParticipantId?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        participants?: {
            type: string;
            profileId?: string | undefined;
            mediaParticipantId?: string | undefined;
        }[] | undefined;
    }, {
        participants?: {
            type: string;
            profileId?: string | undefined;
            mediaParticipantId?: string | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    operator: {
        id: string;
        name?: string | undefined;
    };
    outputFormat: string;
    dateCreated: string;
    referenceIds: string[];
    result?: unknown;
    executionDetails?: {
        participants?: {
            type: string;
            profileId?: string | undefined;
            mediaParticipantId?: string | undefined;
        }[] | undefined;
    } | undefined;
}, {
    id: string;
    operator: {
        id: string;
        name?: string | undefined;
    };
    outputFormat: string;
    dateCreated: string;
    result?: unknown;
    referenceIds?: string[] | undefined;
    executionDetails?: {
        participants?: {
            type: string;
            profileId?: string | undefined;
            mediaParticipantId?: string | undefined;
        }[] | undefined;
    } | undefined;
}>;
type OperatorResult = z.infer<typeof OperatorResultSchema>;
/**
 * Intelligence configuration metadata
 */
declare const IntelligenceConfigurationSchema: z.ZodObject<{
    id: z.ZodString;
    friendlyName: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    friendlyName?: string | undefined;
}, {
    id: string;
    friendlyName?: string | undefined;
}>;
type IntelligenceConfiguration = z.infer<typeof IntelligenceConfigurationSchema>;
/**
 * Full webhook payload for operator result events
 */
declare const OperatorResultEventSchema: z.ZodObject<{
    accountId: z.ZodString;
    conversationId: z.ZodString;
    memoryStoreId: z.ZodOptional<z.ZodString>;
    intelligenceConfiguration: z.ZodObject<{
        id: z.ZodString;
        friendlyName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        friendlyName?: string | undefined;
    }, {
        id: string;
        friendlyName?: string | undefined;
    }>;
    operatorResults: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        operator: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name?: string | undefined;
        }, {
            id: string;
            name?: string | undefined;
        }>;
        outputFormat: z.ZodString;
        result: z.ZodUnknown;
        dateCreated: z.ZodString;
        referenceIds: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
        executionDetails: z.ZodOptional<z.ZodObject<{
            participants: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodString;
                profileId: z.ZodOptional<z.ZodString>;
                mediaParticipantId: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }, {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            participants?: {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }[] | undefined;
        }, {
            participants?: {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        operator: {
            id: string;
            name?: string | undefined;
        };
        outputFormat: string;
        dateCreated: string;
        referenceIds: string[];
        result?: unknown;
        executionDetails?: {
            participants?: {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }[] | undefined;
        } | undefined;
    }, {
        id: string;
        operator: {
            id: string;
            name?: string | undefined;
        };
        outputFormat: string;
        dateCreated: string;
        result?: unknown;
        referenceIds?: string[] | undefined;
        executionDetails?: {
            participants?: {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }[] | undefined;
        } | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    conversationId: string;
    accountId: string;
    intelligenceConfiguration: {
        id: string;
        friendlyName?: string | undefined;
    };
    operatorResults: {
        id: string;
        operator: {
            id: string;
            name?: string | undefined;
        };
        outputFormat: string;
        dateCreated: string;
        referenceIds: string[];
        result?: unknown;
        executionDetails?: {
            participants?: {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }[] | undefined;
        } | undefined;
    }[];
    memoryStoreId?: string | undefined;
}, {
    conversationId: string;
    accountId: string;
    intelligenceConfiguration: {
        id: string;
        friendlyName?: string | undefined;
    };
    operatorResults: {
        id: string;
        operator: {
            id: string;
            name?: string | undefined;
        };
        outputFormat: string;
        dateCreated: string;
        result?: unknown;
        referenceIds?: string[] | undefined;
        executionDetails?: {
            participants?: {
                type: string;
                profileId?: string | undefined;
                mediaParticipantId?: string | undefined;
            }[] | undefined;
        } | undefined;
    }[];
    memoryStoreId?: string | undefined;
}>;
type OperatorResultEvent = z.infer<typeof OperatorResultEventSchema>;
/**
 * Result of processing an operator result event
 */
declare const OperatorProcessingResultSchema: z.ZodObject<{
    success: z.ZodBoolean;
    eventType: z.ZodOptional<z.ZodString>;
    skipped: z.ZodDefault<z.ZodBoolean>;
    skipReason: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    createdCount: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    skipped: boolean;
    createdCount: number;
    error?: string | undefined;
    eventType?: string | undefined;
    skipReason?: string | undefined;
}, {
    success: boolean;
    error?: string | undefined;
    eventType?: string | undefined;
    skipped?: boolean | undefined;
    skipReason?: string | undefined;
    createdCount?: number | undefined;
}>;
type OperatorProcessingResult = z.infer<typeof OperatorProcessingResultSchema>;
/**
 * Conversation Intelligence configuration for TAC
 */
declare const ConversationIntelligenceConfigSchema: z.ZodObject<{
    configurationId: z.ZodString;
    observationOperatorSid: z.ZodOptional<z.ZodString>;
    summaryOperatorSid: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    configurationId: string;
    observationOperatorSid?: string | undefined;
    summaryOperatorSid?: string | undefined;
}, {
    configurationId: string;
    observationOperatorSid?: string | undefined;
    summaryOperatorSid?: string | undefined;
}>;
type ConversationIntelligenceConfig = z.infer<typeof ConversationIntelligenceConfigSchema>;
/**
 * Summary item for batch creation
 */
declare const ConversationSummaryItemSchema: z.ZodObject<{
    content: z.ZodString;
    conversationId: z.ZodString;
    occurredAt: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    content: string;
    occurredAt: string;
    conversationId: string;
    source?: string | undefined;
}, {
    content: string;
    occurredAt: string;
    conversationId: string;
    source?: string | undefined;
}>;
type ConversationSummaryItem = z.infer<typeof ConversationSummaryItemSchema>;

/**
 * Branded types for Knowledge IDs
 */
type KnowledgeBaseId = string & {
    readonly _brand: 'KnowledgeBaseId';
};
type KnowledgeId = string & {
    readonly _brand: 'KnowledgeId';
};
/**
 * Type guard for KnowledgeBaseId
 */
declare function isKnowledgeBaseId(value: string): value is KnowledgeBaseId;
/**
 * Type guard for KnowledgeId
 */
declare function isKnowledgeId(value: string): value is KnowledgeId;
/**
 * Knowledge base status enum
 */
declare const KnowledgeBaseStatusSchema: z.ZodEnum<["QUEUED", "PROVISIONING", "ACTIVE", "FAILED", "DELETING"]>;
type KnowledgeBaseStatus = z.infer<typeof KnowledgeBaseStatusSchema>;
/**
 * Knowledge base metadata (from GET endpoint)
 */
declare const KnowledgeBaseSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["QUEUED", "PROVISIONING", "ACTIVE", "FAILED", "DELETING"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    version: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    status: "FAILED" | "QUEUED" | "PROVISIONING" | "ACTIVE" | "DELETING";
    id: string;
    createdAt: string;
    updatedAt: string;
    displayName: string;
    version: number;
    description?: string | undefined;
}, {
    status: "FAILED" | "QUEUED" | "PROVISIONING" | "ACTIVE" | "DELETING";
    id: string;
    createdAt: string;
    updatedAt: string;
    displayName: string;
    version: number;
    description?: string | undefined;
}>;
type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
/**
 * Search result chunk (from POST search endpoint)
 *
 * Combines base KnowledgeChunk data with semantic similarity scoring for search results.
 * The Knowledge API returns up to 20 chunks per search, ranked by relevance.
 *
 * @remarks
 * **SCHEMA VERIFIED**: Matches official Knowledge API v2 OpenAPI specification.
 *
 * @property content - The chunk content (max 65,536 characters / ~64KB)
 * @property createdAt - ISO 8601 date-time when the chunk was created
 * @property score - Semantic similarity score (0-1, higher = more relevant). **Always returned by API** - changed from optional to required to match actual API behavior.
 * @property knowledgeId - Unique identifier of the knowledge source (TTID format)
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_knowledge_v2.json
 */
declare const KnowledgeChunkResultSchema: z.ZodObject<{
    content: z.ZodString;
    knowledgeId: z.ZodString;
    createdAt: z.ZodString;
    score: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    content: string;
    createdAt: string;
    knowledgeId: string;
    score: number;
}, {
    content: string;
    createdAt: string;
    knowledgeId: string;
    score: number;
}>;
type KnowledgeChunkResult = Omit<z.infer<typeof KnowledgeChunkResultSchema>, 'knowledgeId'> & {
    knowledgeId: KnowledgeId;
};
/**
 * Search response wrapper
 */
declare const KnowledgeSearchResponseSchema: z.ZodObject<{
    chunks: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        knowledgeId: z.ZodString;
        createdAt: z.ZodString;
        score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: string;
        createdAt: string;
        knowledgeId: string;
        score: number;
    }, {
        content: string;
        createdAt: string;
        knowledgeId: string;
        score: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    chunks: {
        content: string;
        createdAt: string;
        knowledgeId: string;
        score: number;
    }[];
}, {
    chunks: {
        content: string;
        createdAt: string;
        knowledgeId: string;
        score: number;
    }[];
}>;
type KnowledgeSearchResponse = z.infer<typeof KnowledgeSearchResponseSchema>;

/**
 * TAC Configuration class with Python-like static factory methods
 *
 * Example usage:
 * ```typescript
 * // Load from environment variables
 * const config = TACConfig.fromEnv();
 *
 * // Or create manually
 * const config = new TACConfig({
 *   accountSid: 'ACxxxx',
 *   // ...
 * });
 * ```
 */
declare class TACConfig {
    readonly accountSid: string;
    readonly authToken: string;
    readonly apiKey: string;
    readonly apiSecret: string;
    readonly phoneNumber: string;
    readonly memoryStoreId?: MemoryStoreId;
    readonly traitGroups?: string[];
    readonly conversationConfigurationId: string;
    readonly voicePublicDomain?: string;
    readonly cintelConfigurationId?: string;
    readonly cintelObservationOperatorSid?: string;
    readonly cintelSummaryOperatorSid?: string;
    /** Optional Twilio region subdomain for API routing (e.g. transforms base URLs to `https://{product}.{region}.twilio.com`) */
    readonly region?: string;
    constructor(data: TACConfigData);
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
     * - MEMORY_STORE_ID: Memory Store ID (optional, for Twilio Memory)
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
    static fromEnv(): TACConfig;
    /**
     * Get basic auth credentials for Twilio APIs
     */
    getBasicAuthCredentials(): {
        username: string;
        password: string;
    };
}

/**
 * Logger type that can be either Pino logger or Fastify's logger
 */
type Logger = pino.Logger;
/**
 * Create a Pino logger with configured settings
 *
 * @param options - Logger configuration options
 * @returns Configured Pino logger
 */
declare function createLogger(options?: {
    level?: string;
    pretty?: boolean;
    name?: string;
}): Logger;

/**
 * Base HTTP client for Twilio API services
 *
 * Features:
 * - Automatic Basic Auth using Twilio API credentials
 * - User-Agent header injection
 * - 30-second request timeout
 * - HTTP redirect following (up to 5 redirects) with auth preservation
 * - Automatic retry (up to 3 retries / 4 total attempts with exponential backoff)
 * - Error logging for failed requests
 * - Automatic JSON serialization/deserialization
 */
declare abstract class BaseClient {
    protected readonly baseUrl: string;
    protected readonly logger: Logger;
    protected readonly axiosInstance: AxiosInstance;
    constructor(baseUrl: string, config: TACConfig, logger?: Logger);
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
    protected makeRequest<TResponse = unknown>(url: string, method: string, data?: unknown, params?: Record<string, string>): Promise<TResponse>;
}

/**
 * Memory client for interacting with Twilio Memory Service
 */
declare class MemoryClient extends BaseClient {
    constructor(config: TACConfig, logger?: Logger);
    /**
     * Retrieve memories for a specific profile
     *
     * @param serviceSid - The memory service SID
     * @param profileId - The profile ID to retrieve memories for
     * @param request - Optional request parameters for filtering results
     * @returns Promise containing memory retrieval response
     */
    retrieveMemories(serviceSid: MemoryStoreId, profileId: ProfileId, request?: Partial<MemoryRetrievalRequest>): Promise<MemoryRetrievalResponse>;
    /**
     * Find profiles that contain a specific identifier value
     *
     * @param serviceSid - The memory service SID
     * @param idType - Identifier type (e.g., 'phone', 'email')
     * @param value - Raw value captured for the identifier
     * @returns Promise containing profile lookup response with normalized value and matching profile IDs
     */
    lookupProfile(serviceSid: MemoryStoreId, idType: string, value: string): Promise<ProfileLookupResponse>;
    /**
     * Fetch profile information with traits
     *
     * @param serviceSid - The memory service SID
     * @param profileId - The profile ID to fetch
     * @param traitGroups - Optional list of trait group names to include
     * @returns Promise containing profile response with ID, created timestamp, and traits
     */
    getProfile(serviceSid: MemoryStoreId, profileId: ProfileId, traitGroups?: string[]): Promise<ProfileResponse>;
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
    createObservation(serviceSid: MemoryStoreId, profileId: ProfileId, content: string, source?: string, conversationIds?: ConversationId[], occurredAt?: string): Promise<CreateObservationResponse>;
    /**
     * Create conversation summaries for a profile
     *
     * @param serviceSid - The memory service SID
     * @param profileId - The profile ID to create summaries for
     * @param summaries - Array of summary items to create
     * @returns Promise containing a success message for the created conversation summaries
     */
    createConversationSummaries(serviceSid: MemoryStoreId, profileId: ProfileId, summaries: Array<{
        content: string;
        conversationId: ConversationId;
        occurredAt: string;
        source?: string;
    }>): Promise<CreateConversationSummariesResponse>;
}

/**
 * Conversation client for interacting with Twilio Conversations Service
 */
declare class ConversationClient extends BaseClient {
    private readonly conversationConfigurationId;
    constructor(config: TACConfig, logger?: Logger);
    /**
     * Send a communication using the Conversation Orchestrator Send API
     *
     * @param conversationId - The conversation ID
     * @param request - Send communication request
     * @returns Promise containing communication response
     */
    sendCommunication(conversationId: ConversationId, request: SendCommunicationRequest): Promise<SendCommunicationResponse>;
    /**
     * List communications for a conversation
     *
     * @param conversationId - The conversation ID
     * @returns Promise containing array of communications
     */
    listCommunications(conversationId: ConversationId): Promise<Communication[]>;
    /**
     * Create a new conversation
     *
     * @param name - Optional conversation name
     * @returns Promise containing conversation response
     */
    createConversation(name?: string): Promise<ConversationResponse>;
    /**
     * Add a participant to a conversation
     *
     * @param conversationId - The conversation ID
     * @param addresses - Array of participant addresses
     * @param participantType - Type of participant (CUSTOMER, AI_AGENT, HUMAN_AGENT)
     * @returns Promise containing participant response
     */
    addParticipant(conversationId: ConversationId, addresses: ConversationAddress[], participantType: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_AGENT'): Promise<ConversationParticipant>;
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
    addOrFetchParticipant(conversationId: ConversationId, addresses: ConversationAddress[], participantType: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_AGENT'): Promise<ConversationParticipant>;
    /**
     * List participants in a conversation
     *
     * @param conversationId - The conversation ID
     * @returns Promise containing array of participants
     */
    listParticipants(conversationId: ConversationId): Promise<ConversationParticipant[]>;
    /**
     * List conversations with optional filters
     *
     * @param filters - Optional filters (channelId, status)
     * @returns Promise containing array of conversations
     */
    listConversations(filters?: {
        channelId?: string;
        status?: string[];
    }): Promise<ConversationResponse[]>;
    /**
     * Update conversation status
     *
     * @param conversationId - The conversation ID
     * @param status - New status (ACTIVE, INACTIVE, CLOSED)
     * @returns Promise containing updated conversation
     */
    updateConversation(conversationId: ConversationId, status: 'ACTIVE' | 'INACTIVE' | 'CLOSED'): Promise<ConversationResponse>;
    /**
     * Retrieve the details for a single configuration
     *
     * @param configurationId - The configuration ID to retrieve
     * @returns Promise containing configuration details
     */
    getConfiguration(configurationId: string): Promise<ConversationConfiguration>;
}

/**
 * Knowledge client for interacting with Twilio Knowledge Service
 */
declare class KnowledgeClient extends BaseClient {
    constructor(config: TACConfig, logger?: Logger);
    /**
     * Get knowledge base metadata
     *
     * @param knowledgeBaseId - The knowledge base ID (format: know_knowledgebase_*)
     * @returns Promise containing knowledge base metadata
     */
    getKnowledgeBase(knowledgeBaseId: KnowledgeBaseId): Promise<KnowledgeBase>;
    /**
     * Search knowledge base for relevant content
     *
     * @param knowledgeBaseId - The knowledge base ID (format: know_knowledgebase_*)
     * @param query - Search query (max 2048 characters)
     * @param topK - Maximum number of results to return (default: 5, max: 20)
     * @param knowledgeIds - Optional list of knowledge IDs to filter results
     * @returns Promise containing array of search result chunks
     */
    searchKnowledgeBase(knowledgeBaseId: KnowledgeBaseId, query: string, topK?: number, knowledgeIds?: KnowledgeId[]): Promise<KnowledgeChunkResult[]>;
}

interface TACOptions {
    config?: TACConfig | TACConfigData;
    logger?: Logger;
}
/**
 * Callback function signatures for TAC events
 */
type MessageReadyCallback = (message: ChannelMessage) => Promise<void> | void;
type ErrorCallback = (params: {
    error: Error;
    context?: Record<string, unknown> | undefined;
}) => void;
type HandoffCallback = (params: {
    /** Conversation identifier */
    conversationId: ConversationId;
    profileId: ProfileId | undefined;
    reason: string;
    session: ConversationSession;
}) => Promise<void> | void;
type ConversationEndedCallback = (params: {
    session: ConversationSession;
}) => Promise<void> | void;
/**
 * Main Twilio Agent Connect class
 *
 * Central orchestrator that manages configuration, channels, callbacks,
 * and coordinates between memory, conversations, and LLM integrations.
 */
declare class TAC {
    private readonly config;
    readonly logger: Logger;
    private readonly memoryClient?;
    private readonly knowledgeClient?;
    private readonly conversationClient;
    private readonly channels;
    private readonly cintelProcessor?;
    private messageReadyCallback?;
    private handoffCallback?;
    private conversationEndedCallback?;
    private errorCallback?;
    constructor(options?: TACOptions);
    /**
     * Register a channel with the framework
     */
    registerChannel(channel: Channel): void;
    /**
     * Set up event listeners for a channel.
     *
     * All channels emit three unified events:
     * - 'message': ChannelMessage (user or system messages)
     * - 'conversationEnded': { session: ConversationSession }
     * - 'error': { error: Error; context?: Record<string, unknown> }
     */
    private setupChannelEventListeners;
    /**
     * Handle unified message from channels — pure pass-through to developer callback
     */
    private handleMessage;
    /**
     * Register callback for when messages are ready to be processed
     */
    onMessageReady(callback: MessageReadyCallback): void;
    /**
     * Register callback for channel errors
     */
    onError(callback: ErrorCallback): void;
    /**
     * Register callback for human handoff
     */
    onHandoff(callback: HandoffCallback): void;
    /**
     * Register callback for when a conversation ends.
     *
     * The callback is triggered by channels when a conversation is closed
     * (e.g., SMS conversation status changed to CLOSED, or voice WebSocket
     * disconnected). The callback receives the full ConversationSession before
     * it is cleaned up.
     */
    onConversationEnded(callback: ConversationEndedCallback): void;
    /**
     * Trigger handoff callback
     */
    triggerHandoff(conversationId: ConversationId, reason: string): Promise<void>;
    /**
     * Get channel by conversation ID
     */
    private getChannelByConversationId;
    /**
     * Get registered channel by type
     */
    getChannel<T extends Channel>(channelType: ChannelType): T | undefined;
    /**
     * Get configuration
     */
    getConfig(): TACConfig;
    /**
     * Get memory client for advanced memory operations
     * Returns undefined if memory credentials are not configured
     */
    getMemoryClient(): MemoryClient | undefined;
    /**
     * Get knowledge client for knowledge base operations
     * Returns undefined if memory credentials are not configured
     */
    getKnowledgeClient(): KnowledgeClient | undefined;
    /**
     * Get conversation client for advanced conversation operations
     */
    getConversationClient(): ConversationClient;
    /**
     * Create a MemoryRetriever function for channel dependency injection.
     * Returns undefined if memory is not configured.
     */
    createMemoryRetriever(): MemoryRetriever | undefined;
    /**
     * Get channel dependencies for creating channels (VoiceChannel, MessagingChannel subclasses).
     * Returns all dependencies needed to construct a channel.
     */
    getChannelDeps(): {
        config: TACConfig;
        logger: Logger;
        conversationClient: ConversationClient;
        memoryRetriever: MemoryRetriever | undefined;
    };
    /**
     * Check if Twilio Memory functionality is enabled
     *
     * @returns true if memory client is initialized, false otherwise
     */
    isMemoryEnabled(): boolean;
    /**
     * Check if Knowledge functionality is enabled
     *
     * @returns true if knowledge client is initialized, false otherwise
     */
    isKnowledgeEnabled(): boolean;
    /**
     * Check if Conversation Intelligence processing is enabled
     *
     * @returns true if CI processor is initialized, false otherwise
     */
    isCintelEnabled(): boolean;
    /**
     * Process a Conversation Intelligence operator result webhook event
     *
     * @param payload - The raw webhook payload from CI
     * @returns Promise containing the processing result
     * @throws Error if CI processor is not initialized
     */
    processCintelEvent(payload: unknown): Promise<OperatorProcessingResult>;
    /**
     * Retrieve memories from Memory API or fallback to Conversations API
     *
     * @param session - Conversation session context
     * @param query - Optional semantic search query
     * @returns Promise containing TACMemoryResponse wrapper providing unified access to memory data.
     *
     * When Memory is configured:
     * - observations, summaries, and communications available
     * - communications include author name and type
     *
     * When using Maestro fallback:
     * - observations and summaries are empty arrays
     * - communications have basic fields only (no author name/type)
     */
    retrieveMemory(session: ConversationSession, query?: string): Promise<TACMemoryResponse>;
    /**
     * Fetch profile information with traits
     *
     * @param profileId - Profile ID to fetch
     * @returns Promise containing profile response or undefined if not available
     */
    fetchProfile(profileId: ProfileId): Promise<ProfileResponse | undefined>;
    /**
     * Shutdown TAC and cleanup resources
     */
    shutdown(): void;
}

/**
 * Messaging webhook event types from Twilio Conversations Service
 * Supports the v2 format for SMS and Chat channels
 *
 * @remarks
 * **SCHEMA VERIFICATION NEEDED**: This webhook payload structure is inferred from
 * internal usage patterns and observation of actual webhook events. The official
 * Twilio Maestro Conversations documentation does not explicitly specify the complete
 * webhook event schema. This should be verified with the Twilio API team to ensure
 * it matches the actual webhook contract.
 *
 * Key event types used: CONVERSATION_CREATED, COMMUNICATION_CREATED, CONVERSATION_UPDATED,
 * PARTICIPANT_ADDED, PARTICIPANT_REMOVED
 *
 * @see https://docs.twilio.com/docs/platform/tac/core-concepts (general TAC docs)
 */
interface MessagingWebhookPayload {
    eventType: string;
    timestamp?: string;
    data?: {
        id?: string;
        conversationId?: string;
        accountId?: string;
        serviceId?: string;
        status?: string;
        participantType?: string;
        profileId?: string;
        channelId?: string;
        author?: {
            address?: string;
            channel?: string;
            participantId?: string;
        };
        content?: {
            type?: string;
            text?: string;
        };
        recipients?: Array<{
            address?: string;
            channel?: string;
            participantId?: string;
            deliveryStatus?: string;
        }>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
/**
 * Messaging channel configuration options
 */
interface MessagingChannelConfig {
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
}
/**
 * Abstract Messaging Channel base class for SMS and Chat channels
 *
 * Provides shared webhook processing logic for messaging channels
 * (SMS and Chat) that use the Conversations Service webhooks.
 */
declare abstract class MessagingChannel implements Channel {
    protected readonly config: TACConfig;
    protected readonly logger: Logger;
    protected readonly conversationClient: ConversationClient;
    protected readonly activeConversations: Map<ConversationId, ConversationSession>;
    protected readonly callbacks: ChannelEvents;
    private readonly memoryRetriever?;
    private readonly processedTokens;
    private readonly maxTrackedTokens;
    private readonly tools;
    constructor(deps: {
        config: TACConfig;
        logger: Logger;
        conversationClient: ConversationClient;
        memoryRetriever?: MemoryRetriever | undefined;
    }, channelConfig?: MessagingChannelConfig);
    /**
     * Check if a webhook has already been processed, and if not, record the token immediately.
     * This is intentionally a single synchronous check-and-record to prevent race conditions
     * where a duplicate arrives while the first request is still awaiting async work.
     * Uses a sliding window with FIFO eviction at capacity.
     */
    private isDuplicateWebhook;
    /**
     * Abstract method to check if a message is from the bot itself
     * Subclasses implement channel-specific filtering (e.g., by phone number or agent address)
     */
    protected abstract isOwnMessage(authorAddress: string): boolean;
    /**
     * Get the channel type (implemented by subclasses)
     */
    abstract get channelType(): ChannelType;
    /**
     * Send a response back to the user (implemented by subclasses)
     */
    abstract sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Start a new conversation session
     */
    protected startConversation(conversationId: ConversationId, profileId?: ProfileId, serviceId?: string): ConversationSession;
    /**
     * End a conversation session.
     *
     * Triggers the onConversationEnded callback BEFORE removing the session,
     * so the callback receives the full ConversationSession data.
     * Errors in the callback do not prevent session cleanup.
     */
    protected endConversation(conversationId: ConversationId): Promise<void>;
    /**
     * Get an active conversation session
     */
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    /**
     * Check if a conversation is active
     */
    isConversationActive(conversationId: ConversationId): boolean;
    /**
     * Handle errors with proper context
     */
    protected handleError(error: Error, context?: Record<string, unknown>): void;
    /**
     * Cleanup resources when shutting down
     */
    shutdown(): void;
    /**
     * Register event callbacks (override for messaging-specific events)
     */
    on(event: string, callback: (...args: any[]) => void): void;
    /**
     * List tools registered on this channel (for LLM discovery).
     * MessagingChannel starts with an empty registry; future messaging tools
     * (e.g., send_mms) can be added via `registerTool`.
     */
    listTools(): CRTool[];
    /**
     * Register a tool on this channel. Overwrites any tool with the same name.
     */
    registerTool(tool: CRTool): void;
    /**
     * Execute a registered tool by name.
     *
     * Messaging tools are plain side-effect functions — unlike VoiceChannel,
     * there is no `outgoingMessage` auto-shipping. The tool's result is
     * returned unchanged for the caller to feed back to the LLM loop.
     */
    executeTool(_conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
    /**
     * Check if this webhook event belongs to this channel.
     * Returns false if the event is clearly for a different channel type.
     */
    private isEventForThisChannel;
    /**
     * Process messaging channel webhook from Twilio Conversations Service
     */
    processWebhook(payload: unknown, idempotencyToken?: string): Promise<void>;
    /**
     * Handle conversation creation event
     */
    private handleConversationCreated;
    /**
     * Handle participant added event
     */
    private handleParticipantAdded;
    /**
     * Handle new communication event (incoming message)
     */
    private handleCommunicationCreated;
    /**
     * Handle conversation updated event
     */
    private handleConversationUpdated;
    /**
     * Extract conversation ID from webhook payload
     */
    protected extractConversationId(payload: unknown): ConversationId | null;
    /**
     * Extract profile ID from webhook payload
     */
    protected extractProfileId(payload: unknown): ProfileId | null;
    /**
     * Validate messaging channel webhook payload structure
     */
    protected validateWebhookPayload(payload: unknown): boolean;
}

/**
 * SMS Channel implementation for Twilio Conversations Service
 *
 * Handles SMS conversations through webhook events from Twilio.
 * Automatically retrieves user memory and manages conversation lifecycle.
 */
declare class SMSChannel extends MessagingChannel {
    get channelType(): ChannelType;
    /**
     * Check if a message is from the bot itself (by phone number)
     */
    protected isOwnMessage(authorAddress: string): boolean;
    /**
     * Send SMS response using Conversation Orchestrator Send API
     */
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * Chat channel configuration options
 */
interface ChatChannelConfig {
    /** Chat agent identity string (defaults to 'ai-assistant') */
    agentAddress?: string | undefined;
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
}
/**
 * Chat Channel implementation for Twilio Conversations Service
 *
 * Handles web chat conversations through webhook events from Twilio.
 * Uses identity-based addressing instead of phone numbers.
 * Automatically creates AI_AGENT participant if needed and manages conversation lifecycle.
 */
declare class ChatChannel extends MessagingChannel {
    private readonly agentAddress;
    constructor(deps: {
        config: TACConfig;
        logger: Logger;
        conversationClient: ConversationClient;
        memoryRetriever?: MemoryRetriever | undefined;
    }, config?: ChatChannelConfig);
    get channelType(): ChannelType;
    /**
     * Check if a message is from the bot itself (by agent address)
     */
    protected isOwnMessage(authorAddress: string): boolean;
    /**
     * Send chat response using Conversation Orchestrator Send API
     */
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * VoiceChannel — CR + Maestro voice channel
 *
 * Handles voice conversations using ConversationRelay WebSocket protocol
 * WITH full Maestro Conversations Service integration. Always has ConversationClient.
 * Uses ConversationRelay from the CR package for WebSocket protocol handling.
 *
 * All CR events are emitted as unified 'message' events with conversation bundle.
 */

/**
 * Voice Channel — Maestro-backed voice (CR WebSocket + Maestro Conversations)
 *
 * Uses ConversationRelay for WebSocket protocol handling. Always has ConversationClient.
 * Creates Maestro conversations and participants in handleIncomingCall().
 * Emits all CR events as unified 'message' events with conversation bundle.
 */
declare class VoiceChannel implements Channel {
    protected readonly config: TACConfig;
    protected readonly logger: Logger;
    protected readonly conversationClient: ConversationClient;
    protected readonly activeConversations: Map<ConversationId, ConversationSession>;
    protected readonly callbacks: ChannelEvents;
    private readonly conversationRelay;
    private readonly callSidToConversationId;
    private readonly memoryRetriever?;
    constructor(deps: {
        config: TACConfig;
        logger: Logger;
        conversationClient: ConversationClient;
        memoryRetriever?: MemoryRetriever | undefined;
    });
    get channelType(): ChannelType;
    private emitMessage;
    private handleSetupFromRelay;
    private handlePromptFromRelay;
    private handleInterruptFromRelay;
    private handleCloseFromRelay;
    private handleSetupMessage;
    private handlePromptMessage;
    private handleWebSocketDisconnect;
    getWebsocket(conversationId: ConversationId): WebSocket | null;
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
    on(event: string, callback: (...args: any[]) => void): void;
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    isConversationActive(conversationId: ConversationId): boolean;
    shutdown(): void;
    handleWebSocketConnection(ws: WebSocket): void;
    /**
     * List tools registered on this channel (for LLM discovery).
     * Includes CR built-in protocol tools (playMedia, sendDigits, switchLanguage, endCall)
     * plus any user-registered tools.
     */
    listTools(): CRTool[];
    /**
     * Register a tool on this channel. Overwrites any tool with the same name.
     */
    registerTool(tool: CRTool): void;
    /**
     * Execute a registered tool by name.
     *
     * If the tool returns an `outgoingMessage` (CR protocol tool), it is validated
     * and auto-shipped via the ConversationRelay WebSocket. The tool's result is
     * returned unchanged for the caller to feed back to the LLM loop.
     */
    executeTool(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
    /**
     * Send DTMF digits to the caller.
     * @throws if no active CallSid is mapped to the conversationId
     */
    sendDigits(conversationId: ConversationId, digits: string): void;
    /**
     * Play media from a URL to the caller.
     * @throws if no active CallSid is mapped to the conversationId
     */
    sendPlay(conversationId: ConversationId, source: string, options?: {
        loop?: number;
        interruptible?: boolean;
        preemptible?: boolean;
    }): void;
    /**
     * End the call with optional handoff data.
     * @throws if no active CallSid is mapped to the conversationId
     */
    endCall(conversationId: ConversationId, handoffData?: Record<string, unknown>): void;
    private findCallSid;
    protected startConversation(conversationId: ConversationId, profileId?: ProfileId, serviceId?: string): ConversationSession;
    protected endConversation(conversationId: ConversationId): Promise<void>;
    protected handleError(error: Error, context?: Record<string, unknown>): void;
    handleIncomingCall(options: {
        toNumber: string;
        fromNumber: string;
        callSid?: string;
        actionUrl?: string;
        conversationRelayConfig: ConversationRelayConfig;
    }): Promise<string>;
    handleConversationRelayCallback(payload: ConversationRelayCallbackPayload, handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>): Promise<{
        status: number;
        content: string;
        contentType: string;
    }>;
    private closeConversationsForCall;
}

/**
 * VoiceWebhookChannel — Webhook-only voice channel for custom CR server setups
 *
 * Handles voice conversations via Maestro webhooks ONLY (no ConversationRelay).
 * Customer has their own CR server; TAC handles Maestro orchestration.
 * Follows the same MessagingChannel pattern as SMSChannel and ChatChannel.
 *
 * Messages arrive as transcribed text via COMMUNICATION_CREATED with author.channel='VOICE'.
 * Responses are sent via Maestro Send API with channel='VOICE'.
 */

/**
 * VoiceWebhookChannel configuration options
 */
interface VoiceWebhookChannelConfig {
    /** Voice agent address identifier (defaults to the configured Twilio phone number) */
    agentAddress?: string | undefined;
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
}
/**
 * Voice Webhook Channel — webhook-only (Maestro webhooks, no CR WebSocket)
 *
 * Extends MessagingChannel with channelType='voice' and filters for
 * author.channel='VOICE' in webhook events. Responses use Maestro Send API.
 */
declare class VoiceWebhookChannel extends MessagingChannel {
    private readonly agentAddress;
    constructor(deps: {
        config: TACConfig;
        logger: Logger;
        conversationClient: ConversationClient;
        memoryRetriever?: MemoryRetriever | undefined;
    }, config?: VoiceWebhookChannelConfig);
    get channelType(): ChannelType;
    /**
     * Check if a message is from the bot itself (by agent address/phone number)
     */
    protected isOwnMessage(authorAddress: string): boolean;
    /**
     * Send voice response using Maestro Send API.
     *
     * The Send API records the communication in Maestro.
     * The customer's own CR server is responsible for actual TTS playback.
     * channelId (CallSid) is required for VOICE participants.
     */
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * Result of Flex handoff logic
 */
interface FlexHandoffResult {
    success: boolean;
    status: number;
    content: string;
    contentType: string;
}
/**
 * Handle Flex handoff logic for Twilio webhook
 *
 * Generates TwiML to enqueue a call to a Twilio Flex workflow for human agent handoff.
 *
 * @param formData - Form data from webhook request containing HandoffData and CallStatus
 * @param flexWorkflowSid - Flex TaskRouter workflow SID (starts with WW)
 * @returns Result with status, content (TwiML or error), and content type
 */
declare function handleFlexHandoffLogic(formData: Record<string, string>, flexWorkflowSid: string | undefined): FlexHandoffResult;

/**
 * Processor for Conversation Intelligence operator result webhooks
 *
 * Processes operator results from CI and creates observations or summaries
 * in the Memory service based on the operator configuration.
 */
declare class OperatorResultProcessor {
    private readonly memoryClient;
    private readonly config;
    private readonly logger;
    constructor(memoryClient: MemoryClient, config: ConversationIntelligenceConfig, logger?: Logger);
    /**
     * Process an operator result event webhook payload
     *
     * @param payload - The raw webhook payload
     * @returns Processing result indicating success/failure and details
     */
    processEvent(payload: unknown): Promise<OperatorProcessingResult>;
    /**
     * Process an individual operator result
     */
    private processOperatorResult;
    /**
     * Process an observation operator result
     */
    private processObservationEvent;
    /**
     * Process a summary operator result
     */
    private processSummaryEvent;
}

/**
 * TAC Tool class with helper methods for LLM integration
 *
 * Matches Python's TACTool dataclass with conversion methods.
 */
declare class TACTool<TParams = unknown, TResult = unknown> {
    readonly name: string;
    readonly description: string;
    readonly parameters: JSONSchema;
    readonly implementation: ToolFunction<TParams, TResult>;
    constructor(name: string, description: string, parameters: JSONSchema, implementation: ToolFunction<TParams, TResult>);
    /**
     * Convert to OpenAI function calling format
     */
    toOpenAIFormat(): Record<string, unknown>;
    /**
     * Convert to Anthropic tool calling format
     */
    toAnthropicFormat(): Record<string, unknown>;
    /**
     * Convert to JSON string (OpenAI format by default)
     */
    toJSON(): string;
}
/**
 * Create a tool directly with all parameters
 *
 * Simplified approach matching Python's create_tool function.
 * No builder pattern - just a simple function call.
 */
declare function defineTool<TParams = unknown, TResult = unknown>(name: string, description: string, parameters: JSONSchema, implementation: ToolFunction<TParams, TResult>): TACTool<TParams, TResult>;

/**
 * Parameters for memory retrieval tool
 */
interface MemoryRetrievalParams {
    query?: string;
    start_date?: string;
    end_date?: string;
    observation_limit?: number;
    summary_limit?: number;
    session_limit?: number;
}
/**
 * Create memory retrieval tool
 */
declare function createMemoryRetrievalTool(memoryClient: MemoryClient, memoryStoreId: MemoryStoreId, profileId?: ProfileId): TACTool<MemoryRetrievalParams, MemoryRetrievalResponse>;
/**
 * Create factory function for memory tools
 */
declare function createMemoryTools(memoryClient: MemoryClient, memoryStoreId: MemoryStoreId): {
    forProfile: (profileId: ProfileId) => TACTool<MemoryRetrievalParams, MemoryRetrievalResponse>;
    forSession: (profileId?: ProfileId) => TACTool<MemoryRetrievalParams, MemoryRetrievalResponse>;
};

/**
 * Parameters for send message tool
 */
interface SendMessageParams {
    message: string;
    metadata?: Record<string, unknown>;
}
/**
 * Result from send message tool
 */
interface SendMessageResult {
    success: boolean;
    message_id?: string;
    error?: string;
}
type SendResponseChannel = Pick<Channel, 'sendResponse'>;
/**
 * Create send message tool
 *
 * @param channel - The channel to send messages through
 * @param conversationId - The conversation ID
 */
declare function createSendMessageTool(channel: SendResponseChannel, conversationId: ConversationId): TACTool<SendMessageParams, SendMessageResult>;
/**
 * Create factory function for messaging tools
 */
declare function createMessagingTools(): {
    /**
     * Create send message tool for specific channel and session
     *
     * @param channel - The channel to send messages through
     * @param conversationId - The conversation ID
     */
    forSession: (channel: SendResponseChannel, conversationId: ConversationId) => TACTool<SendMessageParams, SendMessageResult>;
};

/**
 * Parameters for handoff tool
 */
interface HandoffParams {
    reason: string;
    urgency?: 'low' | 'medium' | 'high';
    context?: string;
    metadata?: Record<string, unknown>;
}
/**
 * Result from handoff tool
 */
interface HandoffResult {
    success: boolean;
    handoff_id: string;
    estimated_wait_time?: string;
    error?: string;
}
/**
 * Create human handoff tool
 *
 * @param tac - The TAC instance
 * @param conversationId - The conversation ID
 */
declare function createHandoffTool(tac: TAC, conversationId: ConversationId): TACTool<HandoffParams, HandoffResult>;
/**
 * Create factory function for handoff tools
 */
declare function createHandoffTools(): {
    /**
     * Create handoff tool for specific TAC instance and session
     *
     * @param tac - The TAC instance
     * @param conversationId - The conversation ID
     */
    forSession: (tac: TAC, conversationId: ConversationId) => TACTool<HandoffParams, HandoffResult>;
};

/**
 * Parameters for knowledge search tool (visible to LLM)
 */
interface KnowledgeSearchParams {
    query: string;
}
/**
 * Configuration for knowledge search tool
 */
interface KnowledgeToolConfig {
    name?: string;
    description?: string;
    topK?: number;
}
/**
 * Create knowledge search tool with explicit name and description
 *
 * @param knowledgeClient - The Knowledge client instance
 * @param knowledgeBaseId - The knowledge base ID to search
 * @param config - Configuration with required name and description
 * @returns TACTool configured for knowledge search
 */
declare function createKnowledgeSearchTool(knowledgeClient: KnowledgeClient, knowledgeBaseId: KnowledgeBaseId, config: {
    name: string;
    description: string;
    topK?: number;
}): TACTool<KnowledgeSearchParams, KnowledgeChunkResult[]>;
/**
 * Create knowledge search tool with auto-fetched metadata from knowledge base
 *
 * This async version fetches the knowledge base metadata to auto-generate
 * the tool name and description if not provided.
 *
 * @param knowledgeClient - The Knowledge client instance
 * @param knowledgeBaseId - The knowledge base ID to search
 * @param config - Optional configuration (name/description auto-generated if not provided)
 * @returns Promise containing TACTool configured for knowledge search
 */
declare function createKnowledgeSearchToolAsync(knowledgeClient: KnowledgeClient, knowledgeBaseId: KnowledgeBaseId, config?: KnowledgeToolConfig): Promise<TACTool<KnowledgeSearchParams, KnowledgeChunkResult[]>>;
/**
 * Create factory for knowledge tools
 *
 * @param knowledgeClient - The Knowledge client instance
 * @returns Factory object with methods to create knowledge tools
 */
declare function createKnowledgeTools(knowledgeClient: KnowledgeClient): {
    forKnowledgeBase: (knowledgeBaseId: KnowledgeBaseId, config: {
        name: string;
        description: string;
        topK?: number;
    }) => TACTool<KnowledgeSearchParams, KnowledgeChunkResult[]>;
    forKnowledgeBaseAsync: (knowledgeBaseId: KnowledgeBaseId, config?: KnowledgeToolConfig) => Promise<TACTool<KnowledgeSearchParams, KnowledgeChunkResult[]>>;
};

/**
 * Server configuration options
 */
interface TACServerConfig {
    /** Fastify server options (ignored if `fastifyInstance` is provided) */
    fastify?: FastifyServerOptions;
    /**
     * Pre-configured Fastify instance to mount TAC routes onto.
     *
     * Use this to control construction-time settings (logger, `trustProxy`,
     * schema, ...) or to register your own plugins/hooks before TAC's
     * routes are set up. If provided, the `fastify` options field is
     * ignored.
     */
    fastifyInstance?: FastifyInstance;
    /** Voice server configuration */
    voice?: Partial<VoiceServerConfig>;
    /** Custom webhook paths */
    webhookPaths?: {
        messaging?: string;
        twiml?: string;
        ws?: string;
        conversationRelayCallback?: string;
        /** Path for Conversation Intelligence webhook (optional - only registered if provided) */
        cintel?: string;
    };
    /** ConversationRelay configuration (welcomeGreeting, transcription, TTS, interaction settings, etc.) */
    conversationRelayConfig?: Partial<Omit<ConversationRelayConfig, 'url'>>;
    /** Handler for voice handoff requests (returns TwiML string) */
    handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>;
    /** Enable development features */
    development?: boolean;
    /** Enable Twilio webhook signature validation (default: true) */
    validateWebhooks?: boolean;
    /** Voice channel instance (alternative to registering on TAC) */
    voiceChannel?: VoiceChannel;
    /** Messaging channel instances — webhooks are fanned out to all (alternative to registering on TAC) */
    messagingChannels?: MessagingChannel[];
}
/**
 * Batteries-included Fastify server for TAC
 *
 * Provides out-of-the-box setup for SMS and Voice channels with
 * proper webhook handling, WebSocket support, and production-ready defaults.
 *
 * Customization:
 *   - Pass your own Fastify instance via `config.fastifyInstance` to control
 *     construction-time settings (logger, `trustProxy`, schema, ...) and to
 *     register plugins/hooks before TAC's routes are set up.
 *   - Or mutate `server.fastify` after construction to add routes,
 *     decorators, or hooks — before calling `start()`.
 *
 * Example:
 *   import Fastify from 'fastify';
 *
 *   const app = Fastify({ logger: true, trustProxy: true });
 *   const server = new TACServer(tac, { fastifyInstance: app });
 *
 *   server.fastify.get('/health', async () => ({ status: 'ok' }));
 *
 *   await server.start();
 */
declare class TACServer {
    readonly fastify: FastifyInstance;
    private readonly tac;
    private readonly config;
    /** All enabled messaging channels — webhooks are fanned out to each one */
    private readonly messagingChannels;
    /** Voice channel instance */
    private readonly voiceChannel;
    constructor(tac: TAC, config?: TACServerConfig);
    /**
     * Get the full URL for webhook validation
     * Handles X-Forwarded-* headers for proxy/ngrok scenarios
     */
    private getWebhookUrl;
    /**
     * Register global Twilio webhook signature validation hook
     */
    private registerWebhookValidation;
    /**
     * Setup routes — registers all routes for conversation mode (voice + messaging + optional cintel).
     */
    private setupRoutes;
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Wait for all WebSocket connections to close
     */
    private waitForWebSocketsToClose;
    /**
     * Stop the server gracefully
     */
    stop(): Promise<void>;
}

export { type AuthorInfo, AuthorInfoSchema, BaseClient, type BuiltInToolName, BuiltInTools, type CallSid, type CaptureRule, CaptureRuleSchema, type Channel, type ChannelEvents, type ChannelMessage, type ChannelSettings, ChannelSettingsSchema, type ChannelType, ChannelTypeSchema, ChatChannel, type ChatChannelConfig, type CintelParticipant, CintelParticipantSchema, type Communication, type CommunicationContent, CommunicationContentSchema, type CommunicationParticipant, CommunicationParticipantSchema, CommunicationSchema, type ConversationAddress, ConversationAddressSchema, ConversationClient, type ConversationConfiguration, ConversationConfigurationSchema, type ConversationEndedCallback, type ConversationGroupingType, ConversationGroupingTypeSchema, type ConversationId, type ConversationIntelligenceConfig, ConversationIntelligenceConfigSchema, type ConversationParticipant, ConversationParticipantSchema, type ConversationResponse, ConversationResponseSchema, type ConversationSession, ConversationSessionSchema, type ConversationSummaryItem, ConversationSummaryItemSchema, type CreateConversationSummariesResponse, CreateConversationSummariesResponseSchema, type CreateObservationResponse, CreateObservationResponseSchema, EMPTY_MEMORY_RESPONSE, EnvironmentVariables, type ErrorCallback, type ExecutionDetails, ExecutionDetailsSchema, type FlexHandoffResult, type HandoffCallback, type IntelligenceConfiguration, IntelligenceConfigurationSchema, type JSONSchema, JSONSchemaSchema, type KnowledgeBase, type KnowledgeBaseId, KnowledgeBaseSchema, type KnowledgeBaseStatus, KnowledgeBaseStatusSchema, type KnowledgeChunkResult, KnowledgeChunkResultSchema, KnowledgeClient, type KnowledgeId, type KnowledgeSearchResponse, KnowledgeSearchResponseSchema, type ListCommunicationsResponse, ListCommunicationsResponseSchema, type ListConversationsResponse, ListConversationsResponseSchema, type ListParticipantsResponse, ListParticipantsResponseSchema, type Logger, type MemoryChannelType, MemoryChannelTypeSchema, MemoryClient, type MemoryCommunication, type MemoryCommunicationContent, MemoryCommunicationContentSchema, MemoryCommunicationSchema, type MemoryDeliveryStatus, MemoryDeliveryStatusSchema, type MemoryParticipant, MemoryParticipantSchema, type MemoryParticipantType, MemoryParticipantTypeSchema, type MemoryRetrievalRequest, MemoryRetrievalRequestSchema, type MemoryRetrievalResponse, MemoryRetrievalResponseSchema, type MemoryRetriever, type MemoryStoreId, type MessageDirection, MessageDirectionSchema, type MessageReadyCallback, MessagingChannel, type MessagingChannelConfig, type MessagingWebhookPayload, type ObservationInfo, ObservationInfoSchema, type OpenAITool, OpenAIToolSchema, type Operator, type OperatorProcessingResult, OperatorProcessingResultSchema, type OperatorResult, type OperatorResultEvent, OperatorResultEventSchema, OperatorResultProcessor, OperatorResultSchema, OperatorSchema, type ParticipantAddress, ParticipantAddressSchema, type ParticipantAddressType, ParticipantAddressTypeSchema, type ParticipantId, type Profile, type ProfileId, type ProfileLookupResponse, ProfileLookupResponseSchema, type ProfileResponse, ProfileResponseSchema, SMSChannel, type SendCommunicationParticipantAddress, SendCommunicationParticipantAddressSchema, type SendCommunicationRequest, SendCommunicationRequestSchema, type SendCommunicationResponse, SendCommunicationResponseSchema, type SessionContext, type SessionInfo, SessionInfoSchema, type SessionMessage, SessionMessageSchema, type StatusCallback, StatusCallbackSchema, type StatusTimeouts, StatusTimeoutsSchema, type SummaryInfo, SummaryInfoSchema, TAC, type TACChannelType, TACChannelTypeSchema, type TACCommunication, type TACCommunicationAuthor, TACCommunicationAuthorSchema, type TACCommunicationContent, TACCommunicationContentSchema, TACCommunicationSchema, TACConfig, type TACConfigData, TACConfigSchema, type TACCustomParameters, TACCustomParametersSchema, type TACDeliveryStatus, TACDeliveryStatusSchema, TACMemoryResponse, type TACOptions, type TACParticipantType, TACParticipantTypeSchema, TACServer, type TACServerConfig, TACTool, type ToolContext, type ToolExecutionResult, ToolExecutionResultSchema, type ToolFunction, type Transcription, TranscriptionSchema, type TranscriptionWord, TranscriptionWordSchema, VoiceChannel, type VoiceServerConfig, VoiceServerConfigSchema, VoiceWebhookChannel, type VoiceWebhookChannelConfig, createHandoffTool, createHandoffTools, createKnowledgeSearchTool, createKnowledgeSearchToolAsync, createKnowledgeTools, createLogger, createMemoryRetrievalTool, createMemoryTools, createMessagingTools, createSendMessageTool, defineTool, handleFlexHandoffLogic, isConversationId, isKnowledgeBaseId, isKnowledgeId, isMemoryStoreId, isParticipantId, isProfileId };
