import { writeFileSync, readFileSync, unlinkSync, existsSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadConfig, getDataDir, ensureDataDir } from '../config/index.js';
import { createChannel } from '../channels/factory.js';
import { createInjector } from '../injectors/factory.js';
import { createServer } from './server.js';
import { createChannelHandlers } from './handlers.js';
import { closeAllSSEClients } from '../dashboard/sse.js';
import { assertDashboardConfig } from './auth.js';
import { setPendingTtlMs } from '../sessions/events.js';

const SHUTDOWN_TIMEOUT_MS = 3000;

const PID_FILE = () => join(getDataDir(), 'daemon.pid');

export function isDaemonRunning(): { running: boolean; pid?: number } {
  const pidFile = PID_FILE();
  if (!existsSync(pidFile)) return { running: false };

  const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    unlinkSync(pidFile);
    return { running: false };
  }
}

export type EnsureDaemonResult = 'already-running' | 'started' | 'spawn-failed' | 'unhealthy';

async function isHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Ensure the daemon is up. First test its presence via the pidfile + a real
// /api/v1/health probe — if it answers, do nothing. Otherwise spawn
// `claude-pager start` as a detached background process that survives the
// caller exiting (and the tmux session ending), then poll /api/v1/health for
// a few seconds to confirm it actually came up (it can refuse to start, e.g.
// on an insecure ntfy.sh config). Works on macOS and Linux without
// systemd/launchd.
export async function ensureDaemonRunning(): Promise<EnsureDaemonResult> {
  const port = loadConfig().port;

  const { running } = isDaemonRunning();
  if (running && await isHealthy(port)) return 'already-running';

  try {
    ensureDataDir();
    const out = openSync(join(getDataDir(), 'daemon-stdout.log'), 'a');
    // process.argv[1] is this CLI entry script; re-invoke it with `start`.
    const child = spawn(process.execPath, [process.argv[1], 'start'], {
      detached: true,
      stdio: ['ignore', out, out],
    });
    child.unref();
  } catch {
    return 'spawn-failed';
  }

  // Poll until it answers, or give up after ~4s.
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await isHealthy(port)) return 'started';
  }
  return 'unhealthy';
}

export async function startDaemon(): Promise<void> {
  const { running, pid } = isDaemonRunning();
  if (running) {
    console.log(`Daemon already running (PID ${pid})`);
    process.exit(1);
  }

  ensureDataDir();
  const config = loadConfig();
  assertDashboardConfig(config.dashboard);
  if (config.pendingTtlSeconds) setPendingTtlMs(config.pendingTtlSeconds * 1000);
  const channel = createChannel(config.channel);
  const injector = createInjector(config.injector);

  const app = await createServer({ config, channel, injector });

  // Write PID file
  writeFileSync(PID_FILE(), String(process.pid));

  // Start polling for responses from the channel
  const handlers = createChannelHandlers(channel, injector);
  channel.startListening(handlers);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nShutting down...');
    channel.stopListening();
    closeAllSSEClients();
    // Race app.close() against a hard timeout: long-poll/SSE/keep-alive sockets
    // can otherwise keep Fastify's graceful close hanging indefinitely.
    await Promise.race([
      app.close(),
      new Promise<void>(resolve => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);
    try { unlinkSync(PID_FILE()); } catch { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const host = config.dashboard?.bind || '127.0.0.1';
  try {
    await app.listen({ port: config.port, host });
    console.log(`claude-pager daemon listening on ${host}:${config.port}`);
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      const auth = config.dashboard?.basicAuth ? 'basic auth on' : 'NO AUTH (allowInsecure)';
      console.log(`[daemon] dashboard exposed beyond loopback — ${auth}`);
    }
  } catch (err) {
    try { unlinkSync(PID_FILE()); } catch { /* ignore */ }
    throw err;
  }
}

export function stopDaemon(): boolean {
  const { running, pid } = isDaemonRunning();
  if (!running || !pid) {
    console.log('Daemon is not running');
    return false;
  }

  process.kill(pid, 'SIGTERM');
  try { unlinkSync(PID_FILE()); } catch { /* ignore */ }
  console.log(`Daemon stopped (PID ${pid})`);
  return true;
}
