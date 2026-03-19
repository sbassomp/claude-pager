import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { loadConfig, saveConfig, ensureDataDir } from '../config/index.js';
import type { ChannelConfig } from '../types.js';

const CLAUDE_SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');

function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function promptSecret(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (process.stdin.isTTY) {
      process.stdout.write(`${question}: `);
      process.stdin.setRawMode(true);
      let input = '';
      const onData = (ch: Buffer) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u007f' || c === '\b') {
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else if (c === '\u0003') {
          rl.close();
          process.exit(1);
        } else {
          input += c;
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(`${question}: `, answer => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

interface ClaudeSettings {
  hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }>>;
  [key: string]: unknown;
}

const HOOKS_CONFIG = {
  SessionStart: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'claude-relay-hook session-start',
          timeout: 3000,
        },
      ],
    },
  ],
  Notification: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'claude-relay-hook notification',
          timeout: 5000,
        },
      ],
    },
  ],
};

export async function setup(options: {
  server?: string;
  topic?: string;
  user?: string;
  password?: string;
  token?: string;
}): Promise<void> {
  ensureDataDir();

  const config = loadConfig();

  console.log('=== claude-relay setup ===\n');

  const channelType = await prompt('Channel: (n)tfy or (t)elegram?', config.channel.type === 'telegram' ? 't' : 'n');

  let channel: ChannelConfig;

  if (channelType.startsWith('t')) {
    channel = await setupTelegram(config.channel.telegram);
  } else {
    channel = await setupNtfy(config.channel.ntfy, options);
  }

  config.channel = channel;
  saveConfig(config);
  console.log('\nConfiguration saved to ~/.claude-relay/config.json');

  installHooks();
}

async function setupNtfy(
  current?: { server: string; topic: string; user?: string; password?: string; token?: string },
  options: { server?: string; topic?: string; user?: string; password?: string; token?: string } = {},
): Promise<ChannelConfig> {
  const server = options.server || await prompt('ntfy server URL', current?.server || 'https://ntfy.sh');
  const topic = options.topic || await prompt('ntfy topic', current?.topic || 'claude-relay');

  const authMethod = await prompt('Authentication: (u)ser/password, (t)oken, or (n)one?', 'u');

  let user: string | undefined;
  let password: string | undefined;
  let token: string | undefined;

  if (authMethod.startsWith('t')) {
    token = options.token || await promptSecret('ntfy access token');
  } else if (authMethod.startsWith('u')) {
    user = options.user || await prompt('ntfy username', current?.user || '');
    password = options.password || await promptSecret('ntfy password');
  }

  const ntfy = {
    server,
    topic,
    ...(user && { user }),
    ...(password && { password }),
    ...(token && { token }),
  };

  console.log('\nTesting ntfy connection...');
  const testOk = await testNtfy(ntfy);
  console.log(testOk ? 'ntfy connection OK' : 'Warning: ntfy test failed');

  return { type: 'ntfy', ntfy };
}

async function setupTelegram(
  current?: { botToken: string; chatId: number },
): Promise<ChannelConfig> {
  const botToken = await promptSecret('Telegram bot token (from @BotFather)');

  // Verify bot token
  console.log('\nVerifying bot token...');
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as { ok: boolean; result?: { username: string } };
    if (!data.ok) {
      throw new Error('Invalid bot token');
    }
    console.log(`Bot: @${data.result!.username}`);
  } catch (err) {
    throw new Error(`Bot verification failed: ${err}`, { cause: err });
  }

  // Get chat ID
  let chatId = current?.chatId;
  if (!chatId) {
    console.log('\nSend any message to your bot on Telegram, then press Enter here...');
    await prompt('Press Enter when done');

    // Fetch the latest message to get chat_id
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=1&offset=-1`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = (await res.json()) as { ok: boolean; result?: Array<{ message?: { chat: { id: number; first_name?: string } } }> };
      if (data.ok && data.result?.length && data.result[0].message) {
        chatId = data.result[0].message.chat.id;
        console.log(`Chat ID: ${chatId} (${data.result[0].message.chat.first_name || 'unknown'})`);
      } else {
        throw new Error('No message found. Make sure you sent a message to the bot.');
      }
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error(`Failed to get chat ID: ${err}`, { cause: err });
    }
  } else {
    console.log(`Using existing chat ID: ${chatId}`);
  }

  // Test by sending a message
  console.log('\nSending test message...');
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'claude-relay setup OK',
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as { ok: boolean };
    console.log(data.ok ? 'Telegram connection OK' : 'Warning: test message failed');
  } catch (err) {
    console.log(`Warning: ${err}`);
  }

  return { type: 'telegram', telegram: { botToken, chatId: chatId! } };
}

async function testNtfy(ntfy: { server: string; topic: string; user?: string; password?: string; token?: string }): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    Title: 'claude-relay',
    Priority: 'low',
    Tags: 'white_check_mark',
  };
  if (ntfy.token) {
    headers['Authorization'] = `Bearer ${ntfy.token}`;
  } else if (ntfy.user && ntfy.password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${ntfy.user}:${ntfy.password}`).toString('base64')}`;
  }

  try {
    const res = await fetch(`${ntfy.server}/${ntfy.topic}`, {
      method: 'POST',
      headers,
      body: 'claude-relay setup OK',
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (err) {
    console.error(String(err));
    return false;
  }
}

function installHooks(): void {
  let settings: ClaudeSettings = {};

  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_FILE, 'utf-8'));
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const [event, hookConfigs] of Object.entries(HOOKS_CONFIG)) {
    const existing = settings.hooks[event] || [];
    const alreadyInstalled = existing.some(group =>
      group.hooks.some(h => h.command.startsWith('claude-relay-hook')),
    );

    if (!alreadyInstalled) {
      settings.hooks[event] = [...existing, ...hookConfigs];
    }
  }

  writeFileSync(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
  console.log('Claude Code hooks installed in ~/.claude/settings.json');
}
