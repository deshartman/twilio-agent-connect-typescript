import { describe, it, expect } from 'vitest';
import {
  PlayMessageSchema,
  SendDigitsMessageSchema,
  SwitchLanguageMessageSchema,
  EndMessageSchema,
  OutgoingMessageSchema,
} from '../src/types';

describe('ConversationRelay Outgoing Messages', () => {
  // =========================================================================
  // PlayMessage
  // =========================================================================

  describe('PlayMessage', () => {
    it('should validate play message with all fields', () => {
      const result = PlayMessageSchema.safeParse({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        loop: 3,
        interruptible: true,
        preemptible: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('play');
        expect(result.data.source).toBe('https://example.com/audio.mp3');
        expect(result.data.loop).toBe(3);
        expect(result.data.interruptible).toBe(true);
        expect(result.data.preemptible).toBe(false);
      }
    });

    it('should validate play message with only required fields', () => {
      const result = PlayMessageSchema.safeParse({
        type: 'play',
        source: 'https://example.com/audio.mp3',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('play');
        expect(result.data.source).toBe('https://example.com/audio.mp3');
      }
    });

    it('should reject invalid URL source', () => {
      const result = PlayMessageSchema.safeParse({
        type: 'play',
        source: 'not-a-url',
      });

      expect(result.success).toBe(false);
    });

    it('should reject negative loop value', () => {
      const result = PlayMessageSchema.safeParse({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        loop: -1,
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-integer loop value', () => {
      const result = PlayMessageSchema.safeParse({
        type: 'play',
        source: 'https://example.com/audio.mp3',
        loop: 3.5,
      });

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // SendDigitsMessage
  // =========================================================================

  describe('SendDigitsMessage', () => {
    it('should validate digits with all allowed characters', () => {
      const result = SendDigitsMessageSchema.safeParse({
        type: 'sendDigits',
        digits: '1234567890w*#',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('sendDigits');
        expect(result.data.digits).toBe('1234567890w*#');
      }
    });

    it('should validate digits with pauses', () => {
      const result = SendDigitsMessageSchema.safeParse({
        type: 'sendDigits',
        digits: '123w456w789',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid characters in digits', () => {
      const result = SendDigitsMessageSchema.safeParse({
        type: 'sendDigits',
        digits: '123abc',
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty digits string', () => {
      const result = SendDigitsMessageSchema.safeParse({
        type: 'sendDigits',
        digits: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject spaces in digits', () => {
      const result = SendDigitsMessageSchema.safeParse({
        type: 'sendDigits',
        digits: '123 456',
      });

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // SwitchLanguageMessage
  // =========================================================================

  describe('SwitchLanguageMessage', () => {
    it('should validate language message with both languages', () => {
      const result = SwitchLanguageMessageSchema.safeParse({
        type: 'language',
        ttsLanguage: 'es-ES',
        transcriptionLanguage: 'es-ES',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('language');
        expect(result.data.ttsLanguage).toBe('es-ES');
        expect(result.data.transcriptionLanguage).toBe('es-ES');
      }
    });

    it('should validate language message with only TTS language', () => {
      const result = SwitchLanguageMessageSchema.safeParse({
        type: 'language',
        ttsLanguage: 'fr-FR',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('language');
        expect(result.data.ttsLanguage).toBe('fr-FR');
      }
    });

    it('should validate language message with only transcription language', () => {
      const result = SwitchLanguageMessageSchema.safeParse({
        type: 'language',
        transcriptionLanguage: 'de-DE',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('language');
        expect(result.data.transcriptionLanguage).toBe('de-DE');
      }
    });

    it('should reject schema with no languages specified', () => {
      const result = SwitchLanguageMessageSchema.safeParse({
        type: 'language',
      });

      expect(result.success).toBe(false);
    });

    it('should accept schema with at least one language', () => {
      const result = SwitchLanguageMessageSchema.safeParse({
        type: 'language',
        ttsLanguage: 'es-ES',
      });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // EndMessage
  // =========================================================================

  describe('EndMessage', () => {
    it('should validate end message without handoff data', () => {
      const result = EndMessageSchema.safeParse({
        type: 'end',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('end');
        expect(result.data.handoffData).toBeUndefined();
      }
    });

    it('should validate end message with handoff data JSON string', () => {
      const handoffData = JSON.stringify({
        reasonCode: 'live-agent-handoff',
        issueType: 'billing',
        priority: 'high',
      });

      const result = EndMessageSchema.safeParse({
        type: 'end',
        handoffData,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('end');
        expect(result.data.handoffData).toBe(handoffData);
        // Verify handoffData parses back to the same structure — stronger
        // signal than just `expect(...).not.toThrow()`, which would pass
        // for any valid JSON regardless of contents.
        expect(JSON.parse(result.data.handoffData)).toEqual({
          reasonCode: 'live-agent-handoff',
          issueType: 'billing',
          priority: 'high',
        });
      }
    });

    it('should accept malformed JSON in handoffData string', () => {
      // Schema allows any string for handoffData - validation happens at CR callback
      const result = EndMessageSchema.safeParse({
        type: 'end',
        handoffData: 'not-json',
      });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // OutgoingMessage Union
  // =========================================================================

  describe('OutgoingMessage discriminated union', () => {
    it('should validate text message', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'text',
        token: 'Hello world',
        last: true,
      });

      expect(result.success).toBe(true);
    });

    it('should validate play message', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'play',
        source: 'https://example.com/audio.mp3',
      });

      expect(result.success).toBe(true);
    });

    it('should validate sendDigits message', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'sendDigits',
        digits: '123',
      });

      expect(result.success).toBe(true);
    });

    it('should validate language message', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'language',
        ttsLanguage: 'es-ES',
      });

      expect(result.success).toBe(true);
    });

    it('should validate end message', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'end',
      });

      expect(result.success).toBe(true);
    });

    it('should reject unknown message type', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'unknown',
        data: 'test',
      });

      expect(result.success).toBe(false);
    });

    it('should reject message missing required fields', () => {
      const result = OutgoingMessageSchema.safeParse({
        type: 'play',
        // Missing required 'source' field
      });

      expect(result.success).toBe(false);
    });

    it('should use discriminator for fast type checking', () => {
      const message = { type: 'sendDigits', digits: '123' };
      const result = OutgoingMessageSchema.safeParse(message);

      expect(result.success).toBe(true);
      if (result.success) {
        // Discriminator allows type narrowing
        if (result.data.type === 'sendDigits') {
          expect(result.data.digits).toBe('123');
        }
      }
    });
  });
});
