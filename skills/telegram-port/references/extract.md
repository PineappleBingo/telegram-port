# Extract: from a project to a draft manifest

Goal: a draft the user can approve in one pass. Prefer leaving a feature out to guessing it wrong;
the user can add it in step 2.

## Where to look

| What | Where | Becomes |
|---|---|---|
| What the app does, in its own words | README, `docs/` | menu titles and grouping |
| Settings | config schema (zod, JSON Schema, TS type), `config.example.*`, `.env.example` | `settings.fields` |
| Things it can do | exported functions, CLI commands (`bin`, `commander`, `yargs`), HTTP routes | `actions` |
| Existing bot commands | any `bot.command(...)`, slash-command tables | `actions` with `command` |
| Things worth telling the user | log lines at warn/error, events, state changes (`emit`, notifications) | `alerts` |
| Numbers worth a glance | counters, queue sizes, budgets, last-run times | `status.fields` |

## Turning it into a draft

- **Menus**: one per feature area the README names. `main` holds the most used read action, the
  feature menus, then `settings` and `status` (both built in; link them, do not define them).
- **Actions**: one per user-level operation, not per function. Ids are `area.verb` (`calls.list`).
  Commands are short lowercase words, only for the actions people will type.
- **Risk**: decide from names and docs, and round up.
  - `danger`: delete, remove, clear, purge, reset, send, transfer, withdraw, trade, buy, sell,
    deploy, drop, shutdown. Pick a `confirmPhrase` in capitals (`REMOVE`).
  - `write`: set, update, toggle, enable, disable, add, start, stop, pause.
  - `read`: list, show, get, status, search.
- **Arguments**: a fixed set of values becomes `enum` (the menu item lists them); free text becomes
  `text` or `number` with a `prompt`.
- **Settings**: numbers, booleans and fixed choices a person would tune. Give each a real `min`/`max`
  from the schema or docs; a fraction shown as a percentage gets `ratio: true`. `apply: "restart"`
  unless the code reads the value each time.
- **Leave out**: secrets (see `references/safety.md`), paths, URLs of other services, anything
  structural (arrays of objects).

## Evidence

For every menu, action, setting, alert and status field, add a line to `.telegram-port/extract.md`:
`- calls.list — src/calls/list.ts:12 listCalls(), README "Calls" section`. Show these to the user
when they ask why something is there.
