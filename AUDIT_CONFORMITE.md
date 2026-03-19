# Audit de conformite - claude-relay

**Date** : 2026-03-19 (v2)
**Projet** : claude-relay v0.1.0
**Langage** : TypeScript (Node.js >= 20)
**Framework** : Fastify 5, Commander 13
**Auditeur** : Audit automatise

---

## Note globale : 84/100

| Categorie | Score | Detail |
|-----------|-------|--------|
| Code (SOLID, structure, lisibilite) | 87/100 | Architecture Strategy+Factory solide, SRP respecte, utils extraits, handlers separes |
| Securite | 78/100 | Validation entrees, execFileSync, safeJsonParse, caps memoire. Reste quelques catches best-effort |
| Tests | 75/100 | 36 tests, 7 fichiers, couverture des utils/events/server. Manque injectors, hooks, voice |

---

## Metriques du projet

| Metrique | Valeur |
|----------|--------|
| Fichiers source (.ts) | 25 (hors tests) |
| Fichiers de test | 7 |
| Lignes de code total | 2 190 |
| Lignes de test | 400 |
| Ratio test/code | ~18% |
| Build | OK (zero erreur) |
| Tests | 36/36 pass |
| Lint (ESLint + typescript-eslint) | 0 erreur |
| npm audit | 0 vulnerabilite |

---

## Resume des violations

| Priorite | Nombre |
|----------|--------|
| Critique | 0 |
| Important | 3 |
| Mineur | 5 |

---

## Violations importantes (3)

### IMP-01. TelegramProvider reste > 400 lignes

**Fichier** : `src/channels/telegram/provider.ts` (421 lignes)
**Regle** : Taille et complexite — fichiers < 500, classes < 300
**Probleme** : La classe TelegramProvider fait 393 lignes (29-421). L'extraction de `escapeHtml`/`markdownToHtml` dans utils est faite, mais `handleVoice` (75 lignes) et `handleCallback` (70 lignes) alourdissent encore la classe.
**Action** : Extraire `handleVoice` dans un module `telegram/voice-handler.ts` et la logique de construction de messages dans un `telegram/message-builder.ts`.

### IMP-02. `cleanDeadSessions` utilise JSON.parse non protege

**Fichier** : `src/sessions/tracker.ts:72`
**Regle** : Gestion d'erreurs — pas de catch generique
**Probleme** : `getSession` et `listSessions` utilisent `safeJsonParse` (corrige), mais `cleanDeadSessions` utilise encore `JSON.parse` directement :
```typescript
const info: SessionInfo = JSON.parse(readFileSync(path, 'utf-8'));
```
**Action** : Utiliser `safeJsonParse` et ignorer les fichiers corrompus au lieu de crasher.

### IMP-03. Manque de tests pour les injectors et handlers

**Fichier** : `src/injectors/`, `src/daemon/handlers.ts`
**Regle** : Tests — couverture des branches conditionnelles
**Probleme** : `TmuxInjector`, `XdotoolInjector` et `createChannelHandlers` n'ont aucun test. Ces modules contiennent de la logique de routage critique (permission_prompt vs idle_prompt, picker, fallback cwd).
**Action** : Ajouter des tests unitaires avec des mocks pour `execFile`, tester les branches allow/deny/free text du handlers.

---

## Violations mineures (5)

### MIN-01. `handleSessionStart` utilise JSON.parse sans protection

**Fichier** : `src/hooks/index.ts:97`
**Regle** : Gestion d'erreurs
**Probleme** : `JSON.parse(input)` sur le stdin du hook. Si Claude Code envoie du JSON malforme, le hook crash avec une stack trace.
**Action** : Utiliser `safeJsonParse` avec un fallback et un log d'erreur propre.

### MIN-02. Duplication de la logique de construction de choix de session

**Fichier** : `src/daemon/handlers.ts:58-60` et `src/daemon/handlers.ts:153-155`
**Regle** : DRY — pas de code duplique > 5 lignes
**Probleme** : Le pattern `sessions.map(s => ({ id: s.sessionId, label: ... }))` est duplique deux fois dans `handlers.ts`.
**Action** : Extraire une fonction `buildSessionChoices(sessions)`.

### MIN-03. Magic string `__session_pick__:` sans constante

**Fichier** : `src/daemon/handlers.ts:20`, `src/channels/telegram/provider.ts:235`
**Regle** : Constantes nommees — pas de magic strings
**Probleme** : Le protocole interne `__session_pick__:` est utilise comme convention de string dans deux fichiers sans constante partagee.
**Action** : Definir `SESSION_PICK_PREFIX` dans `types.ts` ou `channels/channel.ts`.

### MIN-04. `installHooks` utilise JSON.parse sans protection

**Fichier** : `src/cli/setup.ts:252`
**Regle** : Gestion d'erreurs
**Probleme** : `JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8'))` peut crasher si le fichier settings.json est corrompu.
**Action** : Utiliser `safeJsonParse` avec fallback `{}`.

### MIN-05. Parametres unused dans l'interface DaemonDeps

**Fichier** : `src/daemon/server.ts:10-14`
**Regle** : Code mort
**Probleme** : L'interface `DaemonDeps` declare `config: RelayConfig` mais `config` n'est plus utilise dans `createServer` (destructure mais ignore). L'interface est encore utile pour `daemon/index.ts`, mais le type devrait refleter ce que `createServer` consomme reellement.
**Action** : Retirer `config` de `DaemonDeps` ou creer un type `ServerDeps` sans config.

---

## Points positifs

### Architecture & Code
- **Strategy + Factory** : Pattern bien applique pour les channels (ntfy/telegram) et injectors (tmux/xdotool)
- **Interfaces stables** : `ChannelProvider`, `InputInjector` definissent des contrats clairs avec des methodes optionnelles (`sendRaw?`, `sendSessionPicker?`)
- **SRP ameliore** : Extraction de `handlers.ts` qui separe la logique de routage du lifecycle du daemon ; `daemon/index.ts` passe de 236 a 78 lignes
- **Utils extraits** : `html.ts`, `json.ts`, `validation.ts` sont reutilisables et testes
- **Guard clauses** : Early returns bien utilises partout (tracker, events, handlers)
- **Fallback cwd** : Resolution intelligente session UUID → cwd quand le session_id n'est plus sur disque
- **Nommage** : Conventions respectees (`*Provider`, `*Injector`, `*Factory`)
- **ESLint** : typescript-eslint configure, 0 erreur

### Securite
- **execFileSync** au lieu de execSync (cli/run.ts) — plus d'injection de commande
- **Validation des entrees HTTP** : JSON Schema Fastify sur `/api/v1/events` et `/api/v1/respond`
- **isValidEventType + isValidSessionId** : Validation avant traitement
- **safeJsonParse** : Protection contre les fichiers JSON corrompus (config, sessions)
- **Caps memoire** : `processedIds` cappe a 1000 (ntfy), maps a 500 (telegram)
- **Bind 127.0.0.1** uniquement — pas d'exposition reseau
- **AbortSignal.timeout** sur tous les fetch Telegram (15s)
- **Port configurable** via `CLAUDE_RELAY_PORT` dans les hooks

### Tests
- **36 tests** couvrant events, server HTTP, tracker, validation, json parse, html utils
- **Tous passants** (0 fail, 0 skip)

---

## Plan de remediation

### Sprint 1 — Securite residuelle (prioritaire)
1. Remplacer `JSON.parse` par `safeJsonParse` dans `cleanDeadSessions` (IMP-02)
2. Proteger `handleSessionStart` et `installHooks` avec `safeJsonParse` (MIN-01, MIN-04)

### Sprint 2 — Tests manquants (prioritaire)
1. Tests unitaires `TmuxInjector` avec mock `execFile` (IMP-03)
2. Tests `createChannelHandlers` : routage allow/deny, fallback cwd, picker (IMP-03)
3. Test d'integration hooks (envoi sur stdin, verification session cree) (IMP-03)

### Sprint 3 — Refactoring TelegramProvider (amelioration)
1. Extraire `handleVoice` dans `telegram/voice-handler.ts` (IMP-01)
2. Extraire la constante `SESSION_PICK_PREFIX` (MIN-03)
3. Extraire `buildSessionChoices()` dans handlers (MIN-02)
4. Retirer `config` de `DaemonDeps` dans server.ts (MIN-05)

---

## Corrections appliquees (historique)

### Session 2026-03-19 (v1 → v2)

**Corrections critiques** :
- CRIT-01 : `execSync(claudeCmd)` → `execFileSync('claude', args)` dans cli/run.ts
- CRIT-02 : Validation type d'event avec `isValidEventType()` dans daemon/server.ts
- CRIT-03 : `JSON.parse` → `safeJsonParse` dans tracker.ts et config/index.ts
- CRIT-04 : Cap memoire processedIds (1000) et messageToEvent/messageToSession (500)

**Corrections importantes** :
- IMP-01 : `escapeHtml`/`markdownToHtml` extraits dans utils/html.ts, imports dans TelegramProvider
- IMP-02 : `createChannelHandlers()` extrait dans daemon/handlers.ts (SRP)
- IMP-03 : `sendSessionPicker?` ajoute a l'interface ChannelProvider, suppression instanceof
- IMP-04 : JSON Schema Fastify sur /events et /respond
- IMP-05 : ESLint avec typescript-eslint configure, 0 erreur
- IMP-06 : Import unused `randomUUID` supprime de recover.ts
- IMP-07 : Validation sessionId avec `isValidSessionId()` dans tracker
- IMP-08 : Logique de routage + picker extraite dans handlers.ts

**Corrections mineures** :
- MIN-01 : console.debug dans les catches importants (ntfy)
- MIN-03 : Port configurable via `CLAUDE_RELAY_PORT`
- MIN-04 : Seed `nextShortId` avec `Date.now() % 10000`
- MIN-05 : Timeouts fetch (15s) sur tous les appels Telegram
- MIN-06 : daemon/index.ts simplifie (236 → 78 lignes)
- MIN-07 : Version CLI lue depuis package.json
- MIN-08 : `throw Error` au lieu de `process.exit()` dans setup.ts

**Nouveaux fichiers** :
- `src/utils/html.ts`, `src/utils/json.ts`, `src/utils/validation.ts`
- `src/daemon/handlers.ts`
- `eslint.config.mjs`
- 3 fichiers de test pour les utils (16 tests supplementaires)

**Correction post-audit** :
- Fallback par cwd dans handlers.ts et server.ts quand session UUID non trouve sur disque

---

## Historique des audits

| Date | Code | Securite | Tests | Moyenne | Evolution |
|------|------|----------|-------|---------|-----------|
| 2026-03-19 v1 | 68/100 | 45/100 | 55/100 | 62/100 | Audit initial |
| 2026-03-19 v2 | 87/100 | 78/100 | 75/100 | 84/100 | +22 pts — 4 critiques resolues, 8 importants resolus, ESLint, +16 tests |
