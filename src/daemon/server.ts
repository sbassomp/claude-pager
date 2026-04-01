import Fastify from 'fastify';
import type { RelayConfig, RelayEvent } from '../types.js';
import type { ChannelProvider } from '../channels/channel.js';
import type { InputInjector } from '../injectors/injector.js';
import { addPending, getPending, listPending, removePending, resolveResponse } from '../sessions/events.js';
import { getSession, removeSession, cleanDeadSessions, listSessions } from '../sessions/tracker.js';
import { addNote, listNotes, getNote, removeNote, markSent, reorderNotes } from '../notes/store.js';
import { isValidEventType, isValidSessionId } from '../utils/validation.js';
import { randomUUID } from 'node:crypto';
import { registerDashboardRoutes } from '../dashboard/routes.js';
import { broadcastSSE } from '../dashboard/sse.js';

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
  const { channel, injector } = deps;
  const app = Fastify({ logger: true });

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
        return reply.status(400).send({ error: 'Invalid session_id format' });
      }

      if (!isValidEventType(type)) {
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
          s.tmuxPane && s.cwd === question.event.project,
        );
        if (byCwd.length === 1) session = byCwd[0];
      }
      if (!session) {
        removePending(question.event.id);
        return reply.status(410).send({ error: 'Session no longer active' });
      }

      const ok = await injector.sendResponse(session, response, question.event.type);
      if (!ok) {
        return reply.status(500).send({ error: 'Failed to inject response' });
      }
      removePending(question.event.id);
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
          s.tmuxPane && s.cwd === question.event.project,
        );
        if (byCwd.length === 1) session = byCwd[0];
      }
      if (!session) {
        removePending(eventId);
        return reply.status(410).send({ error: 'Session no longer active' });
      }

      const ok = await injector.sendResponse(session, response, question.event.type);
      if (!ok) {
        return reply.status(500).send({ error: 'Failed to inject response' });
      }
      removePending(eventId);
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
            project: { type: 'string', minLength: 1 },
            text: { type: 'string', minLength: 1 },
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

  // Send a note to its project's session
  app.post<{ Params: { id: string } }>(
    '/api/v1/notes/:id/send',
    async (request, reply) => {
      const note = getNote(request.params.id);
      if (!note || note.status === 'sent') {
        return reply.status(404).send({ error: 'Note not found or already sent' });
      }

      // Find a session for this project
      cleanDeadSessions();
      const sessions = listSessions().filter(s =>
        s.tmuxPane && s.cwd.endsWith('/' + note.project),
      );
      if (sessions.length === 0) {
        return reply.status(404).send({ error: 'No active session for this project' });
      }

      // Prefer the most recently active session
      const session = sessions.sort((a, b) => b.timestamp - a.timestamp)[0];
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

  registerDashboardRoutes(app);

  return app;
}
