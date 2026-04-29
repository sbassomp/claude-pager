#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { registerSession } from '../sessions/tracker.js';
import { ensureDataDir } from '../config/index.js';
import type { SessionInfo } from '../types.js';

// Skip if relay is explicitly disabled (e.g. when working on claude-pager itself)
if (process.env.CLAUDE_PAGER_DISABLED) {
  process.exit(0);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function getActiveWindowId(): number | undefined {
  // xdotool is X11-only — skip on macOS/Windows where it can't help anyway
  if (process.platform !== 'linux') return undefined;
  try {
    const out = execFileSync('xdotool', ['getactivewindow'], { timeout: 2000 });
    return parseInt(out.toString().trim(), 10) || undefined;
  } catch {
    return undefined;
  }
}

interface ToolUseInfo {
  toolName?: string;
  toolInput?: string;
  context?: string;
}

function findToolUseInFile(filePath: string, maxLines: number): ToolUseInfo | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - maxLines); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              const input = block.input;
              let toolInput: string | undefined;
              if (input?.command) {
                toolInput = input.command;
              } else if (input?.old_string != null && input?.new_string != null) {
                // Edit tool — show diff-like view
                const file = input.file_path || '';
                const old = String(input.old_string).slice(0, 1000);
                const nw = String(input.new_string).slice(0, 1000);
                toolInput = `${file}\n--- old\n${old}\n+++ new\n${nw}`;
              } else if (input?.file_path && input?.content) {
                toolInput = `${input.file_path}\n${String(input.content).slice(0, 150)}`;
              } else if (input?.file_path) {
                toolInput = input.file_path;
              } else if (typeof input === 'object') {
                toolInput = JSON.stringify(input).slice(0, 200);
              }
              // Extract assistant text from same message as context
              const textBlocks = entry.message.content
                .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
                .map((b: { text: string }) => b.text);
              const context = textBlocks.length > 0
                ? textBlocks.join('\n').slice(-500)
                : undefined;
              return { toolName: block.name, toolInput, context };
            }
          }
        }
      } catch {
        // skip unparseable lines
      }
    }
  } catch {
    // file not readable
  }
  return null;
}

function extractToolContext(transcriptPath: string): ToolUseInfo {
  // Try the main transcript first
  const result = findToolUseInFile(transcriptPath, 30);
  if (result) return result;

  // If not found, check the most recent subagent transcript
  // (tool_use from subagents doesn't appear in the main transcript)
  try {
    const dir = transcriptPath.replace('.jsonl', '') + '/subagents';
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of files.slice(0, 3)) {
      const subResult = findToolUseInFile(join(dir, file.name), 15);
      if (subResult) return subResult;
    }
  } catch {
    // no subagents directory
  }

  return {};
}

function extractLastAssistantMessage(transcriptPath: string): string | undefined {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    // Read last entries to find the most recent assistant text
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          const textBlocks = entry.message.content
            .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
            .map((b: { text: string }) => b.text);
          if (textBlocks.length > 0) {
            const full = textBlocks.join('\n');
            return full.length > 3500 ? full.slice(-3500) : full;
          }
        }
      } catch {
        // skip
      }
    }
  } catch {
    // transcript not readable
  }
  return undefined;
}

async function handleSessionStart(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);

  const vscodePort = process.env.CLAUDE_PAGER_VSCODE_PORT
    ? parseInt(process.env.CLAUDE_PAGER_VSCODE_PORT, 10)
    : undefined;

  const info: SessionInfo = {
    sessionId: data.session_id,
    pid: process.ppid,
    tty: process.env.TTY || '',
    cwd: data.cwd || process.cwd(),
    windowId: getActiveWindowId(),
    tmuxPane: process.env.TMUX_PANE || undefined,
    vscodePort: vscodePort || undefined,
    timestamp: Date.now(),
  };

  ensureDataDir();
  registerSession(info);

  // Register with VS Code extension for terminal mapping
  if (vscodePort) {
    try {
      await fetch(`http://127.0.0.1:${vscodePort}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: data.session_id, pid: process.ppid }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // Extension not reachable — session still works without injection
    }
  }
}

async function handleNotification(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);

  // Only forward permission_prompt and idle_prompt
  const type = data.notification_type;
  if (type !== 'permission_prompt' && type !== 'idle_prompt') {
    return;
  }

  let enriched = data;
  if (data.transcript_path) {
    if (type === 'permission_prompt') {
      // Enrich with tool name and input
      const ctx = extractToolContext(data.transcript_path);
      if (ctx.toolName) {
        enriched = { ...data, tool_name: ctx.toolName, tool_input: ctx.toolInput, context: ctx.context };
      }
    } else if (type === 'idle_prompt') {
      // Enrich with last assistant message for context
      const lastMsg = extractLastAssistantMessage(data.transcript_path);
      if (lastMsg) {
        enriched = { ...data, message: lastMsg };
      }
    }
  }

  // Forward to daemon
  const port = process.env.CLAUDE_PAGER_PORT || '17380';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error(`[hook] daemon responded ${res.status}`);
    }
  } catch (err) {
    console.error('[hook] daemon unreachable:', err);
  }
}

const command = process.argv[2];

switch (command) {
  case 'session-start':
    handleSessionStart().catch(err => {
      console.error('[hook] session-start error:', err);
      process.exit(1);
    });
    break;
  case 'notification':
    handleNotification().catch(err => {
      console.error('[hook] notification error:', err);
      process.exit(1);
    });
    break;
  default:
    console.error(`Usage: claude-pager-hook <session-start|notification>`);
    process.exit(1);
}
