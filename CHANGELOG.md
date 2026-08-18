# Changelog

## 0.5.1 - 2026-08-18

- Expose a read-only in-process diagnostics snapshot containing planner
  readiness, Gate Passage settings and location constants, Anchor Force state,
  and the current live Signal K inputs.
- Remove provider credentials, account identity and duplicated tide events
  from this diagnostic projection; Snapshot obtains the authoritative fetched
  tide and weather series from Location Editor.

## 0.5.0 - 2026-08-18

- Consolidate Gate Passage Planner and Anchor Force Planner into one Signal K
  plugin with two views.
- Consume Location Editor's shared, provenance-aware location, UKHO tide and
  Open-Meteo weather services instead of keeping duplicate provider caches.
- Use Location Editor geometry as the authoritative gate position while
  retaining editable stream timing/rate constants in Planning.
- Remove stored provider credentials and historical forecast/tide payloads from
  planner defaults.
- Expose current Signal K wind, depth, speed and current values for assisted
  planner input while retaining explicit manual overrides.
- Preserve strong passage and anchoring safety warnings.
