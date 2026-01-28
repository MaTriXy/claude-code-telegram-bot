import { EventEmitter } from 'events';
import type { NotificationConfig, NotificationType, NotificationPreferences } from '../types/index.js';
export interface NotificationManagerEvents {
    preferenceChanged: (userId: number, type: NotificationType, enabled: boolean) => void;
}
/**
 * Manages per-user notification preferences
 */
export declare class NotificationManager extends EventEmitter {
    private config;
    private userPreferences;
    constructor(config: NotificationConfig);
    /**
     * Get default notification preferences
     */
    getDefaults(): NotificationPreferences;
    /**
     * Get notification preferences for a user (returns defaults if not customized)
     */
    getPreferences(userId: number): NotificationPreferences;
    /**
     * Check if a notification type should be sent to a user
     */
    shouldNotify(userId: number, type: NotificationType): boolean;
    /**
     * Enable a notification type for a user
     */
    enable(userId: number, type: NotificationType): void;
    /**
     * Disable a notification type for a user
     */
    disable(userId: number, type: NotificationType): void;
    /**
     * Toggle a notification type for a user
     */
    toggle(userId: number, type: NotificationType): boolean;
    /**
     * Set a specific notification preference
     */
    setPreference(userId: number, type: NotificationType, enabled: boolean): void;
    /**
     * Enable all notification types for a user
     */
    enableAll(userId: number): void;
    /**
     * Disable all notification types for a user
     */
    disableAll(userId: number): void;
    /**
     * Reset user preferences to defaults
     */
    resetToDefaults(userId: number): void;
    /**
     * Format preferences for display
     */
    formatPreferences(userId: number): string;
    /**
     * Get all notification types
     */
    static getTypes(): NotificationType[];
    /**
     * Check if a string is a valid notification type
     */
    static isValidType(type: string): type is NotificationType;
}
//# sourceMappingURL=NotificationManager.d.ts.map