# The manifest

`src/telegram/telegram.manifest.json` defines the whole bot. The engine validates it at start and
will not start the bot when it is wrong; the wiring test reports the same problems.

```json
{
  "version": 1,
  "manifestRev": 1,
  "language": "en",
  "owner": { "env": "TELEGRAM_CHAT_ID" },
  "menus": [
    { "id": "main", "title": "main.title", "items": [{ "action": "sites.list" }, { "menu": "sites" }, { "menu": "settings" }, { "menu": "status" }] },
    { "id": "sites", "title": "sites.title", "items": [{ "action": "checks.mode", "args": ["on", "off"] }, { "action": "sites.clear" }] }
  ],
  "actions": [
    { "id": "sites.list", "label": "sites.list", "risk": "read", "command": "sites" },
    { "id": "checks.mode", "label": "checks.mode", "risk": "write", "arg": { "kind": "enum" } },
    { "id": "sites.clear", "label": "sites.clear", "risk": "danger", "command": "clear", "confirmPhrase": "CLEAR" }
  ],
  "settings": {
    "categories": [{ "id": "checks", "title": "settings.checks" }],
    "fields": [{ "id": "checks.timeout", "path": "checks.timeoutMs", "category": "checks", "label": "set.timeout", "kind": "int", "min": 500, "max": 30000, "apply": "live" }],
    "excluded": ["notify.*"]
  },
  "alerts": [{ "id": "site.down", "template": "alert.down", "mutable": false }],
  "status": { "fields": ["sites.total"] }
}
```

## Rules

- **Texts are keys.** `title`, `label`, `prompt`, `template` name a key in `messages.<lang>.ts`.
  Every key must exist there. A status field `x` needs the key `status.x`. An enum value `v` of an
  action labelled `k` may have its own button text under `k.v`.
- **Ids are identities.** Buttons carry ids, not positions, so menus can be reordered safely. Ids use
  letters, digits, `.`, `_`, `-`. Never reuse an id for a different meaning; make a new one.
- **`main` is required.** `settings` and `status` are built in: link them from a menu, never define them.
- **Every action is reachable**: on a menu, or with a `command`.
- **`risk` is required**: `read` runs at once, `write` asks for one tap, `danger` asks for the typed
  `confirmPhrase` and is audited. `danger` without a phrase is invalid.
- **Arguments**: `enum` values come from the menu item's `args`; `text` and `number` wait 5 minutes
  for the user's reply, then expire.
- **Settings**: `kind` is `boolean`, `enum` (with `options`), `int` or `float`. `ratio: true` shows and
  takes percentages but stores fractions; `min`/`max` are then fractions too. `apply: "restart"`
  tells the user the change needs a restart. Paths that look secret are refused (see `references/safety.md`).
- **Alerts**: `mutable: false` for alerts that must get through even while the user paused alerts.
- **`manifestRev`**: raise it by one whenever you change the manifest. Buttons from another
  revision answer "the menu has changed" instead of doing something stale.
- After every edit, run `gen` so `manifest.gen.ts` matches; the wiring test fails until it does.
