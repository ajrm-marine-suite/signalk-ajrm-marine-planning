/** Verifies Planning delegates spatial, tidal and weather data to their separate shared services. */

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin/index.cjs");

function response() {
	return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

async function fixture(t) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-planning-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const calls = { weather: [], tide: [] };
	const gate = {
		id: "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec", name: "Cuan Sound", types: ["tidalGate"],
		feature: { geometry: { type: "Point", coordinates: [-5.637656, 56.27224] } },
		properties: {},
	};
	const oban = { id: "oban", name: "Oban", types: ["tidalStandardPort"], properties: { tide: {
		providerId: "ukhoTidalEvents", stationId: "0372", stationName: "Oban",
		referenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
	} } };
	const secondaryPort = {
		id: "tobermory-location", name: "Tobermory", types: ["tidalSecondaryPort"],
		feature: { geometry: { type: "Point", coordinates: [-6.06, 56.62] } },
		properties: { tide: {
			parentLocationRef: "/resources/locations/oban",
			secondaryPortCorrections: {
				contract: "ajrm-secondary-port-corrections-v4", timeOffsetPeriodMinutes: 720,
				highWaterTimeOffsets: [{ referenceTimeMinutes: 0, offsetMinutes: 20 }],
				lowWaterTimeOffsets: [{ referenceTimeMinutes: 0, offsetMinutes: 20 }],
				heightDifferencesM: { mhws: 0.5, mhwn: 0.6, mlwn: 0.1, mlws: 0.2 },
			},
		} },
	};
	const tideResult = {
		valid: true, station: { id: "0372", name: "Oban" },
		events: [{ type: "high", at: "2026-08-18T12:00:00.000Z", heightM: 3.2 }],
		source: { cache: "hit", fetchedAt: "2026-08-18T00:00:00.000Z" },
		freshness: { state: "fresh", staleAfterSeconds: 3600 }, error: "",
	};
	const weatherResult = {
		valid: true, position: { latitude: 56.27224, longitude: -5.637656 },
		hourly: { forecast: { hourly: { time: [] } }, marine: { hourly: { time: [] } } },
		source: { cache: "hit", fetchedAt: "2026-08-18T00:00:00.000Z" },
		freshness: { state: "fresh", staleAfterSeconds: 3600 }, error: "",
	};
	const tidalRegion = { id: "west-region", name: "West Scotland", types: ["tidalRegion"] };
	const selfValues = {
		"navigation.position": { value: { latitude: 56.62, longitude: -6.05 }, timestamp: "2026-08-18T12:00:00.000Z" },
		"environment.wind.speedApparent": { value: 7.5, timestamp: "2026-08-18T12:00:00.000Z" },
		"environment.wind.speedTrue": { value: 8.25, timestamp: "2026-08-18T12:00:00.000Z" },
		"environment.depth.belowKeel": { value: 4.6, timestamp: "2026-08-18T12:00:00.000Z" },
		"navigation.speedThroughWater": { value: 2.1, timestamp: "2026-08-18T12:00:00.000Z" },
		"environment.current.drift": { value: 0.7, timestamp: "2026-08-18T12:00:00.000Z" },
	};
	const app = {
		getDataDirPath: () => directory, setPluginStatus() {}, handleMessage() {},
		getSelfPath(pathName) { return selfValues[pathName] ?? null; },
		ajrmMarineLocations: { contract: "ajrm-marine-locations-service-v1", async list() { return [gate, oban, secondaryPort, tidalRegion]; } },
		ajrmMarineTidalDatabase: {
			contract: "ajrm-marine-tidal-database-service-v1",
			configured: true,
			listPorts() { return [
				{ locationId:"oban", name:"Oban", kind:"standard", referenceLevels:{ mhws:4,mhwn:2.9,mlwn:1.8,mlws:.7 }, prediction:{ mode:"provider",providerId:"ukhoTidalEvents",stationId:"0372",stationName:"Oban" } },
				{ locationId:"tobermory-location", name:"Tobermory", kind:"secondary", prediction:{ mode:"corrections",parentLocationId:"oban",corrections:{} } },
			]; },
			listGates() { return [{ locationId:gate.id, contract:"ajrm-tidal-gate-constants-v1", standardPortRef:"/resources/locations/oban", floodSet:"W",ebbSet:"E",springPeakFlowKnots:7,neapPeakFlowKnots:5,floodSpringAfter:"4:30:00",floodNeapAfter:"5:15:00",floodSpringSlack:"0:15:00",floodNeapSlack:"0:40:00",ebbSpringAfter:"-1:45:00",ebbNeapAfter:"-1:00:00",ebbSpringSlack:"0:15:00",ebbNeapSlack:"0:40:00",source:"fixture" }]; },
			async status(value) { calls.tide.push(value); return { ...tideResult, selectedPort: { id: value.portId, name: "Tobermory" } }; },
			async refresh(value) { calls.tide.push(value); return { ...tideResult, selectedPort: { id: value.portId, name: "Tobermory" } }; },
			async recommendSecondary() { return { port: secondaryPort, tidalRegion, distanceM: 850, reason: "nearestSecondaryPortInTidalRegion" }; },
		},
		ajrmMarineWeatherDatabase: {
			contract: "ajrm-marine-weather-database-service-v1",
			async status(value) { calls.weather.push(value); return weatherResult; },
			async refresh(value) { calls.weather.push(value); return weatherResult; },
		},
	};
	const routes = new Map();
	const router = {};
	for (const method of ["get", "post", "put"]) router[method] = (route, handler) => routes.set(`${method.toUpperCase()} ${route}`, handler);
	const plugin = createPlugin(app);
	plugin.registerWithRouter(router);
	plugin.start({});
	async function call(method, route, req = {}) {
		const res = response();
		await routes.get(`${method} ${route}`)({ query: {}, body: {}, ...req }, res);
		return res;
	}
	return { app, calls, call, plugin, directory };
}

test("gate weather and tides use shared services and authoritative location", async (t) => {
	const { calls, call, plugin } = await fixture(t);
	let result = await call("GET", "/gate/weather", { query: { location: "Cuan Sound", days: "4", marineDays: "3" } });
	assert.equal(result.statusCode, 200);
	assert.equal(calls.weather[0].contextLocationId, "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec");
	result = await call("GET", "/gate/tides", { query: { location: "Cuan Sound" } });
	assert.equal(result.body.events[0].EventType, "HighWater");
	assert.equal(result.body.events[0].DateTime, "2026-08-18T12:00:00.000Z");
	assert.equal(calls.tide[0].includeEvents, true);
	assert.equal(calls.tide[0].portId, "oban");
	assert.equal(calls.tide[0].contextLocationId, "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec");
	plugin.stop();
});

test("gate weather and tides resolve shared services registered by another plugin app wrapper", async (t) => {
	const { app, calls, call, plugin } = await fixture(t);
	const names = ["ajrmMarineLocations", "ajrmMarineTidalDatabase", "ajrmMarineWeatherDatabase"];
	for (const name of names) {
		const registry = Symbol.for(`mcdonaldajr.${name}`);
		globalThis[registry] = app[name];
		delete app[name];
		t.after(() => { delete globalThis[registry]; });
	}
	let result = await call("GET", "/gate/weather", { query: { location: "Cuan Sound" } });
	assert.equal(result.statusCode, 200);
	result = await call("GET", "/gate/tides", { query: { location: "Cuan Sound" } });
	assert.equal(result.statusCode, 200);
	assert.equal(calls.weather.length, 1);
	assert.equal(calls.tide.length, 1);
	plugin.stop();
});

test("gate settings reject retired provider and location fields", async (t) => {
	const { call, plugin } = await fixture(t);
	let result = await call("POST", "/gate/settings", { body: {
		selectedGate: "Cuan Sound",
		ukhoApiKey: "must-not-persist",
		baseTideStationName: "Wrong owner",
	} });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.selectedGate, "Cuan Sound");
	assert.equal(result.body.ukhoApiKey, undefined);
	assert.equal(result.body.baseTideStationName, undefined);
	result = await call("GET", "/gate/settings");
	assert.equal(result.body.ukhoApiKey, undefined);
	assert.equal(result.body.baseTideStationName, undefined);
	plugin.stop();
});

test("anchor state contains no API secret and uses shared tide events", async (t) => {
	const { call, plugin } = await fixture(t);
	let result = await call("GET", "/anchor/state");
	assert.deepEqual(result.body.tideData.events, []);
	result = await call("PUT", "/anchor/tide-port", { body: { selectedPortId: "tobermory-location" } });
	assert.equal(result.body.tideData.managedBy, "AJRM Marine Tidal Database");
	assert.equal(result.body.tideData.events[0].Height, 3.2);
	assert.equal(result.body.tideData.events[0].DateTime, "2026-08-18T12:00:00.000Z");
	assert.deepEqual(result.body.tidePorts.map((port) => port.id), ["oban", "tobermory-location"]);
	assert.equal(result.body.tidePorts[1].locationId, "tobermory-location");
	plugin.stop();
});

test("anchor selects the nearest secondary port in the vessel's tidal region", async (t) => {
	const { call, plugin } = await fixture(t);
	const result = await call("POST", "/anchor/tide-port/recommend");
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.tide.selectedPortId, "tobermory-location");
	assert.equal(result.body.tideRecommendation.portName, "Tobermory");
	assert.equal(result.body.tideRecommendation.regionName, "West Scotland");
	assert.equal(result.body.tideRecommendation.distanceM, 850);
	plugin.stop();
});

test("anchor live inputs unwrap Signal K leaves and use the current drift path", async (t) => {
	const { call, plugin } = await fixture(t);
	const result = await call("GET", "/anchor/live");
	assert.equal(result.statusCode, 200);
	assert.deepEqual(result.body.position, { latitude: 56.62, longitude: -6.05 });
	assert.equal(result.body.windSpeedApparentMps, 7.5);
	assert.equal(result.body.windSpeedTrueMps, 8.25);
	assert.equal(result.body.depthBelowKeelM, 4.6);
	assert.equal(result.body.waterSpeedMps, 2.1);
	assert.equal(result.body.currentSpeedMps, 0.7);
	plugin.stop();
});

test("anchor clears tide figures when the selected port cannot resolve", async (t) => {
	const { app, call, plugin } = await fixture(t);
	await call("PUT", "/anchor/tide-port", { body: { selectedPortId: "tobermory-location" } });
	app.ajrmMarineTidalDatabase.status = async ({ portId }) => ({
		valid: false,
		selectedPort: { id: portId, name: "Tobermory" },
		error: "No prediction data are available.",
	});
	const result = await call("GET", "/anchor/state");
	assert.deepEqual(result.body.tideData.events, []);
	assert.equal(result.body.tideData.stationName, "Tobermory");
	assert.equal(result.body.tideData.error, "No prediction data are available.");
	plugin.stop();
});

test("anchor state always derives tide ports from Tidal Database", async (t) => {
	const { call, plugin } = await fixture(t);
	const result = await call("GET", "/anchor/state");
	assert.equal(result.statusCode, 200);
	assert.deepEqual(result.body.tidePorts.map((port) => port.id), ["oban", "tobermory-location"]);
	plugin.stop();
});

test("diagnostic snapshot captures planner state without credentials or duplicating tide events", async (t) => {
	const { app, plugin, directory } = await fixture(t);
	await fs.writeFile(path.join(directory, "anchor-state.json"), JSON.stringify({
		tide:{ selectedPortId:"" },
		tideData:{ displayTimeMode:"ut", managedBy:"Retired owner", stationId:"old", ukhoApiKey:"must-not-survive" },
	}));
	const snapshot = await app.ajrmMarinePlanningDiagnostics.snapshot();
	assert.equal(snapshot.contract, "ajrm-marine-planning-diagnostics-v1");
	assert.equal(snapshot.status.ready, true);
	assert.ok(snapshot.gate.settings);
	assert.ok(snapshot.gate.locationConstants["Cuan Sound"]);
	assert.equal(snapshot.anchor.state.tideData.events, undefined);
	assert.equal(snapshot.anchor.state.tideData.displayTimeMode, "ut");
	assert.equal(snapshot.anchor.state.tideData.managedBy, undefined);
	assert.equal(snapshot.anchor.state.tideData.stationId, undefined);
	assert.equal(snapshot.anchor.state.tideData.ukhoApiKey, undefined);
	plugin.stop();
	assert.equal(app.ajrmMarinePlanningDiagnostics, undefined);
});

test("published readiness follows shared services that start after Planning", async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ajrm-planning-order-"));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const serviceNames = ["ajrmMarineLocations", "ajrmMarineTidalDatabase", "ajrmMarineWeatherDatabase"];
	const registries = serviceNames.map((name) => Symbol.for(`mcdonaldajr.${name}`));
	const previous = registries.map((registry) => globalThis[registry]);
	for (const registry of registries) delete globalThis[registry];
	t.after(() => registries.forEach((registry, index) => {
		if (previous[index] === undefined) delete globalThis[registry];
		else globalThis[registry] = previous[index];
	}));
	const published = [];
	const app = {
		getDataDirPath: () => directory,
		setPluginStatus() {},
		handleMessage(_id, message) {
			for (const update of message.updates || []) for (const value of update.values || []) {
				if (value.path === "plugins.ajrmMarinePlanning") published.push(value.value);
			}
		},
	};
	const plugin = createPlugin(app);
	plugin.start({});
	assert.equal(published.at(-1).ready, false);
	app.ajrmMarineLocations = { contract:"ajrm-marine-locations-service-v1" };
	app.ajrmMarineTidalDatabase = { contract:"ajrm-marine-tidal-database-service-v1" };
	app.ajrmMarineWeatherDatabase = { contract:"ajrm-marine-weather-database-service-v1" };
	await new Promise((resolve) => setTimeout(resolve, 1100));
	assert.equal(published.at(-1).ready, true);
	assert.equal(published.at(-1).tideService, "ajrm-marine-tidal-database-service-v1");
	assert.equal(published.at(-1).weatherService, "ajrm-marine-weather-database-service-v1");
	plugin.stop();
});
