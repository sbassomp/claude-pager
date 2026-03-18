# Channel ntfy

## Pourquoi ntfy ?

ntfy est le canal MVP pour claude-relay :

- **Self-hostable** : pas de dépendance à un service tiers
- **Action buttons** : supporte des boutons avec callbacks HTTP (Allow/Deny/Reply)
- **Apps mobile** : Android (F-Droid, Play Store) et iOS
- **Zéro compte requis** : fonctionne avec un simple topic (ou token pour l'auth)
- **API simple** : un POST pour envoyer, un callback pour recevoir

## Format de notification

```bash
curl -X POST https://ntfy.example.com/claude-relay \
  -H "Title: Claude Code — medcorp" \
  -H "Priority: high" \
  -H "Tags: robot,question" \
  -H "Actions: http, Allow, https://relay.local:17380/api/v1/respond, body='{\"event_id\":\"xxx\",\"response\":\"allow\"}'; \
               http, Deny, https://relay.local:17380/api/v1/respond, body='{\"event_id\":\"xxx\",\"response\":\"deny\"}'" \
  -d "Permission demandée : Bash(git push origin main)"
```

## Problème : callback vers localhost

Les action buttons ntfy envoient des requêtes HTTP depuis le **téléphone** (ou le serveur ntfy). Ils ne peuvent pas atteindre `127.0.0.1:17380` directement.

### Solutions possibles

1. **Tunnel reverse** : exposer le daemon via un tunnel (cloudflared, ngrok, bore)
2. **ntfy + polling** : au lieu de callbacks, le daemon poll le topic ntfy pour les réponses
3. **Serveur intermédiaire** : un petit endpoint public qui relaie les réponses
4. **VPN** : si le téléphone est sur le même VPN que la machine

### Solution recommandée : polling du topic ntfy

Le plus simple et le plus sécurisé. L'utilisateur **répond au message ntfy** (fonctionnalité native de l'app). Le daemon poll le topic avec un filtre sur les réponses :

```bash
# Le daemon subscribe au topic en SSE
curl -s "https://ntfy.example.com/claude-relay/sse?poll=1&since=10m"
```

Pas besoin d'exposer le daemon sur Internet. Pas de tunnel. Juste du polling sur le topic ntfy existant.

## Configuration

```json
{
  "channel": {
    "type": "ntfy",
    "ntfy": {
      "server": "https://ntfy.example.com",
      "topic": "claude-relay",
      "token": "tk_..."
    }
  }
}
```

## Prérequis

- Instance ntfy fonctionnelle (self-hosted ou ntfy.sh)
- App ntfy installée sur le téléphone
- Topic configuré avec authentification (recommandé)
