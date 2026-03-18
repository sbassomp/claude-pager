import type { ChannelProvider, NotificationResult } from '../channel.js';
import type { NtfyConfig, RelayEvent } from '../../types.js';

export class NtfyProvider implements ChannelProvider {
  readonly name = 'ntfy';
  private abortController: AbortController | null = null;
  private readonly config: NtfyConfig;
  private processedIds = new Set<string>();
  private lastPollTime = 0;

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

    const body = `#${shortId} ${event.message}\n\n${hint}`;

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
      // Track our own message so we don't process it as a response
      if (data.id) {
        this.processedIds.add(data.id);
      }
      return { success: true, messageId: data.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  startListening(onResponse: (rawText: string) => void): void {
    this.stopListening();
    this.abortController = new AbortController();
    this.lastPollTime = Math.floor(Date.now() / 1000);

    this.poll(onResponse);
  }

  private async poll(
    onResponse: (rawText: string) => void,
  ): Promise<void> {
    while (this.abortController && !this.abortController.signal.aborted) {
      try {
        const url = `${this.topicUrl}/json?poll=1&since=${this.lastPollTime}`;
        const res = await fetch(url, {
          headers: this.authHeaders(),
          signal: this.abortController.signal,
        });

        if (res.ok) {
          const text = await res.text();
          for (const line of text.split('\n').filter(Boolean)) {
            try {
              const msg = JSON.parse(line) as { id?: string; time?: number; event?: string; message?: string };
              if (msg.event !== 'message' || !msg.message) continue;

              // Advance the cursor past this message
              if (msg.time && msg.time >= this.lastPollTime) {
                this.lastPollTime = msg.time + 1;
              }

              // Skip already-seen messages
              if (msg.id && this.processedIds.has(msg.id)) continue;
              if (msg.id) this.processedIds.add(msg.id);

              // Skip messages that look like our notifications
              if (/^#\d+ .+\n\nReply:/.test(msg.message)) continue;

              console.log(`[ntfy] received response: "${msg.message}"`);
              onResponse(msg.message);
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (err) {
        if (this.abortController?.signal.aborted) return;
        console.error('[ntfy] poll error:', err);
      }

      await this.sleep(5000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      }, { once: true });
    });
  }

  stopListening(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
