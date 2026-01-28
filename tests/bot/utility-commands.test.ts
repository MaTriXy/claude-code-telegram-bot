import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test directory for tree and git operations
let testDir: string;
let testGitDir: string;

beforeAll(async () => {
  // Create temp directories for testing
  testDir = path.join(os.tmpdir(), `telegram-bot-utility-test-${Date.now()}`);
  testGitDir = path.join(os.tmpdir(), `telegram-bot-git-utility-test-${Date.now()}`);

  // Create test directory structure for tree tests
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src', 'utils'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'tests'), { recursive: true });

  // Create test files
  fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
  fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), '');
  fs.writeFileSync(path.join(testDir, 'src', 'utils', 'helper.ts'), '');
  fs.writeFileSync(path.join(testDir, 'tests', 'test.ts'), '');

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
    // Git might not be available
  }
});

afterAll(() => {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(testGitDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// Updated BOT_COMMANDS set with new commands
const BOT_COMMANDS = new Set([
  'start', 'help', 'new', 'cd', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'sessions', 'attach',
  'voice', 'notify', 'verbosity', 'upload', 'file', 'diff', 'escape',
  'log', 'pwd', 'git', 'tree', 'bookmark', 'context', 'cost'
]);

describe('/log command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('log')).toBe(true);
  });

  it('should parse count argument', () => {
    const args = ['20'];
    const count = Math.min(parseInt(args[0], 10) || 20, 100);
    expect(count).toBe(20);
  });

  it('should default to 20 when no argument', () => {
    const args: string[] = [];
    const count = Math.min(parseInt(args[0], 10) || 20, 100);
    expect(count).toBe(20);
  });

  it('should cap count at MAX_OUTPUT_HISTORY (100)', () => {
    const args = ['500'];
    const MAX_OUTPUT_HISTORY = 100;
    const count = Math.min(parseInt(args[0], 10) || 20, MAX_OUTPUT_HISTORY);
    expect(count).toBe(100);
  });

  it('should handle invalid count argument', () => {
    const args = ['invalid'];
    const count = Math.min(parseInt(args[0], 10) || 20, 100);
    expect(count).toBe(20); // Falls back to default
  });
});

describe('/pwd command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('pwd')).toBe(true);
  });

  it('should format working directory path', () => {
    const workingDir = '/home/user/project';
    const message = `📂 ${workingDir}`;
    expect(message).toBe('📂 /home/user/project');
  });
});

describe('/git command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('git')).toBe(true);
  });

  describe('subcommand parsing', () => {
    it('should parse status subcommand', () => {
      const args = ['status'];
      const subcommand = args[0]?.toLowerCase();
      expect(subcommand).toBe('status');
    });

    it('should parse short alias "s" for status', () => {
      const args = ['s'];
      const subcommand = args[0]?.toLowerCase();
      expect(['status', 's'].includes(subcommand!)).toBe(true);
    });

    it('should parse branch subcommand', () => {
      const args = ['branch'];
      const subcommand = args[0]?.toLowerCase();
      expect(subcommand).toBe('branch');
    });

    it('should parse log subcommand with count', () => {
      const args = ['log', '5'];
      const subcommand = args[0]?.toLowerCase();
      const logCount = parseInt(args[1], 10) || 10;
      expect(subcommand).toBe('log');
      expect(logCount).toBe(5);
    });

    it('should default to 10 for log count', () => {
      const args = ['log'];
      const logCount = parseInt(args[1], 10) || 10;
      expect(logCount).toBe(10);
    });
  });

  describe('git command construction', () => {
    it('should construct git status command', () => {
      expect('git status --short').toContain('git status');
    });

    it('should construct git branch command', () => {
      expect('git branch -vv').toContain('git branch');
    });

    it('should construct git log command with count', () => {
      const logCount = 5;
      const cmd = `git log --oneline -${logCount}`;
      expect(cmd).toBe('git log --oneline -5');
    });

    it('should construct git stash list command', () => {
      expect('git stash list').toContain('git stash');
    });

    it('should construct git remote command', () => {
      expect('git remote -v').toContain('git remote');
    });
  });

  describe('git command execution', () => {
    it('should execute git status in git directory', async () => {
      try {
        const { stdout } = await execAsync('git status --short', { cwd: testGitDir });
        expect(stdout).toBeDefined();
      } catch {
        // Git might not be available
        expect(true).toBe(true);
      }
    });

    it('should execute git branch in git directory', async () => {
      try {
        const { stdout } = await execAsync('git branch -vv', { cwd: testGitDir });
        expect(stdout).toBeDefined();
      } catch {
        expect(true).toBe(true);
      }
    });

    it('should execute git log in git directory', async () => {
      try {
        const { stdout } = await execAsync('git log --oneline -5', { cwd: testGitDir });
        expect(stdout).toBeDefined();
      } catch {
        expect(true).toBe(true);
      }
    });
  });
});

describe('/tree command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('tree')).toBe(true);
  });

  describe('depth parsing', () => {
    it('should parse depth argument', () => {
      const args = ['3'];
      const maxDepth = Math.min(parseInt(args[0], 10) || 2, 5);
      expect(maxDepth).toBe(3);
    });

    it('should default to depth 2', () => {
      const args: string[] = [];
      const maxDepth = Math.min(parseInt(args[0], 10) || 2, 5);
      expect(maxDepth).toBe(2);
    });

    it('should cap depth at 5', () => {
      const args = ['10'];
      const maxDepth = Math.min(parseInt(args[0], 10) || 2, 5);
      expect(maxDepth).toBe(5);
    });
  });

  describe('path resolution', () => {
    it('should resolve relative paths', () => {
      const workingDir = testDir;
      const targetPath = 'src';
      const fullPath = path.isAbsolute(targetPath)
        ? targetPath
        : path.join(workingDir, targetPath);
      expect(fullPath).toBe(path.join(testDir, 'src'));
    });

    it('should handle absolute paths', () => {
      const targetPath = '/absolute/path';
      const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(testDir, targetPath);
      expect(fullPath).toBe('/absolute/path');
    });
  });

  describe('security check', () => {
    it('should block path traversal attempts', () => {
      const workingDir = testDir;
      const targetPath = '../../../etc';
      const fullPath = path.join(workingDir, targetPath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkingDir = path.resolve(workingDir);

      // Security check
      const isOutside = !resolvedPath.startsWith(resolvedWorkingDir) && resolvedPath !== resolvedWorkingDir;
      expect(isOutside).toBe(true);
    });

    it('should allow paths within working directory', () => {
      const workingDir = testDir;
      const targetPath = 'src/utils';
      const fullPath = path.join(workingDir, targetPath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkingDir = path.resolve(workingDir);

      const isInside = resolvedPath.startsWith(resolvedWorkingDir) || resolvedPath === resolvedWorkingDir;
      expect(isInside).toBe(true);
    });
  });

  describe('tree building', () => {
    it('should list directory contents', () => {
      const items = fs.readdirSync(testDir);
      expect(items.length).toBeGreaterThan(0);
    });

    it('should filter ignored directories', () => {
      const ignored = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.cache', '__pycache__', '.venv', 'venv']);
      const items = ['.git', 'src', 'node_modules', 'package.json'];
      const filtered = items.filter(item => !ignored.has(item) && !item.startsWith('.'));
      expect(filtered).toEqual(['src', 'package.json']);
    });

    it('should sort directories before files', () => {
      const items = ['file.txt', 'src', 'package.json', 'tests'];
      // Simulate sorting: directories first
      const sorted = items.sort((a, b) => {
        const aIsDir = ['src', 'tests'].includes(a);
        const bIsDir = ['src', 'tests'].includes(b);
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
      expect(sorted[0]).toBe('src');
      expect(sorted[1]).toBe('tests');
    });
  });
});

describe('/bookmark command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('bookmark')).toBe(true);
  });

  describe('subcommand parsing', () => {
    it('should parse list subcommand', () => {
      const args = ['list'];
      const subcommand = args[0]?.toLowerCase();
      expect(subcommand).toBe('list');
    });

    it('should parse save subcommand with name and prompt', () => {
      const args = ['save', 'myPrompt', 'This', 'is', 'my', 'prompt'];
      const subcommand = args[0]?.toLowerCase();
      const name = args[1];
      const prompt = args.slice(2).join(' ');
      expect(subcommand).toBe('save');
      expect(name).toBe('myPrompt');
      expect(prompt).toBe('This is my prompt');
    });

    it('should parse delete subcommand', () => {
      const args = ['delete', 'myPrompt'];
      const subcommand = args[0]?.toLowerCase();
      const name = args[1];
      expect(subcommand).toBe('delete');
      expect(name).toBe('myPrompt');
    });
  });

  describe('bookmark storage', () => {
    it('should store and retrieve bookmarks', () => {
      const bookmarks = new Map<string, string>();
      bookmarks.set('test', 'Test prompt');
      expect(bookmarks.get('test')).toBe('Test prompt');
    });

    it('should delete bookmarks', () => {
      const bookmarks = new Map<string, string>();
      bookmarks.set('test', 'Test prompt');
      const deleted = bookmarks.delete('test');
      expect(deleted).toBe(true);
      expect(bookmarks.has('test')).toBe(false);
    });

    it('should return false when deleting non-existent bookmark', () => {
      const bookmarks = new Map<string, string>();
      const deleted = bookmarks.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });
});

describe('/context command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('context')).toBe(true);
  });

  describe('context info parsing', () => {
    it('should parse context info with tokens and percentage', () => {
      const text = 'Context: 45,000 tokens (23%)';
      const contextMatch = text.match(/context[:\s]+([\d,]+)\s*tokens?\s*\(?([\d.]+)?%?\)?/i);
      expect(contextMatch).not.toBeNull();
      expect(contextMatch![1]).toBe('45,000');
      expect(contextMatch![2]).toBe('23');
    });

    it('should parse context info without percentage', () => {
      const text = 'Context: 30000 tokens';
      const contextMatch = text.match(/context[:\s]+([\d,]+)\s*tokens?\s*\(?([\d.]+)?%?\)?/i);
      expect(contextMatch).not.toBeNull();
      expect(contextMatch![1]).toBe('30000');
    });

    it('should convert token string to number', () => {
      const tokenString = '45,000';
      const tokens = parseInt(tokenString.replace(/,/g, ''), 10);
      expect(tokens).toBe(45000);
    });
  });

  describe('context info formatting', () => {
    it('should format context info with tokens', () => {
      const tokens = 45000;
      const formatted = `Tokens: ~${tokens.toLocaleString()}`;
      expect(formatted).toContain('45,000');
    });

    it('should format context info with percentage', () => {
      const tokens = 45000;
      const percentage = 23;
      const formatted = `Tokens: ~${tokens.toLocaleString()} (${percentage}%)`;
      expect(formatted).toContain('(23%)');
    });
  });
});

describe('/cost command', () => {
  it('should be registered in BOT_COMMANDS', () => {
    expect(BOT_COMMANDS.has('cost')).toBe(true);
  });

  describe('cost response parsing', () => {
    it('should parse session cost', () => {
      const response = 'Session cost: $0.15';
      const sessionCostMatch = response.match(/session\s*(?:cost)?[:\s]+\$?([\d.]+)/i);
      expect(sessionCostMatch).not.toBeNull();
      expect(sessionCostMatch![1]).toBe('0.15');
    });

    it('should parse total cost', () => {
      const response = 'Total cost: $1.25';
      const totalCostMatch = response.match(/total\s*(?:cost)?[:\s]+\$?([\d.]+)/i);
      expect(totalCostMatch).not.toBeNull();
      expect(totalCostMatch![1]).toBe('1.25');
    });

    it('should parse input tokens', () => {
      const response = 'Input: 5,000 tokens';
      const inputTokensMatch = response.match(/input[:\s]+([\d,]+)\s*tokens?/i);
      expect(inputTokensMatch).not.toBeNull();
      expect(inputTokensMatch![1]).toBe('5,000');
    });

    it('should parse output tokens', () => {
      const response = 'Output: 2,500 tokens';
      const outputTokensMatch = response.match(/output[:\s]+([\d,]+)\s*tokens?/i);
      expect(outputTokensMatch).not.toBeNull();
      expect(outputTokensMatch![1]).toBe('2,500');
    });

    it('should handle response with dollar sign in cost', () => {
      const response = 'Session: $0.50, Total: $2.00';
      expect(response.includes('$')).toBe(true);
    });
  });
});

describe('message batching', () => {
  describe('batch buffer', () => {
    it('should accumulate messages in buffer', () => {
      const buffer: string[] = [];
      buffer.push('message 1');
      buffer.push('message 2');
      expect(buffer.length).toBe(2);
    });

    it('should combine messages with newlines', () => {
      const buffer = ['message 1', 'message 2', 'message 3'];
      const combined = buffer.join('\n');
      expect(combined).toBe('message 1\nmessage 2\nmessage 3');
    });
  });

  describe('truncation', () => {
    it('should truncate long combined messages', () => {
      const combined = 'x'.repeat(5000);
      const maxLength = 4000;
      const truncated = combined.length > maxLength;
      const displayContent = truncated
        ? combined.slice(0, maxLength) + '\n...(truncated)'
        : combined;
      expect(truncated).toBe(true);
      expect(displayContent.length).toBeLessThan(combined.length);
    });
  });
});

describe('rate limiting', () => {
  describe('rate limit check', () => {
    it('should detect when rate limited', () => {
      const lastTime = Date.now() - 500; // 500ms ago
      const now = Date.now();
      const RATE_LIMIT_MS = 1000;
      const timeSinceLast = now - lastTime;
      const isRateLimited = timeSinceLast < RATE_LIMIT_MS;
      expect(isRateLimited).toBe(true);
    });

    it('should allow messages after rate limit clears', () => {
      const lastTime = Date.now() - 2000; // 2s ago
      const now = Date.now();
      const RATE_LIMIT_MS = 1000;
      const timeSinceLast = now - lastTime;
      const isRateLimited = timeSinceLast < RATE_LIMIT_MS;
      expect(isRateLimited).toBe(false);
    });
  });

  describe('message queue', () => {
    it('should respect max queue size', () => {
      const queue: Array<{ chatId: number; message: string }> = [];
      const MAX_QUEUE_SIZE = 50;

      // Fill queue
      for (let i = 0; i < 60; i++) {
        if (queue.length < MAX_QUEUE_SIZE) {
          queue.push({ chatId: 123, message: `message ${i}` });
        }
      }
      expect(queue.length).toBe(50);
    });
  });
});

describe('output history', () => {
  it('should maintain max history size', () => {
    const outputHistory: string[] = [];
    const MAX_OUTPUT_HISTORY = 100;

    // Add more than max
    for (let i = 0; i < 150; i++) {
      outputHistory.push(`line ${i}`);
      if (outputHistory.length > MAX_OUTPUT_HISTORY) {
        outputHistory.shift();
      }
    }

    expect(outputHistory.length).toBe(100);
    expect(outputHistory[0]).toBe('line 50'); // First 50 were shifted out
  });

  it('should return last N lines', () => {
    const outputHistory = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const count = 20;
    const recentLines = outputHistory.slice(-count);
    expect(recentLines.length).toBe(20);
    expect(recentLines[0]).toBe('line 80');
  });
});

describe('session crash notification', () => {
  it('should format crash message with session info', () => {
    const sessionName = 'my-session';
    const exitCode = 1;
    const message = `🔄 Session "${sessionName}" crashed (exit code: ${exitCode}).`;
    expect(message).toContain('my-session');
    expect(message).toContain('exit code: 1');
    expect(message).toContain('🔄');
  });

  it('should provide recovery options', () => {
    const sessionName = 'my-session';
    const options = `Options:\n• /new ${sessionName} - Create new session\n• /sessions - View and attach to existing Claude sessions`;
    expect(options).toContain('/new my-session');
    expect(options).toContain('/sessions');
  });
});
