export const SHIFTS = ["A", "B", "C"];

export const CREDENTIAL_LETTERS = ["A", "D", "H", "L", "S", "E", "T", "W", "P"];

export const CREDENTIAL_LEGEND = {
  A: "Technical Rescue Operations — assigned TRT unit or backup",
  D: "Dive Team Member",
  H: "Hazardous Materials Technician (HM160)",
  L: "Truck Company Certified / VMR Tech",
  S: "Surface Water Rescue Swimmer",
  E: "Relief Driver",
  T: "Tower Relief Driver",
  W: "Woods Truck Relief Driver",
  P: "Promotional Eligibility List",
};

export const STATIONS = [
  { id: 1, name: "Station 1", district: "District 1", units: ["E1", "T1", "R1", "D1", "AC1"] },
  { id: 2, name: "Station 2", district: "District 1", units: ["E2", "T2", "R2"] },
  { id: 3, name: "Station 3", district: "District 1", units: ["E3", "R3"] },
  { id: 4, name: "Station 4", district: "District 2", units: ["E4", "D2"] },
  { id: 5, name: "Station 5", district: "District 2", units: ["E5"] },
  { id: 6, name: "Station 6", district: "District 2", units: ["E6", "T6", "R6"] },
];

export const UNIT_TEMPLATES = {
  E1: ["LT", "ENG", "FF", "FF"],
  E2: ["LT", "ENG", "FF", "FF"],
  E3: ["LT", "ENG", "FF", "FF"],
  E4: ["LT", "ENG", "FF", "FF"],
  E5: ["LT", "ENG", "FF", "FF"],
  E6: ["LT", "ENG", "FF", "FF"],
  T1: ["LT", "ENG", "FF", "FF"],
  T2: ["LT", "ENG", "FF", "FF"],
  T6: ["LT", "ENG", "FF", "FF"],
  R1: ["FF", "FF"],
  R2: ["FF", "FF"],
  R3: ["FF", "FF"],
  R6: ["FF", "FF"],
  D1: ["DC"],
  D2: ["DC"],
  AC1: ["AC"],
};

export const STATION_DISTANCE_MILES = {
  1: { 1: 0, 2: 2.4, 3: 4.1, 4: 5.8, 5: 7.2, 6: 8.5 },
  2: { 1: 2.4, 2: 0, 3: 2.1, 4: 3.7, 5: 5.5, 6: 6.3 },
  3: { 1: 4.1, 2: 2.1, 3: 0, 4: 2.8, 5: 3.9, 6: 4.7 },
  4: { 1: 5.8, 2: 3.7, 3: 2.8, 4: 0, 5: 2.0, 6: 3.4 },
  5: { 1: 7.2, 2: 5.5, 3: 3.9, 4: 2.0, 5: 0, 6: 2.2 },
  6: { 1: 8.5, 2: 6.3, 3: 4.7, 4: 3.4, 5: 2.2, 6: 0 },
};

const UNIT_TO_STATION = Object.fromEntries(
  STATIONS.flatMap((station) => station.units.map((unit) => [unit, station.id]))
);

const FIRST_NAMES = [
  "Avery", "Blake", "Cameron", "Drew", "Emerson", "Finley", "Gray", "Harper", "Indigo", "Jordan",
  "Kai", "Logan", "Morgan", "Nico", "Oakley", "Parker", "Quinn", "Reese", "Sawyer", "Taylor",
  "Urban", "Val", "Wren", "Xander", "Yael", "Zion", "Arden", "Briar", "Casey", "Devon",
];

const LAST_NAMES = [
  "Archer", "Bennett", "Caldwell", "Delaney", "Ellis", "Foster", "Garner", "Hayes", "Irwin", "Jensen",
  "Keaton", "Lawson", "Mercer", "Nolan", "Owens", "Prescott", "Reed", "Sutton", "Turner", "Vaughn",
  "Walker", "York", "Bishop", "Carver", "Dawson", "Everett", "Flynn", "Grant", "Hollis", "Keller",
];

function syntheticName(index) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `TEST — ${last}, ${first}`;
}

function qualificationsFor(rank, unit, index) {
  const qualifications = [];
  if (rank === "ENG") qualifications.push("RELIEF_DRIVER");
  if (rank === "LT") qualifications.push("ACTING_OFFICER");
  if (rank === "DC") qualifications.push("ACTING_DC", "COMMAND");
  if (rank === "AC") qualifications.push("ACTING_AC", "COMMAND");
  if (unit.startsWith("T")) qualifications.push("TOWER");
  if (unit.startsWith("R") || index % 4 === 0) qualifications.push("PARAMEDIC");
  if (rank === "FF" && index % 5 === 0) qualifications.push("RELIEF_DRIVER");
  if (rank === "ENG" && index % 4 === 0) qualifications.push("ACTING_OFFICER");
  if (rank === "LT" && index % 6 === 0) qualifications.push("ACTING_DC");
  if (rank === "DC" && index % 2 === 0) qualifications.push("ACTING_AC");
  return [...new Set(qualifications)];
}

function credentialLettersFor(rank, unit, index) {
  const letters = [];
  const isDriverRank = rank === "ENG";
  const isCompanyRank = ["FF", "ENG", "LT"].includes(rank);

  if (unit.startsWith("R") || index % 17 === 0) letters.push("A");
  if (index % 19 === 0) letters.push("D");
  if (index % 11 === 0) letters.push("H");
  if (unit.startsWith("T") || index % 13 === 0) letters.push("L");
  if (index % 7 === 0) letters.push("S");
  if (isDriverRank || (rank === "FF" && index % 5 === 0)) letters.push("E");
  if ((unit.startsWith("T") && ["ENG", "FF"].includes(rank)) || index % 23 === 0) letters.push("T");
  if ((isDriverRank && index % 4 === 0) || index % 29 === 0) letters.push("W");
  if (isCompanyRank && index % 9 === 0) letters.push("P");

  return CREDENTIAL_LETTERS.filter((letter) => letters.includes(letter));
}

function buildShiftProfiles() {
  const profiles = [];
  const rankCounters = { FF: 0, ENG: 0, LT: 0, DC: 0, AC: 0 };
  let serial = 1;

  SHIFTS.forEach((shift, shiftIndex) => {
    Object.entries(UNIT_TEMPLATES).forEach(([unit, seats]) => {
      seats.forEach((rank, seatIndex) => {
        const index = serial - 1;
        rankCounters[rank] += 1;
        const station = UNIT_TO_STATION[unit];
        const id = `TEST-${String(serial).padStart(3, "0")}`;
        profiles.push({
          id,
          name: syntheticName(index),
          rank,
          shift,
          station,
          unit,
          position: `${unit}-${rank}-${seatIndex + 1}`,
          previousShiftStation: station,
          previousShiftUnit: unit,
          kellyGroup: ((index + shiftIndex * 2) % 8) + 1,
          qualifications: qualificationsFor(rank, unit, index),
          credentialLetters: credentialLettersFor(rank, unit, index),
          regularKdOpportunities: (index * 3 + shiftIndex) % 10,
          floatingKdOpportunities: (index + shiftIndex) % 3,
          voluntaryOpportunities: (index * 2 + shiftIndex) % 12,
          overtimeHours30: ((index * 7) % 9) * 12,
          inGradeSeniority: rankCounters[rank],
          departmentSeniority: serial,
          mandatoryOrder: 1000 - serial,
          floatingKellyDates: index % 17 === 0 ? ["2026-08-14"] : [],
          kdsOffDates: index % 23 === 0 ? ["2026-08-14"] : [],
          offDutyEventDates: index % 29 === 0 ? ["2026-08-14"] : [],
          paidTravelDates: index % 31 === 0 ? ["2026-08-14"] : [],
          active: true,
          source: "SYNTHETIC_SHIFT",
        });
        serial += 1;
      });
    });

    const reliefRanks = ["FF", "FF", "FF", "ENG", "ENG", "LT", "LT", "DC", "AC"];
    reliefRanks.forEach((rank, reliefIndex) => {
      const index = serial - 1;
      rankCounters[rank] += 1;
      const station = (reliefIndex % 6) + 1;
      const id = `TEST-${String(serial).padStart(3, "0")}`;
      profiles.push({
        id,
        name: syntheticName(index),
        rank,
        shift,
        station,
        unit: "RELIEF",
        position: `RELIEF-${rank}-${reliefIndex + 1}`,
        previousShiftStation: station,
        previousShiftUnit: `E${station}`,
        kellyGroup: ((reliefIndex + shiftIndex) % 8) + 1,
        qualifications: qualificationsFor(rank, reliefIndex % 3 === 0 ? "T1" : "RELIEF", index),
        credentialLetters: credentialLettersFor(rank, reliefIndex % 3 === 0 ? "T1" : "RELIEF", index),
        regularKdOpportunities: (reliefIndex + shiftIndex) % 7,
        floatingKdOpportunities: (reliefIndex + 1) % 3,
        voluntaryOpportunities: (reliefIndex * 2 + shiftIndex) % 9,
        overtimeHours30: ((reliefIndex + shiftIndex) % 5) * 12,
        inGradeSeniority: rankCounters[rank],
        departmentSeniority: serial,
        mandatoryOrder: 1000 - serial,
        floatingKellyDates: reliefIndex % 4 === 0 ? ["2026-08-14"] : [],
        kdsOffDates: reliefIndex % 5 === 0 ? ["2026-08-14"] : [],
        offDutyEventDates: [],
        paidTravelDates: reliefIndex === 7 ? ["2026-08-14"] : [],
        active: true,
        source: "SYNTHETIC_RELIEF",
      });
      serial += 1;
    });
  });

  return profiles;
}

function buildDayStaffProfiles(startSerial) {
  const ranks = ["FF", "FF", "FF", "FF", "FF", "ENG", "ENG", "ENG", "LT", "LT", "LT", "DC"];
  return ranks.map((rank, index) => {
    const serial = startSerial + index;
    return {
      id: `TEST-${String(serial).padStart(3, "0")}`,
      name: syntheticName(serial - 1),
      rank,
      shift: "DAY",
      station: (index % 6) + 1,
      unit: "DAY STAFF",
      position: `DAY-${rank}-${index + 1}`,
      previousShiftStation: (index % 6) + 1,
      previousShiftUnit: "DAY STAFF",
      kellyGroup: null,
      qualifications: qualificationsFor(rank, "DAY", serial),
      credentialLetters: credentialLettersFor(rank, "DAY", serial),
      regularKdOpportunities: 0,
      floatingKdOpportunities: 0,
      voluntaryOpportunities: index % 5,
      overtimeHours30: (index % 4) * 12,
      inGradeSeniority: index + 1,
      departmentSeniority: serial,
      mandatoryOrder: 1000 - serial,
      dayStaffSignedUp: index % 3 !== 0,
      dayStaffOffWeekdays: index % 2 === 0 ? [5, 6] : [1, 5],
      lastDayStaffOpportunity: index % 4 === 0 ? "2026-08-02" : "2026-06-15",
      offDutyEventDates: index === 3 ? ["2026-08-14"] : [],
      paidTravelDates: [],
      active: true,
      source: "SYNTHETIC_DAY_STAFF",
    };
  });
}

const shiftProfiles = buildShiftProfiles();

export const TEST_PROFILES = [
  ...shiftProfiles,
  ...buildDayStaffProfiles(shiftProfiles.length + 1),
];

export const TEST_ENVIRONMENT_SUMMARY = {
  stations: STATIONS.length,
  shiftProfiles: shiftProfiles.length,
  dayStaffProfiles: TEST_PROFILES.length - shiftProfiles.length,
  totalProfiles: TEST_PROFILES.length,
  allSynthetic: true,
};

export function stationForUnit(unit) {
  return UNIT_TO_STATION[unit] || null;
}

export function unitsForStation(stationId) {
  return STATIONS.find((station) => station.id === Number(stationId))?.units || [];
}
