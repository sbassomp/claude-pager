import type { FastifyReply } from 'fastify';

const clients = new Set<FastifyReply>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      try {
        client.raw.write(':\n\n');
      } catch {
        clients.delete(client);
      }
    }
    if (clients.size === 0 && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, 15_000);
}

export function addSSEClient(reply: FastifyReply): void {
  clients.add(reply);
  reply.raw.on('close', () => clients.delete(reply));
  startHeartbeat();
}

export function broadcastSSE(eventType = 'refresh'): void {
  const payload = `event: ${eventType}\ndata: ${Date.now()}\n\n`;
  for (const client of clients) {
    try {
      client.raw.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function sseClientCount(): number {
  return clients.size;
}

export function closeAllSSEClients(): void {
  for (const client of clients) {
    try { client.raw.end(); } catch { /* ignore */ }
  }
  clients.clear();
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
