import { logDaemon } from '../utils/log.js';
import { KaClient } from './client.js';
import { loadKaConfig } from './config.js';
import { SessionStatePublisher } from './publisher.js';
import { collectSessionSnapshots } from './snapshot.js';

const TICK_MS = 1000;

/**
 * Start pushing session state transitions to Ka when ~/.config/ka/config is
 * present. Returns a stop function, or null when Ka is not configured.
 */
export function startKaPublisher(): (() => void) | null {
  const config = loadKaConfig();
  if (!config) return null;

  const client = new KaClient(config);
  const publisher = new SessionStatePublisher({
    snapshot: collectSessionSnapshots,
    send: update => client.postSessionState(update),
    log: logDaemon,
  });
  const timer = setInterval(() => { void publisher.tick(); }, TICK_MS);
  logDaemon('ka-publisher-started', config.url);
  return () => clearInterval(timer);
}
