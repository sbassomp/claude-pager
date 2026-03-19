import Fastify from 'fastify';
import type { RelayConfig, RelayEvent } from '../types.js';
import type { ChannelProvider } from '../channels/channel.js';
import type { InputInjector } from '../injectors/injector.js';
import { addPending, listPending, removePending, resolveResponse } from '../sessions/events.js';
import { getSession, cleanDeadSessions, listSessions } from '../sessions/tracker.js';
import { isValidEventType, isValidSessionId } from '../utils/validation.js';
import { randomUUID } from 'node:crypto';

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
        project,
        timestamp: Date.now(),
      };

      const shortId = addPending(event);
      const result = await channel.send(event, shortId);
      if (result.success) {
        return { ok: true, eventId: event.id, shortId };
      }

      removePending(event.id);
      return reply.status(502).send({ error: `Channel send failed: ${result.error}` });
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

  // List active sessions
  app.get('/api/v1/sessions', async () => {
    cleanDeadSessions();
    return { sessions: listSessions() };
  });

  return app;
}
