import pino from 'pino';

/**
 * Logger type used throughout the ConversationRelay package.
 */
export type Logger = pino.Logger;

/**
 * Create a Pino logger with sensible defaults for CR.
 *
 * Vendored locally so the ConversationRelay package stays free of any
 * dependency on @twilio/tac-core.
 *
 * @param options - Logger configuration options
 * @returns Configured Pino logger
 */
export function createLogger(options?: {
  level?: string;
  pretty?: boolean;
  name?: string;
}): Logger {
  const level = options?.level || process.env.TWILIO_LOG_LEVEL || 'info';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const usePretty = options?.pretty !== undefined ? options.pretty : isDevelopment;

  const pinoOptions: pino.LoggerOptions = {
    level,
    ...(options?.name && { name: options.name }),
  };

  if (usePretty) {
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {},
      },
    });
  }

  return pino(pinoOptions);
}
