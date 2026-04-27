import { z } from 'zod';
export { z } from 'zod';
import pino from 'pino';
import { AxiosInstance } from 'axios';
import { WebSocket } from 'ws';
import { FastifyServerOptions, FastifyInstance } from 'fastify';

/**
 * Channel types supported by the framework
 */
declare const ChannelTypeSchema: z.ZodEnum<["sms", "voice", "chat", "crelay"]>;
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
    traitGroups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    conversationConfigurationId: z.ZodString;
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
    traitGroups?: string[] | undefined;
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
    traitGroups?: string[] | undefined;
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
    readonly TRAIT_GROUPS: "TRAIT_GROUPS";
    readonly TWILIO_CONVERSATION_CONFIGURATION_ID: "TWILIO_CONVERSATION_CONFIGURATION_ID";
    readonly TWILIO_TAC_CI_CONFIGURATION_ID: "TWILIO_TAC_CI_CONFIGURATION_ID";
    readonly TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID: "TWILIO_TAC_CI_OBSERVATION_OPERATOR_SID";
    readonly TWILIO_TAC_CI_SUMMARY_OPERATOR_SID: "TWILIO_TAC_CI_SUMMARY_OPERATOR_SID";
    readonly TWILIO_REGION: "TWILIO_REGION";
};

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
 * Memory API has different field requirements than Conversation Orchestrator:
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
 * Memory API content is simpler than Conversation Orchestrator - no type discriminator field.
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
 * Memory API has different field requirements than Conversation Orchestrator:
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
 * Communication participant for Conversations Service API (Conversation Orchestrator).
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
 * Note: In the Conversation Orchestrator API, both `type` and `text` are required fields.
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
 * Communication from Conversations Service API (Conversation Orchestrator).
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
 * Participant reference for the Actions API (`from`/`to` entries).
 *
 * Either `participantId` or `address` must be supplied; `channel` is always required.
 * When both are provided, Conversation Orchestrator uses `participantId` and
 * `channel` disambiguates which of the participant's addresses to use.
 */
declare const ActionParticipantRefSchema: z.ZodEffects<z.ZodObject<{
    participantId: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
}, "strip", z.ZodTypeAny, {
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    address?: string | undefined;
    participantId?: string | undefined;
}, {
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    address?: string | undefined;
    participantId?: string | undefined;
}>, {
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    address?: string | undefined;
    participantId?: string | undefined;
}, {
    channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
    address?: string | undefined;
    participantId?: string | undefined;
}>;
type ActionParticipantRef = z.infer<typeof ActionParticipantRefSchema>;
/**
 * Plain-text content for a SEND_MESSAGE action.
 */
declare const ActionTextContentSchema: z.ZodObject<{
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
}, {
    text: string;
}>;
type ActionTextContent = z.infer<typeof ActionTextContentSchema>;
/**
 * Channel-specific settings forwarded to the downstream backend.
 *
 * Open pass-through: any field not explicitly modeled here (e.g.
 * `messagingServiceSid`, `statusCallback`, `Attributes`) can be set by callers and
 * will be forwarded as-is.
 */
declare const ActionChannelSettingsSchema: z.ZodObject<{
    channelId: z.ZodOptional<z.ZodString>;
    chatService: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    channelId: z.ZodOptional<z.ZodString>;
    chatService: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    channelId: z.ZodOptional<z.ZodString>;
    chatService: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
type ActionChannelSettings = z.infer<typeof ActionChannelSettingsSchema>;
/**
 * Inner payload for a SEND_MESSAGE action.
 */
declare const SendMessageActionPayloadSchema: z.ZodObject<{
    from: z.ZodEffects<z.ZodObject<{
        participantId: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    }, "strip", z.ZodTypeAny, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }>, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }>;
    to: z.ZodArray<z.ZodEffects<z.ZodObject<{
        participantId: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
        channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
    }, "strip", z.ZodTypeAny, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }>, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }, {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }>, "many">;
    content: z.ZodObject<{
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        text: string;
    }, {
        text: string;
    }>;
    channelSettings: z.ZodOptional<z.ZodObject<{
        channelId: z.ZodOptional<z.ZodString>;
        chatService: z.ZodOptional<z.ZodString>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        channelId: z.ZodOptional<z.ZodString>;
        chatService: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        channelId: z.ZodOptional<z.ZodString>;
        chatService: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "strip", z.ZodTypeAny, {
    content: {
        text: string;
    };
    from: {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    };
    to: {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }[];
    channelSettings?: z.objectOutputType<{
        channelId: z.ZodOptional<z.ZodString>;
        chatService: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough"> | undefined;
}, {
    content: {
        text: string;
    };
    from: {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    };
    to: {
        channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
        address?: string | undefined;
        participantId?: string | undefined;
    }[];
    channelSettings?: z.objectInputType<{
        channelId: z.ZodOptional<z.ZodString>;
        chatService: z.ZodOptional<z.ZodString>;
    }, z.ZodTypeAny, "passthrough"> | undefined;
}>;
type SendMessageActionPayload = z.infer<typeof SendMessageActionPayloadSchema>;
/**
 * Request body for POST /v2/Conversations/{id}/Actions with type=SEND_MESSAGE.
 *
 * Body is discriminated by `type` with the action-specific fields under `payload`.
 */
declare const SendMessageActionRequestSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodLiteral<"SEND_MESSAGE">>;
    payload: z.ZodObject<{
        from: z.ZodEffects<z.ZodObject<{
            participantId: z.ZodOptional<z.ZodString>;
            address: z.ZodOptional<z.ZodString>;
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        }, "strip", z.ZodTypeAny, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }>, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }>;
        to: z.ZodArray<z.ZodEffects<z.ZodObject<{
            participantId: z.ZodOptional<z.ZodString>;
            address: z.ZodOptional<z.ZodString>;
            channel: z.ZodEnum<["VOICE", "SMS", "RCS", "EMAIL", "WHATSAPP", "CHAT", "API", "SYSTEM"]>;
        }, "strip", z.ZodTypeAny, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }>, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }, {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }>, "many">;
        content: z.ZodObject<{
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            text: string;
        }, {
            text: string;
        }>;
        channelSettings: z.ZodOptional<z.ZodObject<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough">>>;
    }, "strip", z.ZodTypeAny, {
        content: {
            text: string;
        };
        from: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        };
        to: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }[];
        channelSettings?: z.objectOutputType<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    }, {
        content: {
            text: string;
        };
        from: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        };
        to: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }[];
        channelSettings?: z.objectInputType<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    type: "SEND_MESSAGE";
    payload: {
        content: {
            text: string;
        };
        from: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        };
        to: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }[];
        channelSettings?: z.objectOutputType<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    };
}, {
    payload: {
        content: {
            text: string;
        };
        from: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        };
        to: {
            channel: "VOICE" | "SMS" | "RCS" | "EMAIL" | "WHATSAPP" | "CHAT" | "API" | "SYSTEM";
            address?: string | undefined;
            participantId?: string | undefined;
        }[];
        channelSettings?: z.objectInputType<{
            channelId: z.ZodOptional<z.ZodString>;
            chatService: z.ZodOptional<z.ZodString>;
        }, z.ZodTypeAny, "passthrough"> | undefined;
    };
    type?: "SEND_MESSAGE" | undefined;
}>;
type SendMessageActionRequest = z.infer<typeof SendMessageActionRequestSchema>;
/**
 * Response from POST /v2/Conversations/{id}/Actions (202 Accepted).
 *
 * The action is processed asynchronously; listen for COMMUNICATION_CREATED
 * webhook to get the full Communication.
 */
declare const ActionResponseSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    status: z.ZodString;
    conversationId: z.ZodString;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: string;
    status: string;
    id: string;
    conversationId: string;
    createdAt?: string | null | undefined;
}, {
    type: string;
    status: string;
    id: string;
    conversationId: string;
    createdAt?: string | null | undefined;
}>;
type ActionResponse = z.infer<typeof ActionResponseSchema>;
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
    channel: z.ZodEnum<["sms", "voice", "chat", "crelay"]>;
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
    channel: "sms" | "voice" | "chat" | "crelay";
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
    channel: "sms" | "voice" | "chat" | "crelay";
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
 * All Twilio Type IDs (TTID) follow: prefix + 26-char ULID body:
 *   [0-7] (timestamp high-bits) + 25 × [0-9a-z]
 * Source: twilio_memory_v1 / twilio_intelligence_v3 OpenAPI specs.
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
 *
 * - `GROUP_BY_PROFILE`: Groups communications by participant profile. Communications
 *   with the same profile go to the same conversation, regardless of the channel or address.
 * - `GROUP_BY_PARTICIPANT_ADDRESSES`: Groups communications by participant addresses
 *   across all channels. A customer using +15551234567 will be in the same conversation
 *   whether they contact via SMS, WhatsApp, or RCS.
 * - `GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE`: Groups communications by both
 *   participant addresses AND channel. A customer using +15551234567 via SMS will be in
 *   a different conversation than the same customer via WhatsApp.
 */
declare const ConversationGroupingTypeSchema: z.ZodEnum<["GROUP_BY_PROFILE", "GROUP_BY_PARTICIPANT_ADDRESSES", "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE"]>;
type ConversationGroupingType = z.infer<typeof ConversationGroupingTypeSchema>;
/**
 * Conversations V1 bridge settings on a ConversationConfiguration.
 *
 * TODO(conv-orch): Remove this schema once the Actions API resolves the V1 Chat
 * service SID server-side. Currently used to extract `conversationsV1Bridge.serviceId`
 * from the Configuration so the chat channel can forward it as
 * channelSettings.chatService — drop together with the other TODO(conv-orch) sites.
 */
declare const ConversationsV1BridgeSchema: z.ZodObject<{
    serviceId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    serviceId: string;
}, {
    serviceId: string;
}>;
type ConversationsV1Bridge = z.infer<typeof ConversationsV1BridgeSchema>;
/**
 * Configuration settings for a conversation
 *
 * @see /docs/oai-specs/internal-oai/spec/json/twilio_conversations_v2.json
 */
declare const ConversationConfigurationSchema: z.ZodObject<{
    id: z.ZodString;
    displayName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodString;
    conversationGroupingType: z.ZodEnum<["GROUP_BY_PROFILE", "GROUP_BY_PARTICIPANT_ADDRESSES", "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE"]>;
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
    conversationsV1Bridge: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        serviceId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        serviceId: string;
    }, {
        serviceId: string;
    }>>>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    version: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    description: string;
    conversationGroupingType: "GROUP_BY_PROFILE" | "GROUP_BY_PARTICIPANT_ADDRESSES" | "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE";
    memoryStoreId: string;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
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
    displayName?: string | null | undefined;
    statusCallbacks?: {
        url: string;
        method: "POST" | "GET" | "PUT" | "DELETE" | "PATCH";
    }[] | null | undefined;
    intelligenceConfigurationIds?: string[] | null | undefined;
    conversationsV1Bridge?: {
        serviceId: string;
    } | null | undefined;
    version?: number | null | undefined;
}, {
    id: string;
    description: string;
    conversationGroupingType: "GROUP_BY_PROFILE" | "GROUP_BY_PARTICIPANT_ADDRESSES" | "GROUP_BY_PARTICIPANT_ADDRESSES_AND_CHANNEL_TYPE";
    memoryStoreId: string;
    createdAt?: string | null | undefined;
    updatedAt?: string | null | undefined;
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
    displayName?: string | null | undefined;
    statusCallbacks?: {
        url: string;
        method?: "POST" | "GET" | "PUT" | "DELETE" | "PATCH" | undefined;
    }[] | null | undefined;
    intelligenceConfigurationIds?: string[] | null | undefined;
    conversationsV1Bridge?: {
        serviceId: string;
    } | null | undefined;
    version?: number | null | undefined;
}>;
type ConversationConfiguration = z.infer<typeof ConversationConfigurationSchema>;

/**
 * Session Types
 *
 * Session abstractions for Maestro-backed channels (voice / crelay / SMS / chat).
 * `ConversationId` is the canonical session key across all TAC channels —
 * this is the unified-identity model this branch's refactor standardises on.
 */

/**
 * Base session context for a TAC channel session.
 *
 * `conversationId` is always a Maestro ConversationId — the single session key
 * shared across voice, crelay, SMS and chat. If you need raw-CallSid sessions
 * (standalone ConversationRelay without Maestro), consume `@twilio/tac-conversationrelay`
 * directly — it ships its own `CallSid` branded type and does not use this interface.
 */
interface SessionContext {
    /**
     * Maestro ConversationId — canonical session key for this context.
     */
    conversationId: ConversationId;
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
 * Unified author model with all fields from both Memory and Conversation Orchestrator APIs.
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
 * Unified content model with all fields from both Memory and Conversation Orchestrator APIs.
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
 * Unified communication model with all fields from both Memory and Conversation Orchestrator APIs.
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
 * Memory API is configured or falling back to Conversation Orchestrator Communications API.
 *
 * Memory configured:
 * - observations, summaries, communications all populated
 * - communications include Memory-specific fields (author id, name, type, profileId)
 *
 * Conversation Orchestrator fallback:
 * - observations and summaries are empty arrays
 * - communications include Conversation Orchestrator-specific fields (conversationId, accountId, etc.)
 */
declare class TACMemoryResponse {
    private readonly _data;
    private readonly _communications;
    /**
     * Initialize wrapper with either Memory or Conversation Orchestrator data.
     *
     * @param data - Either MemoryRetrievalResponse (Memory) or Communication[] (Conversation Orchestrator)
     */
    constructor(data: MemoryRetrievalResponse | Communication[]);
    /**
     * Get observation memories.
     *
     * @returns List of observations if Memory is configured, empty array for Conversation Orchestrator fallback
     */
    get observations(): ObservationInfo[];
    /**
     * Get summary memories.
     *
     * @returns List of summaries if Memory is configured, empty array for Conversation Orchestrator fallback
     */
    get summaries(): SummaryInfo[];
    /**
     * Get communications in unified format with all available fields.
     *
     * Communications are converted to a common format during initialization that includes
     * all fields from both Memory and Conversation Orchestrator APIs. Fields not available from a particular
     * API will be undefined.
     *
     * @returns List of unified communications with all available fields
     */
    get communications(): TACCommunication[];
    /**
     * Check if Memory API is configured and providing full features.
     *
     * @returns true if Memory is configured (observations/summaries available),
     *          false if using Conversation Orchestrator fallback (only communications available)
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
 * JSON Schema definition for tool parameters
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
/**
 * Tool function signature
 */
type ToolFunction$1<TParams = unknown, TResult = unknown> = (params: TParams) => Promise<TResult> | TResult;
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
    data?: any;
    error?: string | undefined;
}, {
    success: boolean;
    metadata?: Record<string, unknown> | undefined;
    data?: any;
    error?: string | undefined;
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
 * Channel interface definitions
 *
 * Minimal contract that TAC requires from all channel implementations.
 * Channels use composition instead of inheritance.
 */

/**
 * Package-agnostic tool contract for channels.
 *
 * Lives in core so the `Channel` interface does not depend on any
 * channel-specific package (e.g. `@twilio/tac-conversationrelay`).
 * `ConversationRelayTool` and `TACTool` both structurally satisfy this —
 * TypeScript duck-types them at the `Channel` boundary, and concrete
 * channels keep their richer internal tool types.
 */
interface ChannelTool {
    readonly name: string;
    readonly description: string;
    readonly parameters: JSONSchema$1;
    readonly implementation: ToolFunction$1;
    toOpenAIFormat(): Record<string, unknown>;
    toAnthropicFormat(): Record<string, unknown>;
}
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
 * Injected into Maestro channels (VoiceChannel, SMSChannel, ChatChannel)
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
     * Optional — only channels with outbound capability (SMS, Chat,
     * ConversationRelayChannel) implement tool dispatch. Passive VoiceChannel
     * has no outbound path and omits this.
     */
    listTools?(): ChannelTool[];
    /**
     * Register an additional tool on this channel. Overwrites any tool with the same name.
     */
    registerTool?(tool: ChannelTool): void;
    /**
     * Execute a registered tool by name.
     *
     * ConversationRelayChannel auto-ships any `outgoingMessage` the tool produces
     * via the CR WebSocket. Other channels simply invoke the tool's implementation.
     *
     * @param conversationId - Conversation identifier to scope the execution
     * @param name - Registered tool name
     * @param args - Arguments forwarded to the tool's implementation
     * @returns The tool's result (to feed back to the LLM loop)
     */
    executeTool?(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
    /**
     * Process a Maestro Conversations Service webhook payload.
     *
     * Optional because some channels (e.g. `ConversationRelayChannel`) don't
     * consume Maestro webhooks directly. The server fans out every incoming
     * webhook to all registered channels via
     * `channel.processWebhook?.(body, idempotencyToken)`; channels that don't
     * implement it simply ignore the event.
     *
     * @param payload - Raw webhook body from Twilio
     * @param idempotencyToken - Optional token from the `I-Twilio-Idempotency-Token` header
     */
    processWebhook?(payload: unknown, idempotencyToken?: string): Promise<void>;
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
    readonly traitGroups?: string[];
    readonly conversationConfigurationId: string;
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
     * - TRAIT_GROUPS: Comma-separated trait group names (optional, for profile fetching)
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
     * const tac = await TAC.create({ config });
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
type Logger$1 = pino.Logger;
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
}): Logger$1;

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
    protected readonly logger: Logger$1;
    protected readonly axiosInstance: AxiosInstance;
    constructor(baseUrl: string, config: TACConfig, logger?: Logger$1);
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
    constructor(config: TACConfig, logger?: Logger$1);
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
    constructor(config: TACConfig, logger?: Logger$1);
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
    createAction(conversationId: ConversationId, request: SendMessageActionRequest): Promise<ActionResponse>;
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
    constructor(config: TACConfig, logger?: Logger$1);
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
    logger?: Logger$1;
}
/**
 * Callback function signatures for TAC events
 */
type MessageReadyCallback = (message: ChannelMessage) => Promise<string | null | void> | string | null | void;
type ErrorCallback$1 = (params: {
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
    private static readonly FACTORY_TOKEN;
    private readonly config;
    readonly logger: Logger$1;
    private memoryClient;
    private knowledgeClient;
    private readonly conversationClient;
    private readonly channels;
    private cintelProcessor?;
    private memoryStoreId;
    /**
     * Cached from `conversationConfig.conversationsV1Bridge?.serviceId` at init.
     * ChatChannel forwards this as `channelSettings.chatService` on outbound
     * SEND_MESSAGE actions.
     *
     * Until the server-side fix ships, CHAT sends fail with
     *   "chatService attribute is required for CHAT channel"
     * unless we pass it on channelSettings.chatService.
     *
     * TODO(conv-orch): Drop this field plus ActionChannelSettings.chatService
     * and ChatChannel's chatServiceSid plumbing once the Actions API resolves
     * the V1 Chat service SID server-side.
     */
    conversationsV1ServiceSid?: string;
    private messageReadyCallback?;
    private handoffCallback?;
    private conversationEndedCallback?;
    private errorCallback?;
    private constructor();
    static create(options?: TACOptions): Promise<TAC>;
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
     * Register callback for when messages are ready to be processed.
     * Return a string to auto-send, or null/void for manual handling.
     */
    onMessageReady(callback: MessageReadyCallback): void;
    /**
     * Register callback for channel errors
     */
    onError(callback: ErrorCallback$1): void;
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
     */
    getMemoryClient(): MemoryClient;
    /**
     * Get knowledge client for knowledge base operations
     */
    getKnowledgeClient(): KnowledgeClient;
    /**
     * Get conversation client for advanced conversation operations
     */
    getConversationClient(): ConversationClient;
    /**
     * Create a MemoryRetriever function for channel dependency injection.
     */
    createMemoryRetriever(): MemoryRetriever;
    /**
     * Get channel dependencies for creating channels (VoiceChannel, ConversationRelayChannel,
     * SMSChannel, ChatChannel). Returns all dependencies needed to construct a channel.
     */
    getChannelDeps(): {
        config: TACConfig;
        logger: Logger$1;
        conversationClient: ConversationClient;
        memoryRetriever: MemoryRetriever;
    };
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

interface SMSChannelConfig {
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
}
/**
 * SMS Channel implementation for Twilio Conversations Service.
 *
 * Handles SMS conversations through Conversation Orchestrator webhooks.
 * Composes ConversationsWebhookProcessor + ConversationSessionStore from
 * `./utility.ts` instead of inheriting from a base class.
 */
declare class SMSChannel implements Channel {
    readonly channelType: ChannelType;
    private readonly config;
    private readonly logger;
    private readonly conversationClient;
    private readonly memoryRetriever;
    private readonly callbacks;
    private readonly tools;
    private readonly webhookProcessor;
    private readonly sessionStore;
    constructor(deps: {
        config: TACConfig;
        logger: Logger$1;
        conversationClient: ConversationClient;
        memoryRetriever: MemoryRetriever;
    }, channelConfig?: SMSChannelConfig);
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    isConversationActive(conversationId: ConversationId): boolean;
    on(event: string, callback: (...args: any[]) => void): void;
    shutdown(): void;
    listTools(): ChannelTool[];
    registerTool(tool: ChannelTool): void;
    executeTool(_conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
    /**
     * Process an SMS webhook event from Twilio Conversation Orchestrator.
     * Delegates dedup + routing to the composed ConversationsWebhookProcessor.
     */
    processWebhook(payload: unknown, idempotencyToken?: string): Promise<void>;
    /**
     * Send SMS response via the Conversation Orchestrator Actions API (SEND_MESSAGE).
     */
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
    private isOwnMessage;
    private handleError;
    private handleConversationCreated;
    private handleParticipantAdded;
    private handleCommunicationCreated;
    private handleConversationUpdated;
}

interface ChatChannelConfig {
    /** Chat agent identity string (defaults to 'ai-assistant') */
    agentAddress?: string | undefined;
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
    /**
     * Conversations V1 service SID, forwarded as `channelSettings.chatService` on
     * outbound SEND_MESSAGE actions. Read from `tac.conversationsV1ServiceSid`.
     *
     * TODO(conv-orch): Drop this option once the Actions API resolves the V1 Chat
     * service SID server-side.
     */
    conversationsV1ServiceSid?: string | undefined;
}
/**
 * Chat Channel implementation for Twilio Conversations Service.
 *
 * Handles web chat conversations through Conversation Orchestrator webhooks.
 * Uses identity-based addressing (`agentAddress`) rather than phone numbers.
 * Composes ConversationsWebhookProcessor + ConversationSessionStore from
 * `./utility.ts` instead of inheriting from a base class.
 */
declare class ChatChannel implements Channel {
    readonly channelType: ChannelType;
    private readonly logger;
    private readonly conversationClient;
    private readonly memoryRetriever;
    private readonly agentAddress;
    /**
     * TODO(conv-orch): Drop once Actions API resolves V1 Chat service SID server-side.
     */
    private readonly conversationsV1ServiceSid;
    private readonly callbacks;
    private readonly tools;
    private readonly webhookProcessor;
    private readonly sessionStore;
    constructor(deps: {
        config: TACConfig;
        logger: Logger$1;
        conversationClient: ConversationClient;
        memoryRetriever: MemoryRetriever;
    }, channelConfig?: ChatChannelConfig);
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    isConversationActive(conversationId: ConversationId): boolean;
    on(event: string, callback: (...args: any[]) => void): void;
    shutdown(): void;
    listTools(): ChannelTool[];
    registerTool(tool: ChannelTool): void;
    executeTool(_conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
    /**
     * Process a Chat webhook event from Twilio Conversation Orchestrator.
     * Delegates dedup + routing to the composed ConversationsWebhookProcessor.
     */
    processWebhook(payload: unknown, idempotencyToken?: string): Promise<void>;
    /**
     * Send chat response via the Conversation Orchestrator Actions API (SEND_MESSAGE).
     */
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
    private isOwnMessage;
    private handleError;
    private handleConversationCreated;
    private handleParticipantAdded;
    private handleCommunicationCreated;
    private handleConversationUpdated;
}

/**
 * VoiceChannel — passive Maestro voice channel.
 *
 * Consumes voice-channel Conversation Orchestrator (Maestro) webhooks and
 * emits unified `ChannelMessage`s like SMS/Chat. Use for BYO-CR flows,
 * inbound-analysis pipelines, or any voice path where this service
 * does not own the CR WebSocket.
 *
 * Outbound voice is **not supported** here — Maestro's Actions API rejects
 * `channel: 'VOICE'`. For active voice (agent speaks over a CR WS), use
 * `ConversationRelayChannel` in `./crelay.ts`.
 *
 * Zero dependency on `@twilio/tac-conversationrelay` — that boundary is
 * owned exclusively by `ConversationRelayChannel`.
 */

interface VoiceChannelConfig {
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
}
declare class VoiceChannel implements Channel {
    readonly channelType: ChannelType;
    protected readonly config: TACConfig;
    protected readonly logger: Logger$1;
    protected readonly conversationClient: ConversationClient;
    protected readonly callbacks: ChannelEvents;
    private readonly memoryRetriever;
    private readonly sessionStore;
    private readonly webhookProcessor;
    constructor(deps: {
        config: TACConfig;
        logger: Logger$1;
        conversationClient: ConversationClient;
        memoryRetriever: MemoryRetriever;
    }, channelConfig?: VoiceChannelConfig);
    private emitMessage;
    sendResponse(_conversationId: ConversationId, _message: string, _metadata?: Record<string, unknown>): Promise<void>;
    processWebhook(payload: unknown, idempotencyToken?: string): Promise<void>;
    private handleVoiceConversationCreated;
    private handleVoiceParticipantAdded;
    private handleVoiceCommunicationCreated;
    private handleVoiceConversationUpdated;
    on(event: string, callback: (...args: any[]) => void): void;
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    isConversationActive(conversationId: ConversationId): boolean;
    shutdown(): void;
    protected handleError(error: Error, context?: Record<string, unknown>): void;
}

/**
 * Logger type used throughout the ConversationRelay package.
 */
type Logger = pino.Logger;

/**
 * SilenceHandler — Progressive reminder system for silent callers (per-session).
 *
 * One instance per WebSocket session. Scalar state only — the handler lives
 * and dies with its session. Constructed by `ConversationRelay` on CR `setup`
 * (if silence config was supplied), and stopped on WS close.
 *
 * Based on the simple-conversation-relay SilenceHandler pattern.
 */

/**
 * Configuration for silence handling behavior.
 *
 * Progression: on each threshold breach, fire `onReminder(reminders[i])`
 * advancing `i` until all reminders have been spoken. The NEXT breach after
 * the last reminder fires `onTerminate()` once (typically `endCall`).
 *
 * With `reminders: ['Are you still there?']`:
 *   - 1st breach → onReminder('Are you still there?')
 *   - 2nd breach → onTerminate()
 *
 * With `reminders: []`:
 *   - 1st breach → onTerminate() (no reminders, terminate immediately)
 */
interface SilenceHandlerConfig {
    /** Threshold in seconds before advancing the reminder sequence */
    thresholdSeconds: number;
    /** Ordered reminders to speak, one per threshold breach */
    reminders: string[];
    /** Called when a reminder is due. Typical handling: send text to caller. */
    onReminder: (reminder: string) => void;
    /** Called once after the last reminder + one more breach. Typical handling: end the call. */
    onTerminate: () => void;
}
/**
 * SilenceHandler — per-session silence monitor.
 *
 * @example
 * ```typescript
 * const handler = new SilenceHandler(
 *   {
 *     thresholdSeconds: 20,
 *     reminders: ['Are you still there?', 'Hello? Can you hear me?'],
 *     onReminder: (reminder) => session.sendText(reminder),
 *     onTerminate: () => session.endCall(),
 *   },
 *   logger
 * );
 *
 * handler.reset();                 // start (or restart) the timer
 * handler.setEnabled(false);       // disable (clears timer; reset is caller's job)
 * handler.stop();                  // stop monitoring for good
 * ```
 */
declare class SilenceHandler {
    private timer;
    private reminderIndex;
    private enabled;
    private readonly config;
    private readonly logger;
    constructor(config: SilenceHandlerConfig, logger: Logger);
    /**
     * Reset the silence timer. Call on any signal of life from the caller
     * (prompt, interrupt, DTMF). Also used to start the timer for the first
     * time. No-op if the handler is currently disabled.
     */
    reset(): void;
    /**
     * Stop monitoring. Clears the timer and resets the reminder index. Call on
     * session end.
     */
    stop(): void;
    /**
     * Enable or disable silence handling.
     *
     * When disabled: the active timer is cleared, `reset()` becomes a no-op,
     * and no reminders fire. When re-enabled: the caller must invoke `reset()`
     * to re-arm the timer — this is deliberate, so the re-enabler decides when
     * the clock restarts.
     */
    setEnabled(enabled: boolean): void;
    /** Whether silence handling is currently enabled */
    isEnabled(): boolean;
    /** Whether a timer is currently scheduled */
    isActive(): boolean;
    private startTimer;
    private clearTimer;
}

/**
 * CR Tool definition helpers.
 *
 * Vendored locally so the ConversationRelay package stays free of any
 * dependency on @twilio/tac-tools. CR tools are only invoked by CR itself.
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
type ToolFunction<TParams = unknown, TResult = unknown> = (params: TParams) => Promise<TResult> | TResult;
/**
 * ConversationRelay tool with LLM-format conversion helpers.
 */
declare class ConversationRelayTool<TParams = unknown, TResult = unknown> {
    readonly name: string;
    readonly description: string;
    readonly parameters: JSONSchema;
    readonly implementation: ToolFunction<TParams, TResult>;
    constructor(name: string, description: string, parameters: JSONSchema, implementation: ToolFunction<TParams, TResult>);
    toOpenAIFormat(): Record<string, unknown>;
    toAnthropicFormat(): Record<string, unknown>;
    toJSON(): string;
}

/**
 * ToolRegistry — named lookup for ConversationRelay tools.
 *
 * Tools are not part of the Twilio ConversationRelay wire protocol; they are a
 * separate concern shared by every active session. One `ToolRegistry` instance
 * is passed to a `ConversationRelay` at construction, and `ConversationRelay`
 * hands the same reference to each `ConversationRelaySession`. Registering a
 * tool makes it available to every in-flight call immediately.
 */

/**
 * Named-lookup container for `ConversationRelayTool` instances. Later registrations overwrite
 * earlier ones with the same name (last-write-wins). Ownership is by reference
 * — `ConversationRelaySession` reads from the shared instance.
 */
declare class ToolRegistry {
    private readonly tools;
    constructor(initial?: readonly ConversationRelayTool[]);
    /** Register a tool. Overwrites any tool previously registered under the same name. */
    register(tool: ConversationRelayTool): void;
    /** Remove a tool by name. No-op if no tool by that name was registered. */
    unregister(name: string): void;
    /** Whether a tool with the given name is registered. */
    has(name: string): boolean;
    /** Fetch a registered tool by name, or `undefined` if not registered. */
    get(name: string): ConversationRelayTool | undefined;
    /**
     * All registered tools, in registration order. Feed the results into the
     * LLM via `tool.toOpenAIFormat()` / `toAnthropicFormat()`.
     */
    list(): ConversationRelayTool[];
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
 * Setup message — first message on WebSocket connection
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#setup-message
 */
declare const SetupMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"setup">;
    sessionId: z.ZodString;
    callSid: z.ZodString;
    parentCallSid: z.ZodOptional<z.ZodString>;
    from: z.ZodString;
    to: z.ZodString;
    forwardedFrom: z.ZodOptional<z.ZodString>;
    callerName: z.ZodOptional<z.ZodString>;
    direction: z.ZodString;
    callType: z.ZodString;
    callStatus: z.ZodString;
    accountSid: z.ZodString;
    customParameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: "setup";
    accountSid: string;
    direction: string;
    from: string;
    to: string;
    sessionId: string;
    callSid: string;
    callType: string;
    callStatus: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, string> | undefined;
}, {
    type: "setup";
    accountSid: string;
    direction: string;
    from: string;
    to: string;
    sessionId: string;
    callSid: string;
    callType: string;
    callStatus: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, string> | undefined;
}>;
type SetupMessage = z.infer<typeof SetupMessageSchema>;
/**
 * Prompt message — user speech transcription
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#prompt-message
 */
declare const PromptMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"prompt">;
    voicePrompt: z.ZodString;
    lang: z.ZodOptional<z.ZodString>;
    last: z.ZodOptional<z.ZodBoolean>;
    agentSpeaking: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "prompt";
    voicePrompt: string;
    lang?: string | undefined;
    last?: boolean | undefined;
    agentSpeaking?: string | undefined;
}, {
    type: "prompt";
    voicePrompt: string;
    lang?: string | undefined;
    last?: boolean | undefined;
    agentSpeaking?: string | undefined;
}>;
type PromptMessage = z.infer<typeof PromptMessageSchema>;
/**
 * Interrupt message — user interrupted agent speech
 *
 * Fields verified from Twilio docs:
 * - utteranceUntilInterrupt: TTS text that was played before interruption
 * - durationUntilInterruptMs: duration in ms before interruption
 *
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#interrupt-message
 */
declare const InterruptMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"interrupt">;
    utteranceUntilInterrupt: z.ZodOptional<z.ZodString>;
    durationUntilInterruptMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "interrupt";
    utteranceUntilInterrupt?: string | undefined;
    durationUntilInterruptMs?: number | undefined;
}, {
    type: "interrupt";
    utteranceUntilInterrupt?: string | undefined;
    durationUntilInterruptMs?: number | undefined;
}>;
type InterruptMessage = z.infer<typeof InterruptMessageSchema>;
/**
 * DTMF message — user pressed a key (placeholder)
 * @see https://www.twilio.com/docs/voice/conversationrelay/websocket-messages#dtmf-message
 */
declare const DtmfMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"dtmf">;
    digit: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "dtmf";
    digit: string;
}, {
    type: "dtmf";
    digit: string;
}>;
type DtmfMessage = z.infer<typeof DtmfMessageSchema>;
/**
 * Info message — informational event from ConversationRelay (placeholder)
 */
declare const InfoMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"info">;
    info: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "info";
    info?: Record<string, unknown> | undefined;
}, {
    type: "info";
    info?: Record<string, unknown> | undefined;
}>;
type InfoMessage = z.infer<typeof InfoMessageSchema>;
/**
 * Union of all incoming WebSocket message types
 */
declare const WebSocketMessageSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"setup">;
    sessionId: z.ZodString;
    callSid: z.ZodString;
    parentCallSid: z.ZodOptional<z.ZodString>;
    from: z.ZodString;
    to: z.ZodString;
    forwardedFrom: z.ZodOptional<z.ZodString>;
    callerName: z.ZodOptional<z.ZodString>;
    direction: z.ZodString;
    callType: z.ZodString;
    callStatus: z.ZodString;
    accountSid: z.ZodString;
    customParameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: "setup";
    accountSid: string;
    direction: string;
    from: string;
    to: string;
    sessionId: string;
    callSid: string;
    callType: string;
    callStatus: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, string> | undefined;
}, {
    type: "setup";
    accountSid: string;
    direction: string;
    from: string;
    to: string;
    sessionId: string;
    callSid: string;
    callType: string;
    callStatus: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, string> | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"prompt">;
    voicePrompt: z.ZodString;
    lang: z.ZodOptional<z.ZodString>;
    last: z.ZodOptional<z.ZodBoolean>;
    agentSpeaking: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "prompt";
    voicePrompt: string;
    lang?: string | undefined;
    last?: boolean | undefined;
    agentSpeaking?: string | undefined;
}, {
    type: "prompt";
    voicePrompt: string;
    lang?: string | undefined;
    last?: boolean | undefined;
    agentSpeaking?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"interrupt">;
    utteranceUntilInterrupt: z.ZodOptional<z.ZodString>;
    durationUntilInterruptMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "interrupt";
    utteranceUntilInterrupt?: string | undefined;
    durationUntilInterruptMs?: number | undefined;
}, {
    type: "interrupt";
    utteranceUntilInterrupt?: string | undefined;
    durationUntilInterruptMs?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"dtmf">;
    digit: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "dtmf";
    digit: string;
}, {
    type: "dtmf";
    digit: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"info">;
    info: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "info";
    info?: Record<string, unknown> | undefined;
}, {
    type: "info";
    info?: Record<string, unknown> | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"error">;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "error";
    description?: string | undefined;
}, {
    type: "error";
    description?: string | undefined;
}>]>;
type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
/**
 * Union of all outgoing WebSocket message types
 */
declare const OutgoingMessageSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"text">;
    token: z.ZodString;
    last: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    type: "text";
    last: boolean;
    token: string;
}, {
    type: "text";
    token: string;
    last?: boolean | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"play">;
    source: z.ZodString;
    loop: z.ZodOptional<z.ZodNumber>;
    interruptible: z.ZodOptional<z.ZodBoolean>;
    preemptible: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "play";
    source: string;
    loop?: number | undefined;
    interruptible?: boolean | undefined;
    preemptible?: boolean | undefined;
}, {
    type: "play";
    source: string;
    loop?: number | undefined;
    interruptible?: boolean | undefined;
    preemptible?: boolean | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"sendDigits">;
    digits: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "sendDigits";
    digits: string;
}, {
    type: "sendDigits";
    digits: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"language">;
    ttsLanguage: z.ZodOptional<z.ZodString>;
    transcriptionLanguage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "language";
    ttsLanguage?: string | undefined;
    transcriptionLanguage?: string | undefined;
}, {
    type: "language";
    ttsLanguage?: string | undefined;
    transcriptionLanguage?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"end">;
    handoffData: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "end";
    handoffData?: string | undefined;
}, {
    type: "end";
    handoffData?: string | undefined;
}>]>;
type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;
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
 * Custom parameters passed via TwiML <Parameter> elements.
 *
 * TwiML <Parameter> is an XML attribute pair (name + value), so values must
 * be strings. Callers should stringify non-string values before passing them
 * (e.g. `String(num)`, `JSON.stringify(obj)`) to make the encoding explicit.
 */
declare const CustomParametersSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodString>, Record<string, string>, Record<string, string>>;
type CustomParameters = z.infer<typeof CustomParametersSchema>;
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
 * ConversationRelaySession — one WebSocket, one session.
 *
 * Owns everything previously keyed by CallSid on the old `ConversationRelay`
 * singleton: the `ws` handle, session identity (callSid/from/to/startedAt/
 * customParameters), listen-mode + suppressed-count, the per-session
 * `SilenceHandler`, the `pendingTerminalMessage` deferral slot, and the
 * reference to the shared `ToolRegistry`. All public methods operate on
 * `this` — callers never thread a CallSid through.
 *
 * Owned by `ConversationRelay` (one per WebSocket upgrade). Constructed on
 * the first `setup` frame; destroyed on WS close.
 */

/**
 * Silence-handling config supplied at `ConversationRelay` construction and
 * forwarded to each session. Absent = silence handling disabled for the
 * session (no `SilenceHandler` constructed). Reminder sequence is always
 * `['Are you still there?', ...additionalPrompts]`; the terminal reminder's
 * breach ends the call via `endCall` with `{ reasonCode: 'unresponsive' }`.
 */
interface SilenceConfig {
    /** Seconds of silence before a reminder fires. Default: 20. */
    thresholdSeconds?: number;
    /** Up to 2 custom prompts appended after the default "Are you still there?". */
    additionalPrompts?: [string] | [string, string];
}
/**
 * Callbacks the manager supplies so the session can fan events out to
 * subscribers without importing the manager class (keeps the session
 * free of circular deps).
 */
interface SessionCallbacks {
    onPrompt?: (session: ConversationRelaySession, message: string, data: unknown) => void;
    onInterrupt?: (session: ConversationRelaySession, data: unknown) => void;
    onDtmf?: (session: ConversationRelaySession, data: unknown) => void;
    onInfo?: (session: ConversationRelaySession, data: unknown) => void;
    onError?: (session: ConversationRelaySession, error: Error) => void;
}
interface ConversationRelaySessionOptions {
    ws: WebSocket;
    setup: SetupMessage;
    toolRegistry: ToolRegistry;
    logger: Logger;
    silenceTemplate?: SilenceConfig | undefined;
    callbacks: SessionCallbacks;
}
declare class ConversationRelaySession {
    readonly callSid: CallSid;
    readonly from: string;
    readonly to: string;
    readonly startedAt: Date;
    readonly customParameters: Record<string, string> | undefined;
    private readonly ws;
    private readonly logger;
    private readonly toolRegistry;
    private readonly callbacks;
    private _listenMode;
    private _suppressedCount;
    private readonly _silenceHandler;
    /**
     * Terminal `OutgoingMessage` (currently only `type: 'end'`) deferred until
     * the next `sendText(..., last: true)` flush. This gives the LLM's
     * streaming farewell a chance to reach TTS before Twilio hangs up —
     * today's race produces mid-sentence cutoffs.
     */
    private pendingTerminalMessage;
    constructor(opts: ConversationRelaySessionOptions);
    isListenMode(): boolean;
    getSuppressedMessageCount(): number;
    get silenceHandler(): SilenceHandler | undefined;
    /**
     * Dispatch a validated incoming frame (post-setup) to the session.
     * The manager owns `ws.on('message')` and does schema validation; this
     * method fans out to callbacks and resets the silence timer on signal-
     * of-life events.
     */
    handleIncomingFrame(message: WebSocketMessage): void;
    /**
     * Toggle listen-mode. When enabled, outgoing speech-equivalent messages
     * (`text`, `play`, `language`) are suppressed; DTMF and end-call still work.
     * Also interlocks with the silence handler: enabling listen-mode pauses
     * silence monitoring; disabling re-enables and resets from zero.
     */
    setListenMode(enabled: boolean): void;
    /**
     * Ship a validated `OutgoingMessage` to Twilio via this session's ws.
     * Listen-mode gating: when enabled, `text`/`play`/`language` are suppressed
     * and `suppressedCount` is incremented. `sendDigits` and `end` are never
     * suppressed.
     */
    sendResponse(message: OutgoingMessage): void;
    /**
     * Send a text token to Twilio TTS. When `last` is true and a terminal
     * frame is stashed (from a prior `executeTool`), flush the terminal
     * *after* the text. Listen-mode suppression still applies to the text
     * frame; the terminal frame (`end`) is never suppressed and always fires.
     */
    sendText(token: string, last?: boolean): void;
    sendDigits(digits: string): void;
    sendPlay(source: string, options?: {
        loop?: number;
        interruptible?: boolean;
        preemptible?: boolean;
    }): void;
    switchLanguage(options: {
        ttsLanguage?: string;
        transcriptionLanguage?: string;
    }): void;
    /**
     * End the call with optional handoff data. Bypasses terminal deferral —
     * callers who invoke this directly are asking for immediate hangup.
     */
    endCall(handoffData?: Record<string, unknown>): void;
    /**
     * Execute a registered tool against this session. Result conventions:
     *
     *   - `outgoingMessage`: validated and shipped. Terminal `type: 'end'`
     *     frames are stashed for deferred flush after the next
     *     `sendText(..., last: true)` — this prevents Twilio from hanging up
     *     mid-farewell. All other types ship immediately.
     *   - `listenMode: boolean`: applied via `setListenMode`.
     *   - `silenceEnabled: boolean`: applied against the per-session silence
     *     handler (on enable, also resets the timer). No-op for sessions
     *     without a silence handler.
     *
     * @throws if the tool is not registered or produces an invalid
     *   `outgoingMessage`.
     */
    executeTool(name: string, args: unknown): Promise<unknown>;
    private applyOutgoingMessageConvention;
    private applyListenModeConvention;
    private applySilenceConvention;
    /**
     * Handle ws close. Stops the silence handler. The manager handles
     * registry removal and `onSessionEnded` callback dispatch.
     */
    handleClose(): void;
    /** Force-close the ws. Used by `ConversationRelay.shutdown()`. */
    close(): void;
    /** Read-only access to the raw ws — for diagnostics / tests. */
    getWebSocket(): WebSocket;
    private buildSilenceHandler;
}

/**
 * ConversationRelay — Twilio ConversationRelay protocol manager.
 *
 * Holds only what is genuinely shared across sessions or lifecycle-external:
 *   - `sessions: Map<CallSid, ConversationRelaySession>` — directory for
 *     out-of-band lookup (status callbacks, shutdown).
 *   - `toolRegistry: ToolRegistry` — tool definitions shared by every
 *     active call; registering a tool makes it available to all sessions.
 *   - `silenceTemplate?: SilenceConfig` — blueprint copied into each
 *     session's `SilenceHandler` on setup.
 *   - `callbacks` — subscriber fan-out registered by consumers
 *     (`ConversationRelayChannel` or standalone apps).
 *   - TwiML generation.
 *
 * The manager owns `ws.on('message' | 'close' | 'error')` for every
 * upgrade. On the first `setup` frame it constructs a
 * `ConversationRelaySession`, registers it, fires `onSessionStarted`, and
 * forwards subsequent frames to `session.handleIncomingFrame(...)`. No
 * listener transfer — one set of ws handlers, owned by the manager.
 *
 * NO dependency on @twilio/tac-core — completely standalone.
 */

/**
 * Optional config for `new ConversationRelay(logger, config)`.
 *
 * - `silence`: enables per-session silence monitoring with the supplied
 *   threshold + additional prompts. Omit to disable silence handling entirely.
 * - `tools`: the shared `ToolRegistry`. Omit for a default registry populated
 *   with the seven `CONVERSATION_RELAY_TOOLS` built-ins.
 */
interface ConversationRelayConstructorConfig {
    silence?: SilenceConfig;
    tools?: ToolRegistry;
}
type SessionStartedCallback = (session: ConversationRelaySession, data: SetupMessage) => void;
type PromptCallback = (session: ConversationRelaySession, message: string, data: PromptMessage) => void;
type InterruptCallback = (session: ConversationRelaySession, data: InterruptMessage) => void;
type DtmfCallback = (session: ConversationRelaySession, data: DtmfMessage) => void;
type InfoCallback = (session: ConversationRelaySession, data: InfoMessage) => void;
type SessionEndedCallback = (session: ConversationRelaySession) => void;
type ErrorCallback = (session: ConversationRelaySession, error: Error) => void;
declare class ConversationRelay {
    private readonly logger;
    private readonly sessions;
    private readonly toolRegistry;
    private readonly silenceTemplate;
    private readonly callbacks;
    constructor(logger?: Logger, config?: ConversationRelayConstructorConfig);
    onSessionStarted(callback: SessionStartedCallback): void;
    onPrompt(callback: PromptCallback): void;
    onInterrupt(callback: InterruptCallback): void;
    onDtmf(callback: DtmfCallback): void;
    onInfo(callback: InfoCallback): void;
    onSessionEnded(callback: SessionEndedCallback): void;
    onError(callback: ErrorCallback): void;
    /**
     * The shared tool registry. `ConversationRelayChannel` forwards `listTools()`
     * to this; standalone apps can read/register tools here before wiring the
     * CR server.
     */
    getToolRegistry(): ToolRegistry;
    /**
     * Handle incoming WebSocket connection from Twilio ConversationRelay.
     * The manager owns `ws.on(...)` for the lifetime of the session. On the
     * first `setup` frame, we construct a `ConversationRelaySession` and
     * forward subsequent frames to it.
     */
    handleConnection(ws: WebSocket): void;
    private createSession;
    /** Fetch the active session for a CallSid, or `undefined` if none. */
    getSession(callSid: CallSid): ConversationRelaySession | undefined;
    /** Whether an active session exists for a CallSid. */
    hasSession(callSid: CallSid): boolean;
    /**
     * Generate TwiML for a ConversationRelay connection.
     *
     * Produces a <Response><Connect><ConversationRelay> document with optional
     * <Parameter> child elements and <Language> configurations.
     */
    generateTwiML(config: ConversationRelayConfig, parameters?: CustomParameters, options?: {
        actionUrl?: string;
    }): string;
    /** Close every session's ws and clear the registry. */
    shutdown(): void;
    private static filterUnsetValues;
}

/**
 * Server configuration for standalone ConversationRelay (without Maestro)
 */
interface ConversationRelayServerConfig {
    /** Fastify server options */
    fastify?: FastifyServerOptions;
    /** Server host (default: 0.0.0.0) */
    host?: string;
    /** Server port (default: 8001) */
    port?: number;
    /** Custom webhook paths */
    webhookPaths?: {
        twiml?: string;
        ws?: string;
        callback?: string;
        webhook?: string;
    };
    /** ConversationRelay configuration (welcomeGreeting, TTS, etc.) */
    conversationRelayConfig?: Omit<ConversationRelayConfig, 'url'>;
    /** Enable development logging (pino-pretty) */
    development?: boolean;
    /**
     * Twilio auth token used to validate every incoming webhook and WebSocket
     * upgrade. Required — there is no opt-out. Matches the always-on posture
     * of TACServer (see PR #69).
     */
    authToken: string;
    /**
     * Public domain this server is reachable at (without scheme, e.g.
     * `cr-des.ngrok.dev` or `voice.example.com`). Used to build the WebSocket
     * URL (`wss://{publicDomain}/ws`) and callback URL rendered into the TwiML
     * `<ConversationRelay>` element, and to reconstruct the URL Twilio signed
     * against for signature validation.
     *
     * Required because load balancers (AWS ALB, GCP LB) and reverse proxies
     * (NGINX, Apache) routinely rewrite the `Host` header to internal backend
     * addresses; the old `x-forwarded-*` fallback was unreliable.
     *
     * Accepts either a bare host or a full `https://...` URL — values are
     * normalised via `normalizePublicDomain()`.
     */
    publicDomain: string;
    /**
     * Called on POST /twiml when an incoming call arrives. Return a record of
     * custom parameters that ConversationRelayServer will splice into the `<ConversationRelay>`
     * TwiML element (rendered by `conversationRelay.generateTwiML`).
     *
     * Integrated mode (with `@twilio/tac-core`): wire this to
     * `voiceChannel.createConversationForCall(input)` — the four Maestro IDs
     * (conversation_id, profile_id, customer_participant_id, ai_agent_participant_id)
     * flow to CR as customParameters and arrive at the CR WebSocket on the
     * `setup` message.
     *
     * Standalone mode: omit this — CR generates TwiML with `{}` as customParameters
     * and the caller drives their own LLM via CR event subscriptions.
     */
    onIncomingCall?: (input: {
        toNumber: string;
        fromNumber: string;
        callSid?: string;
    }) => Promise<CustomParameters>;
    /**
     * Called on POST /conversation-relay-callback when Twilio POSTs to the URL
     * declared as the `action` attribute of the `<ConversationRelay>` TwiML
     * element. Twilio fires this at call-end (CallStatus: completed) and when
     * a handoff is requested via the CR `end` message with `handoffData`.
     *
     * The payload includes CallSid, CallStatus, From, To, AccountSid, and —
     * for handoffs — the user-supplied HandoffData JSON string. The return
     * value is the HTTP response the server echoes back to Twilio:
     *   - status 200 + contentType 'application/xml' + TwiML content →
     *     Twilio executes the returned verbs (typical handoff path: return
     *     `<Dial>` TwiML to bridge to a human agent).
     *   - status 200 + 'text/plain' + 'OK' → acknowledge and hang up (the
     *     normal call-completed path).
     *
     * Integrated mode: wire to
     * `conversationRelayChannel.handleConversationRelayCallback(payload, handoffHandler)`
     * — `ConversationRelayChannel` closes the Maestro conversation on `completed`
     * and delegates handoffs to your handler.
     *
     * Standalone mode: omit — the route replies 200 OK no-op and call-end is
     * observable via the CR `onSessionEnded` event subscription.
     */
    onConversationRelayCallback?: (payload: ConversationRelayCallbackPayload) => Promise<{
        status: number;
        content: string;
        contentType: string;
    }>;
}
/**
 * ConversationRelayServer — Standalone voice-only server using ConversationRelay
 *
 * Lightweight server for voice-only applications. No Maestro, no Memory, no multi-channel.
 * Provides TwiML endpoint, WebSocket endpoint, and callback handler.
 */
declare class ConversationRelayServer {
    private readonly fastify;
    private readonly conversationRelay;
    private readonly config;
    constructor(conversationRelay: ConversationRelay, config: ConversationRelayServerConfig);
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Setup routes
     */
    private setupRoutes;
    /**
     * Stop the server
     */
    stop(): Promise<void>;
}

/**
 * ConversationRelayChannel — CR + Maestro active-voice channel.
 *
 * Bridges the `@twilio/tac-conversationrelay` WebSocket protocol to Maestro
 * Conversations: CR events (setup/prompt/interrupt/dtmf/info/close/error)
 * are translated into TAC `ChannelMessage`s and emitted via `onMessage`.
 * Outbound text/dtmf/play/endCall go through the ConversationRelaySession
 * handle.
 *
 * This is the **only** file in tac-core that imports CR payload types
 * (SetupMessage / PromptMessage / InterruptMessage). Passive voice via
 * Maestro webhooks lives in `./voice.ts` and has zero CR dependency.
 */

interface ConversationRelayChannelConfig {
    /** Active ConversationRelay instance. Required — this channel is the CR bridge. */
    conversationRelay: ConversationRelay;
}
declare class ConversationRelayChannel implements Channel {
    readonly channelType: ChannelType;
    protected readonly config: TACConfig;
    protected readonly logger: Logger$1;
    protected readonly conversationClient: ConversationClient;
    protected readonly callbacks: ChannelEvents;
    private readonly conversationRelay;
    /** Primary per-call handle. Keyed by `ConversationId` → O(1) public lookups. */
    private readonly bindings;
    /** Reverse index for teardown. WeakMap → auto-cleanup when session GC'd. */
    private readonly reverseIndex;
    private readonly memoryRetriever;
    private readonly sessionStore;
    constructor(deps: {
        config: TACConfig;
        logger: Logger$1;
        conversationClient: ConversationClient;
        memoryRetriever: MemoryRetriever;
    }, channelConfig: ConversationRelayChannelConfig);
    private wireCRCallbacks;
    private handleSetupFromRelay;
    private handlePromptFromRelay;
    private handleInterruptFromRelay;
    private handleCloseFromRelay;
    private handleSetupMessage;
    private handlePromptMessage;
    private emitMessage;
    private requireSession;
    sendResponse(conversationId: ConversationId, message: string, metadata?: Record<string, unknown>): Promise<void>;
    sendDigits(conversationId: ConversationId, digits: string): void;
    sendPlay(conversationId: ConversationId, source: string, options?: {
        loop?: number;
        interruptible?: boolean;
        preemptible?: boolean;
    }): void;
    endCall(conversationId: ConversationId, handoffData?: Record<string, unknown>): void;
    listTools(): ChannelTool[];
    registerTool(tool: ChannelTool): void;
    executeTool(conversationId: ConversationId, name: string, args: unknown): Promise<unknown>;
    on(event: string, callback: (...args: any[]) => void): void;
    getConversationSession(conversationId: ConversationId): ConversationSession | undefined;
    isConversationActive(conversationId: ConversationId): boolean;
    shutdown(): void;
    protected startConversation(conversationId: ConversationId, profileId?: ProfileId, serviceId?: string): ConversationSession;
    protected endConversation(conversationId: ConversationId): Promise<void>;
    protected handleError(error: Error, context?: Record<string, unknown>): void;
    /**
     * Create the Maestro conversation for an incoming voice call and return the
     * IDs that CR injects as TwiML customParameters. Wire to
     * `ConversationRelayServer.onIncomingCall`.
     */
    createConversationForCall(input: {
        toNumber: string;
        fromNumber: string;
        callSid?: string;
    }): Promise<{
        conversation_id: string;
        profile_id: string;
        customer_participant_id: string;
        ai_agent_participant_id: string;
    }>;
    handleConversationRelayCallback(payload: ConversationRelayCallbackPayload, handoffHandler?: (payload: ConversationRelayCallbackPayload) => Promise<string>): Promise<{
        status: number;
        content: string;
        contentType: string;
    }>;
    private closeConversationsForCall;
}

/**
 * Shared composition helpers for channels.
 *
 * Channels compose these helpers instead of inheriting from a base class:
 *   - ConversationSessionStore — owns the per-channel active-conversation Map
 *   - ConversationsWebhookProcessor — dedup + event routing for Maestro webhooks
 *   - ensureAgentParticipant (pure function) — resolve or lazy-create the
 *     conversation's AI_AGENT participant with 409-race handling
 */

/**
 * Messaging webhook event types from Twilio Conversations Service
 *
 * @remarks
 * **SCHEMA VERIFICATION NEEDED**: This webhook payload structure is inferred from
 * internal usage patterns and observation of actual webhook events. The official
 * Twilio Maestro Conversations documentation does not explicitly specify the complete
 * webhook event schema.
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
 * Callbacks invoked by the session store on lifecycle transitions.
 * Channels wire their own onConversationStarted/Ended handlers here.
 */
interface SessionStoreCallbacks {
    onConversationStarted?: (data: {
        session: ConversationSession;
    }) => void;
    onConversationEnded?: (data: {
        session: ConversationSession;
    }) => Promise<void> | void;
}
/**
 * Per-channel conversation session store.
 *
 * Owns the Map<ConversationId, ConversationSession>. Each channel
 * instantiates its own store — sessions are not shared across channels.
 */
declare class ConversationSessionStore {
    private readonly sessions;
    private readonly logger;
    private readonly channelType;
    private readonly callbacks;
    constructor(deps: {
        logger: Logger$1;
        channelType: ChannelType;
        callbacks: SessionStoreCallbacks;
    });
    /**
     * Start a new conversation session. No-op if the session already exists;
     * returns the existing session in that case.
     */
    start(conversationId: ConversationId, profileId?: ProfileId, serviceId?: string): ConversationSession;
    /**
     * End a conversation session.
     *
     * Triggers onConversationEnded BEFORE removing the session so the callback
     * receives the full session. Errors in the callback do not prevent cleanup.
     */
    end(conversationId: ConversationId): Promise<void>;
    get(conversationId: ConversationId): ConversationSession | undefined;
    isActive(conversationId: ConversationId): boolean;
    /**
     * Clear all sessions (for shutdown).
     */
    clear(): void;
}
/**
 * Handlers supplied by a channel to receive routed webhook events.
 *
 * The processor handles dedup, self-filtering, and payload validation; the
 * channel supplies handler callbacks for the event types it cares about.
 */
interface ConversationsWebhookHandlers {
    /** Channel type used for self-filtering on author.channel */
    channelType: ChannelType;
    /** Optional: return true if the conversation is active on this channel (for CONVERSATION_UPDATED filtering) */
    isConversationActive?: (conversationId: ConversationId) => boolean;
    onConversationCreated?: (payload: MessagingWebhookPayload) => void;
    onParticipantAdded?: (payload: MessagingWebhookPayload) => void;
    onCommunicationCreated?: (payload: MessagingWebhookPayload) => Promise<void>;
    onConversationUpdated?: (payload: MessagingWebhookPayload) => Promise<void>;
    /** Called when processing fails — lets the channel emit onError */
    onError?: (error: Error, context: Record<string, unknown>) => void;
}
interface WebhookProcessorConfig {
    /** Maximum number of idempotency tokens to track for deduplication (default: 10,000) */
    dedupCapacity?: number | undefined;
}
/**
 * Per-channel webhook processor.
 *
 * Owns the dedup set and event-routing logic. Each channel instantiates
 * its own processor — dedup state is not shared across channels.
 */
declare class ConversationsWebhookProcessor {
    private readonly logger;
    private readonly processedTokens;
    private readonly maxTrackedTokens;
    constructor(deps: {
        logger: Logger$1;
    }, config?: WebhookProcessorConfig);
    /**
     * Process a Maestro Conversations webhook payload, routing recognized event
     * types to the supplied handlers. Performs dedup, self-filtering, and
     * payload validation before dispatch.
     */
    process(payload: unknown, handlers: ConversationsWebhookHandlers, idempotencyToken?: string): Promise<void>;
    /**
     * Check if a webhook has already been processed, and if not, record the token immediately.
     * Single synchronous check-and-record to prevent races where a duplicate arrives while
     * the first request is still awaiting async work. FIFO eviction at capacity.
     */
    private isDuplicate;
    private isEventForThisChannel;
    private validatePayload;
}
/**
 * Return the conversation's agent participant (AI_AGENT / HUMAN_AGENT / AGENT)
 * that owns `agentAddress`, creating one if absent.
 *
 * Behaviour:
 *   1. Match against `existingParticipants` — return the first AGENT-type
 *      participant with an address matching `agentAddress` on both channel and
 *      address.
 *   2. No match → create an AI_AGENT with `agentAddress`.
 *   3. Create failed (usually 409 from a concurrent worker) → re-list and
 *      re-match. Returns undefined if still not found, letting callers
 *      decide how to surface the failure.
 */
declare function ensureAgentParticipant(client: ConversationClient, logger: Logger$1, conversationId: ConversationId, existingParticipants: ConversationParticipant[], agentAddress: ConversationAddress): Promise<ConversationParticipant | undefined>;

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
    constructor(memoryClient: MemoryClient, config: ConversationIntelligenceConfig, logger?: Logger$1);
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
    readonly parameters: JSONSchema$1;
    readonly implementation: ToolFunction$1<TParams, TResult>;
    constructor(name: string, description: string, parameters: JSONSchema$1, implementation: ToolFunction$1<TParams, TResult>);
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
declare function defineTool<TParams = unknown, TResult = unknown>(name: string, description: string, parameters: JSONSchema$1, implementation: ToolFunction$1<TParams, TResult>): TACTool<TParams, TResult>;

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
 *
 * TACServer handles Conversation Orchestrator (Maestro) webhooks only. Voice
 * routes (/twiml, /ws, /conversation-relay-callback) live on
 * `ConversationRelayServer` in `@twilio/tac-conversationrelay` — see the two-process
 * deployment story in the README.
 */
interface TACServerConfig {
    /**
     * Public domain this server is reachable at (without scheme, e.g.
     * `tac-des.ngrok.dev` or `api.example.com`). Used to reconstruct the URL
     * Twilio signed webhooks against for signature validation.
     *
     * Required because load balancers (AWS ALB, GCP LB) and reverse proxies
     * (NGINX, Apache) routinely rewrite the `Host` header to internal backend
     * addresses; the old `x-forwarded-*` fallback was unreliable.
     *
     * Accepts either a bare host or a full `https://...` URL — values are
     * normalised via `normalizePublicDomain()`.
     */
    publicDomain: string;
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
    /** Server host (default: 0.0.0.0) */
    host?: string;
    /** Server port (default: 8000) */
    port?: number;
    /** Custom webhook paths */
    webhookPaths?: {
        messaging?: string;
        /** Path for Conversation Intelligence webhook (optional - only registered if provided) */
        cintel?: string;
    };
    /** Enable development features */
    development?: boolean;
    /**
     * Channels consuming Conversation Orchestrator webhooks (SMS, Chat, and
     * passive Voice). Webhooks are fanned out to every channel in this list;
     * each channel's `processWebhook` self-filters on `author.channel`.
     *
     * Alternative to registering channels on TAC — provide this array to
     * override TAC's channel registry for server-level fan-out.
     */
    conversationChannels?: Channel[];
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
    /** Channels consuming Conversation Orchestrator webhooks — fanned out on POST /webhook */
    private readonly conversationChannels;
    constructor(tac: TAC, config: TACServerConfig);
    /**
     * Setup routes — Maestro webhook fan-out and optional Conversation
     * Intelligence webhook. Voice routes are served by ConversationRelayServer in the
     * tac-conversationrelay package.
     */
    private setupRoutes;
    private setupMessagingRoutes;
    private setupCintelRoute;
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Stop the server gracefully
     */
    stop(): Promise<void>;
}

export { type ActionChannelSettings, ActionChannelSettingsSchema, type ActionParticipantRef, ActionParticipantRefSchema, type ActionResponse, ActionResponseSchema, type ActionTextContent, ActionTextContentSchema, type AuthorInfo, AuthorInfoSchema, BaseClient, type BuiltInToolName, BuiltInTools, type CaptureRule, CaptureRuleSchema, type Channel, type ChannelEvents, type ChannelMessage, type ChannelSettings, ChannelSettingsSchema, type ChannelTool, type ChannelType, ChannelTypeSchema, ChatChannel, type ChatChannelConfig, type CintelParticipant, CintelParticipantSchema, type Communication, type CommunicationContent, CommunicationContentSchema, type CommunicationParticipant, CommunicationParticipantSchema, CommunicationSchema, type ConversationAddress, ConversationAddressSchema, ConversationClient, type ConversationConfiguration, ConversationConfigurationSchema, type ConversationEndedCallback, type ConversationGroupingType, ConversationGroupingTypeSchema, type ConversationId, type ConversationIntelligenceConfig, ConversationIntelligenceConfigSchema, type ConversationParticipant, ConversationParticipantSchema, ConversationRelay, ConversationRelayChannel, type ConversationRelayChannelConfig, ConversationRelayServer, type ConversationRelayServerConfig, type ConversationResponse, ConversationResponseSchema, type ConversationSession, ConversationSessionSchema, ConversationSessionStore, type ConversationSummaryItem, ConversationSummaryItemSchema, type ConversationsV1Bridge, ConversationsV1BridgeSchema, type ConversationsWebhookHandlers, ConversationsWebhookProcessor, type CreateConversationSummariesResponse, CreateConversationSummariesResponseSchema, type CreateObservationResponse, CreateObservationResponseSchema, EMPTY_MEMORY_RESPONSE, EnvironmentVariables, type ErrorCallback$1 as ErrorCallback, type ExecutionDetails, ExecutionDetailsSchema, type HandoffCallback, type IntelligenceConfiguration, IntelligenceConfigurationSchema, type JSONSchema$1 as JSONSchema, JSONSchemaSchema$1 as JSONSchemaSchema, type KnowledgeBase, type KnowledgeBaseId, KnowledgeBaseSchema, type KnowledgeBaseStatus, KnowledgeBaseStatusSchema, type KnowledgeChunkResult, KnowledgeChunkResultSchema, KnowledgeClient, type KnowledgeId, type KnowledgeSearchResponse, KnowledgeSearchResponseSchema, type ListCommunicationsResponse, ListCommunicationsResponseSchema, type ListConversationsResponse, ListConversationsResponseSchema, type ListParticipantsResponse, ListParticipantsResponseSchema, type Logger$1 as Logger, type MemoryChannelType, MemoryChannelTypeSchema, MemoryClient, type MemoryCommunication, type MemoryCommunicationContent, MemoryCommunicationContentSchema, MemoryCommunicationSchema, type MemoryDeliveryStatus, MemoryDeliveryStatusSchema, type MemoryParticipant, MemoryParticipantSchema, type MemoryParticipantType, MemoryParticipantTypeSchema, type MemoryRetrievalRequest, MemoryRetrievalRequestSchema, type MemoryRetrievalResponse, MemoryRetrievalResponseSchema, type MemoryRetriever, type MemoryStoreId, type MessageDirection, MessageDirectionSchema, type MessageReadyCallback, type MessagingWebhookPayload, type ObservationInfo, ObservationInfoSchema, type OpenAITool, OpenAIToolSchema, type Operator, type OperatorProcessingResult, OperatorProcessingResultSchema, type OperatorResult, type OperatorResultEvent, OperatorResultEventSchema, OperatorResultProcessor, OperatorResultSchema, OperatorSchema, type ParticipantAddress, ParticipantAddressSchema, type ParticipantAddressType, ParticipantAddressTypeSchema, type ParticipantId, type Profile, type ProfileId, type ProfileLookupResponse, ProfileLookupResponseSchema, type ProfileResponse, ProfileResponseSchema, SMSChannel, type SMSChannelConfig, type SendMessageActionPayload, SendMessageActionPayloadSchema, type SendMessageActionRequest, SendMessageActionRequestSchema, type SessionContext, type SessionInfo, SessionInfoSchema, type SessionMessage, SessionMessageSchema, type SessionStoreCallbacks, type StatusCallback, StatusCallbackSchema, type StatusTimeouts, StatusTimeoutsSchema, type SummaryInfo, SummaryInfoSchema, TAC, type TACChannelType, TACChannelTypeSchema, type TACCommunication, type TACCommunicationAuthor, TACCommunicationAuthorSchema, type TACCommunicationContent, TACCommunicationContentSchema, TACCommunicationSchema, TACConfig, type TACConfigData, TACConfigSchema, type TACCustomParameters, TACCustomParametersSchema, type TACDeliveryStatus, TACDeliveryStatusSchema, TACMemoryResponse, type TACOptions, type TACParticipantType, TACParticipantTypeSchema, TACServer, type TACServerConfig, TACTool, type ToolContext, type ToolExecutionResult, ToolExecutionResultSchema, type ToolFunction$1 as ToolFunction, type Transcription, TranscriptionSchema, type TranscriptionWord, TranscriptionWordSchema, VoiceChannel, type VoiceChannelConfig, type WebhookProcessorConfig, createHandoffTool, createHandoffTools, createKnowledgeSearchTool, createKnowledgeSearchToolAsync, createKnowledgeTools, createLogger, createMemoryRetrievalTool, createMemoryTools, createMessagingTools, createSendMessageTool, defineTool, ensureAgentParticipant, isConversationId, isKnowledgeBaseId, isKnowledgeId, isMemoryStoreId, isParticipantId, isProfileId };
