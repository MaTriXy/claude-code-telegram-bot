import { EventEmitter } from 'events';
/**
 * Manages per-user notification preferences
 */
export class NotificationManager extends EventEmitter {
    config;
    userPreferences = new Map();
    constructor(config) {
        super();
        this.config = config;
    }
    /**
     * Get default notification preferences
     */
    getDefaults() {
        return { ...this.config.defaults };
    }
    /**
     * Get notification preferences for a user (returns defaults if not customized)
     */
    getPreferences(userId) {
        return this.userPreferences.get(userId) || this.getDefaults();
    }
    /**
     * Check if a notification type should be sent to a user
     */
    shouldNotify(userId, type) {
        const prefs = this.getPreferences(userId);
        return prefs[type] ?? this.config.defaults[type];
    }
    /**
     * Enable a notification type for a user
     */
    enable(userId, type) {
        this.setPreference(userId, type, true);
    }
    /**
     * Disable a notification type for a user
     */
    disable(userId, type) {
        this.setPreference(userId, type, false);
    }
    /**
     * Toggle a notification type for a user
     */
    toggle(userId, type) {
        const currentValue = this.shouldNotify(userId, type);
        this.setPreference(userId, type, !currentValue);
        return !currentValue;
    }
    /**
     * Set a specific notification preference
     */
    setPreference(userId, type, enabled) {
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
    enableAll(userId) {
        const types = ['completion', 'error', 'warning', 'progress'];
        for (const type of types) {
            this.enable(userId, type);
        }
    }
    /**
     * Disable all notification types for a user
     */
    disableAll(userId) {
        const types = ['completion', 'error', 'warning', 'progress'];
        for (const type of types) {
            this.disable(userId, type);
        }
    }
    /**
     * Reset user preferences to defaults
     */
    resetToDefaults(userId) {
        this.userPreferences.delete(userId);
    }
    /**
     * Format preferences for display
     */
    formatPreferences(userId) {
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
    static getTypes() {
        return ['completion', 'error', 'warning', 'progress'];
    }
    /**
     * Check if a string is a valid notification type
     */
    static isValidType(type) {
        return ['completion', 'error', 'warning', 'progress'].includes(type);
    }
}
//# sourceMappingURL=NotificationManager.js.map