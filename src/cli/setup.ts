import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { loadConfig, saveConfig, ensureDataDir } from '../config/index.js';

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
    // Disable echo for password input
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
          // Ctrl+C
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
  const currentNtfy = config.channel.ntfy;

  console.log('=== claude-relay setup ===\n');

  // Interactive prompts — CLI flags override
  const server = options.server || await prompt('ntfy server URL', currentNtfy?.server || 'https://ntfy.sh');
  const topic = options.topic || await prompt('ntfy topic', currentNtfy?.topic || 'claude-relay');

  const authMethod = await prompt('Authentication: (u)ser/password, (t)oken, or (n)one?', 'u');

  let user: string | undefined;
  let password: string | undefined;
  let token: string | undefined;

  if (authMethod.startsWith('t')) {
    token = options.token || await promptSecret('ntfy access token');
  } else if (authMethod.startsWith('u')) {
    user = options.user || await prompt('ntfy username', currentNtfy?.user || '');
    password = options.password || await promptSecret('ntfy password');
  }

  config.channel = {
    type: 'ntfy',
    ntfy: {
      server,
      topic,
      ...(user && { user }),
      ...(password && { password }),
      ...(token && { token }),
    },
  };

  saveConfig(config);
  console.log('\nConfiguration saved to ~/.claude-relay/config.json');

  // Test connection
  console.log('\nTesting ntfy connection...');
  const testOk = await testNtfy(config.channel.ntfy!);
  if (testOk) {
    console.log('ntfy connection OK');
  } else {
    console.log('Warning: ntfy test failed — check your config');
  }

  // Install Claude Code hooks
  installHooks();
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

  // Merge hooks, preserving existing ones
  for (const [event, hookConfigs] of Object.entries(HOOKS_CONFIG)) {
    const existing = settings.hooks[event] || [];
    // Check if our hook is already installed
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
