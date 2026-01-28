# Claude Code Telegram Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Telegraf](https://img.shields.io/badge/Telegraf-4.16-blue.svg)](https://telegraf.js.org/)
[![100% Built with Babysitter](https://img.shields.io/badge/100%25%20Built%20with-Babysitter%20🧙-blueviolet)](https://a5c.ai)

A Telegram bot that bridges your mobile device with Anthropic's Claude Code CLI, enabling remote operation from anywhere. Create sessions, manage multiple projects, and interact with Claude's agentic coding capabilities directly through Telegram.

## Features

### Core Features
- **Remote Access** - Control Claude Code CLI from your phone or any device with Telegram
- **Session Management** - Create, list, switch between, and close multiple Claude Code sessions
- **Interactive Q&A** - Receive Claude's questions as Telegram messages with inline response buttons
- **Conversation Continuity** - Sessions maintain context across messages using `--resume`
- **Multi-Project Support** - Manage multiple project directories simultaneously

### Session Discovery & Attachment
- **Existing Session Discovery** - Scan and list Claude sessions running anywhere on your system
- **Session Attachment** - Attach to sessions started from terminal or other tools
- **Partial ID Matching** - Use just the first 8 characters of a session ID

### Control & Monitoring
- **Real-time Progress** - Get notified when Claude is thinking, executing tools, or waiting for input
- **Process Control** - Abort operations with `/abort`, send ESC with `/escape`, or force kill with `/kill`
- **Startup Notifications** - 🚀 See when Claude starts processing your request
- **Configurable Notifications** - Control which notifications you receive (completion, error, warning, progress)
- **Verbosity Levels** - Choose between minimal, normal, or verbose output

### Voice & File Input
- **Voice Messages** - Send voice messages that get transcribed via OpenAI Whisper and sent to Claude
- **File Uploads** - Upload documents, code files, and images directly to Claude
- **Photo Support** - Send photos with captions for Claude to analyze

### Utility Commands
- **File Operations** - View file contents (`/file`), git diffs (`/diff`), directory trees (`/tree`)
- **Git Integration** - Quick access to git status, branches, logs, and more (`/git`)
- **Output History** - Review recent Claude output (`/log`)
- **Bookmarks** - Save and recall frequently used prompts (`/bookmark`)
- **Context & Cost Tracking** - Monitor token usage (`/context`) and session costs (`/cost`)

### Integration
- **Skill Forwarding** - Forward Claude Code slash commands (like `/babysitter:call`)
- **Babysitter Support** - Special 🤹 feedback for babysitter orchestration commands

### Security
- **Whitelist Security** - Only authorized Telegram user IDs can interact with the bot
- **Environment Isolation** - Child processes are spawned with clean environment variables
- **Input Validation** - Message length limits (10KB max) to prevent abuse
- **Rate Limiting** - Built-in rate limiting to prevent message flooding
- **Path Traversal Protection** - File operations restricted to session working directory

---

## Important Security Notice

**This bot runs with `--dangerously-skip-permissions` enabled.**

With `--dangerously-skip-permissions`, **all of these actions happen without asking**. Claude will automatically read, write, delete files, run commands, and modify your system based on your prompts.

**Recommended use cases:**
- Sandboxed development environments (Docker, VMs)
- Disposable/ephemeral environments
- Projects with version control where changes can be reverted
- Environments with no access to sensitive data or credentials

**NOT recommended for:**
- Production servers
- Systems with sensitive data (credentials, keys, personal info)
- Shared systems with other users' data
- Environments without backups

---
## How It Works

The bot acts as a bridge between Telegram and the Claude Code CLI:

1. **User sends a message** via Telegram
2. **TelegramBot** receives the message, verifies authorization, and forwards it to the active session
3. **SessionManager** routes the input to the correct **ClaudeCodeProcess**
4. **ClaudeCodeProcess** spawns the Claude CLI with `--dangerously-skip-permissions --print --output-format stream-json`
5. **OutputParser** processes the streaming JSON output, detecting questions, tool calls, and text responses
6. Parsed output is formatted and sent back to the user via Telegram
7. For follow-up messages, `--resume <session_id>` maintains conversation continuity

When Claude asks a question (via the `AskUserQuestion` tool), the bot presents options as inline keyboard buttons, making it easy to respond from mobile.

### Claude Code Skills & Slash Commands

The bot supports forwarding Claude Code slash commands and skills directly. Any message starting with `/` that isn't a bot command gets forwarded to Claude:

```
/babysitter:call run the tests and fix any failures
```

Special feedback is provided for babysitter commands:
- 🤹 `Sent to the Babysitter.` - For `/babysitter:*` commands
- `Sent to Claude session.` - For other slash commands

## Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Claude Code CLI** - Installed and authenticated ([Installation Guide](https://docs.anthropic.com/en/docs/claude-code))
- **Telegram Bot Token** - Create via [@BotFather](https://t.me/BotFather)

## Installation

### Quick Install (npm)

```bash
npm install -g claude-code-telegram-bot
```

Then create a `.env` file with your configuration and run:

```bash
claude-code-telegram-bot
```

### From Source

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/claude-code-telegram-bot.git
   cd claude-code-telegram-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment configuration:**
   ```bash
   cp .env.example .env
   ```

4. **Configure your `.env` file:**
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ALLOWED_USER_IDS=123456789,987654321
   DEFAULT_WORKING_DIR=/path/to/your/projects
   LOG_LEVEL=info
   ```

   > **Finding your Telegram user ID:** Message [@userinfobot](https://t.me/userinfobot) on Telegram - it will reply with your numeric ID.

5. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

> **Production Deployment:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for PM2, Docker, and systemd deployment guides.

## Configuration

### Required Settings

| Variable | Description | Required | Default |
|----------|-------------|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) | Yes | - |
| `ALLOWED_USER_IDS` | Comma-separated list of authorized Telegram user IDs | Yes | - |

### Optional Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_WORKING_DIR` | Default directory for new sessions | Current directory |
| `LOG_LEVEL` | Logging level (`error`, `warn`, `info`, `debug`) | `info` |
| `CLAUDE_CLI_PATH` | Absolute path to claude CLI executable | Auto-detected |
| `DEFAULT_VERBOSITY` | Output verbosity (`minimal`, `normal`, `verbose`) | `normal` |

### Voice Transcription (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `VOICE_ENABLED` | Enable voice message transcription | `false` |
| `OPENAI_API_KEY` | OpenAI API key for Whisper transcription | - |

### File Uploads (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `FILE_UPLOAD_ENABLED` | Enable file upload support | `false` |
| `MAX_FILE_SIZE_MB` | Maximum file size in megabytes | `10` |

### Claude CLI Path Resolution

The bot automatically searches for the Claude CLI in common locations:
- `/opt/homebrew/bin/claude` (macOS Homebrew - Apple Silicon)
- `/usr/local/bin/claude` (macOS Homebrew - Intel / Linux)
- `/usr/bin/claude` (Linux system-wide)

Set `CLAUDE_CLI_PATH` if your installation is in a different location.

## Commands

### Session Management

| Command | Description | Example |
|---------|-------------|--------|
| `/start` | Welcome message and quick help | `/start` |
| `/help` | Show all available commands | `/help` |
| `/new <name> [dir]` | Create a new Claude Code session | `/new myproject /path/to/project` |
| `/cd <path>` | Change working directory of current session | `/cd /home/user/another-project` |
| `/list` | List all active sessions | `/list` |
| `/switch <id>` | Switch to a different session | `/switch 01HGXK...` |
| `/close <id>` | Close and terminate a session | `/close 01HGXK...` |
| `/status` | Show current session details | `/status` |

### Session Control

| Command | Description | Example |
|---------|-------------|--------|
| `/abort` | Send Ctrl+C to abort current operation | `/abort` |
| `/escape` | Send ESC key to interrupt and allow new prompt | `/escape` |
| `/kill` | Force kill current Claude process (hard stop) | `/kill` |

### Existing Session Discovery

| Command | Description | Example |
|---------|-------------|--------|
| `/sessions` | List existing Claude sessions on your system | `/sessions` |
| `/attach <id> [dir]` | Attach to an existing Claude session | `/attach abc12345` |

### File & Git Operations

| Command | Description | Example |
|---------|-------------|--------|
| `/file <path> [--raw]` | View file contents or directory listing | `/file src/index.ts` |
| `/diff [--staged] [path]` | Show git diff (unstaged, staged, or by path) | `/diff --staged` |
| `/git [cmd] [args]` | Quick git operations (status, branch, log, etc.) | `/git status` |
| `/tree [depth] [path]` | Show directory tree | `/tree 3 src/` |
| `/pwd` | Show current working directory | `/pwd` |

### Utility Commands

| Command | Description | Example |
|---------|-------------|--------|
| `/log [n]` | View last n lines of output history | `/log 50` |
| `/bookmark [action]` | Save/recall/list prompts | `/bookmark save test "run tests"` |
| `/context` | Show context usage (tokens, percentage) | `/context` |
| `/cost` | Show session cost information | `/cost` |

### Feature Settings

| Command | Description | Example |
|---------|-------------|--------|
| `/voice [on\|off]` | Toggle voice message transcription | `/voice on` |
| `/upload [on\|off]` | Toggle file upload support | `/upload on` |
| `/verbosity [level]` | Set output verbosity (minimal/normal/verbose) | `/verbosity verbose` |
| `/notify <type> [on\|off]` | Configure notifications | `/notify error off` |

## Usage

### Creating Your First Session

```
/new backend-api /home/user/projects/my-api
```

This creates a new session named "backend-api" in the specified directory. The session automatically becomes active.

### Sending Prompts

Once a session is active, simply type your request:

```
Create a REST endpoint for user authentication using JWT tokens
```

Claude will process your request and respond with its plan, code changes, and any questions.

### Responding to Questions

When Claude needs input (e.g., confirming file changes), you'll receive a message with inline buttons:

```
Claude wants to create a new file:
auth/middleware.ts

[Yes, proceed] [No, skip] [Other...]
```

Tap a button to respond, or select "Other" to type a custom answer.

### Managing Multiple Sessions

**List all sessions:**
```
/list
```
Shows all active sessions with their IDs, names, status, and directories.

**Switch between sessions:**
```
/switch 01HGXK7D8E4F5G6H7J8K9L
```

**Close a session when done:**
```
/close 01HGXK7D8E4F5G6H7J8K9L
```

### Progress Indicators

The bot sends real-time status updates:
- 🚀 `Claude started processing...` - Session initialized
- `Thinking...` - Claude is reasoning (debounced to avoid spam)
- `Running: Read` - Tool execution in progress
- `Done` / `Failed` - Tool execution result

### Attaching to Existing Sessions

You can discover and attach to Claude sessions that were started outside of Telegram (e.g., from your terminal):

**List available sessions:**
```
/sessions
```

This scans your `~/.claude/history.jsonl` and shows recent sessions:
```
📁 my-project
   ID: `abc12345...`
   2h ago
   "Last message preview..."
```

**Attach to a session:**
```
/attach abc12345
```

You can use partial session IDs (first 8 characters) for convenience. The bot will:
1. Find the matching session
2. Use its working directory (or specify a custom one)
3. Resume the conversation with full context

**With custom directory:**
```
/attach abc12345 /path/to/project
```

### Force Killing Processes

If Claude gets stuck or you need to immediately stop processing:

```
/kill
```

This sends a hard kill signal to the Claude process. The session remains active, so you can continue sending messages.

> **Note:** `/abort` sends a soft interrupt (Ctrl+C), `/escape` sends ESC to allow a new prompt, while `/kill` is a hard termination.

### Using Voice Messages

If voice transcription is enabled (`VOICE_ENABLED=true` with `OPENAI_API_KEY`):

1. Enable voice for your user: `/voice on`
2. Send a voice message in Telegram
3. The bot transcribes it via OpenAI Whisper
4. Transcribed text is sent to Claude

### Uploading Files

If file uploads are enabled (`FILE_UPLOAD_ENABLED=true`):

1. Enable uploads for your user: `/upload on`
2. Send a document or photo in Telegram
3. Supported files: code, text, images, PDFs (max 10MB default)
4. Text files are embedded in the message; images/binaries are saved and path sent to Claude

### Using Bookmarks

Save frequently used prompts:

```
/bookmark save tests "run all tests and fix any failures"
/bookmark save review "review the code for security issues"
```

Use saved prompts:
```
/bookmark tests
```

List all bookmarks:
```
/bookmark list
```

### Quick Git Operations

The `/git` command provides shortcuts for common operations:

```
/git status    (or /git s)   - Show short status
/git branch    (or /git b)   - Show branches with tracking info
/git log [n]   (or /git l)   - Show last n commits (default 5)
/git stash                   - List stashed changes
/git remote                  - Show remotes
```

### Viewing Files and Diffs

**View file contents:**
```
/file src/index.ts           - Show file content
/file src/                   - List directory contents
/file src/index.ts --raw     - Download as attachment
```

**View git changes:**
```
/diff                        - All unstaged changes
/diff --staged               - Staged changes only
/diff --stat                 - Summary of changes
/diff src/bot/               - Changes in specific path
```

### Configuring Notifications

Control which notifications you receive:

```
/notify completion on    - Notify when Claude finishes
/notify error off        - Disable error notifications
/notify progress on      - Show tool execution progress
/notify all on           - Enable all notifications
/notify                  - Show current settings
```

### Setting Verbosity

Choose how much output you see:

```
/verbosity minimal   - Questions only (quiet mode)
/verbosity normal    - Standard output (default)
/verbosity verbose   - All details including tool progress
```

## Architecture

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
               +-------------------+       |                 |
                         |                 v                 |
                         |         ~/.claude/                |
                         |         history.jsonl             |
                         |                                   |
                         |         Streaming JSON            |
                         +<----------------------------------+
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| **TelegramBot** | `src/bot/TelegramBot.ts` | Handles Telegram commands, user authorization, message routing, output forwarding, and feature management (2100+ lines) |
| **SessionManager** | `src/session/SessionManager.ts` | Creates, tracks, and manages multiple Claude sessions with ULID-based IDs |
| **ClaudeCodeProcess** | `src/session/ClaudeCodeProcess.ts` | Spawns Claude CLI processes with `--dangerously-skip-permissions`, maintains conversation via `--resume` |
| **OutputParser** | `src/parser/OutputParser.ts` | Parses streaming JSON, detects `AskUserQuestion` tool calls, emits typed events |
| **ClaudeSessionScanner** | `src/utils/ClaudeSessionScanner.ts` | Scans `~/.claude/` for existing sessions, enables session discovery and attachment |
| **VoiceHandler** | `src/utils/VoiceHandler.ts` | Handles voice message transcription via OpenAI Whisper API |
| **FileHandler** | `src/utils/FileHandler.ts` | Manages file uploads, validation, temp storage, and cleanup |
| **NotificationManager** | `src/notifications/NotificationManager.ts` | Manages per-user notification preferences and delivery |

### Event Flow

```
OutputParser emits:
  - 'started'   -> 🚀 Session initialized (system init message)
  - 'thinking'  -> Claude is processing (content_block_start)
  - 'text'      -> Assistant text response content
  - 'question'  -> Interactive question from Claude (AskUserQuestion tool)
  - 'tool_call' -> Any tool invocation (Read, Write, Bash, etc.)
  - 'progress'  -> Tool execution start/end notifications
  - 'output'    -> Raw parsed JSON output (for debugging)
```

```
ClaudeCodeProcess emits:
  - 'output'          -> Raw line of JSON from Claude CLI stdout
  - 'error'           -> Error from stderr or process errors
  - 'close'           -> Process terminated
  - 'message_complete'-> Single message exchange completed
```

## Development

### Running in Development Mode

```bash
npm run dev
```

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode for development
npm run test:coverage       # Generate coverage report
```

### Test Coverage

| Module | Tests | Coverage Areas |
|--------|-------|---------------|
| **TelegramBot** | Core commands, authorization, callbacks, utility commands |
| **SessionManager** | Session lifecycle, multi-session handling, directory changes |
| **OutputParser** | JSON parsing, question detection, Telegram formatting |
| **FileHandler** | File validation, upload handling, cleanup |
| **VoiceHandler** | Voice transcription, API integration |
| **NotificationManager** | Notification preferences, delivery |
| **Integration** | End-to-end flows, message routing, error handling |
| **Real E2E** | Real Claude CLI integration, actual responses |
| **Session Attach** | Session scanning, attachment, conversation continuity |
| **Full Diagnostics** | Comprehensive 22-point system health check |
| **Comprehensive E2E** | 122 scenarios across 13 categories |

**Total: 490 tests across 14 test suites**

### Running Diagnostics

A comprehensive diagnostic test suite verifies all components:

```bash
npm test -- --testPathPattern=full-system-check --testTimeout=180000
```

This checks:
- Claude CLI availability and version
- ClaudeCodeProcess spawning and communication
- SessionManager operations
- OutputParser parsing and event emission
- ClaudeSessionScanner functionality
- End-to-end message flow
- Session resume with `--resume` flag
- Attach to existing sessions

### Project Structure

```
claude-code-telegram/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── bot/
│   │   └── TelegramBot.ts          # Telegram bot implementation (2100+ lines)
│   ├── session/
│   │   ├── SessionManager.ts       # Session lifecycle management (410 lines)
│   │   └── ClaudeCodeProcess.ts    # CLI process wrapper (274 lines)
│   ├── parser/
│   │   └── OutputParser.ts         # Streaming JSON parser (350+ lines)
│   ├── utils/
│   │   ├── ClaudeSessionScanner.ts # Existing session discovery
│   │   ├── VoiceHandler.ts         # Voice message transcription
│   │   ├── FileHandler.ts          # File upload handling
│   │   └── index.ts                # Utils exports
│   ├── notifications/
│   │   └── NotificationManager.ts  # Notification preferences
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces (227 lines)
│   └── config/
│       └── index.ts                # Configuration management
├── tests/
│   ├── bot/                        # TelegramBot & command tests
│   ├── session/                    # SessionManager tests
│   ├── parser/                     # OutputParser tests
│   ├── utils/                      # FileHandler & VoiceHandler tests
│   ├── notifications/              # NotificationManager tests
│   ├── e2e/                        # Comprehensive E2E tests (122 scenarios)
│   ├── integration/                # Integration tests
│   │   ├── e2e.test.ts             # Mock integration tests
│   │   ├── real-e2e.test.ts        # Real Claude CLI tests
│   │   └── session-attach.test.ts  # Session attachment tests
│   └── diagnostics/
│       └── full-system-check.test.ts # 22-point system diagnostics
├── package.json
├── tsconfig.json
└── .env.example
```

## Troubleshooting

### Bot not responding

1. **Check authorization** - Verify your Telegram user ID is in `ALLOWED_USER_IDS`
2. **Verify token** - Ensure `TELEGRAM_BOT_TOKEN` is correct and the bot is running
3. **Check logs** - Run with `LOG_LEVEL=debug` for verbose output
4. **Confirm bot is started** - Look for "Telegram bot started successfully" in logs

### "No active session" error

Create a session first:
```
/new my-session /path/to/project
```

### Claude CLI not found

1. **Verify installation:** `claude --version`
2. **Check PATH:** Ensure Claude CLI is in your system PATH
3. **Set explicit path:** Add `CLAUDE_CLI_PATH=/full/path/to/claude` to `.env`

### Claude not responding to prompts

1. **Check session status:** `/status`
2. **Verify working directory exists:** The directory must be accessible
3. **Check Claude authentication:** Run `claude` manually to verify it works
4. **Abort stuck process:** Use `/abort` then send your prompt again

### Session crashes or exits unexpectedly

The bot handles process crashes gracefully. You'll see a notification:
```
Session crashed (exit code: 1) - use /new to restart
```

Simply create a new session to continue working.

### /sessions shows no sessions

1. **Check Claude history file exists:** `ls ~/.claude/history.jsonl`
2. **Verify Claude has been used:** You need at least one Claude session to have been started previously
3. **Check file permissions:** Ensure the bot process can read `~/.claude/`

### /attach fails to find session

1. **Use partial ID:** Try the first 8 characters of the session ID
2. **Check session exists:** Run `/sessions` to see available sessions
3. **Verify working directory:** If the original project directory moved, specify a new one:
   ```
   /attach abc12345 /new/path/to/project
   ```

### /kill doesn't stop Claude

1. **Wait a moment:** The kill signal may take a few seconds to process
2. **Check session status:** Use `/status` to see if the session is still active
3. **Close and recreate:** Use `/close` followed by `/new` to start fresh

### Long messages getting truncated

Telegram has a 4096 character limit per message. The bot automatically truncates long responses and adds "...(truncated)" indicator.

## Security

> **WARNING: Permission Bypass Enabled**
>
> This bot runs Claude CLI with the `--dangerously-skip-permissions` flag, which bypasses all permission checks. This means Claude can read, write, and execute files without asking for confirmation. **Only run this bot in trusted, sandboxed environments.** Do not use in production systems with sensitive data unless you fully understand the implications.

### Authorization

- **Whitelist-based access** - Only Telegram user IDs explicitly listed in `ALLOWED_USER_IDS` can interact with the bot
- **Per-message verification** - Every incoming message is checked against the whitelist before processing
- **Unauthorized access logging** - Failed authorization attempts are logged for monitoring

### Process Isolation

- **Clean environment** - Child Claude processes are spawned with sanitized environment variables
- **Session variables removed** - `CLAUDE_SESSION_ID`, `CLAUDECODE`, and `CLAUDE_CODE_ENTRYPOINT` are stripped to prevent conflicts
- **Isolated stdin** - Process stdin is set to `ignore` mode to prevent injection

### Input Validation & Rate Limiting

- **Message length limits** - Maximum 10,240 characters (10KB) per message
- **Rate limiting** - Minimum 1 second between messages to same chat
- **Message queue** - Maximum 50 queued messages to prevent flooding
- **File validation** - Size limits, extension whitelist, MIME type checks
- **Path traversal protection** - File operations restricted to session working directory

### Credential Safety

- **No credential storage** - The bot does not store any Claude API keys or credentials
- **Inherited authentication** - Claude CLI uses its own authentication mechanism (typically via `~/.claude`)
- **Environment file protection** - Keep `.env` out of version control (already in `.gitignore`)
- **Comprehensive gitignore** - Patterns for keys, secrets, logs, and audit outputs

### Best Practices

1. **Restrict user IDs** - Only add trusted users to `ALLOWED_USER_IDS`
2. **Use dedicated bot** - Create a new Telegram bot specifically for this purpose
3. **Monitor sessions** - Regularly check `/list` for unexpected sessions
4. **Limit working directories** - Consider restricting `DEFAULT_WORKING_DIR` to safe locations
5. **Keep updated** - Regularly update dependencies to patch security vulnerabilities
6. **Run in sandboxed environment** - Use Docker, VMs, or other isolation for production use
7. **Rotate credentials** - Periodically rotate Telegram bot token and any API keys

## Limitations / Known Issues

### Current Limitations

- **Single user per session** - Sessions are not designed for concurrent multi-user access
- **No persistent state** - Sessions are lost when the bot process restarts (conversation history is preserved in Claude)
- **Message size limits** - Telegram limits messages to 4096 characters; long responses are truncated
- **File size limits** - File uploads limited to 10MB by default (configurable)
- **Thinking debounce** - "Thinking..." messages are debounced to every 5 seconds to reduce noise
- **Input length limit** - Messages are limited to 10KB to prevent abuse

### Known Issues

- **Overlapping commands** - If a new message is sent while Claude is processing, a warning is logged but both proceed
- **Session ID display** - ULID session IDs are long; copy/paste carefully when using `/switch` or `/close`
- **No message editing** - Once sent, messages cannot be edited; Claude receives the original text

### Platform Notes

- **macOS** - Tested on macOS with Homebrew-installed Claude CLI
- **Linux** - Should work; ensure Claude CLI is in PATH or set `CLAUDE_CLI_PATH`
- **Windows** - Not tested; may require path adjustments for CLI location

## Contributing

Contributions are welcome! Here's how to get started:

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/claude-code-telegram-bot.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

### Guidelines

- **Write tests** - All new features should include tests
- **Follow TypeScript best practices** - Use proper types, avoid `any`
- **Keep commits focused** - One feature or fix per commit
- **Update documentation** - Update README if adding new features or commands

### Pull Request Process

1. Ensure all tests pass: `npm test`
2. Run the linter (if configured)
3. Update documentation as needed
4. Submit a pull request with a clear description
5. Link any related issues

### Areas for Contribution

- **Additional commands** - More session management features
- **Message formatting** - Better Telegram message formatting/styling
- **Error handling** - More graceful error recovery
- **Documentation** - Tutorials, examples, translations
- **Testing** - Increase test coverage, add edge cases
- **Voice features** - Additional voice processing options
- **Platform support** - Windows compatibility testing and fixes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Note:** This project is not officially affiliated with Anthropic. Claude Code is a product of Anthropic.

---

🧙 **100% Built using [Babysitter](https://github.com/a5c-ai/babysitter) by [a5c.ai](https://a5c.ai)** - AI-powered development orchestration.
