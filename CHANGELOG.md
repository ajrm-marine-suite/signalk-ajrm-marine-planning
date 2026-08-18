# Changelog

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
