/** Verifies Anchor Force exposes only authoritative Tidal Database inputs. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../public/anchor/index.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../public/anchor/app.js"), "utf8");
const gateHtml = fs.readFileSync(path.join(__dirname, "../public/gate/index.html"), "utf8");
const gateScript = fs.readFileSync(path.join(__dirname, "../public/gate/app.js"), "utf8");
const gateStyles = fs.readFileSync(path.join(__dirname, "../public/gate/styles.css"), "utf8");
const suiteHtml = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "../plugin/index.cjs"), "utf8");
const sharedTideCurve = fs.readFileSync(path.join(__dirname, "../public/shared/tide-curve.mjs"), "utf8");
const packageMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
const releaseVersionPattern = new RegExp(packageMetadata.version.split(".").join("\\."));
const recalculateGatePlanScript = gateScript.slice(
	gateScript.indexOf("function recalculateCurrentPlan"),
	gateScript.indexOf("function settingsFromControls")
);
const refreshTidesScript = gateScript.slice(
	gateScript.indexOf("async function refreshTides"),
	gateScript.indexOf("async function refreshAll")
);
const saveGateSettingsScript = gateScript.slice(
	gateScript.indexOf("async function saveSettings"),
	gateScript.indexOf("function recalculateCurrentPlan")
);
const loadStoredGateDataScript = gateScript.slice(
	gateScript.indexOf("async function loadStoredData"),
	gateScript.indexOf('$("gate").addEventListener')
);

test("anchor tide UI selects Tidal Database ports without entered HW/LW fields", () => {
	assert.match(html, /id="tidePortSelect"/);
	assert.match(html, /id="recommendSecondaryPort"/);
	assert.doesNotMatch(html, /id="(?:hwTime|lwTime|hwHeight|lwHeight)"/);
	assert.doesNotMatch(html, /data-tide-source=/);
	assert.doesNotMatch(html, /id="tideData(?:AccountEmail|ApiKey)"/);

	const defaultInputBlock = script.match(/const defaults = \{([\s\S]*?)\n\};/)?.[1] || "";
	const defaultInputIds = [...defaultInputBlock.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((match) => match[1]);
	for (const id of defaultInputIds) {
		assert.match(html, new RegExp(`id=["']${id}["']`), `default input ${id} must exist in the Anchor Force UI`);
	}
});

test("port changes use focused APIs and do not reapply secondary corrections", () => {
	assert.match(script, /anchor\/tide-port/);
	assert.match(script, /anchor\/tide-port\/recommend/);
	assert.doesNotMatch(script, /function secondaryTideValues/);
	assert.doesNotMatch(script, /function secondaryEventFromReferencePortEvent/);
});

test("Anchor Force uses Display's shared tide-curve renderer", () => {
	assert.match(html, /id="tideGraphDays"/);
	assert.match(html, /id="tideCurve" class="ajrm-tide-curve"/);
	assert.match(html, /<script type="module" src="app\.js/);
	assert.match(script, /from "\.\.\/shared\/tide-curve\.mjs"/);
	assert.match(sharedTideCurve, /export function tideCurveSvg/);
	assert.match(sharedTideCurve, /export function attachTideCurveHover/);
	assert.doesNotMatch(script, /24 hour tide curve/);
});

test("planning webapps publish one cache-busted release and no retired standalone controls", () => {
	for (const source of [html, gateHtml, suiteHtml]) assert.match(source, releaseVersionPattern);
	assert.doesNotMatch(html, /anchor-force-planner|tideDataAccountEmail|tideDataApiKey/);
	assert.doesNotMatch(gateHtml, /gate-passage-planner|id="ukhoApiKey"|id="ukhoAccountEmail"/);
	assert.doesNotMatch(gateScript, /function (?:saveLocationConstants|addLocation|deleteLocation|defaultLocationValues)/);
	assert.doesNotMatch(gateScript, /Cuan Sound/);
});

test("Planning reads tidal contracts without owning correction calculations", () => {
	assert.match(backend, /ajrmMarineTidalDatabase/);
	assert.doesNotMatch(backend, /applySecondary|heightDifferencesM/);
	assert.doesNotMatch(gateScript, /location-constants[^\n]+method:\s*"POST"/);
});

test("tidal-gate data exposes complete verified editors and an explicit review action", () => {
	for (const id of ["gateDataDialog", "gateLocationJson", "gateRecordJson", "saveGateLocation", "saveGateRecord", "gateReviewedBy", "markGateReviewed"]) {
		assert.match(gateHtml, new RegExp(`id=["']${id}["']`));
	}
	assert.match(gateHtml, /All JSON fields are editable/);
	assert.match(gateHtml, /do not make tidal values definitive/);
	assert.match(gateScript, /class="editGateData"[\s\S]*?Edit all fields/);
	assert.match(gateScript, /locationEditorApi[\s\S]*?method: "PUT"/);
	assert.match(gateScript, /tidalDatabaseApi[\s\S]*?method: "PUT"/);
	assert.match(gateScript, /Number\(latest\.revision\) !== editingLocationRevision/);
	assert.match(gateScript, /Number\(latest\.revision\) !== editingGateRevision/);
	assert.match(gateScript, /JSON\.stringify\(verified\) !== JSON\.stringify\(result\.location\)/);
	assert.match(gateScript, /JSON\.stringify\(verified\) !== JSON\.stringify\(intended\)/);
	assert.match(gateScript, /state: "reviewed",[\s\S]*?reviewedBy,[\s\S]*?reviewedAt: new Date\(\)\.toISOString\(\)/);
	assert.match(gateScript, /Review marker recorded; this does not make the data definitive/);
	assert.match(gateScript, /value\.length > 80 \? " gateDataFieldLong"/);
	assert.match(gateStyles, /\.gateDataFieldLong\s*\{[\s\S]*?height: calc\(3 \* 1\.35em \+ 4px\);[\s\S]*?overflow-y: auto;/);
});

test("gate UI adapts the Planning v2 envelope and persists only stable Location IDs", () => {
	assert.match(gateScript, /import \{ calculateFlowAt, calculateGateSchedule \} from "\.\/gate-calculator\.mjs"/);
	assert.match(gateScript, /import \{ normalizeTideEvents \} from "\.\/gate-contract\.mjs"/);
	assert.match(gateScript, /saved\?\.contract !== "ajrm-marine-planning-gate-catalogue-v2"/);
	assert.match(gateScript, /contract:\s*"ajrm-tidal-gate-catalogue-v2"/);
	assert.match(gateScript, /gates:\s*\(gateCatalogue\?\.gates \|\| \[\]\)\.flatMap\(\(entry\) => entry\.record \? \[entry\.record\] : \[\]\)/);
	assert.match(gateScript, /operationalLocationIds:\s*gateCatalogue\?\.operationalLocationIds \|\| \[\]/);
	assert.match(gateScript, /value="\$\{escapeHtml\(entry\.locationId\)\}"/);
	assert.match(gateScript, /selectedGateLocationId:\s*appSettings\.selectedGateLocationId/);
	assert.match(gateScript, /new URLSearchParams\(\{\s*locationId:\s*gate,/);
	assert.match(gateScript, /new URLSearchParams\(\{\s*locationId:\s*settings\.gate\s*\}\)/);
	assert.match(gateScript, /let settingsWriteChain = Promise\.resolve\(\);/);
	assert.match(gateScript, /const pending = settingsWriteChain\.then\(send, send\);\s*settingsWriteChain = pending\.then/);
	assert.match(saveGateSettingsScript, /const selectedGateLocationId = \$\("gate"\)\.value;\s*const requestGeneration = gateLoadGeneration;/);
	assert.match(saveGateSettingsScript, /const settings = await response\.json\(\);\s*if \(!isCurrentGateRequest\(selectedGateLocationId, requestGeneration\)\) return;\s*appSettings =/);
	assert.doesNotMatch(gateScript, /\bselectedGate\s*:/);
});

test("gate UI preserves reviewed v2 turn, reference, slack and rate semantics", () => {
	assert.match(gateScript, /calculateGateSchedule\(\{[\s\S]*?gateLocationId:\s*settings\.gate,[\s\S]*?tideEvents:\s*currentTideEvents,[\s\S]*?referenceLevels:\s*entry\.referencePort\?\.referenceLevels/);
	assert.match(gateScript, /const flow = calculateFlowAt\(schedule, at\);[\s\S]*?if \(!flow\.available\) continue;/);
	assert.match(gateScript, /turn\.turnName/);
	assert.match(gateScript, /turn\.direction\.label/);
	assert.match(gateScript, /currentGateSchedule\.referenceEvent/);
	assert.match(gateHtml, /declared HW\/LW reference/);
	assert.match(gateHtml, /independent turn semantics/);
	assert.match(gateHtml, /Known modelled rates below this value are labelled near slack without changing their value or direction/);
	assert.doesNotMatch(gateScript, /\b(?:fallbackCycleHours|fallbackEbbHours|peakEbbOffsetMinutes|peakFlowMinimumKn)\b/);
	assert.doesNotMatch(gateHtml, /id="(?:fallbackCycleHours|fallbackEbbHours|peakEbbOffsetMinutes|peakFlowMinimumKn)"/);
	assert.doesNotMatch(gateScript, /function (?:calculateSineRate|durationToMinutes|interpolateMinutes|interpolateNumber)/);
	assert.doesNotMatch(gateScript, /\b(?:flood|ebb)\b/i);
	assert.doesNotMatch(gateScript, /tideRate\s*=\s*0|tideDir\s*=\s*["']-["']/);
});

test("gate UI keeps reference records selectable while calculations fail closed", () => {
	assert.match(gateScript, /const active = locationConstants\[selected\] \? selected : "";/);
	assert.match(gateScript, /const placeholder = entries\.length \? "Select a tidal gate" : "No tidal-gate records";/);
	assert.doesNotMatch(gateScript, /\$\{ready \? "" : " disabled"\}/);
	assert.match(gateScript, /\$\{entry\.location} \(\$\{entry\.readiness}\)/);
	assert.match(gateScript, /locationConstants\[settings\.selectedGateLocationId\]\) \$\("gate"\)\.value = settings\.selectedGateLocationId;/);
	assert.match(gateScript, /\$\{settings\.gateName} is selected\. Its sourced location, turn labels, cautions, hazards and uncertainty are available for inspection/);
	assert.match(gateScript, /selectedEntry\?\.calculationReady \? "" : " — reference data"/);
	assert.match(gateScript, /automatic tide-stream calculation is unavailable until its tidal-gate record is operational/);
	assert.match(gateScript, /compatibility:\s*entry\.compatibility\?\.mode \|\| "native-v2"/);
	assert.match(gateScript, /let gateLoadGeneration = 0;/);
	assert.match(gateScript, /function isCurrentGateRequest\(gateLocationId, generation\) \{\s*return \$\("gate"\)\.value === gateLocationId && generation === gateLoadGeneration;/);
	assert.match(refreshTidesScript, /if \(!isCurrentGateRequest\(settings\.gate, requestGeneration\)\) return \{ ok: false, stale: true, warning: "" \};/);
	assert.match(refreshTidesScript, /currentTideEvents = null;[\s\S]*?currentGateSchedule = null;[\s\S]*?clearCalculatedViews\(\);[\s\S]*?renderReadOnlyTable\("fetchedTideTable", \[fetchedTideColumns\]/);
	assert.match(recalculateGatePlanScript, /if \(!currentWeatherRows \|\| !currentGateSchedule\?\.available\) \{\s*clearCalculatedViews\(\);[\s\S]*?return;/);
	assert.match(recalculateGatePlanScript, /if \(rows\.length < 2\) \{\s*clearCalculatedViews\(\);/);
	assert.match(loadStoredGateDataScript, /const requestGeneration = \+\+gateLoadGeneration;/);
	assert.match(loadStoredGateDataScript, /currentTideEvents = null;[\s\S]*?clearCalculatedViews\(\);[\s\S]*?renderReadOnlyTable\("weatherDataTable", \[fetchedWeatherColumns\][\s\S]*?renderReadOnlyTable\("fetchedTideTable", \[fetchedTideColumns\][\s\S]*?if \(!settings\.gate \|\| !selectedEntry\?\.calculationReady\)/);
	assert.match(loadStoredGateDataScript, /await loadWeatherForGate\(settings, \{ requestGeneration \}\);\s*if \(!isCurrentGateRequest\(settings\.gate, requestGeneration\)\) return;[\s\S]*?await refreshTides\(\{[^}]*requestGeneration \}\);\s*if \(!isCurrentGateRequest\(settings\.gate, requestGeneration\)\) return;/);
});
