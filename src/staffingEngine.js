import { STATION_DISTANCE_MILES } from "./data/testEnvironment.js";

export const VOLUNTARY_TIERS = [
  "REGULAR_KD",
  "FLOATING_KD",
  "KDS_OFF",
  "DAY_STAFF",
  "OFF_GOING",
  "ON_COMING",
];

export const TIER_LABELS = {
  REGULAR_KD: "Regular Kelly Day",
  FLOATING_KD: "Floating Kelly Day",
  KDS_OFF: "Kelly Day Swap — Not Working",
  DAY_STAFF: "Day Staff — Signed Up / 30-Day Eligible",
  OFF_GOING: "Off-Going Shift",
  ON_COMING: "On-Coming Shift",
  MANDATORY: "Mandatory Rotation",
};

export const DEFAULT_RULE_CONFIG = {
  offGoingCutoff: "22:00",
  dayStaffLookbackDays: 30,
  mandatoryHoursLimit: 60,
  fairnessMeasure: "OPPORTUNITIES",
  tieBreaker: "IN_GRADE_SENIORITY",
  chargeExpiredDeliveredOffer: true,
  chargeFailedDelivery: false,
  chargeExactly12Hours: false,
  allowAdvanceSignupPriorityJump: false,
  usePreviousRosterPositionForProximity: true,
  mandatoryMode: "RECOMMENDATION_ONLY",
  offerWindows: {
    "18:00": 30,
    "20:00": 20,
    "06:15": 10,
    "08:00": 5,
  },
};

function localDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

export function computeShiftKelly(dateStr) {
  const anchor = new Date("2026-04-21T12:00:00");
  const target = localDate(dateStr);
  const diffDays = Math.round((target - anchor) / 86400000);
  const shifts = ["C", "A", "B"];
  const shift = shifts[((diffDays % 3) + 3) % 3];
  const kelly = (((Math.floor(diffDays / 3) % 8) + 8) % 8) + 1;
  return { shift, kelly };
}

export function adjacentShifts(dateStr) {
  const target = localDate(dateStr);
  const previous = new Date(target);
  const next = new Date(target);
  previous.setDate(previous.getDate() - 1);
  next.setDate(next.getDate() + 1);
  const toDateString = (date) => date.toISOString().slice(0, 10);
  return {
    offGoing: computeShiftKelly(toDateString(previous)).shift,
    onComing: computeShiftKelly(toDateString(next)).shift,
  };
}

function daysBetween(earlier, later) {
  if (!earlier) return Number.POSITIVE_INFINITY;
  return Math.floor((localDate(later) - localDate(earlier)) / 86400000);
}

function exactOrRideUp(person, vacancyRank) {
  if (person.rank === vacancyRank) return { eligible: true, exactRank: true, workback: null };
  if (vacancyRank === "ENG" && person.rank === "FF" && person.qualifications.includes("RELIEF_DRIVER")) {
    return { eligible: true, exactRank: false, workback: "FF → ENG" };
  }
  if (vacancyRank === "LT" && person.rank === "ENG" && person.qualifications.includes("ACTING_OFFICER")) {
    return { eligible: true, exactRank: false, workback: "ENG → LT" };
  }
  if (vacancyRank === "DC" && person.rank === "LT" && person.qualifications.includes("ACTING_DC")) {
    return { eligible: true, exactRank: false, workback: "LT → DC" };
  }
  if (vacancyRank === "AC" && person.rank === "DC" && person.qualifications.includes("ACTING_AC")) {
    return { eligible: true, exactRank: false, workback: "DC → AC" };
  }
  return { eligible: false, exactRank: false, workback: null };
}

function hasRequiredQualifications(person, vacancy) {
  const required = vacancy.requiredQualifications || [];
  return required.every((qualification) => person.qualifications.includes(qualification));
}

function isDateListed(person, field, date) {
  return (person[field] || []).includes(date);
}

function candidateTier(person, vacancy, config) {
  const { shift, kelly } = computeShiftKelly(vacancy.date);
  const { offGoing, onComing } = adjacentShifts(vacancy.date);
  const runTime = vacancy.runTime || "18:00";
  const usesOnComingPool = String(vacancy.stage || "").startsWith("SHIFT_DAY_");

  if (person.shift === shift && Number(person.kellyGroup) === Number(kelly)) return "REGULAR_KD";
  if (person.shift === shift && isDateListed(person, "floatingKellyDates", vacancy.date)) return "FLOATING_KD";
  if (person.shift === shift && isDateListed(person, "kdsOffDates", vacancy.date)) return "KDS_OFF";

  if (person.shift === "DAY") {
    const weekday = localDate(vacancy.date).getDay();
    const isOffAllShift = (person.dayStaffOffWeekdays || []).includes(weekday);
    const outsideLookback = daysBetween(person.lastDayStaffOpportunity, vacancy.date) >= config.dayStaffLookbackDays;
    if (person.dayStaffSignedUp && isOffAllShift && outsideLookback) return "DAY_STAFF";
    return null;
  }

  if (!usesOnComingPool && runTime < config.offGoingCutoff && person.shift === offGoing) return "OFF_GOING";
  if ((usesOnComingPool || runTime >= config.offGoingCutoff) && person.shift === onComing) return "ON_COMING";
  return null;
}

function proximityMiles(person, vacancy) {
  const fromStation = Number(person.previousShiftStation || person.station);
  return STATION_DISTANCE_MILES[Number(vacancy.station)]?.[fromStation] ?? 999;
}

function opportunityValue(person, tier) {
  if (tier === "REGULAR_KD") return person.regularKdOpportunities || 0;
  if (tier === "FLOATING_KD") return person.floatingKdOpportunities || 0;
  return person.voluntaryOpportunities || 0;
}

function voluntarySort(a, b) {
  if (a.tierIndex !== b.tierIndex) return a.tierIndex - b.tierIndex;
  if (a.exactRank !== b.exactRank) return a.exactRank ? -1 : 1;
  if (["OFF_GOING", "ON_COMING"].includes(a.tier) && a.proximityMiles !== b.proximityMiles) {
    return a.proximityMiles - b.proximityMiles;
  }
  if (a.opportunityCount !== b.opportunityCount) return a.opportunityCount - b.opportunityCount;
  return a.person.inGradeSeniority - b.person.inGradeSeniority;
}

function mandatoryBypassReason(person, vacancy, config) {
  if ((person.overtimeHours30 || 0) + Number(vacancy.durationHours || 24) > config.mandatoryHoursLimit) {
    return `Would exceed ${config.mandatoryHoursLimit} hours`;
  }
  if (isDateListed(person, "offDutyEventDates", vacancy.date)) return "Approved off-duty event";
  if (isDateListed(person, "paidTravelDates", vacancy.date)) return "Approved paid travel";
  return null;
}

export function buildCandidateQueue(vacancy, profiles, options = {}) {
  const config = { ...DEFAULT_RULE_CONFIG, ...(options.config || {}) };
  const targetShift = computeShiftKelly(vacancy.date).shift;
  const excludedIds = new Set(options.excludedIds || []);
  const contactedIds = new Set(vacancy.contactedIds || []);
  const mandatoryBypassIds = new Set(vacancy.mandatoryBypassIds || []);
  const voluntary = [];
  const mandatory = [];

  profiles.forEach((person) => {
    if (!person.active || excludedIds.has(person.id)) return;
    const rankFit = exactOrRideUp(person, vacancy.rank);
    if (!rankFit.eligible || !hasRequiredQualifications(person, vacancy)) return;

    const tier = candidateTier(person, vacancy, config);
    if (tier && !contactedIds.has(person.id)) {
      voluntary.push({
        person,
        tier,
        tierIndex: VOLUNTARY_TIERS.indexOf(tier),
        exactRank: rankFit.exactRank,
        workback: rankFit.workback,
        opportunityCount: opportunityValue(person, tier),
        proximityMiles: proximityMiles(person, vacancy),
        mandatoryBypass: null,
      });
    }

    const offDutyForMandatory = person.shift === "DAY" || person.shift !== targetShift || ["REGULAR_KD", "FLOATING_KD", "KDS_OFF"].includes(tier);
    if (offDutyForMandatory && (person.shift !== "DAY" || options.includeDayStaffInMandatory !== false) && !mandatoryBypassIds.has(person.id)) {
      mandatory.push({
        person,
        tier: "MANDATORY",
        tierIndex: VOLUNTARY_TIERS.length,
        exactRank: rankFit.exactRank,
        workback: rankFit.workback,
        opportunityCount: person.voluntaryOpportunities || 0,
        proximityMiles: proximityMiles(person, vacancy),
        mandatoryBypass: mandatoryBypassReason(person, vacancy, config),
      });
    }
  });

  voluntary.sort(voluntarySort);
  mandatory.sort((a, b) => {
    if (a.person.mandatoryOrder !== b.person.mandatoryOrder) return a.person.mandatoryOrder - b.person.mandatoryOrder;
    return b.person.departmentSeniority - a.person.departmentSeniority;
  });

  const voluntaryIds = new Set(voluntary.map((candidate) => candidate.person.id));
  const mandatoryOnly = mandatory.filter((candidate) => !voluntaryIds.has(candidate.person.id));
  return [...voluntary, ...mandatoryOnly];
}

export function firstActionableCandidate(queue) {
  const voluntary = queue.find((candidate) => candidate.tier !== "MANDATORY");
  if (voluntary) return voluntary;
  return queue.find((candidate) => candidate.tier === "MANDATORY" && !candidate.mandatoryBypass) || null;
}

export function groupCandidateQueue(queue) {
  return queue.reduce((groups, candidate) => {
    if (!groups[candidate.tier]) groups[candidate.tier] = [];
    groups[candidate.tier].push(candidate);
    return groups;
  }, {});
}

export function chargeFieldForTier(tier) {
  if (tier === "REGULAR_KD") return "regularKdOpportunities";
  if (tier === "FLOATING_KD") return "floatingKdOpportunities";
  if (tier === "MANDATORY") return null;
  return "voluntaryOpportunities";
}

export function applyOfferOutcome(profile, tier, outcome, vacancy, profiles, config = DEFAULT_RULE_CONFIG) {
  const updated = { ...profile };
  const duration = Number(vacancy.durationHours || 24);
  const isShortOffer = duration < 12 || (duration === 12 && !config.chargeExactly12Hours);
  const chargeable = ["ACCEPTED", "REFUSED", "EXPIRED"].includes(outcome) && !isShortOffer;
  const chargeField = chargeFieldForTier(tier);

  if (chargeable && chargeField) updated[chargeField] = (updated[chargeField] || 0) + 1;
  if (tier === "DAY_STAFF" && chargeable) updated.lastDayStaffOpportunity = vacancy.date;
  if (outcome === "ACCEPTED") updated.overtimeHours30 = (updated.overtimeHours30 || 0) + duration;

  if (tier === "MANDATORY" && outcome === "ACCEPTED") {
    updated.mandatoryOrder = Math.max(...profiles.map((person) => person.mandatoryOrder || 0)) + 1;
  }

  return updated;
}

export function offerWindowMinutes(runTime, config = DEFAULT_RULE_CONFIG) {
  return config.offerWindows?.[runTime] || 15;
}

export function describeCandidate(candidate) {
  if (!candidate) return "No eligible candidate";
  const details = [`${candidate.opportunityCount} charged opportunities`];
  if (["OFF_GOING", "ON_COMING"].includes(candidate.tier)) {
    details.push(`${candidate.proximityMiles.toFixed(1)} mi from vacancy`);
  }
  if (candidate.workback) details.push(candidate.workback);
  if (candidate.mandatoryBypass) details.push(candidate.mandatoryBypass);
  return details.join(" • ");
}
