import type { Bindings } from '../core/engine.js';
import { sampleManifest } from './fixtures.js';

const ok = () => 'ok';

export const complete: Bindings<typeof sampleManifest> = {
  actions: { 'status.show': ok, 'jobs.list': ok, 'jobs.mode': ok, 'jobs.add': ok, 'jobs.purge': ok },
  status: { 'jobs.today': () => 1, 'jobs.queue': () => 2 },
};

export const missingAction: Bindings<typeof sampleManifest> = {
  // @ts-expect-error -- jobs.purge has no handler: a button with nothing behind it must not compile
  actions: { 'status.show': ok, 'jobs.list': ok, 'jobs.mode': ok, 'jobs.add': ok },
};

export const unknownAction: Bindings<typeof sampleManifest> = {
  actions: {
    'status.show': ok, 'jobs.list': ok, 'jobs.mode': ok, 'jobs.add': ok, 'jobs.purge': ok,
    // @ts-expect-error -- an action the manifest does not have
    'ghost': ok,
  },
};
