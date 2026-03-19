# Channel: ntfy

## Why ntfy?

ntfy is one of the supported notification channels for claude-pager:

- **Self-hostable**: no dependency on a third-party service
- **Action buttons**: supports buttons with HTTP callbacks (Allow/Deny/Reply)
- **Mobile apps**: Android (F-Droid, Play Store) and iOS
- **Zero account required**: works with a simple topic (or token for auth)
- **Simple API**: one POST to send, polling to receive

## Notification format

```bash
curl -X POST https://ntfy.example.com/claude-pager \
  -H "Title: Claude Code — myproject" \
  -H "Priority: high" \
  -H "Tags: robot,question" \
  -d "#42 Permission requested: Bash(git push origin main)"
```

## Problem: callbacks to localhost

ntfy action buttons send HTTP requests from the **phone** (or the ntfy server). They cannot reach `127.0.0.1:17380` directly.

### Possible solutions

1. **Reverse tunnel**: expose the daemon via a tunnel (cloudflared, ngrok, bore)
2. **ntfy + polling**: instead of callbacks, the daemon polls the ntfy topic for responses
3. **Intermediate server**: a small public endpoint that relays responses
4. **VPN**: if the phone is on the same VPN as the machine

### Recommended solution: topic polling

The simplest and most secure approach. The user **replies to the ntfy message** (native app feature). The daemon polls the topic with a filter on responses:

```bash
# The daemon subscribes to the topic via polling
curl -s "https://ntfy.example.com/claude-pager/json?poll=1&since=30s"
```

No need to expose the daemon to the internet. No tunnel. Just polling on the existing ntfy topic.

## Configuration

```json
{
  "channel": {
    "type": "ntfy",
    "ntfy": {
      "server": "https://ntfy.example.com",
      "topic": "claude-pager",
      "token": "tk_..."
    }
  }
}
```

## Prerequisites

- A working ntfy instance (self-hosted or ntfy.sh)
- ntfy app installed on your phone
- Topic configured with authentication (recommended)
