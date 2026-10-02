# Wiring

## handlers.ts

```ts
export const actions: B['actions'] = {
  'sites.list': () => listSites(),                   // read: return the reply text
  'checks.mode': (mode) => setChecks(mode === 'on'), // enum: one of the menu's args
  'sites.add': (url) => addSite(url ?? ''),          // text: what the user typed
  'sites.clear': () => removeAllSites(),             // danger: runs only after the typed phrase
};
export const status: NonNullable<B['status']> = {
  'sites.total': () => sites.length,                 // null shows "—"
};
```

- A handler gets `(arg, { chatId })` and returns a string (the reply), nothing ("done"), or throws.
  A throw shows the user only an error code; the details go to the log. Do not catch errors to turn
  them into friendly text that hides a failure.
- Call the project's existing functions. Do not reimplement logic in the handler.
- Do not ask for confirmation inside a handler: the engine already did, by the action's `risk`.
- Read handlers run in the simulator during tests, so they must be safe to call: no writes, and no
  network unless the project's tests already allow it. If a read needs network, ask the user whether
  to mock it in the wiring test.
- Status functions run every time the status screen opens. Keep them cheap.

## configAdapter.ts

Point `source.read` at the project's live config object and `source.write` at whatever saves it,
and applies it if the app reads config once at start (the `apply` field tells the user which is which).
`set` writes a changed copy, so a failed save leaves the running config untouched. The wiring test
checks every setting path exists in what `read` returns.

## messages.<lang>.ts

Real texts in the manifest's language. Keep the object JSON-shaped (double quotes, no trailing
commas) so the preview can read it. Use `{name}` placeholders for alert variables.

## index.ts and the start line

`index.ts` exports `startBot(log?, onAudit?)`, `sendAlert(id, vars)` and `stopBot()`. Add
`await startBot();` where the app starts (after config is loaded; `void startBot();` in start code
that is not async), shown to the user as a diff first.
Pass the app's logger if it has one. Call `sendAlert('site.down', { url })` where the event happens;
it never throws and returns false when the bot is off.

## Re-run rules

- Never overwrite `handlers.ts`, `configAdapter.ts`, `messages.<lang>.ts`, `index.ts` or the wiring test.
- New action: add its function. Removed action: turn its function into a comment marked
  `// telegram-port: removed from the manifest`, so the person decides.
- Changed action (same id, new meaning): ask the user; prefer a new id.
- After any manifest edit: run `gen`, then typecheck and tests.
