import type { ChannelConfig } from '../types.js';
import type { ChannelProvider } from './channel.js';
import { NtfyProvider } from './ntfy/provider.js';

export function createChannel(config: ChannelConfig): ChannelProvider {
  switch (config.type) {
    case 'ntfy':
      if (!config.ntfy) {
        throw new Error('ntfy configuration is required when channel type is "ntfy"');
      }
      return new NtfyProvider(config.ntfy);
    default:
      throw new Error(`Unknown channel type: ${config.type}`);
  }
}
