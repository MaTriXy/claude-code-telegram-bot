# Claude Code Telegram Bot

A Telegram bot that allows you to remotely operate Claude Code CLI from anywhere. Create sessions, manage multiple projects, and respond to Claude's questions directly from Telegram.

## Features

- **Session Management**: Create, list, switch between, and close Claude Code sessions
- **Question Handling**: Receive Claude's questions as Telegram messages with inline buttons
- **Remote Prompting**: Send prompts to Claude directly from Telegram
- **Multi-Session**: Manage multiple sessions simultaneously
- **Authorization**: Whitelist-based user authentication

## Prerequisites

- Node.js 18+
- Claude Code CLI installed and configured
- Telegram Bot Token (from @BotFather)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd claude-code-telegram-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ALLOWED_USER_IDS=123456789,987654321
   DEFAULT_WORKING_DIR=/path/to/your/projects
   LOG_LEVEL=info
   ```

   > **Finding your Telegram user ID:** Message [@userinfobot](https://t.me/userinfobot) on Telegram - it will reply with your numeric ID.

5. Build and start:
   ```bash
   npm run build
   npm start
   ```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Yes |
| `ALLOWED_USER_IDS` | Comma-separated Telegram user IDs | Yes |
| `DEFAULT_WORKING_DIR` | Default directory for new sessions | No |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | No |
| `CLAUDE_CLI_PATH` | Path to claude CLI (default: 'claude') | No |

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and quick help |
| `/help` | Show all available commands |
| `/new <name> [dir]` | Create a new Claude Code session |
| `/cd <path>` | Change working directory of current session |
| `/list` | List all active sessions |
| `/switch <id>` | Switch to a different session |
| `/close <id>` | Close and terminate a session |
| `/status` | Show current session details |
| `/abort` | Abort current Claude operation |

## Usage

### Creating a Session

```
/new my-project /path/to/project
```

This creates a new Claude Code session named "my-project" in the specified directory.

### Sending Prompts

Simply type your prompt and send it:

```
Create a function that calculates the factorial of a number
```

### Responding to Questions

When Claude asks a question, you'll receive a message with inline buttons. Click a button to select an option, or choose "Other" to type a custom response.

### Managing Sessions

List all sessions:
```
/list
```

Switch to a different session:
```
/switch 01ABCD...
```

Close a session:
```
/close 01ABCD...
```

## Development

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage report
```

### Project Structure

```
src/
  index.ts              # Main entry point
  bot/
    TelegramBot.ts      # Telegram bot implementation
  session/
    SessionManager.ts   # Manages Claude Code sessions
    ClaudeCodeProcess.ts # Wraps CLI interaction
  parser/
    OutputParser.ts     # Parses Claude Code output
  types/
    index.ts            # TypeScript interfaces
  config/
    index.ts            # Configuration management
tests/
  session/              # SessionManager tests
  parser/               # OutputParser tests
  bot/                  # TelegramBot tests
  integration/          # End-to-end tests
```

### Test Coverage

- **SessionManager**: 27 tests covering session lifecycle
- **OutputParser**: 26 tests for parsing and formatting
- **TelegramBot**: 29 tests for bot functionality
- **Integration**: 19 end-to-end tests

## Troubleshooting

### Bot not responding

1. Check that your Telegram user ID is in `ALLOWED_USER_IDS`
2. Verify the bot token is correct
3. Ensure the bot is running (`npm start`)

### "No active session" error

Create a session first using `/new session-name`

### Claude not responding

1. Check that Claude CLI is installed: `claude --version`
2. Verify the working directory exists
3. Check session status with `/status`

### Session crashes

The bot handles process crashes gracefully. Create a new session with `/new` if needed.

## Security

- Only users in `ALLOWED_USER_IDS` can interact with the bot
- Session processes are isolated
- No credentials are stored in the bot

## License

MIT
