---
name: telegram-port
description: Use when the user wants to add, port or update a Telegram bot for a Node/TypeScript project - reads the project's docs, config and code, drafts menus, commands, a settings editor, alerts and a status screen, confirms them with the user, and installs a bot whose every button is wired to the project's own functions and checked by typecheck and a press-every-button simulator.
---

# telegram-port

Install a Telegram bot into the Node/TypeScript project in the current directory. The bot is
described by a manifest (data) and run by a bundled engine; you write only the wiring.

`<skill>` below is this skill's base directory (shown when the skill loads). Run tools with
`node <skill>/tools/port.mjs <command> --target <project root>`; each prints one JSON line.

## Ground rules

- Write project code only in steps 3 and 4: the files under `src/telegram/`, the wiring test,
  `.env.example`, `package.json` dependencies, and one start line the user approved.
- Never put a secret into settings and never lower a `danger` action without the user's explicit yes.
  `references/safety.md` has the rules.
- Never overwrite a file the project already has. The install tool keeps existing files; do the same by hand.
- Record progress in `.telegram-port/state.json` (`{ "step": N, "manifestRev": R }`) after each step,
  so an interrupted run can resume. Keep evidence for the draft in `.telegram-port/extract.md`.

## Steps

### 0. Check

- No `package.json` or `tsconfig.json`: tell the user this version supports Node/TypeScript only, and stop.
- `src/telegram/core/VERSION` exists: this is a re-run. Go to step 6.

### 1. Extract

Follow `references/extract.md`. Read the README and docs, the config schema or example, exported
functions and CLI commands, any existing bot commands, event and log points (alert candidates) and
counters (status candidates). Draft the manifest in the format of `references/manifest.md`, with
every item's evidence (`file:line`) in `.telegram-port/extract.md`.

### 2. Confirm the draft

Show the user, briefly: the menu tree, every `danger` action, the config paths left out as secrets,
and the items you were unsure about. Ask only about the unsure ones, at most four questions at a time,
as choices. When the project has a dashboard or many user-facing features, propose what to port
with a decision report (`references/report-format.md`) instead, and continue from what the user
saved there. When they approve, write `src/telegram/telegram.manifest.json`.

### 3. Install

1. Check how the project tests. The wiring test needs vitest or jest, in a folder the project's
   tsconfig and test runner both include. Pass `--tests <folder>` when that is not `tests`, and
   `--dir` if the bot should not live in `src/telegram`. The tool picks the runner (jest when only
   jest is installed, else vitest) and the module style (ES modules or CommonJS) from `package.json`
   and `tsconfig.json`; override with `--runner` or `--module` when it guesses wrong. With no test
   runner at all, ask the user before adding vitest.
2. Run `install`. It copies the engine (`core/`), writes `manifest.gen.ts`, the messages file,
   `handlers.ts`, `configAdapter.ts`, `index.ts` and the wiring test, and reports what it wrote and
   what it kept. It refuses an existing `core/` folder it did not install: never delete that folder
   to get past it; ask the user where the bot should go instead.
3. Add the dependencies the engine needs: `grammy` and `zod` (use the project's package manager).
4. Add `TELEGRAM_BOT_TOKEN=` and the owner variable from the manifest (default `TELEGRAM_CHAT_ID=`)
   to `.env.example`. Never write real values. Add `.telegram-port/` to `.gitignore`.
5. Find where the app starts. Show the user a diff that adds `await startBot();` there (or
   `void startBot();` when the start code is not async), imported from `src/telegram/index.js`,
   and apply it only after they approve.
6. Replace the key-only texts in `messages.<lang>.ts` with real ones in the manifest's language,
   keeping the file JSON-shaped.

### 4. Wire and verify

Follow `references/wiring.md`.

1. Fill `handlers.ts`: one function per action and status field. The typecheck errors on that file
   are the list of what is still unwired.
2. Point `configAdapter.ts` at the project's config (`read` and `write`).
3. Run the project's typecheck and tests. The wiring test checks that the generated module matches
   the JSON, that every handler, text and setting is wired, that every setting path exists, and that
   the simulator can press every button without a failure.
4. Do not move on until all of it passes. If a failure is a judgement call (a handler that needs
   network to read, a setting the config does not have), ask the user.

### 5. Preview and wrap up

1. Run `preview` and give the user the path of `.telegram-port/preview.html`. It shows the whole bot
   without a token.
2. Explain how to get a token from @BotFather, how to find their own user id (for example by
   messaging @userinfobot), and where to put both. The owner must be a person's id: commands are
   accepted only from that person.
3. Summarize: actions wired, the `danger` actions, the settings left out, anything left to do.

### 6. Re-run

1. Extract again and show the user what changed against the existing manifest: added, removed and
   changed menus, actions and settings. Apply only what they approve, and raise `manifestRev` by one.
2. Run `install`. It replaces `core/` only when the bundled engine is newer (tell the user what
   changed), keeps every project file, and regenerates `manifest.gen.ts`.
3. In `handlers.ts`, add functions for new actions and turn removed ones into comments marked
   `// telegram-port: removed from the manifest`. Never rewrite a function a person wrote.
4. Add texts for new keys to the messages file. Then verify as in step 4.

## Tools

| Command | Does |
|---|---|
| `install` | engine + project layer, never overwriting; `--tests`, `--dir`, `--runner vitest\|jest`, `--module esm\|cjs`; `--force-core` replaces a same-version engine (never a newer one) |
| `gen` | rewrites `manifest.gen.ts` from the JSON (after any manifest edit) |
| `preview` | writes `.telegram-port/preview.html` (`--out` to change) |

Files: `tools/port.mjs`, `tools/lib/install.mjs`, `tools/lib/gen.mjs`, `tools/preview/preview.mjs`,
templates in `templates/handlers.ts`, `templates/configAdapter.ts`, `templates/index.ts`,
`templates/telegram.wiring.test.ts`, the engine in `core/index.ts`.

## References

- `references/extract.md`: where to look and how to turn a project into a draft
- `references/manifest.md`: the manifest format and its rules
- `references/wiring.md`: handlers, config adapter, messages, start line, re-run rules
- `references/safety.md`: risk levels, secrets, what needs the user's yes
- `references/report-format.md`: the decision report for choosing which dashboard features to port
