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
export declare class VoiceHandler extends EventEmitter {
    private config;
    constructor(config: VoiceConfig);
    /**
     * Check if voice transcription is enabled and properly configured
     */
    isEnabled(): boolean;
    /**
     * Transcribe audio buffer to text using OpenAI Whisper API
     * @param audioBuffer The audio file buffer (OGG format from Telegram)
     * @param fileId Unique identifier for the audio file
     * @returns Transcribed text
     */
    transcribe(audioBuffer: Buffer, fileId: string): Promise<string>;
}
//# sourceMappingURL=VoiceHandler.d.ts.map