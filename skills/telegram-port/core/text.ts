/** Texts by key. Project texts win over the engine's own (core.*) texts. */
export type Messages = Readonly<Record<string, string>>;

export type Translate = ((key: string, vars?: Record<string, string | number>) => string) & {
  has(key: string): boolean;
};

export function makeT(project: Messages, core: Messages): Translate {
  const lookup = (key: string): string | undefined => project[key] ?? core[key];
  const t = ((key: string, vars?: Record<string, string | number>) => {
    // A missing key shows the key itself: visible in chat, and the manifest check catches it before that.
    const template = lookup(key) ?? key;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      vars && name in vars ? String(vars[name]) : whole,
    );
  }) as Translate;
  t.has = (key: string) => lookup(key) !== undefined;
  return t;
}

export const TELEGRAM_TEXT_LIMIT = 4096;

/** Telegram refuses longer texts; cut at line breaks so tables and lists stay readable. */
export function splitMessage(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = rest.lastIndexOf('\n', limit);
    if (cut > 0) {
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut + 1);
    } else {
      parts.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
  }
  parts.push(rest);
  return parts;
}

/** Short code shown to the user instead of the error itself; the log carries the details under it. */
export function errorCode(now: () => number = Date.now): string {
  const time = now().toString(36).slice(-4);
  const noise = Math.floor(Math.random() * 36 * 36).toString(36).padStart(2, '0');
  return `${time}${noise}`.toUpperCase().padStart(6, '0');
}
