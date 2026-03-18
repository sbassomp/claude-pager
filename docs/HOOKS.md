# Hooks Claude Code

## Principe

Claude Code supporte un système de hooks configurés dans `~/.claude/settings.json`. Les hooks sont des commandes shell exécutées en réponse à des événements du cycle de vie d'une session.

## Hooks utilisés par claude-relay

### SessionStart

Déclenché au démarrage de chaque session Claude Code. Enregistre le mapping session → terminal.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "claude-relay-hook session-start",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
```

Le hook reçoit sur stdin :
```json
{
  "session_id": "abc-123",
  "cwd": "/home/user/dev/myproject"
}
```

Il écrit dans `~/.claude-relay/sessions/<session_id>.json` :
```json
{
  "session_id": "abc-123",
  "pid": 12345,
  "tty": "/dev/pts/3",
  "cwd": "/home/user/dev/myproject",
  "timestamp": 1710000000
}
```

### Notification

Déclenché quand Claude Code a besoin d'une interaction utilisateur.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "claude-relay-hook notification",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

Le hook reçoit sur stdin le JSON de l'événement et le poste au daemon :
```bash
curl -s -X POST http://127.0.0.1:17380/api/v1/events \
  -H "Content-Type: application/json" \
  -d @- < /dev/stdin
```

## Types d'événements Notification

| Type | Description | Action attendue |
|------|-------------|-----------------|
| `permission_prompt` | Claude demande la permission d'exécuter un outil | Allow / Deny |
| `idle_prompt` | Claude attend un input depuis > 60s | Réponse libre |

## Installation des hooks

La commande `claude-relay setup` modifie automatiquement `~/.claude/settings.json` pour ajouter ces hooks. Elle préserve les hooks existants.
