import { z } from 'zod';

/**
 * TAC Custom Parameters — Maestro-specific parameters for TwiML <Parameter> elements
 *
 * These are TAC's own structured parameters for bridging ConversationRelay calls
 * to Maestro Conversations. NOT generic CR parameters (those live in the CR package).
 */
export const TACCustomParametersSchema = z.object({
  conversation_id: z.string().optional(),
  profile_id: z.string().optional(),
  customer_participant_id: z.string().optional(),
  ai_agent_participant_id: z.string().optional(),
});

export type TACCustomParameters = z.infer<typeof TACCustomParametersSchema>;
