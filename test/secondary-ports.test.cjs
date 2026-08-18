/** Verifies Planning's read-only adapter for Location Editor secondary ports. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { secondaryPortsFromLocations, tideLocationsFromLocations } = require("../plugin/secondary-ports.cjs");

const oban = { id: "oban", name: "Oban", types: ["tidalStandardPort"] };
const tobermory = {
	id: "tobermory-location", name: "Tobermory", types: ["marina", "tidalSecondaryPort"],
	properties: { tide: {
		parentLocationRef: "/resources/locations/oban",
		secondaryPortCorrections: {
			contract: "ajrm-secondary-port-corrections-v3", timeOffsetPeriodMinutes: 720, legacyId: "tobermory",
			parentReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
			highWaterTimeOffsets: [{ referenceTimeMinutes: 60, offsetMinutes: 20 }],
			lowWaterTimeOffsets: [{ referenceTimeMinutes: 80, offsetMinutes: 20 }],
			heightDifferencesM: { mhws: 0.5, mhwn: 0.6, mlwn: 0.1, mlws: 0.2 },
			notes: "Migrated test record",
		},
	} },
};

test("projects an Oban secondary-port location into the planner contract", () => {
	const result = secondaryPortsFromLocations([oban, tobermory], { standardPortName: "Oban" });
	assert.equal(result.length, 1);
	assert.equal(result[0].id, "tobermory");
	assert.equal(result[0].locationId, "tobermory-location");
	assert.equal(result[0].standardPort, "Oban");
	assert.deepEqual(result[0].hwOffsetPoints[0], { referenceTimeMinutes: 60, offsetMinutes: 20 });
	assert.equal(result[0].heightDiffs.mlws, 0.2);
});

test("excludes corrections belonging to another standard port", () => {
	const portsmouth = structuredClone(tobermory);
	portsmouth.id = "bucklers-hard";
	portsmouth.properties.tide.secondaryPortCorrections.standardPortName = "Portsmouth";
	delete portsmouth.properties.tide.parentLocationRef;
	assert.deepEqual(secondaryPortsFromLocations([oban, portsmouth], { standardPortName: "Oban" }), []);
});

test("projects selectable standard and secondary tide locations", () => {
	const standard = { ...oban, properties: { tide: { providerId: "ukhoTidalEvents", stationId: "0372", stationName: "Oban", referenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 } } } };
	const result = tideLocationsFromLocations([standard, tobermory]);
	assert.deepEqual(result.map((entry) => [entry.kind, entry.name]), [["standard", "Oban"], ["secondary", "Tobermory"]]);
	assert.equal(result[0].standardPortLocationId, "oban");
	assert.equal(result[1].standardPortLocationId, "oban");
});
