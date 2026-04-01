import type { FastifyInstance } from 'fastify';
import { getDashboardData } from './enricher.js';
import { DASHBOARD_HTML } from './html.js';
import { addSSEClient } from './sse.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/api/v1/dashboard', async () => {
    return getDashboardData();
  });

  app.get('/api/v1/sse', async (request, reply) => {
    reply.hijack();
    request.raw.setTimeout(0);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(':\n\n');
    addSSEClient(reply);
  });

  app.get('/dashboard', async (_request, reply) => {
    reply.type('text/html').send(DASHBOARD_HTML);
  });
}
