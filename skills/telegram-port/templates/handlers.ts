import type { Bindings } from './core/index.js';
import type { manifest } from './manifest.gen.js';

type B = Bindings<typeof manifest>;

/**
 * One function per action id in telegram.manifest.json; a missing one is a type error.
 * Return a string to reply with it, nothing for "done", or throw: the user then sees
 * only an error code and the details go to the log. The engine has already asked for
 * any confirmation the action's risk needs before calling these.
 */
export const actions: B['actions'] = {
};

/** One function per status field; null shows "—". Keep them cheap: they run each time the screen opens. */
export const status: NonNullable<B['status']> = {
};
