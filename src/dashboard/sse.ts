import type { FastifyReply } from 'fastify';

const clients = new Set<FastifyReply>();

export function addSSEClient(reply: FastifyReply): void {
  clients.add(reply);
  reply.raw.on('close', () => clients.delete(reply));
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
