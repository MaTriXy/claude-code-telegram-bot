# Claude Code Telegram Bot - Feature Analysis

> **Analysis Date:** January 27, 2026
> **Project Version:** 1.0.0
> **Analyst:** Technical Documentation Specialist

## Executive Summary

The Claude Code Telegram Bot is a bridge application that enables remote operation of Anthropic's Claude Code CLI through Telegram. It provides session management, real-time communication, interactive Q&A, and skill forwarding capabilities, making mobile coding assistance possible.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Features by Category](#features-by-category)
4. [Bot Commands Reference](#bot-commands-reference)
5. [Configuration Options](#configuration-options)
6. [Prerequisites](#prerequisites)
7. [User Workflows](#user-workflows)
8. [Use Cases](#use-cases)
9. [Technical Implementation Details](#technical-implementation-details)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Security Model](#security-model)
12. [Limitations and Known Issues](#limitations-and-known-issues)

---

## Architecture Overview

```
+------------------+     +-------------------+     +--------------------+
|                  |     |                   |     |                    |
|  Telegram User   |<--->|   TelegramBot     |<--->|  SessionManager    |
|                  |     |   (Telegraf)      |     |                    |
+------------------+     +-------------------+     +--------------------+
                                   |                         |
                         +--------+--------+                 |
                         |                 |                 v
                         v                 v       +--------------------+
               +-------------------+  +--------+   |                    |
               |                   |  | Claude |   | ClaudeCodeProcess  |
               |   OutputParser    |  | Session|   |   (spawn CLI)      |
               |   (EventEmitter)  |  | Scanner|   |                    |
               |                   |  +--------+   +--------------------+
               +-------------------+                         |
                         |                                   |
                         |         Streaming JSON            |
                         +<----------------------------------+
```

### Data Flow

1. User sends message via Telegram
2. TelegramBot validates authorization and routes message
3. SessionManager identifies active session and forwards input
4. ClaudeCodeProcess spawns Claude CLI with `--print --output-format stream-json`
5. OutputParser processes streaming JSON output
6. Parsed responses are formatted and sent back to Telegram
7. Follow-up messages use `--resume <session_id>` for continuity

---

## Core Components

### 1. TelegramBot (`src/bot/TelegramBot.ts`)

**Responsibility:** Main entry point for Telegram interactions

| Feature | Description |
|---------|-------------|
| Command Handling | Processes 12 bot commands |
| Authorization | Whitelist-based user validation |
| Message Routing | Distinguishes bot commands from skill invocations |
| Output Forwarding | Pipes Claude responses to Telegram |
| Callback Handling | Manages inline keyboard responses |
| Question Presentation | Formats Claude questions with interactive buttons |

**Key Methods:**
- `setupCommands()` - Registers all 12 bot commands
- `setupCallbackHandlers()` - Handles inline button callbacks
- `setupMessageHandlers()` - Routes text messages to Claude
- `setupOutputForwarding()` - Subscribes to OutputParser events
- `subscribeToSessionOutput()` - Pipes session output to parser

### 2. SessionManager (`src/session/SessionManager.ts`)

**Responsibility:** Manages Claude Code session lifecycle

| Feature | Description |
|---------|-------------|
| Session Creation | Creates new sessions with ULID identifiers |
| Session Attachment | Attaches to existing Claude sessions |
| Multi-Session Support | Manages multiple concurrent sessions |
| Directory Management | Changes working directory (restarts process) |
| Event Subscription | Provides output/error/close event subscriptions |
| Process Lifecycle | Handles session creation, switching, and closing |

**Key Methods:**
- `createSession()` - Creates new Claude session
- `attachToSession()` - Attaches to existing session by ID
- `switchSession()` - Changes active session
- `closeSession()` - Terminates and removes session
- `changeDirectory()` - Changes session working directory
- `sendToActiveSession()` - Sends input to active session
- `killActiveProcess()` - Force kills current process

### 3. ClaudeCodeProcess (`src/session/ClaudeCodeProcess.ts`)

**Responsibility:** Wraps Claude CLI process interaction

| Feature | Description |
|---------|-------------|
| Process Spawning | Spawns Claude CLI in print mode |
| Session Resume | Maintains conversation via `--resume` flag |
| Environment Isolation | Cleans session-related env vars |
| Path Resolution | Auto-detects Claude CLI location |
| Event Emission | Emits output, error, close events |

**CLI Arguments Used:**
- `--print` - Non-interactive mode
- `--verbose` - Required for stream-json
- `--output-format stream-json` - Parseable output
- `--resume <session_id>` - Continue conversation

**Auto-detected Paths:**
- `/opt/homebrew/bin/claude` (macOS Apple Silicon)
- `/usr/local/bin/claude` (macOS Intel / Linux)
- `/usr/bin/claude` (Linux system-wide)

### 4. OutputParser (`src/parser/OutputParser.ts`)

**Responsibility:** Parses streaming JSON from Claude CLI

| Event | Trigger | Description |
|-------|---------|-------------|
| `output` | Any JSON line | Raw parsed output |
| `text` | Text content received | Assistant text responses |
| `question` | AskUserQuestion tool | Interactive question detected |
| `tool_call` | Any tool invocation | Tool execution notification |
| `progress` | Tool start/end | Execution progress |
| `thinking` | content_block_start | Claude processing indicator |
| `started` | system init | Session initialized |

**Supported Output Types:**
- `assistant` - Text responses with content blocks
- `tool_use` - Tool invocations (AskUserQuestion, Read, Write, etc.)
- `tool_result` - Tool execution results
- `content_block_delta` - Streaming text chunks
- `content_block_start/stop` - Content block lifecycle
- `result` - Final message result

### 5. ClaudeSessionScanner (`src/utils/ClaudeSessionScanner.ts`)

**Responsibility:** Discovers existing Claude sessions on the system

| Feature | Description |
|---------|-------------|
| History Scanning | Reads `~/.claude/history.jsonl` |
| Session Listing | Returns recent sessions with metadata |
| Project Sessions | Lists sessions for specific project |
| Session Validation | Checks if session exists |
| Time Formatting | Human-readable time ago strings |

---

## Features by Category

### Session Management (Beginner)

| Feature | Command | Description |
|---------|---------|-------------|
| Create Session | `/new <name> [dir]` | Creates a new Claude Code session |
| List Sessions | `/list` | Shows all active Telegram sessions |
| Switch Session | `/switch <id>` | Changes active session |
| Close Session | `/close <id>` | Terminates and removes session |
| Session Status | `/status` | Shows current session details |
| Change Directory | `/cd <path>` | Changes working directory |

### Session Discovery & Attachment (Intermediate)

| Feature | Command | Description |
|---------|---------|-------------|
| Discover Sessions | `/sessions` | Lists existing Claude sessions on system |
| Attach to Session | `/attach <id> [dir]` | Attaches to existing session |
| Partial ID Matching | N/A | Use first 8 characters of session ID |

### Process Control (Intermediate)

| Feature | Command | Description |
|---------|---------|-------------|
| Abort Operation | `/abort` | Sends Ctrl+C signal |
| Force Kill | `/kill` | Hard terminates current process |

### Interactive Q&A (Beginner)

| Feature | Description |
|---------|-------------|
| Question Detection | Detects `AskUserQuestion` tool calls |
| Inline Buttons | Presents options as tappable buttons |
| Custom Input | "Other" button for typing custom responses |
| Option Descriptions | Shows option descriptions if provided |

### Skill Forwarding (Advanced)

| Feature | Description |
|---------|-------------|
| Slash Command Forwarding | Non-bot `/commands` forwarded to Claude |
| Babysitter Support | Special feedback for `/babysitter:*` commands |
| Skill Invocation | Any Claude Code skill can be triggered |

### Real-time Monitoring (Intermediate)

| Feature | Description |
|---------|-------------|
| Tool Failure Alerts | Notifies when tool execution fails |
| Session Crash Alerts | Notifies when session crashes with exit code |
| Graceful End Notification | Notifies when session ends normally |
| Error Forwarding | Forwards Claude errors to user |

### Security (Beginner)

| Feature | Description |
|---------|-------------|
| User Whitelist | Only authorized user IDs can interact |
| Environment Isolation | Child processes have clean environment |
| Per-message Auth | Every message validated against whitelist |

---

## Bot Commands Reference

### Session Management Commands

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `/start` | `/start` | Welcome message and quick help | `/start` |
| `/help` | `/help` | Show all available commands | `/help` |
| `/new` | `/new <name> [dir]` | Create new session | `/new myproject /path/to/project` |
| `/cd` | `/cd <path>` | Change working directory | `/cd /home/user/project` |
| `/list` | `/list` | List all active sessions | `/list` |
| `/switch` | `/switch <id>` | Switch to session | `/switch 01HGXK...` |
| `/close` | `/close <id>` | Close session | `/close 01HGXK...` |
| `/status` | `/status` | Current session info | `/status` |

### Control Commands

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `/abort` | `/abort` | Send Ctrl+C to abort | `/abort` |
| `/kill` | `/kill` | Force kill process | `/kill` |

### Discovery Commands

| Command | Syntax | Description | Example |
|---------|--------|-------------|---------|
| `/sessions` | `/sessions` | List existing Claude sessions | `/sessions` |
| `/attach` | `/attach <id> [dir]` | Attach to existing session | `/attach abc12345` |

### Bot Commands Set (Internal)

The following commands are handled by the bot and NOT forwarded to Claude:
```typescript
const BOT_COMMANDS = new Set([
  'start', 'help', 'new', 'cd', 'list', 'switch',
  'close', 'status', 'abort', 'kill', 'sessions', 'attach'
]);
```

---

## Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token from @BotFather |
| `ALLOWED_USER_IDS` | Yes | - | Comma-separated authorized user IDs |
| `DEFAULT_WORKING_DIR` | No | `process.cwd()` | Default directory for new sessions |
| `LOG_LEVEL` | No | `info` | Logging level (error/warn/info/debug) |
| `CLAUDE_CLI_PATH` | No | Auto-detected | Path to Claude CLI executable |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env` | Environment configuration (not in git) |
| `.env.example` | Template for environment setup |
| `tsconfig.json` | TypeScript compiler configuration |
| `package.json` | NPM dependencies and scripts |

---

## Prerequisites

### Required

1. **Node.js 18+**
   - Download: https://nodejs.org/
   - Verify: `node --version`

2. **Claude Code CLI**
   - Must be installed and authenticated
   - Installation: https://docs.anthropic.com/en/docs/claude-code
   - Verify: `claude --version`

3. **Telegram Bot Token**
   - Create via @BotFather on Telegram
   - Save the token for `.env` configuration

4. **Telegram User ID**
   - Get from @userinfobot on Telegram
   - Numeric ID for authorization whitelist

### Optional

1. **npm** - Comes with Node.js
2. **Git** - For cloning the repository
3. **TypeScript knowledge** - For development/customization

---

## User Workflows

### Workflow 1: First-Time Setup

```
1. Clone repository
2. npm install
3. cp .env.example .env
4. Edit .env with bot token and user ID
5. npm run build
6. npm start
7. Open Telegram, start chat with bot
8. Send /start
```

### Workflow 2: Basic Coding Session

```
1. /new backend-api /path/to/project
2. "Create a REST endpoint for user authentication"
3. [Claude responds with code]
4. [If Claude asks question] Tap inline button or type response
5. Continue conversation...
6. /close <session-id> when done
```

### Workflow 3: Multi-Project Management

```
1. /new project-a /path/to/project-a
2. [Work on project A]
3. /new project-b /path/to/project-b
4. [Work on project B]
5. /list (see both sessions)
6. /switch <project-a-id>
7. [Continue working on project A]
```

### Workflow 4: Attach to Existing Session

```
1. /sessions (list available sessions)
2. /attach abc12345 (use partial ID)
3. [Continue existing conversation]
4. Send follow-up prompts...
```

### Workflow 5: Using Skills/Slash Commands

```
1. /new test-project /path/to/project
2. /babysitter:call run tests and fix failures
3. [Bot shows: Sent to the Babysitter]
4. [Claude executes babysitter workflow]
```

### Workflow 6: Process Recovery

```
1. [Claude gets stuck or hangs]
2. /abort (soft interrupt)
3. [If still stuck]
4. /kill (force terminate)
5. Send new prompt to restart
```

---

## Use Cases

### Development Use Cases

1. **Mobile Code Review** - Review and discuss code changes from phone
2. **Quick Bug Fixes** - Describe and fix bugs while away from computer
3. **Documentation Generation** - Generate docs/comments remotely
4. **Code Refactoring** - Direct Claude to refactor code patterns
5. **Test Writing** - Add tests to existing code remotely

### DevOps Use Cases

6. **CI/CD Troubleshooting** - Debug pipeline issues remotely
7. **Log Analysis** - Have Claude analyze log files
8. **Config Management** - Update configuration files
9. **Script Generation** - Create automation scripts on the go

### Learning Use Cases

10. **Code Explanation** - Ask Claude to explain complex code
11. **Best Practices** - Get coding best practice recommendations
12. **Technology Research** - Research frameworks/libraries

### Collaboration Use Cases

13. **Async Pair Programming** - Work with Claude asynchronously
14. **Session Sharing** - Attach to sessions started elsewhere
15. **Multi-Project Context** - Switch between projects seamlessly

### Maintenance Use Cases

16. **Dependency Updates** - Update project dependencies
17. **Security Patches** - Apply security fixes
18. **Legacy Code Migration** - Modernize old codebases

---

## Technical Implementation Details

### Session ID Generation

Sessions use ULID (Universally Unique Lexicographically Sortable Identifier):
- 26 characters, base32 encoded
- Timestamp-based for sorting
- Example: `01HGXK7D8E4F5G6H7J8K9L0M1N`

### Message Flow Implementation

```typescript
// User message -> Bot -> SessionManager -> ClaudeCodeProcess
this.sessionManager.sendToActiveSession(text);

// ClaudeCodeProcess spawns:
spawn(this.resolvedCliPath, [
  '--print',
  '--verbose',
  '--output-format', 'stream-json',
  '--resume', this.claudeSessionId, // For follow-ups
  prompt
], { cwd: this.workingDir });
```

### Question Detection

```typescript
// OutputParser detects AskUserQuestion tool
if (block.name === 'AskUserQuestion') {
  const question = this.parseQuestion(toolUseBlock);
  if (question) {
    this.emit('question', question);
  }
}
```

### Inline Keyboard Generation

```typescript
// Options presented as 2-per-row buttons
for (let i = 0; i < question.options.length; i += 2) {
  const row: InlineButton[] = [];
  row.push({ text: question.options[i].label, callback_data: `answer:${i}` });
  // ... add second button if exists
  buttons.push(row);
}
// Always add "Other" button for custom input
buttons.push([{ text: 'Other (type custom response)', callback_data: 'answer:custom' }]);
```

### Environment Isolation

```typescript
// Clean environment for child processes
const cleanEnv = { ...process.env };
delete cleanEnv.CLAUDE_SESSION_ID;
delete cleanEnv.CLAUDECODE;
delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
```

---

## Troubleshooting Guide

### Issue: Bot Not Responding

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| No response at all | Bot not running | Check `npm start` output |
| "Unauthorized" message | User ID not in whitelist | Add ID to `ALLOWED_USER_IDS` |
| No feedback after message | No active session | Create session with `/new` |

### Issue: Claude CLI Problems

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| "Claude CLI not found" | CLI not installed | Install Claude Code CLI |
| "Claude CLI not found" | Wrong path | Set `CLAUDE_CLI_PATH` in .env |
| Authentication errors | CLI not authenticated | Run `claude` manually first |

### Issue: Session Problems

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| "No active session" | No session created | Use `/new` to create session |
| "Session not found" | Wrong session ID | Use `/list` to find correct ID |
| Session crashed | Process error | Check error message, use `/new` |
| Directory not found | Invalid path | Verify path exists and is accessible |

### Issue: Message Problems

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Truncated messages | Telegram 4096 char limit | Expected behavior for long responses |
| No response to prompt | Claude processing | Wait or use `/abort` |
| Question not showing buttons | Parsing error | Check logs, report bug |

### Issue: Session Discovery

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| `/sessions` shows nothing | No Claude history | Use Claude CLI manually first |
| `/attach` fails | Session ID not found | Use `/sessions` to verify ID |
| Partial ID not matching | ID too short | Use at least 8 characters |

### Issue: Process Control

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| `/abort` not working | Process not interruptible | Use `/kill` instead |
| `/kill` not stopping | Process hanging | Wait a few seconds, try `/close` |
| Session still shows active | State not updated | Use `/status` to verify |

---

## Security Model

### Authorization Flow

```
1. User sends message
2. Middleware extracts user ID from ctx.from.id
3. ID checked against allowedUsers Set
4. Unauthorized users receive error and are logged
5. Authorized users proceed to command processing
```

### Protected Elements

| Element | Protection |
|---------|------------|
| Bot Access | User ID whitelist |
| Session Access | All sessions tied to authorized users |
| File System | Limited by working directory |
| Credentials | Not stored; inherited from Claude CLI |
| Environment | Child processes have sanitized env |

### Security Best Practices

1. Keep `ALLOWED_USER_IDS` minimal
2. Use dedicated Telegram bot
3. Monitor `/list` for unexpected sessions
4. Restrict `DEFAULT_WORKING_DIR` scope
5. Keep dependencies updated
6. Never commit `.env` file

---

## Limitations and Known Issues

### Current Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Single user per session | No concurrent access | Create separate sessions |
| No persistent state | Sessions lost on restart | Session history preserved in Claude |
| 4096 char message limit | Long responses truncated | Expected Telegram limitation |
| No file uploads | Cannot send files via Telegram | Describe file contents in prompts |
| 5-second thinking debounce | May miss rapid updates | Design decision to reduce noise |

### Known Issues

| Issue | Description | Status |
|-------|-------------|--------|
| Overlapping commands | Warning logged, both proceed | By design |
| Long session IDs | Copy/paste carefully | Use partial IDs where supported |
| No message editing | Original text sent to Claude | Telegram limitation |

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Tested | Homebrew Claude CLI supported |
| Linux | Should work | Set `CLAUDE_CLI_PATH` if needed |
| Windows | Untested | May need path adjustments |

---

## Appendix: Type Definitions

### Session Interface

```typescript
interface Session {
  id: string;
  name: string;
  workingDir: string;
  status: 'active' | 'idle' | 'waiting_input' | 'error';
  createdAt: Date;
  lastActivity: Date;
}
```

### ParsedQuestion Interface

```typescript
interface ParsedQuestion {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface QuestionOption {
  label: string;
  description?: string;
}
```

### Configuration Interfaces

```typescript
interface TelegramBotConfig {
  token: string;
  allowedUserIds: number[];
  sessionManagerConfig?: SessionManagerConfig;
}

interface SessionManagerConfig {
  claudeCliPath?: string;
  defaultWorkingDir?: string;
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document Type | Feature Analysis |
| Project | Claude Code Telegram Bot |
| Version Analyzed | 1.0.0 |
| Analysis Date | 2026-01-27 |
| Total Source Files | 11 TypeScript files |
| Total Lines of Code | ~2,500 lines |
| Test Coverage | 157 tests |
| Dependencies | 4 runtime, 7 dev |
