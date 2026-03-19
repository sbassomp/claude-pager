import type { ChannelProvider, NotificationResult } from '../channel.js';
import type { TelegramConfig, RelayEvent } from '../../types.js';

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
    let text = `<b>#${shortId} ${this.escapeHtml(projectName)}</b>\n`;
    if (event.toolName) {
      text += `<code>${this.escapeHtml(event.toolName)}</code>`;
      if (event.toolInput) {
        const input = event.toolInput.length > 200
          ? event.toolInput.slice(0, 200) + '...'
          : event.toolInput;
        text += `\n<pre>${this.escapeHtml(input)}</pre>`;
      }
      text += '\n';
    } else {
      text += `${this.escapeHtml(event.message)}\n`;
    }

    // Build inline keyboard
    const keyboard = isPermission
      ? {
          inline_keyboard: [
            [
              { text: 'Allow', callback_data: `allow:${event.id}` },
              { text: 'Deny', callback_data: `deny:${event.id}` },
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
      }
      return { success: true, messageId: String(messageId) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  startListening(onResponse: (rawText: string) => void | Promise<void>): void {
    this.stopListening();
    this.abortController = new AbortController();
    this.poll(onResponse);
  }

  private async poll(
    onResponse: (rawText: string) => void | Promise<void>,
  ): Promise<void> {
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
            await this.handleCallback(update.callback_query, onResponse);
          } else if (update.message?.text && update.message.reply_to_message) {
            await this.handleReply(update.message, onResponse);
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        console.error('[telegram] poll error:', err);
        // Wait before retrying on error
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 5000);
          signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
    }
  }

  private async handleCallback(
    cb: NonNullable<TelegramUpdate['callback_query']>,
    onResponse: (rawText: string) => void | Promise<void>,
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

    // Parse callback data: "allow:event-id" or "deny:event-id"
    const [action, eventId] = cb.data.split(':', 2);
    if (!eventId) return;

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
                [{ text: `${action === 'allow' ? 'Allowed' : 'Denied'}`, callback_data: 'noop' }],
              ],
            },
          }),
        });
      } catch { /* best effort */ }
    }

    console.log(`[telegram] callback: ${action} for event ${eventId}`);
    // Use the exact event ID format for resolveResponse
    try {
      await Promise.resolve(onResponse(`#${eventId} ${responseText}`));
    } catch (err) {
      console.error('[telegram] callback handler error:', err);
    }
  }

  private async handleReply(
    msg: NonNullable<TelegramUpdate['message']>,
    onResponse: (rawText: string) => void | Promise<void>,
  ): Promise<void> {
    if (!msg.text || !msg.reply_to_message) return;

    // Find the event ID from the original message
    const eventId = this.messageToEvent.get(msg.reply_to_message.message_id);
    if (eventId) {
      console.log(`[telegram] reply to event ${eventId}: "${msg.text}"`);
      try {
        await Promise.resolve(onResponse(`#${eventId} ${msg.text}`));
      } catch (err) {
        console.error('[telegram] reply handler error:', err);
      }
    } else {
      // No mapping found, forward as raw text
      console.log(`[telegram] raw message: "${msg.text}"`);
      try {
        await Promise.resolve(onResponse(msg.text));
      } catch (err) {
        console.error('[telegram] message handler error:', err);
      }
    }
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  stopListening(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
