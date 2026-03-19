import type { ChannelProvider, ChannelListeners, NotificationResult } from '../channel.js';
import type { NtfyConfig, RelayEvent } from '../../types.js';

export class NtfyProvider implements ChannelProvider {
  readonly name = 'ntfy';
  private abortController: AbortController | null = null;
  private readonly config: NtfyConfig;
  private processedIds = new Set<string>();

  constructor(config: NtfyConfig) {
    this.config = config;
  }

  private get topicUrl(): string {
    return `${this.config.server}/${this.config.topic}`;
  }

  private authHeaders(): Record<string, string> {
    if (this.config.token) {
      return { Authorization: `Bearer ${this.config.token}` };
    }
    if (this.config.user && this.config.password) {
      const encoded = Buffer.from(`${this.config.user}:${this.config.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    return {};
  }

  async send(event: RelayEvent, shortId: string): Promise<NotificationResult> {
    const projectName = event.project.split('/').pop() || event.project;
    const title = `Claude Code - ${projectName}`;
    const isPermission = event.type === 'permission_prompt';

    const tag = isPermission ? 'robot,lock' : 'robot,question';
    const hint = isPermission ? 'Reply: allow / deny' : 'Reply with your answer';

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain',
      Title: title,
      Priority: isPermission ? 'high' : 'default',
      Tags: tag,
      ...this.authHeaders(),
    };

    let body = `#${shortId} ${event.message}`;
    if (event.toolName) {
      body += `\n${event.toolName}`;
      if (event.toolInput) {
        const input = event.toolInput.length > 200 ? event.toolInput.slice(0, 200) + '...' : event.toolInput;
        body += `(${input})`;
      }
    }
    body += `\n\n${hint}`;

    try {
      const res = await fetch(this.topicUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `ntfy responded ${res.status}: ${text}` };
      }

      const data = (await res.json()) as { id?: string };
      if (data.id) {
        this.processedIds.add(data.id);
      }
      return { success: true, messageId: data.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  startListening(listeners: ChannelListeners): void {
    this.stopListening();
    this.abortController = new AbortController();
    this.poll(listeners.onResponse);
  }

  private async poll(
    onResponse: (rawText: string) => void | Promise<void>,
  ): Promise<void> {
    const signal = this.abortController!.signal;

    let pollCount = 0;
    while (!signal.aborted) {
      try {
        pollCount++;
        if (pollCount % 2 === 0) console.log(`[ntfy] poll #${pollCount}`);
        const url = `${this.topicUrl}/json?poll=1&since=30s`;
        const res = await fetch(url, {
          headers: this.authHeaders(),
          signal,
        });

        if (res.ok) {
          const text = await res.text();
          for (const line of text.split('\n').filter(Boolean)) {
            try {
              const msg = JSON.parse(line) as { id?: string; event?: string; message?: string };
              if (msg.event !== 'message' || !msg.message) continue;
              if (msg.id && this.processedIds.has(msg.id)) continue;
              if (msg.id) this.processedIds.add(msg.id);
              if (/^#\d+ .+\n\nReply[ :]/.test(msg.message)) continue;

              console.log(`[ntfy] received response: "${msg.message}"`);
              try {
                await Promise.resolve(onResponse(msg.message));
              } catch (cbErr) {
                console.error('[ntfy] callback error:', cbErr);
              }
            } catch {
              // skip malformed line
            }
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        console.error('[ntfy] poll error:', err);
      }

      // Simple sleep that resolves on abort instead of rejecting
      if (signal.aborted) return;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 5000);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }

  stopListening(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
