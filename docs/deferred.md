# Deferred

- `install` does not validate the manifest (plan 2 review, minor 5). The tools are stdlib-only `.mjs`
  and cannot load the TypeScript engine's validator; the wiring test reports the same problems on
  the first run. Revisit if the engine ever ships a compiled JS build.
