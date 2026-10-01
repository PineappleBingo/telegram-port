import type { ConfigAdapter } from './core/index.js';
import { config, saveConfig } from '../app.js';

type Tree = Record<string, unknown>;

/**
 * Where the settings live. Point `read` at the project's current config object and
 * `write` at whatever saves it (and applies it, for settings marked "live").
 */
const source: { read(): Tree; write(next: Tree): void | Promise<void> } = {
  read: () => config,
  write: (next) => saveConfig(next),
};

const at = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node !== null && typeof node === 'object' ? (node as Tree)[key] : undefined), tree);

export const configAdapter: ConfigAdapter = {
  get: (path) => at(source.read(), path),
  async set(path, value) {
    // Write a changed copy, so a failed save leaves the running config as it was.
    const next = structuredClone(source.read());
    const keys = path.split('.');
    const last = keys.pop() as string;
    const parent = keys.length > 0 ? at(next, keys.join('.')) : next;
    if (parent === null || typeof parent !== 'object' || !(last in parent)) throw new Error(`telegram-port: no config key ${path}`);
    (parent as Tree)[last] = value;
    await source.write(next);
  },
};
