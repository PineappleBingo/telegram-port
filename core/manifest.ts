import { z } from 'zod';
import type { Messages } from './text.js';

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).max(48);
const TextKey = z.string().min(1);

const ArgSchema = z.object({ kind: z.enum(['enum', 'text', 'number']), prompt: TextKey.optional() });

const ActionSchema = z.object({
  id: Id,
  label: TextKey,
  risk: z.enum(['read', 'write', 'danger']),
  command: z.string().regex(/^[a-z0-9_]{1,32}$/).optional(),
  arg: ArgSchema.optional(),
  confirmPhrase: z.string().min(1).optional(),
});

const MenuItemSchema = z.union([
  z.object({ action: Id, args: z.array(z.string().min(1)).optional() }).strict(),
  z.object({ menu: Id }).strict(),
]);

const MenuSchema = z.object({ id: Id, title: TextKey, items: z.array(MenuItemSchema) });

const FieldSchema = z.object({
  id: Id,
  path: z.string().min(1),
  category: Id,
  label: TextKey,
  kind: z.enum(['boolean', 'enum', 'int', 'float']),
  options: z.array(z.string().min(1)).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  ratio: z.boolean().optional(),
  apply: z.enum(['live', 'restart']),
});

const SettingsSchema = z.object({
  categories: z.array(z.object({ id: Id, title: TextKey })),
  fields: z.array(FieldSchema),
  excluded: z.array(z.string()).default([]),
});

export const ManifestSchema = z.object({
  version: z.literal(1),
  manifestRev: z.number().int().min(0),
  language: z.string().min(2),
  owner: z.object({ env: z.string().min(1) }),
  menus: z.array(MenuSchema).min(1),
  actions: z.array(ActionSchema),
  settings: SettingsSchema.optional(),
  alerts: z.array(z.object({ id: Id, template: TextKey, mutable: z.boolean().default(true) })).default([]),
  status: z.object({ title: TextKey.optional(), fields: z.array(Id).min(1) }).optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ActionSpec = Manifest['actions'][number];
export type MenuSpec = Manifest['menus'][number];
export type SettingsSpec = NonNullable<Manifest['settings']>;
export type SettingField = SettingsSpec['fields'][number];

/** Paths that must never become chat-editable, whatever a manifest says. */
export const DEFAULT_SECRET_PATTERNS: readonly string[] = [
  '*token*', '*secret*', '*password*', '*apikey*', '*api_key*', 'apikeys.*', '*privatekey*',
];
/** Menus the engine draws itself; a manifest only links to them. */
export const RESERVED_MENUS = ['settings', 'status'] as const;

export class ManifestError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid telegram manifest:\n- ${problems.join('\n- ')}`);
    this.name = 'ManifestError';
  }
}

const globToRegex = (glob: string): RegExp =>
  new RegExp(`^${glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');

/** Shape check, then everything the shape cannot say: references, duplicates, secrets, missing texts. */
export function validateManifest(raw: unknown, messages: Messages): Manifest {
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ManifestError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const m = parsed.data;
  const problems: string[] = [];
  const dup = (what: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${what}: ${id}`);
      seen.add(id);
    }
  };
  dup('menu id', m.menus.map((x) => x.id));
  dup('action id', m.actions.map((x) => x.id));
  dup('command', m.actions.flatMap((a) => (a.command ? [a.command] : [])));
  dup('alert id', m.alerts.map((x) => x.id));
  dup('setting id', m.settings?.fields.map((x) => x.id) ?? []);
  dup('category id', m.settings?.categories.map((x) => x.id) ?? []);

  for (const menu of m.menus) {
    if ((RESERVED_MENUS as readonly string[]).includes(menu.id)) problems.push(`reserved menu id: ${menu.id}`);
  }
  if (!m.menus.some((x) => x.id === 'main')) problems.push('a menu with id "main" is required');

  const menuIds = new Set(m.menus.map((x) => x.id));
  if (m.settings) menuIds.add('settings');
  if (m.status) menuIds.add('status');
  const actions = new Map(m.actions.map((a) => [a.id, a]));
  const onMenu = new Set<string>();
  for (const menu of m.menus) {
    for (const item of menu.items) {
      if ('menu' in item) {
        if (!menuIds.has(item.menu)) problems.push(`menu ${menu.id}: unknown menu ${item.menu}`);
        continue;
      }
      const a = actions.get(item.action);
      if (!a) {
        problems.push(`menu ${menu.id}: unknown action ${item.action}`);
        continue;
      }
      onMenu.add(a.id);
      if (a.arg?.kind === 'enum' && !item.args?.length) problems.push(`menu ${menu.id}: enum action ${a.id} needs args`);
      if (item.args && a.arg?.kind !== 'enum') problems.push(`menu ${menu.id}: args given for non-enum action ${a.id}`);
    }
  }
  for (const a of m.actions) {
    if (!onMenu.has(a.id) && !a.command) problems.push(`action ${a.id} is on no menu and has no command`);
    if (a.risk === 'danger' && !a.confirmPhrase) problems.push(`danger action ${a.id} needs confirmPhrase`);
  }

  if (m.settings) {
    const cats = new Set(m.settings.categories.map((c) => c.id));
    const secret = [...DEFAULT_SECRET_PATTERNS, ...m.settings.excluded].map(globToRegex);
    for (const f of m.settings.fields) {
      if (!cats.has(f.category)) problems.push(`setting ${f.id}: unknown category ${f.category}`);
      if (f.kind === 'enum' && !f.options?.length) problems.push(`setting ${f.id}: enum needs options`);
      if (secret.some((r) => r.test(f.path))) {
        problems.push(`setting ${f.id}: path ${f.path} looks secret and cannot be edited from chat`);
      }
    }
  }

  const keys = [
    ...m.menus.map((x) => x.title),
    ...m.actions.flatMap((a) => [a.label, ...(a.arg?.prompt ? [a.arg.prompt] : [])]),
    ...(m.settings?.categories.map((c) => c.title) ?? []),
    ...(m.settings?.fields.map((f) => f.label) ?? []),
    ...m.alerts.map((a) => a.template),
    ...(m.status ? [...(m.status.title ? [m.status.title] : []), ...m.status.fields.map((f) => `status.${f}`)] : []),
  ];
  for (const key of new Set(keys)) {
    if (!(key in messages)) problems.push(`missing text: ${key}`);
  }

  if (problems.length > 0) throw new ManifestError(problems);
  return m;
}

/** The part of a manifest (imported `as const`) the binding types read. */
export interface ManifestLike {
  readonly actions: readonly { readonly id: string }[];
  readonly status?: { readonly fields: readonly string[] };
  readonly alerts?: readonly { readonly id: string }[];
}
export type ActionId<M extends ManifestLike> = M['actions'][number]['id'];
export type StatusField<M extends ManifestLike> =
  NonNullable<M['status']> extends { readonly fields: readonly (infer F extends string)[] } ? F : never;
export type AlertId<M extends ManifestLike> =
  NonNullable<M['alerts']> extends readonly { readonly id: infer A extends string }[] ? A : never;
