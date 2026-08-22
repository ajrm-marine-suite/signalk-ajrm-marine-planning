/** Verifies Planning delegates spatial, tidal and weather data to their separate shared services. */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const createPlugin = require("../plugin/index.cjs");
const segment7b = require("./fixtures/segment-7b-reference-only.json");

const SEGMENT_7B_FIXTURE_SHA256 = "7f3d576f970fb3e8e70a9a2840169ad6971517256d8b7c8f04317268fce9184f";
const SEGMENT_7B_BLOCKERS = new Map([
	["53ae1e7e-ec00-40f7-ab23-784644740f0b",[
		"average-turn-beginnings-have-no-exact-precision",
		"named-sea-point-not-exact-turn-slack-rate-eddy-race-locus",
		"north-south-labels-not-true-bearings",
		"passage-slack-periods-not-assigned-to-individual-turns",
		"slack-placement-before-after-centred-not-stated",
		"spatially-varying-passage-rates-not-copied-to-turns",
		"rate-observations-not-exact-gate-local-per-turn",
		"flow-model-not-stated",
		"regime-interpolation-not-stated",
		"structured-publication-citation-incomplete",
		"sound-of-luing-dangers-incomplete-in-provided-photograph",
		"local-ebb-persists-after-mid-channel-flood-not-modelled",
		"tidal-race-eddy-rock-and-local-flow-hazards-not-operationally-modelled",
	]],
	["83192cc1-65da-4abc-b4ae-51c6c4ab54ad",[
		"wind-variable-turn-beginnings-have-no-exact-precision",
		"named-channel-point-not-exact-turn-slack-rate-eddy-race-overfall-locus",
		"north-west-south-east-labels-not-true-bearings",
		"clearing-line-bearings-not-current-bearings",
		"passage-slack-periods-not-assigned-to-individual-turns",
		"slack-placement-before-after-centred-not-stated",
		"passage-wide-both-direction-rates-not-copied-to-turns",
		"rate-observations-not-exact-gate-local-per-turn",
		"flow-model-not-stated",
		"regime-interpolation-not-stated",
		"structured-publication-citation-incomplete",
		"dorus-heading-directions-and-dangers-incomplete-in-provided-photographs",
		"wind-overfall-eddy-race-rock-and-confused-sea-hazards-not-operationally-modelled",
	]],
]);

function response() {
	return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function known(value) { return { state: "known", value }; }

function operationalGateRecord(locationId, referenceEvent = "HW") {
	const turns = [
		{
			id: "west-going", name: "West-going stream begins",
			direction: { label: "West-going", bearingDegreesTrue: known(270) },
			offsets: { unit: "minutes", spring: known(-105), neap: known(-60) },
			slack: { unit: "minutes", spring: { semantics: "none" }, neap: { semantics: "none" } },
		},
		{
			id: "east-going", name: "East-going stream begins",
			direction: { label: "East-going", bearingDegreesTrue: known(90) },
			offsets: { unit: "minutes", spring: known(270), neap: known(315) },
			slack: { unit: "minutes", spring: { semantics: "none" }, neap: { semantics: "none" } },
		},
	];
	return {
		contract: "ajrm-tidal-gate-constants-v2", contractVersion: 2, locationId,
		reference: { portLocationId: "oban", event: referenceEvent },
		flowModel: { kind: "sinusoidal-between-turns-v1", peakTiming: "midpoint-between-turns", zeroAtTurns: true },
		regimeInterpolation: {
			kind: "linear-reference-range-v1", rangePairing: "preceding-opposite-event", outOfRange: "unavailable",
		},
		turns,
		rateObservations: turns.flatMap((turn, turnIndex) => ["spring", "neap"].map((regime, regimeIndex) => {
			const value = 7 - turnIndex - regimeIndex;
			return {
				id: `${turn.id}-${regime}`,
				kind: "phase-peak",
				turnId: turn.id,
				regime,
				locality: { scope: "gate", locationId },
				unit: "kn",
				qualifier: "exact",
				reportedValue: known(value), lowerBound: known(value), upperBound: known(value),
			};
		})),
		provenance: { sources: [] }, review: { state: "reviewed" },
		cautions: [], hazards: [], uncertainty: [], readiness: { state: "operational", reasons: [] },
	};
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
	const gateDefinition = operationalGateRecord(gate.id);
	let gateCatalogue = {
		contract: "ajrm-tidal-gate-catalogue-v2", contractVersion: 2,
		gates: [gateDefinition], operationalLocationIds: [gate.id], diagnostics: [],
	};
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
			async getGateCatalogue() { return gateCatalogue; },
			listPorts() { return [
				{ locationId:"oban", name:"Oban", kind:"standard", referenceLevels:{ mhws:4,mhwn:2.9,mlwn:1.8,mlws:.7 }, prediction:{ mode:"provider",providerId:"ukhoTidalEvents",stationId:"0372",stationName:"Oban" } },
				{ locationId:"tobermory-location", name:"Tobermory", kind:"secondary", prediction:{ mode:"corrections",parentLocationId:"oban",corrections:{} } },
			]; },
			listGates() { return gateCatalogue.gates; },
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
	return {
		app, calls, call, plugin, directory, gate, gateDefinition,
		get gateCatalogue() { return gateCatalogue; },
		set gateCatalogue(value) { gateCatalogue = value; },
	};
}

test("gate catalogue joins v2 records to Location names and exposes the effective allow-list", async (t) => {
	const { call, gate, gateDefinition, plugin } = await fixture(t);
	const result = await call("GET", "/gate/location-constants");
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.contract, "ajrm-marine-planning-gate-catalogue-v2");
	assert.equal(result.body.contractVersion, 2);
	assert.deepEqual(result.body.operationalLocationIds, [gate.id]);
	assert.equal(result.body.gates.length, 1);
	assert.equal(result.body.gates[0].locationId, gate.id);
	assert.equal(result.body.gates[0].name, "Cuan Sound");
	assert.equal(result.body.gates[0].record.locationId, gateDefinition.locationId);
	assert.equal(result.body.gates[0].record.name, undefined);
	assert.equal(result.body.gates[0].referencePort.locationId, "oban");
	assert.equal(result.body.gates[0].referencePort.name, "Oban");
	assert.equal(result.body.gates[0].calculationReady, true);
	plugin.stop();
});

test("gate weather and tides use stable location IDs and authoritative geometry", async (t) => {
	const { calls, call, gate, plugin } = await fixture(t);
	let result = await call("GET", "/gate/weather", { query: { locationId: gate.id, days: "4", marineDays: "3" } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.locationId, gate.id);
	assert.equal(result.body.gateSelection.mode, "locationId");
	assert.equal(calls.weather[0].contextLocationId, gate.id);
	result = await call("GET", "/gate/tides", { query: { locationId: gate.id } });
	assert.equal(result.body.events[0].EventType, "HighWater");
	assert.equal(result.body.events[0].DateTime, "2026-08-18T12:00:00.000Z");
	assert.equal(result.body.referenceEvent, "HW");
	assert.deepEqual(result.body.reference, { portLocationId: "oban", event: "HW" });
	assert.equal(calls.tide[0].includeEvents, true);
	assert.equal(calls.tide[0].portId, "oban");
	assert.equal(calls.tide[0].contextLocationId, gate.id);
	plugin.stop();
});

test("gate routes retain only an exact unique legacy-name fallback", async (t) => {
	const { app, call, gate, plugin } = await fixture(t);
	let result = await call("GET", "/gate/weather", { query: { location: "Cuan Sound" } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.gateSelection.mode, "legacy-exact-name");
	assert.equal(result.body.gateSelection.locationId, gate.id);
	result = await call("GET", "/gate/weather", { query: { location: "cuan sound" } });
	assert.equal(result.statusCode, 404);
	result = await call("GET", "/gate/weather", { query: { locationId: "missing", location: "Cuan Sound" } });
	assert.equal(result.statusCode, 404);
	result = await call("GET", "/gate/weather", { query: { lat: "56.2", lon: "-5.6" } });
	assert.equal(result.statusCode, 400);
	const originalList = app.ajrmMarineLocations.list;
	app.ajrmMarineLocations.list = async (...args) => [
		...(await originalList(...args)),
		{ ...gate, id: "duplicate-gate" },
	];
	result = await call("GET", "/gate/weather", { query: { location: "Cuan Sound" } });
	assert.equal(result.statusCode, 409);
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
	let result = await call("GET", "/gate/weather", { query: { locationId: "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec" } });
	assert.equal(result.statusCode, 200);
	result = await call("GET", "/gate/tides", { query: { locationId: "0b9ecfef-3260-4f1e-a41f-5f2fdf7dfbec" } });
	assert.equal(result.statusCode, 200);
	assert.equal(calls.weather.length, 1);
	assert.equal(calls.tide.length, 1);
	plugin.stop();
});

test("gate settings persist stable IDs and reject retired provider, name and location fields", async (t) => {
	const { call, gate, plugin } = await fixture(t);
	let result = await call("POST", "/gate/settings", { body: {
		selectedGate: "Cuan Sound",
		selectedGateLocationId: gate.id,
		ukhoApiKey: "must-not-persist",
		baseTideStationName: "Wrong owner",
	} });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.selectedGate, undefined);
	assert.equal(result.body.selectedGateLocationId, gate.id);
	assert.equal(result.body.ukhoApiKey, undefined);
	assert.equal(result.body.baseTideStationName, undefined);
	result = await call("GET", "/gate/settings");
	assert.equal(result.body.selectedGateLocationId, gate.id);
	assert.equal(result.body.ukhoApiKey, undefined);
	assert.equal(result.body.baseTideStationName, undefined);
	assert.equal(result.body.fallbackCycleHours, undefined);
	result = await call("POST", "/gate/settings", { body: { selectedGateLocationId: "missing-location" } });
	assert.equal(result.statusCode, 400);
	plugin.stop();
});

test("gate tides honour an operational v2 low-water reference", async (t) => {
	const setup = await fixture(t);
	const lowWaterGate = operationalGateRecord(setup.gate.id, "LW");
	setup.gateCatalogue = {
		...setup.gateCatalogue,
		gates: [lowWaterGate],
		operationalLocationIds: [setup.gate.id],
	};
	setup.app.ajrmMarineTidalDatabase.status = async (request) => {
		setup.calls.tide.push(request);
		return {
			valid: true, station: { id: "0372", name: "Oban" },
			events: [{ type: "low", at: "2026-08-18T18:00:00.000Z", heightM: 0.8 }],
			source: { cache: "hit", fetchedAt: "2026-08-18T00:00:00.000Z" },
			freshness: { state: "fresh", staleAfterSeconds: 3600 },
		};
	};
	const result = await setup.call("GET", "/gate/tides", { query: { locationId: setup.gate.id } });
	assert.equal(result.statusCode, 200);
	assert.equal(result.body.referenceEvent, "LW");
	assert.equal(result.body.events[0].EventType, "LowWater");
	assert.equal(setup.calls.tide[0].portId, "oban");
	setup.plugin.stop();
});

test("gate tides reject records outside the effective operational allow-list", async (t) => {
	const setup = await fixture(t);
	setup.gateCatalogue = { ...setup.gateCatalogue, operationalLocationIds: [] };
	let result = await setup.call("GET", "/gate/location-constants");
	assert.deepEqual(result.body.operationalLocationIds, []);
	assert.equal(result.body.gates[0].calculationReady, false);
	assert.ok(result.body.diagnostics.planning[0].reasonCodes.includes("not-in-tidal-database-operational-allow-list"));
	result = await setup.call("GET", "/gate/tides", { query: { locationId: setup.gate.id } });
	assert.equal(result.statusCode, 409);
	assert.equal(setup.calls.tide.length, 0);
	setup.plugin.stop();
});

test("Segment 7B candidates remain blocked by the pinned Location and Tidal contracts", async (t) => {
	assert.equal(segment7b.contract,"ajrm-planning-segment-7b-cross-contract-fixture-v1");
	assert.deepEqual(segment7b.sourcePackages,{
		location:"signalk-ajrm-marine-location-editor@0.6.49",
		tidal:"signalk-ajrm-marine-tidal-database@0.1.18",
	});
	assert.deepEqual(segment7b.sourcePreservation,{
		locationPriorCount:309,
		locationPriorSha256:"108da13ca8ac25d8ceebeb0313631211aa82f4288d87502b9464d47fce068192",
		tidalPriorGateCount:30,
		tidalPriorGatesSha256:"6e677736293bcd20933e54b061663094fc1e194f47b32e38d64c6b0377edec89",
	});
	assert.equal(
		crypto.createHash("sha256").update(JSON.stringify(segment7b)).digest("hex"),
		SEGMENT_7B_FIXTURE_SHA256,
	);
	assert.equal(segment7b.catalogue.contract,"ajrm-tidal-gate-catalogue-v2");
	assert.equal(segment7b.catalogue.contractVersion,2);
	assert.deepEqual(segment7b.catalogue.operationalLocationIds,[]);
	assert.equal(segment7b.catalogue.diagnostics.contract,"ajrm-tidal-gate-catalogue-diagnostics-v1");
	assert.equal(segment7b.catalogue.diagnostics.contractVersion,1);

	const candidateIds = [...SEGMENT_7B_BLOCKERS.keys()];
	for (const locationId of candidateIds) {
		assert.equal(segment7b.locations.filter((entry) => entry.id === locationId).length,1,locationId);
		assert.equal(segment7b.catalogue.gates.filter((entry) => entry.locationId === locationId).length,1,locationId);
	}

	const setup = await fixture(t);
	setup.app.ajrmMarineLocations.list = async () => structuredClone(segment7b.locations);
	setup.app.ajrmMarineTidalDatabase.listPorts = () => structuredClone(segment7b.ports);
	setup.gateCatalogue = structuredClone(segment7b.catalogue);

	const constants = await setup.call("GET", "/gate/location-constants");
	assert.equal(constants.statusCode,200);
	assert.deepEqual(constants.body.operationalLocationIds,[]);
	assert.equal(constants.body.gates.length,2);
	for (const [locationId,reasons] of SEGMENT_7B_BLOCKERS) {
		const entry = constants.body.gates.find((candidate) => candidate.locationId === locationId);
		assert.ok(entry,locationId);
		assert.equal(entry.calculationReady,false);
		assert.deepEqual(entry.record.readiness,{ state:"reference-only",reasons });
		assert.deepEqual(entry.readiness,{ state:"reference-only",reasons });
		assert.equal(entry.referencePort.locationId,"e0e5661f-1675-4dbb-8fa0-ea8566c62ef4");
		const diagnostic = constants.body.diagnostics.planning.find((candidate) => candidate.locationId === locationId);
		assert.ok(diagnostic,locationId);
		assert.ok(diagnostic.reasonCodes.includes("gate-not-operational"),locationId);
		assert.ok(diagnostic.reasonCodes.includes("not-in-tidal-database-operational-allow-list"),locationId);

		const rejected = await setup.call("GET", "/gate/tides", { query: { locationId } });
		assert.equal(rejected.statusCode,409,locationId);
		assert.equal(rejected.body.locationId,locationId);
		assert.ok(rejected.body.reasonCodes.includes("gate-not-operational"),locationId);
		assert.ok(rejected.body.reasonCodes.includes("not-in-tidal-database-operational-allow-list"),locationId);
	}
	assert.equal(setup.calls.tide.length,0);
	setup.plugin.stop();
});

test("Planning defensively rejects unsupported interpolation and non-exact phase rates", async (t) => {
	const setup = await fixture(t);
	const unsafe = structuredClone(setup.gateDefinition);
	unsafe.regimeInterpolation.outOfRange = "clamp";
	unsafe.rateObservations[0].qualifier = "approximate";
	setup.gateCatalogue = { ...setup.gateCatalogue, gates: [unsafe] };
	const result = await setup.call("GET", "/gate/tides", { query: { locationId: setup.gate.id } });
	assert.equal(result.statusCode, 409);
	assert.ok(result.body.reasonCodes.includes("unsupported-regime-interpolation"));
	assert.ok(result.body.reasonCodes.includes("incomplete-phase-peak-rates"));
	assert.equal(setup.calls.tide.length, 0);
	setup.plugin.stop();
});

test("Planning rejects a gate whose reference port cannot join by location ID", async (t) => {
	const setup = await fixture(t);
	const missingReference = structuredClone(setup.gateDefinition);
	missingReference.reference.portLocationId = "missing-port";
	setup.gateCatalogue = { ...setup.gateCatalogue, gates: [missingReference] };
	let result = await setup.call("GET", "/gate/location-constants");
	assert.equal(result.body.gates[0].referencePort, null);
	assert.equal(result.body.gates[0].calculationReady, false);
	assert.ok(result.body.diagnostics.planning[0].reasonCodes.includes("missing-reference-port-join"));
	result = await setup.call("GET", "/gate/tides", { query: { locationId: setup.gate.id } });
	assert.equal(result.statusCode, 409);
	assert.equal(setup.calls.tide.length, 0);
	setup.plugin.stop();
});

test("raw v1 records remain visible but display-only when the catalogue API is unavailable", async (t) => {
	const setup = await fixture(t);
	const legacy = {
		contract: "ajrm-tidal-gate-constants-v1", locationId: setup.gate.id,
		standardPortRef: "/resources/locations/oban", floodSet: "W", ebbSet: "E",
		springPeakFlowKnots: 7, source: "legacy fixture",
	};
	setup.gateCatalogue = { gates: [legacy] };
	delete setup.app.ajrmMarineTidalDatabase.getGateCatalogue;
	let result = await setup.call("GET", "/gate/location-constants");
	assert.equal(result.statusCode, 200);
	assert.deepEqual(result.body.operationalLocationIds, []);
	assert.equal(result.body.gates[0].record.contract, "ajrm-tidal-gate-constants-v1");
	assert.equal(result.body.gates[0].calculationReady, false);
	assert.equal(result.body.gates[0].compatibility.mode, "raw-v1-display-only");
	assert.deepEqual(result.body.gates[0].compatibility.original, legacy);
	result = await setup.call("GET", "/gate/tides", { query: { locationId: setup.gate.id } });
	assert.equal(result.statusCode, 409);
	assert.equal(setup.calls.tide.length, 0);
	setup.plugin.stop();
});

test("saved exact gate names migrate once to stable IDs without retaining the name", async (t) => {
	const { call, directory, gate, plugin } = await fixture(t);
	const file = path.join(directory, "gate-settings.json");
	await fs.writeFile(file, JSON.stringify({ selectedGate: "Cuan Sound", speed: "6" }));
	const result = await call("GET", "/gate/settings");
	assert.equal(result.body.selectedGateLocationId, gate.id);
	assert.equal(result.body.selectionMigration.status, "migrated");
	const persisted = JSON.parse(await fs.readFile(file, "utf8"));
	assert.equal(persisted.selectedGateLocationId, gate.id);
	assert.equal(persisted.selectedGate, undefined);
	assert.equal(persisted.speed, "6");
	plugin.stop();
});

test("ambiguous saved gate names remain unresolved and are never silently selected", async (t) => {
	const { app, call, directory, gate, plugin } = await fixture(t);
	const originalList = app.ajrmMarineLocations.list;
	app.ajrmMarineLocations.list = async (...args) => [
		...(await originalList(...args)),
		{ ...gate, id: "duplicate-gate" },
	];
	const file = path.join(directory, "gate-settings.json");
	await fs.writeFile(file, JSON.stringify({ selectedGate: "Cuan Sound" }));
	const result = await call("GET", "/gate/settings");
	assert.equal(result.body.selectedGateLocationId, "");
	assert.equal(result.body.selectionMigration.status, "ambiguous");
	const persisted = JSON.parse(await fs.readFile(file, "utf8"));
	assert.equal(persisted.selectedGate, "Cuan Sound");
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
	assert.equal(snapshot.gate.locationConstants.contract, "ajrm-marine-planning-gate-catalogue-v2");
	assert.equal(snapshot.gate.locationConstants.gates[0].name, "Cuan Sound");
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
