/** Verifies Anchor Force exposes only authoritative Location Editor tide inputs. */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../public/anchor/index.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../public/anchor/app.js"), "utf8");

test("anchor tide UI selects Location Editor ports without entered HW/LW fields", () => {
	assert.match(html, /id="secondaryPortSelect"/);
	assert.match(html, /id="recommendSecondaryPort"/);
	assert.doesNotMatch(html, /id="(?:hwTime|lwTime|hwHeight|lwHeight)"/);
	assert.doesNotMatch(html, /data-tide-source=/);
});

test("port changes use focused APIs and do not reapply secondary corrections", () => {
	assert.match(script, /anchor\/tide-port/);
	assert.match(script, /anchor\/tide-port\/recommend/);
	assert.doesNotMatch(script, /function secondaryTideValues/);
	assert.doesNotMatch(script, /function secondaryEventFromReferencePortEvent/);
});
