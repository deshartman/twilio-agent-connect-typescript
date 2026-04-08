import { WebSocket } from 'ws';
import { Logger } from 'pino';
import { z } from 'zod';

/**
 * ConversationRelay type definitions
 */

/**
 * CallSid - Twilio call identifier
 */
type CallSid = string & {
    readonly __brand: 'CallSid';
};
/**
 * Setup message from ConversationRelay
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
    customParameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "setup";
    sessionId: string;
    callSid: string;
    from: string;
    to: string;
    direction: string;
    callType: string;
    callStatus: string;
    accountSid: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, unknown> | undefined;
}, {
    type: "setup";
    sessionId: string;
    callSid: string;
    from: string;
    to: string;
    direction: string;
    callType: string;
    callStatus: string;
    accountSid: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, unknown> | undefined;
}>;
type SetupMessage = z.infer<typeof SetupMessageSchema>;
/**
 * Prompt message from ConversationRelay
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
 * Interrupt message from ConversationRelay
 */
declare const InterruptMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"interrupt">;
    reason: z.ZodString;
    voicePrompt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "interrupt";
    reason: string;
    voicePrompt?: string | undefined;
}, {
    type: "interrupt";
    reason: string;
    voicePrompt?: string | undefined;
}>;
type InterruptMessage = z.infer<typeof InterruptMessageSchema>;
/**
 * Text token message to send via ConversationRelay
 */
declare const TextTokenMessageSchema: z.ZodObject<{
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
}>;
type TextTokenMessage = z.infer<typeof TextTokenMessageSchema>;
/**
 * Union of all WebSocket message types
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
    customParameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "setup";
    sessionId: string;
    callSid: string;
    from: string;
    to: string;
    direction: string;
    callType: string;
    callStatus: string;
    accountSid: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, unknown> | undefined;
}, {
    type: "setup";
    sessionId: string;
    callSid: string;
    from: string;
    to: string;
    direction: string;
    callType: string;
    callStatus: string;
    accountSid: string;
    parentCallSid?: string | undefined;
    forwardedFrom?: string | undefined;
    callerName?: string | undefined;
    customParameters?: Record<string, unknown> | undefined;
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
    reason: z.ZodString;
    voicePrompt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "interrupt";
    reason: string;
    voicePrompt?: string | undefined;
}, {
    type: "interrupt";
    reason: string;
    voicePrompt?: string | undefined;
}>]>;
type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
/**
 * Custom parameters passed via TwiML
 */
declare const CustomParametersSchema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>;
type CustomParameters = z.infer<typeof CustomParametersSchema>;
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
    ttsVoice: z.ZodOptional<z.ZodString>;
    /** Speech model for this language */
    speechModel: z.ZodOptional<z.ZodString>;
    /** Profanity filter setting */
    profanityFilter: z.ZodOptional<z.ZodString>;
    /** Speech timeout in milliseconds */
    speechTimeout: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    ttsProvider?: string | undefined;
    ttsVoice?: string | undefined;
    speechModel?: string | undefined;
    profanityFilter?: string | undefined;
    speechTimeout?: string | undefined;
}, {
    code: string;
    ttsProvider?: string | undefined;
    ttsVoice?: string | undefined;
    speechModel?: string | undefined;
    profanityFilter?: string | undefined;
    speechTimeout?: string | undefined;
}>;
type LanguageAttributes = z.infer<typeof LanguageAttributesSchema>;
/**
 * ConversationRelay attributes (maps to TwiML <ConversationRelay> attributes)
 * @see https://www.twilio.com/docs/voice/conversationrelay/conversationrelay-noun#attributes
 */
declare const ConversationRelayAttributesSchema: z.ZodObject<{
    /** WebSocket URL for ConversationRelay connection */
    url: z.ZodString;
    /** Welcome greeting message */
    welcomeGreeting: z.ZodOptional<z.ZodString>;
    /** Welcome greeting interruptibility */
    welcomeGreetingInterruptible: z.ZodOptional<z.ZodEnum<["before-start", "any"]>>;
    /** Voice for TTS (e.g., 'Google.en-US-Studio-O') */
    voice: z.ZodOptional<z.ZodString>;
    /** TTS provider */
    ttsProvider: z.ZodOptional<z.ZodString>;
    /** Transcription provider */
    transcriptionProvider: z.ZodOptional<z.ZodString>;
    /** Speech model */
    speechModel: z.ZodOptional<z.ZodString>;
    /** Profanity filter */
    profanityFilter: z.ZodOptional<z.ZodString>;
    /** Speech timeout */
    speechTimeout: z.ZodOptional<z.ZodString>;
    /** Interrupt by DTMF */
    dtmfDetection: z.ZodOptional<z.ZodBoolean>;
    /** Debug mode */
    debug: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    url: string;
    ttsProvider?: string | undefined;
    speechModel?: string | undefined;
    profanityFilter?: string | undefined;
    speechTimeout?: string | undefined;
    welcomeGreeting?: string | undefined;
    welcomeGreetingInterruptible?: "before-start" | "any" | undefined;
    voice?: string | undefined;
    transcriptionProvider?: string | undefined;
    dtmfDetection?: boolean | undefined;
    debug?: boolean | undefined;
}, {
    url: string;
    ttsProvider?: string | undefined;
    speechModel?: string | undefined;
    profanityFilter?: string | undefined;
    speechTimeout?: string | undefined;
    welcomeGreeting?: string | undefined;
    welcomeGreetingInterruptible?: "before-start" | "any" | undefined;
    voice?: string | undefined;
    transcriptionProvider?: string | undefined;
    dtmfDetection?: boolean | undefined;
    debug?: boolean | undefined;
}>;
type ConversationRelayAttributes = z.infer<typeof ConversationRelayAttributesSchema>;
/**
 * Full ConversationRelay configuration including languages
 */
declare const ConversationRelayConfigSchema: z.ZodObject<{
    /** WebSocket URL for ConversationRelay connection */
    url: z.ZodString;
    /** Welcome greeting message */
    welcomeGreeting: z.ZodOptional<z.ZodString>;
    /** Welcome greeting interruptibility */
    welcomeGreetingInterruptible: z.ZodOptional<z.ZodEnum<["before-start", "any"]>>;
    /** Voice for TTS (e.g., 'Google.en-US-Studio-O') */
    voice: z.ZodOptional<z.ZodString>;
    /** TTS provider */
    ttsProvider: z.ZodOptional<z.ZodString>;
    /** Transcription provider */
    transcriptionProvider: z.ZodOptional<z.ZodString>;
    /** Speech model */
    speechModel: z.ZodOptional<z.ZodString>;
    /** Profanity filter */
    profanityFilter: z.ZodOptional<z.ZodString>;
    /** Speech timeout */
    speechTimeout: z.ZodOptional<z.ZodString>;
    /** Interrupt by DTMF */
    dtmfDetection: z.ZodOptional<z.ZodBoolean>;
    /** Debug mode */
    debug: z.ZodOptional<z.ZodBoolean>;
} & {
    /** Multi-language configurations */
    languages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        /** Language code (e.g., 'en-US', 'es-ES', 'en-AU') */
        code: z.ZodString;
        /** TTS provider for this language */
        ttsProvider: z.ZodOptional<z.ZodString>;
        /** TTS voice for this language */
        ttsVoice: z.ZodOptional<z.ZodString>;
        /** Speech model for this language */
        speechModel: z.ZodOptional<z.ZodString>;
        /** Profanity filter setting */
        profanityFilter: z.ZodOptional<z.ZodString>;
        /** Speech timeout in milliseconds */
        speechTimeout: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        ttsProvider?: string | undefined;
        ttsVoice?: string | undefined;
        speechModel?: string | undefined;
        profanityFilter?: string | undefined;
        speechTimeout?: string | undefined;
    }, {
        code: string;
        ttsProvider?: string | undefined;
        ttsVoice?: string | undefined;
        speechModel?: string | undefined;
        profanityFilter?: string | undefined;
        speechTimeout?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    url: string;
    ttsProvider?: string | undefined;
    speechModel?: string | undefined;
    profanityFilter?: string | undefined;
    speechTimeout?: string | undefined;
    welcomeGreeting?: string | undefined;
    welcomeGreetingInterruptible?: "before-start" | "any" | undefined;
    voice?: string | undefined;
    transcriptionProvider?: string | undefined;
    dtmfDetection?: boolean | undefined;
    debug?: boolean | undefined;
    languages?: {
        code: string;
        ttsProvider?: string | undefined;
        ttsVoice?: string | undefined;
        speechModel?: string | undefined;
        profanityFilter?: string | undefined;
        speechTimeout?: string | undefined;
    }[] | undefined;
}, {
    url: string;
    ttsProvider?: string | undefined;
    speechModel?: string | undefined;
    profanityFilter?: string | undefined;
    speechTimeout?: string | undefined;
    welcomeGreeting?: string | undefined;
    welcomeGreetingInterruptible?: "before-start" | "any" | undefined;
    voice?: string | undefined;
    transcriptionProvider?: string | undefined;
    dtmfDetection?: boolean | undefined;
    debug?: boolean | undefined;
    languages?: {
        code: string;
        ttsProvider?: string | undefined;
        ttsVoice?: string | undefined;
        speechModel?: string | undefined;
        profanityFilter?: string | undefined;
        speechTimeout?: string | undefined;
    }[] | undefined;
}>;
type ConversationRelayConfig = z.infer<typeof ConversationRelayConfigSchema>;

/**
 * ConversationRelay Utility
 *
 * Pure utility for handling ConversationRelay WebSocket protocol.
 * No Channel interface, no TAC knowledge, no Maestro concepts - just protocol handling.
 *
 * Used internally by VoiceChannel for both CR-only and Maestro modes.
 */

/**
 * Callback types for ConversationRelay events
 */
type SetupCallback = (callSid: CallSid, data: SetupMessage) => void;
type PromptCallback = (callSid: CallSid, data: PromptMessage) => void;
type InterruptCallback = (callSid: CallSid, data: InterruptMessage) => void;
type CloseCallback = (callSid: CallSid) => void;
type ErrorCallback = (callSid: CallSid, error: Error) => void;
/**
 * Pure ConversationRelay protocol utility
 *
 * Handles WebSocket connections and message routing for ConversationRelay protocol.
 * CallSid-based operations only - no conversation or session concepts.
 */
declare class ConversationRelay {
    private readonly logger;
    private readonly connections;
    private readonly callbacks;
    constructor(logger: Logger);
    /**
     * Register setup message callback
     */
    onSetup(callback: SetupCallback): void;
    /**
     * Register prompt message callback
     */
    onPrompt(callback: PromptCallback): void;
    /**
     * Register interrupt message callback
     */
    onInterrupt(callback: InterruptCallback): void;
    /**
     * Register close callback
     */
    onClose(callback: CloseCallback): void;
    /**
     * Register error callback
     */
    onError(callback: ErrorCallback): void;
    /**
     * Handle incoming WebSocket connection
     *
     * Extracts CallSid from setup message and routes subsequent messages.
     */
    handleConnection(ws: WebSocket): void;
    /**
     * Get WebSocket connection for a CallSid
     */
    getWebSocket(callSid: CallSid): WebSocket | null;
    /**
     * Send text token message via WebSocket
     */
    sendMessage(callSid: CallSid, message: TextTokenMessage): void;
    /**
     * Close WebSocket connection
     */
    closeConnection(callSid: CallSid): void;
    /**
     * Shutdown utility - close all connections
     */
    shutdown(): void;
}

/**
 * ConversationRelay Protocol Utilities
 *
 * Static methods for TwiML generation and protocol utilities.
 * Pure functions with no instance state.
 */

/**
 * ConversationRelay Protocol static utilities
 */
declare class ConversationRelayProtocol {
    /**
     * Generate TwiML for ConversationRelay connection
     *
     * Static method - no instance state needed.
     */
    static generateTwiML(config: ConversationRelayConfig, parameters?: CustomParameters, options?: {
        actionUrl?: string;
    }): string;
    /**
     * Filter undefined/null values from object for clean TwiML
     */
    private static filterUnsetValues;
}

export { type CallSid, ConversationRelay, type ConversationRelayAttributes, ConversationRelayAttributesSchema, type ConversationRelayConfig, ConversationRelayConfigSchema, ConversationRelayProtocol, type CustomParameters, CustomParametersSchema, type InterruptMessage, InterruptMessageSchema, type LanguageAttributes, LanguageAttributesSchema, type PromptMessage, PromptMessageSchema, type SetupMessage, SetupMessageSchema, type TextTokenMessage, TextTokenMessageSchema, type WebSocketMessage, WebSocketMessageSchema };
