#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { registerSession } from '../sessions/tracker.js';
import { ensureDataDir } from '../config/index.js';
import { logHook } from '../utils/log.js';
import type { SessionInfo } from '../types.js';

const PRE_TOOL_DIR = join(homedir(), '.claude-pager', 'pre-tool-use');
const PRE_TOOL_TTL_MS = 60_000; // discard captures older than 60s when reading

interface PreToolCapture {
  toolName: string;
  toolInput?: string;
  context?: string;
  timestamp: number;
}

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

function formatToolInput(input: unknown): string | undefined {
  const i = input as { command?: string; old_string?: unknown; new_string?: unknown; file_path?: string; content?: unknown };
  if (i?.command) return String(i.command);
  if (i?.old_string != null && i?.new_string != null) {
    const file = i.file_path || '';
    const old = String(i.old_string).slice(0, 1000);
    const nw = String(i.new_string).slice(0, 1000);
    return `${file}\n--- old\n${old}\n+++ new\n${nw}`;
  }
  if (i?.file_path && i?.content) return `${i.file_path}\n${String(i.content).slice(0, 150)}`;
  if (i?.file_path) return i.file_path;
  if (typeof input === 'object' && input !== null) return JSON.stringify(input).slice(0, 2000);
  return undefined;
}

function findToolUseInFile(filePath: string, maxLines: number): ToolUseInfo | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const windowStart = Math.max(0, lines.length - maxLines);

    // Collect tool_use_ids that already have a corresponding tool_result —
    // those tool_uses are completed and must NOT be reported as the pending one.
    // Otherwise, when Claude fires the Notification hook before writing the new
    // tool_use to the transcript, we would enrich the prompt with the previously
    // executed tool's data.
    const completed = new Set<string>();
    for (let i = windowStart; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              completed.add(block.tool_use_id);
            }
          }
        }
      } catch {
        // skip
      }
    }

    for (let i = lines.length - 1; i >= windowStart; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') {
              if (block.id && completed.has(block.id)) continue;
              const toolInput = formatToolInput(block.input);
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
  logHook('session-start', info.sessionId, 'registered');

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

function preToolFile(sessionId: string): string {
  return join(PRE_TOOL_DIR, `${sessionId}.json`);
}

function readPreToolCapture(sessionId: string): PreToolCapture | null {
  try {
    const file = preToolFile(sessionId);
    if (!existsSync(file)) return null;
    const data = JSON.parse(readFileSync(file, 'utf-8')) as PreToolCapture;
    if (Date.now() - data.timestamp > PRE_TOOL_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function clearPreToolCapture(sessionId: string): void {
  try {
    const file = preToolFile(sessionId);
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // ignore
  }
}

async function handlePreToolUse(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);
  const sessionId = data.session_id;
  const toolName = data.tool_name;
  if (!sessionId || !toolName) return;

  try {
    mkdirSync(PRE_TOOL_DIR, { recursive: true });
    const capture: PreToolCapture = {
      toolName,
      toolInput: formatToolInput(data.tool_input),
      timestamp: Date.now(),
    };
    writeFileSync(preToolFile(sessionId), JSON.stringify(capture));
    logHook('pre-tool-use', sessionId, `captured:${toolName}`);
  } catch (err) {
    logHook('pre-tool-use', sessionId, `error:${(err as Error).message?.slice(0, 60) || 'write-failed'}`);
  }
}

async function handleNotification(): Promise<void> {
  const input = await readStdin();
  const data = JSON.parse(input);

  // Only forward permission_prompt and idle_prompt
  const type = data.notification_type;
  const sid = data.session_id || '-';
  if (type !== 'permission_prompt' && type !== 'idle_prompt') {
    logHook('notification', sid, `skipped:type=${type}`);
    return;
  }

  let enriched = data;
  if (type === 'permission_prompt') {
    // Prefer the PreToolUse capture (carries the actual pending tool's data)
    // over the transcript scan (which may lag behind when Claude has not yet
    // written the new tool_use to the transcript).
    const captured = readPreToolCapture(sid);
    if (captured) {
      enriched = { ...data, tool_name: captured.toolName, tool_input: captured.toolInput };
      clearPreToolCapture(sid);
    } else if (data.transcript_path) {
      const ctx = extractToolContext(data.transcript_path);
      if (ctx.toolName) {
        enriched = { ...data, tool_name: ctx.toolName, tool_input: ctx.toolInput, context: ctx.context };
      }
    }
  } else if (type === 'idle_prompt' && data.transcript_path) {
    const lastMsg = extractLastAssistantMessage(data.transcript_path);
    if (lastMsg) {
      enriched = { ...data, message: lastMsg };
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
      logHook('notification', sid, `error:status=${res.status}`);
    } else {
      logHook('notification', sid, `sent:${type}`);
    }
  } catch (err) {
    console.error('[hook] daemon unreachable:', err);
    const msg = (err as Error).message || 'fetch-failed';
    logHook('notification', sid, `error:${msg.replace(/\s+/g, '_').slice(0, 80)}`);
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
  case 'pre-tool-use':
    handlePreToolUse().catch(err => {
      console.error('[hook] pre-tool-use error:', err);
      process.exit(1);
    });
    break;
  default:
    console.error(`Usage: claude-pager-hook <session-start|notification|pre-tool-use>`);
    process.exit(1);
}
