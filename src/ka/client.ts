import type { KaConfig } from './config.js';

export type KaSessionState = 'working' | 'waiting_input' | 'waiting_permission' | 'idle' | 'ended';

/** Body of POST /v1/agent-sessions (Ka contract v1). Never carries tool input. */
export interface KaSessionUpdate {
  session_id: string;
  project: string;
  state: KaSessionState;
  type?: string;
  question?: string;
  tmux_pane?: string;
  at: string;
}

export type KaSendOutcome =
  | { status: 'sent' }
  | { status: 'retry'; afterMs: number }
  | { status: 'failed'; reason: string };

const REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_MS = 30_000;

export class KaClient {
  constructor(private readonly config: KaConfig) {}

  async postSessionState(update: KaSessionUpdate): Promise<KaSendOutcome> {
    let res: Response;
    try {
      res = await fetch(`${this.config.url}/v1/agent-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(update),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { status: 'retry', afterMs: DEFAULT_RETRY_MS };
    }
    return toOutcome(res.status, res.headers.get('retry-after'));
  }
}

export function toOutcome(status: number, retryAfter: string | null): KaSendOutcome {
  if (status >= 200 && status < 300) return { status: 'sent' };
  if (status === 429) {
    const seconds = Number(retryAfter);
    return { status: 'retry', afterMs: seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_MS };
  }
  if (status >= 500) return { status: 'retry', afterMs: DEFAULT_RETRY_MS };
  // 400 / 401 / 403: retrying the same request cannot succeed.
  return { status: 'failed', reason: `http-${status}` };
}
