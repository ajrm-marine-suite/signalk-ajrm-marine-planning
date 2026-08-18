/**
 * Projects Location Editor's current standard- and secondary-port catalogue
 * into the compact, read-only shape consumed by the Anchor Force Planner.
 * Planning deliberately neither owns nor edits tidal-location data.
 */

const CORRECTION_CONTRACT = "ajrm-secondary-port-corrections-v4";
const LOCATION_REF_PREFIX = "/resources/locations/";

function referenceId(reference) {
	const value = String(reference || "");
	return value.startsWith(LOCATION_REF_PREFIX) ? value.slice(LOCATION_REF_PREFIX.length) : "";
}

function secondaryPortsFromLocations(locations) {
	const values = Array.isArray(locations) ? locations : [];
	const byId = new Map(values.map((location) => [location?.id, location]));

	return values.flatMap((location) => {
		if (!Array.isArray(location?.types) || !location.types.includes("tidalSecondaryPort")) return [];
		const tide = location?.properties?.tide;
		const correction = tide?.secondaryPortCorrections;
		if (correction?.contract !== CORRECTION_CONTRACT) return [];
		const parentId = referenceId(tide?.parentLocationRef);
		const parent = byId.get(parentId);
		if (!parent?.types?.includes("tidalStandardPort")) return [];
		const standardPort = String(parent.properties?.tide?.stationName || parent.name || "").trim();

		return [{
			id: location.id,
			locationId: location.id,
			name: location.name,
			standardPort,
			standardPortLocationId: parent.id,
			stationId: parent.properties?.tide?.stationId || null,
			standardReferenceLevels: parent.properties?.tide?.referenceLevels || null,
			hwOffsetPoints: copyPoints(correction.highWaterTimeOffsets),
			lwOffsetPoints: copyPoints(correction.lowWaterTimeOffsets),
			heightDiffs: copyGroup(correction.heightDifferencesM, ["mhws", "mhwn", "mlwn", "mlws"]),
			notes: String(correction.notes || ""),
		}];
	}).sort((left, right) => left.name.localeCompare(right.name));
}

function tideLocationsFromLocations(locations) {
	const values = Array.isArray(locations) ? locations : [];
	const byId = new Map(values.map((location) => [location?.id, location]));
	const standards = values.flatMap((location) => {
		if (!location?.types?.includes("tidalStandardPort")) return [];
		const tide = location.properties?.tide || {};
		return [{
			id: location.id,
			locationId: location.id,
			standardPortLocationId: location.id,
			kind: "standard",
			name: tide.stationName || location.name,
			standardPort: tide.stationName || location.name,
			stationId: tide.stationId || null,
			standardReferenceLevels: tide.referenceLevels || null,
			hwOffsetPoints: [{ referenceTimeMinutes: 0, offsetMinutes: 0 }],
			lwOffsetPoints: [{ referenceTimeMinutes: 0, offsetMinutes: 0 }],
			heightDiffs: zeroGroup(["mhws", "mhwn", "mlwn", "mlws"]),
			notes: "Standard prediction port maintained by AJRM Marine Location Editor.",
		}];
	});
	const secondaries = secondaryPortsFromLocations(values).flatMap((port) => {
		const parent = byId.get(port.standardPortLocationId);
		if (!parent) return [];
		return [{
			...port,
			kind: "secondary",
			standardPortLocationId: parent.id,
			stationId: parent.properties?.tide?.stationId || null,
			standardReferenceLevels: parent.properties?.tide?.referenceLevels || null,
		}];
	});
	return [...standards, ...secondaries].sort((left, right) => left.name.localeCompare(right.name));
}

function copyGroup(value, keys) {
	return Object.fromEntries(keys.map((key) => [key, Number(value?.[key])]));
}

function copyPoints(value) {
	return (Array.isArray(value) ? value : []).map((point) => ({
		referenceTimeMinutes: Number(point.referenceTimeMinutes),
		offsetMinutes: Number(point.offsetMinutes),
	}));
}

function zeroGroup(keys) { return Object.fromEntries(keys.map((key) => [key, 0])); }

module.exports = { CORRECTION_CONTRACT, secondaryPortsFromLocations, tideLocationsFromLocations };
