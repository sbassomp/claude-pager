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

  // State for session picker
  let pendingPickerText: string | undefined;
  let pendingPickerSessions: import('../types.js').SessionInfo[] | undefined;

  function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Start polling for responses from the channel
  channel.startListening({
    onResponse: async (rawText) => {
      // Handle session picker callback
      if (rawText.startsWith('__session_pick__:') && pendingPickerText && pendingPickerSessions) {
        const sessionId = rawText.split(':')[1];
        const target = pendingPickerSessions.find(s => s.sessionId === sessionId);
        const text = pendingPickerText;
        pendingPickerText = undefined;
        pendingPickerSessions = undefined;

        if (target) {
          const ok = await injector.sendResponse(target, text, 'idle_prompt');
          if (ok) {
            console.log(`[daemon] Injected "${text}" into ${target.tmuxPane} (via picker)`);
          } else {
            console.log(`[daemon] Failed to inject via picker`);
          }
        }
        return;
      }

      console.log(`[daemon] Received response from channel: "${rawText}"`);
      try {
        const resolved = resolveResponse(rawText);

        if (resolved) {
          const { question, response } = resolved;
          const session = getSession(question.event.sessionId);

          if (session) {
            const canResolve = await injector.resolve(session);
            if (canResolve) {
              const ok = await injector.sendResponse(session, response, question.event.type);
              if (ok) {
                removePending(question.event.id);
                console.log(`[daemon] Injected "${response}" via ${injector.name}`);
              } else {
                console.log(`[daemon] Failed to inject via ${injector.name}`);
              }
              return;
            }
            console.log(`[daemon] Injector cannot resolve session, will try as free message`);
          } else {
            console.log(`[daemon] Session not found, will try as free message`);
          }
          removePending(question.event.id);
        }

        // Fallback: treat as free message (strip #eventId prefix if present)
        const cleanText = rawText.replace(/^#[\w-]+\s+/, '').trim();
        if (!cleanText) {
          console.log('[daemon] No text to inject');
          return;
        }

        console.log(`[daemon] Routing as free message: "${cleanText}"`);
        cleanDeadSessions();
        const sessions = listSessions().filter(s => s.tmuxPane);

        if (sessions.length === 0) {
          console.log('[daemon] No active sessions');
          if (channel.sendRaw) await channel.sendRaw('No active sessions.');
          return;
        }

        if (sessions.length === 1) {
          const ok = await injector.sendResponse(sessions[0], cleanText, 'idle_prompt');
          console.log(ok
            ? `[daemon] Injected free message into ${sessions[0].tmuxPane}`
            : `[daemon] Failed to inject free message`);
          return;
        }

        // Multiple sessions — send picker
        if (channel instanceof TelegramProvider) {
          pendingPickerText = cleanText;
          pendingPickerSessions = sessions;
          const choices = sessions.map(s => ({
            id: s.sessionId,
            label: `${s.cwd.split('/').pop()} (${s.tmuxPane})`,
          }));
          channel.sendSessionPicker(
            `Which session should receive:\n<pre>${escapeHtml(cleanText)}</pre>`,
            choices,
          );
          console.log('[daemon] Session picker sent');
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
          // Multiple sessions — send picker, don't block
          const sessionChoices = activeSessions.map(s => ({
            id: s.sessionId,
            label: `${s.cwd.split('/').pop()} (${s.tmuxPane})`,
          }));
          // Store the text to inject when the user picks a session
          pendingPickerText = msg.text;
          pendingPickerSessions = activeSessions;
          channel.sendSessionPicker(
            `Which session should receive:\n<pre>${escapeHtml(msg.text)}</pre>`,
            sessionChoices,
          );
          console.log('[daemon] Session picker sent, waiting for selection...');
          return;
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
