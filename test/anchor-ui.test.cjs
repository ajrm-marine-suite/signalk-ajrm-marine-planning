/** Verifies Anchor Force exposes only authoritative Location Editor tide inputs. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../public/anchor/index.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../public/anchor/app.js"), "utf8");
const gateHtml = fs.readFileSync(path.join(__dirname, "../public/gate/index.html"), "utf8");
const gateScript = fs.readFileSync(path.join(__dirname, "../public/gate/app.js"), "utf8");
const suiteHtml = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const adapter = fs.readFileSync(path.join(__dirname, "../plugin/secondary-ports.cjs"), "utf8");

test("anchor tide UI selects Location Editor ports without entered HW/LW fields", () => {
	assert.match(html, /id="tidePortSelect"/);
	assert.match(html, /id="recommendSecondaryPort"/);
	assert.doesNotMatch(html, /id="(?:hwTime|lwTime|hwHeight|lwHeight)"/);
	assert.doesNotMatch(html, /data-tide-source=/);
	assert.doesNotMatch(html, /id="tideData(?:AccountEmail|ApiKey)"/);
});

test("port changes use focused APIs and do not reapply secondary corrections", () => {
	assert.match(script, /anchor\/tide-port/);
	assert.match(script, /anchor\/tide-port\/recommend/);
	assert.doesNotMatch(script, /function secondaryTideValues/);
	assert.doesNotMatch(script, /function secondaryEventFromReferencePortEvent/);
});

test("planning webapps publish one cache-busted release and no retired standalone controls", () => {
	for (const source of [html, gateHtml, suiteHtml]) assert.match(source, /0\.5\.9/);
	assert.doesNotMatch(html, /anchor-force-planner|tideDataAccountEmail|tideDataApiKey/);
	assert.doesNotMatch(gateHtml, /gate-passage-planner|id="ukhoApiKey"|id="ukhoAccountEmail"/);
	assert.doesNotMatch(gateScript, /function (?:saveLocationConstants|addLocation|deleteLocation|defaultLocationValues)/);
	assert.doesNotMatch(gateScript, /Cuan Sound/);
});

test("Location Editor is the sole owner of current planning location contracts", () => {
	assert.match(adapter, /ajrm-secondary-port-corrections-v4/);
	assert.doesNotMatch(adapter, /ajrm-secondary-port-corrections-v[123]/);
	assert.doesNotMatch(gateScript, /location-constants[^\n]+method:\s*"POST"/);
});
