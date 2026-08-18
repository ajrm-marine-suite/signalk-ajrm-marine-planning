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
	};
	const oban = { id: "oban", name: "Oban", types: ["tidalStandardPort"] };
	const secondaryPort = {
		id: "tobermory-location", name: "Tobermory", types: ["tidalSecondaryPort"],
		properties: { tide: {
			parentLocationRef: "/resources/locations/oban",
			secondaryPortCorrections: {
				contract: "ajrm-secondary-port-corrections-v1", legacyId: "tobermory",
				standardReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
				hwTimeOffsetsMinutes: { t0000: 20, t0600: 20, t1200: 20, t1800: 20 },
				lwTimeOffsetsMinutes: { t0000: 20, t0600: 20, t1200: 20, t1800: 20 },
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
	const app = {
		getDataDirPath: () => directory, setPluginStatus() {}, handleMessage() {},
		ajrmMarineLocations: { contract: "ajrm-marine-locations-service-v1", async list() { return [gate, oban, secondaryPort]; } },
		ajrmMarineTides: {
			contract: "ajrm-marine-tides-service-v1",
			configured: true,
			async status(value) { calls.tide.push(value); return tideResult; },
			async refresh(value) { calls.tide.push(value); return tideResult; },
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
	const result = await call("GET", "/anchor/state");
	assert.equal(result.body.tideData.ukhoApiKey, undefined);
	assert.equal(result.body.tideData.managedBy, "AJRM Marine Location Editor");
	assert.equal(result.body.tideData.events[0].Height, 3.2);
	assert.equal(result.body.tideData.events[0].DateTime, "2026-08-18T12:00:00.000Z");
	assert.equal(result.body.secondaryPorts[0].id, "tobermory");
	assert.equal(result.body.secondaryPorts[0].locationId, "tobermory-location");
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
	assert.deepEqual(result.body.secondaryPorts.map((port) => port.id), ["tobermory"]);
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
