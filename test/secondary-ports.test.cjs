/** Verifies Planning's read-only adapter for Location Editor secondary ports. */

const assert = require("node:assert/strict");
const test = require("node:test");
const { secondaryPortsFromLocations } = require("../plugin/secondary-ports.cjs");

const oban = { id: "oban", name: "Oban", types: ["tidalStandardPort"] };
const tobermory = {
	id: "tobermory-location", name: "Tobermory", types: ["marina", "tidalSecondaryPort"],
	properties: { tide: {
		parentLocationRef: "/resources/locations/oban",
		secondaryPortCorrections: {
			contract: "ajrm-secondary-port-corrections-v1", legacyId: "tobermory",
			standardReferenceLevels: { mhws: 4, mhwn: 2.9, mlwn: 1.8, mlws: 0.7 },
			hwTimeOffsetsMinutes: { t0000: 20, t0600: 20, t1200: 20, t1800: 20 },
			lwTimeOffsetsMinutes: { t0000: 20, t0600: 20, t1200: 20, t1800: 20 },
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
	assert.equal(result[0].hwOffsets.t0600, 20);
	assert.equal(result[0].heightDiffs.mlws, 0.2);
});

test("excludes corrections belonging to another standard port", () => {
	const portsmouth = structuredClone(tobermory);
	portsmouth.id = "bucklers-hard";
	portsmouth.properties.tide.secondaryPortCorrections.standardPortName = "Portsmouth";
	delete portsmouth.properties.tide.parentLocationRef;
	assert.deepEqual(secondaryPortsFromLocations([oban, portsmouth], { standardPortName: "Oban" }), []);
});
