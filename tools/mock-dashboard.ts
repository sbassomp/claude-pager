#!/usr/bin/env tsx
/**
 * Mock dashboard server for screenshots.
 * Usage: npx tsx tools/mock-dashboard.ts
 */
import Fastify from 'fastify';
import { DASHBOARD_HTML } from '../src/dashboard/html.js';

const app = Fastify();

const mockData = {
  projects: [
    {
      name: 'webapp-frontend',
      path: '/home/dev/webapp-frontend',
      sessions: [
        {
          sessionId: 'sess-fe-001',
          title: 'Refactoring AuthProvider to use React Context + migrating from Redux',
          state: 'working',
          pendingQuestion: null,
          git: { branch: 'feat/auth-context', modifiedFiles: 4, unpushedCommits: 2 },
          needsTesting: false,
          committed: true,
          pushed: false,
          tmuxPane: '%0',
          lastActivity: Date.now() - 15_000,
        },
        {
          sessionId: 'sess-fe-002',
          title: 'Fix: login form validation not showing error on empty password field',
          state: 'waiting_permission',
          pendingQuestion: {
            eventId: 'evt-perm-001',
            shortId: '4201',
            type: 'permission_prompt',
            message: 'Edit: src/components/LoginForm.tsx',
            toolName: 'Edit',
            toolInput: 'src/components/LoginForm.tsx\n--- old\n  const validate = (values) => {\n    const errors = {};\n    if (!values.email) errors.email = "Required";\n    return errors;\n  };\n+++ new\n  const validate = (values) => {\n    const errors = {};\n    if (!values.email) errors.email = "Required";\n    if (!values.password) errors.password = "Required";\n    return errors;\n  };',
            agoSeconds: 45,
          },
          git: { branch: 'fix/login-validation', modifiedFiles: 1, unpushedCommits: 0 },
          needsTesting: true,
          committed: false,
          pushed: true,
          tmuxPane: '%1',
          lastActivity: Date.now() - 45_000,
        },
      ],
      notes: [
        { id: 'n1', project: 'webapp-frontend', text: 'Add dark mode toggle to navbar', image: null, source: 'voice', createdAt: Date.now() - 300_000, status: 'pending' },
        { id: 'n2', project: 'webapp-frontend', text: 'Check accessibility on signup form', image: null, source: 'telegram', createdAt: Date.now() - 3600_000, status: 'pending' },
      ],
      ci: {
        main: { status: 'success', url: '#' },
        staging: { status: 'running', url: '#' },
      },
    },
    {
      name: 'api-gateway',
      path: '/home/dev/api-gateway',
      sessions: [
        {
          sessionId: 'sess-api-001',
          title: 'Implementing rate limiter middleware with sliding window algorithm',
          state: 'waiting_input',
          pendingQuestion: {
            eventId: 'evt-idle-001',
            shortId: '4202',
            type: 'idle_prompt',
            message: 'Should I use Redis for the rate limiter state, or is an in-memory solution acceptable for your use case?',
            toolName: null,
            toolInput: null,
            agoSeconds: 120,
          },
          git: { branch: 'feat/rate-limiter', modifiedFiles: 3, unpushedCommits: 1 },
          needsTesting: false,
          committed: true,
          pushed: false,
          tmuxPane: '%2',
          lastActivity: Date.now() - 120_000,
        },
      ],
      notes: [
        { id: 'n3', project: 'api-gateway', text: 'Also add IP whitelist for internal services', image: null, source: 'cli', createdAt: Date.now() - 600_000, status: 'pending' },
      ],
      ci: {
        main: { status: 'success', url: '#' },
        staging: { status: 'success', url: '#' },
      },
    },
    {
      name: 'billing-service',
      path: '/home/dev/billing-service',
      sessions: [
        {
          sessionId: 'sess-bill-001',
          title: 'Add Stripe webhook handler for subscription lifecycle events',
          state: 'idle',
          pendingQuestion: null,
          git: { branch: 'feat/stripe-webhooks', modifiedFiles: 0, unpushedCommits: 0 },
          needsTesting: false,
          committed: true,
          pushed: true,
          tmuxPane: '%3',
          lastActivity: Date.now() - 600_000,
        },
      ],
      notes: [],
      ci: {
        main: { status: 'failed', url: '#' },
        staging: { status: 'success', url: '#' },
      },
    },
  ],
  updatedAt: Date.now(),
};

// Dashboard HTML page
app.get('/dashboard', async (_req, reply) => {
  reply.type('text/html').send(DASHBOARD_HTML);
});

// Mock dashboard API
app.get('/api/v1/dashboard', async () => {
  return mockData;
});

// Mock SSE endpoint (no-op)
app.get('/api/v1/dashboard/sse', async (_req, reply) => {
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  reply.raw.write('data: refresh\n\n');
});

// Mock note endpoints
app.get('/api/v1/notes', async () => ({ notes: [] }));
app.post('/api/v1/notes', async () => ({ ok: true }));

app.listen({ port: 17399, host: '127.0.0.1' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log('Mock dashboard at http://127.0.0.1:17399/dashboard');
});
