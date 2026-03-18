import Fastify from 'fastify';
import type { RelayConfig, RelayEvent } from '../types.js';
import type { ChannelProvider } from '../channels/channel.js';
import type { InputInjector } from '../injectors/injector.js';
import { addPending, getPending, listPending, removePending, resolveResponse } from '../sessions/events.js';
import { getSession, cleanDeadSessions, listSessions } from '../sessions/tracker.js';
import { randomUUID } from 'node:crypto';

interface DaemonDeps {
  config: RelayConfig;
  channel: ChannelProvider;
  injector: InputInjector;
}

async function injectResponse(
  injector: InputInjector,
  sessionId: string,
  eventId: string,
  response: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = getSession(sessionId);
  if (!session) {
    removePending(eventId);
    return { ok: false, error: 'Session no longer active' };
  }

  let windowId = session.windowId;
  if (!windowId) {
    windowId = await injector.findWindow(session.pid) ?? undefined;
  }
  if (!windowId) {
    return { ok: false, error: 'Could not find terminal window for session' };
  }

  const typed = await injector.typeText(windowId, response);
  if (!typed) {
    return { ok: false, error: 'Failed to type response into terminal' };
  }

  await injector.pressEnter(windowId);
  removePending(eventId);
  return { ok: true };
}

export async function createServer(deps: DaemonDeps) {
  const { config, channel, injector } = deps;
  const app = Fastify({ logger: true });

  // Health check
  app.get('/api/v1/health', async () => {
    return { status: 'ok', channel: channel.name, injector: injector.name };
  });

  // Receive events from hooks
  app.post<{ Body: { session_id?: string; type?: string; message?: string } }>(
    '/api/v1/events',
    async (request, reply) => {
      const body = request.body;
      if (!body || !body.session_id || !body.type || !body.message) {
        return reply.status(400).send({ error: 'Missing required fields: session_id, type, message' });
      }

      const session = getSession(body.session_id);
      const project = session?.cwd || 'unknown';

      const event: RelayEvent = {
        id: randomUUID(),
        sessionId: body.session_id,
        type: body.type as RelayEvent['type'],
        message: body.message,
        project,
        timestamp: Date.now(),
      };

      // Pre-generate shortId before sending so it appears in the notification
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
  app.post<{ Body: { text?: string } }>(
    '/api/v1/respond',
    async (request, reply) => {
      const text = request.body?.text;
      if (!text) {
        return reply.status(400).send({ error: 'Missing required field: text' });
      }

      const resolved = resolveResponse(text);
      if (!resolved) {
        return reply.status(404).send({ error: 'No pending question to match this response' });
      }

      const result = await injectResponse(
        injector,
        resolved.question.event.sessionId,
        resolved.question.event.id,
        resolved.response,
      );

      if (!result.ok) {
        return reply.status(500).send({ error: result.error });
      }
      return { ok: true, matched: resolved.question.shortId, injected: true };
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
