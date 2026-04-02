import * as http from 'node:http';
import type { TerminalTracker } from './terminal-tracker';

interface RegisterBody {
  sessionId: string;
  pid: number;
}

interface InjectBody {
  sessionId: string;
  text: string;
  eventType: 'permission_prompt' | 'idle_prompt';
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export class InjectionServer {
  private server: http.Server;
  private _port = 0;

  constructor(private tracker: TerminalTracker) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  get port(): number {
    return this._port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
          resolve(this._port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      this.server.on('error', reject);
    });
  }

  stop(): void {
    this.server.close();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        json(res, 200, { ok: true, terminals: this.tracker.terminalCount, sessions: this.tracker.sessionCount });
        return;
      }

      if (req.method === 'POST' && req.url === '/register') {
        const body = JSON.parse(await readBody(req)) as RegisterBody;
        const ok = this.tracker.register(body.sessionId, body.pid);
        json(res, ok ? 200 : 404, { ok, sessionId: body.sessionId });
        return;
      }

      if (req.method === 'POST' && req.url === '/inject') {
        const body = JSON.parse(await readBody(req)) as InjectBody;
        const terminal = this.tracker.getTerminal(body.sessionId);
        if (!terminal) {
          json(res, 404, { error: 'Terminal not found for session' });
          return;
        }

        this.injectIntoTerminal(terminal, body.text, body.eventType);
        json(res, 200, { ok: true, sessionId: body.sessionId });
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
  }

  private injectIntoTerminal(terminal: import('vscode').Terminal, text: string, eventType: string): void {
    if (eventType === 'permission_prompt') {
      const lower = text.toLowerCase().trim();
      if (['allow', 'yes', 'y'].includes(lower)) {
        // Yes is pre-selected — just press Enter
        terminal.sendText('', true);
      } else if (['deny', 'no', 'n'].includes(lower)) {
        // Navigate to last option (No) with End key, then Enter
        terminal.sendText('\x1b[F', false); // End key
        setTimeout(() => terminal.sendText('', true), 50);
      } else {
        terminal.sendText(text, true);
      }
    } else {
      terminal.sendText(text, true);
    }
  }
}
