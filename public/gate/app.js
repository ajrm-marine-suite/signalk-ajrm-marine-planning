/** Browser-side gate-passage model and UI, backed by shared Signal K services. */
const $ = (id) => document.getElementById(id);
const webVersion = "0.5.16";

const selectedColumns = [
  { label: "Local Time (UK)", source: "Local Time", format: "localTimeWithDay" },
  { label: "Overall", source: "Overall" },
  { label: "Wind Bft", source: "Wind (kn)", format: "beaufort" },
  { label: "Gust Bft", source: "Gust (kn)", format: "beaufort" },
  { label: "Wind Dir", source: "Wind Dir" },
  { label: "Wave (m)", source: "Wave (m)", format: "meters" },
  { label: "Swell (m)", source: "Swell (m)", format: "meters" },
  { label: "Tide Rate (kn)", source: "Tide Rate (kn)", format: "knots" },
  { label: "Tide Dir", source: "Tide Dir (deg)", format: "cardinal" },
  { label: "Tide Status", source: "Tide Status" },
  { label: "Rel: Boat-Tide", source: "Rel: Boat-Tide" },
  { label: "Rel: Wind-Tide", source: "Rel: Wind-Tide" },
  { label: "Point of Sail", source: "Point of Sail" },
  { label: "SOG (OnCourse)", source: "SOG (OnCourse)", format: "knots" },
  { label: "CTS Angle", source: "CTS Angle" },
  { label: "Wind Rating", source: "Wind Rating" },
  { label: "Wave Rating", source: "Wave Rating" }
];

const locationConstantColumns = [
  { key: "location", label: "Location", type: "text" },
  { key: "standardPortName", label: "Standard Port", type: "text" },
  { key: "latitude", label: "Latitude", type: "number" },
  { key: "longitude", label: "Longitude", type: "number" },
  { key: "maps", label: "Google Maps", type: "link" },
  { key: "floodSet", label: "Flood Set", type: "cardinal" },
  { key: "ebbSet", label: "Ebb Set", type: "cardinal" },
  { key: "springPeakFlow", label: "Spring Peak Flow (kn)", type: "number" },
  { key: "neapPeakFlow", label: "Neap Peak Flow (kn)", type: "number" },
  { key: "source", label: "Source", type: "text" },
  { key: "floodSpringAfter", label: "Flood Spring After HW", type: "duration" },
  { key: "floodNeapAfter", label: "Flood Neap After HW", type: "duration" },
  { key: "floodSpringSlack", label: "Flood Spring Slack", type: "duration" },
  { key: "floodNeapSlack", label: "Flood Neap Slack", type: "duration" },
  { key: "ebbSpringAfter", label: "Ebb Spring After HW", type: "duration" },
  { key: "ebbNeapAfter", label: "Ebb Neap After HW", type: "duration" },
  { key: "ebbSpringSlack", label: "Ebb Spring Slack", type: "duration" },
  { key: "ebbNeapSlack", label: "Ebb Neap Slack", type: "duration" },
];

const locationConstants = {};
const timeColumns = [
  "Flood Slack Starts",
  "Flood Commences",
  "Flood Slack Ends",
  "Peak Flood Time",
  "Ebb Slack Starts",
  "Ebb Commences",
  "Ebb Slack Ends",
  "Peak Ebb Time"
];

const gateCalculationColumns = [
  "HW Time (UTC)",
  "HW Height (m)",
  "Range (m)",
  "% Spring",
  "Peak Flow (kn)",
  "Peak Flood Dir (deg)",
  "Flood Commences",
  "Ebb Commences",
  "Peak Ebb Dir (deg)",
  "Location"
];

const fetchedWeatherColumns = [
  "Local Time",
  "Temp (°C)",
  "Wind (kn)",
  "Gust (kn)",
  "Wind Dir",
  "Wave (m)",
  "Period (s)",
  "Wave Dir",
  "Swell (m)",
  "Swell (s)",
  "Swell Dir"
];

const fetchedTideColumns = [
  "Time (UT)",
  "Tide",
  "Height (m)",
  "Range (m)",
  "% Spring"
];

const beaufortBounds = [
  { force: 0, min: 0, max: 1, description: "Calm" },
  { force: 1, min: 1, max: 4, description: "Light Air" },
  { force: 2, min: 4, max: 7, description: "Light Breeze" },
  { force: 3, min: 7, max: 11, description: "Gentle Breeze" },
  { force: 4, min: 11, max: 17, description: "Moderate Breeze" },
  { force: 5, min: 17, max: 22, description: "Fresh Breeze" },
  { force: 6, min: 22, max: 28, description: "Strong Breeze" },
  { force: 7, min: 28, max: 34, description: "Near Gale" },
  { force: 8, min: 34, max: 41, description: "Gale" },
  { force: 9, min: 41, max: 48, description: "Severe Gale" },
  { force: 10, min: 48, max: 56, description: "Storm" },
  { force: 11, min: 56, max: 64, description: "Violent Storm" },
  { force: 12, min: 64, max: Infinity, description: "Hurricane" }
];

const crewProfiles = [
  {
    key: "family",
    label: "Family with young children",
    windBftOffset: -1,
    gustBaseLimitOffsetKn: -5,
    waveMultiplier: 0.7,
    strongFoulRatio: 0.6,
    hobbyMultiplier: 1.45
  },
  {
    key: "competent",
    label: "Competent Crew",
    windBftOffset: 0,
    gustBaseLimitOffsetKn: 0,
    waveMultiplier: 1,
    strongFoulRatio: null,
    hobbyMultiplier: null
  },
  {
    key: "racing",
    label: "Racing Crew",
    windBftOffset: 1,
    gustBaseLimitOffsetKn: 5,
    waveMultiplier: 1.3,
    strongFoulRatio: 0.25,
    hobbyMultiplier: 1.15
  }
];

let currentWeatherRows = null;
let currentTideRows = null;
let currentFetchedTideRows = null;
let currentPlanRows = null;
let currentWeatherMeta = null;
let currentTideMeta = null;
let currentTideEvents = null;
let hourRepeatTimer = null;
let hourRepeatDelayTimer = null;
const weatherRowsByGate = new Map();
const weatherStatusByGate = new Map();
let appSettings = {
  selectedGate: "",
  selectedHeading: "270",
  selectedCrewCapability: "competent",
  speed: "5",
  standardMhws: "",
  standardMhwn: "",
  standardMlwn: "",
  standardMlws: "",
  fallbackCycleHours: "12.5",
  fallbackEbbHours: "6.2",
  peakEbbOffsetMinutes: "180",
  peakFlowMinimumKn: "0.5",
  knotsToMs: "0.5144",
  gravityMs2: "9.81",
  displacementReferenceKg: "5604",
  resonanceMinSeconds: "1.8",
  resonanceMaxSeconds: "3.2",
  resonanceMinWaveM: "0.4",
  hobbyHorsingMultiplier: "1.3",
  tideWaveSteepeningPerKn: "0.03",
  tideWaveSteepeningMax: "0.25",
  beatingStrenuousWaveM: "0.6",
  beatingDangerousWaveM: "1.5",
  offwindStrenuousWaveM: "1.8",
  offwindDangerousWaveM: "2.8",
  beatingAcceptableBft: "4",
  beatingStrenuousBft: "5",
  beatingDangerousBft: "6",
  offwindStrenuousBft: "7",
  offwindDangerousBft: "8",
  strongFoulRatio: "0.4",
  gustBaseLimitKn: "30",
  gustBeatingPenaltyKn: "5",
  gustBeamPenaltyKn: "2",
  gustExposedWaveHeightM: "1.0",
  gustExposedFetchPenaltyKn: "4",
  gustWindOverTidePenaltyKn: "4",
  gustMajorGatePenaltyKn: "7",
  gustMajorGateTideKn: "3.0",
  windChillTempLimitC: "10",
  windChillWindLimitKmh: "4.8",
  knotsToKmh: "1.852"
};

const calculationSettingIds = [
  "fallbackCycleHours",
  "fallbackEbbHours",
  "peakEbbOffsetMinutes",
  "peakFlowMinimumKn",
  "knotsToMs",
  "gravityMs2",
  "displacementReferenceKg",
  "resonanceMinSeconds",
  "resonanceMaxSeconds",
  "resonanceMinWaveM",
  "hobbyHorsingMultiplier",
  "tideWaveSteepeningPerKn",
  "tideWaveSteepeningMax",
  "beatingStrenuousWaveM",
  "beatingDangerousWaveM",
  "offwindStrenuousWaveM",
  "offwindDangerousWaveM",
  "beatingAcceptableBft",
  "beatingStrenuousBft",
  "beatingDangerousBft",
  "offwindStrenuousBft",
  "offwindDangerousBft",
  "strongFoulRatio",
  "gustBaseLimitKn",
  "gustBeatingPenaltyKn",
  "gustBeamPenaltyKn",
  "gustExposedWaveHeightM",
  "gustExposedFetchPenaltyKn",
  "gustWindOverTidePenaltyKn",
  "gustMajorGatePenaltyKn",
  "gustMajorGateTideKn",
  "windChillTempLimitC",
  "windChillWindLimitKmh",
  "knotsToKmh"
];

function settingNumber(key) {
  const control = $(key);
  const value = control ? control.value : appSettings[key];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(appSettings[key]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function competentComfortSettings() {
  return {
    beatingAcceptableBft: settingNumber("beatingAcceptableBft"),
    beatingStrenuousBft: settingNumber("beatingStrenuousBft"),
    beatingDangerousBft: settingNumber("beatingDangerousBft"),
    offwindStrenuousBft: settingNumber("offwindStrenuousBft"),
    offwindDangerousBft: settingNumber("offwindDangerousBft"),
    strongFoulRatio: settingNumber("strongFoulRatio"),
    gustBaseLimitKn: settingNumber("gustBaseLimitKn"),
    gustBeatingPenaltyKn: settingNumber("gustBeatingPenaltyKn"),
    gustBeamPenaltyKn: settingNumber("gustBeamPenaltyKn"),
    gustExposedWaveHeightM: settingNumber("gustExposedWaveHeightM"),
    gustExposedFetchPenaltyKn: settingNumber("gustExposedFetchPenaltyKn"),
    gustWindOverTidePenaltyKn: settingNumber("gustWindOverTidePenaltyKn"),
    gustMajorGatePenaltyKn: settingNumber("gustMajorGatePenaltyKn"),
    gustMajorGateTideKn: settingNumber("gustMajorGateTideKn"),
    beatingStrenuousWaveM: settingNumber("beatingStrenuousWaveM"),
    beatingDangerousWaveM: settingNumber("beatingDangerousWaveM"),
    offwindStrenuousWaveM: settingNumber("offwindStrenuousWaveM"),
    offwindDangerousWaveM: settingNumber("offwindDangerousWaveM"),
    hobbyHorsingMultiplier: settingNumber("hobbyHorsingMultiplier")
  };
}

function crewComfortSettings(profileKey = "competent") {
  const base = competentComfortSettings();
  const profile = crewProfiles.find((item) => item.key === profileKey) || crewProfiles[1];
  const applyWind = (value) => clamp(Number(value) + profile.windBftOffset, 0, 12);
  return {
    ...base,
    beatingAcceptableBft: applyWind(base.beatingAcceptableBft),
    beatingStrenuousBft: applyWind(base.beatingStrenuousBft),
    beatingDangerousBft: applyWind(base.beatingDangerousBft),
    offwindStrenuousBft: applyWind(base.offwindStrenuousBft),
    offwindDangerousBft: applyWind(base.offwindDangerousBft),
    strongFoulRatio: profile.strongFoulRatio ?? base.strongFoulRatio,
    gustBaseLimitKn: Math.max(0, base.gustBaseLimitKn + profile.gustBaseLimitOffsetKn),
    beatingStrenuousWaveM: base.beatingStrenuousWaveM * profile.waveMultiplier,
    beatingDangerousWaveM: base.beatingDangerousWaveM * profile.waveMultiplier,
    offwindStrenuousWaveM: base.offwindStrenuousWaveM * profile.waveMultiplier,
    offwindDangerousWaveM: base.offwindDangerousWaveM * profile.waveMultiplier,
    hobbyHorsingMultiplier: profile.hobbyMultiplier ?? base.hobbyHorsingMultiplier
  };
}

function beaufortScale(knots) {
  if (knots === null || knots === "") return ["", ""];
  const band = beaufortBand(knots);
  return [band.force, band.description];
}

function cardinalToDegrees(cardinalString) {
  if (!cardinalString || typeof cardinalString !== "string") return "N/A";
  const directions = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
  };
  const key = cardinalString.toUpperCase().trim();
  return Object.prototype.hasOwnProperty.call(directions, key) ? directions[key] : "N/A";
}

function beaufortBand(knots) {
  const speed = Math.max(0, Number(knots) || 0);
  return beaufortBounds.find((band) => speed >= band.min && speed < band.max) || beaufortBounds[beaufortBounds.length - 1];
}

function beaufortDecimal(knots) {
  const speed = Math.max(0, Number(knots) || 0);
  const band = beaufortBand(speed);
  if (!Number.isFinite(band.max)) return 12;
  const span = band.max - band.min;
  if (span <= 0) return band.force;
  return Math.min(12, band.force + ((speed - band.min) / span));
}

function calculateWindChill(temp, knots) {
  const wind = Number(knots) * settingNumber("knotsToKmh");
  if (Number(temp) > settingNumber("windChillTempLimitC") || wind < settingNumber("windChillWindLimitKmh")) return Math.round(Number(temp));
  const temperature = Number(temp);
  const wc = 13.12 + (0.6215 * temperature) - (11.37 * (wind ** 0.16)) + (0.3965 * temperature * (wind ** 0.16));
  return Math.round(wc);
}

function degreesToCardinal(degrees) {
  if (degrees === null || degrees === undefined || degrees === "") return "-";
  if (Number.isNaN(Number(degrees))) return "-";
  const cardinals = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return cardinals[Math.round(Number(degrees) / 22.5) % 16];
}

function get8PointArrow(deg) {
  if (Number.isNaN(Number(deg)) || deg === "-" || deg === null) return "-";
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return arrows[Math.round(Number(deg) / 45) % 8];
}

function windAndWaveArrow(deg) {
  if (deg === null || deg === "" || Number.isNaN(Number(deg))) return "";
  return get8PointArrow((Number(deg) + 180) % 360);
}

function getPointOfSail(hdg, windFrom) {
  let diff = Math.abs(Number(hdg) - Number(windFrom));
  if (diff > 180) diff = 360 - diff;
  if (diff < 50) return "beating";
  if (diff < 80) return "close reach";
  if (diff < 105) return "beam reach";
  if (diff < 150) return "broad reach";
  return "running";
}

function getRelativeFlow(hdg, flowDir, type) {
  if (flowDir === "-" || flowDir === "" || Number.isNaN(Number(flowDir))) return "Slack";
  let targetDir = Number(flowDir);
  if (type === "Wind" || type === "WindTide") targetDir = (targetDir + 180) % 360;
  let diff = Math.abs(Number(hdg) - targetDir) % 360;
  if (diff > 180) diff = 360 - diff;
  if (diff <= 45) return type === "Tide" ? "Fair Tide" : "With";
  if (diff >= 135) return type === "Tide" ? "Foul Tide" : "Against";
  return "Cross";
}

function calculateNavSpeeds(Vs, yachtHdg, Vt, tideDir) {
  const hdgRad = yachtHdg * (Math.PI / 180);
  const tideRad = tideDir * (Math.PI / 180);
  const alpha = hdgRad - tideRad;
  const sogCrab = Math.sqrt((Vs ** 2) + (Vt ** 2) + (2 * Vs * Vt * Math.cos(alpha)));
  const crossCurrent = Vt * Math.sin(alpha);
  let sogOnCourse = 0;
  let ctsAngle = 0;

  if (Math.abs(crossCurrent) < Vs) {
    ctsAngle = Math.asin(crossCurrent / Vs) * (180 / Math.PI);
    sogOnCourse = Math.sqrt((Vs ** 2) - (crossCurrent ** 2)) + (Vt * Math.cos(alpha));
  }

  return {
    crabbing: Math.max(0, sogCrab).toFixed(2),
    onCourse: Math.max(0, sogOnCourse).toFixed(2),
    ctsAngle: ctsAngle === 0 ? "0°" : `${ctsAngle.toFixed(1)}°`
  };
}

function calculateSineRate(currentTime, startTime, endTime, peakRate) {
  const fraction = (currentTime - startTime) / (endTime - startTime);
  return peakRate * Math.sin(fraction * Math.PI);
}

function angularDifference(a, b) {
  let diff = Math.abs(Number(a) - Number(b));
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function gustPointPenalty(pos, settings) {
  if (pos === "beating") return settings.gustBeatingPenaltyKn;
  if (pos === "close reach" || pos === "beam reach") return settings.gustBeamPenaltyKn;
  return 0;
}

function gustLimitForRow(rawRow, pos, tideStatus, tideRate, tideDirDeg, settings) {
  const COL = { gust: 5, windDir: 6, wH: 12, sH: 17 };
  const penalties = [];
  const pointPenalty = gustPointPenalty(pos, settings);
  if (pointPenalty > 0) penalties.push({ label: pos, value: pointPenalty });

  const combinedSea = Math.sqrt((Number(rawRow[COL.wH] || 0) ** 2) + (Number(rawRow[COL.sH] || 0) ** 2));
  if (combinedSea >= settings.gustExposedWaveHeightM) {
    penalties.push({ label: "exposed sea", value: settings.gustExposedFetchPenaltyKn });
  }

  const windDirFrom = Number(rawRow[COL.windDir]);
  const windTo = (windDirFrom + 180) % 360;
  const tideAgainstWind = tideStatus !== "Slack"
    && Math.abs(Number(tideRate || 0)) > settings.slackThreshold
    && Number.isFinite(windDirFrom)
    && Number.isFinite(tideDirDeg)
    && angularDifference(windTo, tideDirDeg) >= 135;
  if (tideAgainstWind) {
    const penalty = Math.abs(Number(tideRate || 0)) >= settings.gustMajorGateTideKn
      ? settings.gustMajorGatePenaltyKn
      : settings.gustWindOverTidePenaltyKn;
    penalties.push({ label: "wind over tide", value: penalty });
  }

  const totalPenalty = penalties.reduce((sum, item) => sum + item.value, 0);
  return {
    gust: Number(rawRow[COL.gust] || 0),
    limit: Math.max(0, settings.gustBaseLimitKn - totalPenalty),
    penalties
  };
}

function checkWindComfort(bft, pos, settings, gustContext = null) {
  const force = Number(bft);
  let status;
  if (pos === "beating") {
    if (force >= settings.beatingDangerousBft) status = "Dangerous";
    else if (force >= settings.beatingStrenuousBft) status = "Strenuous";
    else status = force >= settings.beatingAcceptableBft ? "Acceptable" : "Pleasant";
  } else {
    status = force >= settings.offwindDangerousBft ? "Dangerous" : force >= settings.offwindStrenuousBft ? "Strenuous" : "Acceptable";
  }
  if (gustContext && gustContext.gust > 0 && gustContext.gust >= gustContext.limit) {
    const reasons = gustContext.penalties.map((item) => item.label).join(", ");
    return `Dangerous (gust ${gustContext.gust.toFixed(1)} >= ${gustContext.limit.toFixed(1)} kn${reasons ? `; ${reasons}` : ""})`;
  }
  return status;
}

function checkWaveComfortOptimized(rawRow, pos, tideStatus, tideRate, tideDirDeg, settings) {
  const COL = { wH: 12, wP: 13, wD: 14, sH: 17, sP: 18, sD: 19, windDir: 6 };
  const waveH = Number(rawRow[COL.wH] || 0);
  const swellH = Number(rawRow[COL.sH] || 0);
  let combinedH = Math.sqrt((waveH ** 2) + (swellH ** 2));
  if (combinedH === 0) return "Smooth";

  const getTe = (period, direction) => {
    const p = Number(period);
    if (!p) return null;
    const dirDeg = direction !== null && direction !== "" && !Number.isNaN(Number(direction))
      ? Number(direction)
      : Number(rawRow[COL.windDir]);
    const boatSpeedMs = settings.yachtSpeed * settings.knotsToMs;
    const waveSpeed = (settings.gravityMs2 * p) / (2 * Math.PI);
    let angleToWaves = Math.abs(settings.hdg - dirDeg);
    if (angleToWaves > 180) angleToWaves = 360 - angleToWaves;
    return p / (1 + (boatSpeedMs / waveSpeed) * Math.cos(angleToWaves * (Math.PI / 180)));
  };

  const inResonance = (te) => te >= settings.resonanceMinSeconds && te <= settings.resonanceMaxSeconds;
  const windEncounter = getTe(rawRow[COL.wP], rawRow[COL.wD]);
  const swellEncounter = getTe(rawRow[COL.sP], rawRow[COL.sD]);
  const isHobby = (windEncounter && inResonance(windEncounter) && waveH > settings.resonanceMinWaveM)
    || (swellEncounter && inResonance(swellEncounter) && swellH > settings.resonanceMinWaveM);

  if (isHobby) combinedH *= settings.hobbyHorsingMultiplier;
  const tideOpposesWaves = tideStatus !== "Slack"
    && Math.abs(tideRate) > 0
    && [rawRow[COL.wD], rawRow[COL.sD]]
      .filter((direction) => direction !== null && direction !== "" && !Number.isNaN(Number(direction)))
      .some((direction) => angularDifference((Number(direction) + 180) % 360, tideDirDeg) >= 135);
  if (tideOpposesWaves) {
    combinedH *= 1 + Math.min(settings.tideWaveSteepeningMax, Math.abs(tideRate) * settings.tideWaveSteepeningPerKn);
  }

  const limit = settings.displacement / settings.displacementReferenceKg;
  let status = "Acceptable";
  if (pos === "beating") {
    if (combinedH > settings.beatingStrenuousWaveM * limit) status = "Strenuous";
    if (combinedH > settings.beatingDangerousWaveM * limit) status = "Dangerous";
  } else {
    if (combinedH > settings.offwindStrenuousWaveM * limit) status = "Strenuous";
    if (combinedH > settings.offwindDangerousWaveM * limit) status = "Dangerous";
  }
  if (isHobby) {
    if (status === "Acceptable") status = "Strenuous";
    return `${status} (Hobby-Horsing)`;
  }
  return status;
}

function checkTideRating(sogOnCourse, yachtSpeed, settings) {
  const sog = Number(sogOnCourse);
  const ratio = sog / yachtSpeed;
  if (sog <= 0) return "Set Back";
  if (ratio < settings.strongFoulRatio) return "Strong Foul";
  if (sog < yachtSpeed) return "Adverse";
  if (sog > yachtSpeed) return "Fair Tide";
  return "Neutral";
}

function overallRating(wind, wave, tide) {
  if (wind.includes("Dangerous") || wave.includes("Dangerous") || tide === "Set Back" || tide === "Strong Foul") {
    return "Unacceptable";
  }
  if (wind.includes("Strenuous") || wave.includes("Strenuous") || wave.includes("Hobby-Horsing") || tide === "Adverse") {
    return "Uncomfortable";
  }
  if (tide === "Fair Tide" && wave === "Smooth" && wind === "Acceptable") return "Pleasant";
  return "Comfortable";
}

function parseTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return new Date(Math.round((value - 25569) * 86400 * 1000)).getTime();
  if (typeof value === "string") {
    const normalized = normalizeDateTimeText(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, year, month, day, hour, minute, second = "0"] = match;
      return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    }
    return new Date(value).getTime();
  }
  return Number.NaN;
}

function formatDateTime(ms) {
  const date = new Date(ms);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function formatHourDateTime(ms) {
  return formatDateTime(ms).slice(0, 16);
}

function normalizeDateTimeText(value) {
  return String(value)
    .replace("T", " ")
    .replace(/^(\d{2})-([A-Za-z]{3}) /, "2026-$2-$1 ");
}

function timeZoneParts(ms, timeZone = "Europe/London") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function formatLondonDateTime(ms) {
  const parts = timeZoneParts(ms, "Europe/London");
  const pad = (value) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

function formatLocalDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (item) => String(item).padStart(2, "0");
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
  return `${weekday} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timeZoneOffsetMs(ms, timeZone = "Europe/London") {
  const parts = timeZoneParts(ms, timeZone);
  const zoneAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zoneAsUtc - ms;
}

function londonWallTimeToUtcMs(value) {
  const normalized = normalizeDateTimeText(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(value).getTime();
  const [, year, month, day, hour, minute, second = "0"] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let utc = localAsUtc - timeZoneOffsetMs(localAsUtc, "Europe/London");
  utc = localAsUtc - timeZoneOffsetMs(utc, "Europe/London");
  return utc;
}

function durationToMinutes(value) {
  if (typeof value === "number") return value * 24 * 60;
  if (!value || typeof value !== "string") return 0;
  const text = value.trim();
  const sign = text.startsWith("-") ? -1 : 1;

  if (text.includes("day")) {
    const dayMatch = text.match(/(-?\d+)\s+day/);
    const timeMatch = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const days = dayMatch ? Number(dayMatch[1]) : 0;
    const hours = timeMatch ? Number(timeMatch[1]) : 0;
    const minutes = timeMatch ? Number(timeMatch[2]) : 0;
    const seconds = timeMatch?.[3] ? Number(timeMatch[3]) : 0;
    return (days * 24 * 60) + (hours * 60) + minutes + Math.round(seconds / 60);
  }

  const clean = text.replace("-", "");
  const [hours = 0, minutes = 0, seconds = 0] = clean.split(":").map(Number);
  return sign * (hours * 60 + minutes + Math.round(seconds / 60));
}

function minutesToDuration(totalMinutes) {
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

function displayDuration(value) {
  if (value === null || value === undefined || value === "") return "";
  return minutesToDuration(durationToMinutes(String(value)));
}

function addMinutesToTime(value, minutes) {
  const ms = parseTime(value);
  if (Number.isNaN(ms)) return value;
  return formatDateTime(ms + (minutes * 60 * 1000));
}

function midpointTime(start, end) {
  const startMs = parseTime(start);
  const endMs = parseTime(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "";
  return formatDateTime(startMs + ((endMs - startMs) / 2));
}

function interpolateMinutes(location, springKey, neapKey, springFactor) {
  const hasSpring = String(location[springKey] ?? "").trim() !== "";
  const hasNeap = String(location[neapKey] ?? "").trim() !== "";
  if (!hasSpring && !hasNeap) return 0;
  const spring = durationToMinutes(location[springKey]);
  const neap = durationToMinutes(location[neapKey]);
  if (!hasSpring) return neap;
  if (!hasNeap) return spring;
  return neap + (Number(springFactor || 0) * (spring - neap));
}

function interpolateNumber(location, springKey, neapKey, springFactor) {
  const hasSpring = String(location[springKey] ?? "").trim() !== "";
  const hasNeap = String(location[neapKey] ?? "").trim() !== "";
  const spring = hasSpring ? Number(location[springKey]) : Number.NaN;
  const neap = hasNeap ? Number(location[neapKey]) : Number.NaN;
  if (!Number.isFinite(spring) && !Number.isFinite(neap)) return Number.NaN;
  if (!Number.isFinite(spring)) return neap;
  if (!Number.isFinite(neap)) return spring;
  return neap + (Number(springFactor || 0) * (spring - neap));
}

function shiftDateString(value, minutes) {
  const ms = parseTime(value);
  if (Number.isNaN(ms)) return value;
  return formatDateTime(ms + (minutes * 60 * 1000));
}

function tideCalculationRowsFromEvents(eventRows, gateName) {
  const selected = locationConstants[gateName];
  const headers = [
    "HW Time (UTC)", "HW Height (m)", "Range (m)", "% Spring",
    "Peak Flow (kn)", "Peak Flood Dir (deg)", "Peak Flood (Set)",
    "Flood Slack Starts", "Flood Commences", "Flood Slack Ends", "Peak Flood Time",
    "Peak Ebb Dir (deg)", "Peak Ebb (Set)", "Ebb Slack Starts", "Ebb Commences",
    "Ebb Slack Ends", "Peak Ebb Time", "Flood Time Diff", "Slack Duration",
    "Ebb Time Diff", "Location"
  ];
  if (!selected || !eventRows?.length) return [headers];
  const sourceHeaders = eventRows[0];
  const idx = (name) => sourceHeaders.indexOf(name);
  const rows = [headers];
  for (const row of eventRows.slice(1)) {
    if (row[idx("Tide")] !== "HW") continue;
    const hwTime = row[idx("Time (UT)")];
    const springFactor = Number(row[idx("% Spring")] || 0);
    const floodAfter = interpolateMinutes(selected, "floodSpringAfter", "floodNeapAfter", springFactor);
    const ebbAfter = interpolateMinutes(selected, "ebbSpringAfter", "ebbNeapAfter", springFactor);
    const floodSlack = interpolateMinutes(selected, "floodSpringSlack", "floodNeapSlack", springFactor);
    const ebbSlack = interpolateMinutes(selected, "ebbSpringSlack", "ebbNeapSlack", springFactor);
    const floodCommences = addMinutesToTime(hwTime, floodAfter);
    const ebbCommences = addMinutesToTime(hwTime, ebbAfter);
    const locationPeakFlow = interpolateNumber(selected, "springPeakFlow", "neapPeakFlow", springFactor);
    const peakFlow = Math.max(settingNumber("peakFlowMinimumKn"), Number.isFinite(locationPeakFlow) ? locationPeakFlow : settingNumber("peakFlowMinimumKn"));

    rows.push([
      hwTime,
      row[idx("Height (m)")],
      Number(row[idx("Range (m)")] || 0),
      springFactor,
      peakFlow,
      cardinalToDegrees(selected.floodSet),
      selected.floodSet,
      addMinutesToTime(floodCommences, -floodSlack / 2),
      floodCommences,
      addMinutesToTime(floodCommences, floodSlack / 2),
      midpointTime(floodCommences, ebbCommences),
      cardinalToDegrees(selected.ebbSet),
      selected.ebbSet,
      addMinutesToTime(ebbCommences, -ebbSlack / 2),
      ebbCommences,
      addMinutesToTime(ebbCommences, ebbSlack / 2),
      addMinutesToTime(ebbCommences, settingNumber("peakEbbOffsetMinutes")),
      minutesToDuration(floodAfter),
      minutesToDuration((floodSlack + ebbSlack) / 2),
      minutesToDuration(ebbAfter),
      gateName
    ]);
  }
  return rows;
}

function weatherRowsFromApi(payload) {
  const forecast = payload.forecast?.hourly;
  const marine = payload.marine?.hourly;
  if (!forecast?.time?.length || !marine) return null;

  const header = [
    "Local Time", "UTC Time", "Temp (°C)", "Chill (°C)",
    "Wind (kn)", "Gust (kn)", "Wind Dir (°)", "Wind Arrow", "Wind Dir", "Wind Bft", "Wind Desc", "Gust Bft",
    "Wave (m)", "Period (s)", "Wave Dir (°)", "Wave Arrow", "Wave Dir",
    "Swell (m)", "Swell (s)", "Swell Dir (°)", "Swell Arrow", "Swell Dir"
  ];

  const rows = [header];
  const providerTimezone = payload.forecast?.timezone || "";
  const providerTimesAreUtc = /^(UTC|GMT|Etc\/GMT)$/i.test(providerTimezone);
  for (let i = 0; i < forecast.time.length; i++) {
    const sourceTime = normalizeDateTimeText(forecast.time[i]);
    const utcMs = providerTimesAreUtc ? parseTime(sourceTime) : londonWallTimeToUtcMs(sourceTime);
    const utcTime = formatHourDateTime(utcMs);
    const localTime = formatLondonDateTime(utcMs);
    const temp = forecast.temperature_2m?.[i] ?? "";
    const wind = forecast.wind_speed_10m?.[i] ?? forecast.windspeed_10m?.[i] ?? "";
    const gust = forecast.wind_gusts_10m?.[i] ?? forecast.windgusts_10m?.[i] ?? "";
    const windDir = forecast.wind_direction_10m?.[i] ?? forecast.winddirection_10m?.[i] ?? "";
    const waveDir = marine.wave_direction?.[i] ?? "";
    const swellDir = marine.swell_wave_direction?.[i] ?? "";
    const windBeaufort = beaufortScale(wind);
    const gustBeaufort = beaufortScale(gust);
    rows.push([
      localTime,
      utcTime,
      temp,
      temp !== "" && wind !== "" ? calculateWindChill(temp, wind) : "",
      wind,
      gust,
      windDir,
      windAndWaveArrow(windDir),
      degreesToCardinal(windDir),
      windBeaufort[0],
      windBeaufort[1],
      gustBeaufort[0],
      marine.wave_height?.[i] ?? "",
      marine.wave_period?.[i] ?? "",
      waveDir,
      windAndWaveArrow(waveDir),
      degreesToCardinal(waveDir),
      marine.swell_wave_height?.[i] ?? "",
      marine.swell_wave_period?.[i] ?? "",
      swellDir,
      windAndWaveArrow(swellDir),
      degreesToCardinal(swellDir)
    ]);
  }
  return rows;
}

function interpolateTidalFlow(weatherArray, tidesArray, settings) {
  const wHeaders = weatherArray[0];
  const tHeaders = tidesArray[0];
  const tIdx = (name) => tHeaders.indexOf(name);
  const lastValidCol = 22;
  const sailArrow = get8PointArrow(settings.hdg);
  const resultHeaders = [
    ...wHeaders.slice(0, lastValidCol),
    "Tide Rate (kn)", "Tide Dir (deg)", "Tide Arrow", "Tide Status",
    "Rel: Boat-Tide", "Rel: Wind-Tide", "Rel: Boat-Wind", "Point of Sail", "Sail Arrow",
    "SOG (Crab)", "SOG (OnCourse)", "CTS Angle",
    "Tide Rating", "Wind Rating", "Wave Rating", "Overall"
  ];
  const result = [resultHeaders];
  const tideData = tidesArray.slice(1);
  const COL = { windDir: 6, bForce: 9 };
  const cycleMs = settings.fallbackCycleHours * 60 * 60 * 1000;
  const phaseStarts = tideData.flatMap((row) => {
    const peakRate = Number(row[tIdx("Peak Flow (kn)")]);
    const floodStart = parseTime(row[tIdx("Flood Commences")]);
    const ebbStart = parseTime(row[tIdx("Ebb Commences")]);
    const floodDir = String(row[tIdx("Peak Flood Dir (deg)")]).replace(/[^\d.-]/g, "");
    const ebbDir = String(row[tIdx("Peak Ebb Dir (deg)")]).replace(/[^\d.-]/g, "");
    const starts = [];
    if (Number.isFinite(floodStart) && floodDir !== "") {
      starts.push({ status: "Flood", dir: floodDir, start: floodStart, peakRate });
    }
    if (Number.isFinite(ebbStart) && ebbDir !== "") {
      starts.push({ status: "Ebb", dir: ebbDir, start: ebbStart, peakRate });
    }
    return starts;
  }).sort((a, b) => a.start - b.start);
  const phaseForTime = (wTime) => {
    if (!phaseStarts.length) return null;
    let candidates = phaseStarts;
    const firstStart = phaseStarts[0].start;
    const lastStart = phaseStarts[phaseStarts.length - 1].start;
    if (wTime < firstStart || wTime >= lastStart) {
      candidates = phaseStarts.flatMap((phase) => {
        const cycleOffset = Math.floor((wTime - phase.start) / cycleMs);
        return [cycleOffset - 1, cycleOffset, cycleOffset + 1].map((offset) => ({
          ...phase,
          start: phase.start + (offset * cycleMs)
        }));
      }).sort((a, b) => a.start - b.start);
    }
    for (let j = 0; j < candidates.length; j++) {
      const phase = candidates[j];
      const nextPhase = candidates[j + 1];
      if (wTime >= phase.start && (!nextPhase || wTime < nextPhase.start)) {
        return { ...phase, end: nextPhase?.start ?? phase.start + (settings.fallbackEbbHours * 60 * 60 * 1000) };
      }
    }
    return null;
  };

  for (let i = 1; i < weatherArray.length; i++) {
    const rawRow = weatherArray[i];
    if (!rawRow[0]) continue;
    const wTime = parseTime(rawRow[1] || rawRow[0]);
    let tideRate = 0;
    let tideDir = "-";
    let tideStatus = "Slack";
    let activePhase = null;

    activePhase = phaseForTime(wTime);

    if (activePhase) {
      tideStatus = activePhase.status;
      tideDir = activePhase.dir;
      tideRate = calculateSineRate(wTime, activePhase.start, activePhase.end || activePhase.start + (settings.fallbackEbbHours * 60 * 60 * 1000), activePhase.peakRate);
      if (Math.abs(tideRate) < settings.slackThreshold) {
        tideStatus = "Slack";
        tideRate = 0;
        tideDir = "-";
      }
    }

    const windDirFrom = rawRow[COL.windDir];
    const pointOfSail = windDirFrom !== "" ? getPointOfSail(settings.hdg, windDirFrom) : "N/A";
    let nav = { crabbing: settings.yachtSpeed.toFixed(2), onCourse: settings.yachtSpeed.toFixed(2), ctsAngle: "0°" };
    if (tideStatus !== "Slack" && tideDir !== "-") {
      nav = calculateNavSpeeds(settings.yachtSpeed, settings.hdg, tideRate, Number(tideDir));
    }

    const tideRating = checkTideRating(nav.onCourse, settings.yachtSpeed, settings);
    const gustContext = gustLimitForRow(rawRow, pointOfSail, tideStatus, tideRate, Number(tideDir), settings);
    const windRating = checkWindComfort(rawRow[COL.bForce], pointOfSail, settings, gustContext);
    const waveRating = checkWaveComfortOptimized(rawRow, pointOfSail, tideStatus, tideRate, Number(tideDir), settings);

    result.push([
      ...rawRow.slice(0, lastValidCol),
      tideRate.toFixed(2),
      tideDir,
      tideDir === "-" ? "-" : get8PointArrow(tideDir),
      tideStatus,
      getRelativeFlow(settings.hdg, tideDir, "Tide"),
      getRelativeFlow(windDirFrom, tideDir, "WindTide"),
      getRelativeFlow(settings.hdg, windDirFrom, "Wind"),
      pointOfSail,
      sailArrow,
      nav.crabbing,
      nav.onCourse,
      nav.ctsAngle,
      tideRating,
      windRating,
      waveRating,
      overallRating(windRating, waveRating, tideRating)
    ]);
  }
  return result;
}

function tideCoverageEndMs(tidesArray) {
  if (!tidesArray?.length) return Number.NaN;
  const headers = tidesArray[0];
  const indexes = ["Local Time", ...timeColumns]
    .map((name) => headers.indexOf(name))
    .filter((index) => index !== -1);
  let end = Number.NaN;
  for (const row of tidesArray.slice(1)) {
    for (const index of indexes) {
      const ms = parseTime(row[index]);
      if (!Number.isNaN(ms) && (Number.isNaN(end) || ms > end)) end = ms;
    }
  }
  return end;
}

function limitWeatherRowsToTideWindow(weatherRows, tidesArray) {
  if (!weatherRows?.length || !tidesArray?.length) return weatherRows;
  const end = tideCoverageEndMs(tidesArray);
  if (Number.isNaN(end)) return weatherRows;
  return [
    weatherRows[0],
    ...weatherRows.slice(1).filter((row) => {
      const ms = parseTime(row[1] || row[0]);
      return !Number.isNaN(ms) && ms <= end;
    })
  ];
}

function startOfTodayLondonMs(now = Date.now()) {
  const parts = timeZoneParts(now, "Europe/London");
  return londonWallTimeToUtcMs(`${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} 00:00:00`);
}

function limitWeatherRowsToTodayOnward(weatherRows) {
  if (!weatherRows?.length) return weatherRows;
  const todayStart = startOfTodayLondonMs();
  return [
    weatherRows[0],
    ...weatherRows.slice(1).filter((row) => {
      const ms = parseTime(row[1] || row[0]);
      return !Number.isNaN(ms) && ms >= todayStart;
    })
  ];
}

function formatHoursOld(fromIso) {
  const ms = fromIso ? new Date(fromIso).getTime() : Number.NaN;
  if (Number.isNaN(ms)) return "-";
  return `${((Date.now() - ms) / 3600000).toFixed(1)} hours old`;
}

function renderFreshnessCard(id, meta, label) {
  const card = $(id);
  if (!card) return;
  if (!meta?.fetchedAt) {
    card.dataset.expired = "false";
    card.querySelector("strong").textContent = "No web update yet";
    card.querySelector("small").textContent = "No stored web data loaded";
    return;
  }
  const fetched = new Date(meta.fetchedAt);
  const expires = meta.refreshAfter ? new Date(meta.refreshAfter) : null;
  const expired = expires ? Date.now() >= expires.getTime() : false;
  card.dataset.expired = String(expired);
  card.querySelector("strong").textContent = `${label}: ${formatLocalDateTime(fetched.toISOString())}`;
  const prefix = meta.offlineFallback || meta.stale ? "stored offline data; " : "";
  card.querySelector("small").textContent = expires
    ? `${prefix}${formatHoursOld(meta.fetchedAt)}; ${expired ? "refresh due" : `next refresh ${formatLocalDateTime(expires.toISOString())}`}`
    : `${prefix}${formatHoursOld(meta.fetchedAt)}`;
}

function updateFreshness() {
  const locationCard = $("selectedLocationStatus");
  if (locationCard) {
    const gate = $("gate").value;
    const location = locationConstants[gate];
    locationCard.dataset.expired = "false";
    locationCard.querySelector("strong").textContent = gate || "-";
    locationCard.querySelector("small").textContent = location?.latitude && location?.longitude
      ? `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`
      : "No latitude/longitude set";
  }
  renderFreshnessCard("weatherFreshness", weatherStatusByGate.get($("gate").value) || currentWeatherMeta, "Weather");
  renderFreshnessCard("tideFreshness", currentTideMeta, "Tide");
  const horizon = $("planningHorizon");
  if (!horizon || !currentPlanRows?.length || !currentTideRows?.length) return;
  const headers = currentPlanRows[0];
  const first = parseTime(currentPlanRows[1]?.[headers.indexOf("UTC Time")] || currentPlanRows[1]?.[0]);
  const end = tideCoverageEndMs(currentTideRows);
  const hours = !Number.isNaN(first) && !Number.isNaN(end) ? Math.max(0, (end - first) / 3600000) : 0;
  horizon.dataset.expired = "false";
  horizon.querySelector("strong").textContent = `${(hours / 24).toFixed(1)} days`;
  horizon.querySelector("small").textContent = `${currentPlanRows.length - 1} hourly rows, limited by tide data`;
}

function setRefreshButtonsBusy(ids, isBusy, busyText = "Refreshing...") {
  for (const id of ids) {
    const button = $(id);
    if (!button) continue;
    if (isBusy) {
      if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
      button.disabled = true;
      button.textContent = busyText;
    } else {
      button.disabled = false;
      if (button.dataset.idleText) button.textContent = button.dataset.idleText;
    }
  }
}

function cacheStatusVerb(meta, freshLabel) {
  if (meta?.offlineFallback || meta?.stale) return "loaded from stored offline data";
  if (meta?.hit) return "loaded from cache";
  return freshLabel;
}

function manualRefreshWarning(source, meta) {
  if (!meta?.offlineFallback && !meta?.stale) return "";
  const reason = meta?.fallbackReason ? `\n\nReason: ${meta.fallbackReason}` : "";
  return `${source} could not be refreshed from the web. The app is using stored offline data instead.${reason}`;
}

function summarize(rows) {
  const headers = rows[0];
  const idx = (name) => headers.indexOf(name);
  const stats = { maxWind: 0, maxWave: 0, minSOG: 100, unacceptable: 0, comfortable: 0, pleasant: 0 };
  for (const row of rows.slice(1)) {
    stats.maxWind = Math.max(stats.maxWind, Number(row[idx("Gust (kn)")] || 0));
    stats.maxWave = Math.max(stats.maxWave, Number(row[idx("Wave (m)")] || 0));
    stats.minSOG = Math.min(stats.minSOG, Number(row[idx("SOG (OnCourse)")] || 100));
    if (row[idx("Overall")] === "Unacceptable") stats.unacceptable++;
    if (row[idx("Overall")] === "Comfortable") stats.comfortable++;
    if (row[idx("Overall")] === "Pleasant") stats.pleasant++;
  }
  const total = Math.max(1, rows.length - 1);
  const good = stats.comfortable + stats.pleasant;
  $("maxGust").textContent = `Bft ${beaufortDecimal(stats.maxWind).toFixed(1)}`;
  $("maxWave").textContent = `${stats.maxWave.toFixed(2)} m`;
  $("worstSog").textContent = `${stats.minSOG.toFixed(1)} kn`;
  $("usable").textContent = `${good} hrs (${Math.round((good / total) * 100)}%)`;
  $("nogo").textContent = `${stats.unacceptable} hrs`;
}

function formatDisplayValue(value, format) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (format === "localTimeWithDay") return formatLocalTimeWithDay(value);
  if (format === "ukLocalDateTime") return formatUtcStringAsLondonDateTime(value);
  if (format === "knots" && !Number.isNaN(numeric)) return numeric.toFixed(1);
  if (format === "beaufort" && !Number.isNaN(numeric)) return beaufortDecimal(numeric).toFixed(1);
  if (format === "meters" && !Number.isNaN(numeric)) return numeric.toFixed(2);
  if (format === "percent" && !Number.isNaN(numeric)) {
    return `${(numeric * 100).toFixed(0)}%`;
  }
  if (format === "cardinal") return degreesToCardinal(value);
  return String(value);
}

function formatLocalTimeWithDay(value) {
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})([ T]\d{2}:\d{2})/);
  if (!match) return text;
  const [, year, month, day, timePart] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
  return `${weekday} ${year}-${month}-${day}${timePart.replace("T", " ")}`;
}

function displayPlanLocalTime(value) {
  return formatLocalTimeWithDay(value);
}

function formatUtcStringAsLondonDateTime(value) {
  const ms = parseTime(value);
  if (Number.isNaN(ms)) return String(value);
  return formatLocalTimeWithDay(formatLondonDateTime(ms));
}

function tideColumnFormat(columnName) {
  if (columnName === "Local Time") return "localTimeWithDay";
  if (["Time (UT)", "HW Time (UTC)", "Flood Commences", "Ebb Commences"].includes(columnName)) return "ukLocalDateTime";
  if (columnName === "Peak Flow (kn)") return "knots";
  if (columnName === "Wind (kn)" || columnName === "Gust (kn)") return "knots";
  if (columnName === "Height (m)" || columnName === "HW Height (m)" || columnName === "LW Height (m)" || columnName === "Range (m)" || columnName === "Rise (m)" || columnName === "Wave (m)" || columnName === "Swell (m)") return "meters";
  if (columnName === "% Spring") return "percent";
  if (columnName.includes("Dir (deg)")) return "cardinal";
  return null;
}

function renderTable(rows) {
  const headers = rows[0];
  const indexes = selectedColumns.map((column) => headers.indexOf(column.source));
  const thead = $("planTable").querySelector("thead");
  const tbody = $("planTable").querySelector("tbody");
  thead.innerHTML = `<tr>${selectedColumns.map((column) => `<th>${column.label}</th>`).join("")}</tr>`;
  tbody.innerHTML = rows.slice(1).map((row) => {
    const rating = row[headers.indexOf("Overall")];
    const cells = indexes.map((idx, columnIndex) => {
      const column = selectedColumns[columnIndex];
      const className = passageCellClass(column.source, row, headers);
      return `<td${className ? ` class="${className}"` : ""}>${escapeHtml(formatDisplayValue(row[idx], column.format))}</td>`;
    }).join("");
    return `<tr data-rating="${rating}">${cells}</tr>`;
  }).join("");
}

function ratingSeverity(value) {
  const rating = String(value || "");
  if (rating.includes("Dangerous") || rating.includes("Set Back") || rating.includes("Strong Foul")) return "stop";
  if (rating.includes("Strenuous") || rating.includes("Adverse") || rating.includes("Hobby-Horsing")) return "warn";
  return "";
}

function passageCellClass(source, row, headers) {
  const idx = (name) => headers.indexOf(name);
  const value = (name) => {
    const index = idx(name);
    return index === -1 ? "" : row[index];
  };
  const overall = value("Overall");
  if (overall !== "Uncomfortable" && overall !== "Unacceptable") return "";

  const windSeverity = ratingSeverity(value("Wind Rating"));
  const waveSeverity = ratingSeverity(value("Wave Rating"));
  const tideSeverity = ratingSeverity(value("Tide Rating"));
  const classFor = (severity) => severity === "stop" ? "causeStop" : severity === "warn" ? "causeWarn" : "";

  if (source === "Overall") return "";
  if (windSeverity) {
    const windRating = String(value("Wind Rating") || "");
    const gustDriven = windRating.includes("gust");
    if (source === "Wind Rating") return classFor(windSeverity);
    if (gustDriven && source === "Gust (kn)") return classFor(windSeverity);
    if (!gustDriven && source === "Wind (kn)") return classFor(windSeverity);
  }
  if (waveSeverity && (source === "Wave (m)" || source === "Swell (m)" || source === "Wave Rating")) return classFor(waveSeverity);
  if (tideSeverity && ["Tide Rate (kn)", "Tide Dir (deg)", "Tide Status", "Rel: Boat-Tide", "SOG (OnCourse)"].includes(source)) {
    return classFor(tideSeverity);
  }
  return "";
}

function renderReadOnlyTable(tableId, rows, columns) {
  if (!rows?.length) return;
  const headers = rows[0];
  const indexes = columns.map((name) => headers.indexOf(name));
  const thead = $(tableId).querySelector("thead");
  const tbody = $(tableId).querySelector("tbody");
  thead.innerHTML = `<tr>${columns.map((name) => `<th>${tableHeaderLabel(name)}</th>`).join("")}</tr>`;
  tbody.innerHTML = rows.slice(1).map((row, rowOffset) => {
    const cells = indexes.map((colIndex) => {
      if (colIndex === -1) return "<td></td>";
      const value = row[colIndex] ?? "";
      const displayValue = formatDisplayValue(value, tideColumnFormat(headers[colIndex]));
      return `<td>${escapeHtml(displayValue)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
}

function tableHeaderLabel(name) {
  if (name === "Local Time") return "Local Time (UK)";
  if (name === "Time (UT)") return "Local Time (UK)";
  if (name === "UTC Time") return "UTC Time (UT)";
  if (name === "HW Time") return "HW Time (UT)";
  if (name === "HW Time (UTC)") return "HW Time (UK)";
  if (name === "Flood Commences") return "Flood Commences (UK)";
  if (name === "Ebb Commences") return "Ebb Commences (UK)";
  if (name === "Peak Flood Dir (deg)") return "Peak Flood Dir";
  if (name === "Peak Ebb Dir (deg)") return "Peak Ebb Dir";
  return name;
}

function ratingColor(rating) {
  if (!rating) return "#6b7785";
  if (rating.includes("Unacceptable") || rating.includes("Dangerous") || rating.includes("Set Back") || rating.includes("Strong Foul")) return "#d76c6c";
  if (rating.includes("Uncomfortable") || rating.includes("Strenuous") || rating.includes("Adverse") || rating.includes("Hobby-Horsing")) return "#d59b22";
  if (rating.includes("Pleasant") || rating.includes("Fair Tide")) return "#4f9f5f";
  if (rating.includes("Comfortable") || rating.includes("Acceptable") || rating.includes("Neutral")) return "#1f6f8b";
  return "#6b7785";
}

function vectorPoint(degrees, length, center = 210) {
  const rad = Number(degrees) * (Math.PI / 180);
  return {
    x: center + (Math.sin(rad) * length),
    y: center - (Math.cos(rad) * length)
  };
}

function vectorArrow({ label, degrees, magnitude, maxMagnitude, color, dashed = false, labelOffset = 0 }) {
  if (degrees === "-" || degrees === "" || Number.isNaN(Number(degrees))) return "";
  const length = 42 + (Math.min(1, Math.abs(Number(magnitude) || 0) / maxMagnitude) * 118);
  const end = vectorPoint(degrees, length);
  const rad = Number(degrees) * (Math.PI / 180);
  const ux = Math.sin(rad);
  const uy = -Math.cos(rad);
  const px = Math.cos(rad);
  const py = Math.sin(rad);
  const baseX = end.x - (ux * 14);
  const baseY = end.y - (uy * 14);
  const arrow = [
    `${end.x.toFixed(1)},${end.y.toFixed(1)}`,
    `${(baseX + (px * 6)).toFixed(1)},${(baseY + (py * 6)).toFixed(1)}`,
    `${(baseX - (px * 6)).toFixed(1)},${(baseY - (py * 6)).toFixed(1)}`
  ].join(" ");
  const labelPoint = vectorPoint(degrees, Math.min(180, length + 22));
  labelPoint.x += px * labelOffset;
  labelPoint.y += py * labelOffset;
  return `
    <g>
      <line x1="210" y1="210" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${color}" stroke-width="7" stroke-linecap="round" ${dashed ? 'stroke-dasharray="8 8"' : ""}></line>
      <polygon points="${arrow}" fill="${color}"></polygon>
      <text x="${labelPoint.x.toFixed(1)}" y="${labelPoint.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="13" font-weight="750">${escapeHtml(label)}</text>
    </g>
  `;
}

function directionTo(degreesFrom) {
  if (degreesFrom === "-" || degreesFrom === "" || degreesFrom === null || Number.isNaN(Number(degreesFrom))) return "-";
  return (Number(degreesFrom) + 180) % 360;
}

function renderHourOptions(rows) {
  const select = $("hourSelect");
  if (!select || !rows?.length) return;
  const previous = select.value;
  select.innerHTML = rows.slice(1).map((row, index) => {
    const value = String(row[0]);
    const label = displayPlanLocalTime(value);
    return `<option value="${escapeHtml(value)}"${previous === value || (!previous && index === 0) ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function getPlanRowBySelectedHour() {
  if (!currentPlanRows?.length) return null;
  const selected = $("hourSelect")?.value;
  return currentPlanRows.slice(1).find((row) => String(row[0]) === selected) || currentPlanRows[1] || null;
}

function stepSelectedHour(delta) {
  const select = $("hourSelect");
  if (!select || select.options.length === 0) return;
  const nextIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + delta));
  if (nextIndex === select.selectedIndex) return;
  select.selectedIndex = nextIndex;
  updateHourStepButtons();
  renderHourVisual();
}

function updateHourStepButtons() {
  const select = $("hourSelect");
  const previous = $("previousHour");
  const next = $("nextHour");
  if (!select || !previous || !next) return;
  previous.disabled = select.selectedIndex <= 0;
  next.disabled = select.selectedIndex < 0 || select.selectedIndex >= select.options.length - 1;
}

function directionLabel(degrees) {
  const cardinal = degreesToCardinal(degrees);
  return cardinal && cardinal !== "-" ? cardinal : `${Number(degrees).toFixed(0)}°`;
}

function updateGateDirections() {
  const output = $("gateDirections");
  if (!output) return;
  const location = locationConstants[$("gate").value];
  const flood = location?.floodSet?.trim();
  const ebb = location?.ebbSet?.trim();
  output.textContent = flood && ebb ? `Flood ${flood} / Ebb ${ebb}` : "Direction not set";
}

function isCourseAlignedWithTideDirection(courseDeg, tideDeg) {
  if (!Number.isFinite(courseDeg) || !Number.isFinite(tideDeg)) return false;
  return angularDifference(courseDeg, tideDeg) <= 45;
}

function updateCourseDirectionWarning() {
  const control = $("courseControl");
  const warning = $("courseWarning");
  updateGateDirections();
  if (!control || !warning) return;
  const location = locationConstants[$("gate").value];
  const course = Number($("heading").value);
  const flood = cardinalToDegrees(location?.floodSet);
  const ebb = cardinalToDegrees(location?.ebbSet);
  const floodDeg = Number(flood);
  const ebbDeg = Number(ebb);
  const hasDirections = Number.isFinite(floodDeg) && Number.isFinite(ebbDeg);
  const aligned = hasDirections
    && (isCourseAlignedWithTideDirection(course, floodDeg) || isCourseAlignedWithTideDirection(course, ebbDeg));

  control.classList.toggle("courseMismatch", hasDirections && !aligned);
  warning.textContent = hasDirections && !aligned
    ? `Course ${directionLabel(course)} does not match ${location.floodSet}/${location.ebbSet} tide directions.`
    : "";
}

function stopHourRepeat() {
  if (hourRepeatDelayTimer) clearTimeout(hourRepeatDelayTimer);
  if (hourRepeatTimer) clearInterval(hourRepeatTimer);
  hourRepeatDelayTimer = null;
  hourRepeatTimer = null;
}

function startHourRepeat(delta) {
  stopHourRepeat();
  stepSelectedHour(delta);
  hourRepeatDelayTimer = setTimeout(() => {
    hourRepeatTimer = setInterval(() => stepSelectedHour(delta), 120);
  }, 450);
}

function bindHourStepButton(id, delta) {
  const button = $(id);
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    if (button.disabled) return;
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    startHourRepeat(delta);
  });
  button.addEventListener("pointerup", stopHourRepeat);
  button.addEventListener("pointercancel", stopHourRepeat);
  button.addEventListener("pointerleave", stopHourRepeat);
  button.addEventListener("click", (event) => event.preventDefault());
}

function renderHourVisual() {
  const svg = $("hourCompass");
  const cards = $("hourCards");
  const overall = $("hourOverall");
  if (!svg || !cards || !overall || !currentPlanRows?.length) return;

  const headers = currentPlanRows[0];
  const idx = (name) => headers.indexOf(name);
  const row = getPlanRowBySelectedHour();
  if (!row) return;
  updateHourStepButtons();

  const settings = settingsFromControls();
  const windSpeed = Number(row[idx("Wind (kn)")] || 0);
  const windFrom = row[idx("Wind Dir (°)")];
  const waveHeight = Number(row[idx("Wave (m)")] || 0);
  const waveFrom = row[idx("Wave Dir (°)")];
  const swellHeight = Number(row[idx("Swell (m)")] || 0);
  const swellFrom = row[idx("Swell Dir (°)")];
  const tideRate = Number(row[idx("Tide Rate (kn)")] || 0);
  const tideDir = row[idx("Tide Dir (deg)")];
  const windRating = row[idx("Wind Rating")];
  const waveRating = row[idx("Wave Rating")];
  const tideRating = row[idx("Tide Rating")];
  const overallRatingValue = row[idx("Overall")];

  const vectors = [
    vectorArrow({ label: "Boat", degrees: settings.hdg, magnitude: settings.yachtSpeed, maxMagnitude: 8, color: "#17212b", labelOffset: -16 }),
    vectorArrow({ label: "Wind", degrees: directionTo(windFrom), magnitude: windSpeed, maxMagnitude: 35, color: ratingColor(windRating) }),
    vectorArrow({ label: "Wave", degrees: directionTo(waveFrom), magnitude: waveHeight, maxMagnitude: 3.5, color: ratingColor(waveRating), dashed: true }),
    vectorArrow({ label: "Swell", degrees: directionTo(swellFrom), magnitude: swellHeight, maxMagnitude: 3.5, color: "#7a64a0", dashed: true }),
    vectorArrow({ label: "Tide", degrees: tideDir, magnitude: tideRate, maxMagnitude: 6, color: ratingColor(tideRating), labelOffset: 16 })
  ].join("");

  svg.innerHTML = `
    <rect width="420" height="420" fill="#fff"></rect>
    <circle cx="210" cy="210" r="172" fill="#f7f9fb" stroke="#d7dee4" stroke-width="2"></circle>
    <circle cx="210" cy="210" r="112" fill="none" stroke="#e8edf1" stroke-width="1"></circle>
    <circle cx="210" cy="210" r="54" fill="none" stroke="#e8edf1" stroke-width="1"></circle>
    <line x1="210" y1="34" x2="210" y2="386" stroke="#d7dee4"></line>
    <line x1="34" y1="210" x2="386" y2="210" stroke="#d7dee4"></line>
    <text x="210" y="24" text-anchor="middle" font-size="14" font-weight="750" fill="#17212b">N</text>
    <text x="397" y="215" text-anchor="middle" font-size="14" font-weight="750" fill="#17212b">E</text>
    <text x="210" y="404" text-anchor="middle" font-size="14" font-weight="750" fill="#17212b">S</text>
    <text x="23" y="215" text-anchor="middle" font-size="14" font-weight="750" fill="#17212b">W</text>
    ${vectors}
    <circle cx="210" cy="210" r="7" fill="#17212b"></circle>
  `;

  overall.dataset.rating = overallRatingValue;
  overall.textContent = `${displayPlanLocalTime(row[0])} - ${overallRatingValue}`;

  const cardData = [
    { name: "Boat", value: `${degreesToCardinal(settings.hdg)} ${settings.yachtSpeed.toFixed(1)} kn`, note: `Point of sail: ${row[idx("Point of Sail")]}`, color: "#17212b" },
    { name: "Wind", value: `Bft ${beaufortDecimal(windSpeed).toFixed(1)} from ${degreesToCardinal(windFrom)}`, note: `${windSpeed.toFixed(1)} kn - ${windRating}`, color: ratingColor(windRating) },
    { name: "Wave", value: `${waveHeight.toFixed(2)} m from ${degreesToCardinal(waveFrom)}`, note: waveRating, color: ratingColor(waveRating) },
    { name: "Swell", value: `${swellHeight.toFixed(2)} m from ${degreesToCardinal(swellFrom)}`, note: `${row[idx("Swell (s)")]} s period`, color: "#7a64a0" },
    { name: "Tide", value: `${tideRate.toFixed(1)} kn ${degreesToCardinal(tideDir)}`, note: `${row[idx("Tide Status")]} - ${tideRating}`, color: ratingColor(tideRating) },
    { name: "Progress", value: `${Number(row[idx("SOG (OnCourse)")] || 0).toFixed(1)} kn SOG`, note: `CTS ${row[idx("CTS Angle")]}`, color: ratingColor(tideRating) }
  ];
  cards.innerHTML = cardData.map((card) => `
    <article class="hourCard" style="border-left-color: ${card.color}">
      <span>${escapeHtml(card.name)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.note)}</small>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function googleMapsUrl(location) {
  const latitude = String(location.latitude ?? "").trim();
  const longitude = String(location.longitude ?? "").trim();
  if (!latitude || !longitude) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function isLocationComplete(location) {
  if (!location) return false;
  const requiredFields = [
    "latitude",
    "longitude",
    "floodSet",
    "ebbSet",
    "springPeakFlow",
    "neapPeakFlow",
    "floodSpringAfter",
    "floodNeapAfter",
    "ebbSpringAfter",
    "ebbNeapAfter"
  ];
  const levels = location.standardPort?.referenceLevels;
  return requiredFields.every((field) => String(location[field] ?? "").trim() !== "")
    && Boolean(location.standardPort?.locationId && location.standardPort?.stationId)
    && ["mhws", "mhwn", "mlwn", "mlws"].every((key) => Number.isFinite(Number(levels?.[key])));
}

function syncGateOptions(selected = $("gate").value) {
  const gate = $("gate");
  const names = Object.keys(locationConstants);
  const completeNames = names.filter((name) => isLocationComplete(locationConstants[name]));
  const selectedIsComplete = locationConstants[selected] && isLocationComplete(locationConstants[selected]);
  const active = selectedIsComplete ? selected : (completeNames[0] || names[0] || "");
  gate.innerHTML = names.map((name) => {
    const complete = isLocationComplete(locationConstants[name]);
    const label = complete ? name : `${name} (incomplete)`;
    return `<option value="${escapeHtml(name)}"${name === active ? " selected" : ""}${complete ? "" : " disabled"}>${escapeHtml(label)}</option>`;
  }).join("");
  if (active) gate.value = active;
}

async function savePlannerSelection() {
  try {
    appSettings.selectedGate = $("gate").value;
    appSettings.selectedHeading = $("heading").value;
    appSettings.selectedCrewCapability = $("crewCapability").value;
    appSettings.speed = $("speed").value;
    await fetch("/plugins/signalk-ajrm-marine-planning/gate/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedGate: appSettings.selectedGate,
        selectedHeading: appSettings.selectedHeading,
        selectedCrewCapability: appSettings.selectedCrewCapability,
        speed: appSettings.speed
      })
    });
  } catch {
    // Selection persistence is helpful, but should never block replanning.
  }
}

function renderLocationConstantsTable() {
  const thead = $("locationTable").querySelector("thead");
  const tbody = $("locationTable").querySelector("tbody");
  thead.innerHTML = `<tr>${locationConstantColumns.map((column) => `<th>${column.label}</th>`).join("")}</tr>`;
  tbody.innerHTML = Object.values(locationConstants).map((location) => {
    const cells = locationConstantColumns.map((column) => {
      if (column.type === "link") {
        const href = googleMapsUrl(location);
        const link = href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">View map</a>`
          : "";
        return `<td>${link}</td>`;
      }
      const rawValue = location[column.key];
      const value = column.type === "duration" ? displayDuration(rawValue) : rawValue;
      return `<td>${escapeHtml(String(value ?? ""))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
}

function tideRowsFromApi(payload) {
  const events = Array.isArray(payload.events)
    ? [...payload.events].sort((a, b) => Date.parse(a.DateTime) - Date.parse(b.DateTime))
    : [];
  currentTideEvents = events;
  const tideEvents = events
    .filter((event) => event.EventType === "HighWater" || event.EventType === "LowWater")
    .map((event) => ({
      time: String(event.DateTime || "").replace("T", " ").slice(0, 16),
      type: event.EventType === "HighWater" ? "HW" : "LW",
      height: Number(event.Height)
    }));
  return tideEvents.length ? tideEventsToRangeRows(tideEvents) : null;
}

function tideEventsToRangeRows(tideEvents) {
  const eventRows = tideEvents.map((event, index) => {
    const previous = [...tideEvents.slice(0, index)].reverse().find((candidate) => candidate.type !== event.type);
    const next = tideEvents.slice(index + 1).find((candidate) => candidate.type !== event.type);
    const pairedEvent = previous || next;
    const range = pairedEvent ? Math.abs(event.height - pairedEvent.height) : Number.NaN;
    return {
      time: event.time,
      type: event.type,
      height: event.height,
      range
    };
  });
  const rows = [["Time (UT)", "Tide", "Height (m)", "Range (m)", "% Spring"]];
  for (const row of eventRows) {
    const range = Number(row.range);
    const springPercent = springPercentFromReferenceRange(range);
    rows.push([row.time, row.type, row.height, Number.isNaN(range) ? "" : range, springPercent]);
  }
  return rows;
}

function springPercentFromReferenceRange(range) {
  const tideRange = Number(range);
  if (Number.isNaN(tideRange)) return "";
  const mhws = Number(appSettings.standardMhws);
  const mhwn = Number(appSettings.standardMhwn);
  const mlwn = Number(appSettings.standardMlwn);
  const mlws = Number(appSettings.standardMlws);
  const springRange = mhws - mlws;
  const neapRange = mhwn - mlwn;
  const spread = springRange - neapRange;
  if (![springRange, neapRange, spread].every(Number.isFinite) || spread <= 0) return "";
  return (tideRange - neapRange) / spread;
}

function beaufortRows() {
  const rows = [["Force", "Description", "Knots", "m/s"]];
  for (const band of beaufortBounds) {
    const knotRange = Number.isFinite(band.max) ? `${band.min}-${band.max - 1}` : `${band.min}+`;
    const minMs = band.min * settingNumber("knotsToMs");
    const maxMs = Number.isFinite(band.max) ? ((band.max - 1) * settingNumber("knotsToMs")) : null;
    const msRange = maxMs === null ? `${minMs.toFixed(1)}+` : `${minMs.toFixed(1)}-${maxMs.toFixed(1)}`;
    rows.push([band.force, band.description, knotRange, msRange]);
  }
  return rows;
}

function comfortConstantsRows() {
  const rows = [[
    "Crew Capability",
    "Beating Acceptable Bft",
    "Beating Strenuous Bft",
    "Beating Dangerous Bft",
    "Offwind Strenuous Bft",
    "Offwind Dangerous Bft",
    "Strong Foul Ratio",
    "Gust Base Limit (kn)",
    "Gust Beating Penalty (kn)",
    "Gust Beam Penalty (kn)",
    "Exposed Sea Height (m)",
    "Exposed Sea Penalty (kn)",
    "Wind-Over-Tide Penalty (kn)",
    "Major Gate Penalty (kn)",
    "Major Gate Tide (kn)",
    "Beating Strenuous Wave (m)",
    "Beating Dangerous Wave (m)",
    "Offwind Strenuous Wave (m)",
    "Offwind Dangerous Wave (m)",
    "Hobby Multiplier"
  ]];
  for (const profile of crewProfiles) {
    const settings = crewComfortSettings(profile.key);
    rows.push([
      profile.label,
      settings.beatingAcceptableBft.toFixed(0),
      settings.beatingStrenuousBft.toFixed(0),
      settings.beatingDangerousBft.toFixed(0),
      settings.offwindStrenuousBft.toFixed(0),
      settings.offwindDangerousBft.toFixed(0),
      settings.strongFoulRatio.toFixed(2),
      settings.gustBaseLimitKn.toFixed(0),
      settings.gustBeatingPenaltyKn.toFixed(0),
      settings.gustBeamPenaltyKn.toFixed(0),
      settings.gustExposedWaveHeightM.toFixed(1),
      settings.gustExposedFetchPenaltyKn.toFixed(0),
      settings.gustWindOverTidePenaltyKn.toFixed(0),
      settings.gustMajorGatePenaltyKn.toFixed(0),
      settings.gustMajorGateTideKn.toFixed(1),
      settings.beatingStrenuousWaveM.toFixed(2),
      settings.beatingDangerousWaveM.toFixed(2),
      settings.offwindStrenuousWaveM.toFixed(2),
      settings.offwindDangerousWaveM.toFixed(2),
      settings.hobbyHorsingMultiplier.toFixed(2)
    ]);
  }
  return rows;
}

function renderComfortConstantsTable() {
  renderReadOnlyTable("comfortConstantsTable", comfortConstantsRows(), comfortConstantsRows()[0]);
}

function rebuildTidesFromLocationConstants() {
  syncGateOptions();
  applySelectedStandardPort();
  const settings = settingsFromControls();
  currentTideRows = tideCalculationRowsFromEvents(currentFetchedTideRows, settings.gate);
  renderReadOnlyTable("gateCalcTable", currentTideRows, gateCalculationColumns);
  recalculateCurrentPlan();
}

async function loadLocationConstants() {
  try {
    const response = await fetch("/plugins/signalk-ajrm-marine-planning/gate/location-constants");
    if (!response.ok) throw new Error(response.status === 404 ? "no saved file exists yet" : `server returned ${response.status}`);
    const saved = await response.json();
    applyLocationConstants(saved);
    renderLocationConstantsTable();
    rebuildTidesFromLocationConstants();
    $("locationConstantsStatus").textContent = "Loaded location constants.";
  } catch (error) {
    $("locationConstantsStatus").textContent = `Load failed: ${error.message}.`;
  }
}

function applyLocationConstants(saved) {
  for (const name of Object.keys(locationConstants)) delete locationConstants[name];
  for (const [name, values] of Object.entries(saved)) {
    locationConstants[name] = { location: name };
    for (const column of locationConstantColumns) {
      if (column.key === "location" || column.type === "link" || column.type === "actions") continue;
      if (Object.prototype.hasOwnProperty.call(values, column.key)) {
        locationConstants[name][column.key] = String(values[column.key]);
      }
    }
    locationConstants[name].location = name;
    locationConstants[name].standardPort = values.standardPort || null;
  }
  syncGateOptions();
}

function applySelectedStandardPort() {
  const standard = locationConstants[$("gate").value]?.standardPort;
  if (!standard) return;
  const levels = standard.referenceLevels || {};
  $("baseTideStationName").value = standard.name || "";
  $("baseTideStationId").value = standard.stationId || "";
  $("baseTideTimeStandard").value = "UT";
  for (const [id, key] of [["standardMhws", "mhws"], ["standardMhwn", "mhwn"], ["standardMlwn", "mlwn"], ["standardMlws", "mlws"]]) {
    if (Number.isFinite(Number(levels[key]))) $(id).value = Number(levels[key]);
  }
  appSettings = {
    ...appSettings,
    baseTideStationName: standard.name || "",
    baseTideStationId: standard.stationId || "",
    baseTideTimeStandard: "UT",
    standardMhws: Number(levels.mhws), standardMhwn: Number(levels.mhwn),
    standardMlwn: Number(levels.mlwn), standardMlws: Number(levels.mlws),
  };
}

async function loadSettings() {
  try {
    const response = await fetch("/plugins/signalk-ajrm-marine-planning/gate/settings");
    if (!response.ok) throw new Error(`server returned ${response.status}`);
    const settings = await response.json();
    appSettings = { ...appSettings, ...settings };
    if (settings.selectedHeading && [...$("heading").options].some((option) => option.value === settings.selectedHeading)) {
      $("heading").value = settings.selectedHeading;
    }
    if (settings.selectedCrewCapability && [...$("crewCapability").options].some((option) => option.value === settings.selectedCrewCapability)) {
      $("crewCapability").value = settings.selectedCrewCapability;
    }
    $("speed").value = settings.speed || appSettings.speed;
    for (const id of calculationSettingIds) {
      if ($(id)) $(id).value = settings[id] || appSettings[id];
    }
    $("settingsStatus").textContent = settings.ukhoApiKeySet ? "Shared UKHO service is configured in Tidal Database." : "Configure the shared UKHO service in Tidal Database.";
  } catch (error) {
    $("settingsStatus").textContent = `Settings load failed: ${error.message}.`;
  }
}

async function saveSettings() {
  try {
    const selectedGate = $("gate").value;
    const selectedHeading = $("heading").value;
    const selectedCrewCapability = $("crewCapability").value;
    const speed = $("speed").value.trim();
    const calculationSettings = Object.fromEntries(calculationSettingIds.map((id) => [id, $(id).value.trim()]));
    const response = await fetch("/plugins/signalk-ajrm-marine-planning/gate/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedGate,
        selectedHeading,
        selectedCrewCapability,
        speed,
        ...calculationSettings
      })
    });
    if (!response.ok) throw new Error(`server returned ${response.status}`);
    const settings = await response.json();
    appSettings = { ...appSettings, ...settings };
    if (settings.selectedGate && locationConstants[settings.selectedGate]) $("gate").value = settings.selectedGate;
    if (settings.selectedHeading) $("heading").value = settings.selectedHeading;
    if (settings.selectedCrewCapability) $("crewCapability").value = settings.selectedCrewCapability;
    $("speed").value = settings.speed || speed;
    for (const id of calculationSettingIds) {
      if ($(id)) $(id).value = settings[id] || calculationSettings[id];
    }
    if (currentTideEvents?.length) {
      currentFetchedTideRows = tideRowsFromApi({ events: currentTideEvents });
      renderReadOnlyTable("fetchedTideTable", currentFetchedTideRows, fetchedTideColumns);
      rebuildTidesFromLocationConstants();
    }
    $("settingsStatus").textContent = settings.ukhoApiKeySet ? "Planner settings saved; UKHO remains managed by Tidal Database." : "Planner settings saved; configure UKHO in Tidal Database.";
  } catch (error) {
    $("settingsStatus").textContent = `Settings save failed: ${error.message}.`;
  }
}

function recalculateCurrentPlan() {
  updateCourseDirectionWarning();
  if (!currentWeatherRows || !currentTideRows || currentTideRows.length < 2) {
    currentPlanRows = null;
    updateFreshness();
    return;
  }
  const planWeatherRows = limitWeatherRowsToTodayOnward(limitWeatherRowsToTideWindow(currentWeatherRows, currentTideRows));
  const rows = interpolateTidalFlow(planWeatherRows, currentTideRows, settingsFromControls());
  currentPlanRows = rows;
  summarize(rows);
  renderTable(rows);
  renderHourOptions(rows);
  renderHourVisual();
  updateFreshness();
}

function settingsFromControls() {
  const settings = {
    gate: $("gate").value,
    hdg: Number($("heading").value),
    crewCapability: $("crewCapability").value,
    yachtSpeed: Number($("speed").value),
    slackThreshold: Number($("slack").value),
    displacement: Number($("displacement").value),
    lwl: Number($("lwl").value)
  };
  for (const id of calculationSettingIds) settings[id] = settingNumber(id);
  Object.assign(settings, crewComfortSettings(settings.crewCapability));
  return settings;
}

async function loadWeatherForGate(settings, options = {}) {
  const gate = settings.gate;
  try {
    const location = locationConstants[gate];
    const params = new URLSearchParams({
      location: gate,
      lat: location.latitude,
      lon: location.longitude,
      days: "16",
      marineDays: "8"
    });
    if (options.manualRefresh) params.set("refresh", "1");
    const response = await fetch(`/plugins/signalk-ajrm-marine-planning/gate/weather?${params}`);
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const detail = errorPayload.detail ? `: ${errorPayload.detail}` : "";
      throw new Error(`${errorPayload.error || `Weather provider returned ${response.status}`}${detail}`);
    }
    const payload = await response.json();
    const rows = weatherRowsFromApi(payload);
    if (!rows) throw new Error("Weather response did not contain hourly data");
    const meta = {
      ...payload.cache,
      location: gate,
      latitude: payload.latitude,
      longitude: payload.longitude,
      weatherDays: payload.weatherDays,
      marineDays: payload.marineDays
    };
    weatherRowsByGate.set(gate, rows);
    weatherStatusByGate.set(gate, meta);
    currentWeatherMeta = meta;
    $("dataStatus").textContent = "";
    return rows;
  } catch (error) {
    weatherRowsByGate.delete(gate);
    weatherStatusByGate.set(gate, {
      location: gate,
      error: error.message,
      fetchedAt: null
    });
    currentWeatherMeta = null;
    $("dataStatus").textContent = `Weather data was not loaded for ${gate} (${error.message}).`;
    if (options.manualRefresh) throw error;
    return null;
  }
}

async function refreshWeather(options = {}) {
  const settings = settingsFromControls();
  if (!options.skipBusy) setRefreshButtonsBusy(["refreshWeather", "refreshAll"], true, "Refreshing weather...");
  $("dataStatus").textContent = `Refreshing weather for ${settings.gate}...`;
  const card = $("weatherFreshness");
  if (card) {
    card.dataset.expired = "false";
    card.querySelector("strong").textContent = "Refreshing weather...";
    card.querySelector("small").textContent = settings.gate;
  }
  try {
    const rows = await loadWeatherForGate(settings, { manualRefresh: true });
    if (rows) {
      currentWeatherRows = rows;
      renderReadOnlyTable("weatherDataTable", currentWeatherRows, fetchedWeatherColumns);
      recalculateCurrentPlan();
      $("dataStatus").textContent = `Weather ${cacheStatusVerb(currentWeatherMeta, "updated from web")} for ${settings.gate}.`;
      const warning = manualRefreshWarning("Weather", currentWeatherMeta);
      if (warning && !options.suppressAlerts) window.alert(warning);
      return { ok: true, warning };
    } else {
      updateFreshness();
      const warning = `Weather could not be refreshed from the web for ${settings.gate}.`;
      if (!options.suppressAlerts) window.alert(warning);
      return { ok: false, warning };
    }
  } catch (error) {
    const warning = `Weather could not be refreshed from the web for ${settings.gate}.\n\nReason: ${error.message}`;
    if (!options.suppressAlerts) window.alert(warning);
    return { ok: false, warning };
  } finally {
    if (!options.skipBusy) setRefreshButtonsBusy(["refreshWeather", "refreshAll"], false);
  }
}

async function refreshTides(options = {}) {
  const settings = settingsFromControls();
  const isManualRefresh = options.manualRefresh !== false;
  if (!options.skipBusy) setRefreshButtonsBusy(["refreshTides", "refreshAll"], true, isManualRefresh ? "Refreshing tides..." : "Loading tides...");
  if (!options.silent) {
    $("dataStatus").textContent = `${isManualRefresh ? "Refreshing" : "Loading stored"} tides for ${settings.gate}...`;
    const card = $("tideFreshness");
    if (card) {
      card.dataset.expired = "false";
      card.querySelector("strong").textContent = isManualRefresh ? "Refreshing tides..." : "Loading stored tides...";
      card.querySelector("small").textContent = settings.gate;
    }
  }
  try {
    const params = new URLSearchParams({ location: settings.gate });
    if (isManualRefresh) params.set("refresh", "1");
    const response = await fetch(`/plugins/signalk-ajrm-marine-planning/gate/tides?${params}`);
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || `Tide provider returned ${response.status}`);
    }
    const payload = await response.json();
    const rows = tideRowsFromApi(payload);
    if (!rows) throw new Error("Tide response did not contain high-water rows");
    currentFetchedTideRows = rows;
    currentTideMeta = payload.cache;
    renderReadOnlyTable("fetchedTideTable", currentFetchedTideRows, fetchedTideColumns);
    currentTideRows = tideCalculationRowsFromEvents(currentFetchedTideRows, settings.gate);
    renderReadOnlyTable("gateCalcTable", currentTideRows, gateCalculationColumns);
    $("dataStatus").textContent = `Tides ${cacheStatusVerb(currentTideMeta, "updated from web")} for ${settings.gate}.`;
    recalculateCurrentPlan();
    const warning = isManualRefresh ? manualRefreshWarning("Tide data", currentTideMeta) : "";
    if (warning && !options.suppressAlerts) window.alert(warning);
    return { ok: true, warning };
  } catch (error) {
    currentTideMeta = null;
    currentFetchedTideRows = null;
    currentTideRows = null;
    $("dataStatus").textContent = `Tide data was not loaded for ${settings.gate} (${error.message}).`;
    updateFreshness();
    const warning = `Tide data could not be refreshed from the web for ${settings.gate}.\n\nReason: ${error.message}`;
    if (isManualRefresh && !options.suppressAlerts) window.alert(warning);
    return { ok: false, warning };
  } finally {
    if (!options.skipBusy) setRefreshButtonsBusy(["refreshTides", "refreshAll"], false);
  }
}

async function refreshAll() {
  setRefreshButtonsBusy(["refreshWeather", "refreshTides", "refreshAll"], true, "Refreshing all...");
  try {
    const weatherResult = await refreshWeather({ skipBusy: true, suppressAlerts: true });
    const tideResult = await refreshTides({ skipBusy: true, manualRefresh: true, suppressAlerts: true });
    updateFreshness();
    const warnings = [weatherResult?.warning, tideResult?.warning].filter(Boolean);
    if (warnings.length) {
      $("dataStatus").textContent = `Refresh all used stored offline data for ${settingsFromControls().gate}.`;
      window.alert(warnings.join("\n\n"));
    } else {
      $("dataStatus").textContent = `Refresh all complete for ${settingsFromControls().gate}.`;
    }
  } finally {
    setRefreshButtonsBusy(["refreshWeather", "refreshTides", "refreshAll"], false);
  }
}

async function loadStoredData() {
  const settings = settingsFromControls();
  $("locationLabel").textContent = settings.gate;
  updateGateDirections();
  currentWeatherRows = await loadWeatherForGate(settings);
  await refreshTides({ skipBusy: true, manualRefresh: false, silent: true });
  renderLocationConstantsTable();
  if (currentWeatherRows) renderReadOnlyTable("weatherDataTable", currentWeatherRows, fetchedWeatherColumns);
  if (currentTideRows) renderReadOnlyTable("gateCalcTable", currentTideRows, gateCalculationColumns);
  if (currentFetchedTideRows) renderReadOnlyTable("fetchedTideTable", currentFetchedTideRows, fetchedTideColumns);
  recalculateCurrentPlan();
}

$("gate").addEventListener("change", () => {
  savePlannerSelection();
  updateCourseDirectionWarning();
  loadStoredData();
});
$("heading").addEventListener("change", () => {
  savePlannerSelection();
  updateCourseDirectionWarning();
  recalculateCurrentPlan();
});
$("crewCapability").addEventListener("change", () => {
  savePlannerSelection();
  recalculateCurrentPlan();
});
$("speed").addEventListener("change", savePlannerSelection);
for (const id of ["speed", "slack", "lwl", "displacement", ...calculationSettingIds]) {
  $(id).addEventListener("input", () => {
    renderComfortConstantsTable();
    recalculateCurrentPlan();
  });
}
$("refreshWeather").addEventListener("click", refreshWeather);
$("refreshTides").addEventListener("click", refreshTides);
$("refreshAll").addEventListener("click", refreshAll);
$("saveSettings").addEventListener("click", saveSettings);
$("hourSelect").addEventListener("change", () => {
  updateHourStepButtons();
  renderHourVisual();
});
bindHourStepButton("previousHour", -1);
bindHourStepButton("nextHour", 1);
document.addEventListener("keydown", (event) => {
  if (!$("hourViewPanel").classList.contains("active")) return;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  stepSelectedHour(event.key === "ArrowUp" ? -1 : 1);
});

for (const button of document.querySelectorAll(".tabButton")) {
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll(".tabButton")) other.classList.remove("active");
    for (const panel of document.querySelectorAll(".tabPanel")) panel.classList.remove("active");
    button.classList.add("active");
    $(`${button.dataset.tab}Panel`).classList.add("active");
    if (button.dataset.tab === "about") renderAbout();
  });
}

function ensureHelpPopover() {
  let popover = document.querySelector(".helpPopover");
  if (!popover) {
    popover = document.createElement("div");
    popover.className = "helpPopover";
    popover.hidden = true;
    document.body.appendChild(popover);
  }
  return popover;
}

function showHelpPopover(icon) {
  const text = icon.getAttribute("aria-label") || icon.getAttribute("title") || "";
  if (!text) return;
  const popover = ensureHelpPopover();
  popover.textContent = text;
  popover.hidden = false;
  const rect = icon.getBoundingClientRect();
  const gap = 8;
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const left = Math.min(Math.max(12, rect.left + (rect.width / 2) - (width / 2)), window.innerWidth - width - 12);
  const above = rect.top - height - gap;
  const top = above > 12 ? above : Math.min(rect.bottom + gap, window.innerHeight - height - 12);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function hideHelpPopover() {
  const popover = document.querySelector(".helpPopover");
  if (popover) popover.hidden = true;
}

document.addEventListener("pointerover", (event) => {
  const icon = event.target.closest?.(".helpIcon");
  if (icon) showHelpPopover(icon);
});

document.addEventListener("pointerout", (event) => {
  if (event.target.closest?.(".helpIcon")) hideHelpPopover();
});

document.addEventListener("focusin", (event) => {
  const icon = event.target.closest?.(".helpIcon");
  if (icon) showHelpPopover(icon);
});

document.addEventListener("focusout", (event) => {
  if (event.target.closest?.(".helpIcon")) hideHelpPopover();
});

document.addEventListener("click", (event) => {
  const icon = event.target.closest?.(".helpIcon");
  if (!icon) {
    hideHelpPopover();
    return;
  }
  event.preventDefault();
  showHelpPopover(icon);
});

async function renderAbout() {
  $("webVersion").textContent = webVersion;
  try {
    const response = await fetch("/plugins/signalk-ajrm-marine-planning/gate/version");
    if (!response.ok) throw new Error("Version endpoint failed");
    const data = await response.json();
    $("serverVersion").textContent = data.serverVersion || "-";
    $("serverAddress").textContent = `${data.host || location.hostname}:${data.port || location.port || "4173"}`;
    $("serverStarted").textContent = formatLocalDateTime(data.startedAt);
  } catch {
    $("serverVersion").textContent = "Needs server restart";
    $("serverAddress").textContent = location.host || "-";
    $("serverStarted").textContent = "-";
  }
}

async function initializeApp() {
  await loadSettings();
  await loadLocationConstants();
  syncGateOptions(appSettings.selectedGate || $("gate").value);
  if (appSettings.selectedHeading && [...$("heading").options].some((option) => option.value === appSettings.selectedHeading)) {
    $("heading").value = appSettings.selectedHeading;
  }
  if (appSettings.selectedCrewCapability && [...$("crewCapability").options].some((option) => option.value === appSettings.selectedCrewCapability)) {
    $("crewCapability").value = appSettings.selectedCrewCapability;
  }
  renderReadOnlyTable("beaufortTable", beaufortRows(), ["Force", "Description", "Knots", "m/s"]);
  renderComfortConstantsTable();
  updateCourseDirectionWarning();
  await loadStoredData();
  renderAbout();
}

initializeApp();
setInterval(updateFreshness, 60000);
