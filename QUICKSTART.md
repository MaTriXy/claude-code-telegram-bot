# Quick Start

> **Warning**: This bot runs Claude CLI with `--dangerously-skip-permissions`, bypassing all permission checks. Only use in trusted/sandboxed environments.

## Prerequisites

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
```

Edit `.env`:
```env
TELEGRAM_BOT_TOKEN=<your-bot-token>
ALLOWED_USER_IDS=<your-telegram-id>
```

> **Finding your user ID:** Message [@userinfobot](https://t.me/userinfobot) on Telegram - it replies with your numeric ID

```bash
# 3. Run
npm run build && npm start
```

## Usage

1. Message your bot on Telegram
2. `/new myproject /path/to/project` - Start a session
3. Type prompts normally - they go to Claude
4. Click buttons when Claude asks questions

## Commands

| Command | What it does |
|---------|--------------|
| `/new <name> [dir]` | Create session |
| `/cd <path>` | Change directory |
| `/list` | Show sessions |
| `/switch <id>` | Change session |
| `/close <id>` | End session |
| `/status` | Current session info |
| `/abort` | Cancel current operation |

## Troubleshooting

**Bot not responding?** Check your user ID is in `ALLOWED_USER_IDS`

**Claude not working?** Verify `claude --version` works in terminal
