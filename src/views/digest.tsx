import type { Digest } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: Digest }) {
  return (
    <>
      <h1>morning digest · {night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th>
              <th>last status</th><th>last error</th><th>first time</th><th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const marked = row.retries >= 3 || row.lastStatus === 'fail';
              return (
                <tr class={marked ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 && <p class="mute">malformed lines: {digest.badLines}</p>}
    </>
  );
}
