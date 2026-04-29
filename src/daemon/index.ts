import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, getDataDir, ensureDataDir } from '../config/index.js';
import { createChannel } from '../channels/factory.js';
import { createInjector } from '../injectors/factory.js';
import { createServer } from './server.js';
import { createChannelHandlers } from './handlers.js';
import { closeAllSSEClients } from '../dashboard/sse.js';

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

export async function startDaemon(): Promise<void> {
  const { running, pid } = isDaemonRunning();
  if (running) {
    console.log(`Daemon already running (PID ${pid})`);
    process.exit(1);
  }

  ensureDataDir();
  const config = loadConfig();
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

  try {
    await app.listen({ port: config.port, host: '127.0.0.1' });
    console.log(`claude-pager daemon listening on 127.0.0.1:${config.port}`);
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
