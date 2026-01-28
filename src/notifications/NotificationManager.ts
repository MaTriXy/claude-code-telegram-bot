import { EventEmitter } from 'events';
import type {
  NotificationConfig,
  NotificationType,
  NotificationPreferences,
} from '../types/index.js';

export interface NotificationManagerEvents {
  preferenceChanged: (userId: number, type: NotificationType, enabled: boolean) => void;
}

/**
 * Manages per-user notification preferences
 */
export class NotificationManager extends EventEmitter {
  private config: NotificationConfig;
  private userPreferences: Map<number, NotificationPreferences> = new Map();

  constructor(config: NotificationConfig) {
    super();
    this.config = config;
  }

  /**
   * Get default notification preferences
   */
  getDefaults(): NotificationPreferences {
    return { ...this.config.defaults };
  }

  /**
   * Get notification preferences for a user (returns defaults if not customized)
   */
  getPreferences(userId: number): NotificationPreferences {
    return this.userPreferences.get(userId) || this.getDefaults();
  }

  /**
   * Check if a notification type should be sent to a user
   */
  shouldNotify(userId: number, type: NotificationType): boolean {
    const prefs = this.getPreferences(userId);
    return prefs[type] ?? this.config.defaults[type];
  }

  /**
   * Enable a notification type for a user
   */
  enable(userId: number, type: NotificationType): void {
    this.setPreference(userId, type, true);
  }

  /**
   * Disable a notification type for a user
   */
  disable(userId: number, type: NotificationType): void {
    this.setPreference(userId, type, false);
  }

  /**
   * Toggle a notification type for a user
   */
  toggle(userId: number, type: NotificationType): boolean {
    const currentValue = this.shouldNotify(userId, type);
    this.setPreference(userId, type, !currentValue);
    return !currentValue;
  }

  /**
   * Set a specific notification preference
   */
  setPreference(userId: number, type: NotificationType, enabled: boolean): void {
    let prefs = this.userPreferences.get(userId);
    if (!prefs) {
      prefs = this.getDefaults();
      this.userPreferences.set(userId, prefs);
    }
    prefs[type] = enabled;
    this.emit('preferenceChanged', userId, type, enabled);
  }

  /**
   * Enable all notification types for a user
   */
  enableAll(userId: number): void {
    const types: NotificationType[] = ['completion', 'error', 'warning', 'progress'];
    for (const type of types) {
      this.enable(userId, type);
    }
  }

  /**
   * Disable all notification types for a user
   */
  disableAll(userId: number): void {
    const types: NotificationType[] = ['completion', 'error', 'warning', 'progress'];
    for (const type of types) {
      this.disable(userId, type);
    }
  }

  /**
   * Reset user preferences to defaults
   */
  resetToDefaults(userId: number): void {
    this.userPreferences.delete(userId);
  }

  /**
   * Format preferences for display
   */
  formatPreferences(userId: number): string {
    const prefs = this.getPreferences(userId);
    const lines = [
      `Completion: ${prefs.completion ? 'ON' : 'OFF'}`,
      `Error: ${prefs.error ? 'ON' : 'OFF'}`,
      `Warning: ${prefs.warning ? 'ON' : 'OFF'}`,
      `Progress: ${prefs.progress ? 'ON' : 'OFF'}`,
    ];
    return lines.join('\n');
  }

  /**
   * Get all notification types
   */
  static getTypes(): NotificationType[] {
    return ['completion', 'error', 'warning', 'progress'];
  }

  /**
   * Check if a string is a valid notification type
   */
  static isValidType(type: string): type is NotificationType {
    return ['completion', 'error', 'warning', 'progress'].includes(type);
  }
}
