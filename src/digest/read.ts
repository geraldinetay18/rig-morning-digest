import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Digest, DigestCounts, DigestRow, RunStatus } from './types.js';

const statuses = new Set<RunStatus>(['ok', 'retry', 'fail']);

type Run = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

function parseRun(line: string): Run | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const run = value as Record<string, unknown>;
  if (
    typeof run.at !== 'string' ||
    typeof run.job !== 'string' ||
    !statuses.has(run.status as RunStatus) ||
    (run.owner !== undefined && run.owner !== null && typeof run.owner !== 'string') ||
    (run.error !== undefined && typeof run.error !== 'string')
  ) return null;
  return {
    at: run.at,
    job: run.job,
    status: run.status as RunStatus,
    owner: (run.owner as string | null | undefined) ?? null,
    ...(typeof run.error === 'string' ? { error: run.error } : {}),
  };
}

// Returns null only when this night's file is missing. Malformed records are counted and skipped.
export function readNight(runsDir: string, night: string): Digest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const jobs = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const run = parseRun(line);
    if (!run) {
      badLines++;
      continue;
    }
    const row = jobs.get(run.job);
    if (!row) {
      jobs.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.runs++;
    if (run.status === 'retry') row.retries++;
    row.lastStatus = run.status;
    row.owner = run.owner;
    row.lastAt = run.at;
    if (run.error !== undefined) row.lastError = run.error;
  }
  return { rows: [...jobs.values()].sort((a, b) => a.job.localeCompare(b.job)), badLines };
}

export function countStatuses(rows: DigestRow[]): DigestCounts {
  const counts: DigestCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus]++;
  return counts;
}
