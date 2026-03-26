import { execFileSync } from 'node:child_process';

export interface GitInfo {
  branch: string;
  modifiedFiles: number;
  unpushedCommits: number;
}

const cache = new Map<string, { data: GitInfo; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

function execGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { timeout: 3000 }).toString().trim();
  } catch {
    return '';
  }
}

export function getGitStatus(cwd: string): GitInfo {
  const now = Date.now();
  const cached = cache.get(cwd);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const branch = execGit(cwd, ['branch', '--show-current']) || 'unknown';

  const statusOut = execGit(cwd, ['status', '--porcelain']);
  const modifiedFiles = statusOut ? statusOut.split('\n').filter(Boolean).length : 0;

  let unpushedCommits = 0;
  if (branch !== 'unknown') {
    const logOut = execGit(cwd, ['log', '--oneline', `origin/${branch}..HEAD`]);
    unpushedCommits = logOut ? logOut.split('\n').filter(Boolean).length : 0;
  }

  const data: GitInfo = { branch, modifiedFiles, unpushedCommits };
  cache.set(cwd, { data, timestamp: now });
  return data;
}
