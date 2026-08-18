/**
 * Signal K entry point for the consolidated Gate Passage and Anchor Force
 * planning webapp. Calculation state belongs here; locations, tides and
 * weather are obtained from Location Editor's shared in-process services.
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const packageJson = require("../package.json");
const defaultGateConstants = require("../defaults/gate-location-constants.json");
const defaultGateSettings = require("../defaults/gate-settings.json");
const defaultAnchorState = require("../defaults/anchor-state.json");
const STATUS_PATH = "plugins.ajrmMarinePlanning";

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
	return (result?.events || []).map((event) => ({
		EventType: event.type === "high" ? "HighWater" : "LowWater",
		DateTime: event.at,
		Height: event.heightM,
		IsApproximateTime: false,
		IsApproximateHeight: false,
		Filtered: false,
	}));
}

function publicAnchorState(state, tideResult, tideConfigured = false) {
	const value = clone(state);
	value.tideData = {
		...(value.tideData || {}),
		ukhoApiKey: undefined,
		ukhoApiKeySet: tideConfigured,
		managedBy: "AJRM Marine Location Editor",
		events: tideResult?.valid ? ukhoEvents(tideResult) : value.tideData?.events || [],
		cache: tideResult ? cacheShape(tideResult) : value.tideData?.cache || null,
		error: tideResult?.error || "",
	};
	return value;
}

module.exports = function ajrmMarinePlanning(app) {
	const plugin = {};
	let running = false;
	const startedAt = new Date().toISOString();
	const dataDirectory = app.getDataDirPath?.() || path.join(process.cwd(), ".ajrm-marine-planning");
	const gateConstantsFile = path.join(dataDirectory, "gate-location-constants.json");
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
		app.setPluginStatus?.(`Started v${packageJson.version}`);
		publishStatus();
	};

	plugin.stop = () => {
		running = false;
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
		router.post("/gate/location-constants", requireWrite(async (req, res) => {
			if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
				return res.status(400).json({ error: "Location constants must be an object." });
			}
			await writeJson(gateConstantsFile, req.body);
			return res.json({ ok: true, managedBy: plugin.id });
		}));
		router.get("/gate/settings", async (_req, res) => {
			const settings = { ...defaultGateSettings, ...(await readJson(gateSettingsFile, {})) };
			delete settings.ukhoApiKey;
			res.json({ ...settings, ukhoApiKeySet: app.ajrmMarineTides?.configured === true, tideManagedBy: "AJRM Marine Location Editor" });
		});
		router.post("/gate/settings", requireWrite(async (req, res) => {
			const current = await readJson(gateSettingsFile, {});
			const next = { ...current, ...(req.body || {}) };
			delete next.ukhoApiKey;
			await writeJson(gateSettingsFile, next);
			res.json({ ok: true, ...defaultGateSettings, ...next, ukhoApiKeySet: app.ajrmMarineTides?.configured === true });
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
				const request = { contextLocationId: location?.id, position: representativePosition(location), includeEvents: true };
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
			res.json(publicAnchorState(state, await tideStatus(false), app.ajrmMarineTides?.configured === true));
		});
		router.put("/anchor/state", requireWrite(async (req, res) => {
			const next = { ...clone(defaultAnchorState), ...(req.body || {}) };
			next.tideData = { ...(next.tideData || {}), ukhoApiKey: "", events: [], cache: null };
			await writeJson(anchorStateFile, next);
			res.json(publicAnchorState(next, await tideStatus(false), app.ajrmMarineTides?.configured === true));
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
			await writeJson(anchorStateFile, state);
			res.json(publicAnchorState(state, await tideStatus(false), app.ajrmMarineTides?.configured === true).tideData);
		}));
		router.post("/anchor/tide-data/refresh", requireWrite(async (_req, res) => {
			const state = await anchorState();
			res.json(publicAnchorState(state, await tideStatus(true), app.ajrmMarineTides?.configured === true).tideData);
		}));
		router.get("/anchor/live", (_req, res) => res.json(liveInputs()));
	};

	function status() {
		return {
			plugin: plugin.id, version: packageJson.version, enabled: running,
			locationsService: app.ajrmMarineLocations?.contract || null,
			tideService: app.ajrmMarineTides?.contract || null,
			weatherService: app.ajrmMarineWeather?.contract || null,
			ready: running && Boolean(app.ajrmMarineLocations && app.ajrmMarineTides && app.ajrmMarineWeather),
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
		if (!app[name]) throw new Error(`Shared ${label} service is unavailable. Enable AJRM Marine Location Editor.`);
		return app[name];
	}

	async function sharedGateLocations() {
		const locations = await requireService("ajrmMarineLocations", "location").list({ workspace: "tides" });
		return locations.filter((location) => location.types.includes("tidalGate"));
	}

	async function gateLocation(name) {
		if (!name) return null;
		const wanted = normalizeName(name);
		const values = await sharedGateLocations();
		return values.find((location) => normalizeName(location.name) === wanted) || null;
	}

	async function gateConstants() {
		const saved = await readJson(gateConstantsFile, defaultGateConstants);
		if (!app.ajrmMarineLocations) return saved;
		const shared = await sharedGateLocations();
		for (const location of shared) {
			const existingName = Object.keys(saved).find((name) => normalizeName(name) === normalizeName(location.name));
			const name = existingName || location.name;
			const position = representativePosition(location);
			saved[name] = {
				location: name,
				...(saved[name] || {}),
				latitude: String(position?.latitude ?? saved[name]?.latitude ?? ""),
				longitude: String(position?.longitude ?? saved[name]?.longitude ?? ""),
				locationId: location.id,
			};
		}
		return saved;
	}

	async function anchorState() {
		const saved = await readJson(anchorStateFile, defaultAnchorState);
		return {
			...clone(defaultAnchorState), ...saved,
			tide: { ...clone(defaultAnchorState.tide), ...(saved.tide || {}) },
			secondaryPorts: saved.secondaryPorts || clone(defaultAnchorState.secondaryPorts || []),
			tideData: { ...clone(defaultAnchorState.tideData || {}), ...(saved.tideData || {}), ukhoApiKey: "" },
		};
	}

	async function tideStatus(force) {
		if (!app.ajrmMarineTides) return null;
		const request = { includeEvents: true };
		return force ? app.ajrmMarineTides.refresh(request) : app.ajrmMarineTides.status(request);
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
