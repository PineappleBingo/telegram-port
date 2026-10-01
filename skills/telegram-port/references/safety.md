# Safety

## Risk levels are enforced by the engine

`read` runs at once. `write` runs after one tap on a one-time confirm button that expires in five
minutes. `danger` runs only after the user types the exact `confirmPhrase`, and each run is passed to
`onAudit`. A handler cannot skip this. Your job is to pick the level.

- Round up. An action that can lose data, spend money, send something to other people or stop the
  app is `danger`, whatever its name.
- Show every `danger` action in step 2.
- Lowering an action from `danger` (or from `write` to `read`) needs the user's explicit yes, in
  their words, for that action.

## Secrets never reach the chat

The settings editor shows current values, so a secret in settings would be printed into Telegram
history. The engine refuses setting paths that match `*token*`, `*secret*`, `*password*`, `*key*`,
`*mnemonic*`, `*seed*`, `*passphrase*`, `*credential*`, `*pass`, `*pwd*` (any case), plus the
manifest's `settings.excluded` patterns.

- Leave secrets out of the draft entirely, and list what you left out in step 2.
- Add the project's own secret paths to `excluded` when their names do not match the patterns
  (for example `wallet.words`).
- A false positive (`monkey.count` matching `*key*`) only means that setting is not offered in chat.
  Mention it; do not rename the project's config to get around it.
- Never print token values. Write only variable names to `.env.example`.

## Owner

Commands are accepted only from the person whose id is in the owner variable. A group's id
(negative) receives alerts but nobody can run commands; tell the user to use their own id.

## Needs the user's yes

- the start line in the app
- lowering a risk level
- putting a path that looks secret into settings (refuse; there is no override)
- a handler that needs network or writes during the simulator run
