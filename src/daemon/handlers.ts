import type { ChannelProvider, ChannelListeners, FreeMessage } from '../channels/channel.js';
import type { InputInjector } from '../injectors/injector.js';
import type { SessionInfo } from '../types.js';
import { resolveResponse, removePending } from '../sessions/events.js';
import { getSession, listSessions, cleanDeadSessions } from '../sessions/tracker.js';
import { escapeHtml } from '../utils/html.js';

interface PickerState {
  text: string | undefined;
  sessions: SessionInfo[] | undefined;
}

export function createChannelHandlers(
  channel: ChannelProvider,
  injector: InputInjector,
): ChannelListeners {
  const picker: PickerState = { text: undefined, sessions: undefined };

  async function handleSessionPick(rawText: string): Promise<boolean> {
    if (!rawText.startsWith('__session_pick__:') || !picker.text || !picker.sessions) {
      return false;
    }

    const sessionId = rawText.split(':')[1];
    const target = picker.sessions.find(s => s.sessionId === sessionId);
    const text = picker.text;
    picker.text = undefined;
    picker.sessions = undefined;

    if (target) {
      const ok = await injector.sendResponse(target, text, 'idle_prompt');
      console.log(ok
        ? `[daemon] Injected "${text}" into ${target.tmuxPane} (via picker)`
        : `[daemon] Failed to inject via picker`);
    }
    return true;
  }

  async function routeAsFreeTo(sessions: SessionInfo[], text: string): Promise<void> {
    if (sessions.length === 0) {
      console.log('[daemon] No active sessions');
      if (channel.sendRaw) await channel.sendRaw('No active sessions.');
      return;
    }

    if (sessions.length === 1) {
      const ok = await injector.sendResponse(sessions[0], text, 'idle_prompt');
      console.log(ok
        ? `[daemon] Injected free message into ${sessions[0].tmuxPane}`
        : `[daemon] Failed to inject free message`);
      return;
    }

    // Multiple sessions — send picker if channel supports it
    if (channel.sendSessionPicker) {
      picker.text = text;
      picker.sessions = sessions;
      const choices = sessions.map(s => ({
        id: s.sessionId,
        label: `${s.cwd.split('/').pop()} (${s.tmuxPane})`,
      }));
      await channel.sendSessionPicker(
        `Which session should receive:\n<pre>${escapeHtml(text)}</pre>`,
        choices,
      );
      console.log('[daemon] Session picker sent');
    }
  }

  return {
    onResponse: async (rawText: string) => {
      if (await handleSessionPick(rawText)) return;

      console.log(`[daemon] Received response from channel: "${rawText}"`);
      try {
        const resolved = resolveResponse(rawText);

        if (resolved) {
          const { question, response } = resolved;
          let session = getSession(question.event.sessionId);

          // Fallback: find a session with the same cwd (project)
          if (!session) {
            cleanDeadSessions();
            const byCwd = listSessions().filter(s =>
              s.tmuxPane && s.cwd === question.event.project,
            );
            if (byCwd.length === 1) {
              session = byCwd[0];
              console.log(`[daemon] Session ${question.event.sessionId} not found, matched by cwd → ${session.tmuxPane}`);
            } else {
              console.log(`[daemon] Session ${question.event.sessionId} not found (${byCwd.length} cwd matches)`);
            }
          }

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
        await routeAsFreeTo(sessions, cleanText);
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

        let targetSession: SessionInfo | undefined;

        // If sessionId is known (reply to a notification), use it directly
        if (msg.sessionId) {
          targetSession = activeSessions.find(s => s.sessionId === msg.sessionId);
        }

        if (!targetSession && activeSessions.length === 1) {
          targetSession = activeSessions[0];
        }

        if (!targetSession && channel.sendSessionPicker) {
          const sessionChoices = activeSessions.map(s => ({
            id: s.sessionId,
            label: `${s.cwd.split('/').pop()} (${s.tmuxPane})`,
          }));
          picker.text = msg.text;
          picker.sessions = activeSessions;
          await channel.sendSessionPicker(
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
  };
}
