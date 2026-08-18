/** Verifies Planning delegates external data to the shared Location Editor services. */

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
		properties: { tidalGate: {
			contract: "ajrm-tidal-gate-constants-v1", standardPortRef: "/resources/locations/oban",
			floodSet: "W", ebbSet: "E", springPeakFlowKnots: 7, neapPeakFlowKnots: 5,
			floodSpringAfter: "4:30:00", floodNeapAfter: "5:15:00", floodSpringSlack: "0:15:00", floodNeapSlack: "0:40:00",
			ebbSpringAfter: "-1:45:00", ebbNeapAfter: "-1:00:00", ebbSpringSlack: "0:15:00", ebbNeapSlack: "0:40:00", source: "fixture",
		} },
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
				contract: "ajrm-secondary-port-corrections-v2", legacyId: "tobermory",
				parentReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
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
	const app = {
		getDataDirPath: () => directory, setPluginStatus() {}, handleMessage() {},
		getSelfPath(pathName) { return pathName === "navigation.position" ? { latitude: 56.62, longitude: -6.05 } : null; },
		ajrmMarineLocations: { contract: "ajrm-marine-locations-service-v1", async list() { return [gate, oban, secondaryPort, tidalRegion]; } },
		ajrmMarineTides: {
			contract: "ajrm-marine-tides-service-v1",
			configured: true,
			async status(value) { calls.tide.push(value); return { ...tideResult, selectedPort: { id: value.portId, name: "Tobermory" } }; },
			async refresh(value) { calls.tide.push(value); return { ...tideResult, selectedPort: { id: value.portId, name: "Tobermory" } }; },
			async recommendSecondary() { return { port: secondaryPort, tidalRegion, distanceM: 850, reason: "nearestSecondaryPortInTidalRegion" }; },
		},
		ajrmMarineWeather: {
			contract: "ajrm-marine-weather-service-v1",
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
	return { app, calls, call, plugin };
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
	assert.equal(calls.tide[0].contextLocationId, "oban");
	plugin.stop();
});

test("gate weather and tides resolve Location Editor services registered by another plugin app wrapper", async (t) => {
	const { app, calls, call, plugin } = await fixture(t);
	const names = ["ajrmMarineLocations", "ajrmMarineTides", "ajrmMarineWeather"];
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

test("anchor state contains no API secret and uses shared tide events", async (t) => {
	const { call, plugin } = await fixture(t);
	let result = await call("GET", "/anchor/state");
	assert.deepEqual(result.body.tideData.events, []);
	result = await call("PUT", "/anchor/tide-port", { body: { selectedPortId: "tobermory" } });
	assert.equal(result.body.tideData.ukhoApiKey, undefined);
	assert.equal(result.body.tideData.managedBy, "AJRM Marine Location Editor");
	assert.equal(result.body.tideData.events[0].Height, 3.2);
	assert.equal(result.body.tideData.events[0].DateTime, "2026-08-18T12:00:00.000Z");
	assert.deepEqual(result.body.secondaryPorts.map((port) => port.id), ["oban", "tobermory"]);
	assert.equal(result.body.secondaryPorts[1].locationId, "tobermory-location");
	plugin.stop();
});

test("anchor selects the nearest secondary port in the vessel's tidal region", async (t) => {
	const { call, plugin } = await fixture(t);
	const result = await call("POST", "/anchor/tide-port/recommend");
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.tide.selectedPortId, "tobermory");
	assert.equal(result.body.tideRecommendation.portName, "Tobermory");
	assert.equal(result.body.tideRecommendation.regionName, "West Scotland");
	assert.equal(result.body.tideRecommendation.distanceM, 850);
	plugin.stop();
});

test("anchor clears tide figures when the selected port cannot resolve", async (t) => {
	const { app, call, plugin } = await fixture(t);
	await call("PUT", "/anchor/tide-port", { body: { selectedPortId: "tobermory" } });
	app.ajrmMarineTides.status = async ({ portId }) => ({
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

test("anchor state ignores submitted secondary-port copies", async (t) => {
	const { call, plugin } = await fixture(t);
	const result = await call("PUT", "/anchor/state", { body: {
		tide: { source: "secondary", selectedPortId: "tobermory" },
		secondaryPorts: [{ id: "spoofed", name: "Wrong owner" }],
		deletedSecondaryPortIds: ["tobermory"],
	} });
	assert.equal(result.statusCode, 200);
	assert.deepEqual(result.body.secondaryPorts.map((port) => port.id), ["oban", "tobermory"]);
	plugin.stop();
});

test("diagnostic snapshot captures planner state without credentials or duplicating tide events", async (t) => {
	const { app, plugin } = await fixture(t);
	const snapshot = await app.ajrmMarinePlanningDiagnostics.snapshot();
	assert.equal(snapshot.contract, "ajrm-marine-planning-diagnostics-v1");
	assert.equal(snapshot.status.ready, true);
	assert.ok(snapshot.gate.settings);
	assert.ok(snapshot.gate.locationConstants["Cuan Sound"]);
	assert.equal(snapshot.anchor.state.tideData.ukhoApiKey, undefined);
	assert.equal(snapshot.anchor.state.tideData.ukhoAccountEmail, undefined);
	assert.equal(snapshot.anchor.state.tideData.events, undefined);
	plugin.stop();
	assert.equal(app.ajrmMarinePlanningDiagnostics, undefined);
});
