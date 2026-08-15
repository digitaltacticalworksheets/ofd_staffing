import test from "node:test";
import assert from "node:assert/strict";
import {
  PAY_CODES,
  PAY_CODE_BY_ID,
  applyPersonnelMove,
  applyRosterPayCode,
  buildOfferNotification,
  createPayEntry,
  rosterPayCodeLabel,
} from "../src/workforceConfig.js";
import { CREDENTIAL_LETTERS, TEST_PROFILES } from "../src/data/testEnvironment.js";

function profile(overrides = {}) {
  return {
    id: "TEST-001",
    name: "TEST — Archer, Avery",
    rank: "FF",
    shift: "A",
    station: 1,
    unit: "E1",
    position: "E1-FF-1",
    previousShiftStation: 1,
    previousShiftUnit: "E1",
    kellyGroup: 2,
    inGradeSeniority: 10,
    regularKdOpportunities: 4,
    floatingKdOpportunities: 1,
    voluntaryOpportunities: 7,
    overtimeHours30: 24,
    mandatoryOrder: 19,
    qualifications: [],
    ...overrides,
  };
}

test("the pay-code catalog contains every discussed Telestaff category and preserves known Workday IDs", () => {
  const required = [
    "REGULAR_TIME", "OVERTIME", "VACATION", "TRAVEL_PAY_1", "TRAVEL_PAY_2", "TRANSPORT_PAY",
    "WHC_ENGINEER", "WHC_LIEUTENANT", "WHC_DISTRICT_CHIEF", "WHC_ASSISTANT_CHIEF",
    "TIME_SWAP_WORKING", "TIME_SWAP_OFF", "DOI", "RDOF", "RDO", "KDS_WORKING", "KDS_OFF",
  ];
  assert.deepEqual(required.filter((id) => !PAY_CODE_BY_ID[id]), []);
  assert.equal(PAY_CODE_BY_ID.TRAVEL_PAY_1.workdayCode, "TPFIR");
  assert.equal(PAY_CODE_BY_ID.TRANSPORT_PAY.workdayCode, "FTRAN");
  assert.equal(PAY_CODE_BY_ID.WHC_ENGINEER.workdayCode, "WHCNP");
  assert.equal(PAY_CODE_BY_ID.RDO.status, "OPEN");
  assert.equal(PAY_CODES.length, required.length);
});

test("a personnel transfer updates the assignment but preserves overtime and rotation history", () => {
  const original = profile();
  const result = applyPersonnelMove([original], original.id, {
    type: "TRANSFER",
    effectiveDate: "2026-08-14",
    shift: "B",
    station: 6,
    unit: "E6",
    rank: "FF",
    kellyGroup: 5,
  }, "2026-08-13T20:00:00.000Z");
  const moved = result.profiles[0];
  assert.equal(moved.shift, "B");
  assert.equal(moved.station, 6);
  assert.equal(moved.previousShiftStation, 1);
  assert.equal(moved.regularKdOpportunities, 4);
  assert.equal(moved.voluntaryOpportunities, 7);
  assert.equal(moved.mandatoryOrder, 19);
  assert.equal(moved.transferHistory.length, 1);
});

test("a promotion moves the employee to the bottom of the new in-grade list", () => {
  const original = profile();
  const existingEngineer = profile({ id: "TEST-002", rank: "ENG", inGradeSeniority: 22 });
  const result = applyPersonnelMove([original, existingEngineer], original.id, {
    type: "PROMOTION",
    effectiveDate: "2026-08-14",
    shift: "A",
    station: 1,
    unit: "E1",
    rank: "ENG",
    kellyGroup: 2,
  });
  assert.equal(result.profiles[0].rank, "ENG");
  assert.equal(result.profiles[0].inGradeSeniority, 23);
});

test("an overtime notification includes the offer details and employee response instructions", () => {
  const person = profile();
  const vacancy = {
    id: "VAC-1",
    date: "2026-08-14",
    durationHours: 24,
    rank: "FF",
    unit: "E1",
    station: 1,
    currentOffer: { windowMinutes: 30 },
  };
  const notification = buildOfferNotification(vacancy, { person, tier: "REGULAR_KD" }, "2026-08-13T20:00:00.000Z");
  assert.match(notification.message, /Reply ACCEPT or DECLINE/);
  assert.match(notification.message, /E1 at Station 1/);
  assert.equal(notification.status, "AWAITING_RESPONSE");
  assert.equal(notification.expiresAt, "2026-08-13T20:30:00.000Z");
});

test("a test pay entry carries both the Telestaff and Workday values", () => {
  const entry = createPayEntry(profile(), "TRANSPORT_PAY", { date: "2026-08-14", quantity: 2 });
  assert.equal(entry.telestaffCode, "Transport Pay");
  assert.equal(entry.workdayCode, "FTRAN");
  assert.equal(entry.quantity, 2);
  assert.equal(entry.quantityType, "Units");
});

test("a roster pay-code change updates the active badge and returns the matching ledger entry", () => {
  const result = applyRosterPayCode(profile(), "KDS_WORKING", {
    date: "2026-08-14",
    quantity: 1,
    note: "Roster test",
    createdAt: "2026-08-14T08:00:00.000Z",
  });
  assert.equal(result.profile.activePayCode.codeId, "KDS_WORKING");
  assert.equal(result.profile.activePayCode.rosterLabel, "KDS-W");
  assert.equal(result.entry.telestaffCode, "Kelly Day Swap Working");
  assert.equal(result.entry.profileId, result.profile.id);
  assert.equal(rosterPayCodeLabel("OVERTIME"), "OT");
});

test("synthetic personnel include every ADHLSETWP credential marker", () => {
  const assignedLetters = new Set(TEST_PROFILES.flatMap((item) => item.credentialLetters || []));
  assert.deepEqual(CREDENTIAL_LETTERS.filter((letter) => !assignedLetters.has(letter)), []);
  TEST_PROFILES.forEach((item) => {
    assert.deepEqual(item.credentialLetters, CREDENTIAL_LETTERS.filter((letter) => item.credentialLetters.includes(letter)));
  });
});
