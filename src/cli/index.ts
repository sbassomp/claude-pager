#!/usr/bin/env node

import { Command } from 'commander';
import { startDaemon, stopDaemon, isDaemonRunning } from '../daemon/index.js';
import { setup } from './setup.js';
import { run } from './run.js';
import { loadConfig } from '../config/index.js';

const program = new Command();

program
  .name('claude-relay')
  .description('Remote notification and response relay for Claude Code')
  .version('0.1.0');

program
  .command('start')
  .description('Start the relay daemon')
  .action(async () => {
    await startDaemon();
  });

program
  .command('stop')
  .description('Stop the relay daemon')
  .action(() => {
    stopDaemon();
  });

program
  .command('status')
  .description('Show daemon status')
  .action(async () => {
    const { running, pid } = isDaemonRunning();
    if (running) {
      console.log(`Daemon is running (PID ${pid})`);
      const config = loadConfig();
      try {
        const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/health`);
        const data = await res.json();
        console.log('Health:', JSON.stringify(data, null, 2));
      } catch {
        console.log('Warning: daemon PID exists but HTTP is not responding');
      }
    } else {
      console.log('Daemon is not running');
    }
  });

program
  .command('pending')
  .description('List pending questions')
  .action(async () => {
    const config = loadConfig();
    try {
      const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/pending`);
      const data = (await res.json()) as { pending: Array<{ event: { id: string; type: string; message: string; project: string }; notifiedAt: number }> };
      if (data.pending.length === 0) {
        console.log('No pending questions');
        return;
      }
      for (const q of data.pending) {
        const ago = Math.round((Date.now() - q.notifiedAt) / 1000);
        console.log(`  [${q.event.id.slice(0, 8)}] ${q.event.type} — ${q.event.project.split('/').pop()} (${ago}s ago)`);
        console.log(`    ${q.event.message}`);
      }
    } catch {
      console.log('Daemon is not running');
    }
  });

program
  .command('setup')
  .description('Configure relay and install Claude Code hooks')
  .option('--server <url>', 'ntfy server URL')
  .option('--topic <topic>', 'ntfy topic name')
  .option('--user <user>', 'ntfy username')
  .option('--password <password>', 'ntfy password')
  .option('--token <token>', 'ntfy access token')
  .action(async (options) => {
    await setup(options);
  });

program
  .command('run')
  .description('Launch Claude Code inside a tmux session for reliable response injection')
  .allowUnknownOption(true)
  .action((_, cmd) => {
    run(cmd.args);
  });

program.parse();
