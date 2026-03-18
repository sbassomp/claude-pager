# Roadmap

## Phase 1 — MVP

Objectif : notification et réponse fonctionnelles sur Linux avec ntfy.

- [ ] Daemon HTTP (start/stop/status, PID file, signal handling)
- [ ] Hook Notification (détection permission_prompt, idle_prompt)
- [ ] Hook SessionStart (mapping session → terminal)
- [ ] Session Tracker (PID → window ID via xdotool)
- [ ] Channel ntfy (notification avec action buttons Allow/Deny/Reply)
- [ ] Injector xdotool (type + keypress dans le bon terminal)
- [ ] CLI : `claude-relay setup`, `start`, `stop`, `status`, `pending`
- [ ] Service systemd user pour auto-start
- [ ] Package npm publiable

## Phase 2 — Messaging & Voice

Objectif : canaux de communication riches et support vocal.

- [ ] Channel Matrix (envoi + réception de messages)
- [ ] Bridge WhatsApp via mautrix-whatsapp
- [ ] Bridge Signal via mautrix-signal
- [ ] Voice bridge : transcription des messages vocaux via faster-whisper
- [ ] Support macOS (AppleScript injector)
- [ ] Channel webhook générique (Slack, Discord)

## Phase 3 — Intelligence

Objectif : réduire le bruit, automatiser les décisions simples.

- [ ] Auto-approve rules (patterns de commandes toujours autorisées)
- [ ] Contexte enrichi dans les notifications (dernières lignes de conversation)
- [ ] Web dashboard pour les questions en attente
- [ ] Support multi-machine (relay events depuis des machines distantes)
- [ ] Support Wayland (ydotool/wtype)
- [ ] Distribution comme plugin Claude Code (marketplace)
