# telegram-port

A Claude Code plugin that installs a Telegram bot into a Node/TypeScript project. It reads the
project's docs, config and code, drafts the bot with you, and wires every button to the project's
own functions.

- **Menus and commands** for each feature, with risk levels the engine enforces: `read` runs,
  `write` asks for a tap, `danger` asks for a typed phrase and is audited.
- **A settings editor** with range checks. Paths that look secret are refused.
- **Alerts** the app sends with one call, and **a status screen**.
- **Checked**: a missing handler is a type error, and a wiring test presses every button.
- **A preview** of the whole bot as one HTML page, before you have a token.

## Install

```
/plugin marketplace add PineappleBingo/telegram-port
/plugin install telegram-port@telegram-port
```

Or copy `skills/telegram-port/` into `~/.claude/skills/`: the folder works on its own.

## Use

In the project's root, run `/telegram-port`. It will:

1. read the project and draft the menus, actions, settings, alerts and status fields;
2. show you the draft (every dangerous action and every secret it left out) and ask about what is unclear;
3. install the engine and the wiring under `src/telegram/` and a wiring test;
4. wire the handlers until typecheck and the wiring test pass;
5. write a preview and tell you how to get a token.

Run it again after the project changes: it shows the difference, keeps your edits, and upgrades the
engine only when the plugin's is newer.

## What it adds to a project

```
src/telegram/
├─ core/                     the engine (do not edit; replaced on upgrade)
├─ telegram.manifest.json    menus, commands, settings, alerts, status
├─ manifest.gen.ts           generated from the JSON
├─ handlers.ts               action id → your function
├─ configAdapter.ts          where settings are read and saved
├─ messages.<lang>.ts        texts
└─ index.ts                  startBot() · sendAlert() · stopBot()
tests/telegram.wiring.test.ts
```

## Examples

- `examples/small-app`: a site watcher, nothing to do with coins.
- `examples/tracer-like`: grouped commands, many settings, alerts.

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
