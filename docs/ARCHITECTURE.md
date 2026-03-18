# Architecture

## Vue d'ensemble

claude-relay est un daemon léger qui sert de pont entre les instances Claude Code locales et l'utilisateur distant via des canaux de notification.

## Composants principaux

### 1. Hooks Claude Code

Scripts shell minimalistes installés dans `~/.claude/settings.json`. Deux hooks :

- **SessionStart** : enregistre le mapping `session_id → PID → terminal window`
- **Notification** : détecte `permission_prompt` et `idle_prompt`, envoie l'événement au daemon

Les hooks sont des fire-and-forget : ils postent le JSON sur l'API locale du daemon et sortent immédiatement (timeout hook = 5s).

### 2. Daemon HTTP (`src/daemon.ts` + `src/server.ts`)

API locale sur `127.0.0.1:17380` :

| Endpoint | Méthode | Rôle |
|----------|---------|------|
| `/api/v1/events` | POST | Reçoit les événements des hooks |
| `/api/v1/respond` | POST | Reçoit les réponses utilisateur (callback ntfy, Matrix, etc.) |
| `/api/v1/pending` | GET | Liste les questions en attente |
| `/api/v1/health` | GET | Health check |

Le daemon maintient l'état des sessions actives et des questions en attente. Il gère le cycle de vie complet : réception événement → enrichissement → dispatch notification → réception réponse → injection terminal.

### 3. Channels (Strategy Pattern)

Interface `ChannelProvider` avec implémentations pluggables :

```
channels/
├── channel.ts           # Interface commune
├── factory.ts           # Sélection du provider depuis la config
├── ntfy/                # ntfy.sh / self-hosted (MVP)
├── matrix/              # Matrix protocol (Phase 2)
└── webhook/             # Generic webhook (Phase 2)
```

Chaque channel sait :
- Envoyer une notification enrichie (projet, contexte, question)
- Gérer le callback de réponse (boutons HTTP, reply message, etc.)

### 4. Injectors (Strategy Pattern)

Interface `InputInjector` avec implémentations par plateforme :

```
injectors/
├── injector.ts              # Interface commune
├── factory.ts               # Sélection par plateforme
├── xdotool/                 # Linux X11 (MVP)
└── applescript/             # macOS (Phase 2)
```

Chaque injector sait :
- Trouver la fenêtre terminal associée à un session_id
- Taper du texte dans cette fenêtre
- Envoyer des touches (Enter, y/n)

### 5. Session Tracker

Mapping entre les sessions Claude Code et les fenêtres terminal :

- Le hook SessionStart écrit `~/.claude-relay/sessions/<session_id>.json` avec `{ pid, tty, cwd, timestamp }`
- Le tracker utilise le PID pour retrouver la fenêtre via `xdotool search --pid`
- Nettoyage automatique des sessions mortes

## Flux complet

```
1. Claude Code instance demande une permission
   │
2. Hook Notification fire → POST JSON vers daemon :17380/api/v1/events
   │
3. Daemon enrichit l'événement :
   - Retrouve le session_id dans le tracker
   - Identifie le projet (cwd)
   - Formate un message humain lisible
   │
4. Daemon dispatch vers le ChannelProvider configuré (ntfy)
   - ntfy: POST avec titre, message, action buttons (Allow/Deny/Reply)
   │
5. Utilisateur reçoit la notification sur son téléphone
   - Tape "Allow" ou une réponse custom
   │
6. Callback arrive sur /api/v1/respond
   │
7. Daemon route la réponse vers l'InputInjector
   - xdotool active la fenêtre, tape la réponse, appuie sur Enter
   │
8. Claude Code reçoit l'input et continue
```

## Configuration

Fichier `~/.claude-relay/config.json` :

```json
{
  "port": 17380,
  "channel": {
    "type": "ntfy",
    "ntfy": {
      "server": "https://ntfy.sh",
      "topic": "claude-relay-<random>",
      "token": "tk_..."
    }
  },
  "injector": "auto"
}
```

## Sécurité

- L'API HTTP ne bind que sur `127.0.0.1` (pas d'accès réseau)
- Le topic ntfy doit utiliser un token d'authentification
- Les réponses injectées sont validées (provenance du canal authentifié)
- Aucune donnée de code n'est envoyée dans les notifications (seulement le type de question et le contexte minimal)
