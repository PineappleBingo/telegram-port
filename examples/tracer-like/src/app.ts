/** A stand-in for Solana-Tracer: calls, watched wallets and a credit budget. In memory, no network. */
export interface Call {
  token: string;
  verdict: 'hit' | 'miss' | null;
}

export const config = {
  calls: { mode: 'record', forensics: { enabled: true } },
  radar: { sampleRate: { hit: 0.5, miss: 0.35 } },
  helius: { dailyCredits: 100000, forensicShare: 0.3 },
  scoring: { threshold: 60 },
  apiKeys: { helius: 'not-a-real-key' },
};

export const calls: Call[] = [
  { token: 'BONK', verdict: 'hit' },
  { token: 'WIF', verdict: null },
];
export const wallets = new Set<string>(['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU']);
export const budget = { used: 1234 };

export function summary(): string {
  return `콜 ${calls.length}건 · 지갑 ${wallets.size}개 · 크레딧 ${budget.used}/${config.helius.dailyCredits}`;
}

export function listCalls(): string {
  return calls.map((c) => `${c.token}: ${c.verdict ?? '판정 전'}`).join('\n');
}

export function setCallMode(mode: string): string {
  config.calls.mode = mode;
  return `콜 모드: ${mode}`;
}

export function listWallets(): string {
  return wallets.size ? [...wallets].join('\n') : '추적 중인 지갑이 없습니다.';
}

export function watchWallet(address: string): string {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error(`not a Solana address: ${address}`);
  wallets.add(address);
  return `추적 시작: ${address}`;
}

export function unwatchWallet(address: string): string {
  return wallets.delete(address) ? `추적 해제: ${address}` : `추적 중이 아닙니다: ${address}`;
}

export function saveConfig(next: Record<string, unknown>): void {
  Object.assign(config, next);
}
