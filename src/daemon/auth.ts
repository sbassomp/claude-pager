import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DashboardConfig } from '../types.js';
import { logDaemon } from '../utils/log.js';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(ip: string | undefined): boolean {
  if (!ip) return false;
  return LOOPBACK_IPS.has(ip);
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  // timingSafeEqual requires equal lengths; pad to longest to avoid leaking
  // length difference. Then compare lengths separately at the end.
  const len = Math.max(ab.length, bb.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  ab.copy(aPad);
  bb.copy(bPad);
  const eq = timingSafeEqual(aPad, bPad);
  return eq && ab.length === bb.length;
}

export function parseBasicAuth(header: string | undefined): { user: string; password: string } | null {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    return { user: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

export function checkBasicAuth(
  header: string | undefined,
  expected: { user: string; password: string },
): boolean {
  const parsed = parseBasicAuth(header);
  if (!parsed) return false;
  // Compare both fields constant-time so neither length nor content leaks.
  const userOk = constantTimeEquals(parsed.user, expected.user);
  const pwOk = constantTimeEquals(parsed.password, expected.password);
  return userOk && pwOk;
}

// Validates dashboard config at startup. Throws if exposing the dashboard
// beyond loopback without auth (the operator must opt in explicitly via
// allowInsecure — usually because a reverse proxy handles auth upstream).
export function assertDashboardConfig(dash: DashboardConfig | undefined): void {
  const bind = dash?.bind || '127.0.0.1';
  if (isLoopback(bind) || bind === 'localhost') return;
  if (dash?.basicAuth?.user && dash?.basicAuth?.password) return;
  if (dash?.allowInsecure) return;
  throw new Error(
    `Refusing to start: dashboard.bind="${bind}" is not loopback and ` +
    `dashboard.basicAuth is not configured. Either add basicAuth { user, ` +
    `password } in the config, put the daemon behind a reverse proxy that ` +
    `handles auth and set dashboard.allowInsecure: true, or revert ` +
    `dashboard.bind to "127.0.0.1".`,
  );
}

// Registers the auth onRequest hook. Loopback requests bypass auth (so the
// local hooks at 127.0.0.1 keep working). External requests must present
// valid Basic credentials. If basicAuth is unset, the hook is not registered
// at all — that path is only reachable when bind is loopback or
// allowInsecure was explicitly set.
export function registerAuth(app: FastifyInstance, dash: DashboardConfig | undefined): void {
  if (!dash?.basicAuth?.user || !dash?.basicAuth?.password) return;
  const expected = dash.basicAuth;

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (isLoopback(req.ip)) return;
    const ok = checkBasicAuth(req.headers.authorization, expected);
    if (ok) return;
    logDaemon('auth-rejected', req.ip || '-', req.url || '-');
    reply.header('WWW-Authenticate', 'Basic realm="claude-pager"');
    reply.status(401).send({ error: 'Authentication required' });
  });
}
