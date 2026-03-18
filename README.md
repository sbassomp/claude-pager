# claude-relay

Remote notification and response relay for Claude Code CLI sessions.

When Claude Code needs your input (permission, question) and you're away from the machine, `claude-relay` sends you a notification on your phone and types your response back into the correct terminal.

## How it works

```
┌─────────────┐    hook stdin     ┌──────────────┐    ntfy/Matrix    ┌──────────┐
│ Claude Code  │ ───────────────► │ claude-relay  │ ────────────────► │ Phone    │
│ (N instances)│                  │   daemon      │ ◄──────────────── │ (reply)  │
└─────────────┘                  └──────┬───────┘                   └──────────┘
                                        │ xdotool / osascript
                                        ▼
                                 ┌──────────────┐
                                 │ Right terminal│
                                 └──────────────┘
```

1. Claude Code hooks fire when an instance needs user input
2. The daemon receives the event and sends a notification to your phone
3. You respond (tap a button, type, or send a voice message)
4. The daemon injects your response into the correct terminal

## Installation

```bash
npm install -g claude-relay
claude-relay setup
claude-relay start
```

## Notification channels

| Channel | Status | Notes |
|---------|--------|-------|
| ntfy | MVP | Self-hosted or ntfy.sh, action buttons, mobile apps |
| Matrix | Planned | Bridges to WhatsApp/Signal via mautrix |
| Webhook | Planned | Slack, Discord, custom |

## Input injection

| Platform | Method | Status |
|----------|--------|--------|
| Linux (X11) | xdotool | MVP |
| Linux (Wayland) | ydotool/wtype | Planned |
| macOS | osascript | Planned |

## License

MIT
