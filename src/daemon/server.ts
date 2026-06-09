import Fastify from 'fastify';
import type { RelayConfig, RelayEvent } from '../types.js';
import type { ChannelProvider } from '../channels/channel.js';
import type { InputInjector } from '../injectors/injector.js';
import { addPending, getPending, listPending, removePending, resolveResponse } from '../sessions/events.js';
import { getSession, removeSession, cleanDeadSessions, listSessions } from '../sessions/tracker.js';
import { isSessionInjectable } from '../sessions/helpers.js';
import { addNote, listNotes, getNote, removeNote, markSent, updateNoteText, reorderNotes, saveImage, setNoteImage, imagesDir } from '../notes/store.js';
import type { Note } from '../notes/store.js';
import { isValidEventType, isValidSessionId } from '../utils/validation.js';
import { logDaemon } from '../utils/log.js';
import { registerAuth } from './auth.js';
import { capturePane, sendKeys, sendSpecialKey, isAllowedSpecialKey } from './terminal.js';
import { randomUUID } from 'node:crypto';
import { registerDashboardRoutes } from '../dashboard/routes.js';
import { broadcastSSE } from '../dashboard/sse.js';
import { readTranscriptInfo } from '../dashboard/transcript.js';

interface DaemonDeps {
  config: RelayConfig;
  channel: ChannelProvider;
  injector: InputInjector;
}

// JSON Schemas for Fastify validation
const eventBodySchema = {
  type: 'object',
  required: ['session_id', 'message'],
  properties: {
    session_id: { type: 'string', minLength: 1 },
    notification_type: { type: 'string' },
    type: { type: 'string' },
    message: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    cwd: { type: 'string' },
    tool_name: { type: 'string' },
    tool_input: { type: 'string' },
    context: { type: 'string' },
  },
  anyOf: [
    { required: ['notification_type'] },
    { required: ['type'] },
  ],
} as const;

const respondBodySchema = {
  type: 'object',
  required: ['text'],
  properties: {
    text: { type: 'string', minLength: 1 },
  },
} as const;

export async function createServer(deps: DaemonDeps) {
  const { config, channel, injector } = deps;
  const app = Fastify({ logger: true, trustProxy: true });

  registerAuth(app, config.dashboard);

  // Health check
  app.get('/api/v1/health', async () => {
    return { status: 'ok', channel: channel.name, injector: injector.name };
  });

  // Receive events from hooks
  app.post<{ Body: Record<string, string> }>(
    '/api/v1/events',
    { schema: { body: eventBodySchema } },
    async (request, reply) => {
      const body = request.body;
      const sessionId = body.session_id;
      const type = body.notification_type || body.type;
      const message = body.message;

      if (!isValidSessionId(sessionId)) {
        logDaemon('rejected', sessionId || '-', 'invalid-session-id');
        return reply.status(400).send({ error: 'Invalid session_id format' });
      }

      if (!isValidEventType(type)) {
        logDaemon('rejected', sessionId, `invalid-event-type=${type}`);
        return reply.status(400).send({ error: `Invalid event type: ${type}` });
      }

      const session = getSession(sessionId);
      const project = body.cwd || session?.cwd || 'unknown';

      const event: RelayEvent = {
        id: randomUUID(),
        sessionId,
        type,
        message: body.title ? `${body.title}: ${message}` : message,
        toolName: body.tool_name || undefined,
        toolInput: body.tool_input || undefined,
        context: body.context || undefined,
        project,
        timestamp: Date.now(),
      };

      const shortId = addPending(event);
      logDaemon('received', type, sessionId, event.id, `short=${shortId}`);
      broadcastSSE('refresh');

      // Send to channel in background — don't block the hook response
      channel.send(event, shortId).then(result => {
        if (!result.success) {
          console.error(`[server] Channel send failed: ${result.error}`);
        }
      }).catch(err => {
        console.error(`[server] Channel send error:`, err);
      });

      return { ok: true, eventId: event.id, shortId };
    },
  );

  // Receive raw response text (from channel polling)
  app.post<{ Body: { text: string } }>(
    '/api/v1/respond',
    { schema: { body: respondBodySchema } },
    async (request, reply) => {
      const { text } = request.body;

      const resolved = resolveResponse(text);
      if (!resolved) {
        return reply.status(404).send({ error: 'No pending question to match this response' });
      }

      const { question, response } = resolved;
      let session = getSession(question.event.sessionId);
      if (!session) {
        // Fallback: find by cwd
        cleanDeadSessions();
        const byCwd = listSessions().filter(s =>
          isSessionInjectable(s) && s.cwd === question.event.project,
        );
        if (byCwd.length === 1) session = byCwd[0];
      }
      if (!session) {
        removePending(question.event.id);
        return reply.status(410).send({ error: 'Session no longer active' });
      }

      const ok = await injector.sendResponse(session, response, question.event.type);
      if (!ok) {
        logDaemon('inject-failed', question.event.sessionId, question.event.id);
        return reply.status(500).send({ error: 'Failed to inject response' });
      }
      removePending(question.event.id);
      logDaemon('resolved', question.event.sessionId, question.event.id, `via=respond`);
      return { ok: true, matched: question.shortId, injected: true };
    },
  );

  // List pending questions
  app.get('/api/v1/pending', async () => {
    return { pending: listPending() };
  });

  // Respond to a specific event by ID (used by dashboard)
  app.post<{ Body: { eventId: string; response: string } }>(
    '/api/v1/respond-to',
    {
      schema: {
        body: {
          type: 'object',
          required: ['eventId', 'response'],
          properties: {
            eventId: { type: 'string', minLength: 1 },
            response: { type: 'string', minLength: 1 },
          },
        } as const,
      },
    },
    async (request, reply) => {
      const { eventId, response } = request.body;
      const question = getPending(eventId);
      if (!question) {
        return reply.status(404).send({ error: 'Event not found or expired' });
      }

      let session = getSession(question.event.sessionId);
      if (!session) {
        cleanDeadSessions();
        const byCwd = listSessions().filter(s =>
          isSessionInjectable(s) && s.cwd === question.event.project,
        );
        if (byCwd.length === 1) session = byCwd[0];
      }
      if (!session) {
        removePending(eventId);
        return reply.status(410).send({ error: 'Session no longer active' });
      }

      const ok = await injector.sendResponse(session, response, question.event.type);
      if (!ok) {
        logDaemon('inject-failed', question.event.sessionId, eventId);
        return reply.status(500).send({ error: 'Failed to inject response' });
      }
      removePending(eventId);
      logDaemon('resolved', question.event.sessionId, eventId, `via=respond-to`);
      return { ok: true, eventId, injected: true };
    },
  );

  // Send text directly to a session (used by dashboard for idle sessions)
  app.post<{ Body: { sessionId: string; text: string } }>(
    '/api/v1/send-to',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId', 'text'],
          properties: {
            sessionId: { type: 'string', minLength: 1 },
            text: { type: 'string', minLength: 1 },
          },
        } as const,
      },
    },
    async (request, reply) => {
      const { sessionId, text } = request.body;
      let session = getSession(sessionId);
      if (!session) {
        cleanDeadSessions();
        const all = listSessions().filter(s => s.sessionId === sessionId);
        if (all.length === 1) session = all[0];
      }
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      const ok = await injector.sendResponse(session, text, 'idle_prompt');
      if (!ok) {
        return reply.status(500).send({ error: 'Failed to inject text' });
      }
      return { ok: true, sessionId, injected: true };
    },
  );

  // Dismiss a session (used by dashboard)
  app.post<{ Body: { sessionId: string } }>(
    '/api/v1/dismiss-session',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sessionId'],
          properties: { sessionId: { type: 'string', minLength: 1 } },
        } as const,
      },
    },
    async (request, reply) => {
      const { sessionId } = request.body;
      const removed = removeSession(sessionId);
      if (!removed) {
        return reply.status(404).send({ error: 'Session not found' });
      }
      return { ok: true, sessionId };
    },
  );

  // List active sessions
  app.get('/api/v1/sessions', async () => {
    cleanDeadSessions();
    return { sessions: listSessions() };
  });

  // --- Terminal (opt-in via config.dashboard.allowTerminal) ---

  const terminalEnabled = config.dashboard?.allowTerminal === true;

  // Capture a session's tmux pane content (with scrollback + ANSI colors).
  app.get<{ Params: { id: string } }>('/api/v1/session/:id/terminal', async (request, reply) => {
    if (!terminalEnabled) return reply.status(404).send({ error: 'Terminal view is disabled' });
    const { id } = request.params;
    if (!isValidSessionId(id)) return reply.status(400).send({ error: 'Invalid session id' });
    const session = getSession(id);
    if (!session || !session.tmuxPane) {
      return reply.status(404).send({ error: 'Session not found or has no tmux pane' });
    }
    try {
      const content = await capturePane(session.tmuxPane);
      return { content, tmuxPane: session.tmuxPane };
    } catch (err) {
      logDaemon('terminal-capture-failed', id, String((err as Error).message).slice(0, 60));
      return reply.status(500).send({ error: 'Failed to capture pane' });
    }
  });

  // Send keystrokes to a session's pane. Two modes:
  // - `keys` (string): sent literally via tmux send-keys -l, optionally + Enter
  // - `key` (string): a single tmux key name from a whitelist (Up/Down/Enter/
  //   Escape/Tab/etc.) sent without -l so tmux interprets the name. Use this
  //   for TUI navigation (Claude Code's AskUserQuestion picker, vim, etc.).
  // Exactly one of the two must be provided.
  app.post<{ Params: { id: string }; Body: { keys?: string; enter?: boolean; key?: string } }>(
    '/api/v1/session/:id/keys',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            keys: { type: 'string', maxLength: 10000 },
            enter: { type: 'boolean' },
            key: { type: 'string', maxLength: 16 },
          },
        } as const,
      },
    },
    async (request, reply) => {
      if (!terminalEnabled) return reply.status(404).send({ error: 'Terminal view is disabled' });
      const { id } = request.params;
      if (!isValidSessionId(id)) return reply.status(400).send({ error: 'Invalid session id' });

      const { keys, enter, key } = request.body;
      const hasLiteral = typeof keys === 'string';
      const hasKey = typeof key === 'string' && key.length > 0;
      if (hasLiteral === hasKey) {
        return reply.status(400).send({ error: 'Provide exactly one of `keys` or `key`' });
      }
      if (hasKey && !isAllowedSpecialKey(key as string)) {
        return reply.status(400).send({ error: 'Key not allowed' });
      }

      const session = getSession(id);
      if (!session || !session.tmuxPane) {
        return reply.status(404).send({ error: 'Session not found or has no tmux pane' });
      }

      try {
        if (hasKey) {
          await sendSpecialKey(session.tmuxPane, key as string);
          logDaemon('terminal-key', id, session.tmuxPane, key as string);
        } else {
          await sendKeys(session.tmuxPane, keys as string, enter !== false);
          logDaemon('terminal-keys', id, session.tmuxPane);
        }
        return { ok: true };
      } catch (err) {
        logDaemon('terminal-keys-failed', id, String((err as Error).message).slice(0, 60));
        return reply.status(500).send({ error: 'Failed to send keys' });
      }
    },
  );

  // --- Notes ---

  // Add a note
  app.post<{ Body: { project: string; text: string; source?: string } }>(
    '/api/v1/notes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['project', 'text'],
          properties: {
            project: { type: 'string', minLength: 1, maxLength: 255 },
            text: { type: 'string', minLength: 1, maxLength: 10000 },
            source: { type: 'string', enum: ['voice', 'dashboard', 'telegram', 'cli', 'api'] },
          },
        } as const,
      },
    },
    async (request) => {
      const { project, text, source } = request.body;
      const note = addNote(project, text, (source as 'voice' | 'dashboard' | 'telegram' | 'cli' | 'api') || 'api');
      return { ok: true, note };
    },
  );

  // List notes (optionally filtered by project)
  app.get<{ Querystring: { project?: string } }>(
    '/api/v1/notes',
    async (request) => {
      const { project } = request.query;
      return { notes: listNotes(project) };
    },
  );

  // Update a note's text
  app.patch<{ Params: { id: string }; Body: { text: string } }>(
    '/api/v1/notes/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string', minLength: 1 } },
        } as const,
      },
    },
    async (request, reply) => {
      const ok = updateNoteText(request.params.id, request.body.text);
      if (!ok) {
        return reply.status(404).send({ error: 'Note not found' });
      }
      return { ok: true };
    },
  );

  // Delete a note
  app.delete<{ Params: { id: string } }>(
    '/api/v1/notes/:id',
    async (request, reply) => {
      const removed = removeNote(request.params.id);
      if (!removed) {
        return reply.status(404).send({ error: 'Note not found' });
      }
      return { ok: true };
    },
  );

  // Send a note to its project's session (only idle/waiting sessions)
  app.post<{ Params: { id: string } }>(
    '/api/v1/notes/:id/send',
    async (request, reply) => {
      const note = getNote(request.params.id);
      if (!note || note.status === 'sent') {
        return reply.status(404).send({ error: 'Note not found or already sent' });
      }

      // Find sessions for this project
      cleanDeadSessions();
      const sessions = listSessions().filter(s =>
        isSessionInjectable(s) && s.cwd.endsWith('/' + note.project),
      );
      if (sessions.length === 0) {
        return reply.status(404).send({ error: 'No active session for this project' });
      }

      // Only target idle/waiting sessions
      const waiting = sessions.filter(s => {
        const info = readTranscriptInfo(s.sessionId, s.cwd);
        return info.state === 'idle' || info.state === 'waiting_input' || info.state === 'unknown';
      });
      if (waiting.length === 0) {
        return reply.status(409).send({ error: 'All sessions are busy — wait for an idle session' });
      }

      const session = waiting.sort((a, b) => b.timestamp - a.timestamp)[0];
      const ok = await injector.sendResponse(session, note.text, 'idle_prompt');
      if (!ok) {
        return reply.status(500).send({ error: 'Failed to inject note' });
      }
      markSent(note.id);
      return { ok: true, noteId: note.id, sessionId: session.sessionId, injected: true };
    },
  );

  // Reorder notes for a project
  app.patch<{ Body: { project: string; orderedIds: string[] } }>(
    '/api/v1/notes/reorder',
    {
      schema: {
        body: {
          type: 'object',
          required: ['project', 'orderedIds'],
          properties: {
            project: { type: 'string', minLength: 1 },
            orderedIds: { type: 'array', items: { type: 'string' } },
          },
        } as const,
      },
    },
    async (request) => {
      const { project, orderedIds } = request.body;
      reorderNotes(project, orderedIds);
      return { ok: true };
    },
  );

  // Upload image and attach to a note
  app.post<{ Params: { id: string } }>(
    '/api/v1/notes/:id/image',
    { config: { rawBody: true } },
    async (request, reply) => {
      const noteId = request.params.id;
      const note = getNote(noteId);
      if (!note) {
        return reply.status(404).send({ error: 'Note not found' });
      }

      const body = request.body as Buffer;
      if (!body || !Buffer.isBuffer(body)) {
        return reply.status(400).send({ error: 'Expected raw image body' });
      }

      const filename = saveImage(body);
      setNoteImage(noteId, filename);
      return { ok: true, noteId, image: filename };
    },
  );

  // Create a note with an image in one request (base64 JSON)
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

  app.post<{ Body: { project: string; text?: string; imageBase64: string; source?: string } }>(
    '/api/v1/notes/with-image',
    {
      schema: {
        body: {
          type: 'object',
          required: ['project', 'imageBase64'],
          properties: {
            project: { type: 'string', minLength: 1, maxLength: 255 },
            text: { type: 'string', maxLength: 10000 },
            imageBase64: { type: 'string', minLength: 1, maxLength: 7_100_000 }, // ~5MB in base64
            source: { type: 'string' },
          },
        } as const,
      },
    },
    async (request, reply) => {
      const { project, text, imageBase64, source } = request.body;
      const buf = Buffer.from(imageBase64, 'base64');
      if (buf.length > MAX_IMAGE_BYTES) {
        return reply.status(413).send({ error: 'Image too large (max 5 MB)' });
      }
      const note = addNote(project, text || '(image)', (source as Note['source']) || 'dashboard');
      const filename = saveImage(buf);
      setNoteImage(note.id, filename);
      return { ok: true, note: { ...note, image: filename } };
    },
  );

  // Serve note images
  app.get<{ Params: { filename: string } }>(
    '/api/v1/notes/images/:filename',
    async (request, reply) => {
      const { filename } = request.params;
      // Sanitize: only allow UUID format filenames
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i.test(filename)) {
        return reply.status(400).send({ error: 'Invalid filename' });
      }
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      try {
        const data = readFileSync(join(imagesDir(), filename));
        reply.type('image/png').send(data);
      } catch {
        return reply.status(404).send({ error: 'Image not found' });
      }
    },
  );

  registerDashboardRoutes(app);

  return app;
}
