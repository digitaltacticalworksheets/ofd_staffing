import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULE_CONFIG,
  applyOfferOutcome,
  buildCandidateQueue,
  computeShiftKelly,
} from "../src/staffingEngine.js";

const testDate = "2026-08-14";
const targetShift = computeShiftKelly(testDate).shift;

function person(id, overrides = {}) {
  return {
    id,
    name: `TEST — ${id}`,
    rank: "FF",
    shift: targetShift,
    station: 1,
    previousShiftStation: 1,
    unit: "E1",
    kellyGroup: computeShiftKelly(testDate).kelly,
    qualifications: [],
    regularKdOpportunities: 0,
    floatingKdOpportunities: 0,
    voluntaryOpportunities: 0,
    overtimeHours30: 0,
    inGradeSeniority: 10,
    departmentSeniority: 10,
    mandatoryOrder: 10,
    floatingKellyDates: [],
    kdsOffDates: [],
    offDutyEventDates: [],
    paidTravelDates: [],
    active: true,
    ...overrides,
  };
}

const vacancy = {
  id: "VAC-TEST",
  date: testDate,
  station: 1,
  unit: "E1",
  rank: "FF",
  durationHours: 24,
  requiredQualifications: [],
  stage: "SHIFT_PRIOR_1800",
  runTime: "18:00",
  contactedIds: [],
  mandatoryBypassIds: [],
};

test("Regular KD candidates remain ahead of later tiers and sort by opportunity then seniority", () => {
  const profiles = [
    person("KD-HIGH", { regularKdOpportunities: 4, inGradeSeniority: 1 }),
    person("KD-LOW-JUNIOR", { regularKdOpportunities: 1, inGradeSeniority: 8 }),
    person("KD-LOW-SENIOR", { regularKdOpportunities: 1, inGradeSeniority: 2 }),
    person("FKD", { kellyGroup: 8, floatingKellyDates: [testDate] }),
  ];
  const queue = buildCandidateQueue(vacancy, profiles);
  assert.deepEqual(queue.slice(0, 4).map((candidate) => candidate.person.id), ["KD-LOW-SENIOR", "KD-LOW-JUNIOR", "KD-HIGH", "FKD"]);
});

test("refusal and delivered expiration charge one opportunity, failed delivery does not", () => {
  const base = person("OUTCOME", { regularKdOpportunities: 3 });
  assert.equal(applyOfferOutcome(base, "REGULAR_KD", "REFUSED", vacancy, [base]).regularKdOpportunities, 4);
  assert.equal(applyOfferOutcome(base, "REGULAR_KD", "EXPIRED", vacancy, [base]).regularKdOpportunities, 4);
  assert.equal(applyOfferOutcome(base, "REGULAR_KD", "FAILED_DELIVERY", vacancy, [base]).regularKdOpportunities, 3);
});

test("the unresolved exactly-12-hour rule defaults to non-chargeable in the test configuration", () => {
  const base = person("SHORT", { regularKdOpportunities: 3 });
  const shortVacancy = { ...vacancy, durationHours: 12 };
  assert.equal(applyOfferOutcome(base, "REGULAR_KD", "ACCEPTED", shortVacancy, [base]).regularKdOpportunities, 3);
  assert.equal(applyOfferOutcome(base, "REGULAR_KD", "REFUSED", shortVacancy, [base]).regularKdOpportunities, 3);
});

test("Day Staff signup and rolling 30-day eligibility apply only to the voluntary pool", () => {
  const weekday = new Date(`${testDate}T12:00:00`).getDay();
  const profiles = [
    person("DAY-ELIGIBLE", { shift: "DAY", kellyGroup: null, dayStaffSignedUp: true, dayStaffOffWeekdays: [weekday], lastDayStaffOpportunity: "2026-06-01" }),
    person("DAY-RECENT", { shift: "DAY", kellyGroup: null, dayStaffSignedUp: true, dayStaffOffWeekdays: [weekday], lastDayStaffOpportunity: "2026-08-01" }),
    person("DAY-NO-SIGNUP", { shift: "DAY", kellyGroup: null, dayStaffSignedUp: false, dayStaffOffWeekdays: [weekday], lastDayStaffOpportunity: "2026-06-01" }),
  ];
  const queue = buildCandidateQueue(vacancy, profiles);
  assert.equal(queue.find((candidate) => candidate.person.id === "DAY-ELIGIBLE" && candidate.tier === "DAY_STAFF")?.tier, "DAY_STAFF");
  assert.equal(queue.some((candidate) => candidate.person.id === "DAY-RECENT" && candidate.tier === "DAY_STAFF"), false);
  assert.equal(queue.some((candidate) => candidate.person.id === "DAY-NO-SIGNUP" && candidate.tier === "DAY_STAFF"), false);
  assert.equal(queue.some((candidate) => candidate.person.id === "DAY-NO-SIGNUP" && candidate.tier === "MANDATORY"), true);
});

test("off-going proximity uses the prior-roster station", () => {
  const profiles = [
    person("NEAR", { shift: "C", kellyGroup: 8, station: 6, previousShiftStation: 1, voluntaryOpportunities: 4 }),
    person("FAR", { shift: "C", kellyGroup: 8, station: 1, previousShiftStation: 6, voluntaryOpportunities: 0 }),
  ];
  const queue = buildCandidateQueue(vacancy, profiles).filter((candidate) => candidate.tier === "OFF_GOING");
  assert.equal(queue[0].person.id, "NEAR");
  assert.equal(queue[0].proximityMiles, 0);
});

test("mandatory bypass rules flag hours and successful assignment moves the rotation", () => {
  const candidate = person("MANDATORY", { shift: "B", kellyGroup: 8, overtimeHours30: 48, mandatoryOrder: 1 });
  const queue = buildCandidateQueue(vacancy, [candidate]);
  const mandatory = queue.find((item) => item.tier === "MANDATORY");
  assert.equal(mandatory.mandatoryBypass, `Would exceed ${DEFAULT_RULE_CONFIG.mandatoryHoursLimit} hours`);
  const eligible = { ...candidate, overtimeHours30: 0 };
  const moved = applyOfferOutcome(eligible, "MANDATORY", "ACCEPTED", vacancy, [eligible, person("OTHER", { mandatoryOrder: 9 })]);
  assert.equal(moved.mandatoryOrder, 10);
});

test("employees already working the target shift are not placed in the mandatory pool", () => {
  const working = person("ON-DUTY", { kellyGroup: 8 });
  const offDuty = person("OFF-DUTY", { shift: "B", kellyGroup: 8 });
  const queue = buildCandidateQueue(vacancy, [working, offDuty]);
  assert.equal(queue.some((candidate) => candidate.person.id === "ON-DUTY" && candidate.tier === "MANDATORY"), false);
  assert.equal(queue.some((candidate) => candidate.person.id === "OFF-DUTY" && candidate.tier === "MANDATORY"), true);
});
