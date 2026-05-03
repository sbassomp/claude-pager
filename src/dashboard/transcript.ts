import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface TranscriptInfo {
  title: string;
  state: 'working' | 'waiting_input' | 'idle' | 'unknown';
  lastTimestamp: number;
  gitBranch: string;
  recentCommit: boolean;
  recentPush: boolean;
  lastAssistantText?: string;
}

interface CacheEntry {
  mtime: number;
  info: TranscriptInfo;
}

const cache = new Map<string, CacheEntry>();

function projectDir(cwd: string): string {
  // Claude Code encodes the cwd by replacing / with -, e.g.
  // /home/user/dev/myproject → ~/.claude/projects/-home-user-dev-myproject/
  const encoded = cwd.replace(/\//g, '-');
  return join(homedir(), '.claude', 'projects', encoded);
}

function findTranscriptPath(cwd: string, sessionId: string): string | null {
  const dir = projectDir(cwd);
  const file = join(dir, `${sessionId}.jsonl`);
  return existsSync(file) ? file : null;
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
      .map((b: { text: string }) => b.text)
      .join(' ');
  }
  return '';
}

function extractRecentActivity(lines: string[]): string | null {
  // Scan backwards for recent meaningful activity
  const tailLimit = Math.max(0, lines.length - 50);
  for (let i = lines.length - 1; i >= tailLimit; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      // Last custom-title is the best — Claude updates these
      if (entry.type === 'custom-title' && entry.title) {
        return humanizeSlug(entry.title);
      }

      // Last assistant text gives context about current work
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        // Check for tool_use — shows what Claude is doing
        for (const block of entry.message.content) {
          if (block.type === 'tool_use' && block.name) {
            const input = block.input;
            if (input?.command) {
              return `${block.name}: ${input.command.slice(0, 60)}`;
            }
            if (input?.file_path) {
              const file = input.file_path.split('/').pop() || input.file_path;
              return `${block.name}: ${file}`;
            }
            return block.name;
          }
        }

        // Otherwise, first line of assistant text
        const text = extractTextFromContent(entry.message.content);
        if (text.length > 15) {
          // Take first meaningful lines, up to 300 chars
          const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
          let result = '';
          for (const line of lines) {
            if (result.length + line.length > 300) break;
            result += (result ? '\n' : '') + line.trim();
          }
          if (result) return result;
        }
      }
    } catch {
      // skip
    }
  }
  return null;
}

const COMMIT_PATTERNS = /\b(committed|commité|commit\s+(réussi|ok|done|fait|success)|git commit.*\b[0-9a-f]{7}|commited|\bpoussé.*commit|\[\w+\s+[0-9a-f]{7}\])/i;
const PUSH_PATTERNS = /\b(pushed|poussé|git push.*(done|ok|success|fait)|push.*origin|push.*main|push.*master|→\s*(origin|main|master)|poussé sur)/i;
const COMMIT_TOOL_PATTERNS = /git\s+(commit|add\s+-A.*&&.*commit)/;
const PUSH_TOOL_PATTERNS = /git\s+push/;

function detectCommitPush(lines: string[]): { recentCommit: boolean; recentPush: boolean } {
  let recentCommit = false;
  let recentPush = false;

  const tailLimit = Math.max(0, lines.length - 40);
  for (let i = lines.length - 1; i >= tailLimit; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          // Check tool_use for git commit/push commands
          if (block.type === 'tool_use' && block.input?.command) {
            if (COMMIT_TOOL_PATTERNS.test(block.input.command)) recentCommit = true;
            if (PUSH_TOOL_PATTERNS.test(block.input.command)) recentPush = true;
          }
          // Check text for commit/push confirmations
          if (block.type === 'text' && block.text) {
            if (COMMIT_PATTERNS.test(block.text)) recentCommit = true;
            if (PUSH_PATTERNS.test(block.text)) recentPush = true;
          }
        }
      }
      if (recentCommit && recentPush) break;
    } catch {
      // skip
    }
  }

  return { recentCommit, recentPush };
}

function extractLastAssistantText(lines: string[]): string | undefined {
  // Walk backward across multiple assistant messages, prepending each text
  // block, and stop at the next real user prompt (any user entry whose content
  // is not exclusively tool_result blocks). Mirrors the hook-side enrichment
  // so the dashboard can refresh the idle_prompt content as Claude keeps
  // talking after the notification was originally fired.
  const collected: string[] = [];
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 60); i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        const textBlocks = entry.message.content
          .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
          .map((b: { text: string }) => b.text);
        if (textBlocks.length > 0) {
          collected.unshift(textBlocks.join('\n'));
        }
      } else if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
        const isRealUserPrompt = entry.message.content.some(
          (b: { type: string }) => b.type !== 'tool_result',
        );
        if (isRealUserPrompt) break;
      }
    } catch {
      // skip
    }
  }
  if (collected.length === 0) return undefined;
  const full = collected.join('\n\n');
  return full.length > 3500 ? full.slice(-3500) : full;
}

function parseTranscript(filePath: string): TranscriptInfo {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return { title: 'Empty session', state: 'unknown', lastTimestamp: 0, gitBranch: 'unknown', recentCommit: false, recentPush: false };

  let gitBranch = 'unknown';
  let slug: string | null = null;

  // Forward scan: find slug and git branch
  const headLimit = Math.min(lines.length, 30);
  for (let i = 0; i < headLimit; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      if (!slug && entry.slug) slug = entry.slug;
      if (entry.gitBranch && gitBranch === 'unknown') gitBranch = entry.gitBranch;
      if (slug && gitBranch !== 'unknown') break;
    } catch {
      // skip
    }
  }

  // Title: recent activity first, then fallbacks
  let title = extractRecentActivity(lines);

  if (!title && slug) {
    title = humanizeSlug(slug);
  }
  if (!title) {
    title = 'Untitled session';
  }

  // Backward scan: determine state and last timestamp
  let state: TranscriptInfo['state'] = 'unknown';
  let lastTimestamp = 0;

  const tailLimit = Math.max(0, lines.length - 30);
  for (let i = lines.length - 1; i >= tailLimit; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      if (entry.timestamp && lastTimestamp === 0) {
        lastTimestamp = new Date(entry.timestamp).getTime() || 0;
      }

      if (entry.gitBranch) {
        gitBranch = entry.gitBranch;
      }

      if (state === 'unknown') {
        // Use the entry's own timestamp for age, not a potentially mismatched lastTimestamp
        const entryTs = entry.timestamp ? new Date(entry.timestamp).getTime() || 0 : 0;
        const age = entryTs > 0 ? Date.now() - entryTs : Date.now() - lastTimestamp;

        if (entry.type === 'assistant') {
          // If last assistant message is text (no tool_use), Claude finished and awaits input
          const content = entry.message?.content;
          const hasToolUse = Array.isArray(content) && content.some((b: { type: string }) => b.type === 'tool_use');
          if (hasToolUse) {
            state = age < 60_000 ? 'working' : 'idle';
          } else {
            // Claude spoke last with text only — waiting for user
            state = age < 60_000 ? 'waiting_input' : 'idle';
          }
        } else if (entry.type === 'progress') {
          state = age < 60_000 ? 'working' : 'idle';
        } else if (entry.type === 'user') {
          state = age < 60_000 ? 'working' : 'idle';
        }
      }

      if (lastTimestamp > 0 && state !== 'unknown') break;
    } catch {
      // skip
    }
  }

  const { recentCommit, recentPush } = detectCommitPush(lines);
  const lastAssistantText = extractLastAssistantText(lines);

  return { title, state, lastTimestamp, gitBranch, recentCommit, recentPush, lastAssistantText };
}

export function readTranscriptInfo(sessionId: string, cwd: string): TranscriptInfo {
  const filePath = findTranscriptPath(cwd, sessionId);
  if (!filePath) {
    return { title: 'No transcript', state: 'unknown', lastTimestamp: 0, gitBranch: 'unknown', recentCommit: false, recentPush: false };
  }

  // Check cache
  try {
    const mtime = statSync(filePath).mtimeMs;
    const cached = cache.get(sessionId);
    if (cached && cached.mtime === mtime) {
      return cached.info;
    }

    const info = parseTranscript(filePath);
    cache.set(sessionId, { mtime, info });
    return info;
  } catch {
    return { title: 'Read error', state: 'unknown', lastTimestamp: 0, gitBranch: 'unknown', recentCommit: false, recentPush: false };
  }
}
