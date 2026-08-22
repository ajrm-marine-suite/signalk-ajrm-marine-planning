/**
 * Signal K entry point for the consolidated Gate Passage and Anchor Force
 * planning webapp. Calculation state belongs here; locations, tides and
 * weather are obtained from the suite's shared in-process services.
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const packageJson = require("../package.json");
const defaultGateSettings = require("../defaults/gate-settings.json");
const defaultAnchorState = require("../defaults/anchor-state.json");
const STATUS_PATH = "plugins.ajrmMarinePlanning";
const STATUS_REFRESH_MS = 1000;
const SERVICE_REGISTRIES = Object.freeze({
	ajrmMarineLocations: Symbol.for("mcdonaldajr.ajrmMarineLocations"),
	ajrmMarineTidalDatabase: Symbol.for("mcdonaldajr.ajrmMarineTidalDatabase"),
	ajrmMarineWeatherDatabase: Symbol.for("mcdonaldajr.ajrmMarineWeatherDatabase"),
});
const PLANNING_DIAGNOSTICS_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarinePlanningDiagnostics");
const PLANNING_GATE_CATALOGUE_CONTRACT = "ajrm-marine-planning-gate-catalogue-v2";
const TIDAL_GATE_CATALOGUE_CONTRACT = "ajrm-tidal-gate-catalogue-v2";
const TIDAL_GATE_CONTRACT_V2 = "ajrm-tidal-gate-constants-v2";
const TIDAL_GATE_CONTRACT_V1 = "ajrm-tidal-gate-constants-v1";

function clone(value) { return structuredClone(value); }

/** Return the payload from either a raw value or a Signal K full-model leaf. */
function signalKValue(entry) {
	if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "value")) {
		return entry.value ?? null;
	}
	return entry ?? null;
}

function gateSettings(value = {}, fillDefaults = true) {
	return Object.fromEntries(Object.entries(defaultGateSettings).flatMap(([key, fallback]) => {
		if (Object.prototype.hasOwnProperty.call(value, key)) return [[key, value[key]]];
		return fillDefaults ? [[key, fallback]] : [];
	}));
}

async function readJson(file, fallback) {
	try { return JSON.parse(await fsp.readFile(file, "utf8")); }
	catch (error) { if (error.code === "ENOENT") return clone(fallback); throw error; }
}

async function writeJson(file, value) {
	await fsp.mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	await fsp.rename(temporary, file);
}

function representativePosition(location) {
	const coordinates = location?.feature?.geometry?.coordinates;
	if (location?.feature?.geometry?.type === "Point" && Array.isArray(coordinates)) {
		return { longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) };
	}
	if (location?.feature?.geometry?.type !== "Polygon" || !Array.isArray(coordinates?.[0])) return null;
	const points = coordinates[0];
	if (!points.length) return null;
	return {
		longitude: points.reduce((sum, point) => sum + Number(point[0]), 0) / points.length,
		latitude: points.reduce((sum, point) => sum + Number(point[1]), 0) / points.length,
	};
}

function knownMeasurement(value, { nonNegative = false } = {}) {
	return value?.state === "known"
		&& typeof value.value === "number"
		&& Number.isFinite(value.value)
		&& (!nonNegative || value.value >= 0);
}

function completeSlackValue(value) {
	if (value?.semantics === "none") return true;
	if (value?.semantics === "total-centered-on-turn") {
		return knownMeasurement(value.total, { nonNegative: true });
	}
	if (value?.semantics === "before-and-after-turn") {
		return knownMeasurement(value.before, { nonNegative: true })
			&& knownMeasurement(value.after, { nonNegative: true });
	}
	return false;
}

function completeRateObservation(observation, locationId, allowEstimated = false) {
	if (observation?.kind !== "phase-peak" || observation?.unit !== "kn") return false;
	if (observation?.locality?.scope !== "gate" || observation.locality.locationId !== locationId) return false;
	return (observation.qualifier === "exact" || (allowEstimated && observation.qualifier === "approximate"))
		&& knownMeasurement(observation.reportedValue, { nonNegative: true })
		&& knownMeasurement(observation.lowerBound, { nonNegative: true })
		&& knownMeasurement(observation.upperBound, { nonNegative: true })
		&& observation.reportedValue.value === observation.lowerBound.value
		&& observation.reportedValue.value === observation.upperBound.value;
}

function gateDefinitionReasonCodes({ record, location, referencePort, sourceOperational, duplicate }) {
	const reasons = [];
	if (!record) return ["missing-gate-definition"];
	if (duplicate) reasons.push("duplicate-gate-definition");
	if (!location) reasons.push("missing-location-join");
	if (record.contract !== TIDAL_GATE_CONTRACT_V2) {
		reasons.push(record.contract === TIDAL_GATE_CONTRACT_V1 ? "legacy-v1-display-only" : "unsupported-gate-contract");
		return reasons;
	}
	if (record.contractVersion !== 2) reasons.push("unsupported-gate-contract-version");
	if (record.readiness?.state !== "operational") reasons.push("gate-not-operational");
	if (!sourceOperational) reasons.push("not-in-tidal-database-operational-allow-list");
	if (!record.reference || typeof record.reference.portLocationId !== "string"
		|| !["HW", "LW"].includes(record.reference.event)) {
		reasons.push("invalid-reference-event");
	}
	if (!referencePort) reasons.push("missing-reference-port-join");
	if (record.flowModel?.kind !== "sinusoidal-between-turns-v1"
		|| record.flowModel?.peakTiming !== "midpoint-between-turns"
		|| record.flowModel?.zeroAtTurns !== true) {
		reasons.push("unsupported-flow-model");
	}
	if (record.regimeInterpolation?.kind !== "linear-reference-range-v1"
		|| !["preceding-opposite-event", "following-opposite-event", "mean-adjacent-opposite-events"].includes(record.regimeInterpolation?.rangePairing)
		|| record.regimeInterpolation?.outOfRange !== "unavailable") {
		reasons.push("unsupported-regime-interpolation");
	}

	const turns = Array.isArray(record.turns) ? record.turns : [];
	const turnIds = turns.map((turn) => turn?.id);
	const turnsComplete = turns.length >= 2
		&& turnIds.every((id) => typeof id === "string" && id.trim())
		&& new Set(turnIds).size === turnIds.length
		&& turns.every((turn) => {
			const bearing = turn?.direction?.bearingDegreesTrue;
			return typeof turn.name === "string" && turn.name.trim()
				&& typeof turn.direction?.label === "string" && turn.direction.label.trim()
				&& knownMeasurement(bearing)
				&& bearing.value >= 0 && bearing.value < 360
				&& turn.offsets?.unit === "minutes"
				&& knownMeasurement(turn.offsets.spring)
				&& knownMeasurement(turn.offsets.neap)
				&& turn.slack?.unit === "minutes"
				&& completeSlackValue(turn.slack.spring)
				&& completeSlackValue(turn.slack.neap);
		});
	if (!turnsComplete) reasons.push("incomplete-turn-semantics");

	const observations = Array.isArray(record.rateObservations) ? record.rateObservations : [];
	const ratesComplete = turnsComplete && turns.every((turn) => ["spring", "neap"].every((regime) => {
		const matches = observations.filter((observation) => observation?.turnId === turn.id
			&& observation?.regime === regime
			&& observation?.locality?.scope === "gate"
			&& observation?.locality?.locationId === record.locationId);
		return matches.length === 1 && completeRateObservation(matches[0], record.locationId, record.calculationBasis?.mode === "operational-with-assumptions");
	}));
	if (!ratesComplete) reasons.push("incomplete-phase-peak-rates");
	return [...new Set(reasons)];
}

function cacheShape(result, owner = "Tidal Database") {
	return {
		hit: result?.source?.cache !== "network",
		stale: result?.freshness?.state === "stale",
		expired: result?.freshness?.state === "expired",
		offlineFallback: result?.source?.cache === "fallback",
		fallbackReason: result?.source?.fallbackReason || null,
		fetchedAt: result?.source?.fetchedAt || null,
		refreshAfter: result?.source?.fetchedAt && result?.freshness?.staleAfterSeconds
			? new Date(Date.parse(result.source.fetchedAt) + result.freshness.staleAfterSeconds * 1000).toISOString()
			: null,
		policy: result?.freshness
			? `shared ${owner} service; ${result.freshness.state}`
			: `shared ${owner} service`,
	};
}

function ukhoEvents(result) {
	return (result?.events || []).flatMap((event) => {
		const timestamp = String(event?.at || "").trim();
		// The shared tide contract uses absolute ISO instants. Do not let either
		// planner reinterpret an unqualified wall-clock value in the browser's or
		// Pi's local timezone.
		if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) || Number.isNaN(Date.parse(timestamp))) return [];
		return [{
			EventType: event.type === "high" ? "HighWater" : "LowWater",
			DateTime: new Date(timestamp).toISOString(),
			Height: event.heightM,
			IsApproximateTime: false,
			IsApproximateHeight: false,
			Filtered: false,
		}];
	});
}

function publicAnchorState(state, tideResult, tideConfigured = false) {
	const value = clone(state);
	const selectedPort = value.tidePorts?.find((entry) => entry.id === value.tide?.selectedPortId) || null;
	const resolvedSelectedPort = tideResult?.selectedPort?.id === selectedPort?.locationId;
	value.tideData = {
		...(value.tideData || {}),
		stationName: tideResult?.station?.name || selectedPort?.name || "",
		stationId: tideResult?.station?.id || "",
		ukhoApiKeySet: tideConfigured,
		managedBy: "AJRM Marine Tidal Database",
		resolvedLocationId: tideResult?.selectedPort?.id || null,
		referenceLevels: tideResult?.referenceLevels || null,
		availability: tideResult?.availability || null,
		advisory: tideResult?.advisory || null,
		events: resolvedSelectedPort ? ukhoEvents(tideResult) : [],
		cache: selectedPort ? (tideResult ? cacheShape(tideResult) : value.tideData?.cache || null) : null,
		error: selectedPort
			? (tideResult?.error || (tideResult ? "" : "The shared tide service is unavailable."))
			: "Select a tidal port.",
	};
	return value;
}

module.exports = function ajrmMarinePlanning(app) {
	const plugin = {};
	let running = false;
	let statusTimer = null;
	let lastStatusSignature = "";
	const startedAt = new Date().toISOString();
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-marine-planning");
	const gateSettingsFile = path.join(dataDirectory, "gate-settings.json");
	const anchorStateFile = path.join(dataDirectory, "anchor-state.json");

	plugin.id = "signalk-ajrm-marine-planning";
	plugin.name = "AJRM Marine Planning";
	plugin.description = "Gate-passage and anchor-force planning using shared Signal K locations, tides and weather";
	plugin.schema = { type: "object", properties: {} };

	plugin.start = () => {
		running = true;
		app.ajrmMarinePlanningDiagnostics = Object.freeze({
			contract: "ajrm-marine-planning-diagnostics-v1",
			snapshot: diagnosticSnapshot,
		});
		globalThis[PLANNING_DIAGNOSTICS_REGISTRY] = app.ajrmMarinePlanningDiagnostics;
		app.setPluginStatus?.(`Started v${packageJson.version}`);
		publishStatus(status(), true);
		statusTimer = setInterval(publishStatusIfChanged, STATUS_REFRESH_MS);
		statusTimer.unref?.();
	};

	plugin.stop = () => {
		running = false;
		if (statusTimer) clearInterval(statusTimer);
		statusTimer = null;
		lastStatusSignature = "";
		if (globalThis[PLANNING_DIAGNOSTICS_REGISTRY] === app.ajrmMarinePlanningDiagnostics) {
			delete globalThis[PLANNING_DIAGNOSTICS_REGISTRY];
		}
		delete app.ajrmMarinePlanningDiagnostics;
		publishStatus(null);
		app.setPluginStatus?.("Stopped");
	};

	plugin.registerWithRouter = (router) => {
		router.get("/status", (_req, res) => res.json(status()));
		router.get("/gate/version", (_req, res) => res.json(version("Gate Passage Planner")));
		router.get("/anchor/version", (_req, res) => res.json(version("Anchor Force Planner")));

		router.get("/gate/locations", async (_req, res) => {
			try { res.json(await sharedGateLocations()); }
			catch (error) { res.status(503).json({ error: error.message }); }
		});
		router.get("/gate/location-constants", async (_req, res) => {
			try { res.json(await gateConstants()); }
			catch (error) { res.status(503).json({ error: error.message }); }
		});
		router.get("/gate/settings", async (_req, res) => {
			const loaded = await loadGateSettings({ persistMigration: true });
			res.json({
				...loaded.settings,
				selectionMigration: loaded.selectionMigration,
				ukhoApiKeySet: sharedService("ajrmMarineTidalDatabase")?.configured === true,
				tideManagedBy: "AJRM Marine Tidal Database",
			});
		});
		router.post("/gate/settings", requireWrite(async (req, res) => {
			const loaded = await loadGateSettings();
			const current = loaded.settings;
			const submitted = gateSettings(req.body || {}, false);
			if (Object.prototype.hasOwnProperty.call(submitted, "selectedGateLocationId")) {
				submitted.selectedGateLocationId = String(submitted.selectedGateLocationId || "").trim();
				if (submitted.selectedGateLocationId) {
					const locations = await sharedGateLocations();
					if (!locations.some((location) => location.id === submitted.selectedGateLocationId)) {
						return res.status(400).json({ error: "The selected tidal-gate location ID does not exist in Location Editor." });
					}
				}
			}
			const next = { ...current, ...submitted };
			const retainedLegacySelection = !next.selectedGateLocationId && loaded.unresolvedLegacyName
				? { selectedGate: loaded.unresolvedLegacyName }
				: {};
			await writeJson(gateSettingsFile, { ...next, ...retainedLegacySelection });
			res.json({
				ok: true,
				...defaultGateSettings,
				...next,
				selectionMigration: submitted.selectedGateLocationId ? null : loaded.selectionMigration,
				ukhoApiKeySet: sharedService("ajrmMarineTidalDatabase")?.configured === true,
			});
		}));
		router.get("/gate/weather", async (req, res) => {
			try {
				const weather = requireService("ajrmMarineWeatherDatabase", "weather database");
				const resolved = await gateLocation(req.query);
				if (!resolved.location) return res.status(resolved.statusCode).json({ error: resolved.error });
				const location = resolved.location;
				const position = representativePosition(location);
				if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) {
					return res.status(409).json({ error: `${location.name} has no usable representative position in Location Editor.` });
				}
				const result = req.query?.refresh === "1"
					? await weather.refresh({ contextLocationId: location?.id, position, weatherDays: req.query?.days, marineDays: req.query?.marineDays })
					: await weather.status({ contextLocationId: location?.id, position, weatherDays: req.query?.days, marineDays: req.query?.marineDays });
				if (!result.valid) return res.status(503).json({ error: result.error || "Weather is unavailable." });
				return res.json({
					locationId: location.id, locationName: location.name, gateSelection: resolved.selection,
					latitude: result.position.latitude, longitude: result.position.longitude,
					weatherDays: Number(req.query?.days || 16), marineDays: Number(req.query?.marineDays || 8),
					forecast: result.hourly.forecast, marine: result.hourly.marine, cache: cacheShape(result, "Weather Database"),
					providers: result.sources || [], selection: result.selection || null,
				});
			} catch (error) { return res.status(503).json({ error: error.message }); }
		});
		router.get("/gate/tides", async (req, res) => {
			try {
				const tide = requireService("ajrmMarineTidalDatabase", "tidal database");
				const resolved = await gateLocation(req.query);
				if (!resolved.location) return res.status(resolved.statusCode).json({ error: resolved.error });
				const location = resolved.location;
				const catalogue = await gateConstants();
				const entry = catalogue.gates.find((candidate) => candidate.locationId === location.id);
				if (!entry?.calculationReady) {
					const diagnostic = catalogue.diagnostics.planning.find((candidate) => candidate.locationId === location.id);
					return res.status(409).json({
						error: `${location.name} is not operationally ready for gate-passage calculations.`,
						locationId: location.id,
						reasonCodes: diagnostic?.reasonCodes || ["missing-gate-definition"],
					});
				}
				const reference = entry.record.reference;
				const request = {
					portId: reference.portLocationId,
					contextLocationId: location.id,
					position: representativePosition(location),
					includeEvents: true,
				};
				const result = req.query?.refresh === "1" ? await tide.refresh(request) : await tide.status(request);
				if (!result.valid) return res.status(503).json({ error: result.error || "Tidal data are unavailable." });
				return res.json({
					stationId: result.station?.id, stationName: result.station?.name,
					timeStandard: "UT", locationId: location.id, locationName: location.name,
					gateSelection: resolved.selection,
					reference: { portLocationId: reference.portLocationId, event: reference.event },
					referenceEvent: reference.event,
					events: ukhoEvents(result), cache: cacheShape(result),
				});
			} catch (error) { return res.status(503).json({ error: error.message }); }
		});

		router.get("/anchor/state", async (_req, res) => {
			try {
				const state = await anchorState();
				res.json(publicAnchorState(state, await tideStatus(false, state), sharedService("ajrmMarineTidalDatabase")?.configured === true));
			} catch (error) { res.status(503).json({ error: error.message }); }
		});
		router.put("/anchor/tide-port", requireWrite(async (req, res) => {
			const state = await anchorState();
			const selectedPortId = String(req.body?.selectedPortId || "");
			if (selectedPortId && !state.tidePorts.some((entry) => entry.id === selectedPortId)) {
				return res.status(400).json({ error: "The selected tidal port is not available from Tidal Database." });
			}
			state.tide.selectedPortId = selectedPortId;
			await saveAnchorState(state);
			const saved = await anchorState();
			return res.json(publicAnchorState(saved, await tideStatus(false, saved), sharedService("ajrmMarineTidalDatabase")?.configured === true));
		}));
		router.post("/anchor/tide-port/recommend", requireWrite(async (_req, res) => {
			const position = signalKValue(app.getSelfPath?.("navigation.position"));
			if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) {
				return res.status(409).json({ error: "A current own-vessel position is needed to find a nearby secondary port." });
			}
			const tides = requireService("ajrmMarineTidalDatabase", "tidal database");
			if (typeof tides.recommendSecondary !== "function") {
				return res.status(503).json({ error: "Update AJRM Marine Tidal Database to use regional secondary-port selection." });
			}
			const recommendation = await tides.recommendSecondary({ position });
			if (!recommendation?.port) {
				const region = recommendation?.tidalRegion?.name;
				return res.status(404).json({
					error: region
						? `No usable secondary port is recorded in ${region}.`
						: "The vessel is not inside a configured tidal region.",
				});
			}
			const state = await anchorState();
			const selected = state.tidePorts.find((entry) => entry.locationId === recommendation.port.id);
			if (!selected) return res.status(404).json({ error: "The recommended secondary port is not usable by the planner." });
			state.tide.selectedPortId = selected.id;
			await saveAnchorState(state);
			const saved = await anchorState();
			const value = publicAnchorState(saved, await tideStatus(false, saved), sharedService("ajrmMarineTidalDatabase")?.configured === true);
			value.tideRecommendation = {
				portName: selected.name,
				regionName: recommendation.tidalRegion?.name || "",
				distanceM: recommendation.distanceM,
				reason: recommendation.reason,
			};
			return res.json(value);
		}));
		router.put("/anchor/tide-data/settings", requireWrite(async (req, res) => {
			const state = await anchorState();
			state.tideData = {
				...(state.tideData || {}),
				displayTimeMode: req.body?.displayTimeMode === "local" ? "local" : "ut",
				events: [], cache: null,
			};
			await saveAnchorState(state);
			res.json(publicAnchorState(state, await tideStatus(false, state), sharedService("ajrmMarineTidalDatabase")?.configured === true).tideData);
		}));
		router.post("/anchor/tide-data/refresh", requireWrite(async (req, res) => {
			const state = await anchorState();
			if (req.body?.selectedPortId != null) {
				const selectedPortId = String(req.body.selectedPortId);
				if (selectedPortId && !state.tidePorts.some((entry) => entry.id === selectedPortId)) {
					return res.status(400).json({ error: "The selected tidal port is not available from Tidal Database." });
				}
				state.tide.selectedPortId = selectedPortId;
				await saveAnchorState(state);
			}
			res.json(publicAnchorState(state, await tideStatus(true, state), sharedService("ajrmMarineTidalDatabase")?.configured === true).tideData);
		}));
		router.get("/anchor/live", (_req, res) => res.json(liveInputs()));
	};

	function status() {
		const locations = sharedService("ajrmMarineLocations");
		const tides = sharedService("ajrmMarineTidalDatabase");
		const weather = sharedService("ajrmMarineWeatherDatabase");
		return {
			plugin: plugin.id, version: packageJson.version, enabled: running,
			locationsService: locations?.contract || null,
			tideService: tides?.contract || null,
			weatherService: weather?.contract || null,
			ready: running && Boolean(locations && tides && weather),
			updatedAt: new Date().toISOString(),
		};
	}

	async function diagnosticSnapshot() {
		const savedGateSettings = (await loadGateSettings()).settings;
		const savedAnchorState = await anchorState();
		if (savedAnchorState.tideData) {
			delete savedAnchorState.tideData.events;
		}
		return {
			contract: "ajrm-marine-planning-diagnostics-v1",
			contractVersion: 1,
			capturedAt: new Date().toISOString(),
			status: status(),
			gate: {
				settings: savedGateSettings,
				locationConstants: await gateConstants(),
			},
			anchor: {
				state: savedAnchorState,
				liveInputs: liveInputs(),
			},
		};
	}

	function version(name) {
		return { name, serverVersion: packageJson.version, host: "Signal K", port: null, startedAt };
	}

	function requireService(name, label) {
		const service = sharedService(name);
		if (!service) throw new Error(`Shared ${label} service is unavailable. Enable the corresponding AJRM Marine service.`);
		return service;
	}

	function sharedService(name) {
		return app[name] || globalThis[SERVICE_REGISTRIES[name]] || null;
	}

	async function sharedTideWorkspaceLocations() {
		const locations = await requireService("ajrmMarineLocations", "location").list({ workspace: "tides" });
		return Array.isArray(locations) ? locations : [];
	}

	async function sharedGateLocations() {
		return (await sharedTideWorkspaceLocations())
			.filter((location) => Array.isArray(location.types) && location.types.includes("tidalGate"));
	}

	async function sharedTideLocations() {
		const tides = requireService("ajrmMarineTidalDatabase", "tidal database");
		const ports = tides.listPorts();
		const byId = new Map(ports.map((port) => [port.locationId, port]));
		function root(port, seen = new Set()) {
			if (!port || seen.has(port.locationId)) return null;
			if (port.prediction.mode === "provider") return port;
			if (port.prediction.mode === "corrections") return root(byId.get(port.prediction.parentLocationId), new Set(seen).add(port.locationId));
			return null;
		}
		return ports.filter((port) => port.prediction.mode !== "unavailable").map((port) => {
			const parent = port.prediction.mode === "corrections" ? byId.get(port.prediction.parentLocationId) : port;
			const standard = root(port);
			return {
				id:port.locationId, locationId:port.locationId, name:port.name, kind:port.kind,
				standardPort:parent?.name || standard?.name || port.name,
				standardPortLocationId:standard?.locationId || port.locationId,
				stationId:standard?.prediction?.stationId || null,
				standardReferenceLevels:standard?.referenceLevels || null,
			};
		}).sort((left,right) => left.name.localeCompare(right.name));
	}

	async function loadGateSettings({ persistMigration = false } = {}) {
		const raw = await readJson(gateSettingsFile, {});
		const settings = gateSettings(raw);
		settings.selectedGateLocationId = String(settings.selectedGateLocationId || "").trim();
		const legacyName = typeof raw.selectedGate === "string" ? raw.selectedGate.trim() : "";
		let selectionMigration = null;
		let unresolvedLegacyName = "";

		if (!settings.selectedGateLocationId && legacyName) {
			try {
				const locations = await sharedGateLocations();
				const matches = locations.filter((location) => location.name === legacyName);
				if (matches.length === 1) {
					settings.selectedGateLocationId = matches[0].id;
					selectionMigration = {
						status: "migrated",
						legacyName,
						locationId: matches[0].id,
						message: "The saved tidal-gate name was migrated to its unique exact Location Editor ID.",
					};
					if (persistMigration) await writeJson(gateSettingsFile, settings);
				} else {
					unresolvedLegacyName = legacyName;
					selectionMigration = {
						status: matches.length ? "ambiguous" : "unresolved",
						legacyName,
						message: matches.length
							? "The saved tidal-gate name is not unique; select a gate by Location Editor ID."
							: "The saved tidal-gate name no longer matches a Location Editor gate exactly; select a gate by ID.",
					};
				}
			} catch (error) {
				unresolvedLegacyName = legacyName;
				selectionMigration = {
					status: "deferred",
					legacyName,
					message: `The saved tidal-gate name could not yet be migrated: ${error.message}`,
				};
			}
		}
		return { settings, selectionMigration, unresolvedLegacyName };
	}

	async function gateLocation(query = {}) {
		const locations = await sharedGateLocations();
		const locationId = String(query.locationId || "").trim();
		if (locationId) {
			const location = locations.find((entry) => entry.id === locationId) || null;
			return location
				? { location, selection: { mode: "locationId" } }
				: { location: null, statusCode: 404, error: "The selected tidal-gate location ID was not found in Location Editor." };
		}

		const legacyName = String(query.location || "").trim();
		if (!legacyName) {
			return { location: null, statusCode: 400, error: "A tidal-gate locationId is required." };
		}
		const matches = locations.filter((entry) => entry.name === legacyName);
		if (matches.length === 1) {
			return {
				location: matches[0],
				selection: { mode: "legacy-exact-name", legacyName, locationId: matches[0].id },
			};
		}
		return {
			location: null,
			statusCode: matches.length ? 409 : 404,
			error: matches.length
				? "The legacy tidal-gate name is not unique; use locationId."
				: "The legacy tidal-gate name did not exactly match a Location Editor gate; use locationId.",
		};
	}

	async function sourceGateCatalogue(tidalDatabase) {
		if (typeof tidalDatabase.getGateCatalogue === "function") {
			const catalogue = await tidalDatabase.getGateCatalogue();
			const supported = catalogue?.contract === TIDAL_GATE_CATALOGUE_CONTRACT
				&& catalogue?.contractVersion === 2;
			return {
				mode: "getGateCatalogue",
				contract: catalogue?.contract || null,
				contractVersion: catalogue?.contractVersion || null,
				gates: Array.isArray(catalogue?.gates) ? catalogue.gates : [],
				operationalLocationIds: new Set(supported && Array.isArray(catalogue.operationalLocationIds)
					? catalogue.operationalLocationIds.filter((value) => typeof value === "string")
					: []),
				diagnostics: catalogue?.diagnostics || null,
				supported,
			};
		}
		return {
			mode: "listGates-display-only-fallback",
			contract: null,
			contractVersion: null,
			gates: typeof tidalDatabase.listGates === "function" ? tidalDatabase.listGates() : [],
			operationalLocationIds: new Set(),
			diagnostics: [{ code: "gate-catalogue-api-unavailable", message: "Update Tidal Database for operational v2 gate calculations." }],
			supported: false,
		};
	}

	function gateReferenceLocationId(record) {
		if (record?.contract === TIDAL_GATE_CONTRACT_V2) return String(record.reference?.portLocationId || "").trim();
		if (record?.contract === TIDAL_GATE_CONTRACT_V1) return String(record.standardPortRef || "").split("/").at(-1) || "";
		return "";
	}

	function gateCompatibility(record) {
		if (!record) return null;
		if (record.contract === TIDAL_GATE_CONTRACT_V1) {
			return {
				fromContract: TIDAL_GATE_CONTRACT_V1,
				mode: "raw-v1-display-only",
				original: clone(record),
			};
		}
		if (record.compatibility?.original) return clone(record.compatibility);
		if (record.legacy?.record) {
			return {
				fromContract: TIDAL_GATE_CONTRACT_V1,
				mode: "migrated-v1-display-only",
				original: clone(record.legacy.record),
			};
		}
		return record.compatibility ? clone(record.compatibility) : null;
	}

	async function gateConstants() {
		const sharedLocations = await sharedTideWorkspaceLocations();
		const locationsById = new Map(sharedLocations.map((location) => [location.id, location]));
		const locations = sharedLocations
			.filter((location) => Array.isArray(location.types) && location.types.includes("tidalGate"))
			.sort((left, right) => left.name.localeCompare(right.name));
		const tidalDatabase = requireService("ajrmMarineTidalDatabase", "tidal database");
		const source = await sourceGateCatalogue(tidalDatabase);
		const records = Array.isArray(source.gates) ? source.gates : [];
		const recordsByLocationId = new Map();
		for (const record of records) {
			const locationId = typeof record?.locationId === "string" ? record.locationId : "";
			if (!locationId) continue;
			if (!recordsByLocationId.has(locationId)) recordsByLocationId.set(locationId, []);
			recordsByLocationId.get(locationId).push(record);
		}
		const ports = new Map((typeof tidalDatabase.listPorts === "function" ? tidalDatabase.listPorts() : [])
			.map((port) => [port.locationId, port]));
		const planningDiagnostics = [];
		const gates = locations.map((location) => {
			const matchingRecords = recordsByLocationId.get(location.id) || [];
			const record = matchingRecords[0] || null;
			const referencePortId = gateReferenceLocationId(record);
			const port = ports.get(referencePortId) || null;
			const portLocation = locationsById.get(referencePortId) || null;
			const joinedPort = port && portLocation ? { port, location: portLocation } : null;
			const reasonCodes = gateDefinitionReasonCodes({
				record,
				location,
				referencePort: joinedPort,
				sourceOperational: source.supported && source.operationalLocationIds.has(location.id),
				duplicate: matchingRecords.length > 1,
			});
			const position = representativePosition(location);
			planningDiagnostics.push({ locationId: location.id, reasonCodes });
			return {
				locationId: location.id,
				name: location.name,
				latitude: Number.isFinite(position?.latitude) ? position.latitude : null,
				longitude: Number.isFinite(position?.longitude) ? position.longitude : null,
				record: record ? clone(record) : null,
				referencePort: joinedPort ? {
					locationId: port.locationId,
					name: portLocation.name,
					stationId: port.prediction?.stationId || null,
					referenceLevels: port.referenceLevels ? clone(port.referenceLevels) : null,
				} : null,
				calculationReady: reasonCodes.length === 0,
				readiness: record?.readiness ? clone(record.readiness) : {
					state: record?.contract === TIDAL_GATE_CONTRACT_V1 ? "needs-review" : "missing",
					reasons: reasonCodes,
				},
				compatibility: gateCompatibility(record),
			};
		});
		const locationIds = new Set(locations.map((location) => location.id));
		const unjoinedRecords = records.filter((record) => !locationIds.has(record?.locationId)).map((record) => clone(record));
		return {
			contract: PLANNING_GATE_CATALOGUE_CONTRACT,
			contractVersion: 2,
			gates,
			operationalLocationIds: gates.filter((entry) => entry.calculationReady).map((entry) => entry.locationId),
			diagnostics: {
				source: {
					mode: source.mode,
					contract: source.contract,
					contractVersion: source.contractVersion,
					supported: source.supported,
					operationalLocationIds: [...source.operationalLocationIds],
					details: clone(source.diagnostics),
				},
				planning: planningDiagnostics,
				unjoinedRecords,
			},
		};
	}

	async function anchorState() {
		const saved = await readJson(anchorStateFile, defaultAnchorState);
		return {
			...clone(defaultAnchorState), ...saved,
			tide: { ...clone(defaultAnchorState.tide), ...(saved.tide || {}) },
			tidePorts: await sharedTideLocations(),
			tideData: {
				displayTimeMode:saved.tideData?.displayTimeMode === "ut" ? "ut" : "local",
				events:[],
				cache:null,
			},
		};
	}

	async function saveAnchorState(state) {
		const value = clone(state);
		delete value.tidePorts;
		delete value.deletedSecondaryPortIds;
		value.tideData = {
			displayTimeMode:value.tideData?.displayTimeMode === "ut" ? "ut" : "local",
			events:[],
			cache:null,
		};
		await writeJson(anchorStateFile, value);
	}

	async function tideStatus(force, state = null) {
		const tides = sharedService("ajrmMarineTidalDatabase");
		if (!tides) return null;
		const selected = state?.tidePorts?.find((entry) => entry.id === state?.tide?.selectedPortId);
		if (!selected) return null;
		const request = { includeEvents: true, portId: selected?.locationId };
		return force ? tides.refresh(request) : tides.status(request);
	}

	function liveInputs() {
		const value = (pathName) => signalKValue(app.getSelfPath?.(pathName));
		const firstValue = (...pathNames) => {
			for (const pathName of pathNames) {
				const candidate = value(pathName);
				if (candidate !== null) return candidate;
			}
			return null;
		};
		return {
			at: new Date().toISOString(),
			position: value("navigation.position"),
			windSpeedApparentMps: value("environment.wind.speedApparent"),
			windSpeedTrueMps: value("environment.wind.speedTrue"),
			depthBelowKeelM: value("environment.depth.belowKeel"),
			depthBelowSurfaceM: value("environment.depth.belowSurface"),
			waterSpeedMps: value("navigation.speedThroughWater"),
			currentSpeedMps: firstValue("environment.current.drift", "environment.tide.drift"),
			sources: "Signal K current vessel values; null means unavailable",
		};
	}

	function requireWrite(handler) {
		return (req, res) => {
			const permission = req.skPrincipal?.permissions;
			if (permission === "admin" || permission === "readwrite" || (permission === undefined && req.skIsAuthenticated !== false)) {
				return Promise.resolve(handler(req, res)).catch((error) => res.status(500).json({ error: error.message }));
			}
			return res.status(403).json({ error: "Planning changes require Signal K read/write or admin access." });
		};
	}

	function publishStatus(value = status(), force = false) {
		const signature = value === null ? "null" : JSON.stringify({
			enabled:value.enabled,
			locationsService:value.locationsService,
			tideService:value.tideService,
			weatherService:value.weatherService,
			ready:value.ready,
		});
		if (!force && signature === lastStatusSignature) return;
		lastStatusSignature = signature;
		app.handleMessage?.(plugin.id, { context: "vessels.self", updates: [{
			source: { label: plugin.id }, timestamp: new Date().toISOString(),
			values: [{ path: STATUS_PATH, value }],
		}] });
	}

	function publishStatusIfChanged() {
		if (!running) return;
		publishStatus(status());
	}

	return plugin;
};
