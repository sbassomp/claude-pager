import type { ChannelConfig } from '../types.js';
import type { ChannelProvider } from './channel.js';
import { NtfyProvider } from './ntfy/provider.js';
import { TelegramProvider } from './telegram/provider.js';

export function createChannel(config: ChannelConfig): ChannelProvider {
  switch (config.type) {
    case 'ntfy':
      if (!config.ntfy) {
        throw new Error('ntfy configuration is required when channel type is "ntfy"');
      }
      return new NtfyProvider(config.ntfy);
    case 'telegram':
      if (!config.telegram) {
        throw new Error('telegram configuration is required when channel type is "telegram"');
      }
      return new TelegramProvider(config.telegram);
    default:
      throw new Error(`Unknown channel type: ${config.type}`);
  }
}
