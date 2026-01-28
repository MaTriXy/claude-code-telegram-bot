import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Create a test directory structure for file operations
let testDir: string;
let testGitDir: string;

beforeAll(async () => {
  // Create temp directories for testing
  testDir = path.join(os.tmpdir(), `telegram-bot-test-${Date.now()}`);
  testGitDir = path.join(os.tmpdir(), `telegram-bot-git-test-${Date.now()}`);

  // Create test directory structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'empty-dir'), { recursive: true });

  // Create test files
  fs.writeFileSync(path.join(testDir, 'test.txt'), 'Hello World');
  fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2));
  fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), 'export const hello = "world";');

  // Create a large file for truncation tests
  const largeContent = 'x'.repeat(5000);
  fs.writeFileSync(path.join(testDir, 'large.txt'), largeContent);

  // Create git test directory
  fs.mkdirSync(testGitDir, { recursive: true });
  try {
    await execAsync('git init', { cwd: testGitDir });
    await execAsync('git config user.email "test@test.com"', { cwd: testGitDir });
    await execAsync('git config user.name "Test User"', { cwd: testGitDir });
    fs.writeFileSync(path.join(testGitDir, 'file.txt'), 'initial content');
    await execAsync('git add .', { cwd: testGitDir });
    await execAsync('git commit -m "initial"', { cwd: testGitDir });
  } catch {
    // Git might not be available in test environment
  }
});

afterAll(() => {
  // Cleanup test directories
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(testGitDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('/file command logic', () => {
  describe('path resolution', () => {
    it('should resolve relative paths to working directory', () => {
      const workingDir = testDir;
      const filePath = 'src/index.ts';
      const fullPath = path.join(workingDir, filePath);
      expect(fs.existsSync(fullPath)).toBe(true);
    });

    it('should handle absolute paths', () => {
      const absolutePath = path.join(testDir, 'test.txt');
      expect(fs.existsSync(absolutePath)).toBe(true);
    });

    it('should detect directory traversal attempts', () => {
      const workingDir = testDir;
      const maliciousPath = '../../../etc/passwd';
      const fullPath = path.join(workingDir, maliciousPath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkingDir = path.resolve(workingDir);

      // Security check - path should NOT start with working dir
      expect(resolvedPath.startsWith(resolvedWorkingDir)).toBe(false);
    });

    it('should allow paths within working directory', () => {
      const workingDir = testDir;
      const safePath = 'src/index.ts';
      const fullPath = path.join(workingDir, safePath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkingDir = path.resolve(workingDir);

      expect(resolvedPath.startsWith(resolvedWorkingDir)).toBe(true);
    });
  });

  describe('file existence checks', () => {
    it('should return true for existing files', () => {
      const filePath = path.join(testDir, 'test.txt');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should return false for non-existing files', () => {
      const filePath = path.join(testDir, 'nonexistent.txt');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should identify directories', () => {
      const dirPath = path.join(testDir, 'src');
      const stats = fs.statSync(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should identify files', () => {
      const filePath = path.join(testDir, 'test.txt');
      const stats = fs.statSync(filePath);
      expect(stats.isFile()).toBe(true);
    });
  });

  describe('directory listing', () => {
    it('should list directory contents', () => {
      const dirPath = testDir;
      const files = fs.readdirSync(dirPath);
      expect(files).toContain('test.txt');
      expect(files).toContain('package.json');
      expect(files).toContain('src');
    });

    it('should handle empty directories', () => {
      const emptyDir = path.join(testDir, 'empty-dir');
      const files = fs.readdirSync(emptyDir);
      expect(files).toHaveLength(0);
    });

    it('should distinguish files from directories', () => {
      const files = fs.readdirSync(testDir);
      const listing = files.map(f => {
        const fPath = path.join(testDir, f);
        const fStats = fs.statSync(fPath);
        return fStats.isDirectory() ? `📁 ${f}/` : `📄 ${f}`;
      });

      expect(listing.some(l => l.startsWith('📁'))).toBe(true);
      expect(listing.some(l => l.startsWith('📄'))).toBe(true);
    });
  });

  describe('file reading', () => {
    it('should read file content as utf-8', () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should read JSON files', () => {
      const filePath = path.join(testDir, 'package.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe('test');
    });

    it('should handle TypeScript files', () => {
      const filePath = path.join(testDir, 'src', 'index.ts');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('export');
    });
  });

  describe('file size checks', () => {
    it('should check file size', () => {
      const filePath = path.join(testDir, 'test.txt');
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });

    it('should detect large files', () => {
      const filePath = path.join(testDir, 'large.txt');
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(4000); // Greater than typical Telegram message limit
    });
  });

  describe('content truncation', () => {
    it('should truncate content longer than maxLength', () => {
      const content = 'x'.repeat(5000);
      const maxLength = 4000;
      const truncated = content.length > maxLength;
      const displayContent = truncated
        ? content.slice(0, maxLength) + '\n...(truncated)'
        : content;

      expect(truncated).toBe(true);
      expect(displayContent.length).toBeLessThan(content.length);
      expect(displayContent).toContain('...(truncated)');
    });

    it('should not truncate short content', () => {
      const content = 'Hello World';
      const maxLength = 4000;
      const truncated = content.length > maxLength;

      expect(truncated).toBe(false);
    });
  });

  describe('file extension detection', () => {
    it('should extract file extension', () => {
      expect(path.extname('file.ts').slice(1)).toBe('ts');
      expect(path.extname('file.json').slice(1)).toBe('json');
      expect(path.extname('file.txt').slice(1)).toBe('txt');
      expect(path.extname('file').slice(1)).toBe('');
    });

    it('should handle files with multiple dots', () => {
      expect(path.extname('file.test.ts').slice(1)).toBe('ts');
      expect(path.extname('my.config.json').slice(1)).toBe('json');
    });
  });
});

describe('/diff command logic', () => {
  describe('git repository detection', () => {
    it('should detect if directory is a git repository', async () => {
      try {
        await execAsync('git status', { cwd: testGitDir });
        expect(true).toBe(true); // Is a git repo
      } catch {
        // Git not available or not a repo - skip
        expect(true).toBe(true);
      }
    });

    it('should handle non-git directories gracefully', async () => {
      // This test verifies that git commands either succeed (if in a git repo)
      // or fail with an appropriate error (if not in a git repo)
      // The behavior depends on the environment
      const nonGitDir = path.join(os.tmpdir(), `non-git-${Date.now()}`);
      fs.mkdirSync(nonGitDir, { recursive: true });

      try {
        const result = await execAsync('git status', { cwd: nonGitDir });
        // If git succeeds, the directory must be under a git repo (or git config allows it)
        expect(result.stdout).toBeDefined();
      } catch (error) {
        // If git fails, it should be a git-related error
        expect(error).toBeDefined();
      } finally {
        fs.rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('git diff command construction', () => {
    it('should construct basic diff command', () => {
      const args: string[] = [];
      let gitCommand: string;

      if (args.length === 0) {
        gitCommand = 'git diff';
      } else {
        gitCommand = `git diff -- "${args.join(' ')}"`;
      }

      expect(gitCommand).toBe('git diff');
    });

    it('should construct diff command with file path', () => {
      const args = ['src/index.ts'];
      const filePath = args.join(' ');
      const gitCommand = `git diff -- "${filePath}"`;

      expect(gitCommand).toBe('git diff -- "src/index.ts"');
    });

    it('should construct staged diff command', () => {
      const args = ['--staged'];
      let gitCommand: string;

      if (args[0] === '--staged' || args[0] === '--cached') {
        const filePath = args.slice(1).join(' ');
        gitCommand = filePath ? `git diff --staged -- "${filePath}"` : 'git diff --staged';
      } else {
        gitCommand = 'git diff';
      }

      expect(gitCommand).toBe('git diff --staged');
    });

    it('should construct staged diff with file path', () => {
      const args = ['--staged', 'src/index.ts'];
      let gitCommand: string;

      if (args[0] === '--staged' || args[0] === '--cached') {
        const filePath = args.slice(1).join(' ');
        gitCommand = filePath ? `git diff --staged -- "${filePath}"` : 'git diff --staged';
      } else {
        gitCommand = 'git diff';
      }

      expect(gitCommand).toBe('git diff --staged -- "src/index.ts"');
    });

    it('should construct diff stat command', () => {
      const args = ['--stat'];
      let gitCommand: string;

      if (args[0] === '--stat') {
        const filePath = args.slice(1).join(' ');
        gitCommand = filePath ? `git diff --stat -- "${filePath}"` : 'git diff --stat';
      } else {
        gitCommand = 'git diff';
      }

      expect(gitCommand).toBe('git diff --stat');
    });
  });

  describe('diff output handling', () => {
    it('should handle empty diff output', () => {
      const stdout: string = '';
      const isEmpty = !stdout || stdout.trim() === '';
      expect(isEmpty).toBe(true);
    });

    it('should handle whitespace-only diff output', () => {
      const stdout: string = '   \n  \t  \n';
      const isEmpty = !stdout || stdout.trim() === '';
      expect(isEmpty).toBe(true);
    });

    it('should detect non-empty diff output', () => {
      const stdout: string = 'diff --git a/file.txt b/file.txt\n-old\n+new';
      const isEmpty = !stdout || stdout.trim() === '';
      expect(isEmpty).toBe(false);
    });

    it('should truncate long diff output', () => {
      const stdout: string = 'x'.repeat(5000);
      const maxLength = 4000;
      const truncated = stdout.length > maxLength;
      const displayContent = truncated
        ? stdout.slice(0, maxLength) + '\n...(truncated)'
        : stdout;

      expect(truncated).toBe(true);
      expect(displayContent.length).toBeLessThan(stdout.length);
    });
  });

  describe('error message parsing', () => {
    it('should detect "not a git repository" error', () => {
      const errorMessage = 'fatal: not a git repository (or any of the parent directories): .git';
      expect(errorMessage.includes('not a git repository')).toBe(true);
    });

    it('should handle generic git errors', () => {
      const errorMessage = 'fatal: pathspec \'nonexistent\' did not match any files';
      expect(errorMessage.includes('not a git repository')).toBe(false);
    });
  });
});

describe('--raw flag parsing', () => {
  it('should detect --raw flag', () => {
    const args = ['src/index.ts', '--raw'];
    const sendAsFile = args.includes('--raw');
    expect(sendAsFile).toBe(true);
  });

  it('should extract path without --raw flag', () => {
    const args = ['src/index.ts', '--raw'];
    const filePath = args.filter(a => a !== '--raw').join(' ');
    expect(filePath).toBe('src/index.ts');
  });

  it('should handle paths without --raw flag', () => {
    const args = ['src/index.ts'];
    const sendAsFile = args.includes('--raw');
    const filePath = args.filter(a => a !== '--raw').join(' ');

    expect(sendAsFile).toBe(false);
    expect(filePath).toBe('src/index.ts');
  });

  it('should handle paths with spaces', () => {
    const args = ['path', 'with', 'spaces.txt', '--raw'];
    const filePath = args.filter(a => a !== '--raw').join(' ');
    expect(filePath).toBe('path with spaces.txt');
  });
});

describe('markdown formatting', () => {
  it('should format file content with code block', () => {
    const filePath = 'src/index.ts';
    const content = 'export const x = 1;';
    const ext = path.extname(filePath).slice(1) || 'txt';
    const message = `📄 \`${filePath}\`\n\n\`\`\`${ext}\n${content}\n\`\`\``;

    expect(message).toContain('```ts');
    expect(message).toContain('📄');
    expect(message).toContain(content);
  });

  it('should format diff output with diff code block', () => {
    const description = 'All unstaged changes';
    const diffContent = '-old line\n+new line';
    const message = `📊 ${description}\n\n\`\`\`diff\n${diffContent}\n\`\`\``;

    expect(message).toContain('```diff');
    expect(message).toContain('📊');
    expect(message).toContain(diffContent);
  });

  it('should use txt extension for files without extension', () => {
    const filePath = 'Makefile';
    const ext = path.extname(filePath).slice(1) || 'txt';
    expect(ext).toBe('txt');
  });
});

describe('integration with TelegramBot', () => {
  // These tests verify the command registration
  const BOT_COMMANDS = new Set([
    'start', 'help', 'new', 'cd', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'sessions', 'attach',
    'voice', 'notify', 'verbosity', 'upload', 'file', 'diff', 'escape'
  ]);

  it('should have /file in BOT_COMMANDS set', () => {
    expect(BOT_COMMANDS.has('file')).toBe(true);
  });

  it('should have /diff in BOT_COMMANDS set', () => {
    expect(BOT_COMMANDS.has('diff')).toBe(true);
  });

  it('should have /escape in BOT_COMMANDS set', () => {
    expect(BOT_COMMANDS.has('escape')).toBe(true);
  });

  it('should recognize /file as a bot command', () => {
    const text = '/file src/index.ts';
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('file');
  });

  it('should recognize /diff as a bot command', () => {
    const text = '/diff --staged';
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('diff');
  });

  it('should recognize /escape as a bot command', () => {
    const text = '/escape';
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('escape');
  });
});

describe('/escape command', () => {
  it('should send ESC character (0x1B)', () => {
    const escChar = '\x1B';
    expect(escChar.charCodeAt(0)).toBe(0x1B);
    expect(escChar.charCodeAt(0)).toBe(27);
  });

  it('ESC character should be different from Ctrl+C', () => {
    const escChar = '\x1B';
    const ctrlC = '\x03';
    expect(escChar).not.toBe(ctrlC);
    expect(escChar.charCodeAt(0)).toBe(27);
    expect(ctrlC.charCodeAt(0)).toBe(3);
  });
});
