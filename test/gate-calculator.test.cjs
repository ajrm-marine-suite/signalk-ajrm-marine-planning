/** Focused safety tests for the pure browser tidal-gate v2 calculator. */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

let contract;
let calculator;

test.before(async () => {
	contract = await import(pathToFileURL(path.join(__dirname, "..", "public", "gate", "gate-contract.mjs")).href);
	calculator = await import(pathToFileURL(path.join(__dirname, "..", "public", "gate", "gate-calculator.mjs")).href);
});

const known = (value) => ({ state: "known", value, sourceIds: ["source-1"] });

function operationalGate(overrides = {}) {
	const turns = [
		{
			id: "west-going",
			name: "West-going stream begins",
			label: "West-going",
			bearing: 270,
			springOffset: 120,
			neapOffset: 60,
			springSlack: { semantics: "total-centered-on-turn", total: known(20) },
			neapSlack: { semantics: "total-centered-on-turn", total: known(10) },
			springRate: 4,
			neapRate: 2,
		},
		{
			id: "east-going",
			name: "East-going stream begins",
			label: "East-going",
			bearing: 90,
			springOffset: 360,
			neapOffset: 300,
			springSlack: { semantics: "before-and-after-turn", before: known(12), after: known(18) },
			neapSlack: { semantics: "before-and-after-turn", before: known(4), after: known(6) },
			springRate: 6,
			neapRate: 3,
		},
	];
	return {
		contract: "ajrm-tidal-gate-constants-v2",
		contractVersion: 2,
		revision: 1,
		locationId: "gate-1",
		conventions: {
			offsetSign: "positive-after-reference-event",
			directionBearing: "degrees-true-current-towards",
		},
		reference: { portLocationId: "port-1", event: "HW", sourceIds: ["source-1"] },
		flowModel: { kind: "sinusoidal-between-turns-v1", peakTiming: "midpoint-between-turns", zeroAtTurns: true },
		regimeInterpolation: { kind: "linear-reference-range-v1", rangePairing: "preceding-opposite-event", outOfRange: "unavailable" },
		turns: turns.map((entry) => ({
			id: entry.id,
			name: entry.name,
			direction: { label: entry.label, bearingDegreesTrue: known(entry.bearing) },
			offsets: { unit: "minutes", spring: known(entry.springOffset), neap: known(entry.neapOffset) },
			slack: { unit: "minutes", spring: entry.springSlack, neap: entry.neapSlack },
		})),
		rateObservations: turns.flatMap((entry) => [["spring", entry.springRate], ["neap", entry.neapRate]].map(([regime, value]) => ({
			id: `${entry.id}-${regime}`,
			kind: "phase-peak",
			turnId: entry.id,
			regime,
			locality: { scope: "gate", locationId: "gate-1" },
			unit: "kn",
			qualifier: "exact",
			reportedValue: known(value),
			lowerBound: known(value),
			upperBound: known(value),
		}))),
		provenance: {
			sources: [{ id: "source-1", kind: "pilot-book", title: "Synthetic test publication", publisher: "Test", edition: "2026", page: "1", imageRef: "test-image", url: null, retrievedAt: "2026-08-22T12:00:00.000Z" }],
			review: { state: "reviewed", reviewedBy: "Test reviewer", reviewedAt: "2026-08-22T13:00:00.000Z", notes: null },
		},
		cautions: [],
		hazards: [],
		uncertainty: [],
		readiness: { state: "operational", reasons: [] },
		...overrides,
	};
}

function catalogue(gate = operationalGate(), operationalLocationIds = ["gate-1"]) {
	return {
		contract: "ajrm-tidal-gate-catalogue-v2",
		contractVersion: 2,
		gates: [gate],
		operationalLocationIds,
		diagnostics: { issues: [] },
	};
}

const referenceLevels = { mhws: 4, mhwn: 3, mlwn: 1, mlws: 0 };

function tideEvents() {
	return [
		{ at: "2026-08-22T00:00:00.000Z", type: "low", heightM: 1 },
		{ at: "2026-08-22T06:00:00.000Z", type: "high", heightM: 4 },
		{ at: "2026-08-22T12:00:00.000Z", type: "low", heightM: 0 },
		{ at: "2026-08-22T18:00:00.000Z", type: "high", heightM: 3 },
		{ at: "2026-08-23T00:00:00.000Z", type: "low", heightM: 1 },
	];
}

function schedule(gate = operationalGate(), events = tideEvents(), levels = referenceLevels) {
	return calculator.calculateGateSchedule({ catalogue: catalogue(gate), gateLocationId: "gate-1", tideEvents: events, referenceLevels: levels });
}

function codes(result) {
	return result.reasons.map((entry) => entry.code);
}

test("selection requires the computed effective operational allow-list and rejects v1", () => {
	let result = contract.selectEffectiveOperationalGate(catalogue(operationalGate(), []), "gate-1");
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("gate-not-effectively-operational"));
	const legacy = { contract: "ajrm-tidal-gate-constants-v1", locationId: "gate-1" };
	result = contract.selectEffectiveOperationalGate(catalogue(legacy), "gate-1");
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("gate-contract-unsupported"));
});

test("tide event normalization accepts only explicit suite shapes and timezone-bearing times", () => {
	let result = contract.normalizeTideEvents([
		{ DateTime: "2026-08-22T06:00:00Z", EventType: "HighWater", Height: 4 },
		{ time: "2026-08-22T12:00:00+00:00", type: "LW", height: 1 },
	]);
	assert.equal(result.available, true);
	assert.deepEqual(result.events.map((entry) => entry.type), ["HW", "LW"]);
	result = contract.normalizeTideEvents([{ time: "2026-08-22 06:00", type: "HW", height: 4 }]);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("tide-event-time-invalid"));
});

test("HW reference, named turns, current-towards bearings and both slack shapes are honoured", () => {
	const result = schedule();
	assert.equal(result.available, true);
	assert.equal(result.referenceEvent, "HW");
	assert.equal(result.referencePortLocationId, "port-1");
	const firstWest = result.turnInstances.find((entry) => entry.reference.at === "2026-08-22T06:00:00.000Z" && entry.turnId === "west-going");
	const firstEast = result.turnInstances.find((entry) => entry.reference.at === "2026-08-22T06:00:00.000Z" && entry.turnId === "east-going");
	assert.equal(firstWest.turnName, "West-going stream begins");
	assert.equal(firstWest.at, "2026-08-22T07:30:00.000Z");
	assert.equal(firstWest.direction.bearingDegreesTrue, 270);
	assert.equal(firstWest.direction.convention, "current-towards");
	assert.equal(firstWest.peakRateKn, 3);
	assert.equal(firstWest.slack.beforeMinutes, 7.5);
	assert.equal(firstWest.slack.afterMinutes, 7.5);
	assert.equal(firstEast.slack.beforeMinutes, 8);
	assert.equal(firstEast.slack.afterMinutes, 12);
});

test("LW references are used independently of high-water events", () => {
	const gate = operationalGate({ reference: { portLocationId: "port-1", event: "LW", sourceIds: ["source-1"] } });
	const result = schedule(gate);
	assert.equal(result.available, true);
	assert.equal(result.referenceEvent, "LW");
	assert.ok(result.turnInstances.length > 0);
	assert.ok(result.turnInstances.every((entry) => entry.reference.type === "LW"));
	const springWest = result.turnInstances.find((entry) => entry.reference.at === "2026-08-22T12:00:00.000Z" && entry.turnId === "west-going");
	assert.equal(springWest.reference.springFactor, 1);
	assert.equal(springWest.at, "2026-08-22T14:00:00.000Z");
});

test("the three explicit range-pairing rules produce distinct interpolation factors", () => {
	const factors = {};
	for (const pairing of ["preceding-opposite-event", "following-opposite-event", "mean-adjacent-opposite-events"]) {
		const base = operationalGate();
		base.regimeInterpolation.rangePairing = pairing;
		const result = schedule(base);
		assert.equal(result.available, true);
		factors[pairing] = result.turnInstances.find((entry) => entry.reference.at === "2026-08-22T06:00:00.000Z").reference.springFactor;
	}
	assert.deepEqual(factors, {
		"preceding-opposite-event": 0.5,
		"following-opposite-event": 1,
		"mean-adjacent-opposite-events": 0.75,
	});
});

test("out-of-range reference ranges are unavailable and are never clamped or extrapolated", () => {
	const events = [
		{ at: "2026-08-22T00:00:00Z", type: "low", heightM: -1 },
		{ at: "2026-08-22T06:00:00Z", type: "high", heightM: 4 },
		{ at: "2026-08-22T12:00:00Z", type: "low", heightM: 0 },
	];
	const result = schedule(operationalGate(), events);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("reference-range-out-of-range"));
	assert.equal(result.turnInstances.length, 0);
});

test("unknown timing and slack never copy the other regime or become zero", () => {
	let gate = operationalGate();
	gate.turns[0].offsets.neap = { state: "unknown", reason: "not stated" };
	let result = schedule(gate);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("turn-offset-not-known"));
	gate = operationalGate();
	gate.turns[0].slack.neap = { semantics: "unknown", reason: "not stated" };
	result = schedule(gate);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("turn-slack-not-operational"));
});

test("explicit none slack is the only non-numeric slack that becomes a zero window", () => {
	const gate = operationalGate();
	gate.turns[0].slack.spring = { semantics: "none" };
	gate.turns[0].slack.neap = { semantics: "none" };
	const result = schedule(gate);
	assert.equal(result.available, true);
	const turn = result.turnInstances.find((entry) => entry.turnId === "west-going");
	assert.equal(turn.slack.beforeMinutes, 0);
	assert.equal(turn.slack.afterMinutes, 0);
	assert.equal(turn.slack.startAt, turn.at);
	assert.equal(turn.slack.endAt, turn.at);
});

test("only exact gate-local turn-specific phase-peak rates are used", () => {
	for (const qualifier of ["approximate", "range", "up-to", "more-than", "unknown"]) {
		const gate = operationalGate();
		const rate = gate.rateObservations.find((entry) => entry.id === "west-going-spring");
		rate.qualifier = qualifier;
		if (qualifier === "range") {
			rate.reportedValue = known(4);
			rate.lowerBound = known(3);
			rate.upperBound = known(5);
		} else if (qualifier === "up-to") {
			rate.lowerBound = { state: "unknown" };
		} else if (qualifier === "more-than") {
			rate.upperBound = { state: "unknown" };
		} else if (qualifier === "unknown") {
			rate.reportedValue = { state: "unknown" };
			rate.lowerBound = { state: "unknown" };
			rate.upperBound = { state: "unknown" };
		}
		const result = schedule(gate);
		assert.equal(result.available, false, qualifier);
		assert.ok(codes(result).includes("rate-qualifier-not-operational"), qualifier);
	}
	let gate = operationalGate();
	gate.rateObservations.find((entry) => entry.id === "west-going-spring").locality = { scope: "named", label: "Narrows" };
	let result = schedule(gate);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("rate-not-gate-local"));
	gate = operationalGate();
	gate.rateObservations = gate.rateObservations.filter((entry) => entry.id !== "west-going-neap");
	result = schedule(gate);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("rate-exact-unavailable"));
});

test("duplicate exact rates are unavailable rather than arbitrarily selected", () => {
	const gate = operationalGate();
	const duplicate = structuredClone(gate.rateObservations.find((entry) => entry.id === "west-going-spring"));
	duplicate.id = "duplicate-west-spring";
	gate.rateObservations.push(duplicate);
	const result = schedule(gate);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("rate-exact-duplicate"));
});

test("supported sine phases are bounded by real turn instances and never repeat a fallback cycle", () => {
	const result = schedule();
	assert.equal(result.available, true);
	assert.equal(result.phases.length, result.turnInstances.length - 1);
	const first = result.phases[0];
	assert.equal(first.startAt, "2026-08-22T07:30:00.000Z");
	assert.equal(first.endAt, "2026-08-22T11:30:00.000Z");
	let flow = calculator.calculateFlowAt(result, first.startAt);
	assert.equal(flow.available, true);
	assert.ok(Math.abs(flow.rateKn) < 1e-12);
	flow = calculator.calculateFlowAt(result, "2026-08-22T09:30:00.000Z");
	assert.equal(flow.available, true);
	assert.ok(Math.abs(flow.rateKn - 3) < 1e-12);
	assert.equal(flow.direction.bearingDegreesTrue, 270);
	flow = calculator.calculateFlowAt(result, "2026-08-23T01:00:00.000Z");
	assert.equal(flow.available, false);
	assert.ok(codes(flow).includes("flow-outside-bounded-phases"));
});

test("referenceLevels are explicit lower-case metre levels and invalid models fail closed", () => {
	let result = schedule(operationalGate(), tideEvents(), { MHWS: 4, MHWN: 3, MLWN: 1, MLWS: 0 });
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("reference-levels-unavailable"));
	const gate = operationalGate();
	gate.regimeInterpolation.outOfRange = "clamp";
	result = schedule(gate);
	assert.equal(result.available, false);
	assert.ok(codes(result).includes("out-of-range-policy-unsafe"));
});

