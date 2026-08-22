# AJRM Marine Planning

Version `0.5.21` pins cross-contract regression fixtures for the Segment 7B
Sound of Luing and Dorus Mòr candidates from Location Editor `0.6.49` and Tidal
Database `0.1.18`. Both remain reference-only: Planning preserves their exact
blocker lists, excludes them from its effective operational set and rejects
gate-tide calculation before calling the shared tide service.

Version `0.5.20` consumes the fail-closed `ajrm-tidal-gate-constants-v2`
contract from AJRM Marine Tidal Database `0.1.9` or later. Gate Passage now
selects gates by stable Location ID, honours an explicit HW or LW reference,
keeps independently named turn directions, and calculates only records present
in Tidal Database's effective operational allow-list.

Version `0.5.19` carries Tidal Database capability and caution metadata into Anchor Force. Direct provider preference is consistent with Display, and incomplete stations cannot generate a misleading complete curve.

Version `0.5.18` keeps its published readiness synchronized when the three standalone suite databases start after Planning. Weather Database may refresh several providers simultaneously while preserving each source and selecting a primary forecast explicitly.

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

Version `0.5.19` carries Tidal Database capability and caution metadata into Anchor Force. Direct provider preference is therefore consistent with Display, and stations with only one kind of tidal extreme show their real events without generating a complete curve or a current-height estimate.

The plugin deliberately does not own another weather feed, tide subscription or
location database. Enable **AJRM Marine Location Editor**, **AJRM Marine Tidal Database** and **AJRM Marine Weather Database** first;
Planning consumes `app.ajrmMarineLocations`, `app.ajrmMarineTidalDatabase` and
`app.ajrmMarineWeatherDatabase` contracts. Configure the UKHO subscription key and its
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
provider keys, account identity and duplicate forecast data; fetched tide and
weather data come from their respective database diagnostics.

## Safety

These are planning aids, not navigation or anchoring authorities. Forecasts,
tidal predictions, stream models, seabed descriptions and vessel assumptions
can be incomplete or wrong. Cross-check current official sources and observed
conditions. For anchoring, separately check high-water loading/scope and
low-water clearance. The skipper remains responsible for every decision.

Planning contains no writable location catalogue, provider credentials or
private tide/weather cache. Correct spatial records in Location Editor,
prediction/correction records in Tidal Database and provider settings in Weather Database, then reload Planning.

## Tidal-gate v2 calculation boundary

Gate Passage uses Tidal Database's joined v2 catalogue. Location Editor remains
the owner of stable gate IDs, names and geometry; Tidal Database owns timing,
rate, provenance, review and readiness. Planning exposes no gate mutation API.

Operational calculation currently requires:

- a reviewed native v2 record with no blocking caution, hazard or uncertainty;
- a usable reference port and an explicit `HW` or `LW` event;
- known spring and neap offsets and unambiguous slack semantics for each named
  turn;
- true current-towards bearings; and
- exactly one `exact`, gate-local, turn-specific spring and neap phase-peak rate.

The supported model interpolates only inside the declared neap-to-spring
reference range and creates sine phases only between real consecutive turn
instances. It does not clamp, extrapolate, repeat a fallback cycle, invent a
final phase, copy a missing regime, replace missing slack with zero, or impose a
minimum stream rate. Approximate, range, up-to, more-than and named-locality rate
observations remain visible but are display-only in this release.

Existing v1 definitions are preserved and visible as `needs-review`; none is
silently promoted to operational v2. A saved display-name selection is migrated
only when it has one exact Location Editor match. Ambiguous or missing names stay
unselected until the user chooses a stable ID.
