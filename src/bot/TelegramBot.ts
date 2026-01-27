import { Telegraf, Context } from 'telegraf';
import type { Update, Message } from 'telegraf/types';
import type {
  TelegramBotConfig,
  ParsedQuestion,
  Session,
  TelegramFormattedMessage,
} from '../types/index.js';
import { SessionManager } from '../session/SessionManager.js';
import { OutputParser } from '../parser/OutputParser.js';

type TextContext = Context<Update.MessageUpdate<Message.TextMessage>>;
type CallbackContext = Context<Update.CallbackQueryUpdate>;

/**
 * Telegram bot for remote Claude Code operation
 */
export class TelegramBot {
  private bot: Telegraf;
  private sessionManager: SessionManager;
  private outputParser: OutputParser;
  private allowedUsers: Set<number>;
  private userChatIds: Map<number, number> = new Map(); // userId -> chatId
  private pendingQuestions: Map<number, ParsedQuestion> = new Map(); // chatId -> question
  private awaitingCustomInput: Set<number> = new Set(); // chatIds awaiting custom input
  private outputUnsubscribers: Map<string, () => void> = new Map(); // sessionId -> unsubscribe function
  private errorUnsubscribers: Map<string, () => void> = new Map(); // sessionId -> error unsubscribe
  private closeUnsubscribers: Map<string, () => void> = new Map(); // sessionId -> close unsubscribe
  private lastThinkingMessageTime = 0; // Debounce thinking messages
  private static readonly THINKING_DEBOUNCE_MS = 5000; // 5 seconds debounce

  constructor(config: TelegramBotConfig) {
    this.bot = new Telegraf(config.token);
    this.sessionManager = new SessionManager(config.sessionManagerConfig);
    this.outputParser = new OutputParser();
    this.allowedUsers = new Set(config.allowedUserIds);

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
        this.userChatIds.set(userId, ctx.chat.id);
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
        'Welcome to Claude Code Bot!\n\n' +
          'Commands:\n' +
          '/new <name> [dir] - Create new session\n' +
          '/cd <path> - Change directory\n' +
          '/list - List all sessions\n' +
          '/switch <id> - Switch to session\n' +
          '/close <id> - Close session\n' +
          '/status - Current session info\n' +
          '/help - Show this message\n\n' +
          'Send any text to interact with the active Claude session.'
      );
    });

    // /help - Show help
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Claude Code Bot Commands:\n\n' +
          '/new <name> [workingDir] - Create a new Claude Code session\n' +
          '/cd <path> - Change working directory of current session\n' +
          '/list - List all active sessions\n' +
          '/switch <sessionId> - Switch to a different session\n' +
          '/close <sessionId> - Close and terminate a session\n' +
          '/status - Show current session details\n' +
          '/abort - Abort current Claude operation\n\n' +
          'When Claude asks questions, use the inline buttons or type a custom response.'
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

            // Send the selection to Claude
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
   * Set up message handlers for text input
   */
  private setupMessageHandlers(): void {
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;

      // Skip if it's a command
      if (text.startsWith('/')) return;

      const chatId = ctx.chat.id;

      try {
        // Check if we're awaiting custom input for a question
        if (this.awaitingCustomInput.has(chatId)) {
          this.awaitingCustomInput.delete(chatId);
          this.pendingQuestions.delete(chatId);

          // Send custom response to Claude
          this.sessionManager.sendToActiveSession(text);
          await ctx.reply(`Sent: "${text}"`);
        } else {
          // Regular prompt to Claude
          this.sessionManager.sendToActiveSession(text);
          await ctx.reply('Sent to Claude session.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No active session';
        await ctx.reply(`Error: ${message}. Use /new to create a session.`);
      }
    });
  }

  /**
   * Set up output forwarding from Claude sessions
   */
  private setupOutputForwarding(): void {
    // Listen for questions from OutputParser
    this.outputParser.on('question', (question: ParsedQuestion) => {
      this.forwardQuestionToUsers(question);
    });

    // Listen for text output (accumulated from streaming deltas)
    this.outputParser.on('text', (text: string) => {
      // Forward assistant text messages to users
      if (text && text.trim()) {
        this.forwardTextToUsers(text);
      }
    });

    // Listen for progress events (tool executions)
    this.outputParser.on('progress', (progress: { type: string; toolName?: string; success?: boolean }) => {
      if (progress.type === 'tool_start' && progress.toolName) {
        this.forwardProgressToUsers(`🔧 Running: ${progress.toolName}`);
      } else if (progress.type === 'tool_end') {
        if (progress.success) {
          this.forwardProgressToUsers('✅ Done');
        } else {
          this.forwardProgressToUsers('❌ Failed');
        }
      }
    });

    // Listen for thinking events (debounced)
    this.outputParser.on('thinking', () => {
      const now = Date.now();
      if (now - this.lastThinkingMessageTime >= TelegramBot.THINKING_DEBOUNCE_MS) {
        this.lastThinkingMessageTime = now;
        this.forwardProgressToUsers('💭 Thinking...');
      }
    });
  }

  /**
   * Subscribe to a session's output and pipe it to the OutputParser
   */
  private subscribeToSessionOutput(sessionId: string): void {
    // Unsubscribe from any previous subscription for this session
    this.unsubscribeFromSession(sessionId);

    try {
      // Get the session's process output and pipe it to the parser
      const unsubscribe = this.sessionManager.onSessionOutput(sessionId, (data: string) => {
        this.outputParser.parseStreamOutput(data);
      });
      this.outputUnsubscribers.set(sessionId, unsubscribe);

      // Subscribe to error events
      const errorUnsubscribe = this.sessionManager.onSessionError(sessionId, (error: Error) => {
        this.forwardErrorToUsers(error.message);
      });
      this.errorUnsubscribers.set(sessionId, errorUnsubscribe);

      // Subscribe to close events
      const closeUnsubscribe = this.sessionManager.onSessionClose(sessionId, (code: number | null) => {
        if (code !== 0 && code !== null) {
          this.forwardErrorToUsers(`Session crashed (exit code: ${code}) - use /new to restart`);
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
   * Forward text output to all connected users
   */
  private async forwardTextToUsers(text: string): Promise<void> {
    // Skip empty or very short messages
    if (!text || text.trim().length === 0) {
      return;
    }

    // Truncate very long messages
    const maxLength = 4000;
    const truncatedText = text.length > maxLength
      ? text.slice(0, maxLength) + '\n...(truncated)'
      : text;

    for (const [_userId, chatId] of this.userChatIds.entries()) {
      try {
        await this.bot.telegram.sendMessage(chatId, truncatedText);
      } catch (error) {
        console.error(`Failed to send text to chat ${chatId}:`, error);
      }
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

    for (const [_userId, chatId] of this.userChatIds.entries()) {
      try {
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

    for (const [_userId, chatId] of this.userChatIds.entries()) {
      try {
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
    const formatted = this.outputParser.formatForTelegram(question);

    for (const [userId, chatId] of this.userChatIds.entries()) {
      try {
        // Store pending question for this chat
        this.pendingQuestions.set(chatId, question);

        await this.bot.telegram.sendMessage(chatId, formatted.text, {
          parse_mode: formatted.parseMode,
          reply_markup: formatted.replyMarkup,
        });
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
