/** Verifies Planning's read-only adapter for Location Editor secondary ports. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { secondaryPortsFromLocations, tideLocationsFromLocations } = require("../plugin/secondary-ports.cjs");

const referenceLevels = { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 };
const oban = { id: "oban", name: "Oban", types: ["tidalStandardPort"], properties: { tide: {
	providerId: "ukhoTidalEvents", stationId: "0372", stationName: "Oban", referenceLevels,
} } };
const tobermory = {
	id: "tobermory-location", name: "Tobermory", types: ["marina", "tidalSecondaryPort"],
	properties: { tide: {
		parentLocationRef: "/resources/locations/oban",
		secondaryPortCorrections: {
			contract: "ajrm-secondary-port-corrections-v4", timeOffsetPeriodMinutes: 720,
			highWaterTimeOffsets: [{ referenceTimeMinutes: 60, offsetMinutes: 20 }],
			lowWaterTimeOffsets: [{ referenceTimeMinutes: 80, offsetMinutes: 20 }],
			heightDifferencesM: { mhws: 0.5, mhwn: 0.6, mlwn: 0.1, mlws: 0.2 },
			notes: "Migrated test record",
		},
	} },
};

test("projects an Oban secondary-port location into the planner contract", () => {
	const result = secondaryPortsFromLocations([oban, tobermory]);
	assert.equal(result.length, 1);
	assert.equal(result[0].id, "tobermory-location");
	assert.equal(result[0].locationId, "tobermory-location");
	assert.equal(result[0].standardPort, "Oban");
	assert.deepEqual(result[0].hwOffsetPoints[0], { referenceTimeMinutes: 60, offsetMinutes: 20 });
	assert.equal(result[0].heightDiffs.mlws, 0.2);
	assert.deepEqual(result[0].standardReferenceLevels, referenceLevels);
});

test("excludes a secondary-port record without a linked standard-port parent", () => {
	const orphan = structuredClone(tobermory);
	orphan.id = "orphan";
	delete orphan.properties.tide.parentLocationRef;
	assert.deepEqual(secondaryPortsFromLocations([oban, orphan]), []);
});

test("projects selectable standard and secondary tide locations", () => {
	const result = tideLocationsFromLocations([oban, tobermory]);
	assert.deepEqual(result.map((entry) => [entry.kind, entry.name]), [["standard", "Oban"], ["secondary", "Tobermory"]]);
	assert.equal(result[0].standardPortLocationId, "oban");
	assert.equal(result[1].standardPortLocationId, "oban");
	assert.deepEqual(result[1].standardReferenceLevels, referenceLevels);
});

test("keeps an incomplete standard port selectable so the resolver can report its missing data", () => {
	const incomplete = { id: "new-port", name: "New standard port", types: ["tidalStandardPort"], properties: { tide: {} } };
	assert.deepEqual(tideLocationsFromLocations([incomplete]).map(({ id, stationId }) => [id, stationId]), [["new-port", null]]);
});
