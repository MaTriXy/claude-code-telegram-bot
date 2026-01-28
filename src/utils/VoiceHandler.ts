import { EventEmitter } from 'events';
import type { VoiceConfig } from '../types/index.js';

export interface VoiceHandlerEvents {
  transcriptionStart: (fileId: string) => void;
  transcriptionComplete: (fileId: string, text: string) => void;
  transcriptionError: (fileId: string, error: Error) => void;
}

/**
 * Handles voice message transcription using OpenAI Whisper API
 */
export class VoiceHandler extends EventEmitter {
  private config: VoiceConfig;

  constructor(config: VoiceConfig) {
    super();
    this.config = config;
  }

  /**
   * Check if voice transcription is enabled and properly configured
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.openaiApiKey;
  }

  /**
   * Transcribe audio buffer to text using OpenAI Whisper API
   * @param audioBuffer The audio file buffer (OGG format from Telegram)
   * @param fileId Unique identifier for the audio file
   * @returns Transcribed text
   */
  async transcribe(audioBuffer: Buffer, fileId: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('Voice transcription is not enabled or API key is missing');
    }

    this.emit('transcriptionStart', fileId);

    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const transcribedText = await response.text();
      this.emit('transcriptionComplete', fileId, transcribedText);
      return transcribedText.trim();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('transcriptionError', fileId, err);
      throw err;
    }
  }
}
