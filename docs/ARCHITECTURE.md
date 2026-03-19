# Architecture

## Overview

claude-pager is a lightweight daemon that bridges local Claude Code instances to the remote user via notification channels.

## Main components

### 1. Claude Code Hooks

Minimalist shell scripts installed in `~/.claude/settings.json`. Two hooks:

- **SessionStart**: registers the mapping `session_id → PID → terminal window`
- **Notification**: detects `permission_prompt` and `idle_prompt`, sends the event to the daemon

Hooks are fire-and-forget: they POST JSON to the daemon's local API and exit immediately (hook timeout = 5s).

### 2. HTTP Daemon (`src/daemon/`)

Local API on `127.0.0.1:17380`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/events` | POST | Receive events from hooks |
| `/api/v1/respond` | POST | Receive user responses (from channel polling) |
| `/api/v1/pending` | GET | List pending questions |
| `/api/v1/sessions` | GET | List active sessions |
| `/api/v1/health` | GET | Health check |

The daemon manages active sessions and pending questions. It handles the full lifecycle: receive event → enrich → dispatch notification → receive response → inject into terminal.

### 3. Channels (Strategy Pattern)

`ChannelProvider` interface with pluggable implementations:

```
channels/
├── channel.ts           # Common interface
├── factory.ts           # Provider selection from config
├── ntfy/                # ntfy.sh / self-hosted
└── telegram/            # Telegram Bot API
```

Each channel can:
- Send an enriched notification (project, context, question)
- Handle the response callback (inline buttons, reply messages, etc.)

### 4. Injectors (Strategy Pattern)

`InputInjector` interface with per-platform implementations:

```
injectors/
├── injector.ts              # Common interface
├── factory.ts               # Platform-based selection
├── tmux/                    # tmux send-keys (Linux, preferred)
└── xdotool/                 # X11 window injection (Linux)
```

Each injector can:
- Find the terminal window associated with a session_id
- Type text into that window
- Send keystrokes (Enter, y/n)

### 5. Session Tracker

Mapping between Claude Code sessions and terminal windows:

- The SessionStart hook writes `~/.claude-pager/sessions/<session_id>.json` with `{ pid, tty, cwd, tmuxPane, timestamp }`
- The tracker uses the tmux pane or PID to find the target window
- Dead sessions are automatically cleaned up

## Full flow

```
1. A Claude Code instance requests a permission
   │
2. Notification hook fires → POST JSON to daemon :17380/api/v1/events
   │
3. Daemon enriches the event:
   - Looks up the session_id in the tracker
   - Identifies the project (cwd)
   - Formats a human-readable message
   │
4. Daemon dispatches to the configured ChannelProvider
   - Telegram: HTML message with inline keyboard (Allow/Deny)
   - ntfy: push notification with tags and priority
   │
5. User receives the notification on their phone
   - Taps a button, types a reply, or sends a voice message
   │
6. Response arrives via channel polling
   │
7. Daemon routes the response to the InputInjector
   - tmux: send-keys to the correct pane
   - xdotool: activate window, type response, press Enter
   │
8. Claude Code receives the input and continues
```

## Configuration

File `~/.claude-pager/config.json`:

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

## Security

- HTTP API binds to `127.0.0.1` only (no network exposure)
- ntfy topic must use token authentication
- Input validation with Fastify JSON Schema + custom validators
- No code content is sent in notifications (only question type and minimal context)
