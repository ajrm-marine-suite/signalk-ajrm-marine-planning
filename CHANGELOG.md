# Changelog

## 0.5.4 - 2026-08-18

- Consume Oban-linked secondary-port correction records from Location Editor.
- Remove Planning's duplicate Secondary Ports editor and bundled correction
  table; submitted state can no longer overwrite the authoritative locations.
- Retain stable selection IDs through the Location Editor migration adapter.
- Keep corrections for non-Oban standard ports out of the current Oban-based
  calculator rather than silently applying them to the wrong prediction.

## 0.5.3 - 2026-08-18

- Require shared Tide Resolver events to contain an explicit UTC or numeric
  timezone before exposing them to Gate Passage or Anchor Force.
- Normalize accepted instants to canonical UTC, preventing either planner from
  reinterpreting an unqualified timestamp in a local timezone.

## 0.5.2 - 2026-08-18

- Resolve Location Editor's shared location, tide and weather services through
  their process-wide registries as well as the local plugin wrapper.
- Fix the persistent “Shared weather/tide service is unavailable” error in
  Signal K, where each plugin receives a different `app` wrapper.

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
