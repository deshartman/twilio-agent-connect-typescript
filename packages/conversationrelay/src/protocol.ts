/**
 * ConversationRelay Protocol Utilities
 *
 * Static methods for TwiML generation and protocol utilities.
 * Pure functions with no instance state.
 */

import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import {
  ConversationRelayConfig,
  ConversationRelayConfigSchema,
  CustomParameters,
  CustomParametersSchema,
} from './types.js';

/**
 * ConversationRelay Protocol static utilities
 */
export class ConversationRelayProtocol {
  /**
   * Generate TwiML for ConversationRelay connection
   *
   * Static method - no instance state needed.
   */
  public static generateTwiML(
    config: ConversationRelayConfig,
    parameters?: CustomParameters,
    options?: { actionUrl?: string }
  ): string {
    // Validate configuration
    const validationResult = ConversationRelayConfigSchema.safeParse(config);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new Error(`Invalid ConversationRelay configuration: ${errorMessage}`);
    }

    const validatedConfig = validationResult.data;

    // Validate custom parameters if provided
    if (parameters) {
      const paramsValidation = CustomParametersSchema.safeParse(parameters);
      if (!paramsValidation.success) {
        const errorMessage = paramsValidation.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new Error(`Invalid custom parameters: ${errorMessage}`);
      }
    }

    // Extract languages array (child elements, not attributes)
    const { languages, ...conversationRelayAttributes } = validatedConfig;

    // Filter out undefined values to keep TwiML clean
    const filteredConfig = ConversationRelayProtocol.filterUnsetValues(conversationRelayAttributes);

    // Build TwiML using SDK
    const response = new VoiceResponse();
    const connect = response.connect(options?.actionUrl ? { action: options.actionUrl } : {});
    const relay = connect.conversationRelay(filteredConfig);

    // Add language configurations as child <Language> elements
    if (languages && languages.length > 0) {
      for (const lang of languages) {
        const filteredLang = ConversationRelayProtocol.filterUnsetValues(lang);
        relay.language(filteredLang);
      }
    }

    // Add custom parameters if provided
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
  private static filterUnsetValues<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, value]) => value !== undefined && value !== null)
    );
  }
}
