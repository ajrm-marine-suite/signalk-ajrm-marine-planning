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

function copyGroup(value, keys) {
	return Object.fromEntries(keys.map((key) => [key, Number(value?.[key])]));
}

function normalize(value) {
	return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

module.exports = { CORRECTION_CONTRACT, secondaryPortsFromLocations };
