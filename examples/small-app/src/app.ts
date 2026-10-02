/** A small site watcher: nothing to do with coins. State is in memory; no network in this example. */
export interface Site {
  url: string;
  up: boolean | null;
}

export const config = {
  checks: { enabled: true, intervalSec: 60, timeoutMs: 5000 },
  alerts: { onRecover: true },
  notify: { token: 'not-a-real-token' },
};

export const sites: Site[] = [
  { url: 'https://example.com', up: true },
  { url: 'https://example.org', up: false },
];

export function listSites(): string {
  return sites.length ? sites.map((s) => `${s.up === false ? '🔴' : '🟢'} ${s.url}`).join('\n') : 'No sites yet.';
}

export function setChecks(on: boolean): string {
  config.checks.enabled = on;
  return on ? 'Checks on.' : 'Checks off.';
}

export function addSite(url: string): string {
  if (!/^https?:\/\/\S+$/.test(url)) throw new Error(`not a URL: ${url}`);
  sites.push({ url, up: null });
  return `Watching ${url}.`;
}

export function removeAllSites(): string {
  const n = sites.length;
  sites.length = 0;
  return `Removed ${n} sites.`;
}

export function saveConfig(next: Record<string, unknown>): void {
  Object.assign(config, next);
}
