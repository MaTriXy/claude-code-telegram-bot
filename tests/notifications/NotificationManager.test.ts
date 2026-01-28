import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NotificationManager } from '../../src/notifications/NotificationManager.js';
import type { NotificationConfig, NotificationPreferences, NotificationType } from '../../src/types/index.js';

const defaultPrefs: NotificationPreferences = {
  completion: true,
  error: true,
  warning: true,
  progress: false,
};

const defaultConfig: NotificationConfig = {
  defaults: defaultPrefs,
};

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;

  beforeEach(() => {
    notificationManager = new NotificationManager(defaultConfig);
  });

  describe('constructor', () => {
    it('should create manager with config', () => {
      expect(notificationManager).toBeInstanceOf(NotificationManager);
    });
  });

  describe('getDefaults', () => {
    it('should return default preferences', () => {
      const defaults = notificationManager.getDefaults();
      expect(defaults).toEqual(defaultPrefs);
    });

    it('should return a copy of defaults', () => {
      const defaults = notificationManager.getDefaults();
      defaults.completion = false;

      const newDefaults = notificationManager.getDefaults();
      expect(newDefaults.completion).toBe(true);
    });
  });

  describe('getPreferences', () => {
    it('should return defaults for new users', () => {
      const prefs = notificationManager.getPreferences(12345);
      expect(prefs).toEqual(defaultPrefs);
    });

    it('should return customized preferences for existing users', () => {
      notificationManager.disable(12345, 'completion');
      const prefs = notificationManager.getPreferences(12345);

      expect(prefs.completion).toBe(false);
      expect(prefs.error).toBe(true);
    });
  });

  describe('shouldNotify', () => {
    it('should return true for enabled notification types', () => {
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(true);
      expect(notificationManager.shouldNotify(12345, 'error')).toBe(true);
    });

    it('should return false for disabled notification types', () => {
      expect(notificationManager.shouldNotify(12345, 'progress')).toBe(false);
    });

    it('should respect user customizations', () => {
      notificationManager.disable(12345, 'completion');
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(false);
    });
  });

  describe('enable', () => {
    it('should enable a notification type', () => {
      notificationManager.disable(12345, 'completion');
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(false);

      notificationManager.enable(12345, 'completion');
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(true);
    });

    it('should emit preferenceChanged event', () => {
      const callback = jest.fn();
      notificationManager.on('preferenceChanged', callback);

      notificationManager.enable(12345, 'progress');

      expect(callback).toHaveBeenCalledWith(12345, 'progress', true);
    });
  });

  describe('disable', () => {
    it('should disable a notification type', () => {
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(true);

      notificationManager.disable(12345, 'completion');
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(false);
    });

    it('should emit preferenceChanged event', () => {
      const callback = jest.fn();
      notificationManager.on('preferenceChanged', callback);

      notificationManager.disable(12345, 'completion');

      expect(callback).toHaveBeenCalledWith(12345, 'completion', false);
    });
  });

  describe('toggle', () => {
    it('should toggle from true to false', () => {
      const result = notificationManager.toggle(12345, 'completion');
      expect(result).toBe(false);
      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(false);
    });

    it('should toggle from false to true', () => {
      notificationManager.disable(12345, 'progress');
      const result = notificationManager.toggle(12345, 'progress');
      expect(result).toBe(true);
      expect(notificationManager.shouldNotify(12345, 'progress')).toBe(true);
    });
  });

  describe('enableAll', () => {
    it('should enable all notification types', () => {
      notificationManager.disableAll(12345);
      notificationManager.enableAll(12345);

      const types: NotificationType[] = ['completion', 'error', 'warning', 'progress'];
      for (const type of types) {
        expect(notificationManager.shouldNotify(12345, type)).toBe(true);
      }
    });
  });

  describe('disableAll', () => {
    it('should disable all notification types', () => {
      notificationManager.disableAll(12345);

      const types: NotificationType[] = ['completion', 'error', 'warning', 'progress'];
      for (const type of types) {
        expect(notificationManager.shouldNotify(12345, type)).toBe(false);
      }
    });
  });

  describe('resetToDefaults', () => {
    it('should reset user preferences to defaults', () => {
      notificationManager.disableAll(12345);
      notificationManager.resetToDefaults(12345);

      expect(notificationManager.shouldNotify(12345, 'completion')).toBe(true);
      expect(notificationManager.shouldNotify(12345, 'progress')).toBe(false);
    });
  });

  describe('formatPreferences', () => {
    it('should format preferences for display', () => {
      const formatted = notificationManager.formatPreferences(12345);

      expect(formatted).toContain('Completion');
      expect(formatted).toContain('Error');
      expect(formatted).toContain('Warning');
      expect(formatted).toContain('Progress');
      expect(formatted).toContain('ON');
      expect(formatted).toContain('OFF');
    });

    it('should reflect user customizations', () => {
      notificationManager.disable(12345, 'completion');
      const formatted = notificationManager.formatPreferences(12345);

      // Completion should show OFF
      expect(formatted).toMatch(/Completion.*OFF/i);
    });
  });

  describe('static getTypes', () => {
    it('should return all notification types', () => {
      const types = NotificationManager.getTypes();
      expect(types).toContain('completion');
      expect(types).toContain('error');
      expect(types).toContain('warning');
      expect(types).toContain('progress');
      expect(types).toHaveLength(4);
    });
  });

  describe('static isValidType', () => {
    it('should return true for valid types', () => {
      expect(NotificationManager.isValidType('completion')).toBe(true);
      expect(NotificationManager.isValidType('error')).toBe(true);
      expect(NotificationManager.isValidType('warning')).toBe(true);
      expect(NotificationManager.isValidType('progress')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(NotificationManager.isValidType('invalid')).toBe(false);
      expect(NotificationManager.isValidType('')).toBe(false);
      expect(NotificationManager.isValidType('COMPLETION')).toBe(false);
    });
  });

  describe('isolation between users', () => {
    it('should keep preferences separate per user', () => {
      notificationManager.disable(11111, 'completion');
      notificationManager.disable(22222, 'error');

      expect(notificationManager.shouldNotify(11111, 'completion')).toBe(false);
      expect(notificationManager.shouldNotify(11111, 'error')).toBe(true);

      expect(notificationManager.shouldNotify(22222, 'completion')).toBe(true);
      expect(notificationManager.shouldNotify(22222, 'error')).toBe(false);
    });
  });

  describe('event emission', () => {
    it('should be an EventEmitter', () => {
      expect(typeof notificationManager.on).toBe('function');
      expect(typeof notificationManager.emit).toBe('function');
    });
  });
});
