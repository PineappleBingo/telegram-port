# telegram-port

Port a Telegram bot into any Node/TypeScript project. A manifest describes the menus, commands, settings, alerts and status screen; the engine in `core/` draws them and calls the project's own functions.

This repository is being built in two steps. Step 1 (this state) is the engine in `core/`. Step 2 adds the `/telegram-port` skill that writes the manifest and the wiring for a project.

## Engine at a glance

```ts
import { startTelegram, type Bindings } from './telegram/core/index.js';
import { manifest } from './telegram/manifest.gen.js';

const bindings: Bindings<typeof manifest> = {
  actions: { 'jobs.list': async () => listJobs() /* … one per action, or it will not compile */ },
  status: { 'jobs.today': () => countToday() },
};

await startTelegram({
  token: process.env.TELEGRAM_BOT_TOKEN,
  ownerChatId: process.env.TELEGRAM_CHAT_ID,
  manifest,
  messages,
  ...bindings,
  config: { get: (path) => readConfig(path), set: (path, value) => writeConfig(path, value) },
});
```

- Risk levels are enforced by the engine: `read` runs, `write` asks for a tap, `danger` asks for a typed phrase and is audited.
- Buttons are addressed by id and manifest revision, never by position.
- Settings whose path looks secret are refused.
- `simulate(engine)` taps every reachable button without changing state.

## Development

```bash
npm install
npm run typecheck
npm test
```
