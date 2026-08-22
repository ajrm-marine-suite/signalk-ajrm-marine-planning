# Changelog

## 0.5.23 — 2026-08-22

- Calculate all 17 completed source-reviewed tidal gates through Tidal
  Database's explicit operational-with-assumptions profiles, including Dorus
  Mòr, while leaving unfinished legacy placeholders fail-closed.
- Accept the separately identified approximate model-input rates only on those
  profiles; preserve and display the source review, assumptions, cautions,
  hazards and blocking uncertainty rather than presenting estimates as facts.
- Label the UI and calculation basis as estimated, add the “take it with a
  pinch of salt” warning, and retain the general skipper-responsibility safety
  notice throughout the planner.

## 0.5.22 — 2026-08-22

- Keep every exact Location-backed tidal gate selectable in Gate Passage,
  including reference-only and legacy records.
- Persist reference-only gate selections and expose their sourced turn labels,
  cautions, hazards and uncertainty without promoting them to operational
  calculations.
- Retain the native-v2 calculation boundary: provider refresh and passage
  calculations still require an effectively operational gate.

## 0.5.21 — 2026-08-22

- Pin the Segment 7B Sound of Luing and Dorus Mòr Location/Tidal producer
  projections in a standalone Planning contract fixture.
- Prove both candidates retain their exact reference-only blocker lists, remain
  outside Planning's effective operational set and are rejected before any
  tide-service call.

## 0.5.20 — 2026-08-22

- Consume the versioned tidal-gate v2 catalogue through stable Location IDs and
  require Tidal Database's effective operational readiness allow-list.
- Honour explicit HW/LW references, independently named turn directions,
  unambiguous slack windows and exact turn-specific phase-peak observations.
- Fail closed for legacy, incomplete, unreviewed, unknown, bounded or
  out-of-range data; remove copied regimes, zero/slack coercion, minimum-rate
  substitution and repeated/final fallback phases.
- Preserve raw and migrated v1 records as visible display-only compatibility
  data and migrate saved names only on one exact match.
- Keep gate mutation in Tidal Database and add focused backend, calculator and
  integration tests for the boundary.

## 0.5.19 — 2026-08-22

- Carry Tidal Database capability and caution metadata into Anchor Force.
- Preserve genuine events from incomplete stations so the shared curve renderer
  can explicitly refuse a misleading complete curve.

## 0.5.18 — 2026-08-21

- Refresh the published shared-service readiness contract when Locations,
  Tidal Database, or Weather Database starts after Marine Planning.
- Retain only the user-selected tide display mode in planner state; station,
  provider, cache and prediction details always come from Tidal Database.

## 0.5.17 — 2026-08-21

- Consume the standalone Weather Database service and expose its provider provenance and explicit selection policy to Gate Passage.
- Remove the final dependency on Location Editor's retired weather service.

## 0.5.16

- Consume prediction ports, corrections, gate constants and cached events from AJRM Marine Tidal Database.
- Keep Location Editor as the read-only source of spatial geometry only.

## 0.5.15 - 2026-08-19

- Package the Marine Planning icon at both the npm root for App Store metadata
  and the public webapp root for the installed Webapps catalogue.

## 0.5.14 - 2026-08-19

- Serve the Marine Planning Webapps icon from the public webapp URL and add a
  regression test for Signal K icon discovery.

## 0.5.13 - 2026-08-19

- Add a suite-style Marine Planning icon and package-root 120-pixel PNG for the
  Signal K Webapps page.

## 0.5.12 - 2026-08-18

- Unwrap Signal K full-model leaves before copying live wind, current, depth,
  speed and position values into Anchor Force.
- Read tidal-current speed from the standard `environment.current.drift` path,
  with `environment.tide.drift` as a compatibility fallback.
- Restore nearest-secondary-port selection when own-vessel position is exposed
  as a full-model Signal K leaf.

## 0.5.11 - 2026-08-18

- Replace Anchor Force's separate 24-hour SVG with the same versioned tide
  curve used by Display.
- Add a remembered 1–7 day graph range, zero-metre Chart Datum baseline,
  labelled extremes, station reference levels and interactive time/height
  hover readout.
- Preserve the selected local or UTC time basis when formatting the shared
  curve.

## 0.5.10 - 2026-08-18

- Fix Anchor Force startup after the manual HW/LW controls were removed, so it
  now loads the standard and secondary tidal-port catalogue from Location
  Editor.
- Add a regression check requiring every browser default input to have a
  corresponding control in the Anchor Force page.

## 0.5.9 - 2026-08-18

- Consume only Location Editor's current v4 secondary-port and v1 tidal-gate
  contracts, using Location UUIDs as stable planner selections.
- Restore the Anchor Force tidal-port list, including standard ports whose
  provider details are incomplete so the shared resolver can explain the error.
- Request a tidal gate's linked standard port explicitly instead of allowing
  position-based automatic selection to substitute a different port.
- Remove dead gate editing code, duplicate provider-account controls,
  hard-coded port defaults and obsolete standalone-service instructions.
- Report Location Editor service failures in Anchor Force instead of showing an
  unexplained empty selector.

## 0.5.8 - 2026-08-18

- Accept the paired 12-hour `ajrm-secondary-port-corrections-v3` records from
  Location Editor while retaining bounded read-only v2 compatibility.

## 0.5.7 - 2026-08-18

- Remove manual reference-port HW/LW entry and browser-side secondary-port
  correction from Anchor Force; Location Editor's resolved events are the sole
  tide input.
- Persist a manually selected standard or secondary port and clear the previous
  station's figures immediately when the choice changes or cannot resolve.
- Add one-click selection of the nearest usable secondary port inside the
  vessel's containing tidal region.

## 0.5.6 - 2026-08-18

- Request the specifically selected standard or secondary location from the
  shared Tide Resolver.
- Consume centrally corrected secondary-port events without applying the
  correction a second time in Anchor Force.
- Read the flexible v2 HW/LW correction-point contract and follow a
  secondary-port's parent chain to its underlying UKHO standard station.

## 0.5.5 - 2026-08-18

- Remove Gate Passage's duplicated browser defaults, writable constants API,
  private constants file and editing controls; gate data now comes read-only
  from versioned Location Editor records.
- Let Anchor Force select standard ports as well as secondary ports and request
  the corresponding UKHO station rather than assuming one hard-coded port.
- Remove port-specific wording and state keys from planner screens and retain a
  bounded migration for saved state from the former names.

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
