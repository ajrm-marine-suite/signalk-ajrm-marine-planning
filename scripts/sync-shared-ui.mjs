/** Copies the versioned Map Core tide renderer into the published webapp. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(import.meta.resolve("@ajrm-marine/map-core/tide-curve"));
const destination = path.resolve("public/shared/tide-curve.mjs");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
