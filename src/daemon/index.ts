import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, getDataDir, ensureDataDir } from '../config/index.js';
import { createChannel } from '../channels/factory.js';
import { createInjector } from '../injectors/factory.js';
import { createServer } from './server.js';
import { resolveResponse, removePending } from '../sessions/events.js';
import { getSession, listSessions, cleanDeadSessions } from '../sessions/tracker.js';
import type { FreeMessage } from '../channels/channel.js';
import { TelegramProvider } from '../channels/telegram/provider.js';

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
  channel.startListening({
    onResponse: async (rawText) => {
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

        const canResolve = await injector.resolve(session);
        if (!canResolve) {
          console.log(`[daemon] Injector "${injector.name}" cannot resolve session (pid=${session.pid}, tmuxPane=${session.tmuxPane}, windowId=${session.windowId})`);
          return;
        }

        const ok = await injector.sendResponse(session, response, question.event.type);
        if (ok) {
          removePending(question.event.id);
          console.log(`[daemon] Injected "${response}" via ${injector.name}`);
        } else {
          console.log(`[daemon] Failed to inject via ${injector.name}`);
        }
      } catch (err) {
        console.error('[daemon] Error handling response:', err);
      }
    },

    onFreeMessage: async (msg: FreeMessage) => {
      console.log(`[daemon] Free message: "${msg.text}"${msg.sessionId ? ` (session: ${msg.sessionId})` : ''}`);
      try {
        cleanDeadSessions();
        const sessions = listSessions();
        const activeSessions = sessions.filter(s => s.tmuxPane);

        if (activeSessions.length === 0) {
          await msg.replyCallback('No active sessions.');
          return;
        }

        let targetSession;

        // If sessionId is known (reply to a notification), use it directly
        if (msg.sessionId) {
          targetSession = activeSessions.find(s => s.sessionId === msg.sessionId);
        }

        if (!targetSession && activeSessions.length === 1) {
          targetSession = activeSessions[0];
        }

        if (!targetSession && channel instanceof TelegramProvider) {
          // Multiple sessions — ask user to pick
          const sessionChoices = activeSessions.map(s => ({
            id: s.sessionId,
            label: `${s.cwd.split('/').pop()} (${s.tmuxPane})`,
          }));
          const chosenId = await channel.waitForSessionPick(
            `Which session should receive:\n<pre>${msg.text}</pre>`,
            sessionChoices,
          );
          targetSession = activeSessions.find(s => s.sessionId === chosenId);
        }

        if (!targetSession) {
          await msg.replyCallback('Could not determine target session.');
          return;
        }

        const ok = await injector.sendResponse(targetSession, msg.text, 'idle_prompt');
        if (ok) {
          console.log(`[daemon] Injected free message into ${targetSession.tmuxPane}`);
        } else {
          await msg.replyCallback('Failed to inject message.');
        }
      } catch (err) {
        console.error('[daemon] Error handling free message:', err);
      }
    },
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
