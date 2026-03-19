# Claude Code Hooks

## Overview

Claude Code supports a hook system configured in `~/.claude/settings.json`. Hooks are shell commands executed in response to session lifecycle events.

## Hooks used by claude-pager

### SessionStart

Triggered when a Claude Code session starts. Registers the session → terminal mapping.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "claude-pager-hook session-start",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
```

The hook receives on stdin:
```json
{
  "session_id": "abc-123",
  "cwd": "/home/user/dev/myproject"
}
```

It writes to `~/.claude-pager/sessions/<session_id>.json`:
```json
{
  "sessionId": "abc-123",
  "pid": 12345,
  "tty": "/dev/pts/3",
  "cwd": "/home/user/dev/myproject",
  "tmuxPane": "%0",
  "timestamp": 1710000000
}
```

### Notification

Triggered when Claude Code needs user interaction.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "claude-pager-hook notification",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

The hook receives the event JSON on stdin, enriches it with tool context from the transcript, and forwards it to the daemon.

## Notification event types

| Type | Description | Expected action |
|------|-------------|-----------------|
| `permission_prompt` | Claude requests permission to run a tool | Allow / Deny |
| `idle_prompt` | Claude is waiting for user input (idle > 60s) | Free-text response |

## Hook installation

The `claude-pager setup` command automatically modifies `~/.claude/settings.json` to add these hooks. It preserves any existing hooks.
