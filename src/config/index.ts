import { config as loadDotenv } from 'dotenv';
import type {
  TelegramBotConfig,
  SessionManagerConfig,
  VoiceConfig,
  NotificationConfig,
  VerbosityConfig,
  FileUploadConfig,
  ExtendedTelegramBotConfig,
  VerbosityLevel,
  NotificationPreferences,
  LogLevel,
} from '../types/index.js';

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
export function getLogLevel(): LogLevel {
  const level = getEnv('LOG_LEVEL', 'info');
  const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  if (!validLevels.includes(level as LogLevel)) {
    return 'info';
  }
  return level as LogLevel;
}

/**
 * Parse boolean from environment variable
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Get voice configuration from environment
 */
export function getVoiceConfig(): VoiceConfig {
  return {
    enabled: parseBool(process.env['VOICE_ENABLED'], false),
    openaiApiKey: process.env['OPENAI_API_KEY'],
  };
}

/**
 * Get notification configuration from environment
 */
export function getNotificationConfig(): NotificationConfig {
  const defaultPrefs: NotificationPreferences = {
    completion: true,
    error: true,
    warning: true,
    progress: false,
  };

  const notificationDefaults = process.env['NOTIFICATION_DEFAULTS'];
  if (notificationDefaults) {
    try {
      const parsed = JSON.parse(notificationDefaults);
      return {
        defaults: {
          completion: parsed.completion ?? defaultPrefs.completion,
          error: parsed.error ?? defaultPrefs.error,
          warning: parsed.warning ?? defaultPrefs.warning,
          progress: parsed.progress ?? defaultPrefs.progress,
        },
      };
    } catch {
      // Invalid JSON, use defaults
    }
  }

  return { defaults: defaultPrefs };
}

/**
 * Get verbosity configuration from environment
 */
export function getVerbosityConfig(): VerbosityConfig {
  const level = getEnv('DEFAULT_VERBOSITY', 'normal');
  const validLevels: VerbosityLevel[] = ['minimal', 'normal', 'verbose'];
  const defaultLevel = validLevels.includes(level as VerbosityLevel)
    ? (level as VerbosityLevel)
    : 'normal';

  return { defaultLevel };
}

/**
 * Get file upload configuration from environment
 */
export function getFileUploadConfig(): FileUploadConfig {
  const defaultMimeTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
  ];

  const defaultExtensions = [
    '.txt', '.md', '.csv', '.json', '.pdf',
    '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.ts', '.js', '.py', '.java', '.go', '.rs',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb',
    '.html', '.css', '.scss', '.xml', '.yaml', '.yml',
    '.sh', '.bash', '.zsh', '.sql', '.graphql',
  ];

  return {
    enabled: parseBool(process.env['FILE_UPLOAD_ENABLED'], false),
    maxFileSizeMB: parseNumber(process.env['MAX_FILE_SIZE_MB'], 10),
    supportedMimeTypes: defaultMimeTypes,
    allowedExtensions: defaultExtensions,
  };
}

/**
 * Get extended TelegramBot configuration from environment
 */
export function getExtendedTelegramBotConfig(): ExtendedTelegramBotConfig {
  const baseConfig = getTelegramBotConfig();

  return {
    ...baseConfig,
    voiceConfig: getVoiceConfig(),
    notificationConfig: getNotificationConfig(),
    verbosityConfig: getVerbosityConfig(),
    fileUploadConfig: getFileUploadConfig(),
    logLevel: getLogLevel(),
  };
}
