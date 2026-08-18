/**
 * Adapts Location Editor's authoritative, versioned secondary-port records to
 * the compact correction-table shape consumed by the Anchor Force Planner.
 * Planning deliberately does not persist or edit this data.
 */

const CORRECTION_CONTRACT = "ajrm-secondary-port-corrections-v1";

function secondaryPortsFromLocations(locations, options = {}) {
	const values = Array.isArray(locations) ? locations : [];
	const byId = new Map(values.map((location) => [location?.id, location]));
	const wantedStandardPort = normalize(options.standardPortName || "");

	return values.flatMap((location) => {
		if (!Array.isArray(location?.types) || !location.types.includes("tidalSecondaryPort")) return [];
		const tide = location?.properties?.tide;
		const correction = tide?.secondaryPortCorrections;
		if (correction?.contract !== CORRECTION_CONTRACT) return [];
		const parentId = String(tide?.parentLocationRef || "").replace(/^\/resources\/locations\//, "");
		const parent = byId.get(parentId);
		const standardPort = String(correction.standardPortName || parent?.name || "").trim();
		if (wantedStandardPort && normalize(standardPort) !== wantedStandardPort) return [];

		return [{
			id: String(correction.legacyId || location.id),
			locationId: location.id,
			name: location.name,
			standardPort,
			standardReferenceLevels: correction.standardReferenceLevels || null,
			hwOffsets: copyGroup(correction.hwTimeOffsetsMinutes, ["t0000", "t0600", "t1200", "t1800"]),
			lwOffsets: copyGroup(correction.lwTimeOffsetsMinutes, ["t0000", "t0600", "t1200", "t1800"]),
			heightDiffs: copyGroup(correction.heightDifferencesM, ["mhws", "mhwn", "mlwn", "mlws"]),
			notes: String(correction.notes || ""),
		}];
	}).sort((left, right) => left.name.localeCompare(right.name));
}

function tideLocationsFromLocations(locations) {
	const values = Array.isArray(locations) ? locations : [];
	const standards = values.flatMap((location) => {
		if (!location?.types?.includes("tidalStandardPort")) return [];
		const tide = location.properties?.tide || {};
		if (!tide.providerId || !tide.stationId) return [];
		return [{
			id: location.id,
			locationId: location.id,
			standardPortLocationId: location.id,
			kind: "standard",
			name: tide.stationName || location.name,
			standardPort: tide.stationName || location.name,
			stationId: tide.stationId,
			standardReferenceLevels: tide.referenceLevels || null,
			hwOffsets: zeroGroup(["t0000", "t0600", "t1200", "t1800"]),
			lwOffsets: zeroGroup(["t0000", "t0600", "t1200", "t1800"]),
			heightDiffs: zeroGroup(["mhws", "mhwn", "mlwn", "mlws"]),
			notes: "Standard prediction port maintained by AJRM Marine Location Editor.",
		}];
	});
	const secondaries = secondaryPortsFromLocations(values).flatMap((port) => {
		const location = values.find((entry) => entry.id === port.locationId);
		const parentId = String(location?.properties?.tide?.parentLocationRef || "").split("/").at(-1);
		const parent = values.find((entry) => entry.id === parentId);
		if (!parent?.properties?.tide?.providerId || !parent.properties.tide.stationId) return [];
		return [{
			...port,
			kind: "secondary",
			standardPortLocationId: parent?.id || null,
			stationId: parent?.properties?.tide?.stationId || null,
		}];
	});
	return [...standards, ...secondaries].sort((left, right) => left.name.localeCompare(right.name));
}

function copyGroup(value, keys) {
	return Object.fromEntries(keys.map((key) => [key, Number(value?.[key])]));
}

function zeroGroup(keys) { return Object.fromEntries(keys.map((key) => [key, 0])); }

function normalize(value) {
	return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

module.exports = { CORRECTION_CONTRACT, secondaryPortsFromLocations, tideLocationsFromLocations };
