export {
  ThreadManager,
  DEFAULT_THREAD_MANAGER_CONFIG,
  type ThreadManagerEvents,
  type ThreadManagerConfig,
  type UserThreadPreference,
  type ChatThreadState,
} from './ThreadManager.js';

export {
  TopicHandler,
  DEFAULT_TOPIC_HANDLER_CONFIG,
  TOPIC_ICON_COLORS,
  type TopicHandlerEvents,
  type TopicHandlerConfig,
  type ForumTopic,
  type CreateTopicOptions,
  type CreateTopicResult,
  type ChatInfo,
  type TelegramApiError,
} from './TopicHandler.js';

// Re-export ForumTopic and CreateTopicOptions for convenience when using ThreadManager
export type { ForumTopic as Topic, CreateTopicOptions as TopicOptions } from './TopicHandler.js';
