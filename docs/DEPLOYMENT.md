# Deployment & Installation Guide

> Complete guide to installing, configuring, and deploying Claude Code Telegram Bot.

---

## Table of Contents

- [Installation Methods](#installation-methods)
  - [npm (Recommended)](#npm-recommended)
  - [From Source](#from-source)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
  - [Local Development](#local-development)
  - [PM2 (Production)](#pm2-production)
  - [Docker](#docker)
  - [Systemd Service](#systemd-service)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Installation Methods

### npm (Recommended)

Install globally to use as a CLI tool:

```bash
npm install -g claude-code-telegram-bot
```

Or add to your project:

```bash
npm install claude-code-telegram-bot
```

After installation, create your configuration:

```bash
# Create a directory for your bot
mkdir my-claude-bot && cd my-claude-bot

# Create environment file
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USER_IDS=123456789
DEFAULT_WORKING_DIR=/path/to/your/projects
LOG_LEVEL=info
EOF
```

Run the bot:

```bash
claude-code-telegram-bot
```

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-code-telegram-bot.git
cd claude-code-telegram-bot

# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the bot
npm start
```

---

## Configuration

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Telegram User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your numeric user ID (e.g., `123456789`)

### 3. Install Claude Code CLI

The bot requires Claude Code CLI to be installed and authenticated:

```bash
# Install Claude Code CLI (follow Anthropic's official guide)
# https://docs.anthropic.com/en/docs/claude-code

# Verify installation
claude --version

# Authenticate (if not already done)
claude auth
```

### 4. Create Environment File

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USER_IDS=123456789,987654321  # Comma-separated for multiple users

# Optional
DEFAULT_WORKING_DIR=/home/user/projects  # Default directory for new sessions
LOG_LEVEL=info                            # error, warn, info, debug
CLAUDE_CLI_PATH=/usr/local/bin/claude     # Custom path to Claude CLI
```

---

## Deployment Options

### Local Development

For development and testing:

```bash
# Run with hot reload (requires ts-node)
npm run dev

# Or build and run
npm run build && npm start
```

### PM2 (Production)

PM2 provides process management, auto-restart, and logging:

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot with PM2
pm2 start dist/index.js --name claude-telegram-bot

# Auto-start on system boot
pm2 startup
pm2 save

# Useful PM2 commands
pm2 status              # Check status
pm2 logs claude-telegram-bot  # View logs
pm2 restart claude-telegram-bot  # Restart
pm2 stop claude-telegram-bot     # Stop
```

Create an `ecosystem.config.cjs` for advanced PM2 configuration:

```javascript
module.exports = {
  apps: [{
    name: 'claude-telegram-bot',
    script: 'dist/index.js',
    cwd: '/path/to/claude-code-telegram-bot',
    env: {
      NODE_ENV: 'production',
    },
    env_file: '.env',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
  }]
};
```

Then run:

```bash
pm2 start ecosystem.config.cjs
```

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install Claude Code CLI dependencies (if needed)
RUN apk add --no-cache git curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/
COPY .env ./

# Run the bot
CMD ["node", "dist/index.js"]
```

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  claude-telegram-bot:
    build: .
    container_name: claude-telegram-bot
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    volumes:
      # Mount Claude CLI config (required for authentication)
      - ~/.claude:/root/.claude:ro
      # Mount your projects directory
      - /path/to/projects:/projects
    networks:
      - bot-network

networks:
  bot-network:
    driver: bridge
```

Run with Docker:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Systemd Service

Create `/etc/systemd/system/claude-telegram-bot.service`:

```ini
[Unit]
Description=Claude Code Telegram Bot
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/claude-code-telegram-bot
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=claude-telegram-bot
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable claude-telegram-bot

# Start the service
sudo systemctl start claude-telegram-bot

# Check status
sudo systemctl status claude-telegram-bot

# View logs
journalctl -u claude-telegram-bot -f
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token from @BotFather |
| `ALLOWED_USER_IDS` | Yes | - | Comma-separated Telegram user IDs |
| `DEFAULT_WORKING_DIR` | No | Current dir | Default directory for sessions |
| `LOG_LEVEL` | No | `info` | Logging level (error/warn/info/debug) |
| `CLAUDE_CLI_PATH` | No | Auto-detect | Path to Claude CLI executable |

### Claude CLI Path Resolution

The bot automatically searches for Claude CLI in:
1. `/opt/homebrew/bin/claude` (macOS Homebrew - Apple Silicon)
2. `/usr/local/bin/claude` (macOS Homebrew - Intel / Linux)
3. `/usr/bin/claude` (Linux system-wide)

Set `CLAUDE_CLI_PATH` if your installation is elsewhere.

---

## Security Considerations

### Permission Bypass Warning

This bot runs Claude CLI with `--dangerously-skip-permissions`, which bypasses all permission checks. Only deploy in:

- Sandboxed environments
- Docker containers with limited volume mounts
- VMs or isolated systems
- Environments without sensitive data

### Recommended Practices

1. **Restrict User IDs** - Only add trusted users to `ALLOWED_USER_IDS`
2. **Use Dedicated Bot** - Create a new Telegram bot specifically for this
3. **Limit Directories** - Set `DEFAULT_WORKING_DIR` to safe locations
4. **Monitor Activity** - Check logs regularly
5. **Keep Updated** - Update dependencies regularly

---

## Troubleshooting

### Bot not responding

```bash
# Check if bot is running
pm2 status  # or systemctl status claude-telegram-bot

# Check logs for errors
pm2 logs claude-telegram-bot
# or
journalctl -u claude-telegram-bot -n 50

# Verify bot token
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
```

### Claude CLI not found

```bash
# Verify Claude is installed
claude --version

# Find Claude location
which claude

# Set explicit path in .env
CLAUDE_CLI_PATH=/full/path/to/claude
```

### Permission denied errors

```bash
# Ensure working directory exists and is accessible
ls -la /path/to/working/dir

# Check Claude authentication
claude auth status
```

### Docker issues

```bash
# Verify Claude config is mounted
docker exec -it claude-telegram-bot ls -la /root/.claude

# Check if Claude works inside container
docker exec -it claude-telegram-bot claude --version
```

---

## Updating

### npm installation

```bash
npm update -g claude-code-telegram-bot
```

### From source

```bash
git pull
npm install
npm run build
pm2 restart claude-telegram-bot  # or systemctl restart
```

### Docker

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3
- **Telegram Framework**: Telegraf 4.16
- **Process Management**: Child process spawning
- **Testing**: Jest 29

---

🧙 **100% Built using [Babysitter](https://a5c.ai) by a5c.ai** - AI-powered development orchestration.
