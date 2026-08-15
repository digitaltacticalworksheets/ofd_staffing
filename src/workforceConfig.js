export const PAY_CODES = [
  {
    id: "REGULAR_TIME",
    telestaff: "Regular Time",
    workday: "Worked Time (Hours Only)",
    workdayCode: "REG",
    quantityType: "Hours",
    status: "CONFIRMED",
    treatment: "Worked-time record used for scheduled regular hours.",
  },
  {
    id: "OVERTIME",
    telestaff: "Overtime",
    workday: "Worked Time (Hours Only)",
    workdayCode: "REG",
    quantityType: "Hours",
    status: "CONFIRMED",
    treatment: "Worked hours are sent to Workday; Workday applies the overtime calculation.",
  },
  {
    id: "VACATION",
    telestaff: "Vacation",
    workday: "Vacation Time Off",
    workdayCode: "VAC_TO",
    quantityType: "Hours",
    status: "WORKING",
    treatment: "Reduces the vacation balance while the 96-hour normalization rules remain in effect.",
  },
  {
    id: "TRAVEL_PAY_1",
    telestaff: "Travel Pay 1",
    workday: "Fire Travel Pay",
    workdayCode: "TPFIR",
    quantityType: "Units",
    status: "CONFIRMED",
    treatment: "Sent as a payroll unit, not as additional worked hours.",
  },
  {
    id: "TRAVEL_PAY_2",
    telestaff: "Travel Pay 2",
    workday: "Fire Travel Pay",
    workdayCode: "TPFIR",
    quantityType: "Units",
    status: "CONFIRMED",
    treatment: "Sent as a payroll unit, not as additional worked hours.",
  },
  {
    id: "TRANSPORT_PAY",
    telestaff: "Transport Pay",
    workday: "Fire Transport",
    workdayCode: "FTRAN",
    quantityType: "Units",
    status: "CONFIRMED",
    treatment: "Sent as a payroll unit, not as additional worked hours.",
  },
  ...[
    ["WHC_ENGINEER", "WHC Engineer"],
    ["WHC_LIEUTENANT", "WHC Lieutenant"],
    ["WHC_DISTRICT_CHIEF", "WHC District Chief"],
    ["WHC_ASSISTANT_CHIEF", "WHC Assistant Chief"],
  ].map(([id, telestaff]) => ({
    id,
    telestaff,
    workday: "Fire Working Higher Class",
    workdayCode: "WHCNP",
    quantityType: "Shift",
    status: "CONFIRMED",
    treatment: "Send one unit per qualifying shift and preserve the underlying regular/overtime record.",
  })),
  {
    id: "TIME_SWAP_WORKING",
    telestaff: "Time Swap Person Working",
    workday: "Time Swap Unpaid",
    workdayCode: "TS-SHIFT-NP",
    quantityType: "Hours",
    status: "CONFIRMED",
    treatment: "Reporting record for the member working the swap; does not create overtime.",
  },
  {
    id: "TIME_SWAP_OFF",
    telestaff: "Time Swap Person Off",
    workday: "Time Swap Paid",
    workdayCode: "TS-SHIFT-P",
    quantityType: "Hours",
    status: "CONFIRMED",
    treatment: "Paid reporting record for the member who is off on the swap.",
  },
  {
    id: "DOI",
    telestaff: "DOI (Date of Injury)",
    workday: "Decision required",
    workdayCode: "TBD",
    quantityType: "Hours",
    status: "OPEN",
    treatment: "Preserve the home assignment, mark the employee unavailable, and expose the vacancy.",
  },
  {
    id: "RDOF",
    telestaff: "RDOF (Floating Kelly Day)",
    workday: "Decision required",
    workdayCode: "TBD",
    quantityType: "Shift",
    status: "OPEN",
    treatment: "Schedule record; payroll treatment depends on the 96-hour/120-hour normalization rule.",
  },
  {
    id: "RDO",
    telestaff: "RDO (Kelly Day)",
    workday: "Decision required",
    workdayCode: "TBD",
    quantityType: "Shift",
    status: "OPEN",
    treatment: "Schedule record; treatment differs between four-shift and five-shift pay periods.",
  },
  {
    id: "KDS_WORKING",
    telestaff: "Kelly Day Swap Working",
    workday: "Decision required",
    workdayCode: "TBD",
    quantityType: "Shift",
    status: "OPEN",
    treatment: "Tracks the employee working the Kelly Day swap without converting the swap into overtime.",
  },
  {
    id: "KDS_OFF",
    telestaff: "Kelly Day Swap Off",
    workday: "Decision required",
    workdayCode: "TBD",
    quantityType: "Shift",
    status: "OPEN",
    treatment: "Tracks the employee who is not working and supports the KDS overtime eligibility tier.",
  },
];

export const PAY_CODE_BY_ID = Object.fromEntries(PAY_CODES.map((code) => [code.id, code]));

export const PAY_CODE_ROSTER_LABELS = {
  REGULAR_TIME: "REG",
  OVERTIME: "OT",
  VACATION: "VAC",
  TRAVEL_PAY_1: "TP1",
  TRAVEL_PAY_2: "TP2",
  TRANSPORT_PAY: "TRANS",
  WHC_ENGINEER: "WHC-ENG",
  WHC_LIEUTENANT: "WHC-LT",
  WHC_DISTRICT_CHIEF: "WHC-DC",
  WHC_ASSISTANT_CHIEF: "WHC-AC",
  TIME_SWAP_WORKING: "TS-W",
  TIME_SWAP_OFF: "TS-OFF",
  DOI: "DOI",
  RDOF: "RDOF",
  RDO: "RDO",
  KDS_WORKING: "KDS-W",
  KDS_OFF: "KDS-OFF",
};

export function rosterPayCodeLabel(codeId) {
  return PAY_CODE_ROSTER_LABELS[codeId] || PAY_CODE_BY_ID[codeId]?.telestaff || codeId;
}

const rankLabel = (rank) => ({
  FF: "Firefighter",
  ENG: "Engineer",
  LT: "Lieutenant",
  DC: "District Chief",
  AC: "Assistant Chief",
}[rank] || rank);

const displayDate = (date) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
}).format(new Date(`${date}T12:00:00`));

const displayTime = (iso) => new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(iso));

export function syntheticPhone(profileId = "000") {
  const digits = String(profileId).replace(/\D/g, "").slice(-3).padStart(3, "0");
  return `(407) 555-0${digits}`;
}

export function buildOfferNotification(vacancy, candidate, startedAt) {
  const windowMinutes = Number(vacancy.currentOffer?.windowMinutes || 15);
  const expiresAt = new Date(new Date(startedAt).getTime() + windowMinutes * 60000).toISOString();
  const person = candidate.person;
  return {
    id: `MSG-${Date.now()}-${person.id}-${vacancy.id}`,
    vacancyId: vacancy.id,
    profileId: person.id,
    recipientName: person.name,
    phone: syntheticPhone(person.id),
    type: "OVERTIME_OFFER",
    tier: candidate.tier,
    sentAt: startedAt,
    expiresAt,
    status: "AWAITING_RESPONSE",
    response: null,
    respondedAt: null,
    message: `OFD TeleStaff TEST: Overtime offer for ${rankLabel(vacancy.rank)} on ${displayDate(vacancy.date)} (${vacancy.durationHours} hrs), ${vacancy.unit} at Station ${vacancy.station}. Reply ACCEPT or DECLINE by ${displayTime(expiresAt)}. No response will be recorded as Offer Expired.`,
  };
}

export function buildMandatoryNotification(vacancy, person, sentAt) {
  return {
    id: `MSG-${Date.now()}-${person.id}-${vacancy.id}-MAND`,
    vacancyId: vacancy.id,
    profileId: person.id,
    recipientName: person.name,
    phone: syntheticPhone(person.id),
    type: "MANDATORY_ASSIGNMENT",
    tier: "MANDATORY",
    sentAt,
    expiresAt: null,
    status: "NOTICE_ONLY",
    response: "ASSIGNED",
    respondedAt: sentAt,
    message: `OFD TeleStaff TEST: You have been assigned mandatory overtime for ${rankLabel(vacancy.rank)} on ${displayDate(vacancy.date)} (${vacancy.durationHours} hrs), ${vacancy.unit} at Station ${vacancy.station}. Contact the staffing officer immediately if a documented bypass condition applies.`,
  };
}

export function applyPersonnelMove(profiles, profileId, move, recordedAt = new Date().toISOString()) {
  const current = profiles.find((profile) => profile.id === profileId);
  if (!current) throw new Error(`Profile ${profileId} was not found`);

  const nextRank = move.rank || current.rank;
  const rankChanged = nextRank !== current.rank;
  const mostJuniorInGrade = Math.max(
    0,
    ...profiles.filter((profile) => profile.rank === nextRank).map((profile) => Number(profile.inGradeSeniority || 0)),
  );
  const to = {
    shift: move.shift || current.shift,
    station: Number(move.station || current.station),
    unit: move.unit || current.unit,
    rank: nextRank,
    kellyGroup: move.shift === "DAY" ? null : Number(move.kellyGroup ?? current.kellyGroup),
  };
  const historyEntry = {
    id: `MOVE-${Date.now()}-${profileId}`,
    profileId,
    profileName: current.name,
    type: move.type || "TRANSFER",
    effectiveDate: move.effectiveDate,
    recordedAt,
    note: move.note || "",
    from: {
      shift: current.shift,
      station: current.station,
      unit: current.unit,
      rank: current.rank,
      kellyGroup: current.kellyGroup,
    },
    to,
  };

  const updatedProfiles = profiles.map((profile) => profile.id === profileId ? {
    ...profile,
    ...to,
    previousShiftStation: current.station,
    previousShiftUnit: current.unit,
    position: `${to.unit}-${to.rank}-XFER-${profile.id}`,
    inGradeSeniority: rankChanged ? mostJuniorInGrade + 1 : profile.inGradeSeniority,
    transferHistory: [...(profile.transferHistory || []), historyEntry],
  } : profile);

  return { profiles: updatedProfiles, historyEntry };
}

export function createPayEntry(profile, codeId, details = {}) {
  const code = PAY_CODE_BY_ID[codeId];
  if (!profile || !code) throw new Error("A valid profile and pay code are required");
  return {
    id: `PAY-${Date.now()}-${profile.id}`,
    profileId: profile.id,
    profileName: profile.name,
    date: details.date,
    codeId: code.id,
    telestaffCode: code.telestaff,
    workdayCode: code.workdayCode,
    workday: code.workday,
    quantity: Number(details.quantity || 0),
    quantityType: code.quantityType,
    note: details.note || "",
    createdAt: details.createdAt || new Date().toISOString(),
  };
}

export function applyRosterPayCode(profile, codeId, details = {}) {
  const entry = createPayEntry(profile, codeId, details);
  return {
    profile: {
      ...profile,
      activePayCode: {
        codeId: entry.codeId,
        label: entry.telestaffCode,
        rosterLabel: rosterPayCodeLabel(entry.codeId),
        date: entry.date,
        quantity: entry.quantity,
        quantityType: entry.quantityType,
        note: entry.note,
        updatedAt: entry.createdAt,
      },
    },
    entry,
  };
}
