# claude-pager

[![npm version](https://img.shields.io/npm/v/claude-pager.svg)](https://www.npmjs.com/package/claude-pager)
[![downloads](https://img.shields.io/npm/dm/claude-pager.svg)](https://www.npmjs.com/package/claude-pager)
[![license](https://img.shields.io/npm/l/claude-pager.svg)](https://github.com/sbassomp/claude-pager/blob/main/LICENSE)

Get paged on your phone when Claude Code needs input. Reply from Telegram or ntfy, and `claude-pager` types your response into the correct terminal.

![Dashboard](docs/screenshots/dashboard-v0.3.1.png)

[![Demo video](docs/screenshots/02-notification.png)](https://youtu.be/lwUlf4eXAk4)

> Click the image above to watch the demo (~50s)

## How it works

1. Claude Code hooks fire when an instance needs user input
2. The hook enriches the event (tool name, last assistant message) and sends it to the daemon
3. The daemon dispatches a notification to your phone via Telegram or ntfy
4. You respond — tap Allow/Deny, type a message, or send a voice note
5. The daemon matches the response to the right session and injects it via `tmux send-keys`

| Step | Screenshot |
|------|-----------|
| Claude Code asks for permission | ![Claude waiting](docs/screenshots/01-typing.png) |
| Notification arrives on your phone | ![Telegram notification](docs/screenshots/02-notification.png) |
| You reply from Telegram | ![Reply and allow](docs/screenshots/03-allow.png) |
| Claude resumes automatically | ![Result](docs/screenshots/04-result.png) |

## Features

- **Project notes** — capture ideas while agents work, send them when idle. Input via dashboard, Telegram ("Note pour X: ..."), CLI, or voice. Supports image paste.
- **Web dashboard** — live view of all sessions at `http://localhost:17380/dashboard`, with Allow/Deny buttons, text replies, diff previews, notes panel, CI/CD status, and git info
- **Multi-session** — run N Claude Code instances in tmux, responses route to the correct pane
- **Telegram** — inline keyboards (Allow/Deny), reply-to-message routing, voice transcription (Whisper)
- **ntfy** — self-hosted or ntfy.sh, mobile push notifications
- **CI/CD integration** — GitLab and GitHub pipeline status per project (main/staging)
- **Smart tmux titles** — terminal tabs auto-update with the current session topic
- **Session recovery** — `claude-pager recover` detects existing Claude sessions in tmux
- **Smart routing** — `#id response` for explicit targeting, auto-route for single session, session picker for ambiguous cases
- **Fallback by project** — if a session UUID is no longer registered, matches by `cwd` (project directory)

## Requirements

- Node.js >= 20
- tmux (for response injection — `brew install tmux` on macOS, `apt install tmux` on Debian/Ubuntu)
- Linux, macOS, or WSL (see [Windows support](#windows-support))
- A Telegram bot or ntfy server for notifications

> **macOS note:** the `xdotool` injector is X11-only and unavailable. Use the default `tmux` injector (recommended) or the [VS Code extension](vscode-extension/) for response injection. The daemon, dashboard, and notifications all work natively.

## Installation

```bash
npm install -g claude-pager
```

## Setup

Interactive configuration — creates `~/.claude-pager/config.json` and installs Claude Code hooks in `~/.claude/settings.json`:

```bash
claude-pager setup
```

The setup wizard lets you choose between **Telegram** and **ntfy** as notification channel, and verifies the connection.

### Telegram

You need a Telegram bot token (from [@BotFather](https://t.me/BotFather)) and a chat ID. The setup command walks you through obtaining both.

### ntfy

Point to your ntfy server (self-hosted or `https://ntfy.sh`) with a topic and optional authentication (user/password or token).

## Usage

### Start the daemon

```bash
# Foreground (for testing)
claude-pager start

# As a systemd user service (recommended)
cat > ~/.config/systemd/user/claude-pager.service << 'EOF'
[Unit]
Description=Claude Code Relay Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/claude-pager start
ExecStop=%h/.local/bin/claude-pager stop
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF
# If claude-pager is installed via nvm, adjust ExecStart path:
#   ExecStart=/home/you/.nvm/versions/node/v22.x.x/bin/claude-pager start
systemctl --user daemon-reload
systemctl --user enable --now claude-pager
```

### Launch Claude Code in tmux

```bash
claude-pager run              # opens a new tmux session with claude
claude-pager run --resume     # pass args through to claude
```

Or just run `claude` directly inside tmux — the `SessionStart` hook registers the session automatically.

### Recover existing sessions

If you already have Claude Code running in tmux panes:

```bash
claude-pager recover
```

### Other commands

```bash
claude-pager status           # daemon status + health check
claude-pager pending          # list pending questions
claude-pager stop             # stop the daemon
```

## Responding to notifications

### Telegram

- **Permission prompts** — tap the inline **Allow** or **Deny** button
- **Idle prompts** — reply to the notification message with your answer
- **Voice** — send a voice message, it gets transcribed and injected
- **Free messages** — send a message without replying; if one session is active it goes there, otherwise a session picker appears

### ntfy

- Reply with `#<id> <response>` to target a specific notification
- If only one question is pending, any reply routes to it
- `allow` / `deny` auto-route to the most recent permission prompt

## Web Dashboard

Open `http://127.0.0.1:17380/dashboard` in your browser. The dashboard shows:

- All active sessions grouped by project
- **Allow/Deny buttons** for permission prompts — respond without switching to Telegram
- **Text input** for idle sessions — send a message directly to any Claude instance
- **CI/CD pipeline status** per project (GitLab / GitHub Actions)
- **Git status** — branch, modified files, unpushed commits, committed/pushed flags
- **"Needs Testing"** badge when CI fails or code is unpushed
- **Pin projects** to lock their dashboard position
- **Expandable titles** — click "..." to see the full message
- **Dismiss button** (🗑) to remove stale sessions
- **Diff preview** for Edit permission prompts — see what will change before allowing
- **Notes panel** per project — add, reorder, send, and delete notes inline
- SSE push for instant updates, polling as fallback
- tmux tab titles auto-update with the current session topic

> **Note:** Claude Code serializes permission prompts — each sub-agent waits for its response before the next one asks, even when running in parallel. To skip permission prompts for specific tools, configure `permissions.allow` in `~/.claude/settings.json`.

## Project Notes

Capture ideas while agents are busy. Notes are stored per project and can be sent to a session when it becomes idle.

### Adding notes

```bash
# CLI
claude-pager note myproject "fix the login CSS"
claude-pager notes                    # list all pending notes

# Telegram (text or voice)
Note pour myproject: fix the login CSS

# Dashboard
# Type in the "Add a note..." field, or paste an image (Ctrl+V)
```

### API

```bash
# Add a note
curl -X POST http://localhost:17380/api/v1/notes \
  -H 'Content-Type: application/json' \
  -d '{"project":"myproject","text":"fix the CSS"}'

# List notes
curl http://localhost:17380/api/v1/notes?project=myproject

# Send a note to its project's idle session
curl -X POST http://localhost:17380/api/v1/notes/<id>/send
```

Notes with images are stored in `~/.claude-pager/note-images/` (max 5 MB per image).

## Configuration

`~/.claude-pager/config.json`:

```json
{
  "port": 17380,
  "channel": {
    "type": "telegram",
    "telegram": {
      "botToken": "123456:ABC...",
      "chatId": 12345678
    }
  },
  "injector": "auto"
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `17380` | Daemon HTTP port (localhost only) |
| `channel.type` | `"ntfy"` | `"ntfy"` or `"telegram"` |
| `injector` | `"auto"` | `"auto"`, `"tmux"`, or `"xdotool"` |
| `ci.type` | — | `"gitlab"` or `"github"` (optional) |
| `ci.gitlab.url` | — | GitLab server URL |
| `ci.gitlab.token` | — | Personal access token (scope: `read_api`) |
| `ci.github.token` | — | Personal access token (scope: `actions:read`) |

The hook port can be overridden with `CLAUDE_PAGER_PORT` environment variable.

## Windows Support

claude-pager works on Windows through **WSL** (Windows Subsystem for Linux). This is the recommended setup.

### Quick start (WSL)

1. Install WSL if you don't have it:
   ```powershell
   wsl --install
   ```

2. Inside WSL, install Node.js, tmux, and claude-pager:
   ```bash
   sudo apt update && sudo apt install -y tmux
   curl -fsSL https://fnm.vercel.app/install | bash  # or nvm
   fnm install 22
   npm install -g claude-pager
   ```

3. Configure and run:
   ```bash
   claude-pager setup
   claude-pager start &
   claude-pager run
   ```

4. Open the dashboard from Windows at `http://localhost:17380/dashboard` — WSL forwards the port automatically.

### Tips

- **Notifications work from anywhere** — Telegram, ntfy, and the web dashboard all work regardless of OS since they're HTTP-based.
- **VS Code + WSL** — open your project with `code .` from WSL. The integrated terminal runs inside WSL, so tmux works normally.
- **Windows Terminal** — pin a WSL tab for your claude-pager sessions. tmux inside Windows Terminal works great.
- **Multiple distros** — claude-pager runs in whichever WSL distro you install it in. Sessions don't cross distro boundaries.

### Native Windows (without WSL)

Not currently supported. The response injection relies on tmux, which requires a Unix environment. A VS Code extension for native Windows support is on the roadmap.

## Architecture

Strategy + Factory pattern for pluggable components:

```
src/
├── channels/          # Notification channels (ntfy, telegram)
│   ├── channel.ts     # ChannelProvider interface
│   └── factory.ts
├── injectors/         # Terminal input injection (tmux, xdotool)
│   ├── injector.ts    # InputInjector interface
│   └── factory.ts
├── daemon/            # HTTP server + response routing
│   ├── server.ts      # Fastify routes with JSON Schema validation
│   └── handlers.ts    # Channel listener logic (routing, picker)
├── dashboard/         # Web dashboard (enricher, transcript, git, CI, HTML)
├── sessions/          # Session tracking + pending question store
├── hooks/             # Claude Code hook entry point
├── utils/             # Shared utilities (html, json, validation)
├── cli/               # Commander CLI
└── voice/             # Telegram voice transcription (Whisper)
```

See `docs/ARCHITECTURE.md` for the detailed flow.

## Security

- HTTP API binds to `127.0.0.1` only — no network exposure
- Input validation with Fastify JSON Schema + custom validators (`isValidEventType`, `isValidSessionId`)
- No shell injection — all child processes use `execFileSync` with argument arrays
- Minimal context in notifications — tool names, project names, and truncated tool input (max 300 chars)
- Memory-bounded maps (capped at 500-1000 entries)
- Safe JSON parsing with fallbacks for corrupted files

## Development

```bash
npm run build          # TypeScript compilation
npm test               # Run all tests (node:test)
npm run lint           # ESLint with typescript-eslint
npm run dev            # Dev mode (tsx watch)
```

## License

MIT
