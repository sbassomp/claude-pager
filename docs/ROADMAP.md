# Roadmap

## Phase 1 — MVP

Goal: working notification and response relay on Linux.

- [x] HTTP daemon (start/stop/status, PID file, signal handling)
- [x] Notification hook (detect permission_prompt, idle_prompt)
- [x] SessionStart hook (session → terminal mapping)
- [x] Session tracker (PID/tmux pane → window)
- [x] Channel ntfy (push notification with priority and tags)
- [x] Channel Telegram (inline keyboards, reply routing, voice transcription)
- [x] Injector tmux (send-keys to the correct pane)
- [x] Injector xdotool (type + keypress in the right terminal)
- [x] CLI: `claude-pager setup`, `start`, `stop`, `status`, `pending`, `recover`
- [x] Systemd user service for auto-start
- [ ] Publish npm package

## Phase 2 — Messaging & Platform support

Goal: rich communication channels and cross-platform support.

- [ ] Channel Matrix (send + receive messages)
- [ ] Bridge WhatsApp via mautrix-whatsapp
- [ ] Bridge Signal via mautrix-signal
- [ ] macOS support (AppleScript injector)
- [ ] Generic webhook channel (Slack, Discord)

## Phase 3 — Intelligence

Goal: reduce noise, automate simple decisions.

- [ ] Auto-approve rules (patterns for always-allowed commands)
- [ ] Web dashboard for pending questions
- [ ] Multi-machine support (relay events from remote machines)
- [ ] Wayland support (ydotool/wtype)
- [ ] Distribution as a Claude Code plugin (marketplace)
