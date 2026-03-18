import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, getDataDir, ensureDataDir } from '../config/index.js';
import { createChannel } from '../channels/factory.js';
import { createInjector } from '../injectors/factory.js';
import { createServer } from './server.js';
import { resolveResponse, removePending } from '../sessions/events.js';
import { getSession } from '../sessions/tracker.js';

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
  channel.startListening(async (rawText) => {
    console.log(`[daemon] Received response from channel: "${rawText}"`);
    try {
      const resolved = resolveResponse(rawText);
      if (!resolved) {
        console.log('[daemon] No pending question to match');
        return;
      }

      const { question, response } = resolved;
      console.log(`[daemon] Matched to #${question.shortId} (${question.event.type}), injecting: "${response}"`);

      const session = getSession(question.event.sessionId);
      if (!session) {
        console.log('[daemon] Session no longer active');
        removePending(question.event.id);
        return;
      }

      let windowId = session.windowId;
      if (!windowId) {
        windowId = await injector.findWindow(session.pid) ?? undefined;
      }
      if (!windowId) {
        console.log(`[daemon] Could not find window for PID ${session.pid}`);
        return;
      }

      const typed = await injector.typeText(windowId, response);
      if (typed) {
        await injector.pressEnter(windowId);
        removePending(question.event.id);
        console.log(`[daemon] Injected "${response}" into window ${windowId}`);
      } else {
        console.log(`[daemon] Failed to type into window ${windowId}`);
      }
    } catch (err) {
      console.error('[daemon] Error handling response:', err);
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    channel.stopListening();
    await app.close();
    try { unlinkSync(PID_FILE()); } catch { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ port: config.port, host: '127.0.0.1' });
    console.log(`claude-relay daemon listening on 127.0.0.1:${config.port}`);
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
