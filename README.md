# AJRM Marine Planning

Version `0.5.4` removes duplicate secondary-port maintenance. Location Editor
now owns the correction records and Anchor Force consumes its Oban-linked
secondary ports read-only. The migrated Planning data remains available under
stable identifiers, while corrections for other standard ports stay in
Location Editor until Planning can request their standard-port predictions.

Version `0.5.3` requires explicit timezone information on tide events received
from the shared Tide Resolver and preserves their normalized UTC instants for
both planners. Gate Passage continues to present UK civil time where labelled,
and Anchor Force retains its selectable UT/local display mode.

AJRM Marine Planning is one Signal K plugin with two related views:

- **Gate Passage** combines a forecast, UKHO tidal events and editable local
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
manual overrides persist in Planning's Signal K data directory. Secondary-port
corrections are edited in Location Editor, not in Planning.

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

The first integrated release carries forward the proven calculator models and
their editable gate constants. Secondary-port constants were subsequently
migrated to versioned Location Editor records. Planning intentionally removes
its standalone provider caches and stored UKHO keys. Do not retire the standalone
apps until both integrated views have been checked aboard or against known
examples.
