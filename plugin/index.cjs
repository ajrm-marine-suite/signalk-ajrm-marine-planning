/**
 * Signal K entry point for the consolidated Gate Passage and Anchor Force
 * planning webapp. Calculation state belongs here; locations, tides and
 * weather are obtained from Location Editor's shared in-process services.
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const packageJson = require("../package.json");
const defaultGateSettings = require("../defaults/gate-settings.json");
const defaultAnchorState = require("../defaults/anchor-state.json");
const { tideLocationsFromLocations } = require("./secondary-ports.cjs");
const STATUS_PATH = "plugins.ajrmMarinePlanning";
const SERVICE_REGISTRIES = Object.freeze({
	ajrmMarineLocations: Symbol.for("mcdonaldajr.ajrmMarineLocations"),
	ajrmMarineTides: Symbol.for("mcdonaldajr.ajrmMarineTides"),
	ajrmMarineWeather: Symbol.for("mcdonaldajr.ajrmMarineWeather"),
});
const PLANNING_DIAGNOSTICS_REGISTRY = Symbol.for("mcdonaldajr.ajrmMarinePlanningDiagnostics");

function clone(value) { return structuredClone(value); }

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

function normalizeName(value) {
	return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/\bgulf of\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function cacheShape(result) {
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
			? `shared Location Editor service; ${result.freshness.state}`
			: "shared Location Editor service",
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
	const selectedPort = value.secondaryPorts?.find((entry) => entry.id === value.tide?.selectedPortId) || null;
	const resolvedSelectedPort = tideResult?.selectedPort?.id === selectedPort?.locationId;
	value.tideData = {
		...(value.tideData || {}),
		stationName: tideResult?.station?.name || selectedPort?.name || "",
		stationId: tideResult?.station?.id || "",
		ukhoApiKey: undefined,
		ukhoApiKeySet: tideConfigured,
		managedBy: "AJRM Marine Location Editor",
		resolvedLocationId: tideResult?.selectedPort?.id || null,
		referenceLevels: tideResult?.referenceLevels || null,
		events: tideResult?.valid && resolvedSelectedPort ? ukhoEvents(tideResult) : [],
		cache: selectedPort ? (tideResult ? cacheShape(tideResult) : value.tideData?.cache || null) : null,
		error: selectedPort ? (tideResult?.error || "") : "Select a tidal port.",
	};
	return value;
}

module.exports = function ajrmMarinePlanning(app) {
	const plugin = {};
	let running = false;
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
		publishStatus();
	};

	plugin.stop = () => {
		running = false;
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
			catch (error) { res.status(500).json({ error: error.message }); }
		});
		router.get("/gate/settings", async (_req, res) => {
			const settings = { ...defaultGateSettings, ...(await readJson(gateSettingsFile, {})) };
			delete settings.ukhoApiKey;
			res.json({ ...settings, ukhoApiKeySet: sharedService("ajrmMarineTides")?.configured === true, tideManagedBy: "AJRM Marine Location Editor" });
		});
		router.post("/gate/settings", requireWrite(async (req, res) => {
			const current = await readJson(gateSettingsFile, {});
			const submitted = { ...(req.body || {}) };
			for (const key of ["baseTideStationName", "baseTideStationId", "baseTideTimeStandard", "standardMhws", "standardMhwn", "standardMlwn", "standardMlws"]) delete submitted[key];
			const next = { ...current, ...submitted };
			for (const key of ["baseTideStationName", "baseTideStationId", "baseTideTimeStandard", "standardMhws", "standardMhwn", "standardMlwn", "standardMlws"]) delete next[key];
			delete next.ukhoApiKey;
			await writeJson(gateSettingsFile, next);
			res.json({ ok: true, ...defaultGateSettings, ...next, ukhoApiKeySet: sharedService("ajrmMarineTides")?.configured === true });
		}));
		router.get("/gate/weather", async (req, res) => {
			try {
				const weather = requireService("ajrmMarineWeather", "weather");
				const location = await gateLocation(req.query?.location);
				const position = location ? representativePosition(location) : {
					latitude: Number(req.query?.lat), longitude: Number(req.query?.lon),
				};
				const result = req.query?.refresh === "1"
					? await weather.refresh({ contextLocationId: location?.id, position, weatherDays: req.query?.days, marineDays: req.query?.marineDays })
					: await weather.status({ contextLocationId: location?.id, position, weatherDays: req.query?.days, marineDays: req.query?.marineDays });
				if (!result.valid) return res.status(503).json({ error: result.error || "Weather is unavailable." });
				return res.json({
					latitude: result.position.latitude, longitude: result.position.longitude,
					weatherDays: Number(req.query?.days || 16), marineDays: Number(req.query?.marineDays || 8),
					forecast: result.hourly.forecast, marine: result.hourly.marine, cache: cacheShape(result),
				});
			} catch (error) { return res.status(503).json({ error: error.message }); }
		});
		router.get("/gate/tides", async (req, res) => {
			try {
				const tide = requireService("ajrmMarineTides", "tide");
				const location = await gateLocation(req.query?.location);
				const standardPortId = String(location?.properties?.tidalGate?.standardPortRef || "").split("/").at(-1);
				const request = { contextLocationId: standardPortId || location?.id, position: representativePosition(location), includeEvents: true };
				const result = req.query?.refresh === "1" ? await tide.refresh(request) : await tide.status(request);
				if (!result.valid) return res.status(503).json({ error: result.error || "Tidal data are unavailable." });
				return res.json({
					stationId: result.station?.id, stationName: result.station?.name,
					timeStandard: "UT", location: req.query?.location || null,
					events: ukhoEvents(result), cache: cacheShape(result),
				});
			} catch (error) { return res.status(503).json({ error: error.message }); }
		});

		router.get("/anchor/state", async (_req, res) => {
			const state = await anchorState();
			res.json(publicAnchorState(state, await tideStatus(false, state), sharedService("ajrmMarineTides")?.configured === true));
		});
		router.put("/anchor/state", requireWrite(async (req, res) => {
			const submitted = clone(req.body || {});
			delete submitted.secondaryPorts;
			delete submitted.deletedSecondaryPortIds;
			const next = { ...clone(defaultAnchorState), ...submitted, secondaryPorts: [] };
			next.tideData = { ...(next.tideData || {}), ukhoApiKey: "", events: [], cache: null };
			await writeJson(anchorStateFile, next);
			const saved = await anchorState();
			res.json(publicAnchorState(saved, await tideStatus(false, saved), sharedService("ajrmMarineTides")?.configured === true));
		}));
		router.put("/anchor/tide-port", requireWrite(async (req, res) => {
			const state = await anchorState();
			const selectedPortId = String(req.body?.selectedPortId || "");
			if (selectedPortId && !state.secondaryPorts.some((entry) => entry.id === selectedPortId)) {
				return res.status(400).json({ error: "The selected tidal port is not available from Location Editor." });
			}
			state.tide.selectedPortId = selectedPortId;
			await saveAnchorState(state);
			const saved = await anchorState();
			return res.json(publicAnchorState(saved, await tideStatus(false, saved), sharedService("ajrmMarineTides")?.configured === true));
		}));
		router.post("/anchor/tide-port/recommend", requireWrite(async (_req, res) => {
			const position = app.getSelfPath?.("navigation.position");
			if (!Number.isFinite(position?.latitude) || !Number.isFinite(position?.longitude)) {
				return res.status(409).json({ error: "A current own-vessel position is needed to find a nearby secondary port." });
			}
			const tides = requireService("ajrmMarineTides", "tide");
			if (typeof tides.recommendSecondary !== "function") {
				return res.status(503).json({ error: "Update AJRM Marine Location Editor to use regional secondary-port selection." });
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
			const selected = state.secondaryPorts.find((entry) => entry.locationId === recommendation.port.id);
			if (!selected) return res.status(404).json({ error: "The recommended secondary port is not usable by the planner." });
			state.tide.selectedPortId = selected.id;
			await saveAnchorState(state);
			const saved = await anchorState();
			const value = publicAnchorState(saved, await tideStatus(false, saved), sharedService("ajrmMarineTides")?.configured === true);
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
				stationName: "Selected by Location Editor",
				stationId: "",
				timeStandard: "UT",
				ukhoAccountEmail: "",
				ukhoApiKey: "",
				events: [], cache: null,
			};
			await saveAnchorState(state);
			res.json(publicAnchorState(state, await tideStatus(false, state), sharedService("ajrmMarineTides")?.configured === true).tideData);
		}));
		router.post("/anchor/tide-data/refresh", requireWrite(async (req, res) => {
			const state = await anchorState();
			if (req.body?.selectedPortId != null) {
				const selectedPortId = String(req.body.selectedPortId);
				if (selectedPortId && !state.secondaryPorts.some((entry) => entry.id === selectedPortId)) {
					return res.status(400).json({ error: "The selected tidal port is not available from Location Editor." });
				}
				state.tide.selectedPortId = selectedPortId;
				await saveAnchorState(state);
			}
			res.json(publicAnchorState(state, await tideStatus(true, state), sharedService("ajrmMarineTides")?.configured === true).tideData);
		}));
		router.get("/anchor/live", (_req, res) => res.json(liveInputs()));
	};

	function status() {
		const locations = sharedService("ajrmMarineLocations");
		const tides = sharedService("ajrmMarineTides");
		const weather = sharedService("ajrmMarineWeather");
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
		const gateSettings = { ...defaultGateSettings, ...(await readJson(gateSettingsFile, {})) };
		delete gateSettings.ukhoApiKey;
		const savedAnchorState = await anchorState();
		if (savedAnchorState.tideData) {
			delete savedAnchorState.tideData.ukhoApiKey;
			delete savedAnchorState.tideData.ukhoAccountEmail;
			delete savedAnchorState.tideData.events;
		}
		return {
			contract: "ajrm-marine-planning-diagnostics-v1",
			contractVersion: 1,
			capturedAt: new Date().toISOString(),
			status: status(),
			gate: {
				settings: gateSettings,
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
		if (!service) throw new Error(`Shared ${label} service is unavailable. Enable AJRM Marine Location Editor.`);
		return service;
	}

	function sharedService(name) {
		return app[name] || globalThis[SERVICE_REGISTRIES[name]] || null;
	}

	async function sharedGateLocations() {
		const locations = await requireService("ajrmMarineLocations", "location").list({ workspace: "tides" });
		return locations.filter((location) => location.types.includes("tidalGate"));
	}

	async function sharedTideLocations() {
		const locations = await requireService("ajrmMarineLocations", "location").list({ workspace: "tides" });
		return tideLocationsFromLocations(locations);
	}

	async function gateLocation(name) {
		if (!name) return null;
		const wanted = normalizeName(name);
		const values = await sharedGateLocations();
		return values.find((location) => normalizeName(location.name) === wanted) || null;
	}

	async function gateConstants() {
		const shared = await sharedGateLocations();
		const all = await requireService("ajrmMarineLocations", "location").list({ workspace: "tides" });
		const byId = new Map(all.map((location) => [location.id, location]));
		const result = {};
		for (const location of shared) {
			const gate = location.properties?.tidalGate;
			if (gate?.contract !== "ajrm-tidal-gate-constants-v1") continue;
			const standardId = String(gate.standardPortRef || "").split("/").at(-1);
			const standard = byId.get(standardId);
			const position = representativePosition(location);
			result[location.name] = {
				location: location.name,
				latitude: String(position?.latitude ?? ""), longitude: String(position?.longitude ?? ""),
				floodSet: gate.floodSet || "", ebbSet: gate.ebbSet || "",
				springPeakFlow: gate.springPeakFlowKnots ?? "", neapPeakFlow: gate.neapPeakFlowKnots ?? "",
				floodSpringAfter: gate.floodSpringAfter || "", floodNeapAfter: gate.floodNeapAfter || "",
				floodSpringSlack: gate.floodSpringSlack || "", floodNeapSlack: gate.floodNeapSlack || "",
				ebbSpringAfter: gate.ebbSpringAfter || "", ebbNeapAfter: gate.ebbNeapAfter || "",
				ebbSpringSlack: gate.ebbSpringSlack || "", ebbNeapSlack: gate.ebbNeapSlack || "",
				source: gate.source || "",
				locationId: location.id,
				standardPortName: standard?.properties?.tide?.stationName || standard?.name || "",
				standardPort: standard ? {
					locationId: standard.id,
					name: standard.properties?.tide?.stationName || standard.name,
					stationId: standard.properties?.tide?.stationId || null,
					referenceLevels: standard.properties?.tide?.referenceLevels || null,
				} : null,
			};
		}
		return result;
	}

	async function anchorState() {
		const saved = await readJson(anchorStateFile, defaultAnchorState);
		const savedTide = { ...(saved.tide || {}) };
		// Keep only the selected port and reference levels from legacy planner
		// state; entered HW/LW values are no longer an input source.
		if (!savedTide.standardReferenceLevels && savedTide.obanReferenceLevels) savedTide.standardReferenceLevels = savedTide.obanReferenceLevels;
		delete savedTide.obanReferenceLevels;
		delete savedTide.oban;
		delete savedTide.referencePort;
		delete savedTide.source;
		return {
			...clone(defaultAnchorState), ...saved,
			tide: { ...clone(defaultAnchorState.tide), ...savedTide },
			secondaryPorts: await sharedTideLocations(),
			tideData: { ...clone(defaultAnchorState.tideData || {}), ...(saved.tideData || {}), ukhoApiKey: "" },
		};
	}

	async function saveAnchorState(state) {
		const value = clone(state);
		delete value.secondaryPorts;
		delete value.deletedSecondaryPortIds;
		value.tideData = { ...(value.tideData || {}), ukhoApiKey: "", events: [], cache: null };
		await writeJson(anchorStateFile, value);
	}

	async function tideStatus(force, state = null) {
		const tides = sharedService("ajrmMarineTides");
		if (!tides) return null;
		const selected = state?.secondaryPorts?.find((entry) => entry.id === state?.tide?.selectedPortId);
		if (!selected) return null;
		const request = { includeEvents: true, portId: selected?.locationId };
		return force ? tides.refresh(request) : tides.status(request);
	}

	function liveInputs() {
		const value = (pathName) => app.getSelfPath?.(pathName) ?? null;
		return {
			at: new Date().toISOString(),
			position: value("navigation.position"),
			windSpeedApparentMps: value("environment.wind.speedApparent"),
			windSpeedTrueMps: value("environment.wind.speedTrue"),
			depthBelowKeelM: value("environment.depth.belowKeel"),
			depthBelowSurfaceM: value("environment.depth.belowSurface"),
			waterSpeedMps: value("navigation.speedThroughWater"),
			currentSpeedMps: value("environment.current.speed"),
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

	function publishStatus(value = status()) {
		app.handleMessage?.(plugin.id, { context: "vessels.self", updates: [{
			source: { label: plugin.id }, timestamp: new Date().toISOString(),
			values: [{ path: STATUS_PATH, value }],
		}] });
	}

	return plugin;
};
