import { config as loadDotenv } from 'dotenv';
import type { TelegramBotConfig, SessionManagerConfig } from '../types/index.js';

// Load environment variables
loadDotenv();

/**
 * Get required environment variable or throw
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Parse comma-separated list of numbers
 */
function parseNumberList(value: string): number[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const num = parseInt(s, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid number in list: ${s}`);
      }
      return num;
    });
}

/**
 * Get SessionManager configuration from environment
 */
export function getSessionManagerConfig(): SessionManagerConfig {
  return {
    claudeCliPath: getEnv('CLAUDE_CLI_PATH', 'claude'),
    defaultWorkingDir: process.env['DEFAULT_WORKING_DIR'],
  };
}

/**
 * Get TelegramBot configuration from environment
 */
export function getTelegramBotConfig(): TelegramBotConfig {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const allowedUserIdsStr = requireEnv('ALLOWED_USER_IDS');

  return {
    token,
    allowedUserIds: parseNumberList(allowedUserIdsStr),
    sessionManagerConfig: getSessionManagerConfig(),
  };
}

/**
 * Get log level from environment
 */
export function getLogLevel(): string {
  return getEnv('LOG_LEVEL', 'info');
}
