import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileHandler } from '../../src/utils/FileHandler.js';
import type { FileUploadConfig } from '../../src/types/index.js';

const defaultConfig: FileUploadConfig = {
  enabled: true,
  maxFileSizeMB: 10,
  supportedMimeTypes: ['application/json', 'application/pdf', 'text/plain'],
  allowedExtensions: ['.txt', '.json', '.ts', '.js', '.py', '.md', '.pdf'],
};

describe('FileHandler', () => {
  let fileHandler: FileHandler;
  let tempDir: string;

  beforeEach(() => {
    fileHandler = new FileHandler(defaultConfig);
    tempDir = path.join(os.tmpdir(), 'claude-telegram-uploads');
  });

  afterEach(async () => {
    await fileHandler.cleanupAll();
  });

  describe('constructor', () => {
    it('should create temp directory if it does not exist', () => {
      expect(fs.existsSync(tempDir)).toBe(true);
    });

    it('should store config', () => {
      expect(fileHandler.isEnabled()).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(fileHandler.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledHandler = new FileHandler({ ...defaultConfig, enabled: false });
      expect(disabledHandler.isEnabled()).toBe(false);
    });
  });

  describe('validateFile', () => {
    it('should accept valid files', () => {
      const result = fileHandler.validateFile('test.txt', 'text/plain', 1024);
      expect(result.valid).toBe(true);
    });

    it('should reject files that are too large', () => {
      const tooBig = 11 * 1024 * 1024; // 11MB
      const result = fileHandler.validateFile('test.txt', 'text/plain', tooBig);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('too large');
    });

    it('should reject disallowed extensions', () => {
      const result = fileHandler.validateFile('virus.exe', 'application/octet-stream', 1024);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('should accept files with allowed extensions', () => {
      // Use octet-stream as mime type since application/typescript isn't in the supported list
      const result = fileHandler.validateFile('code.ts', 'application/octet-stream', 1024);
      expect(result.valid).toBe(true);
    });

    it('should accept text/* mime types', () => {
      const result = fileHandler.validateFile('doc.txt', 'text/html', 1024);
      expect(result.valid).toBe(true);
    });

    it('should accept image/* mime types', () => {
      const handlerWithImages = new FileHandler({
        ...defaultConfig,
        allowedExtensions: [...defaultConfig.allowedExtensions, '.png', '.jpg'],
      });
      const result = handlerWithImages.validateFile('photo.png', 'image/png', 1024);
      expect(result.valid).toBe(true);
    });

    it('should accept generic octet-stream (unknown type)', () => {
      const result = fileHandler.validateFile('data.json', 'application/octet-stream', 1024);
      expect(result.valid).toBe(true);
    });
  });

  describe('saveFile', () => {
    it('should save buffer to temp directory', async () => {
      const buffer = Buffer.from('test content');
      const info = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'test-file-id');

      expect(info.originalName).toBe('test.txt');
      expect(info.size).toBe(buffer.length);
      expect(fs.existsSync(info.localPath)).toBe(true);
    });

    it('should emit downloadStart and downloadComplete events', async () => {
      const startCallback = jest.fn();
      const completeCallback = jest.fn();

      fileHandler.on('downloadStart', startCallback);
      fileHandler.on('downloadComplete', completeCallback);

      const buffer = Buffer.from('test content');
      await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'test-file-id');

      expect(startCallback).toHaveBeenCalledWith('test-file-id');
      expect(completeCallback).toHaveBeenCalledWith('test-file-id', expect.any(Object));
    });

    it('should sanitize file names', async () => {
      const buffer = Buffer.from('test');
      const info = await fileHandler.saveFile(buffer, '../../../etc/passwd', 'text/plain', 'test-id');

      // The sanitizer replaces / and \ with _ but keeps ..
      // Most importantly, the actual saved path is in tempDir, not following the traversal
      expect(info.originalName).not.toContain('/');
      expect(info.originalName).not.toContain('\\');
      expect(info.localPath).toContain('claude-telegram-uploads');
    });

    it('should generate unique file names', async () => {
      const buffer = Buffer.from('test');
      const info1 = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'id1');
      const info2 = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'id2');

      expect(info1.localPath).not.toBe(info2.localPath);
    });
  });

  describe('readFileAsText', () => {
    it('should read file content as utf-8', async () => {
      const content = 'Hello World 你好世界';
      const buffer = Buffer.from(content, 'utf-8');
      const info = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'test-id');

      const readContent = await fileHandler.readFileAsText(info.localPath);
      expect(readContent).toBe(content);
    });
  });

  describe('isImage', () => {
    it('should return true for image mime types', () => {
      expect(fileHandler.isImage('image/png')).toBe(true);
      expect(fileHandler.isImage('image/jpeg')).toBe(true);
      expect(fileHandler.isImage('image/gif')).toBe(true);
      expect(fileHandler.isImage('image/webp')).toBe(true);
    });

    it('should return false for non-image mime types', () => {
      expect(fileHandler.isImage('text/plain')).toBe(false);
      expect(fileHandler.isImage('application/json')).toBe(false);
    });
  });

  describe('isTextFile', () => {
    it('should return true for text mime types', () => {
      expect(fileHandler.isTextFile('text/plain', '.txt')).toBe(true);
      expect(fileHandler.isTextFile('text/html', '.html')).toBe(true);
      expect(fileHandler.isTextFile('application/json', '.json')).toBe(true);
    });

    it('should return true for code file extensions', () => {
      expect(fileHandler.isTextFile('application/octet-stream', '.ts')).toBe(true);
      expect(fileHandler.isTextFile('application/octet-stream', '.py')).toBe(true);
      expect(fileHandler.isTextFile('application/octet-stream', '.js')).toBe(true);
      expect(fileHandler.isTextFile('application/octet-stream', '.go')).toBe(true);
    });

    it('should return false for binary files', () => {
      expect(fileHandler.isTextFile('application/octet-stream', '.exe')).toBe(false);
      expect(fileHandler.isTextFile('image/png', '.png')).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should delete saved files', async () => {
      const buffer = Buffer.from('test');
      const info = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'test-id');

      expect(fs.existsSync(info.localPath)).toBe(true);

      await fileHandler.deleteFile(info.localPath);

      expect(fs.existsSync(info.localPath)).toBe(false);
    });

    it('should emit cleanup event', async () => {
      const cleanupCallback = jest.fn();
      fileHandler.on('cleanup', cleanupCallback);

      const buffer = Buffer.from('test');
      const info = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'test-id');
      await fileHandler.deleteFile(info.localPath);

      expect(cleanupCallback).toHaveBeenCalledWith(info.localPath);
    });

    it('should ignore non-tracked files', async () => {
      const fakePath = path.join(tempDir, 'non-existent.txt');
      await fileHandler.deleteFile(fakePath); // Should not throw
    });
  });

  describe('cleanupAll', () => {
    it('should delete all tracked files', async () => {
      const buffer = Buffer.from('test');
      const info1 = await fileHandler.saveFile(buffer, 'test1.txt', 'text/plain', 'id1');
      const info2 = await fileHandler.saveFile(buffer, 'test2.txt', 'text/plain', 'id2');

      expect(fs.existsSync(info1.localPath)).toBe(true);
      expect(fs.existsSync(info2.localPath)).toBe(true);

      await fileHandler.cleanupAll();

      expect(fs.existsSync(info1.localPath)).toBe(false);
      expect(fs.existsSync(info2.localPath)).toBe(false);
    });
  });

  describe('getFilePath', () => {
    it('should return the local path', async () => {
      const buffer = Buffer.from('test');
      const info = await fileHandler.saveFile(buffer, 'test.txt', 'text/plain', 'test-id');

      expect(fileHandler.getFilePath(info)).toBe(info.localPath);
    });
  });
});
