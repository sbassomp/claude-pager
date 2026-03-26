import { execFileSync } from 'node:child_process';
import type { CIConfig } from '../types.js';

export interface PipelineStatus {
  status: 'running' | 'success' | 'failed' | 'pending' | 'canceled' | 'unknown';
  url?: string;
  duration?: number;
  updatedAt?: number;
  ref?: string;
}

export interface BranchPipelines {
  main?: PipelineStatus;
  staging?: PipelineStatus;
}

interface CIProvider {
  name: string;
  getPipelines(repoUrl: string, branches: string[]): Promise<BranchPipelines>;
}

// Cache: repoUrl → { data, timestamp }
const cache = new Map<string, { data: BranchPipelines; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

function getRemoteUrl(cwd: string): string | null {
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { timeout: 3000 }).toString().trim();
    return url || null;
  } catch {
    return null;
  }
}

// --- GitLab Provider ---

function extractGitLabProjectPath(remoteUrl: string, serverUrl: string): string | null {
  // Normalize: strip protocol, credentials, and .git suffix
  // https://oauth2:token@git.example.com/group/project.git → git.example.com/group/project
  // https://git.example.com/group/project.git → git.example.com/group/project
  // git@git.example.com:group/project.git → git.example.com/group/project
  const host = new URL(serverUrl).host;
  const escaped = host.replace(/\./g, '\\.');

  // Match host in URL, capture everything after it
  const match = remoteUrl.match(new RegExp(`${escaped}[/:](.+?)(?:\\.git)?$`));
  if (match) return match[1];

  return null;
}

// Cache project path → numeric ID to avoid repeated lookups
const projectIdCache = new Map<string, number>();

async function resolveGitLabProjectId(
  config: NonNullable<CIConfig['gitlab']>,
  projectPath: string,
): Promise<number | null> {
  const cached = projectIdCache.get(projectPath);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${config.url}/api/v4/projects?search=${encodeURIComponent(projectPath.split('/').pop() || '')}`,
      {
        headers: { 'PRIVATE-TOKEN': config.token },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;

    const projects = await res.json() as Array<{ id: number; path_with_namespace: string }>;
    const match = projects.find(p => p.path_with_namespace === projectPath);
    if (match) {
      projectIdCache.set(projectPath, match.id);
      return match.id;
    }
  } catch {
    // skip
  }
  return null;
}

async function gitlabGetPipelines(
  config: NonNullable<CIConfig['gitlab']>,
  repoUrl: string,
  branches: string[],
): Promise<BranchPipelines> {
  const projectPath = extractGitLabProjectPath(repoUrl, config.url);
  if (!projectPath) return {};

  const projectId = await resolveGitLabProjectId(config, projectPath);
  if (!projectId) return {};

  const result: BranchPipelines = {};

  for (const branch of branches) {
    try {
      const apiUrl = `${config.url}/api/v4/projects/${projectId}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1`;
      const res = await fetch(apiUrl, {
        headers: { 'PRIVATE-TOKEN': config.token },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const pipelines = await res.json() as Array<{
        id: number;
        status: string;
        ref: string;
        web_url: string;
        duration: number | null;
        updated_at: string;
      }>;

      if (pipelines.length > 0) {
        const p = pipelines[0];
        const status = mapGitLabStatus(p.status);
        const key = branch === 'main' || branch === 'master' ? 'main' : 'staging';
        result[key as keyof BranchPipelines] = {
          status,
          url: p.web_url,
          duration: p.duration || undefined,
          updatedAt: new Date(p.updated_at).getTime(),
          ref: p.ref,
        };
      }
    } catch {
      // skip this branch
    }
  }

  return result;
}

function mapGitLabStatus(status: string): PipelineStatus['status'] {
  switch (status) {
    case 'success': return 'success';
    case 'failed': return 'failed';
    case 'running': case 'pending': return 'running';
    case 'canceled': return 'canceled';
    case 'created': case 'waiting_for_resource': case 'preparing': return 'pending';
    default: return 'unknown';
  }
}

// --- GitHub Provider ---

async function githubGetPipelines(
  config: NonNullable<CIConfig['github']>,
  repoUrl: string,
  branches: string[],
): Promise<BranchPipelines> {
  // Extract owner/repo from URL
  const match = repoUrl.match(/github\.com[/:](.+?)(?:\.git)?$/);
  if (!match) return {};

  const repo = match[1];
  const result: BranchPipelines = {};

  for (const branch of branches) {
    try {
      const apiUrl = `https://api.github.com/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`;
      const res = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Accept': 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const data = await res.json() as {
        workflow_runs: Array<{
          status: string;
          conclusion: string | null;
          html_url: string;
          run_started_at: string;
          updated_at: string;
        }>;
      };

      if (data.workflow_runs.length > 0) {
        const run = data.workflow_runs[0];
        const status = mapGitHubStatus(run.status, run.conclusion);
        const key = branch === 'main' || branch === 'master' ? 'main' : 'staging';
        result[key as keyof BranchPipelines] = {
          status,
          url: run.html_url,
          updatedAt: new Date(run.updated_at).getTime(),
          ref: branch,
        };
      }
    } catch {
      // skip
    }
  }

  return result;
}

function mapGitHubStatus(status: string, conclusion: string | null): PipelineStatus['status'] {
  if (status === 'completed') {
    switch (conclusion) {
      case 'success': return 'success';
      case 'failure': return 'failed';
      case 'cancelled': return 'canceled';
      default: return 'unknown';
    }
  }
  if (status === 'in_progress' || status === 'queued') return 'running';
  return 'pending';
}

// --- Public API ---

export function createCIProvider(config: CIConfig): CIProvider | null {
  if (config.type === 'gitlab' && config.gitlab) {
    return {
      name: 'gitlab',
      getPipelines: (repoUrl, branches) => gitlabGetPipelines(config.gitlab!, repoUrl, branches),
    };
  }
  if (config.type === 'github' && config.github) {
    return {
      name: 'github',
      getPipelines: (repoUrl, branches) => githubGetPipelines(config.github!, repoUrl, branches),
    };
  }
  return null;
}

export async function getCIPipelines(
  cwd: string,
  ciConfig?: CIConfig,
): Promise<BranchPipelines> {
  if (!ciConfig) return {};

  const repoUrl = getRemoteUrl(cwd);
  if (!repoUrl) return {};

  // Check cache
  const cached = cache.get(repoUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const provider = createCIProvider(ciConfig);
  if (!provider) return {};

  const branches = ['main', 'master', 'staging'];
  const data = await provider.getPipelines(repoUrl, branches);

  cache.set(repoUrl, { data, timestamp: Date.now() });
  return data;
}
