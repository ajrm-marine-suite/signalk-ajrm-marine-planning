/** Verifies Anchor Force exposes only authoritative Tidal Database inputs. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../public/anchor/index.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../public/anchor/app.js"), "utf8");
const gateHtml = fs.readFileSync(path.join(__dirname, "../public/gate/index.html"), "utf8");
const gateScript = fs.readFileSync(path.join(__dirname, "../public/gate/app.js"), "utf8");
const suiteHtml = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const backend = fs.readFileSync(path.join(__dirname, "../plugin/index.cjs"), "utf8");
const sharedTideCurve = fs.readFileSync(path.join(__dirname, "../public/shared/tide-curve.mjs"), "utf8");

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
	for (const source of [html, gateHtml, suiteHtml]) assert.match(source, /0\.5\.11/);
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
