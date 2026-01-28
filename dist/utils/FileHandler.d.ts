import { EventEmitter } from 'events';
import type { FileUploadConfig } from '../types/index.js';
export interface FileInfo {
    originalName: string;
    mimeType: string;
    size: number;
    extension: string;
    localPath: string;
}
export interface FileHandlerEvents {
    downloadStart: (fileId: string) => void;
    downloadComplete: (fileId: string, info: FileInfo) => void;
    downloadError: (fileId: string, error: Error) => void;
    cleanup: (localPath: string) => void;
}
/**
 * Handles file uploads from Telegram
 */
export declare class FileHandler extends EventEmitter {
    private config;
    private tempDir;
    private tempFiles;
    constructor(config: FileUploadConfig);
    /**
     * Check if file upload is enabled
     */
    isEnabled(): boolean;
    /**
     * Validate file type and size
     */
    validateFile(fileName: string, mimeType: string, size: number): {
        valid: boolean;
        reason?: string;
    };
    /**
     * Save file buffer to temporary location
     */
    saveFile(buffer: Buffer, fileName: string, mimeType: string, fileId: string): Promise<FileInfo>;
    /**
     * Read file contents as text (for code/text files)
     */
    readFileAsText(localPath: string): Promise<string>;
    /**
     * Get file path for Claude (images are passed as paths)
     */
    getFilePath(info: FileInfo): string;
    /**
     * Check if file is an image
     */
    isImage(mimeType: string): boolean;
    /**
     * Check if file is a text/code file
     */
    isTextFile(mimeType: string, extension: string): boolean;
    /**
     * Delete a temporary file
     */
    deleteFile(localPath: string): Promise<void>;
    /**
     * Clean up all temporary files
     */
    cleanupAll(): Promise<void>;
    /**
     * Clean up old temporary files (older than specified hours)
     */
    cleanupOldFiles(maxAgeHours?: number): Promise<number>;
    private sanitizeFileName;
    private getExtensionFromMime;
}
//# sourceMappingURL=FileHandler.d.ts.map