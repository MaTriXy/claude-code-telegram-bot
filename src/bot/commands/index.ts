/**
 * Command Registration Module Exports
 */

export {
  CommandCategory,
  CommandScope,
  BotCommandDefinition,
  COMMAND_DEFINITIONS,
  getCommandsByScope,
  getCommandsByCategory,
  getCommandsForTelegramAPI,
  getAllCommandNames,
} from './CommandDefinitions.js';

export { CommandRegistrationService } from './CommandRegistrationService.js';
