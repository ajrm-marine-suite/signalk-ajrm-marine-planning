/**
 * Shared AJRM tide-curve renderer used by Display and planning applications.
 * It renders chart-datum heights, reference levels and interactive hover data
 * from normalized `{ at, heightM, type }` tidal-event records.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TIDE_REFERENCE_LEVELS = Object.freeze([
	{ key: "mhws", label: "MHWS" },
	{ key: "mhwn", label: "MHWN" },
	{ key: "mlwn", label: "MLWN" },
	{ key: "mlws", label: "MLWS" },
]);

export function tideGraphDays(value, fallback = 7) {
	const days = Math.trunc(Number(value));
	return days >= 1 && days <= 7 ? days : fallback;
}

export function tideCurveEventsForDays(events, now = Date.now(), days = 7) {
	const nowMs = new Date(now).getTime();
	const endMs = nowMs + tideGraphDays(days) * DAY_MS;
	const normalized = (events || []).filter((event) =>
		Number.isFinite(Number(event?.heightM)) && !Number.isNaN(Date.parse(event?.at)),
	).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	const previous = normalized.filter((event) => Date.parse(event.at) <= nowMs).at(-1);
	const visible = normalized.filter((event) => Date.parse(event.at) >= nowMs && Date.parse(event.at) <= endMs);
	return previous && visible[0] !== previous ? [previous, ...visible] : visible;
}

function eventPoints(events) {
	const normalized = (events || []).filter((event) =>
		Number.isFinite(Number(event?.heightM)) && !Number.isNaN(Date.parse(event?.at)),
	).map((event) => ({ ...event, heightM: Number(event.heightM) }))
		.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	const samples = [];
	for (let index = 0; index < normalized.length - 1; index += 1) {
		const before = normalized[index];
		const after = normalized[index + 1];
		for (let step = 0; step < 16; step += 1) {
			const fraction = step / 16;
			const progress = (1 - Math.cos(Math.PI * fraction)) / 2;
			samples.push({
				at: Date.parse(before.at) + (Date.parse(after.at) - Date.parse(before.at)) * fraction,
				heightM: before.heightM + (after.heightM - before.heightM) * progress,
			});
		}
	}
	if (normalized.length) samples.push({ at: Date.parse(normalized.at(-1).at), heightM: normalized.at(-1).heightM });
	return { events: normalized, samples };
}

export function interpolatedTideHeight(events, at) {
	const target = new Date(at).getTime();
	const normalized = eventPoints(events).events;
	if (!Number.isFinite(target) || normalized.length < 2) return null;
	const beforeIndex = normalized.findIndex((event, index) =>
		target >= Date.parse(event.at) && target <= Date.parse(normalized[index + 1]?.at),
	);
	if (beforeIndex < 0) return null;
	const before = normalized[beforeIndex];
	const after = normalized[beforeIndex + 1];
	const fraction = (target - Date.parse(before.at)) / (Date.parse(after.at) - Date.parse(before.at));
	const progress = (1 - Math.cos(Math.PI * fraction)) / 2;
	return before.heightM + (after.heightM - before.heightM) * progress;
}

function normalizedReferenceLevels(referenceLevels) {
	return TIDE_REFERENCE_LEVELS.flatMap(({ key, label }) => {
		const value = Number(referenceLevels?.[key]);
		return Number.isFinite(value) ? [{ key, label, heightM: value }] : [];
	});
}

export function tideCurveSvg(events, now = Date.now(), referenceLevels = null, { timeZone } = {}) {
	const { events: extremes, samples } = eventPoints(events);
	if (samples.length < 2) return "<p class=\"text-body-secondary\">No tidal curve is available.</p>";
	const references = normalizedReferenceLevels(referenceLevels);
	const spanDays = Math.max(1, (samples.at(-1).at - samples[0].at) / DAY_MS);
	const width = Math.max(800, Math.ceil(spanDays * 400));
	const height = 310;
	const padding = { left: 64, right: 64, top: 38, bottom: 70 };
	const minTime = samples[0].at;
	const maxTime = samples.at(-1).at;
	const graphHeights = [...samples.map((point) => point.heightM), ...references.map((level) => level.heightM)];
	const minHeight = 0;
	const maxHeight = Math.max(...graphHeights);
	const heightRange = Math.max(0.1, maxHeight - minHeight);
	const x = (at) => padding.left + ((at - minTime) / (maxTime - minTime)) * (width - padding.left - padding.right);
	const y = (value) => padding.top + ((maxHeight - value) / heightRange) * (height - padding.top - padding.bottom);
	const line = samples.map((point, index) => `${index ? "L" : "M"}${x(point.at).toFixed(1)},${y(point.heightM).toFixed(1)}`).join(" ");
	const nowMs = new Date(now).getTime();
	const nowX = nowMs >= minTime && nowMs <= maxTime ? x(nowMs) : null;
	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		weekday: "short", day: "numeric", month: "short", ...(timeZone ? { timeZone } : {}),
	});
	const timeFormatter = new Intl.DateTimeFormat(undefined, {
		hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}),
	});
	const labels = extremes.map((event) => {
		const eventDate = new Date(event.at);
		const eventX = x(eventDate.getTime()).toFixed(1);
		const eventY = y(event.heightM);
		const isLowWater = String(event.type || "").toLowerCase() === "low";
		const heightLabelY = eventY + (isLowWater ? 20 : -10);
		return `<g class="extreme extreme-${isLowWater ? "low" : "high"}">
			<circle cx="${eventX}" cy="${eventY.toFixed(1)}" r="4"/>
			<text class="extreme-time" x="${eventX}" y="${height - 38}" text-anchor="middle">
				<tspan x="${eventX}">${dateFormatter.format(eventDate)}</tspan>
				<tspan x="${eventX}" dy="16">${timeFormatter.format(eventDate)}</tspan>
			</text>
			<text class="extreme-height" x="${eventX}" y="${heightLabelY.toFixed(1)}" text-anchor="middle">${Number(event.heightM).toFixed(1)} m</text>
		</g>`;
	}).join("");
	const referenceLines = references.map((level, index) => {
		const levelY = y(level.heightM).toFixed(1);
		const labelX = index % 2 === 0 ? padding.left + 5 : width - padding.right - 5;
		const anchor = index % 2 === 0 ? "start" : "end";
		return `<g class="tide-reference-level tide-reference-${level.key}">
			<line class="tide-reference" x1="${padding.left}" y1="${levelY}" x2="${width - padding.right}" y2="${levelY}"/>
			<text class="tide-reference-label" x="${labelX}" y="${(Number(levelY) - 4).toFixed(1)}" text-anchor="${anchor}">${level.label} ${level.heightM.toFixed(1)} m</text>
		</g>`;
	}).join("");
	return `<svg viewBox="0 0 ${width} ${height}" style="width:${width}px;max-width:none" role="img" aria-label="Predicted tide curve"
		data-min-time="${minTime}" data-max-time="${maxTime}" data-min-height="${minHeight}" data-max-height="${maxHeight}"
		data-plot-left="${padding.left}" data-plot-right="${width - padding.right}" data-plot-top="${padding.top}" data-plot-bottom="${height - padding.bottom}">
		<line class="axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"/>
		<text class="axis-label" x="${padding.left - 8}" y="${height - padding.bottom + 5}" text-anchor="end">0 m</text>
		${referenceLines}
		<path class="curve" d="${line}"/>
		${nowX == null ? "" : `<line class="now" x1="${nowX.toFixed(1)}" y1="${padding.top}" x2="${nowX.toFixed(1)}" y2="${height - padding.bottom}"/><text x="${nowX.toFixed(1)}" y="12" text-anchor="middle">Now</text>`}
		${labels}
		<g class="tide-hover" visibility="hidden" aria-hidden="true">
			<line class="tide-hover-guide" y1="${padding.top}" y2="${height - padding.bottom}"/>
			<circle class="tide-hover-dot" r="5"/>
		</g>
		<rect class="tide-hover-target" x="${padding.left}" y="${padding.top}" width="${width - padding.left - padding.right}" height="${height - padding.top - padding.bottom}" fill="transparent" pointer-events="all"/>
	</svg>`;
}

function tideEventTimeLabel(value, timeZone) {
	if (!value || Number.isNaN(Date.parse(value))) return "—";
	return new Intl.DateTimeFormat(undefined, {
		weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
		...(timeZone ? { timeZone } : {}),
	}).format(new Date(value));
}

export function attachTideCurveHover(container, events, { windowObject = globalThis.window, timeZone } = {}) {
	const svg = container?.querySelector?.("svg[data-min-time]");
	const target = svg?.querySelector?.(".tide-hover-target");
	const hover = svg?.querySelector?.(".tide-hover");
	const guide = svg?.querySelector?.(".tide-hover-guide");
	const dot = svg?.querySelector?.(".tide-hover-dot");
	if (!target || !hover || !guide || !dot) return null;
	const documentObject = container.ownerDocument;
	const readout = documentObject.createElement("div");
	readout.className = "ajrm-tide-hover-readout";
	readout.hidden = true;
	readout.setAttribute("role", "status");
	documentObject.body.append(readout);

	function hide() {
		hover.setAttribute("visibility", "hidden");
		readout.hidden = true;
	}

	function move(event) {
		const bounds = svg.getBoundingClientRect();
		const viewWidth = svg.viewBox?.baseVal?.width || Number(svg.getAttribute("viewBox")?.split(/\s+/)[2]);
		const svgX = ((event.clientX - bounds.left) / bounds.width) * viewWidth;
		const left = Number(svg.dataset.plotLeft);
		const right = Number(svg.dataset.plotRight);
		const fraction = Math.max(0, Math.min(1, (svgX - left) / (right - left)));
		const at = Number(svg.dataset.minTime) + fraction * (Number(svg.dataset.maxTime) - Number(svg.dataset.minTime));
		const heightM = interpolatedTideHeight(events, at);
		if (!Number.isFinite(heightM)) return hide();
		const top = Number(svg.dataset.plotTop);
		const bottom = Number(svg.dataset.plotBottom);
		const minHeight = Number(svg.dataset.minHeight);
		const maxHeight = Number(svg.dataset.maxHeight);
		const y = top + ((maxHeight - heightM) / Math.max(0.1, maxHeight - minHeight)) * (bottom - top);
		const x = left + fraction * (right - left);
		guide.setAttribute("x1", x.toFixed(1));
		guide.setAttribute("x2", x.toFixed(1));
		dot.setAttribute("cx", x.toFixed(1));
		dot.setAttribute("cy", y.toFixed(1));
		hover.setAttribute("visibility", "visible");
		readout.textContent = `${tideEventTimeLabel(new Date(at).toISOString(), timeZone)} · ${heightM.toFixed(2)} m`;
		readout.hidden = false;
		const readoutBounds = readout.getBoundingClientRect();
		readout.style.left = `${Math.max(8, Math.min(event.clientX + 12, windowObject.innerWidth - readoutBounds.width - 8))}px`;
		readout.style.top = `${Math.max(8, Math.min(event.clientY + 12, windowObject.innerHeight - readoutBounds.height - 8))}px`;
	}

	target.addEventListener("pointermove", move);
	target.addEventListener("pointerleave", hide);
	return { destroy() { target.removeEventListener("pointermove", move); target.removeEventListener("pointerleave", hide); readout.remove(); } };
}
