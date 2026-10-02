import type { Translate } from './text.js';

/** One status value, read when the screen opens. */
export type StatusFn = () => Promise<string | number | null> | string | number | null;

/** A field that fails shows "—": one broken counter must not hide the rest of the screen. */
export async function renderStatus(
  title: string,
  fields: readonly string[],
  fns: Readonly<Record<string, StatusFn>>,
  t: Translate,
  onError: (field: string, err: unknown) => void,
): Promise<string> {
  const lines = await Promise.all(
    fields.map(async (field) => {
      try {
        const fn = fns[field];
        const value = fn ? await fn() : null;
        return `${t(`status.${field}`)}: ${value ?? '—'}`;
      } catch (err) {
        onError(field, err);
        return `${t(`status.${field}`)}: —`;
      }
    }),
  );
  return [title, ...lines].join('\n');
}
