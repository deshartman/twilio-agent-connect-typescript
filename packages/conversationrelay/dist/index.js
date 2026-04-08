// src/relay.ts
import { WebSocket } from "ws";

// src/types.ts
import { z } from "zod";
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
  customParameters: z.record(z.unknown()).optional()
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
  reason: z.string(),
  voicePrompt: z.string().optional()
});
var TextTokenMessageSchema = z.object({
  type: z.literal("text"),
  token: z.string(),
  last: z.boolean().optional().default(true)
});
var WebSocketMessageSchema = z.discriminatedUnion("type", [
  SetupMessageSchema,
  PromptMessageSchema,
  InterruptMessageSchema
]);
var CustomParametersSchema = z.record(z.string(), z.unknown()).refine(
  (params) => {
    return Object.keys(params).every((key) => key.trim().length > 0);
  },
  { message: "Custom parameter keys must be non-empty strings" }
);
var LanguageAttributesSchema = z.object({
  /** Language code (e.g., 'en-US', 'es-ES', 'en-AU') */
  code: z.string(),
  /** TTS provider for this language */
  ttsProvider: z.string().optional(),
  /** TTS voice for this language */
  ttsVoice: z.string().optional(),
  /** Speech model for this language */
  speechModel: z.string().optional(),
  /** Profanity filter setting */
  profanityFilter: z.string().optional(),
  /** Speech timeout in milliseconds */
  speechTimeout: z.string().optional()
});
var ConversationRelayAttributesSchema = z.object({
  /** WebSocket URL for ConversationRelay connection */
  url: z.string().url(),
  /** Welcome greeting message */
  welcomeGreeting: z.string().optional(),
  /** Welcome greeting interruptibility */
  welcomeGreetingInterruptible: z.enum(["before-start", "any"]).optional(),
  /** Voice for TTS (e.g., 'Google.en-US-Studio-O') */
  voice: z.string().optional(),
  /** TTS provider */
  ttsProvider: z.string().optional(),
  /** Transcription provider */
  transcriptionProvider: z.string().optional(),
  /** Speech model */
  speechModel: z.string().optional(),
  /** Profanity filter */
  profanityFilter: z.string().optional(),
  /** Speech timeout */
  speechTimeout: z.string().optional(),
  /** Interrupt by DTMF */
  dtmfDetection: z.boolean().optional(),
  /** Debug mode */
  debug: z.boolean().optional()
});
var ConversationRelayConfigSchema = ConversationRelayAttributesSchema.extend({
  /** Multi-language configurations */
  languages: z.array(LanguageAttributesSchema).optional()
});

// src/relay.ts
var ConversationRelay = class {
  logger;
  connections;
  callbacks;
  constructor(logger) {
    this.logger = logger;
    this.connections = /* @__PURE__ */ new Map();
    this.callbacks = {};
  }
  /**
   * Register setup message callback
   */
  onSetup(callback) {
    this.callbacks.onSetup = callback;
  }
  /**
   * Register prompt message callback
   */
  onPrompt(callback) {
    this.callbacks.onPrompt = callback;
  }
  /**
   * Register interrupt message callback
   */
  onInterrupt(callback) {
    this.callbacks.onInterrupt = callback;
  }
  /**
   * Register close callback
   */
  onClose(callback) {
    this.callbacks.onClose = callback;
  }
  /**
   * Register error callback
   */
  onError(callback) {
    this.callbacks.onError = callback;
  }
  /**
   * Handle incoming WebSocket connection
   *
   * Extracts CallSid from setup message and routes subsequent messages.
   */
  handleConnection(ws) {
    let callSid = null;
    ws.on("message", (data) => {
      try {
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
          case "setup":
            callSid = message.callSid;
            this.connections.set(callSid, ws);
            if (this.callbacks.onSetup) {
              this.callbacks.onSetup(callSid, message);
            }
            break;
          case "prompt":
            if (callSid && this.callbacks.onPrompt) {
              this.callbacks.onPrompt(callSid, message);
            }
            break;
          case "interrupt":
            if (callSid && this.callbacks.onInterrupt) {
              this.callbacks.onInterrupt(callSid, message);
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
        if (callSid && this.callbacks.onError) {
          this.callbacks.onError(callSid, err);
        }
      }
    });
    ws.on("close", () => {
      if (callSid) {
        this.connections.delete(callSid);
        this.logger.debug({ call_sid: callSid }, "ConversationRelay WebSocket closed");
        if (this.callbacks.onClose) {
          this.callbacks.onClose(callSid);
        }
      }
    });
    ws.on("error", (error) => {
      this.logger.error({ err: error, call_sid: callSid }, "ConversationRelay WebSocket error");
      if (callSid && this.callbacks.onError) {
        this.callbacks.onError(callSid, error);
      }
    });
  }
  /**
   * Get WebSocket connection for a CallSid
   */
  getWebSocket(callSid) {
    return this.connections.get(callSid) || null;
  }
  /**
   * Send text token message via WebSocket
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
   * Close WebSocket connection
   */
  closeConnection(callSid) {
    const ws = this.connections.get(callSid);
    if (ws) {
      ws.close();
      this.connections.delete(callSid);
      this.logger.debug({ call_sid: callSid }, "Closed ConversationRelay connection");
    }
  }
  /**
   * Shutdown utility - close all connections
   */
  shutdown() {
    for (const [callSid, ws] of this.connections.entries()) {
      ws.close();
      this.logger.debug({ call_sid: callSid }, "Shutdown: closed ConversationRelay connection");
    }
    this.connections.clear();
  }
};

// src/protocol.ts
import VoiceResponse from "twilio/lib/twiml/VoiceResponse.js";
var ConversationRelayProtocol = class _ConversationRelayProtocol {
  /**
   * Generate TwiML for ConversationRelay connection
   *
   * Static method - no instance state needed.
   */
  static generateTwiML(config, parameters, options) {
    const validationResult = ConversationRelayConfigSchema.safeParse(config);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      throw new Error(`Invalid ConversationRelay configuration: ${errorMessage}`);
    }
    const validatedConfig = validationResult.data;
    if (parameters) {
      const paramsValidation = CustomParametersSchema.safeParse(parameters);
      if (!paramsValidation.success) {
        const errorMessage = paramsValidation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
        throw new Error(`Invalid custom parameters: ${errorMessage}`);
      }
    }
    const { languages, ...conversationRelayAttributes } = validatedConfig;
    const filteredConfig = _ConversationRelayProtocol.filterUnsetValues(conversationRelayAttributes);
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);
    if (languages && languages.length > 0) {
      for (const lang of languages) {
        const filteredLang = _ConversationRelayProtocol.filterUnsetValues(lang);
        relay.language(filteredLang);
      }
    }
    if (parameters) {
      const paramElement = relay.parameter();
      for (const [key, value] of Object.entries(parameters)) {
        paramElement.name(key).value(String(value));
      }
    }
    return response.toString();
  }
  /**
   * Filter undefined/null values from object for clean TwiML
   */
  static filterUnsetValues(obj) {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, value]) => value !== void 0 && value !== null)
    );
  }
};
export {
  ConversationRelay,
  ConversationRelayAttributesSchema,
  ConversationRelayConfigSchema,
  ConversationRelayProtocol,
  CustomParametersSchema,
  InterruptMessageSchema,
  LanguageAttributesSchema,
  PromptMessageSchema,
  SetupMessageSchema,
  TextTokenMessageSchema,
  WebSocketMessageSchema
};
//# sourceMappingURL=index.js.map