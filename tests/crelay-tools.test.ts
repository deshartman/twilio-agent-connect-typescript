import { describe, it, expect } from 'vitest';
import {
  playMediaTool,
  sendDigitsTool,
  switchLanguageTool,
  endCallTool,
  setSilenceDetectionTool,
  setListenModeTool,
} from '@twilio/tac-conversationrelay';

describe('ConversationRelay Tools', () => {
  // =========================================================================
  // Protocol Tools (Return outgoingMessage)
  // =========================================================================

  describe('playMediaTool', () => {
    it('should return success with outgoing play message', () => {
      const result = playMediaTool.implementation({
        source: 'https://example.com/audio.mp3',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Playing media');
      expect(result.message).toContain('https://example.com/audio.mp3');
      expect(result.outgoingMessage).toBeDefined();
      expect(result.outgoingMessage.type).toBe('play');
      expect(result.outgoingMessage.source).toBe('https://example.com/audio.mp3');
    });

    it('should include loop option in outgoing message', () => {
      const result = playMediaTool.implementation({
        source: 'https://example.com/audio.mp3',
        loop: 3,
      });

      expect(result.success).toBe(true);
      expect(result.outgoingMessage.loop).toBe(3);
    });

    it('should include interruptible option in outgoing message', () => {
      const result = playMediaTool.implementation({
        source: 'https://example.com/audio.mp3',
        interruptible: true,
      });

      expect(result.success).toBe(true);
      expect(result.outgoingMessage.interruptible).toBe(true);
    });

    it('should include preemptible option in outgoing message', () => {
      const result = playMediaTool.implementation({
        source: 'https://example.com/audio.mp3',
        preemptible: false,
      });

      expect(result.success).toBe(true);
      expect(result.outgoingMessage.preemptible).toBe(false);
    });

    it('should include all options when provided', () => {
      const result = playMediaTool.implementation({
        source: 'https://example.com/hold-music.mp3',
        loop: 5,
        interruptible: true,
        preemptible: true,
      });

      expect(result.success).toBe(true);
      expect(result.outgoingMessage).toEqual({
        type: 'play',
        source: 'https://example.com/hold-music.mp3',
        loop: 5,
        interruptible: true,
        preemptible: true,
      });
    });

    it('should have correct tool metadata', () => {
      expect(playMediaTool.name).toBe('play_media');
      expect(playMediaTool.description).toBe('Play audio file from URL to caller');
      expect(playMediaTool.parameters.type).toBe('object');
      expect(playMediaTool.parameters.required).toContain('source');
    });
  });

  describe('sendDigitsTool', () => {
    it('should return success with outgoing sendDigits message', () => {
      const result = sendDigitsTool.implementation({
        digits: '1234',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Sending DTMF');
      expect(result.message).toContain('1234');
      expect(result.outgoingMessage).toBeDefined();
      expect(result.outgoingMessage.type).toBe('sendDigits');
      expect(result.outgoingMessage.digits).toBe('1234');
    });

    it('should handle digits with pauses', () => {
      const result = sendDigitsTool.implementation({
        digits: '123w456w789',
      });

      expect(result.success).toBe(true);
      expect(result.outgoingMessage.digits).toBe('123w456w789');
    });

    it('should handle special characters', () => {
      const result = sendDigitsTool.implementation({
        digits: '*#0123456789*#',
      });

      expect(result.success).toBe(true);
      expect(result.outgoingMessage.digits).toBe('*#0123456789*#');
    });

    it('should have correct tool metadata', () => {
      expect(sendDigitsTool.name).toBe('send_dtmf');
      expect(sendDigitsTool.description).toBe('Send DTMF digits to caller');
      expect(sendDigitsTool.parameters.type).toBe('object');
      expect(sendDigitsTool.parameters.required).toContain('digits');
    });
  });

  describe('switchLanguageTool', () => {
    it('should return success with both languages specified', () => {
      const result = switchLanguageTool.implementation({
        ttsLanguage: 'es-ES',
        transcriptionLanguage: 'es-ES',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Switching language');
      expect(result.message).toContain('TTS=es-ES');
      expect(result.message).toContain('STT=es-ES');
      expect(result.outgoingMessage).toBeDefined();
      expect(result.outgoingMessage!.type).toBe('language');
      expect(result.outgoingMessage!.ttsLanguage).toBe('es-ES');
      expect(result.outgoingMessage!.transcriptionLanguage).toBe('es-ES');
    });

    it('should return success with only TTS language', () => {
      const result = switchLanguageTool.implementation({
        ttsLanguage: 'fr-FR',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('TTS=fr-FR');
      expect(result.message).toContain('STT=unchanged');
      expect(result.outgoingMessage!.ttsLanguage).toBe('fr-FR');
      expect(result.outgoingMessage!.transcriptionLanguage).toBeUndefined();
    });

    it('should return success with only transcription language', () => {
      const result = switchLanguageTool.implementation({
        transcriptionLanguage: 'de-DE',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('TTS=unchanged');
      expect(result.message).toContain('STT=de-DE');
      expect(result.outgoingMessage!.ttsLanguage).toBeUndefined();
      expect(result.outgoingMessage!.transcriptionLanguage).toBe('de-DE');
    });

    it('should return failure when no languages specified', () => {
      const result = switchLanguageTool.implementation({});

      expect(result.success).toBe(false);
      expect(result.message).toContain('At least one language must be specified');
      expect(result.outgoingMessage).toBeUndefined();
    });

    it('should have correct tool metadata', () => {
      expect(switchLanguageTool.name).toBe('switch_language');
      expect(switchLanguageTool.description).toBe('Change TTS or transcription language during call');
      expect(switchLanguageTool.parameters.type).toBe('object');
    });
  });

  describe('endCallTool', () => {
    it('should return success with reason only', () => {
      const result = endCallTool.implementation({
        reason: 'User requested to end call',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Ending call');
      expect(result.message).toContain('User requested to end call');
      expect(result.outgoingMessage).toBeDefined();
      expect(result.outgoingMessage.type).toBe('end');
      expect(result.outgoingMessage.handoffData).toBeUndefined();
    });

    it('should return success with handoff data', () => {
      const handoffData = {
        reasonCode: 'live-agent-handoff',
        issueType: 'billing',
        priority: 'high',
      };

      const result = endCallTool.implementation({
        reason: 'Escalating to human agent',
        handoffData,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Escalating to human agent');
      expect(result.outgoingMessage.handoffData).toBeDefined();

      // Verify handoff data is JSON-stringified
      const parsed = JSON.parse(result.outgoingMessage.handoffData!);
      expect(parsed).toEqual(handoffData);
    });

    it('should handle complex handoff data structures', () => {
      const handoffData = {
        reason: 'complex-issue',
        metadata: {
          nested: { value: 123 },
          array: [1, 2, 3],
        },
        timestamp: new Date().toISOString(),
      };

      const result = endCallTool.implementation({
        reason: 'Complex escalation',
        handoffData,
      });

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.outgoingMessage.handoffData!);
      expect(parsed).toEqual(handoffData);
    });

    it('should handle empty handoff data object', () => {
      const result = endCallTool.implementation({
        reason: 'Test end',
        handoffData: {},
      });

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.outgoingMessage.handoffData!);
      expect(parsed).toEqual({});
    });

    it('should have correct tool metadata', () => {
      expect(endCallTool.name).toBe('end_call');
      expect(endCallTool.description).toBe('End the call with optional handoff data');
      expect(endCallTool.parameters.type).toBe('object');
      expect(endCallTool.parameters.required).toContain('reason');
    });
  });

  // =========================================================================
  // State Management Tools (Return flags)
  // =========================================================================

  describe('setSilenceDetectionTool', () => {
    it('should return success with enabled flag true', () => {
      const result = setSilenceDetectionTool.implementation({
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('enabled');
      expect(result.message).toContain('will monitor for silence');
      expect(result.silenceDetectionEnabled).toBe(true);
    });

    it('should return success with enabled flag false', () => {
      const result = setSilenceDetectionTool.implementation({
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('disabled');
      expect(result.message).toContain('no silence monitoring');
      expect(result.silenceDetectionEnabled).toBe(false);
    });

    it('should not return outgoingMessage property', () => {
      const result = setSilenceDetectionTool.implementation({
        enabled: true,
      });

      expect('outgoingMessage' in result).toBe(false);
    });

    it('should have correct tool metadata', () => {
      expect(setSilenceDetectionTool.name).toBe('set_silence_detection');
      expect(setSilenceDetectionTool.description).toBe(
        'Enable or disable silence monitoring during the call'
      );
      expect(setSilenceDetectionTool.parameters.type).toBe('object');
      expect(setSilenceDetectionTool.parameters.required).toContain('enabled');
    });
  });

  describe('setListenModeTool', () => {
    it('should return success with listen mode enabled', () => {
      const result = setListenModeTool.implementation({
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('enabled');
      expect(result.message).toContain('listen-only mode');
      expect(result.message).toContain('text responses suppressed');
      expect(result.listenMode).toBe(true);
    });

    it('should return success with listen mode disabled', () => {
      const result = setListenModeTool.implementation({
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('disabled');
      expect(result.message).toContain('normal mode');
      expect(result.message).toContain('text responses enabled');
      expect(result.listenMode).toBe(false);
    });

    it('should not return outgoingMessage property', () => {
      const result = setListenModeTool.implementation({
        enabled: true,
      });

      expect('outgoingMessage' in result).toBe(false);
    });

    it('should have correct tool metadata', () => {
      expect(setListenModeTool.name).toBe('set_listen_mode');
      expect(setListenModeTool.description).toBe(
        'Enable or disable text responses while keeping tool execution active'
      );
      expect(setListenModeTool.parameters.type).toBe('object');
      expect(setListenModeTool.parameters.required).toContain('enabled');
    });
  });

  // =========================================================================
  // Tool Pattern Verification
  // =========================================================================

  describe('tool pattern verification', () => {
    it('protocol tools should all return outgoingMessage', () => {
      const playResult = playMediaTool.implementation({
        source: 'https://example.com/audio.mp3',
      });
      const digitsResult = sendDigitsTool.implementation({ digits: '123' });
      const langResult = switchLanguageTool.implementation({ ttsLanguage: 'es-ES' });
      const endResult = endCallTool.implementation({ reason: 'test' });

      expect(playResult.outgoingMessage).toBeDefined();
      expect(digitsResult.outgoingMessage).toBeDefined();
      expect(langResult.outgoingMessage).toBeDefined();
      expect(endResult.outgoingMessage).toBeDefined();
    });

    it('state management tools should return control flags', () => {
      const silenceResult = setSilenceDetectionTool.implementation({ enabled: true });
      const listenResult = setListenModeTool.implementation({ enabled: true });

      expect(silenceResult.silenceDetectionEnabled).toBeDefined();
      expect(listenResult.listenMode).toBeDefined();
      expect('outgoingMessage' in silenceResult).toBe(false);
      expect('outgoingMessage' in listenResult).toBe(false);
    });

    it('all tools should return success and message fields', () => {
      const tools = [
        playMediaTool.implementation({ source: 'https://example.com/audio.mp3' }),
        sendDigitsTool.implementation({ digits: '123' }),
        switchLanguageTool.implementation({ ttsLanguage: 'es-ES' }),
        endCallTool.implementation({ reason: 'test' }),
        setSilenceDetectionTool.implementation({ enabled: true }),
        setListenModeTool.implementation({ enabled: true }),
      ];

      for (const result of tools) {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('message');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.message).toBe('string');
      }
    });
  });
});
