# Claude Code Telegram Bot - Feature Analysis

> Comprehensive technical analysis of the Claude Code Telegram Bot for documentation purposes.

## Executive Summary

The Claude Code Telegram Bot is a bridge application that enables remote operation of Anthropic's Claude Code CLI through Telegram. It provides session management, interactive Q&A handling, process control, and integration with Claude Code's skill system.

---

## 1. Bot Commands Reference

### Session Management Commands

| Command | Syntax | Description | Complexity |
|---------|--------|-------------|------------|
| `/start` | `/start` | Display welcome message and quick help guide | Beginner |
| `/help` | `/help` | Show comprehensive list of all available commands | Beginner |
| `/new` | `/new <name> [directory]` | Create a new Claude Code session with optional working directory | Beginner |
| `/list` | `/list` | List all active Telegram-managed sessions | Beginner |
| `/switch` | `/switch <session-id>` | Switch to a different active session | Intermediate |
| `/close` | `/close <session-id>` | Close and terminate a specific session | Intermediate |
| `/status` | `/status` | Display current session details (ID, name, status, directory) | Beginner |
| `/cd` | `/cd <path>` | Change the working directory of the current session | Intermediate |

### Session Discovery & Attachment Commands

| Command | Syntax | Description | Complexity |
|---------|--------|-------------|------------|
| `/sessions` | `/sessions` | Scan and list existing Claude sessions from `~/.claude/history.jsonl` | Intermediate |
| `/attach` | `/attach <id> [directory]` | Attach to an existing Claude session by partial or full ID | Advanced |

### Process Control Commands

| Command | Syntax | Description | Complexity |
|---------|--------|-------------|------------|
| `/abort` | `/abort` | Send Ctrl+C (SIGINT) to abort current operation softly | Intermediate |
| `/kill` | `/kill` | Force kill the current Claude process (SIGTERM/SIGKILL) | Advanced |

---

## 2. Core Features

### 2.1 Remote Access
- **Description**: Control Claude Code CLI from any device with Telegram (mobile, desktop, web)
- **How it works**: The bot receives messages via Telegram API, validates the user, and forwards prompts to the Claude CLI process
- **Complexity**: Beginner
- **Related Commands**: All commands

### 2.2 Session Management
- **Description**: Create, manage, switch between, and close multiple concurrent Claude Code sessions
- **How it works**: SessionManager maintains a Map of sessions with ULID-based identifiers, each associated with a ClaudeCodeProcess
- **Key features**:
  - Automatic session ID generation using ULID
  - Working directory validation (must exist and be a directory)
  - Session status tracking (active, idle, waiting_input, error)
  - Timestamp tracking (createdAt, lastActivity)
- **Complexity**: Intermediate
- **Related Commands**: `/new`, `/list`, `/switch`, `/close`, `/status`

### 2.3 Conversation Continuity
- **Description**: Sessions maintain context across multiple messages using Claude's `--resume` flag
- **How it works**: ClaudeCodeProcess tracks the Claude session_id from output and uses `--resume <session_id>` for follow-up messages
- **Key features**:
  - First message starts fresh session
  - Subsequent messages resume with same session ID
  - Session ID extracted from streaming JSON output
- **Complexity**: Advanced
- **Related Commands**: All message interactions

### 2.4 Interactive Q&A System
- **Description**: Receive Claude's questions as Telegram messages with inline response buttons
- **How it works**: OutputParser detects `AskUserQuestion` tool calls and formats them with Telegram inline keyboards
- **Key features**:
  - Inline keyboard buttons for predefined options
  - Custom input option ("Other") for freeform responses
  - Question deduplication to prevent duplicate displays
  - Markdown formatting with header and option descriptions
- **Complexity**: Intermediate
- **Related Commands**: Text messages, callback queries

### 2.5 Session Discovery & Attachment
- **Description**: Find and attach to Claude sessions started outside of Telegram (terminal, other tools)
- **How it works**: ClaudeSessionScanner reads `~/.claude/history.jsonl` to discover existing sessions
- **Key features**:
  - Scan recent sessions (up to 100)
  - Partial session ID matching (first 8 characters)
  - Display project name, time ago, last message preview
  - Use existing session's working directory or specify custom
- **Complexity**: Advanced
- **Related Commands**: `/sessions`, `/attach`

### 2.6 Claude Code Skills Forwarding
- **Description**: Forward Claude Code slash commands (skills) like `/babysitter:call` directly to Claude
- **How it works**: TelegramBot distinguishes between bot commands (like `/new`) and Claude skills (like `/commit`) by checking against a BOT_COMMANDS set
- **Key features**:
  - Non-bot slash commands forwarded to active session
  - Special feedback for babysitter commands (juggler emoji)
  - Standard confirmation for other skill commands
- **Complexity**: Advanced
- **Related Commands**: Any `/` command not in BOT_COMMANDS set

### 2.7 Process Control
- **Description**: Control running Claude processes with abort and kill capabilities
- **How it works**: Sends signals (SIGINT via Ctrl+C or SIGTERM/SIGKILL) to child processes
- **Key features**:
  - Soft abort with Ctrl+C equivalent
  - Hard kill with SIGTERM, fallback to SIGKILL after 5 seconds
  - Session remains active after kill (can send new messages)
- **Complexity**: Advanced
- **Related Commands**: `/abort`, `/kill`

### 2.8 Real-time Output Streaming
- **Description**: Receive Claude's responses and status updates in real-time
- **How it works**: OutputParser processes streaming JSON from Claude CLI and emits typed events
- **Event types emitted**:
  - `started` - Session initialized (system init message)
  - `thinking` - Claude is processing (content_block_start)
  - `text` - Assistant text response content
  - `question` - Interactive question from AskUserQuestion tool
  - `tool_call` - Tool invocation (Read, Write, Bash, etc.)
  - `progress` - Tool execution start/end notifications
  - `output` - Raw parsed JSON output
- **Complexity**: Advanced
- **Related Commands**: All interactions

### 2.9 Authorization & Security
- **Description**: Whitelist-based access control for bot interactions
- **How it works**: Middleware checks every incoming message against ALLOWED_USER_IDS
- **Key features**:
  - Per-message authorization verification
  - Unauthorized access logging
  - Clean environment for child processes (removes conflicting session variables)
  - No credential storage (uses Claude CLI's auth)
- **Complexity**: Beginner (configuration), Advanced (implementation)
- **Related Commands**: All commands

---

## 3. Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token from @BotFather |
| `ALLOWED_USER_IDS` | Yes | - | Comma-separated list of authorized Telegram user IDs |
| `DEFAULT_WORKING_DIR` | No | Current directory | Default directory for new sessions |
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `CLAUDE_CLI_PATH` | No | Auto-detected | Absolute path to claude CLI executable |

### Claude CLI Path Resolution

The bot automatically searches for the Claude CLI in these locations (in order):
1. `/opt/homebrew/bin/claude` - macOS Homebrew (Apple Silicon)
2. `/usr/local/bin/claude` - macOS Homebrew (Intel) / Linux
3. `/usr/bin/claude` - Linux system-wide

---

## 4. Prerequisites

1. **Node.js 18+** - JavaScript runtime
2. **Claude Code CLI** - Installed and authenticated via `~/.claude`
3. **Telegram Bot Token** - Created via @BotFather
4. **Telegram User ID** - Your numeric Telegram user ID (get from @userinfobot)

---

## 5. Architecture Components

### 5.1 TelegramBot (`src/bot/TelegramBot.ts`)
- **Responsibility**: Command handling, user authorization, message routing, output forwarding
- **Key dependencies**: Telegraf, SessionManager, OutputParser, ClaudeSessionScanner
- **Lines of code**: ~778 lines

### 5.2 SessionManager (`src/session/SessionManager.ts`)
- **Responsibility**: Session lifecycle management, multi-session handling, directory changes
- **Key features**: ULID generation, session status tracking, event subscriptions
- **Lines of code**: ~411 lines

### 5.3 ClaudeCodeProcess (`src/session/ClaudeCodeProcess.ts`)
- **Responsibility**: Spawn Claude CLI processes with `--dangerously-skip-permissions`, maintain conversation via `--resume`
- **Key features**: CLI path resolution, clean environment, stdin handling, permission bypass
- **Lines of code**: ~273 lines

### 5.4 OutputParser (`src/parser/OutputParser.ts`)
- **Responsibility**: Parse streaming JSON, detect questions, emit typed events
- **Key features**: Text accumulation, question deduplication, Telegram formatting
- **Lines of code**: ~350 lines

### 5.5 ClaudeSessionScanner (`src/utils/ClaudeSessionScanner.ts`)
- **Responsibility**: Discover existing Claude sessions from `~/.claude/`
- **Key features**: History file parsing, session grouping, time-ago formatting
- **Lines of code**: ~163 lines

---

## 6. User Workflows

### 6.1 Basic Workflow (Beginner)
1. Start the bot with `/start`
2. Create a session: `/new myproject /path/to/project`
3. Send prompts as regular text messages
4. Respond to questions using inline buttons
5. View session status with `/status`
6. Close session when done: `/close <id>`

### 6.2 Multi-Project Workflow (Intermediate)
1. Create first session: `/new backend /projects/api`
2. Create second session: `/new frontend /projects/web`
3. List sessions: `/list`
4. Switch between: `/switch <id>`
5. Change directory within session: `/cd /projects/api/v2`

### 6.3 Session Attachment Workflow (Advanced)
1. Run Claude Code in terminal: `claude`
2. In Telegram: `/sessions` to discover sessions
3. Attach: `/attach abc12345`
4. Continue conversation from Telegram
5. Optional: Specify different directory: `/attach abc12345 /new/path`

### 6.4 Babysitter Orchestration Workflow (Advanced)
1. Create session: `/new orchestrator /project`
2. Send babysitter command: `/babysitter:call run tests and fix failures`
3. Monitor progress via bot messages
4. Kill if needed: `/kill`

---

## 7. Common Use Cases

1. **Remote Code Reviews** - Review and modify code from mobile while away from desk
2. **CI/CD Monitoring** - Trigger and monitor builds/tests remotely
3. **Multi-Project Management** - Switch between projects without context loss
4. **Pair Programming** - Collaborate with Claude on code changes from anywhere
5. **Quick Fixes** - Make small code changes from phone during commute
6. **Session Continuity** - Attach to terminal session and continue from mobile
7. **Babysitter Orchestration** - Run complex multi-step workflows via Telegram

---

## 8. Troubleshooting Scenarios

### 8.1 Bot Not Responding
- **Symptom**: No reply from bot
- **Causes**: Invalid token, user not in whitelist, bot not running
- **Solutions**: Check `TELEGRAM_BOT_TOKEN`, verify user ID in `ALLOWED_USER_IDS`, check logs

### 8.2 "No active session" Error
- **Symptom**: Commands fail with no active session
- **Causes**: No session created or session was closed
- **Solutions**: Create session with `/new <name> <dir>`

### 8.3 Claude CLI Not Found
- **Symptom**: Error about missing claude executable
- **Causes**: Claude not installed or not in expected paths
- **Solutions**: Install Claude CLI, set `CLAUDE_CLI_PATH` in `.env`

### 8.4 Session Crashes
- **Symptom**: "Session crashed (exit code: X)" message
- **Causes**: Claude process error, invalid directory, authentication issues
- **Solutions**: Check directory exists, verify Claude auth, create new session

### 8.5 /sessions Shows No Sessions
- **Symptom**: Empty list from `/sessions` command
- **Causes**: No history file, no previous Claude usage
- **Solutions**: Use Claude at least once, check `~/.claude/history.jsonl` exists

### 8.6 /attach Fails to Find Session
- **Symptom**: "No session found matching" error
- **Causes**: Invalid session ID, session too old
- **Solutions**: Use correct partial ID (first 8 chars), check `/sessions` output

### 8.7 Long Messages Truncated
- **Symptom**: Messages end with "...(truncated)"
- **Causes**: Telegram's 4096 character limit
- **Solutions**: Normal behavior; full output is in Claude's history

### 8.8 /kill Doesn't Stop Claude
- **Symptom**: Process continues after `/kill`
- **Causes**: Process still terminating, zombie process
- **Solutions**: Wait a moment, use `/close` then `/new` to recreate

---

## 9. Technical Details

### Claude CLI Invocation
```bash
claude --dangerously-skip-permissions --print --verbose --output-format stream-json [--resume <session_id>] "<prompt>"
```

- `--dangerously-skip-permissions`: **Bypasses all permission checks** (see Security Warning below)
- `--print`: Non-interactive mode (exit after response)
- `--verbose`: Required for stream-json output format
- `--output-format stream-json`: Parseable streaming JSON
- `--resume`: Continue previous session (for follow-up messages)

> **Security Warning**: The `--dangerously-skip-permissions` flag allows Claude to perform file operations (read, write, execute) without user confirmation. This is intended for sandboxed or trusted environments only. Do not use this bot with access to sensitive systems or data.

### Environment Sanitization
Child processes remove these variables to prevent conflicts:
- `CLAUDE_SESSION_ID`
- `CLAUDECODE`
- `CLAUDE_CODE_ENTRYPOINT`

### Session Status Types
- `active` - Currently processing a request
- `idle` - Ready for new input
- `waiting_input` - Awaiting user response to question
- `error` - Error state

### Event Flow
```
User Message -> TelegramBot -> SessionManager -> ClaudeCodeProcess
                                                      |
                                                      v
User <- TelegramBot <- OutputParser <- Streaming JSON Output
```

---

## 10. Limitations

1. **Single user per session** - Not designed for concurrent multi-user access
2. **No persistent state** - Sessions lost on bot restart (Claude history preserved)
3. **Message size limits** - Telegram limits to 4096 characters
4. **No file uploads** - Cannot send files through Telegram to Claude
5. **Thinking debounce** - "Thinking..." messages debounced to 5 seconds
6. **Windows not tested** - May require path adjustments

---

## 11. Dependencies

### Runtime Dependencies
- `telegraf` (^4.16.3) - Telegram bot framework
- `ulid` (^2.3.0) - Session ID generation
- `dotenv` (^16.4.5) - Environment variable loading
- `execa` (^8.0.1) - Process execution

### Development Dependencies
- `typescript` (^5.3.3) - Type checking
- `jest` (^29.7.0) - Testing framework
- `ts-jest` (^29.1.2) - TypeScript support for Jest
- `@a5c-ai/babysitter-sdk` (^0.0.146) - Babysitter integration

---

*Generated: 2026-01-27*
*Source: Codebase analysis of Claude Code Telegram Bot*
