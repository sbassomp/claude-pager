import { execFile } from 'node:child_process';

export interface GitInfo {
  branch: string;
  modifiedFiles: number;
  unpushedCommits: number;
}

const cache = new Map<string, { data: GitInfo; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise(resolve => {
    execFile('git', ['-C', cwd, ...args], { timeout: 3000 }, (err, stdout) => {
      resolve(err ? '' : stdout.trim());
    });
  });
}

export async function getGitStatus(cwd: string): Promise<GitInfo> {
  const now = Date.now();
  const cached = cache.get(cwd);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const [branch, statusOut] = await Promise.all([
    execGit(cwd, ['branch', '--show-current']),
    execGit(cwd, ['status', '--porcelain']),
  ]);

  const branchName = branch || 'unknown';
  const modifiedFiles = statusOut ? statusOut.split('\n').filter(Boolean).length : 0;

  let unpushedCommits = 0;
  if (branchName !== 'unknown') {
    const logOut = await execGit(cwd, ['log', '--oneline', `origin/${branchName}..HEAD`]);
    unpushedCommits = logOut ? logOut.split('\n').filter(Boolean).length : 0;
  }

  const data: GitInfo = { branch: branchName, modifiedFiles, unpushedCommits };
  cache.set(cwd, { data, timestamp: now });
  return data;
}
