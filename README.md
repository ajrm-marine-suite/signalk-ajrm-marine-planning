# AJRM Marine Planning

Version `0.5.5` completes shared tidal-data ownership. Gate Passage now reads
all gate constants and each gate's standard-port relationship from Location
Editor; its former editor and private constants file are removed. Anchor Force
offers one read-only location list containing both standard and secondary
ports, requests predictions for the selected standard station, and applies a
secondary correction only where the selected record requires one.

Version `0.5.3` requires explicit timezone information on tide events received
from the shared Tide Resolver and preserves their normalized UTC instants for
both planners. Gate Passage continues to present UK civil time where labelled,
and Anchor Force retains its selectable UT/local display mode.

AJRM Marine Planning is one Signal K plugin with two related views:

- **Gate Passage** combines a forecast, UKHO tidal events and shared read-only
  tidal-stream constants to compare candidate transit hours.
- **Anchor Force** checks depth, clearance, scope, wind/current load, catenary,
  rode composition and anchor holding assumptions.

The plugin deliberately does not own another weather feed, tide subscription or
location database. Enable and configure **AJRM Marine Location Editor** first;
Planning consumes its `app.ajrmMarineLocations`, `app.ajrmMarineTides` and
`app.ajrmMarineWeather` contracts. Configure the UKHO subscription key and its
caching tier in Location Editor. Discovery-tier UKHO data is not persisted.

Open **AJRM Marine Planning** from the Signal K webapps list and switch between
the two planners using the buttons in the header. Calculation constants and
manual overrides persist in Planning's Signal K data directory. Standard ports,
secondary-port corrections and tidal-gate constants are edited in Location
Editor, not in Planning.

The read-only `app.ajrmMarinePlanningDiagnostics` contract lets AJRM Marine
Snapshot retain planner readiness, Gate Passage settings/constants, Anchor
Force state and the live Signal K inputs used for manual population. It omits
provider keys, account identity and duplicate tide events; fetched tide and
weather series come from Location Editor's diagnostic contract.

## Safety

These are planning aids, not navigation or anchoring authorities. Forecasts,
tidal predictions, stream models, seabed descriptions and vessel assumptions
can be incomplete or wrong. Cross-check current official sources and observed
conditions. For anchoring, separately check high-water loading/scope and
low-water clearance. The skipper remains responsible for every decision.

## Migration

The first integrated release carried forward the proven calculator models.
Secondary-port and tidal-gate constants are now migrated to versioned Location
Editor records. Planning intentionally removes its standalone provider caches,
stored UKHO keys and writable location-constant store.
