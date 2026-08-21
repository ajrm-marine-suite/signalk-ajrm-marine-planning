# AJRM Marine Planning

Version `0.5.16` consumes prediction ports, secondary corrections, tidal-gate constants and cached events from the standalone AJRM Marine Tidal Database. Location Editor remains the spatial source for gate geometry; Planning no longer reads tidal calculations or provider details from Location records.

Version `0.5.15` packages the icon at both Signal K consumer locations: the App
Store package root and installed webapp public URL.

Version `0.5.11` uses Display's shared tide-curve renderer in Anchor Force and
remains aligned with Location Editor's current contracts. Anchor
Force lists every standard port and every v4 secondary port, while Location
Editor remains responsible for selection resolution, correction interpolation,
provider access and caching. Gate Passage reads only v1 tidal-gate records and
explicitly requests each gate's linked standard port.

AJRM Marine Planning is one Signal K plugin with two related views:

- **Gate Passage** combines a forecast, UKHO tidal events and shared read-only
  tidal-stream constants to compare candidate transit hours.
- **Anchor Force** checks depth, clearance, scope, wind/current load, catenary,
  rode composition and anchor holding assumptions.

The plugin deliberately does not own another weather feed, tide subscription or
location database. Enable **AJRM Marine Location Editor** and configure **AJRM Marine Tidal Database** first;
Planning consumes `app.ajrmMarineLocations`, `app.ajrmMarineTidalDatabase` and
`app.ajrmMarineWeather` contracts. Configure the UKHO subscription key and its
caching tier in Tidal Database. Discovery-tier UKHO data is not persisted.

Open **AJRM Marine Planning** from the Signal K webapps list and switch between
the two planners using the buttons in the header. Boat/calculation settings and
the selected Anchor Force tidal port persist in Planning's Signal K data
directory. Port/gate position and geometry are edited in Location Editor;
provider mappings, secondary-port corrections and tidal-gate constants are
edited in Tidal Database.

The read-only `app.ajrmMarinePlanningDiagnostics` contract lets AJRM Marine
Snapshot retain planner readiness, Gate Passage settings/constants, Anchor
Force state and the live Signal K inputs used for manual population. It omits
provider keys, account identity and duplicate tide events; fetched tide data
comes from Tidal Database diagnostics, while weather temporarily comes from
Location Editor pending the planned standalone Weather app.

## Safety

These are planning aids, not navigation or anchoring authorities. Forecasts,
tidal predictions, stream models, seabed descriptions and vessel assumptions
can be incomplete or wrong. Cross-check current official sources and observed
conditions. For anchoring, separately check high-water loading/scope and
low-water clearance. The skipper remains responsible for every decision.

Planning contains no writable location catalogue, provider credentials or
private tide/weather cache. Correct spatial records in Location Editor and
prediction/correction records in Tidal Database, then reload Planning.
