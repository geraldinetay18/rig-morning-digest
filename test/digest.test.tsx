import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const tempDirs: string[] = [];
function makeRunsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const configFor = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

describe('readNight', () => {
  it('aggregates jobs, retains a null owner, and counts malformed lines', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.badLines).toBe(1);
    const render = digest?.rows.find((row) => row.job === 'digest/render');
    expect(render).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
  });

  it('returns null for a missing night and rejects path-like names', () => {
    expect(readNight('/no/such/runs', '2026-10-28')).toBeNull();
    expect(readNight('/no/such/runs', '../secret')).toBeNull();
  });
});

describe('digest routes', () => {
  it('renders sorted rows, highlights retries and failures, and handles malformed lines', async () => {
    const runsDir = makeRunsDir();
    const lines = [
      JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'zeta', status: 'fail', owner: 'ops', error: 'disk full' }),
      JSON.stringify({ at: '2026-10-28T00:00:00+01:00', job: 'alpha', status: 'retry', owner: null }),
      JSON.stringify({ at: '2026-10-28T00:01:00+01:00', job: 'alpha', status: 'retry', owner: null }),
      JSON.stringify({ at: '2026-10-28T00:02:00+01:00', job: 'alpha', status: 'retry', owner: null }),
      'not json',
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), lines.join('\n'));

    const app = createApp(configFor(runsDir));
    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('malformed lines: 1');
    expect(html).toContain('—');
    expect(html).toContain('disk full');
    expect(html).toContain('class="warn"');

    const api = await app.request('/api/digest/2026-10-28');
    const json = await api.json() as { rows: Array<{ job: string }> };
    expect(api.status).toBe(200);
    expect(json.rows.map((row) => row.job)).toEqual(['alpha', 'zeta']);
  });

  it('returns 404 for a missing file and renders an empty night', async () => {
    const runsDir = makeRunsDir();
    const app = createApp(configFor(runsDir));
    expect((await app.request('/digest/2026-10-27')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-27')).status).toBe(404);

    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
    const empty = await app.request('/digest/2026-10-27');
    expect(empty.status).toBe(200);
    expect(await empty.text()).toContain('nothing ran');
  });

  it('links every night on the status board with its status counts', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), JSON.stringify({ at: '2026-10-28T00:00:00+01:00', job: 'backup', status: 'fail', owner: null }));
    mkdirSync(runsDir, { recursive: true });
    const html = await (await createApp(configFor(runsDir)).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 0 · retry 0 · fail 1');
  });
});
