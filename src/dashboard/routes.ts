import type { FastifyInstance } from 'fastify';
import { getDashboardData } from './enricher.js';
import { DASHBOARD_HTML } from './html.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.get('/api/v1/dashboard', async () => {
    return getDashboardData();
  });

  app.get('/dashboard', async (_request, reply) => {
    reply.type('text/html').send(DASHBOARD_HTML);
  });
}
