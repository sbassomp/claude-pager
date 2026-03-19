import type { ChannelProvider, ChannelListeners, NotificationResult, FreeMessage } from '../channel.js';
import type { TelegramConfig, RelayEvent } from '../../types.js';
import { downloadTelegramVoice, transcribeAudio, cleanupFile } from '../../voice/transcribe.js';

interface TelegramResponse {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
  message?: {
    message_id: number;
    text?: string;
    voice?: { file_id: string; duration: number };
    reply_to_message?: { message_id: number };
  };
}

export class TelegramProvider implements ChannelProvider {
  readonly name = 'telegram';
  private abortController: AbortController | null = null;
  private readonly config: TelegramConfig;
  private lastUpdateId = 0;
  // Map telegram message_id → event_id for reply-based routing
  private messageToEvent = new Map<number, string>();
  // Map telegram message_id → session_id for free message routing
  private messageToSession = new Map<number, string>();

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.config.botToken}/${method}`;
  }

  async send(event: RelayEvent, shortId: string): Promise<NotificationResult> {
    const projectName = event.project.split('/').pop() || event.project;
    const isPermission = event.type === 'permission_prompt';

    // Build message text (HTML format)
    const icon = isPermission ? '🔒' : '💬';
    let text = `${icon} <b>#${shortId} ${this.escapeHtml(projectName)}</b>\n\n`;
    if (event.toolName) {
      text += `<code>${this.escapeHtml(event.toolName)}</code>`;
      if (event.toolInput) {
        const input = event.toolInput.length > 300
          ? event.toolInput.slice(0, 300) + '...'
          : event.toolInput;
        text += `\n<pre>${this.escapeHtml(input)}</pre>`;
      }
    } else {
      text += this.markdownToHtml(event.message);
    }

    // Build inline keyboard
    const keyboard = isPermission
      ? {
          inline_keyboard: [
            [
              { text: '✅ Allow', callback_data: `allow:${event.id}` },
              { text: '❌ Deny', callback_data: `deny:${event.id}` },
            ],
          ],
        }
      : undefined;

    try {
      const res = await fetch(this.apiUrl('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }),
      });

      const data = (await res.json()) as TelegramResponse;
      if (!data.ok) {
        return { success: false, error: `Telegram API: ${data.description}` };
      }

      const messageId = data.result?.message_id;
      if (messageId) {
        this.messageToEvent.set(messageId, event.id);
        this.messageToSession.set(messageId, event.sessionId);
      }
      return { success: true, messageId: String(messageId) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async sendRaw(text: string): Promise<void> {
    await fetch(this.apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  }

  async sendSessionPicker(text: string, sessions: Array<{ id: string; label: string }>): Promise<number | undefined> {
    const keyboard = {
      inline_keyboard: sessions.map(s => [
        { text: s.label, callback_data: `session:${s.id}` },
      ]),
    };

    try {
      const res = await fetch(this.apiUrl('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }),
      });
      const data = (await res.json()) as TelegramResponse;
      return data.result?.message_id;
    } catch {
      return undefined;
    }
  }

  startListening(listeners: ChannelListeners): void {
    this.stopListening();
    this.abortController = new AbortController();
    this.poll(listeners);
  }

  private async poll(listeners: ChannelListeners): Promise<void> {
    const signal = this.abortController!.signal;

    while (!signal.aborted) {
      try {
        const res = await fetch(this.apiUrl('getUpdates'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: this.lastUpdateId,
            timeout: 25,
            allowed_updates: ['callback_query', 'message'],
          }),
          signal,
        });

        const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
        if (!data.ok || !data.result) continue;

        for (const update of data.result) {
          this.lastUpdateId = update.update_id + 1;

          if (update.callback_query) {
            await this.handleCallback(update.callback_query, listeners);
          } else if (update.message?.voice) {
            await this.handleVoice(update.message, listeners);
          } else if (update.message?.text) {
            if (update.message.reply_to_message) {
              await this.handleReply(update.message, listeners);
            } else if (listeners.onFreeMessage) {
              await this.handleFreeMessage(update.message, listeners.onFreeMessage);
            }
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        console.error('[telegram] poll error:', err);
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 5000);
          signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
    }
  }

  private async handleCallback(
    cb: NonNullable<TelegramUpdate['callback_query']>,
    listeners: ChannelListeners,
  ): Promise<void> {
    // Acknowledge the button press
    try {
      await fetch(this.apiUrl('answerCallbackQuery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: 'Received!' }),
      });
    } catch { /* best effort */ }

    if (!cb.data) return;

    const [action, id] = cb.data.split(':', 2);
    if (!id) return;

    // Session picker callback
    if (action === 'session') {
      if (cb.message) {
        try {
          await fetch(this.apiUrl('editMessageText'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cb.message.chat.id,
              message_id: cb.message.message_id,
              text: `➡️ Sent to session`,
            }),
          });
        } catch { /* best effort */ }
      }
      // Forward session pick as a special response
      console.log(`[telegram] session picked: ${id}`);
      try {
        await Promise.resolve(listeners.onResponse(`__session_pick__:${id}`));
      } catch (err) {
        console.error('[telegram] session pick handler error:', err);
      }
      return;
    }

    const responseText = action === 'allow' ? 'allow' : action === 'deny' ? 'deny' : action;

    // Update the message to show the action taken
    if (cb.message) {
      try {
        await fetch(this.apiUrl('editMessageReplyMarkup'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cb.message.chat.id,
            message_id: cb.message.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: action === 'allow' ? '✅ Allowed' : '❌ Denied', callback_data: 'noop' }],
              ],
            },
          }),
        });
      } catch { /* best effort */ }
    }

    console.log(`[telegram] callback: ${action} for event ${id}`);
    try {
      await Promise.resolve(listeners.onResponse(`#${id} ${responseText}`));
    } catch (err) {
      console.error('[telegram] callback handler error:', err);
    }
  }

  private async handleVoice(
    msg: NonNullable<TelegramUpdate['message']>,
    listeners: ChannelListeners,
  ): Promise<void> {
    if (!msg.voice) return;

    console.log(`[telegram] voice message received (${msg.voice.duration}s)`);

    // Send a "transcribing..." feedback
    let statusMsgId: number | undefined;
    try {
      const res = await fetch(this.apiUrl('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: '🎙️ Transcribing...',
          reply_to_message_id: msg.message_id,
        }),
      });
      const data = (await res.json()) as TelegramResponse;
      statusMsgId = data.result?.message_id;
    } catch { /* best effort */ }

    let audioPath: string | undefined;
    try {
      // Download and transcribe
      audioPath = await downloadTelegramVoice(this.config.botToken, msg.voice.file_id);
      const result = await transcribeAudio(audioPath, this.config.voiceLanguage || 'fr');
      const text = result.text.trim();

      console.log(`[telegram] transcribed (${result.language}): "${text}"`);

      // Update status message with transcription
      if (statusMsgId) {
        try {
          await fetch(this.apiUrl('editMessageText'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: this.config.chatId,
              message_id: statusMsgId,
              text: `🎙️ "${text}"`,
            }),
          });
        } catch { /* best effort */ }
      }

      if (!text) return;

      // Treat transcribed text like a regular message
      const fakeMsg = { ...msg, text };
      if (msg.reply_to_message) {
        await this.handleReply(fakeMsg, listeners);
      } else if (listeners.onFreeMessage) {
        await this.handleFreeMessage(fakeMsg, listeners.onFreeMessage);
      }
    } catch (err) {
      console.error('[telegram] voice transcription error:', err);
      if (statusMsgId) {
        try {
          await fetch(this.apiUrl('editMessageText'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: this.config.chatId,
              message_id: statusMsgId,
              text: `❌ Transcription failed: ${err}`,
            }),
          });
        } catch { /* best effort */ }
      }
    } finally {
      if (audioPath) cleanupFile(audioPath);
    }
  }

  private async handleFreeMessage(
    msg: NonNullable<TelegramUpdate['message']>,
    onFreeMessage: (msg: FreeMessage) => void | Promise<void>,
  ): Promise<void> {
    if (!msg.text) return;

    console.log(`[telegram] free message: "${msg.text}"`);
    try {
      await Promise.resolve(onFreeMessage({
        text: msg.text,
        replyCallback: async (reply: string) => {
          await this.sendRaw(reply);
        },
      }));
    } catch (err) {
      console.error('[telegram] free message handler error:', err);
    }
  }

  private async handleReply(
    msg: NonNullable<TelegramUpdate['message']>,
    listeners: ChannelListeners,
  ): Promise<void> {
    if (!msg.text || !msg.reply_to_message) return;

    const replyToId = msg.reply_to_message.message_id;
    const eventId = this.messageToEvent.get(replyToId);

    if (eventId) {
      // Reply to a notification with a pending event
      console.log(`[telegram] reply to event ${eventId}: "${msg.text}"`);
      try {
        await Promise.resolve(listeners.onResponse(`#${eventId} ${msg.text}`));
      } catch (err) {
        console.error('[telegram] reply handler error:', err);
      }
      return;
    }

    const sessionId = this.messageToSession.get(replyToId);
    if (sessionId && listeners.onFreeMessage) {
      // Reply to a notification — we know the session, inject directly
      console.log(`[telegram] reply to session ${sessionId}: "${msg.text}"`);
      try {
        await Promise.resolve(listeners.onFreeMessage({
          text: msg.text,
          sessionId,
          replyCallback: async (reply: string) => { await this.sendRaw(reply); },
        }));
      } catch (err) {
        console.error('[telegram] reply handler error:', err);
      }
      return;
    }

    if (listeners.onFreeMessage) {
      // Reply to an unknown message — treat as free message
      console.log(`[telegram] reply as free message: "${msg.text}"`);
      await this.handleFreeMessage(msg, listeners.onFreeMessage);
    }
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private markdownToHtml(md: string): string {
    const escaped = this.escapeHtml(md);
    let result = '';
    let inCodeBlock = false;

    for (const line of escaped.split('\n')) {
      if (line.match(/^```/)) {
        if (inCodeBlock) {
          result += '</pre>\n';
          inCodeBlock = false;
        } else {
          result += '<pre>';
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        result += line + '\n';
        continue;
      }

      let converted = line;
      converted = converted.replace(/^#{1,3}\s+(.+)$/, '<b>$1</b>');
      converted = converted.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      converted = converted.replace(/__(.+?)__/g, '<b>$1</b>');
      converted = converted.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>');
      converted = converted.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>');
      converted = converted.replace(/`([^`]+?)`/g, '<code>$1</code>');
      converted = converted.replace(/^(\s*)[-*]\s+/, '$1• ');

      result += converted + '\n';
    }

    if (inCodeBlock) {
      result += '</pre>\n';
    }

    return result.trimEnd();
  }

  stopListening(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
