/** Pure, bounded calculator for effectively operational tidal-gate v2 records. */

import {
	normalizeTideEvents,
	selectEffectiveOperationalGate,
} from "./gate-contract.mjs";

export const GATE_CALCULATION_CONTRACT = "ajrm-marine-planning-gate-calculation-v2";

const MINUTE_MS = 60 * 1000;

function issue(code, message, details = {}) {
	return { code, message, ...details };
}

function failedSchedule(gateLocationId, reasons, extra = {}) {
	return {
		contract: GATE_CALCULATION_CONTRACT,
		contractVersion: 2,
		available: false,
		gateLocationId: gateLocationId || null,
		turnInstances: [],
		phases: [],
		unavailableReferences: [],
		boundaryIssues: [],
		reasons: Array.isArray(reasons) ? reasons : [reasons],
		...extra,
	};
}

function knownMeasurement(value) {
	return value?.state === "known" && Number.isFinite(value.value);
}

function referenceRangeModel(referenceLevels) {
	const values = Object.fromEntries(["mhws", "mhwn", "mlwn", "mlws"].map((key) => [key, Number(referenceLevels?.[key])]));
	if (!Object.values(values).every(Number.isFinite)) {
		return { available: false, reasons: [issue("reference-levels-unavailable", "Reference levels must provide finite mhws, mhwn, mlwn and mlws values in metres.")] };
	}
	const springRangeM = values.mhws - values.mlws;
	const neapRangeM = values.mhwn - values.mlwn;
	if (!(springRangeM > neapRangeM) || neapRangeM < 0) {
		return { available: false, reasons: [issue("reference-ranges-invalid", "The explicit spring range must exceed a non-negative neap range.", { springRangeM, neapRangeM })] };
	}
	return { available: true, springRangeM, neapRangeM, levels: values, reasons: [] };
}

function pairedRange(events, referenceIndex, pairing) {
	const reference = events[referenceIndex];
	let preceding = null;
	let following = null;
	for (let index = referenceIndex - 1; index >= 0; index -= 1) {
		if (events[index].type !== reference.type) {
			preceding = events[index];
			break;
		}
	}
	for (let index = referenceIndex + 1; index < events.length; index += 1) {
		if (events[index].type !== reference.type) {
			following = events[index];
			break;
		}
	}
	const precedingRangeM = preceding ? Math.abs(reference.heightM - preceding.heightM) : null;
	const followingRangeM = following ? Math.abs(reference.heightM - following.heightM) : null;
	if (pairing === "preceding-opposite-event") {
		if (!preceding) return { available: false, reasons: [issue("preceding-opposite-event-unavailable", "No preceding opposite tidal extreme is available for the declared range pairing.", { referenceAt: reference.at })] };
		return { available: true, rangeM: precedingRangeM, precedingAt: preceding.at, followingAt: null };
	}
	if (pairing === "following-opposite-event") {
		if (!following) return { available: false, reasons: [issue("following-opposite-event-unavailable", "No following opposite tidal extreme is available for the declared range pairing.", { referenceAt: reference.at })] };
		return { available: true, rangeM: followingRangeM, precedingAt: null, followingAt: following.at };
	}
	if (pairing === "mean-adjacent-opposite-events") {
		if (!preceding || !following) return { available: false, reasons: [issue("adjacent-opposite-events-unavailable", "Both adjacent opposite tidal extrema are required for the declared mean range pairing.", { referenceAt: reference.at })] };
		return { available: true, rangeM: (precedingRangeM + followingRangeM) / 2, precedingAt: preceding.at, followingAt: following.at };
	}
	return { available: false, reasons: [issue("range-pairing-unsupported", `Range pairing ${pairing || "missing"} is unsupported.`)] };
}

function springFactorForRange(rangeM, model, referenceAt) {
	const spread = model.springRangeM - model.neapRangeM;
	const springFactor = (rangeM - model.neapRangeM) / spread;
	if (springFactor < 0 || springFactor > 1) {
		return {
			available: false,
			reasons: [issue("reference-range-out-of-range", "The observed range is outside the explicit neap-to-spring reference interval; clamping and extrapolation are disabled.", {
				referenceAt,
				rangeM,
				neapRangeM: model.neapRangeM,
				springRangeM: model.springRangeM,
			})],
		};
	}
	return { available: true, springFactor };
}

function interpolate(neap, spring, springFactor) {
	return neap + (springFactor * (spring - neap));
}

function regimeSlack(value, turn, regime) {
	const path = `turns[${turn.id}].slack.${regime}`;
	if (!value || value.semantics === "unknown" || value.semantics === "unavailable" || value.semantics === "legacy-ambiguous") {
		return { available: false, reasons: [issue("slack-not-operational", `${turn.name} has ${value?.semantics || "missing"} ${regime} slack semantics.`, { path })] };
	}
	if (value.semantics === "none") return { available: true, beforeMinutes: 0, afterMinutes: 0, semantics: "none" };
	if (value.semantics === "total-centered-on-turn") {
		if (!knownMeasurement(value.total) || value.total.value < 0) return { available: false, reasons: [issue("slack-value-not-known", `${turn.name} needs a known non-negative ${regime} centred slack duration.`, { path: `${path}.total` })] };
		return { available: true, beforeMinutes: value.total.value / 2, afterMinutes: value.total.value / 2, semantics: value.semantics };
	}
	if (value.semantics === "before-and-after-turn") {
		if (!knownMeasurement(value.before) || !knownMeasurement(value.after) || value.before.value < 0 || value.after.value < 0) return { available: false, reasons: [issue("slack-value-not-known", `${turn.name} needs known non-negative ${regime} before/after slack durations.`, { path })] };
		return { available: true, beforeMinutes: value.before.value, afterMinutes: value.after.value, semantics: value.semantics };
	}
	return { available: false, reasons: [issue("slack-semantics-unsupported", `${turn.name} uses unsupported ${regime} slack semantics.`, { path })] };
}

function turnModel(turn) {
	const reasons = [];
	for (const regime of ["spring", "neap"]) {
		if (!knownMeasurement(turn.offsets?.[regime])) reasons.push(issue("turn-offset-not-known", `${turn.name} needs a known ${regime} offset; the other regime is never copied.`, { turnId: turn.id, regime }));
	}
	const springSlack = regimeSlack(turn.slack?.spring, turn, "spring");
	const neapSlack = regimeSlack(turn.slack?.neap, turn, "neap");
	if (!springSlack.available) reasons.push(...springSlack.reasons);
	if (!neapSlack.available) reasons.push(...neapSlack.reasons);
	if (!knownMeasurement(turn.direction?.bearingDegreesTrue)) reasons.push(issue("turn-bearing-not-known", `${turn.name} needs a known true current-towards bearing.`, { turnId: turn.id }));
	return reasons.length ? { available: false, reasons } : { available: true, springSlack, neapSlack };
}

function exactGatePeakRate(gate, turn, regime) {
	const forTurnAndRegime = gate.rateObservations.filter((entry) => entry?.turnId === turn.id && entry?.regime === regime);
	const phasePeaks = forTurnAndRegime.filter((entry) => entry.kind === "phase-peak");
	const gateLocal = phasePeaks.filter((entry) => entry.locality?.scope === "gate" && entry.locality.locationId === gate.locationId);
	const usable = gateLocal.filter((entry) => entry.qualifier === "exact"
		|| (gate.calculationBasis?.mode === "operational-with-assumptions" && entry.qualifier === "approximate"));
	if (usable.length !== 1) {
		const qualifiers = [...new Set(gateLocal.map((entry) => entry.qualifier).filter(Boolean))];
		let code = usable.length > 1 ? "rate-exact-duplicate" : "rate-exact-unavailable";
		let message = usable.length > 1
			? `${turn.name} has more than one usable gate-local ${regime} phase-peak model input.`
			: `${turn.name} has no usable gate-local ${regime} phase-peak model input.`;
		if (!gateLocal.length && phasePeaks.length) {
			code = "rate-not-gate-local";
			message = `${turn.name} has ${regime} rate observations, but none applies to the whole gate Location.`;
		} else if (!usable.length && qualifiers.length) {
			code = "rate-qualifier-not-operational";
			message = `${turn.name} has only ${qualifiers.join(", ")} ${regime} rate observations; Planning does not select or reinterpret a bound.`;
		}
		return { available: false, reasons: [issue(code, message, { turnId: turn.id, regime, qualifiers })] };
	}
	const observation = usable[0];
	if (observation.unit !== "kn" || !knownMeasurement(observation.reportedValue) || !knownMeasurement(observation.lowerBound) || !knownMeasurement(observation.upperBound) || observation.reportedValue.value < 0 || observation.reportedValue.value !== observation.lowerBound.value || observation.reportedValue.value !== observation.upperBound.value) {
		return { available: false, reasons: [issue("rate-exact-invalid", `${turn.name}'s exact ${regime} rate needs equal known non-negative reported/lower/upper values in kn.`, { turnId: turn.id, regime, observationId: observation.id })] };
	}
	return { available: true, value: observation.reportedValue.value, observationId: observation.id };
}

function staticModels(gate) {
	const reasons = [];
	const models = new Map();
	for (const turn of gate.turns) {
		const turnResult = turnModel(turn);
		const springRate = exactGatePeakRate(gate, turn, "spring");
		const neapRate = exactGatePeakRate(gate, turn, "neap");
		if (!turnResult.available) reasons.push(...turnResult.reasons);
		if (!springRate.available) reasons.push(...springRate.reasons);
		if (!neapRate.available) reasons.push(...neapRate.reasons);
		if (turnResult.available && springRate.available && neapRate.available) models.set(turn.id, { ...turnResult, springRate, neapRate });
	}
	return reasons.length ? { available: false, reasons } : { available: true, models };
}

function iso(ms) {
	return new Date(ms).toISOString();
}

function instancesForReference(gate, reference, referenceSequence, springFactor, range) {
	return gate.turns.map((turn) => {
		const model = range.models.get(turn.id);
		const offsetMinutes = interpolate(turn.offsets.neap.value, turn.offsets.spring.value, springFactor);
		const beforeMinutes = interpolate(model.neapSlack.beforeMinutes, model.springSlack.beforeMinutes, springFactor);
		const afterMinutes = interpolate(model.neapSlack.afterMinutes, model.springSlack.afterMinutes, springFactor);
		const peakRateKn = interpolate(model.neapRate.value, model.springRate.value, springFactor);
		const atMs = Date.parse(reference.at) + (offsetMinutes * MINUTE_MS);
		return {
			id: `${reference.at}/${turn.id}`,
			turnId: turn.id,
			turnName: turn.name,
			at: iso(atMs),
			atMs,
			referenceSequence,
			direction: {
				label: turn.direction.label,
				bearingDegreesTrue: turn.direction.bearingDegreesTrue.value,
				convention: "current-towards",
			},
			offsetMinutes,
			peakRateKn,
			peakRateObservationIds: [model.neapRate.observationId, model.springRate.observationId],
			slack: {
				startAt: iso(atMs - (beforeMinutes * MINUTE_MS)),
				endAt: iso(atMs + (afterMinutes * MINUTE_MS)),
				beforeMinutes,
				afterMinutes,
				springSemantics: model.springSlack.semantics,
				neapSemantics: model.neapSlack.semantics,
			},
			reference: {
				at: reference.at,
				type: reference.type,
				heightM: reference.heightM,
				rangeM: range.rangeM,
				springFactor,
				pairing: gate.regimeInterpolation.rangePairing,
				precedingOppositeAt: range.precedingAt,
				followingOppositeAt: range.followingAt,
			},
		};
	});
}

function boundedPhases(instances) {
	const phases = [];
	const boundaryIssues = [];
	for (let index = 0; index < instances.length - 1; index += 1) {
		const start = instances[index];
		const end = instances[index + 1];
		if (!(end.atMs > start.atMs)) {
			return { available: false, phases: [], boundaryIssues, reasons: [issue("turn-instances-not-strictly-ordered", "Two turn instances have the same or reversed time, so no unambiguous phase can be generated.", { startId: start.id, endId: end.id })] };
		}
		if (end.referenceSequence - start.referenceSequence > 1) {
			boundaryIssues.push(issue("phase-gap-not-bridged", "A phase was not generated across an unavailable reference-event cycle.", { startAt: start.at, endAt: end.at }));
			continue;
		}
		if (start.turnId === end.turnId) {
			boundaryIssues.push(issue("same-turn-phase-not-generated", "A phase was not generated between two consecutive instances of the same named turn.", { turnId: start.turnId, startAt: start.at, endAt: end.at }));
			continue;
		}
		phases.push({
			id: `${start.id}->${end.id}`,
			turnId: start.turnId,
			turnName: start.turnName,
			startAt: start.at,
			endAt: end.at,
			durationMinutes: (end.atMs - start.atMs) / MINUTE_MS,
			direction: start.direction,
			peakRateKn: start.peakRateKn,
			model: "sinusoidal-between-turns-v1",
		});
	}
	return { available: phases.length > 0, phases, boundaryIssues, reasons: phases.length ? [] : [issue("no-bounded-phases", "No phase could be bounded by two explicit different turn instances.")] };
}

/**
 * Calculates only from a v2 gate in the catalogue's effective operational
 * allow-list. referenceLevels must be `{mhws,mhwn,mlwn,mlws}` in metres.
 */
export function calculateGateSchedule({ catalogue, gateLocationId, tideEvents, referenceLevels } = {}) {
	const selected = selectEffectiveOperationalGate(catalogue, gateLocationId);
	if (!selected.available) return failedSchedule(gateLocationId, selected.reasons);
	const gate = selected.gate;
	const ranges = referenceRangeModel(referenceLevels);
	if (!ranges.available) return failedSchedule(gateLocationId, ranges.reasons, { referencePortLocationId: gate.reference.portLocationId, referenceEvent: gate.reference.event });
	const normalized = normalizeTideEvents(tideEvents);
	if (!normalized.available) return failedSchedule(gateLocationId, normalized.reasons, { referencePortLocationId: gate.reference.portLocationId, referenceEvent: gate.reference.event });
	const models = staticModels(gate);
	if (!models.available) return failedSchedule(gateLocationId, models.reasons, { referencePortLocationId: gate.reference.portLocationId, referenceEvent: gate.reference.event });

	const referenceIndexes = normalized.events.map((event, index) => ({ event, index })).filter(({ event }) => event.type === gate.reference.event);
	if (!referenceIndexes.length) return failedSchedule(gateLocationId, [issue("reference-events-unavailable", `No ${gate.reference.event} events are available.`)], { referencePortLocationId: gate.reference.portLocationId, referenceEvent: gate.reference.event });
	const turnInstances = [];
	const unavailableReferences = [];
	for (const [referenceSequence, entry] of referenceIndexes.entries()) {
		const range = pairedRange(normalized.events, entry.index, gate.regimeInterpolation.rangePairing);
		if (!range.available) {
			unavailableReferences.push({ at: entry.event.at, type: entry.event.type, reasons: range.reasons });
			continue;
		}
		const factor = springFactorForRange(range.rangeM, ranges, entry.event.at);
		if (!factor.available) {
			unavailableReferences.push({ at: entry.event.at, type: entry.event.type, reasons: factor.reasons });
			continue;
		}
		turnInstances.push(...instancesForReference(gate, entry.event, referenceSequence, factor.springFactor, { ...range, models: models.models }));
	}
	turnInstances.sort((left, right) => left.atMs - right.atMs);
	const phases = boundedPhases(turnInstances);
	if (!phases.available) {
		const referenceReasons = unavailableReferences.flatMap((entry) => entry.reasons);
		return failedSchedule(gateLocationId, [...referenceReasons, ...phases.reasons], {
			referencePortLocationId: gate.reference.portLocationId,
			referenceEvent: gate.reference.event,
			rangePairing: gate.regimeInterpolation.rangePairing,
			unavailableReferences,
			boundaryIssues: phases.boundaryIssues,
		});
	}
	return {
		contract: GATE_CALCULATION_CONTRACT,
		contractVersion: 2,
		available: true,
		gateLocationId: gate.locationId,
		referencePortLocationId: gate.reference.portLocationId,
		referenceEvent: gate.reference.event,
		rangePairing: gate.regimeInterpolation.rangePairing,
		referenceRangesM: { spring: ranges.springRangeM, neap: ranges.neapRangeM },
		turnInstances: turnInstances.map(({ atMs, referenceSequence, ...entry }) => entry),
		phases: phases.phases,
		unavailableReferences,
		boundaryIssues: phases.boundaryIssues,
		calculationBasis: gate.calculationBasis || { mode:"reviewed-operational" },
		reasons: [],
	};
}

function explicitTime(value) {
	return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim()) && Number.isFinite(Date.parse(value));
}

/** Evaluates the supported sine model only inside an explicitly bounded phase. */
export function calculateFlowAt(scheduleOrPhases, at) {
	if (scheduleOrPhases?.available === false) return { available: false, reasons: scheduleOrPhases.reasons || [issue("gate-schedule-unavailable", "The gate schedule is unavailable.")] };
	const phases = Array.isArray(scheduleOrPhases) ? scheduleOrPhases : scheduleOrPhases?.phases;
	if (!Array.isArray(phases) || !phases.length) return { available: false, reasons: [issue("gate-phases-unavailable", "No bounded gate phases are available.")] };
	if (!explicitTime(at)) return { available: false, reasons: [issue("flow-time-invalid", "Flow evaluation needs an explicit UTC or numeric-offset timestamp.")] };
	const atMs = Date.parse(at);
	const phase = phases.find((entry) => atMs >= Date.parse(entry.startAt) && atMs < Date.parse(entry.endAt));
	if (!phase) return { available: false, reasons: [issue("flow-outside-bounded-phases", "The requested time is outside the explicitly bounded phases; no cycle is repeated and no fallback phase is invented.", { at: new Date(atMs).toISOString() })] };
	if (phase.model !== "sinusoidal-between-turns-v1" || !Number.isFinite(phase.peakRateKn) || phase.peakRateKn < 0) return { available: false, reasons: [issue("phase-model-invalid", "The bounded phase does not carry the supported explicit sine model and peak rate.")] };
	const startMs = Date.parse(phase.startAt);
	const endMs = Date.parse(phase.endAt);
	const progress = (atMs - startMs) / (endMs - startMs);
	return {
		available: true,
		phaseId: phase.id,
		turnId: phase.turnId,
		turnName: phase.turnName,
		at: new Date(atMs).toISOString(),
		progress,
		rateKn: phase.peakRateKn * Math.sin(Math.PI * progress),
		direction: phase.direction,
		reasons: [],
	};
}
