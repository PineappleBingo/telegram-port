# Deferred

Minor findings from the plan 1 final review (2026-10-01, Opus high). None blocks use; pick them up with plan 2 or when they bite.

- Settings screen: `config.get` throwing gives no reply. Wrap `SettingsUi` calls with `onError`.
- A failed `editMessageText` (message deleted) drops the reply. Fall back to `sendMessage`.
- Settings taps do not cancel a pending action or danger input.
- `CallbackCodec.hashed` grows without bound for long typed setting values. Cap it.
- A `confirmPhrase` with surrounding spaces can never be typed. Trim or reject it in the schema.
- A 429 retry wait blocks all updates in grammY's in-order polling. Cap the wait.
