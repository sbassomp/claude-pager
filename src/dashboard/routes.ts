import type { FastifyInstance } from 'fastify';
import { getDashboardData } from './enricher.js';
import { DASHBOARD_HTML } from './html.js';
import { addSSEClient } from './sse.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/api/v1/dashboard', async () => {
    return getDashboardData();
  });

  app.get('/api/v1/sse', async (_request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(':\n\n'); // initial comment to flush headers
    addSSEClient(reply);
    reply.hijack();
  });

  app.get('/dashboard', async (_request, reply) => {
    reply.type('text/html').send(DASHBOARD_HTML);
  });
}
