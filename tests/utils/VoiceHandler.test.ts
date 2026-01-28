import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { VoiceHandler } from '../../src/utils/VoiceHandler.js';
import type { VoiceConfig } from '../../src/types/index.js';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const enabledConfig: VoiceConfig = {
  enabled: true,
  openaiApiKey: 'test-api-key-123',
};

const disabledConfig: VoiceConfig = {
  enabled: false,
};

describe('VoiceHandler', () => {
  let voiceHandler: VoiceHandler;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create handler with config', () => {
      voiceHandler = new VoiceHandler(enabledConfig);
      expect(voiceHandler).toBeInstanceOf(VoiceHandler);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled with API key', () => {
      voiceHandler = new VoiceHandler(enabledConfig);
      expect(voiceHandler.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      voiceHandler = new VoiceHandler(disabledConfig);
      expect(voiceHandler.isEnabled()).toBe(false);
    });

    it('should return false when enabled but no API key', () => {
      voiceHandler = new VoiceHandler({ enabled: true });
      expect(voiceHandler.isEnabled()).toBe(false);
    });

    it('should return false when API key is empty string', () => {
      voiceHandler = new VoiceHandler({ enabled: true, openaiApiKey: '' });
      expect(voiceHandler.isEnabled()).toBe(false);
    });
  });

  describe('transcribe', () => {
    beforeEach(() => {
      voiceHandler = new VoiceHandler(enabledConfig);
    });

    it('should throw error when not enabled', async () => {
      const disabledHandler = new VoiceHandler(disabledConfig);
      const buffer = Buffer.from('test audio');

      await expect(disabledHandler.transcribe(buffer, 'file-id'))
        .rejects.toThrow('not enabled');
    });

    it('should call OpenAI API with correct parameters', async () => {
      const transcribedText = 'Hello, this is a test transcription.';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(transcribedText),
      } as Response);

      const buffer = Buffer.from('test audio data');
      const result = await voiceHandler.transcribe(buffer, 'test-file-id');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key-123',
          },
        })
      );

      expect(result).toBe(transcribedText);
    });

    it('should emit transcriptionStart and transcriptionComplete events', async () => {
      const startCallback = jest.fn();
      const completeCallback = jest.fn();

      voiceHandler.on('transcriptionStart', startCallback);
      voiceHandler.on('transcriptionComplete', completeCallback);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('transcribed text'),
      } as Response);

      const buffer = Buffer.from('test audio');
      await voiceHandler.transcribe(buffer, 'test-file-id');

      expect(startCallback).toHaveBeenCalledWith('test-file-id');
      expect(completeCallback).toHaveBeenCalledWith('test-file-id', 'transcribed text');
    });

    it('should emit transcriptionError on API error', async () => {
      const errorCallback = jest.fn();
      voiceHandler.on('transcriptionError', errorCallback);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response);

      const buffer = Buffer.from('test audio');

      await expect(voiceHandler.transcribe(buffer, 'test-file-id'))
        .rejects.toThrow('OpenAI API error');

      expect(errorCallback).toHaveBeenCalledWith('test-file-id', expect.any(Error));
    });

    it('should trim whitespace from transcription result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('  transcribed text with spaces  \n'),
      } as Response);

      const buffer = Buffer.from('test audio');
      const result = await voiceHandler.transcribe(buffer, 'test-file-id');

      expect(result).toBe('transcribed text with spaces');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const buffer = Buffer.from('test audio');

      await expect(voiceHandler.transcribe(buffer, 'test-file-id'))
        .rejects.toThrow('Network error');
    });
  });

  describe('event emission', () => {
    it('should be an EventEmitter', () => {
      voiceHandler = new VoiceHandler(enabledConfig);
      expect(typeof voiceHandler.on).toBe('function');
      expect(typeof voiceHandler.emit).toBe('function');
    });

    it('should allow multiple event listeners', () => {
      voiceHandler = new VoiceHandler(enabledConfig);

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      voiceHandler.on('transcriptionStart', listener1);
      voiceHandler.on('transcriptionStart', listener2);

      voiceHandler.emit('transcriptionStart', 'test-id');

      expect(listener1).toHaveBeenCalledWith('test-id');
      expect(listener2).toHaveBeenCalledWith('test-id');
    });
  });
});
