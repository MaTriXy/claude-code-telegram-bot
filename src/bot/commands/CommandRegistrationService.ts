/**
 * Command Registration Service
 *
 * Handles registering bot commands with Telegram's setMyCommands API.
 * Supports multiple scopes for context-aware command menus.
 */

import { Telegraf, Context } from 'telegraf';
import { BotCommand } from 'telegraf/types';
import {
  CommandScope,
  getCommandsForTelegramAPI,
} from './CommandDefinitions';

/**
 * Service for registering bot commands with Telegram
 */
export class CommandRegistrationService {
  private bot: Telegraf<Context>;
  private updateDebounceTimers: Map<number, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce for per-chat updates

  constructor(bot: Telegraf<Context>) {
    this.bot = bot;
  }

  /**
   * Register all default commands with appropriate scopes
   * Should be called once during bot startup
   */
  async registerAllCommands(): Promise<void> {
    try {
      // Register default commands (shown to all users)
      await this.registerDefaultCommands();

      // Register private chat commands
      await this.registerPrivateChatCommands();

      // Register group chat commands
      await this.registerGroupChatCommands();

      console.log('[CommandRegistration] Successfully registered all command menus');
    } catch (error) {
      console.error('[CommandRegistration] Error registering commands:', error);
      // Don't throw - command registration failure shouldn't prevent bot from starting
    }
  }

  /**
   * Register default commands (shown in all chats)
   */
  async registerDefaultCommands(): Promise<void> {
    const commands = getCommandsForTelegramAPI(CommandScope.Default);
    try {
      await this.bot.telegram.setMyCommands(commands, {
        scope: { type: 'default' },
      });
      console.log(`[CommandRegistration] Registered ${commands.length} default commands`);
    } catch (error) {
      console.error('[CommandRegistration] Error registering default commands:', error);
    }
  }

  /**
   * Register commands for private (1:1) chats
   */
  async registerPrivateChatCommands(): Promise<void> {
    const commands = getCommandsForTelegramAPI(CommandScope.PrivateChats);
    try {
      await this.bot.telegram.setMyCommands(commands, {
        scope: { type: 'all_private_chats' },
      });
      console.log(`[CommandRegistration] Registered ${commands.length} private chat commands`);
    } catch (error) {
      console.error('[CommandRegistration] Error registering private chat commands:', error);
    }
  }

  /**
   * Register commands for group chats
   */
  async registerGroupChatCommands(): Promise<void> {
    const commands = getCommandsForTelegramAPI(CommandScope.GroupChats);
    try {
      await this.bot.telegram.setMyCommands(commands, {
        scope: { type: 'all_group_chats' },
      });
      console.log(`[CommandRegistration] Registered ${commands.length} group chat commands`);
    } catch (error) {
      console.error('[CommandRegistration] Error registering group chat commands:', error);
    }
  }

  /**
   * Update commands for a specific chat based on session state
   * Uses debouncing to avoid rate limiting
   *
   * @param chatId The chat ID to update commands for
   * @param hasActiveSession Whether the chat has an active session
   * @param isGroup Whether this is a group chat
   */
  async updateCommandsForChat(
    chatId: number,
    hasActiveSession: boolean,
    isGroup: boolean = false
  ): Promise<void> {
    // Cancel any pending update for this chat
    const existingTimer = this.updateDebounceTimers.get(chatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Debounce the update
    const timer = setTimeout(async () => {
      this.updateDebounceTimers.delete(chatId);
      await this.doUpdateCommandsForChat(chatId, hasActiveSession, isGroup);
    }, this.DEBOUNCE_MS);

    this.updateDebounceTimers.set(chatId, timer);
  }

  /**
   * Actually perform the command update for a chat
   */
  private async doUpdateCommandsForChat(
    chatId: number,
    hasActiveSession: boolean,
    isGroup: boolean
  ): Promise<void> {
    try {
      let commands: BotCommand[];

      if (hasActiveSession) {
        // Combine base commands with session-specific commands
        const baseScope = isGroup ? CommandScope.GroupChats : CommandScope.PrivateChats;
        const baseCommands = getCommandsForTelegramAPI(baseScope);
        const sessionCommands = getCommandsForTelegramAPI(CommandScope.ChatWithSession);

        // Merge commands, prioritizing session commands for duplicates
        const commandMap = new Map<string, BotCommand>();
        for (const cmd of baseCommands) {
          commandMap.set(cmd.command, cmd);
        }
        for (const cmd of sessionCommands) {
          commandMap.set(cmd.command, cmd);
        }
        commands = Array.from(commandMap.values());
      } else {
        // Just use base commands
        const baseScope = isGroup ? CommandScope.GroupChats : CommandScope.PrivateChats;
        commands = getCommandsForTelegramAPI(baseScope);
      }

      await this.bot.telegram.setMyCommands(commands, {
        scope: { type: 'chat', chat_id: chatId },
      });

      console.log(
        `[CommandRegistration] Updated commands for chat ${chatId}: ` +
        `${commands.length} commands, hasSession=${hasActiveSession}`
      );
    } catch (error) {
      console.error(`[CommandRegistration] Error updating commands for chat ${chatId}:`, error);
      // Don't throw - failure to update commands shouldn't break bot functionality
    }
  }

  /**
   * Clear custom commands for a specific chat (revert to default)
   * @param chatId The chat ID to clear commands for
   */
  async clearCommandsForChat(chatId: number): Promise<void> {
    try {
      await this.bot.telegram.deleteMyCommands({
        scope: { type: 'chat', chat_id: chatId },
      });
      console.log(`[CommandRegistration] Cleared custom commands for chat ${chatId}`);
    } catch (error) {
      console.error(`[CommandRegistration] Error clearing commands for chat ${chatId}:`, error);
    }
  }

  /**
   * Cleanup method - clear any pending timers
   */
  cleanup(): void {
    for (const timer of this.updateDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.updateDebounceTimers.clear();
  }
}
