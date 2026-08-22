/** Fail-closed browser helpers for the AJRM tidal-gate v2 service contract. */

export const GATE_CATALOGUE_CONTRACT = "ajrm-tidal-gate-catalogue-v2";
export const GATE_CONTRACT_V2 = "ajrm-tidal-gate-constants-v2";

const SUPPORTED_RANGE_PAIRINGS = new Set([
	"preceding-opposite-event",
	"following-opposite-event",
	"mean-adjacent-opposite-events",
]);
const SUPPORTED_SLACK_SEMANTICS = new Set([
	"total-centered-on-turn",
	"before-and-after-turn",
	"none",
]);

function object(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reason(code, message, details = {}) {
	return { code, message, ...details };
}

export function unavailable(code, message, details = {}) {
	return { available: false, reasons: [reason(code, message, details)] };
}

function knownFinite(value) {
	return object(value) && value.state === "known" && Number.isFinite(value.value);
}

function calculationGateIssues(gate) {
	const issues = [];
	const add = (code, message, path) => issues.push(reason(code, message, path ? { path } : {}));

	if (!object(gate) || gate.contract !== GATE_CONTRACT_V2 || gate.contractVersion !== 2) {
		add("gate-contract-unsupported", `Gate calculations require ${GATE_CONTRACT_V2}.`, "contract");
		return issues;
	}
	if (typeof gate.locationId !== "string" || !gate.locationId.trim()) add("gate-location-id-invalid", "The gate needs a stable Location id.", "locationId");
	if (!Number.isInteger(gate.revision) || gate.revision < 1) add("gate-revision-invalid", "The gate needs a positive durable revision.", "revision");
	if (gate.legacy) add("legacy-gate-not-operational", "A migrated v1 gate is reference-only until it has been explicitly reviewed as v2.", "legacy");
	if (gate.readiness?.state !== "operational") add("gate-readiness-not-operational", `Gate readiness is ${gate.readiness?.state || "missing"}.`, "readiness.state");
	if (gate.provenance?.review?.state !== "reviewed") add("gate-review-not-complete", "The gate has not completed structured review.", "provenance.review.state");
	if ((gate.uncertainty || []).some((entry) => entry?.blocking === true)) add("gate-blocking-uncertainty", "The gate has unresolved blocking uncertainty.", "uncertainty");
	if (gate.conventions?.offsetSign !== "positive-after-reference-event") add("gate-offset-convention-unsupported", "Offsets must explicitly be positive after the reference event.", "conventions.offsetSign");
	if (gate.conventions?.directionBearing !== "degrees-true-current-towards") add("gate-direction-convention-unsupported", "Directions must be true bearings describing where the current flows towards.", "conventions.directionBearing");
	if (!object(gate.reference) || typeof gate.reference.portLocationId !== "string" || !gate.reference.portLocationId.trim()) add("reference-port-invalid", "The gate needs a stable reference-port Location id.", "reference.portLocationId");
	if (!object(gate.reference) || !["HW", "LW"].includes(gate.reference.event)) add("reference-event-invalid", "The reference event must explicitly be HW or LW.", "reference.event");
	if (gate.flowModel?.kind !== "sinusoidal-between-turns-v1" || gate.flowModel?.peakTiming !== "midpoint-between-turns" || gate.flowModel?.zeroAtTurns !== true) add("flow-model-unsupported", "Only the explicit sinusoidal-between-turns-v1 model is supported.", "flowModel");
	if (gate.regimeInterpolation?.kind !== "linear-reference-range-v1") add("regime-interpolation-unsupported", "Only linear-reference-range-v1 interpolation is supported.", "regimeInterpolation.kind");
	if (!SUPPORTED_RANGE_PAIRINGS.has(gate.regimeInterpolation?.rangePairing)) add("range-pairing-unsupported", "The reference-range pairing rule is missing or unsupported.", "regimeInterpolation.rangePairing");
	if (gate.regimeInterpolation?.outOfRange !== "unavailable") add("out-of-range-policy-unsafe", "Out-of-range interpolation must be unavailable; clamping and extrapolation are not supported.", "regimeInterpolation.outOfRange");

	if (!Array.isArray(gate.turns) || gate.turns.length < 2) {
		add("gate-turns-incomplete", "At least two independently named turns are required.", "turns");
		return issues;
	}
	const turnIds = new Set();
	const turnNames = new Set();
	for (const [index, turn] of gate.turns.entries()) {
		const path = `turns[${index}]`;
		if (!object(turn)) {
			add("turn-invalid", "Each turn must be an object.", path);
			continue;
		}
		if (typeof turn.id !== "string" || !turn.id.trim()) add("turn-id-invalid", "Each turn needs a stable id.", `${path}.id`);
		else if (turnIds.has(turn.id)) add("turn-id-duplicate", `Turn id ${turn.id} is duplicated.`, `${path}.id`);
		else turnIds.add(turn.id);
		if (typeof turn.name !== "string" || !turn.name.trim()) add("turn-name-invalid", "Each turn needs an independent display name.", `${path}.name`);
		else if (turnNames.has(turn.name)) add("turn-name-duplicate", `Turn name ${turn.name} is duplicated.`, `${path}.name`);
		else turnNames.add(turn.name);
		if (typeof turn.direction?.label !== "string" || !turn.direction.label.trim()) add("turn-direction-label-invalid", "Each turn needs an explicit direction label.", `${path}.direction.label`);
		if (!knownFinite(turn.direction?.bearingDegreesTrue) || turn.direction.bearingDegreesTrue.value < 0 || turn.direction.bearingDegreesTrue.value >= 360) add("turn-bearing-not-known", "Each turn needs a known true current-towards bearing from 0 up to 360 degrees.", `${path}.direction.bearingDegreesTrue`);
		if (turn.offsets?.unit !== "minutes") add("turn-offset-unit-invalid", "Turn offsets must use minutes.", `${path}.offsets.unit`);
		for (const regime of ["spring", "neap"]) {
			if (!knownFinite(turn.offsets?.[regime])) add("turn-offset-not-known", `The ${regime} offset for ${turn.name || turn.id || "this turn"} is not known.`, `${path}.offsets.${regime}`);
		}
		if (turn.slack?.unit !== "minutes") add("turn-slack-unit-invalid", "Slack values must use minutes.", `${path}.slack.unit`);
		for (const regime of ["spring", "neap"]) {
			const slack = turn.slack?.[regime];
			const slackPath = `${path}.slack.${regime}`;
			if (!object(slack) || !SUPPORTED_SLACK_SEMANTICS.has(slack.semantics)) {
				add("turn-slack-not-operational", `The ${regime} slack semantics for ${turn.name || turn.id || "this turn"} are not operational.`, slackPath);
				continue;
			}
			if (slack.semantics === "total-centered-on-turn" && (!knownFinite(slack.total) || slack.total.value < 0)) add("turn-slack-not-known", "Centred total slack needs a known non-negative duration.", `${slackPath}.total`);
			if (slack.semantics === "before-and-after-turn") {
				if (!knownFinite(slack.before) || slack.before.value < 0) add("turn-slack-not-known", "Before-turn slack needs a known non-negative duration.", `${slackPath}.before`);
				if (!knownFinite(slack.after) || slack.after.value < 0) add("turn-slack-not-known", "After-turn slack needs a known non-negative duration.", `${slackPath}.after`);
			}
		}
	}
	if (!Array.isArray(gate.rateObservations)) add("rate-observations-invalid", "The gate needs an explicit rate-observation array.", "rateObservations");
	return issues;
}

/**
 * Selects a v2 gate only when Tidal Database's joined catalogue marks it
 * effectively operational. Stored readiness alone is deliberately insufficient.
 */
export function selectEffectiveOperationalGate(catalogue, gateLocationId) {
	if (!object(catalogue) || catalogue.contract !== GATE_CATALOGUE_CONTRACT || catalogue.contractVersion !== 2) {
		return unavailable("gate-catalogue-unsupported", `Gate calculations require ${GATE_CATALOGUE_CONTRACT}.`);
	}
	if (!Array.isArray(catalogue.gates) || !Array.isArray(catalogue.operationalLocationIds)) {
		return unavailable("gate-catalogue-invalid", "The gate catalogue needs gates and an effective operational Location-id allow-list.");
	}
	const locationId = typeof gateLocationId === "string" ? gateLocationId.trim() : "";
	if (!locationId) return unavailable("gate-location-id-required", "A stable gate Location id is required.");
	const matches = catalogue.gates.filter((entry) => entry?.locationId === locationId);
	if (matches.length !== 1) {
		return unavailable(matches.length ? "gate-location-id-duplicate" : "gate-not-found", matches.length ? "The catalogue contains more than one definition for this gate Location id." : "No gate definition exists for this Location id.", { gateLocationId: locationId });
	}
	const diagnosticIssues = Array.isArray(catalogue.diagnostics?.issues)
		? catalogue.diagnostics.issues.filter((entry) => entry?.locationId === null || entry?.locationId === locationId)
		: [];
	if (!catalogue.operationalLocationIds.includes(locationId)) {
		return {
			available: false,
			gate: null,
			reasons: [
				reason("gate-not-effectively-operational", "Tidal Database did not include this gate in its effective operational allow-list.", { gateLocationId: locationId }),
				...diagnosticIssues.map((entry) => reason(entry.code || "gate-catalogue-diagnostic", entry.message || "Gate catalogue diagnostic.", { severity: entry.severity || "warning", gateLocationId: locationId })),
			],
		};
	}
	if (diagnosticIssues.some((entry) => entry?.severity === "error")) {
		return unavailable("gate-catalogue-diagnostics-error", "The gate has a catalogue-integrity error despite appearing in the operational allow-list.", { gateLocationId: locationId });
	}
	const issues = calculationGateIssues(matches[0]);
	if (issues.length) return { available: false, gate: null, reasons: issues };
	return { available: true, gate: matches[0], reasons: [] };
}

function explicitTimestamp(value) {
	return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim()) && Number.isFinite(Date.parse(value));
}

function normalizeTideEvent(value, index) {
	if (!object(value)) return { error: reason("tide-event-invalid", "Each tide event must be an object.", { index }) };
	let at;
	let type;
	let heightM;
	if (Object.hasOwn(value, "at")) {
		at = value.at;
		type = value.type === "high" ? "HW" : value.type === "low" ? "LW" : null;
		heightM = value.heightM;
	} else if (Object.hasOwn(value, "DateTime")) {
		at = value.DateTime;
		type = value.EventType === "HighWater" ? "HW" : value.EventType === "LowWater" ? "LW" : null;
		heightM = value.Height;
	} else if (Object.hasOwn(value, "time")) {
		at = value.time;
		type = value.type === "HW" || value.type === "LW" ? value.type : null;
		heightM = value.height;
	}
	if (!explicitTimestamp(at)) return { error: reason("tide-event-time-invalid", "Tide event times need an explicit UTC or numeric timezone offset.", { index }) };
	if (!type) return { error: reason("tide-event-type-invalid", "Tide event type must use an explicit supported high- or low-water literal.", { index }) };
	const height = Number(heightM);
	if (!Number.isFinite(height)) return { error: reason("tide-event-height-invalid", "Tide event height must be a finite number in metres.", { index }) };
	return { event: { at: new Date(Date.parse(at)).toISOString(), type, heightM: height, index } };
}

/** Normalizes only the explicit tide-event contracts used by the suite. */
export function normalizeTideEvents(events) {
	if (!Array.isArray(events) || !events.length) return unavailable("tide-events-unavailable", "No tidal extrema are available for gate calculation.");
	const normalized = [];
	const reasons = [];
	for (const [index, value] of events.entries()) {
		const result = normalizeTideEvent(value, index);
		if (result.error) reasons.push(result.error);
		else normalized.push(result.event);
	}
	if (reasons.length) return { available: false, events: [], reasons };
	normalized.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	for (let index = 1; index < normalized.length; index += 1) {
		if (normalized[index].at === normalized[index - 1].at) {
			return { available: false, events: [], reasons: [reason("tide-event-time-duplicate", "Two tidal extrema have the same timestamp, so their ordering is ambiguous.", { at: normalized[index].at })] };
		}
	}
	return { available: true, events: normalized, reasons: [] };
}

