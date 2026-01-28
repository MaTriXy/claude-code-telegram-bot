import { Telegraf, Context } from 'telegraf';
import type { Update, Message } from 'telegraf/types';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  TelegramBotConfig,
  ExtendedTelegramBotConfig,
  ParsedQuestion,
  Session,
  TelegramFormattedMessage,
  VerbosityLevel,
  NotificationType,
  NotificationPreferences,
  VoiceConfig,
  FileUploadConfig,
} from '../types/index.js';
import { SessionManager } from '../session/SessionManager.js';
import { OutputParser } from '../parser/OutputParser.js';
import { ClaudeSessionScanner, VoiceHandler, FileHandler } from '../utils/index.js';
import { NotificationManager } from '../notifications/index.js';

type TextContext = Context<Update.MessageUpdate<Message.TextMessage>>;
type CallbackContext = Context<Update.CallbackQueryUpdate>;

// Bot commands that are handled by the Telegram bot itself (not forwarded to Claude)
const BOT_COMMANDS = new Set([
  'start', 'help', 'new', 'cd', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'sessions', 'attach',
  'voice', 'notify', 'verbosity', 'upload', 'file', 'diff', 'escape',
  'log', 'pwd', 'git', 'tree', 'bookmark', 'context', 'cost',
  'babysit' // Alias for /babysitter:call
]);

// Default notification preferences
const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  completion: true,
  error: true,
  warning: true,
  progress: false,
};

/**
 * Telegram bot for remote Claude Code operation
 */
export class TelegramBot {
  private bot: Telegraf;
  private sessionManager: SessionManager;
  private outputParser: OutputParser;
  private sessionScanner: ClaudeSessionScanner;
  private allowedUsers: Set<number>;
  private userChatIds: Map<number, number> = new Map(); // userId -> chatId
  private pendingQuestions: Map<number, ParsedQuestion> = new Map(); // chatId -> question
  private awaitingCustomInput: Set<number> = new Set(); // chatIds awaiting custom input
  private outputUnsubscribers: Map<string, () => void> = new Map(); // sessionId -> unsubscribe function
  private errorUnsubscribers: Map<string, () => void> = new Map(); // sessionId -> error unsubscribe
  private closeUnsubscribers: Map<string, () => void> = new Map(); // sessionId -> close unsubscribe
  private lastThinkingMessageTime = 0; // Debounce thinking messages
  private static readonly THINKING_DEBOUNCE_MS = 5000; // 5 seconds debounce
  private waitingForUserResponse = false; // True when a question is pending and we're waiting for user input
  private suppressedMessages: string[] = []; // Buffer messages while waiting for response

  // New feature state
  private voiceHandler: VoiceHandler | null = null;
  private fileHandler: FileHandler | null = null;
  private notificationManager: NotificationManager | null = null;
  private voiceConfig: VoiceConfig;
  private fileUploadConfig: FileUploadConfig;
  private userVoiceEnabled: Map<number, boolean> = new Map(); // userId -> voice enabled
  private userUploadEnabled: Map<number, boolean> = new Map(); // userId -> upload enabled
  private userVerbosityLevel: Map<number, VerbosityLevel> = new Map(); // userId -> verbosity
  private userNotificationPrefs: Map<number, NotificationPreferences> = new Map(); // userId -> notification prefs
  private defaultVerbosity: VerbosityLevel;
  private defaultNotificationPrefs: NotificationPreferences;

  // Output history for /log command
  private outputHistory: string[] = [];
  private static readonly MAX_OUTPUT_HISTORY = 100; // Keep last 100 lines

  // Bookmarks for /bookmark command
  private userBookmarks: Map<number, Map<string, string>> = new Map(); // userId -> (name -> prompt)

  // Rate limiting and message queue
  private messageQueue: Array<{ chatId: number; message: string; timestamp: number }> = [];
  private isProcessingQueue = false;
  private lastMessageTime: Map<number, number> = new Map(); // chatId -> timestamp
  private static readonly RATE_LIMIT_MS = 1000; // Minimum time between messages to same chat
  private static readonly MAX_QUEUE_SIZE = 50;

  // Input validation - security hardening (REM-005)
  private static readonly MAX_MESSAGE_LENGTH = 10240; // 10KB max input size

  // Message batching
  private messageBatchBuffer: Map<number, string[]> = new Map(); // chatId -> pending messages
  private messageBatchTimer: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private static readonly BATCH_DELAY_MS = 500; // Delay before sending batched messages

  // Context tracking for /context command
  private lastContextInfo: { tokens?: number; percentage?: number; timestamp?: Date } = {};

  // Cost tracking for /cost command
  private pendingCostCallback: ((response: string) => void) | null = null;

  constructor(config: TelegramBotConfig | ExtendedTelegramBotConfig) {
    this.bot = new Telegraf(config.token);
    this.sessionManager = new SessionManager(config.sessionManagerConfig);
    this.outputParser = new OutputParser();
    this.sessionScanner = new ClaudeSessionScanner();
    this.allowedUsers = new Set(config.allowedUserIds);

    // Initialize new feature configs
    const extConfig = config as ExtendedTelegramBotConfig;
    this.voiceConfig = extConfig.voiceConfig || { enabled: false };
    this.fileUploadConfig = extConfig.fileUploadConfig || {
      enabled: false,
      maxFileSizeMB: 10,
      supportedMimeTypes: [],
      allowedExtensions: [],
    };
    this.defaultVerbosity = extConfig.verbosityConfig?.defaultLevel || 'normal';
    this.defaultNotificationPrefs = extConfig.notificationConfig?.defaults || DEFAULT_NOTIFICATION_PREFS;

    // Initialize voice handler if configured
    if (this.voiceConfig.enabled && this.voiceConfig.openaiApiKey) {
      this.voiceHandler = new VoiceHandler(this.voiceConfig);
    }

    // Initialize file handler if configured
    if (this.fileUploadConfig.enabled) {
      this.fileHandler = new FileHandler(this.fileUploadConfig);
    }

    // Initialize notification manager
    this.notificationManager = new NotificationManager({
      defaults: this.defaultNotificationPrefs,
    });

    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbackHandlers();
    this.setupMessageHandlers();
    this.setupOutputForwarding();
  }

  /**
   * Set up authorization middleware
   */
  private setupMiddleware(): void {
    // Authorization middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.isUserAuthorized(userId)) {
        await ctx.reply('Unauthorized. Your user ID is not in the allowed list.');
        return;
      }

      // Store chat ID for this user
      if (ctx.chat) {
        const wasNew = !this.userChatIds.has(userId);
        this.userChatIds.set(userId, ctx.chat.id);
        if (wasNew) {
          console.log(`[Auth] User ${userId} connected with chat ID ${ctx.chat.id}`);
        }
      }

      await next();
    });

    // Error handling middleware
    this.bot.catch((err, ctx) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      ctx.reply('An error occurred. Please try again.').catch(() => {});
    });
  }

  /**
   * Set up command handlers
   */
  private setupCommands(): void {
    // /start - Welcome message
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        '🤖 Welcome to Claude Code Bot!\n\n' +
          'Control Claude Code CLI remotely from Telegram.\n\n' +
          'Session Commands:\n' +
          '/new <name> [dir] - Create new session\n' +
          '/list - List all sessions\n' +
          '/switch <id> - Switch to session\n' +
          '/status - Current session info\n' +
          '/help - Full command list\n\n' +
          'Files & Git:\n' +
          '/file <path> - Get file contents\n' +
          '/diff [path] - Show git diff\n' +
          '/git - Quick git operations\n' +
          '/tree - Directory tree view\n\n' +
          'Utilities:\n' +
          '/pwd - Working directory\n' +
          '/log - Output history\n' +
          '/bookmark - Save/recall prompts\n' +
          '/context - Context usage\n' +
          '/cost - Session costs\n\n' +
          'Send any text to interact with the active Claude session.\n\n' +
          '═══════════════════════════════\n' +
          '🧙 100% Built using Babysitter\n' +
          '      by a5c.ai - https://a5c.ai\n' +
          '═══════════════════════════════'
      );
    });

    // /help - Show help
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Claude Code Bot Commands\n\n' +
          '⭐ Recommended:\n' +
          '/babysit [task] - Start Babysitter for complex workflows\n\n' +
          'Session Management:\n' +
          '/new <name> [workingDir] - Create a new session\n' +
          '/sessions - List existing Claude sessions on system\n' +
          '/attach <id> [dir] - Attach to existing session\n' +
          '/list - List active Telegram sessions\n' +
          '/switch <id> - Switch to a different session\n' +
          '/close <id> - Close and terminate a session\n' +
          '/status - Show current session details\n' +
          '/cd <path> - Change working directory\n\n' +
          'Control:\n' +
          '/abort - Abort current operation (Ctrl+C)\n' +
          '/escape - Send ESC to interrupt and allow new prompt\n' +
          '/kill - Force kill current process\n\n' +
          'Files & Git:\n' +
          '/file <path> [--raw] - Get file contents or directory listing\n' +
          '/diff [path] - Show git diff (use --staged for staged changes)\n' +
          '/git [status|branch|log|stash|remote] - Quick git operations\n' +
          '/tree [depth] [path] - Directory tree view\n\n' +
          'Utilities:\n' +
          '/pwd - Show working directory\n' +
          '/log [n] - View recent output history\n' +
          '/bookmark - Save and recall prompts\n' +
          '/context - Show context usage\n' +
          '/cost - Get session cost information\n\n' +
          'Features:\n' +
          '/voice [on|off] - Toggle voice transcription\n' +
          '/upload [on|off] - Toggle file upload\n' +
          '/verbosity [level] - Set output verbosity (minimal|normal|verbose)\n' +
          '/notify [type] [on|off] - Configure notifications\n\n' +
          'When Claude asks questions, use the inline buttons or type a custom response.\n' +
          'You can send voice messages and upload files when enabled.\n\n' +
          '═══════════════════════════════\n' +
          '🧙 100% Built using Babysitter\n' +
          '      by a5c.ai - https://a5c.ai'
      );
    });

    // /new - Create new session
    this.bot.command('new', async (ctx) => {
      try {
        // Parse command: /new <name> [workingDir]
        // Working dir is optional and can contain spaces if quoted
        const fullText = ctx.message.text;
        const withoutCommand = fullText.replace(/^\/new\s*/, '').trim();

        let name: string;
        let workingDir: string | undefined;

        if (!withoutCommand) {
          // No args: /new
          name = `session-${Date.now()}`;
          workingDir = undefined;
        } else {
          // Split by spaces, first arg is name
          const parts = withoutCommand.split(/\s+/);
          name = parts[0];
          // Rest is working dir (join back in case path has spaces)
          workingDir = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
        }

        // Only use workingDir if it's actually provided (not empty string)
        const effectiveWorkingDir = workingDir && workingDir.trim() ? workingDir.trim() : undefined;

        // Check if session with same name exists - close it first
        const existingSessions = this.sessionManager.listSessions();
        const existingSession = existingSessions.find(s => s.name === name);
        if (existingSession) {
          // Unsubscribe from old session output
          this.unsubscribeFromSession(existingSession.id);
          await this.sessionManager.closeSession(existingSession.id);
          await ctx.reply(`Closed existing session "${name}"`);
        }

        const session = await this.sessionManager.createSession(name, effectiveWorkingDir);

        // Reset waiting state for new session
        this.waitingForUserResponse = false;
        this.suppressedMessages = [];

        // Subscribe to session output
        this.subscribeToSessionOutput(session.id);

        await ctx.reply(
          `Session created!\n\n` +
            `ID: \`${session.id}\`\n` +
            `Name: ${session.name}\n` +
            `Directory: ${session.workingDir}\n` +
            `Status: ${session.status}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await ctx.reply(`Error creating session: ${message}`);
      }
    });

    // /cd - Change directory for current session
    this.bot.command('cd', async (ctx) => {
      try {
        const newDir = ctx.message.text.split(' ').slice(1).join(' ');
        if (!newDir) {
          await ctx.reply('Usage: /cd <path>');
          return;
        }

        const currentSession = this.sessionManager.getActiveSession();
        if (!currentSession) {
          await ctx.reply('No active session. Use /new to create one.');
          return;
        }

        // Change directory (this restarts the process)
        const updatedSession = await this.sessionManager.changeDirectory(currentSession.id, newDir);

        // Re-subscribe to output
        this.subscribeToSessionOutput(updatedSession.id);

        await ctx.reply(
          `Directory changed!\n\n` +
            `Session: ${updatedSession.name}\n` +
            `New directory: ${updatedSession.workingDir}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await ctx.reply(`Error changing directory: ${message}`);
      }
    });

    // /list - List sessions
    this.bot.command('list', async (ctx) => {
      const sessions = this.sessionManager.listSessions();
      const activeSession = this.sessionManager.getActiveSession();

      if (sessions.length === 0) {
        await ctx.reply('No active sessions. Use /new to create one.');
        return;
      }

      let message = 'Sessions:\n\n';
      for (const session of sessions) {
        const isActive = activeSession?.id === session.id;
        const marker = isActive ? '✓ ' : '  ';
        message += `${marker}\`${session.id}\`\n`;
        message += `   Name: ${session.name}\n`;
        message += `   Status: ${session.status}\n`;
        message += `   Dir: ${session.workingDir}\n\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    });

    // /switch - Switch session
    this.bot.command('switch', async (ctx) => {
      try {
        const sessionId = ctx.message.text.split(' ')[1];
        if (!sessionId) {
          await ctx.reply('Usage: /switch <sessionId>');
          return;
        }

        const session = this.sessionManager.switchSession(sessionId);
        await ctx.reply(`Switched to session: ${session.name} (\`${session.id}\`)`, {
          parse_mode: 'Markdown',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Session not found';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /close - Close session
    this.bot.command('close', async (ctx) => {
      try {
        const sessionId = ctx.message.text.split(' ')[1];
        if (!sessionId) {
          await ctx.reply('Usage: /close <sessionId>');
          return;
        }

        await this.sessionManager.closeSession(sessionId);
        await ctx.reply(`Session \`${sessionId}\` closed.`, { parse_mode: 'Markdown' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Session not found';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /status - Current session status
    this.bot.command('status', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      await ctx.reply(
        `Current Session:\n\n` +
          `ID: \`${session.id}\`\n` +
          `Name: ${session.name}\n` +
          `Status: ${session.status}\n` +
          `Directory: ${session.workingDir}\n` +
          `Created: ${session.createdAt.toISOString()}\n` +
          `Last Activity: ${session.lastActivity.toISOString()}`,
        { parse_mode: 'Markdown' }
      );
    });

    // /abort - Abort current operation (sends Ctrl+C equivalent)
    this.bot.command('abort', async (ctx) => {
      try {
        // Send special abort signal or message
        this.sessionManager.sendToActiveSession('\x03'); // Ctrl+C
        await ctx.reply('Abort signal sent to active session.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No active session';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /kill - Force kill the current Claude process (hard stop)
    this.bot.command('kill', async (ctx) => {
      try {
        const activeSession = this.sessionManager.getActiveSession();
        if (!activeSession) {
          await ctx.reply('No active session to kill.');
          return;
        }

        // Kill the process forcefully
        this.sessionManager.killActiveProcess();
        await ctx.reply('🔪 Killed! Claude/Babysitter process terminated.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to kill process';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /escape - Send ESC key to abort current activity and allow new prompt
    this.bot.command('escape', async (ctx) => {
      try {
        // Send ESC character (0x1B) to the session
        this.sessionManager.sendToActiveSession('\x1B');
        await ctx.reply('⎋ Escape sent. You can now send a new prompt.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No active session';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /sessions - List existing Claude sessions on the system
    this.bot.command('sessions', async (ctx) => {
      try {
        const recentSessions = this.sessionScanner.getRecentSessions(10);

        if (recentSessions.length === 0) {
          await ctx.reply('No recent Claude sessions found on this system.');
          return;
        }

        let message = '🗂️ *Recent Claude Sessions*\n\n';
        message += '_Use /attach <session-id> to connect_\n\n';

        for (const session of recentSessions) {
          message += this.sessionScanner.formatSession(session) + '\n\n';
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list sessions';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /attach - Attach to an existing Claude session
    this.bot.command('attach', async (ctx) => {
      try {
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
          await ctx.reply(
            'Usage: /attach <session-id> [working-dir]\n\n' +
            'Use /sessions to see available sessions.\n' +
            'You can use partial session IDs (first 8 characters).'
          );
          return;
        }

        const partialId = args[0];
        const workingDir = args.slice(1).join(' ') || undefined;

        // Find matching session
        const recentSessions = this.sessionScanner.getRecentSessions(100);
        const matchingSession = recentSessions.find(s =>
          s.sessionId.startsWith(partialId) || s.sessionId === partialId
        );

        if (!matchingSession) {
          await ctx.reply(`No session found matching "${partialId}". Use /sessions to see available sessions.`);
          return;
        }

        // Use the session's project directory if no working dir specified
        const effectiveWorkingDir = workingDir || matchingSession.project;

        // Attach to the session
        const session = await this.sessionManager.attachToSession(
          matchingSession.projectName,
          matchingSession.sessionId,
          effectiveWorkingDir
        );

        // Reset waiting state for new session
        this.waitingForUserResponse = false;
        this.suppressedMessages = [];

        // Subscribe to session output
        this.subscribeToSessionOutput(session.id);

        await ctx.reply(
          `🔗 *Attached to existing session!*\n\n` +
          `Session ID: \`${matchingSession.sessionId.substring(0, 8)}...\`\n` +
          `Project: ${matchingSession.projectName}\n` +
          `Directory: ${effectiveWorkingDir}\n\n` +
          `Send a message to continue this session.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to attach';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /voice - Toggle voice message transcription
    this.bot.command('voice', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      if (!this.voiceHandler) {
        await ctx.reply(
          'Voice transcription is not configured.\n' +
          'Set VOICE_ENABLED=true and OPENAI_API_KEY in your .env file.'
        );
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      const arg = args[0]?.toLowerCase();

      if (arg === 'on') {
        this.userVoiceEnabled.set(userId, true);
        await ctx.reply('Voice transcription enabled. Send me a voice message!');
      } else if (arg === 'off') {
        this.userVoiceEnabled.set(userId, false);
        await ctx.reply('Voice transcription disabled.');
      } else {
        const currentState = this.userVoiceEnabled.get(userId) ?? this.voiceConfig.enabled;
        await ctx.reply(
          `Voice transcription: ${currentState ? 'ON' : 'OFF'}\n\n` +
          'Usage: /voice [on|off]'
        );
      }
    });

    // /notify - Configure notification preferences
    this.bot.command('notify', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const args = ctx.message.text.split(' ').slice(1);
      const notificationType = args[0]?.toLowerCase() as NotificationType | 'all' | undefined;
      const action = args[1]?.toLowerCase();

      // Get or initialize user prefs
      let prefs = this.userNotificationPrefs.get(userId);
      if (!prefs) {
        prefs = { ...this.defaultNotificationPrefs };
        this.userNotificationPrefs.set(userId, prefs);
      }

      if (!notificationType) {
        // Show current settings
        await ctx.reply(
          'Notification Settings:\n\n' +
          `completion: ${prefs.completion ? 'ON' : 'OFF'}\n` +
          `error: ${prefs.error ? 'ON' : 'OFF'}\n` +
          `warning: ${prefs.warning ? 'ON' : 'OFF'}\n` +
          `progress: ${prefs.progress ? 'ON' : 'OFF'}\n\n` +
          'Usage: /notify <type> [on|off]\n' +
          'Types: completion, error, warning, progress, all'
        );
        return;
      }

      if (action !== 'on' && action !== 'off') {
        await ctx.reply('Usage: /notify <type> [on|off]');
        return;
      }

      const enabled = action === 'on';

      if (notificationType === 'all') {
        prefs.completion = enabled;
        prefs.error = enabled;
        prefs.warning = enabled;
        prefs.progress = enabled;
        await ctx.reply(`All notifications ${enabled ? 'enabled' : 'disabled'}.`);
      } else if (['completion', 'error', 'warning', 'progress'].includes(notificationType)) {
        prefs[notificationType as NotificationType] = enabled;
        await ctx.reply(`${notificationType} notifications ${enabled ? 'enabled' : 'disabled'}.`);
      } else {
        await ctx.reply('Invalid notification type. Use: completion, error, warning, progress, or all');
      }
    });

    // /verbosity - Set output verbosity level
    this.bot.command('verbosity', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const args = ctx.message.text.split(' ').slice(1);
      const level = args[0]?.toLowerCase() as VerbosityLevel | undefined;

      if (!level) {
        const currentLevel = this.userVerbosityLevel.get(userId) ?? this.defaultVerbosity;
        await ctx.reply(
          `Current verbosity: ${currentLevel}\n\n` +
          'Levels:\n' +
          '  minimal - Questions only\n' +
          '  normal - Questions + final results\n' +
          '  verbose - All output including tool calls\n\n' +
          'Usage: /verbosity [minimal|normal|verbose]'
        );
        return;
      }

      if (!['minimal', 'normal', 'verbose'].includes(level)) {
        await ctx.reply('Invalid level. Use: minimal, normal, or verbose');
        return;
      }

      this.userVerbosityLevel.set(userId, level);
      await ctx.reply(`Verbosity set to: ${level}`);
    });

    // /upload - Toggle file upload support
    this.bot.command('upload', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      if (!this.fileUploadConfig.enabled) {
        await ctx.reply(
          'File upload is not configured.\n' +
          'Set FILE_UPLOAD_ENABLED=true in your .env file.'
        );
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      const arg = args[0]?.toLowerCase();

      if (arg === 'on') {
        this.userUploadEnabled.set(userId, true);
        await ctx.reply(
          'File upload enabled.\n\n' +
          `Max file size: ${this.fileUploadConfig.maxFileSizeMB}MB\n` +
          'Send me a document or image!'
        );
      } else if (arg === 'off') {
        this.userUploadEnabled.set(userId, false);
        await ctx.reply('File upload disabled.');
      } else {
        const currentState = this.userUploadEnabled.get(userId) ?? this.fileUploadConfig.enabled;
        await ctx.reply(
          `File upload: ${currentState ? 'ON' : 'OFF'}\n` +
          `Max size: ${this.fileUploadConfig.maxFileSizeMB}MB\n\n` +
          'Usage: /upload [on|off]'
        );
      }
    });

    // /file - Request a file from working directory
    this.bot.command('file', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0) {
        await ctx.reply(
          'Request a file from the session working directory.\n\n' +
          'Usage:\n' +
          '  /file <path> - Send as formatted text\n' +
          '  /file <path> --raw - Send as file attachment\n\n' +
          'Examples:\n' +
          '  /file src/index.ts\n' +
          '  /file package.json --raw'
        );
        return;
      }

      const sendAsFile = args.includes('--raw');
      const filePath = args.filter(a => a !== '--raw').join(' ');

      try {
        // Resolve the path relative to working directory
        const fullPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(session.workingDir, filePath);

        // Security check - ensure the path is within the working directory
        const resolvedPath = path.resolve(fullPath);
        const resolvedWorkingDir = path.resolve(session.workingDir);
        if (!resolvedPath.startsWith(resolvedWorkingDir)) {
          await ctx.reply('Error: Cannot access files outside the session working directory.');
          return;
        }

        // Check if file exists
        if (!fs.existsSync(resolvedPath)) {
          await ctx.reply(`File not found: ${filePath}`);
          return;
        }

        const stats = fs.statSync(resolvedPath);
        if (stats.isDirectory()) {
          // List directory contents
          const files = fs.readdirSync(resolvedPath);
          const listing = files.map(f => {
            const fPath = path.join(resolvedPath, f);
            const fStats = fs.statSync(fPath);
            return fStats.isDirectory() ? `📁 ${f}/` : `📄 ${f}`;
          }).join('\n');
          await ctx.reply(`Directory: ${filePath}\n\n${listing || '(empty)'}`);
          return;
        }

        // Check file size
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (stats.size > maxSize) {
          await ctx.reply(`File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max: 10MB`);
          return;
        }

        if (sendAsFile) {
          // Send as file attachment
          await ctx.replyWithDocument({
            source: resolvedPath,
            filename: path.basename(filePath)
          });
        } else {
          // Send as formatted text
          const content = fs.readFileSync(resolvedPath, 'utf-8');
          const ext = path.extname(filePath).slice(1) || 'txt';

          // Truncate if too long for Telegram
          const maxLength = 4000;
          const truncated = content.length > maxLength;
          const displayContent = truncated
            ? content.slice(0, maxLength) + '\n...(truncated)'
            : content;

          const message = `📄 \`${filePath}\`\n\n\`\`\`${ext}\n${displayContent}\n\`\`\``;

          try {
            await ctx.reply(message, { parse_mode: 'Markdown' });
          } catch {
            // Fallback to plain text if markdown fails
            await ctx.reply(`📄 ${filePath}\n\n${displayContent}`);
          }

          if (truncated) {
            await ctx.reply('File was truncated. Use /file <path> --raw to get the full file.');
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read file';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /diff - Request git diff for a file or path
    this.bot.command('diff', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      const execAsync = promisify(exec);

      try {
        let gitCommand: string;
        let description: string;

        if (args.length === 0) {
          // Show all changes
          gitCommand = 'git diff';
          description = 'All unstaged changes';
        } else if (args[0] === '--staged' || args[0] === '--cached') {
          // Show staged changes
          const filePath = args.slice(1).join(' ');
          gitCommand = filePath ? `git diff --staged -- "${filePath}"` : 'git diff --staged';
          description = filePath ? `Staged changes in ${filePath}` : 'All staged changes';
        } else if (args[0] === '--stat') {
          // Show diff stat
          const filePath = args.slice(1).join(' ');
          gitCommand = filePath ? `git diff --stat -- "${filePath}"` : 'git diff --stat';
          description = filePath ? `Diff stats for ${filePath}` : 'Diff stats for all changes';
        } else {
          // Show diff for specific file/path
          const filePath = args.join(' ');
          gitCommand = `git diff -- "${filePath}"`;
          description = `Changes in ${filePath}`;
        }

        const { stdout, stderr } = await execAsync(gitCommand, {
          cwd: session.workingDir,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        if (stderr && !stdout) {
          await ctx.reply(`Git error: ${stderr}`);
          return;
        }

        if (!stdout || stdout.trim() === '') {
          await ctx.reply(`No changes found. ${description}`);
          return;
        }

        // Truncate if too long
        const maxLength = 4000;
        const truncated = stdout.length > maxLength;
        const displayContent = truncated
          ? stdout.slice(0, maxLength) + '\n...(truncated)'
          : stdout;

        const message = `📊 ${description}\n\n\`\`\`diff\n${displayContent}\n\`\`\``;

        try {
          await ctx.reply(message, { parse_mode: 'Markdown' });
        } catch {
          // Fallback to plain text if markdown fails
          await ctx.reply(`📊 ${description}\n\n${displayContent}`);
        }

        if (truncated) {
          await ctx.reply(
            'Diff was truncated. Options:\n' +
            '  /diff --stat - Show summary only\n' +
            '  /diff <specific-file> - Show diff for one file'
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get diff';
        if (message.includes('not a git repository')) {
          await ctx.reply('Error: Working directory is not a git repository.');
        } else {
          await ctx.reply(`Error: ${message}`);
        }
      }
    });

    // /log - View recent session output history
    this.bot.command('log', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      const count = Math.min(parseInt(args[0], 10) || 20, TelegramBot.MAX_OUTPUT_HISTORY);

      if (this.outputHistory.length === 0) {
        await ctx.reply('No output history available. Start a session and interact with Claude first.');
        return;
      }

      const recentLines = this.outputHistory.slice(-count);
      const output = recentLines.join('\n');

      // Truncate if too long
      const maxLength = 4000;
      const truncated = output.length > maxLength;
      const displayContent = truncated
        ? output.slice(0, maxLength) + '\n...(truncated)'
        : output;

      await ctx.reply(
        `📜 Last ${recentLines.length} output lines:\n\n${displayContent}`,
        { parse_mode: undefined }
      );

      if (truncated) {
        await ctx.reply(`Use /log <n> to see fewer lines (max ${TelegramBot.MAX_OUTPUT_HISTORY})`);
      }
    });

    // /pwd - Quick working directory check
    this.bot.command('pwd', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      await ctx.reply(`📂 ${session.workingDir}`);
    });

    // /git - Common git operations
    this.bot.command('git', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      const subcommand = args[0]?.toLowerCase();
      const execAsync = promisify(exec);

      try {
        let gitCommand: string;
        let description: string;

        switch (subcommand) {
          case 'status':
          case 's':
            gitCommand = 'git status --short';
            description = 'Git Status';
            break;
          case 'branch':
          case 'b':
            gitCommand = 'git branch -vv';
            description = 'Git Branches';
            break;
          case 'log':
          case 'l':
            const logCount = parseInt(args[1], 10) || 10;
            gitCommand = `git log --oneline -${logCount}`;
            description = `Last ${logCount} Commits`;
            break;
          case 'stash':
            gitCommand = 'git stash list';
            description = 'Git Stashes';
            break;
          case 'remote':
            gitCommand = 'git remote -v';
            description = 'Git Remotes';
            break;
          default:
            await ctx.reply(
              'Git Quick Commands:\n\n' +
              '/git status (s) - Short status\n' +
              '/git branch (b) - List branches\n' +
              '/git log [n] (l) - Recent commits\n' +
              '/git stash - List stashes\n' +
              '/git remote - List remotes\n\n' +
              'For full git operations, use /diff or send git commands to Claude.'
            );
            return;
        }

        const { stdout, stderr } = await execAsync(gitCommand, {
          cwd: session.workingDir,
          maxBuffer: 1024 * 1024,
        });

        const output = stdout || stderr || '(no output)';
        const maxLength = 4000;
        const truncated = output.length > maxLength;
        const displayContent = truncated
          ? output.slice(0, maxLength) + '\n...(truncated)'
          : output;

        await ctx.reply(`📊 ${description}\n\n\`\`\`\n${displayContent}\n\`\`\``, { parse_mode: 'Markdown' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Git command failed';
        if (message.includes('not a git repository')) {
          await ctx.reply('Error: Working directory is not a git repository.');
        } else {
          await ctx.reply(`Error: ${message}`);
        }
      }
    });

    // /tree - Directory tree view
    this.bot.command('tree', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      const maxDepth = Math.min(parseInt(args[0], 10) || 2, 5); // Default depth 2, max 5
      const targetPath = args[1] || '.';

      try {
        const fullPath = path.isAbsolute(targetPath)
          ? targetPath
          : path.join(session.workingDir, targetPath);

        // Security check
        const resolvedPath = path.resolve(fullPath);
        const resolvedWorkingDir = path.resolve(session.workingDir);
        if (!resolvedPath.startsWith(resolvedWorkingDir) && resolvedPath !== resolvedWorkingDir) {
          await ctx.reply('Error: Cannot access directories outside the session working directory.');
          return;
        }

        const tree = this.buildDirectoryTree(resolvedPath, maxDepth, 0);
        const maxLength = 4000;
        const truncated = tree.length > maxLength;
        const displayContent = truncated
          ? tree.slice(0, maxLength) + '\n...(truncated)'
          : tree;

        await ctx.reply(
          `🌳 Directory Tree (depth ${maxDepth})\n\n\`\`\`\n${displayContent}\n\`\`\``,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to build tree';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /bookmark - Save/recall prompts
    this.bot.command('bookmark', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const args = ctx.message.text.split(' ').slice(1);
      const subcommand = args[0]?.toLowerCase();

      // Get or create user's bookmarks
      if (!this.userBookmarks.has(userId)) {
        this.userBookmarks.set(userId, new Map());
      }
      const bookmarks = this.userBookmarks.get(userId)!;

      if (!subcommand) {
        // Show usage
        await ctx.reply(
          'Bookmark Commands:\n\n' +
          '/bookmark list - Show all bookmarks\n' +
          '/bookmark save <name> <prompt> - Save a prompt\n' +
          '/bookmark <name> - Send saved prompt to Claude\n' +
          '/bookmark delete <name> - Delete a bookmark\n\n' +
          `You have ${bookmarks.size} saved bookmarks.`
        );
        return;
      }

      if (subcommand === 'list') {
        if (bookmarks.size === 0) {
          await ctx.reply('No bookmarks saved. Use /bookmark save <name> <prompt>');
          return;
        }

        let list = '📑 Your Bookmarks:\n\n';
        for (const [name, prompt] of bookmarks) {
          const preview = prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt;
          list += `• *${name}*: ${preview}\n`;
        }
        await ctx.reply(list, { parse_mode: 'Markdown' });
        return;
      }

      if (subcommand === 'save') {
        const name = args[1];
        const prompt = args.slice(2).join(' ');

        if (!name || !prompt) {
          await ctx.reply('Usage: /bookmark save <name> <prompt>');
          return;
        }

        bookmarks.set(name, prompt);
        await ctx.reply(`✅ Bookmark "${name}" saved.`);
        return;
      }

      if (subcommand === 'delete') {
        const name = args[1];
        if (!name) {
          await ctx.reply('Usage: /bookmark delete <name>');
          return;
        }

        if (bookmarks.delete(name)) {
          await ctx.reply(`🗑️ Bookmark "${name}" deleted.`);
        } else {
          await ctx.reply(`Bookmark "${name}" not found.`);
        }
        return;
      }

      // Try to use as bookmark name
      const savedPrompt = bookmarks.get(subcommand);
      if (savedPrompt) {
        try {
          this.sessionManager.sendToActiveSession(savedPrompt);
          await ctx.reply(`📤 Sent bookmark "${subcommand}" to Claude.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No active session';
          await ctx.reply(`Error: ${message}. Use /new to create a session.`);
        }
      } else {
        await ctx.reply(`Bookmark "${subcommand}" not found. Use /bookmark list to see available bookmarks.`);
      }
    });

    // /context - Show conversation context size
    this.bot.command('context', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      if (this.lastContextInfo.tokens) {
        const pct = this.lastContextInfo.percentage ? `(${this.lastContextInfo.percentage}%)` : '';
        const ago = this.lastContextInfo.timestamp
          ? Math.round((Date.now() - this.lastContextInfo.timestamp.getTime()) / 1000)
          : 0;

        await ctx.reply(
          `📊 Context Usage\n\n` +
          `Tokens: ~${this.lastContextInfo.tokens.toLocaleString()} ${pct}\n` +
          `Last updated: ${ago}s ago\n\n` +
          `Send a message to Claude to update context info.`
        );
      } else {
        await ctx.reply(
          'Context information not yet available.\n' +
          'Send a message to Claude and context info will be captured from the output.'
        );
      }
    });

    // /cost - Send /cost to Claude and format results
    this.bot.command('cost', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      try {
        await ctx.reply('💰 Fetching cost information from Claude...');

        // Set up a callback to capture the response
        this.pendingCostCallback = (response: string) => {
          this.formatAndSendCostInfo(ctx.chat.id, response);
        };

        // Send /cost to Claude
        this.sessionManager.sendToActiveSession('/cost');

        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.pendingCostCallback) {
            this.pendingCostCallback = null;
            ctx.reply('Timeout waiting for cost information. Claude may still be processing.').catch(() => {});
          }
        }, 10000);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get cost info';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // /babysit - Alias for /babysitter:call (forwards to Claude as skill)
    this.bot.command('babysit', async (ctx) => {
      const session = this.sessionManager.getActiveSession();
      if (!session) {
        await ctx.reply('No active session. Use /new to create one.');
        return;
      }

      try {
        // Get any arguments after /babysit
        const args = ctx.message.text.replace(/^\/babysit\s*/, '').trim();

        // Forward to Claude as /babysitter:call with the same arguments
        const fullCommand = args ? `/babysitter:call ${args}` : '/babysitter:call';
        this.sessionManager.sendToActiveSession(fullCommand);

        await ctx.reply('🤹 Sent to the Babysitter.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send to Babysitter';
        await ctx.reply(`Error: ${message}`);
      }
    });
  }

  /**
   * Build a directory tree string
   */
  private buildDirectoryTree(dirPath: string, maxDepth: number, currentDepth: number, prefix = ''): string {
    if (currentDepth > maxDepth) return '';

    const entries: string[] = [];
    try {
      const items = fs.readdirSync(dirPath);

      // Filter out common ignored directories
      const ignored = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.cache', '__pycache__', '.venv', 'venv']);
      const filtered = items.filter(item => !ignored.has(item) && !item.startsWith('.'));

      // Sort: directories first, then files
      const sorted = filtered.sort((a, b) => {
        const aIsDir = fs.statSync(path.join(dirPath, a)).isDirectory();
        const bIsDir = fs.statSync(path.join(dirPath, b)).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

      // Limit entries to avoid huge outputs
      const maxEntries = 50;
      const limited = sorted.slice(0, maxEntries);
      const hasMore = sorted.length > maxEntries;

      for (let i = 0; i < limited.length; i++) {
        const item = limited[i];
        const itemPath = path.join(dirPath, item);
        const isLast = i === limited.length - 1 && !hasMore;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        try {
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            entries.push(`${prefix}${connector}📁 ${item}/`);
            if (currentDepth < maxDepth) {
              const subtree = this.buildDirectoryTree(itemPath, maxDepth, currentDepth + 1, prefix + childPrefix);
              if (subtree) entries.push(subtree);
            }
          } else {
            entries.push(`${prefix}${connector}📄 ${item}`);
          }
        } catch {
          entries.push(`${prefix}${connector}❓ ${item} (inaccessible)`);
        }
      }

      if (hasMore) {
        entries.push(`${prefix}└── ... and ${sorted.length - maxEntries} more`);
      }
    } catch (error) {
      return `${prefix}(error reading directory)`;
    }

    return entries.join('\n');
  }

  /**
   * Format and send cost information to user
   */
  private async formatAndSendCostInfo(chatId: number, response: string): Promise<void> {
    try {
      // Parse the cost response from Claude
      // Typical format includes session cost, total cost, token usage
      const lines = response.split('\n').filter(l => l.trim());

      let formatted = '💰 *Cost Summary*\n\n';

      // Look for common patterns in cost output
      // Match formats like "Session: $0.15", "Session cost: $0.15", "session $0.15"
      const sessionCostMatch = response.match(/session\s*(?:cost)?[:\s]+\$?([\d.]+)/i);
      const totalCostMatch = response.match(/total\s*(?:cost)?[:\s]+\$?([\d.]+)/i);
      const inputTokensMatch = response.match(/input[:\s]+([\d,]+)\s*tokens?/i);
      const outputTokensMatch = response.match(/output[:\s]+([\d,]+)\s*tokens?/i);

      if (sessionCostMatch) {
        formatted += `Session: $${sessionCostMatch[1]}\n`;
      }
      if (totalCostMatch) {
        formatted += `Total: $${totalCostMatch[1]}\n`;
      }
      if (inputTokensMatch || outputTokensMatch) {
        formatted += '\nTokens:\n';
        if (inputTokensMatch) formatted += `  Input: ${inputTokensMatch[1]}\n`;
        if (outputTokensMatch) formatted += `  Output: ${outputTokensMatch[1]}\n`;
      }

      // If we couldn't parse structured data, just show the raw response
      if (!sessionCostMatch && !totalCostMatch && !inputTokensMatch) {
        formatted = '💰 Cost Information:\n\n' + response.slice(0, 2000);
      }

      await this.bot.telegram.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
    } catch (error) {
      // Fallback to plain text
      await this.bot.telegram.sendMessage(chatId, `💰 Cost Information:\n\n${response.slice(0, 2000)}`);
    }
  }

  /**
   * Set up callback query handlers for inline buttons
   */
  private setupCallbackHandlers(): void {
    // Handle answer selections
    this.bot.action(/^answer:(.+)$/, async (ctx) => {
      const match = ctx.match;
      if (!match) return;

      const selection = match[1];
      const chatId = ctx.chat?.id;

      if (!chatId) {
        await ctx.answerCbQuery('Error: Could not identify chat');
        return;
      }

      try {
        if (selection === 'custom') {
          // User wants to type custom response
          this.awaitingCustomInput.add(chatId);
          await ctx.answerCbQuery('Type your custom response');
          await ctx.reply('Please type your custom response:');
        } else {
          // User selected a numbered option
          const optionIndex = parseInt(selection, 10);
          const question = this.pendingQuestions.get(chatId);

          if (question && question.options[optionIndex]) {
            const selectedOption = question.options[optionIndex];

            // Resume normal message forwarding now that user has responded
            this.waitingForUserResponse = false;
            console.log('[Answer] User responded, resuming message forwarding');

            // Send the answer as a new message to Claude using --resume
            // This continues the conversation with the user's answer
            console.log(`[Answer] Sending answer as new message: "${selectedOption.label}"`);
            this.sessionManager.sendToActiveSession(selectedOption.label);

            await ctx.answerCbQuery(`Selected: ${selectedOption.label}`);
            await ctx.editMessageText(
              `You selected: *${selectedOption.label}*`,
              { parse_mode: 'Markdown' }
            );

            // Clear pending question
            this.pendingQuestions.delete(chatId);
          } else {
            await ctx.answerCbQuery('Invalid selection');
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error processing selection';
        await ctx.answerCbQuery(message);
      }
    });
  }

  /**
   * Check if a message is a bot command (vs a Claude skill invocation)
   */
  private isBotCommand(text: string): boolean {
    if (!text.startsWith('/')) return false;

    // Extract command name from "/command" or "/command@botname" or "/command args"
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    if (!match) return false;

    const commandName = match[1].toLowerCase();
    return BOT_COMMANDS.has(commandName);
  }

  /**
   * Set up message handlers for text input
   */
  private setupMessageHandlers(): void {
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // Input length validation - security hardening (REM-005)
      if (text.length > TelegramBot.MAX_MESSAGE_LENGTH) {
        await ctx.reply(
          `Message too long (${text.length} chars). Maximum allowed: ${TelegramBot.MAX_MESSAGE_LENGTH} characters.`
        );
        return;
      }

      // Skip only if it's a registered bot command (like /new, /list, etc.)
      // Other slash commands (like /babysitter:call, /commit) are Claude skills
      // and should be forwarded to Claude
      if (this.isBotCommand(text)) return;

      const chatId = ctx.chat.id;

      try {
        // Check if we're awaiting custom input for a question
        if (this.awaitingCustomInput.has(chatId)) {
          this.awaitingCustomInput.delete(chatId);
          this.pendingQuestions.delete(chatId);

          // Resume normal message forwarding now that user has responded
          this.waitingForUserResponse = false;
          console.log('[CustomAnswer] User responded, resuming message forwarding');

          // Send custom response as a new message to Claude
          console.log(`[CustomAnswer] Sending as new message: "${text}"`);
          this.sessionManager.sendToActiveSession(text);
          await ctx.reply(`Sent: "${text}"`);
        } else {
          // If user sends a new message while a question was pending, clear the waiting state
          // This handles the case where user ignores the question and sends something else
          if (this.waitingForUserResponse) {
            console.log('[Message] User sent new message, clearing pending question state');
            this.waitingForUserResponse = false;
            this.pendingQuestions.delete(chatId);
          }

          // Send to Claude session
          this.sessionManager.sendToActiveSession(text);

          // Provide appropriate feedback based on what was sent
          if (text.startsWith('/babysitter:call')) {
            await ctx.reply('🤹 Sent to the Babysitter.');
          } else {
            await ctx.reply('Sent to Claude session.');
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No active session';
        await ctx.reply(`Error: ${message}. Use /new to create a session.`);
      }
    });

    // Handle voice messages
    this.bot.on('voice', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Check if voice is enabled for this user
      const voiceEnabled = this.userVoiceEnabled.get(userId) ?? this.voiceConfig.enabled;
      if (!voiceEnabled || !this.voiceHandler) {
        await ctx.reply(
          'Voice transcription is disabled.\n' +
          'Use /voice on to enable it.'
        );
        return;
      }

      try {
        await ctx.reply('Transcribing voice message...');

        const voice = ctx.message.voice;
        const file = await ctx.telegram.getFile(voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${this.bot.telegram.token}/${file.file_path}`;

        // Download the file as a buffer
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Transcribe
        const transcribedText = await this.voiceHandler.transcribe(buffer, voice.file_id);

        if (!transcribedText || transcribedText.trim().length === 0) {
          await ctx.reply('Could not transcribe voice message (no speech detected).');
          return;
        }

        await ctx.reply(`Transcribed: "${transcribedText}"\n\nSending to Claude...`);

        // Send to Claude session
        this.sessionManager.sendToActiveSession(transcribedText);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transcription failed';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // Handle document uploads
    this.bot.on('document', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Check if upload is enabled for this user
      const uploadEnabled = this.userUploadEnabled.get(userId) ?? this.fileUploadConfig.enabled;
      if (!uploadEnabled || !this.fileHandler) {
        await ctx.reply(
          'File upload is disabled.\n' +
          'Use /upload on to enable it.'
        );
        return;
      }

      try {
        const doc = ctx.message.document;
        const fileName = doc.file_name || 'unknown';
        const mimeType = doc.mime_type || 'application/octet-stream';
        const fileSize = doc.file_size || 0;

        // Validate file
        const validation = this.fileHandler.validateFile(fileName, mimeType, fileSize);
        if (!validation.valid) {
          await ctx.reply(`Cannot process file: ${validation.reason}`);
          return;
        }

        await ctx.reply(`Processing file: ${fileName}...`);

        // Download the file
        const file = await ctx.telegram.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${this.bot.telegram.token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Save the file
        const fileInfo = await this.fileHandler.saveFile(buffer, fileName, mimeType, doc.file_id);

        // Determine how to send to Claude
        let messageToSend: string;
        const caption = ctx.message.caption || '';

        if (this.fileHandler.isTextFile(mimeType, fileInfo.extension)) {
          // Read text content and send it
          const content = await this.fileHandler.readFileAsText(fileInfo.localPath);
          messageToSend = `File: ${fileName}\n\n\`\`\`\n${content}\n\`\`\`\n\n${caption}`.trim();
        } else if (this.fileHandler.isImage(mimeType)) {
          // For images, send the path
          messageToSend = `[Image uploaded: ${fileInfo.localPath}]\n\n${caption}`.trim();
        } else {
          // For other files, send the path
          messageToSend = `[File uploaded: ${fileInfo.localPath}]\n\n${caption}`.trim();
        }

        await ctx.reply(`Sending to Claude: ${fileName}`);
        this.sessionManager.sendToActiveSession(messageToSend);

        // Clean up the file after a delay
        setTimeout(() => {
          this.fileHandler?.deleteFile(fileInfo.localPath);
        }, 60000); // 1 minute
      } catch (error) {
        const message = error instanceof Error ? error.message : 'File processing failed';
        await ctx.reply(`Error: ${message}`);
      }
    });

    // Handle photo uploads
    this.bot.on('photo', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      // Check if upload is enabled for this user
      const uploadEnabled = this.userUploadEnabled.get(userId) ?? this.fileUploadConfig.enabled;
      if (!uploadEnabled || !this.fileHandler) {
        await ctx.reply(
          'File upload is disabled.\n' +
          'Use /upload on to enable it.'
        );
        return;
      }

      try {
        // Get the largest photo (last in array)
        const photos = ctx.message.photo;
        const largestPhoto = photos[photos.length - 1];

        await ctx.reply('Processing image...');

        // Download the photo
        const file = await ctx.telegram.getFile(largestPhoto.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${this.bot.telegram.token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Determine file name and extension from file path
        const extension = file.file_path?.split('.').pop() || 'jpg';
        const fileName = `photo_${Date.now()}.${extension}`;
        const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

        // Save the file
        const fileInfo = await this.fileHandler.saveFile(buffer, fileName, mimeType, largestPhoto.file_id);

        // Send to Claude with the image path
        const caption = ctx.message.caption || 'Please analyze this image.';
        const messageToSend = `[Image uploaded: ${fileInfo.localPath}]\n\n${caption}`;

        await ctx.reply('Sending image to Claude...');
        this.sessionManager.sendToActiveSession(messageToSend);

        // Clean up the file after a delay
        setTimeout(() => {
          this.fileHandler?.deleteFile(fileInfo.localPath);
        }, 60000); // 1 minute
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image processing failed';
        await ctx.reply(`Error: ${message}`);
      }
    });
  }

  /**
   * Set up output forwarding from Claude sessions
   */
  private setupOutputForwarding(): void {
    // Listen for questions from OutputParser
    this.outputParser.on('question', (question: ParsedQuestion) => {
      console.log('[OutputParser] Question event received:', question.question.substring(0, 50));
      // Set flag to suppress subsequent messages until user responds
      this.waitingForUserResponse = true;
      this.suppressedMessages = []; // Clear any previously suppressed messages
      this.forwardQuestionToUsers(question);
    });

    // Listen for text output (accumulated from streaming deltas)
    this.outputParser.on('text', (text: string) => {
      // Skip if waiting for user to respond to a question
      if (this.waitingForUserResponse) {
        console.log('[OutputParser] Suppressing text while waiting for user response');
        // Optionally buffer important messages (but for now, just log)
        if (text && text.trim()) {
          this.suppressedMessages.push(text.trim());
        }
        return;
      }

      // Forward assistant text messages to users
      if (text && text.trim()) {
        this.forwardTextToUsers(text);
      }
    });

    // Listen for progress events (tool executions)
    // Only show failures to reduce noise - successes are implied
    this.outputParser.on('progress', (progress: { type: string; toolName?: string; success?: boolean }) => {
      // Skip if waiting for user to respond to a question
      if (this.waitingForUserResponse) {
        console.log('[OutputParser] Suppressing progress while waiting for user response');
        return;
      }

      if (progress.type === 'tool_end' && !progress.success) {
        this.forwardProgressToUsers('❌ Tool execution failed');
      }
      // Skip tool_start and success messages to reduce noise
    });

    // Skip thinking events - they add too much noise
    // this.outputParser.on('thinking', () => { ... });

    // Skip 'started' event - the user knows they sent a message
    // this.outputParser.on('started', () => { ... });
  }

  /**
   * Subscribe to a session's output and pipe it to the OutputParser
   */
  private subscribeToSessionOutput(sessionId: string): void {
    // Unsubscribe from any previous subscription for this session
    this.unsubscribeFromSession(sessionId);

    try {
      // Get the session's process output and pipe it to the parser
      // NOTE: ClaudeCodeProcess emits lines WITHOUT trailing newlines,
      // but OutputParser.parseStreamOutput() buffers and splits by '\n',
      // so we must add the newline for lines to be processed.
      const unsubscribe = this.sessionManager.onSessionOutput(sessionId, (data: string) => {
        // Store in output history for /log command
        this.addToOutputHistory(data);

        // Check for context info in the output
        this.parseContextInfo(data);

        // Check for cost info if we're waiting for it
        if (this.pendingCostCallback && data.includes('$')) {
          this.pendingCostCallback(data);
          this.pendingCostCallback = null;
        }

        this.outputParser.parseStreamOutput(data + '\n');
      });
      this.outputUnsubscribers.set(sessionId, unsubscribe);

      // Subscribe to error events
      const errorUnsubscribe = this.sessionManager.onSessionError(sessionId, (error: Error) => {
        this.forwardErrorToUsers(error.message);
      });
      this.errorUnsubscribers.set(sessionId, errorUnsubscribe);

      // Subscribe to close events with auto-reconnect notification
      const closeUnsubscribe = this.sessionManager.onSessionClose(sessionId, (code: number | null) => {
        if (code !== 0 && code !== null) {
          this.forwardErrorToUsers(`Session crashed (exit code: ${code}) - use /new to restart`);
          // Auto-reconnect notification: inform user about the crash
          this.notifySessionCrash(sessionId, code);
        } else {
          this.forwardStatusToUsers('Session ended gracefully');
        }
      });
      this.closeUnsubscribers.set(sessionId, closeUnsubscribe);
    } catch (error) {
      console.error(`Failed to subscribe to session ${sessionId} output:`, error);
    }
  }

  /**
   * Add a line to output history for /log command
   */
  private addToOutputHistory(line: string): void {
    if (!line || line.trim().length === 0) return;

    this.outputHistory.push(line);

    // Keep only last N lines
    if (this.outputHistory.length > TelegramBot.MAX_OUTPUT_HISTORY) {
      this.outputHistory.shift();
    }
  }

  /**
   * Parse context information from Claude output
   */
  private parseContextInfo(text: string): void {
    // Look for context usage patterns like "Context: 45,000 tokens (23%)"
    const contextMatch = text.match(/context[:\s]+([\d,]+)\s*tokens?\s*\(?([\d.]+)?%?\)?/i);
    if (contextMatch) {
      this.lastContextInfo = {
        tokens: parseInt(contextMatch[1].replace(/,/g, ''), 10),
        percentage: contextMatch[2] ? parseFloat(contextMatch[2]) : undefined,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Notify users about session crash (auto-reconnect feature)
   */
  private async notifySessionCrash(sessionId: string, exitCode: number): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    const sessionName = session?.name || sessionId;

    const message = `🔄 Session "${sessionName}" crashed (exit code: ${exitCode}).\n\n` +
      `Options:\n` +
      `• /new ${sessionName} - Create new session\n` +
      `• /sessions - View and attach to existing Claude sessions`;

    for (const [_userId, chatId] of this.userChatIds.entries()) {
      try {
        await this.bot.telegram.sendMessage(chatId, message);
      } catch (error) {
        console.error(`Failed to send crash notification to chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Unsubscribe from a session's output
   */
  private unsubscribeFromSession(sessionId: string): void {
    const unsubscribe = this.outputUnsubscribers.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      this.outputUnsubscribers.delete(sessionId);
    }

    const errorUnsubscribe = this.errorUnsubscribers.get(sessionId);
    if (errorUnsubscribe) {
      errorUnsubscribe();
      this.errorUnsubscribers.delete(sessionId);
    }

    const closeUnsubscribe = this.closeUnsubscribers.get(sessionId);
    if (closeUnsubscribe) {
      closeUnsubscribe();
      this.closeUnsubscribers.delete(sessionId);
    }
  }

  /**
   * Forward text output to all connected users with message batching
   */
  private async forwardTextToUsers(text: string): Promise<void> {

    // Skip empty or very short messages
    if (!text || text.trim().length === 0) {
      return;
    }

    for (const [userId, chatId] of this.userChatIds.entries()) {
      try {
        // Check verbosity - minimal level skips text output
        const verbosity = this.userVerbosityLevel.get(userId) ?? this.defaultVerbosity;
        if (verbosity === 'minimal') {
          continue;
        }

        // Check notification preferences
        const prefs = this.userNotificationPrefs.get(userId) ?? this.defaultNotificationPrefs;
        if (!prefs.completion) {
          continue;
        }

        // Use message batching to reduce message spam
        this.batchMessage(chatId, text);
      } catch (error) {
        console.error(`Failed to queue text for chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Add message to batch buffer and schedule flush
   */
  private batchMessage(chatId: number, text: string): void {
    // Get or create buffer for this chat
    if (!this.messageBatchBuffer.has(chatId)) {
      this.messageBatchBuffer.set(chatId, []);
    }
    const buffer = this.messageBatchBuffer.get(chatId)!;
    buffer.push(text);

    // Clear existing timer if any
    const existingTimer = this.messageBatchTimer.get(chatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set timer to flush buffer
    const timer = setTimeout(() => {
      this.flushMessageBatch(chatId);
    }, TelegramBot.BATCH_DELAY_MS);
    this.messageBatchTimer.set(chatId, timer);
  }

  /**
   * Flush batched messages for a chat
   */
  private async flushMessageBatch(chatId: number): Promise<void> {
    const buffer = this.messageBatchBuffer.get(chatId);
    if (!buffer || buffer.length === 0) return;

    // Clear buffer and timer
    this.messageBatchBuffer.delete(chatId);
    this.messageBatchTimer.delete(chatId);

    // Combine messages
    const combined = buffer.join('\n');

    // Truncate if too long
    const maxLength = 4000;
    const truncatedText = combined.length > maxLength
      ? combined.slice(0, maxLength) + '\n...(truncated)'
      : combined;

    // Check rate limit
    const lastTime = this.lastMessageTime.get(chatId) || 0;
    const now = Date.now();
    const timeSinceLast = now - lastTime;

    if (timeSinceLast < TelegramBot.RATE_LIMIT_MS) {
      // Queue the message for later
      this.queueMessage(chatId, truncatedText);
      return;
    }

    // Send immediately
    await this.sendMessageWithRateLimit(chatId, truncatedText);
  }

  /**
   * Queue a message for later sending (when rate limited)
   */
  private queueMessage(chatId: number, message: string): void {
    // Don't queue if already at max
    if (this.messageQueue.length >= TelegramBot.MAX_QUEUE_SIZE) {
      console.warn(`Message queue full, dropping message for chat ${chatId}`);
      return;
    }

    this.messageQueue.push({ chatId, message, timestamp: Date.now() });

    // Start processing queue if not already
    if (!this.isProcessingQueue) {
      this.processMessageQueue();
    }
  }

  /**
   * Process queued messages respecting rate limits
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift()!;
      const lastTime = this.lastMessageTime.get(item.chatId) || 0;
      const now = Date.now();
      const timeSinceLast = now - lastTime;

      if (timeSinceLast < TelegramBot.RATE_LIMIT_MS) {
        // Wait for rate limit to clear
        const waitTime = TelegramBot.RATE_LIMIT_MS - timeSinceLast;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      await this.sendMessageWithRateLimit(item.chatId, item.message);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Send message and track rate limit
   */
  private async sendMessageWithRateLimit(chatId: number, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, text);
      this.lastMessageTime.set(chatId, Date.now());
    } catch (error) {
      console.error(`Failed to send message to chat ${chatId}:`, error);
    }
  }

  /**
   * Forward error messages to all connected users with emoji indicator
   */
  private async forwardErrorToUsers(errorMessage: string): Promise<void> {
    if (!errorMessage || errorMessage.trim().length === 0) {
      return;
    }

    const formattedError = `⚠️ ${errorMessage}`;

    for (const [userId, chatId] of this.userChatIds.entries()) {
      try {
        // Check notification preferences
        const prefs = this.userNotificationPrefs.get(userId) ?? this.defaultNotificationPrefs;
        if (!prefs.error) {
          continue;
        }

        await this.bot.telegram.sendMessage(chatId, formattedError);
      } catch (error) {
        console.error(`Failed to send error to chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Forward status messages to all connected users with emoji indicator
   */
  private async forwardStatusToUsers(statusMessage: string): Promise<void> {
    if (!statusMessage || statusMessage.trim().length === 0) {
      return;
    }

    const formattedStatus = `ℹ️ ${statusMessage}`;

    for (const [_userId, chatId] of this.userChatIds.entries()) {
      try {
        await this.bot.telegram.sendMessage(chatId, formattedStatus);
      } catch (error) {
        console.error(`Failed to send status to chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Forward progress messages to all connected users (tool execution progress)
   */
  private async forwardProgressToUsers(progressMessage: string): Promise<void> {
    if (!progressMessage || progressMessage.trim().length === 0) {
      return;
    }

    for (const [userId, chatId] of this.userChatIds.entries()) {
      try {
        // Check verbosity - only verbose level shows progress
        const verbosity = this.userVerbosityLevel.get(userId) ?? this.defaultVerbosity;
        if (verbosity !== 'verbose') {
          continue;
        }

        // Check notification preferences
        const prefs = this.userNotificationPrefs.get(userId) ?? this.defaultNotificationPrefs;
        if (!prefs.progress) {
          continue;
        }

        await this.bot.telegram.sendMessage(chatId, progressMessage);
      } catch (error) {
        console.error(`Failed to send progress to chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Forward a question to all connected users
   */
  private async forwardQuestionToUsers(question: ParsedQuestion): Promise<void> {
    console.log(`[Question] Detected question: "${question.question.substring(0, 50)}..."`);
    console.log(`[Question] Connected users: ${this.userChatIds.size}`);

    if (this.userChatIds.size === 0) {
      console.warn('[Question] No users connected to receive the question!');
      return;
    }

    const formatted = this.outputParser.formatForTelegram(question);

    for (const [userId, chatId] of this.userChatIds.entries()) {
      try {
        console.log(`[Question] Sending to user ${userId} (chat ${chatId})`);
        // Store pending question for this chat
        this.pendingQuestions.set(chatId, question);

        await this.bot.telegram.sendMessage(chatId, formatted.text, {
          parse_mode: formatted.parseMode,
          reply_markup: formatted.replyMarkup,
        });
        console.log(`[Question] Successfully sent to chat ${chatId}`);
      } catch (error) {
        console.error(`Failed to send question to chat ${chatId}:`, error);
      }
    }
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    console.log('Starting Telegram bot...');
    await this.bot.launch();
    console.log('Telegram bot started successfully');

    // Enable graceful stop
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    console.log('Stopping Telegram bot...');

    // Close all sessions
    const sessions = this.sessionManager.listSessions();
    for (const session of sessions) {
      try {
        await this.sessionManager.closeSession(session.id);
      } catch (error) {
        console.error(`Error closing session ${session.id}:`, error);
      }
    }

    this.bot.stop('SIGTERM');
    console.log('Telegram bot stopped');
  }

  /**
   * Get the underlying Telegraf instance (for testing)
   */
  getBot(): Telegraf {
    return this.bot;
  }

  /**
   * Get the session manager (for testing)
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the output parser (for testing)
   */
  getOutputParser(): OutputParser {
    return this.outputParser;
  }

  /**
   * Check if a user is authorized
   */
  isUserAuthorized(userId: number): boolean {
    return this.allowedUsers.has(userId);
  }
}
