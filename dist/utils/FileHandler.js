import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
/**
 * Handles file uploads from Telegram
 */
export class FileHandler extends EventEmitter {
    config;
    tempDir;
    tempFiles = new Set();
    constructor(config) {
        super();
        this.config = config;
        this.tempDir = path.join(os.tmpdir(), 'claude-telegram-uploads');
        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    /**
     * Check if file upload is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Validate file type and size
     */
    validateFile(fileName, mimeType, size) {
        // Check size
        const maxSizeBytes = this.config.maxFileSizeMB * 1024 * 1024;
        if (size > maxSizeBytes) {
            return { valid: false, reason: `File too large. Maximum size is ${this.config.maxFileSizeMB}MB` };
        }
        // Check extension
        const ext = path.extname(fileName).toLowerCase();
        if (ext && !this.config.allowedExtensions.includes(ext)) {
            return { valid: false, reason: `File extension "${ext}" is not allowed` };
        }
        // Check MIME type (if provided and meaningful)
        if (mimeType && mimeType !== 'application/octet-stream') {
            // Allow text/* and known types
            if (!mimeType.startsWith('text/') &&
                !mimeType.startsWith('image/') &&
                !this.config.supportedMimeTypes.includes(mimeType)) {
                return { valid: false, reason: `File type "${mimeType}" is not supported` };
            }
        }
        return { valid: true };
    }
    /**
     * Save file buffer to temporary location
     */
    async saveFile(buffer, fileName, mimeType, fileId) {
        this.emit('downloadStart', fileId);
        try {
            const ext = path.extname(fileName) || this.getExtensionFromMime(mimeType);
            const safeName = this.sanitizeFileName(fileName);
            const uniqueName = `${Date.now()}-${fileId.substring(0, 8)}${ext || ''}`;
            const localPath = path.join(this.tempDir, uniqueName);
            await fs.promises.writeFile(localPath, buffer);
            this.tempFiles.add(localPath);
            const info = {
                originalName: safeName,
                mimeType,
                size: buffer.length,
                extension: ext,
                localPath,
            };
            this.emit('downloadComplete', fileId, info);
            return info;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.emit('downloadError', fileId, err);
            throw err;
        }
    }
    /**
     * Read file contents as text (for code/text files)
     */
    async readFileAsText(localPath) {
        return fs.promises.readFile(localPath, 'utf-8');
    }
    /**
     * Get file path for Claude (images are passed as paths)
     */
    getFilePath(info) {
        return info.localPath;
    }
    /**
     * Check if file is an image
     */
    isImage(mimeType) {
        return mimeType.startsWith('image/');
    }
    /**
     * Check if file is a text/code file
     */
    isTextFile(mimeType, extension) {
        const textMimes = ['text/', 'application/json', 'application/xml', 'application/javascript'];
        const textExtensions = [
            '.txt', '.md', '.json', '.xml', '.yaml', '.yml',
            '.ts', '.js', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h',
            '.html', '.css', '.scss', '.sql', '.sh', '.bash',
        ];
        return textMimes.some(m => mimeType.startsWith(m)) ||
            textExtensions.includes(extension.toLowerCase());
    }
    /**
     * Delete a temporary file
     */
    async deleteFile(localPath) {
        try {
            if (this.tempFiles.has(localPath)) {
                await fs.promises.unlink(localPath);
                this.tempFiles.delete(localPath);
                this.emit('cleanup', localPath);
            }
        }
        catch {
            // Ignore errors during cleanup
        }
    }
    /**
     * Clean up all temporary files
     */
    async cleanupAll() {
        const deletePromises = Array.from(this.tempFiles).map(p => this.deleteFile(p));
        await Promise.all(deletePromises);
    }
    /**
     * Clean up old temporary files (older than specified hours)
     */
    async cleanupOldFiles(maxAgeHours = 24) {
        let cleaned = 0;
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
        const now = Date.now();
        try {
            const files = await fs.promises.readdir(this.tempDir);
            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (now - stats.mtimeMs > maxAgeMs) {
                        await fs.promises.unlink(filePath);
                        this.tempFiles.delete(filePath);
                        cleaned++;
                    }
                }
                catch {
                    // Ignore individual file errors
                }
            }
        }
        catch {
            // Ignore directory read errors
        }
        return cleaned;
    }
    sanitizeFileName(fileName) {
        // Remove path separators and null bytes
        return fileName.replace(/[/\\:\0]/g, '_').substring(0, 255);
    }
    getExtensionFromMime(mimeType) {
        const mimeToExt = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'application/json': '.json',
            'application/pdf': '.pdf',
            'text/plain': '.txt',
            'text/markdown': '.md',
            'text/csv': '.csv',
        };
        return mimeToExt[mimeType] || '';
    }
}
//# sourceMappingURL=FileHandler.js.map