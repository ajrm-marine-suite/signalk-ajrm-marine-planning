# AJRM Marine Planning

Version `0.5.24` calculates all 24 completed source-reviewed named-channel
gates through Tidal Database's explicit operational-with-assumptions profiles.
The UI labels their times, directions and rates as estimates, displays the
assumptions alongside original cautions, hazards and uncertainty, and tells the
skipper to take every result with a pinch of salt. Unfinished legacy-only
placeholders remain selectable for inspection but are not made operational.

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

These are planning aids, not navigation or anchoring authorities. All gate
times, directions and stream rates are estimates and must be taken with a pinch
of salt. Forecasts, tidal predictions, stream models, seabed descriptions and
vessel assumptions can be incomplete, wrong or shifted by weather and local
effects. Cross-check current official sources and observed conditions. For
anchoring, separately check high-water loading/scope and low-water clearance.
The skipper remains responsible for every decision.

The Gate Passage **Tidal Gate Data** tab now provides an **Edit all fields**
action for every gate. Its editor exposes the complete Location and Tidal
Database JSON records without flattening nested turns, sources, cautions,
hazards or uncertainty. Each owner record is saved separately with revision
conflict protection and an immediate read-back comparison. Enter a reviewer
name and choose **Mark reviewed** to save a structured review timestamp; review
does not make estimated data definitive or alter readiness by itself.

Planning contains no writable location catalogue, provider credentials or
private tide/weather cache. Correct spatial records in Location Editor,
prediction/correction records in Tidal Database and provider settings in Weather Database, then reload Planning.

## Tidal-gate v2 calculation boundary

Gate Passage uses Tidal Database's joined v2 catalogue. Location Editor remains
the owner of stable gate IDs, names and geometry; Tidal Database owns timing,
rate, provenance, review and readiness. Planning exposes no gate mutation API.

Strict evidence-backed operational calculation requires:

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

Completed source reviews can also carry Tidal Database's separate
`operational-with-assumptions` profile. Planning accepts its approximate model
inputs only within that profile, retains the original source review and
blocking uncertainty for inspection, and returns the profile warning and
assumption list with every schedule. This is an estimated planning model, not
an assertion that the underlying publication supplied definitive values.

Existing v1 definitions are preserved and visible as `needs-review`; none is
silently promoted to operational v2. A saved display-name selection is migrated
only when it has one exact Location Editor match. Ambiguous or missing names stay
unselected until the user chooses a stable ID.
