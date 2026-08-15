import React, { useEffect, useMemo, useState } from "react";
import {
  SHIFTS, STATIONS, TEST_ENVIRONMENT_SUMMARY, TEST_PROFILES,
  UNIT_TEMPLATES, unitsForStation,
} from "./data/testEnvironment.js";
import {
  DEFAULT_RULE_CONFIG, TIER_LABELS, VOLUNTARY_TIERS,
  applyOfferOutcome, buildCandidateQueue, computeShiftKelly,
  describeCandidate, firstActionableCandidate, groupCandidateQueue,
  offerWindowMinutes,
} from "./staffingEngine.js";
import {
  NotificationsView,
  PayCodesView,
  PersonnelView as WorkforcePersonnelView,
  TransferModal,
} from "./WorkforceViews.jsx";
import {
  applyPersonnelMove,
  buildMandatoryNotification,
  buildOfferNotification,
  createPayEntry,
} from "./workforceConfig.js";

const TEST_DATE = "2026-08-14";
const STORAGE_KEY = "ofd-tele-staff-test-v3";
const NAV_ITEMS = [
  { id: "roster", label: "Roster Board", icon: "▦" },
  { id: "hiring", label: "Hiring Desk", icon: "⇄" },
  { id: "notifications", label: "Notifications", icon: "✉" },
  { id: "personnel", label: "Personnel & Transfers", icon: "◎" },
  { id: "paycodes", label: "Pay Codes", icon: "$" },
  { id: "rules", label: "Rules & Audit", icon: "☷" },
];
const STAGES = [
  { id: "SHIFT_PRIOR_1800", time: "18:00", label: "Shift-prior first run", shiftPool: "Off-going" },
  { id: "SHIFT_PRIOR_2000", time: "20:00", label: "Shift-prior second run", shiftPool: "Off-going" },
  { id: "SHIFT_DAY_0615", time: "06:15", label: "Shift-day final voluntary", shiftPool: "On-coming" },
  { id: "SHIFT_DAY_0800", time: "08:00", label: "Shift-day rank-for-rank", shiftPool: "On-coming" },
];
const RULE_CARDS = [
  ["Voluntary hiring chain", "Working direction", "Regular KD → Floating KD → KDS not working → Day Staff → off-going/on-coming → mandatory."],
  ["Fairness measure", "Working direction", "Accepted, refused, and properly expired offers each charge one opportunity. Hours worked remain separate."],
  ["No Contact — Offer Expired", "Proposed rule", "A delivered electronic offer may expire and advance without a second day-of phone call. Failed delivery is not charged."],
  ["Station proximity", "Working direction", "Use the employee’s actual station assignment on the immediately preceding roster, then the test distance matrix."],
  ["Day Staff", "Working direction", "Signup and a rolling 30-day opportunity rule apply voluntarily; both are bypassed in mandatory mode."],
  ["Mandatory overtime", "Controlled test", "Recommend only after voluntary exhaustion. Qualifications and bypass rules remain active; assignment moves the rotation."],
];
const OPEN_DECISIONS = [
  "Treatment of exactly 12-hour offers for opportunity charging",
  "0830 versus shift-start cutoff for a declined late offer",
  "Final Floating KD ordering and annual reset method",
  "KDS opportunity-versus-hours accounting",
  "Whether off-shift Signup is informational or defines the interested pool",
  "Final 60-hour measurement window and included work types",
];

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const freshTestState = () => ({
  profiles: deepClone(TEST_PROFILES),
  vacancies: [],
  audit: [],
  transfers: [],
  payEntries: [],
  notifications: [],
});
const normalizeTestState = (saved) => ({
  ...freshTestState(),
  ...saved,
  profiles: saved?.profiles?.length ? saved.profiles : deepClone(TEST_PROFILES),
  vacancies: saved?.vacancies || [],
  audit: saved?.audit || [],
  transfers: saved?.transfers || [],
  payEntries: saved?.payEntries || [],
  notifications: saved?.notifications || [],
});
const formatRank = (rank) => ({ FF: "Firefighter", ENG: "Engineer", LT: "Lieutenant", DC: "District Chief", AC: "Assistant Chief" }[rank] || rank);
const shortName = (name = "") => name.replace("TEST — ", "");
const timestamp = () => new Date().toISOString();
const displayDate = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const stageForVacancy = (vacancy) => STAGES.find((stage) => stage.id === vacancy.stage) || STAGES[0];
const qualificationForUnit = (unit) => unit.startsWith("T") ? ["TOWER"] : [];

function usePersistentTestState() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeTestState(JSON.parse(saved));
    } catch (error) { console.warn("Unable to read test state", error); }
    return freshTestState();
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { console.warn("Unable to save test state", error); }
  }, [state]);
  return [state, setState];
}

function makeVacancy(person, date, index = 0, overrides = {}) {
  const stage = STAGES[index % STAGES.length];
  return {
    id: `VAC-${Date.now()}-${index}`, date, shift: computeShiftKelly(date).shift,
    station: person.station, unit: person.unit, seatPosition: person.position, rank: person.rank,
    durationHours: 24, requiredQualifications: qualificationForUnit(person.unit),
    reason: ["Vacation", "Sick leave", "Kelly vacancy", "Open position"][index % 4],
    stage: stage.id, runTime: stage.time, status: "OPEN", currentOffer: null,
    assignedProfileId: null, absentPersonId: person.id, contactedIds: [], mandatoryBypassIds: [], history: [],
    ...overrides,
  };
}

function createSampleVacancies(profiles, date, count = 18) {
  const targetShift = computeShiftKelly(date).shift;
  const rostered = profiles.filter((p) => p.shift === targetShift && p.unit !== "RELIEF" && p.rank !== "AC")
    .sort((a, b) => a.station - b.station || a.unit.localeCompare(b.unit));
  const chosen = [];
  const usedUnits = new Set();
  rostered.forEach((p) => { if (chosen.length < count && !usedUnits.has(p.unit)) { chosen.push(p); usedUnits.add(p.unit); } });
  rostered.forEach((p) => { if (chosen.length < count && !chosen.some((x) => x.id === p.id)) chosen.push(p); });
  return chosen.slice(0, count).map((person, index) => makeVacancy(person, date, index));
}

function Badge({ children, tone = "neutral" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }

function EmptyState({ title, body, action }) {
  return <div className="empty-state"><div className="empty-state-icon">◇</div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function AppHeader({ view, setView, state, date, setDate, onLoadScenario, onReset }) {
  const open = state.vacancies.filter((v) => v.status === "OPEN").length;
  const filled = state.vacancies.filter((v) => v.status === "FILLED").length;
  const { shift, kelly } = computeShiftKelly(date);
  return <>
    <header className="topbar">
      <div className="brand-block"><div className="brand-mark"><span>OFD</span></div><div><div className="eyebrow">ORLANDO FIRE DEPARTMENT</div><h1>TeleStaff Rules Lab</h1></div></div>
      <div className="topbar-actions"><div className="date-control"><label htmlFor="test-date">Test date</label><input id="test-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><button className="button button-secondary" onClick={onReset}>Reset</button><button className="button button-primary" onClick={onLoadScenario}>Load 18-vacancy scenario</button></div>
    </header>
    <div className="synthetic-banner"><span className="pulse-dot" /><strong>Synthetic test environment</strong><span>No employee names or production staffing records are used.</span><div className="banner-stats"><span>{shift} Shift</span><span>KD {kelly}</span><span>{open} open</span><span>{filled} filled</span></div></div>
    <nav className="main-nav" aria-label="Main navigation">{NAV_ITEMS.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
  </>;
}

function SummaryCards({ state, date }) {
  const { shift, kelly } = computeShiftKelly(date);
  const cards = [
    ["Target roster", state.profiles.filter((p) => p.shift === shift).length, `${shift} Shift • KD group ${kelly}`, "navy"],
    ["Open vacancies", state.vacancies.filter((v) => v.status === "OPEN").length, `${state.vacancies.length} total scenario positions`, "red"],
    ["Active offers", state.vacancies.filter((v) => v.currentOffer).length, "Independently processing", "gold"],
    ["Positions filled", state.vacancies.filter((v) => v.status === "FILLED").length, "Accepted voluntary or mandatory", "green"],
  ];
  return <section className="summary-grid">{cards.map(([label, value, note, tone]) => <article key={label} className={`summary-card summary-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>;
}

function RosterSeat({ person, vacancy, onCreateVacancy }) {
  return <button className={`roster-seat ${vacancy ? "vacant" : ""}`} onClick={() => !vacancy && onCreateVacancy(person)} title={vacancy ? `${vacancy.reason} — ${vacancy.id}` : "Click to create a test vacancy"}>
    <div className={`rank-block rank-${person.rank.toLowerCase()}`}>{person.rank}</div>
    <div className="roster-person"><strong>{vacancy ? "VACANT" : shortName(person.name)}</strong><span>{vacancy ? vacancy.reason : person.qualifications.slice(0, 2).join(" • ") || "No special qualification"}</span></div>
    {vacancy ? <Badge tone="danger">Open</Badge> : <span className="seat-action">＋</span>}
  </button>;
}

function RosterBoard({ state, date, selectedShift, setSelectedShift, onCreateVacancy, onOpenHiring }) {
  const target = computeShiftKelly(date);
  const rosterProfiles = state.profiles.filter((p) => p.shift === selectedShift && p.unit !== "RELIEF");
  const vacancyBySeat = new Map(state.vacancies.filter((v) => v.date === date && v.status === "OPEN").map((v) => [v.seatPosition, v]));
  return <>
    <div className="section-heading split-heading"><div><span className="eyebrow">TEST ROSTER</span><h2>Six-station staffing board</h2><p>Click any occupied position to create a vacancy and test the Fill by Rules sequence.</p></div><div className="shift-tabs">{SHIFTS.map((shift) => <button key={shift} className={selectedShift === shift ? "active" : ""} onClick={() => setSelectedShift(shift)}>{shift} Shift{shift === target.shift ? <small>Target</small> : null}</button>)}</div></div>
    {selectedShift !== target.shift ? <div className="info-callout">Viewing {selectedShift} Shift for proximity and off-shift testing. The vacancy date belongs to {target.shift} Shift.</div> : null}
    <div className="station-grid">{STATIONS.map((station) => <section className="station-card" key={station.id}><header><div><span>STATION</span><strong>{station.id}</strong></div><p>{station.district}</p><Badge>{station.units.length} units</Badge></header><div className="unit-stack">{station.units.map((unit) => { const unitPeople = rosterProfiles.filter((p) => p.unit === unit); if (!unitPeople.length) return null; return <div className="roster-unit" key={unit}><div className="unit-title"><strong>{unit}</strong><span>{UNIT_TEMPLATES[unit]?.length || unitPeople.length} positions</span></div>{unitPeople.map((person) => <RosterSeat key={person.id} person={person} vacancy={vacancyBySeat.get(person.position)} onCreateVacancy={onCreateVacancy} />)}</div>; })}</div></section>)}</div>
    <div className="roster-footer-panel"><div><span className="eyebrow">RELIEF COMPLEMENT</span><strong>{state.profiles.filter((p) => p.shift === selectedShift && p.unit === "RELIEF").length} synthetic relief profiles</strong><p>Includes FF, Engineer, Lieutenant, District Chief, and Assistant Chief candidates.</p></div><button className="button button-primary" onClick={onOpenHiring}>Open Hiring Desk</button></div>
  </>;
}

function VacancyModal({ person, date, onClose, onSave }) {
  const [form, setForm] = useState({ station: person.station, unit: person.unit, rank: person.rank, reason: "Vacation", durationHours: 24, stage: "SHIFT_PRIOR_1800" });
  useEffect(() => { if (!unitsForStation(form.station).includes(form.unit)) setForm((x) => ({ ...x, unit: unitsForStation(x.station)[0] })); }, [form.station, form.unit]);
  const targetShift = computeShiftKelly(date).shift;
  const matchingPerson = person.shift === targetShift && person.unit === form.unit && person.rank === form.rank ? person : TEST_PROFILES.find((p) => p.shift === targetShift && p.unit === form.unit && p.rank === form.rank);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal-card" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!matchingPerson) return; const stage = STAGES.find((x) => x.id === form.stage); onSave(makeVacancy(matchingPerson, date, 0, { ...form, runTime: stage.time, requiredQualifications: qualificationForUnit(form.unit), seatPosition: matchingPerson.position, absentPersonId: matchingPerson.id })); }}>
    <div className="modal-header"><div><span className="eyebrow">NEW TEST VACANCY</span><h2>Create vacancy</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
    <div className="form-grid"><label>Station<select value={form.station} onChange={(e) => setForm({ ...form, station: Number(e.target.value) })}>{STATIONS.map((s) => <option key={s.id} value={s.id}>Station {s.id}</option>)}</select></label><label>Unit<select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{unitsForStation(form.station).map((u) => <option key={u}>{u}</option>)}</select></label><label>Rank<select value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })}>{["FF", "ENG", "LT", "DC", "AC"].map((r) => <option key={r}>{r}</option>)}</select></label><label>Duration<select value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })}><option value={24}>24 hours</option><option value={12}>12 hours</option></select></label><label className="span-two">Reason<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label><label className="span-two">Hiring stage<select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.time} — {s.label}</option>)}</select></label></div>
    {!matchingPerson ? <div className="modal-note danger-note">No target-shift test profile matches that unit and rank.</div> : <div className="modal-note">The assigned test profile will be marked absent and excluded from overtime.</div>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!matchingPerson}>Create vacancy</button></div>
  </form></div>;
}

function TierRail({ queue, activeTier }) {
  const groups = groupCandidateQueue(queue);
  return <div className="tier-rail">{[...VOLUNTARY_TIERS, "MANDATORY"].map((tier, index) => { const count = groups[tier]?.length || 0; return <div key={tier} className={`tier-step ${tier === activeTier ? "active" : ""} ${count ? "available" : "empty"}`}><div className="tier-number">{index + 1}</div><div><strong>{TIER_LABELS[tier]}</strong><span>{count ? `${count} eligible` : "No eligible candidates"}</span></div></div>; })}</div>;
}

function VacancyList({ vacancies, selectedId, setSelectedId }) {
  return <aside className="vacancy-list-panel"><div className="panel-header"><div><span className="eyebrow">POSITIONS</span><h3>Vacancy queue</h3></div><Badge tone="danger">{vacancies.filter((v) => v.status === "OPEN").length} open</Badge></div><div className="vacancy-list">{vacancies.length ? vacancies.map((v, index) => <button key={v.id} className={`${v.id === selectedId ? "active" : ""} ${v.status.toLowerCase()}`} onClick={() => setSelectedId(v.id)}><div className="vacancy-order">{String(index + 1).padStart(2, "0")}</div><div className="vacancy-list-main"><strong>{v.unit} · {v.rank}</strong><span>Station {v.station} · {v.reason}</span></div><Badge tone={v.status === "FILLED" ? "success" : v.currentOffer ? "warning" : "danger"}>{v.status === "FILLED" ? "Filled" : v.currentOffer ? "Offer" : "Open"}</Badge></button>) : <EmptyState title="No vacancies" body="Create one from the roster or load the sample scenario." />}</div></aside>;
}

function CurrentOfferCard({ vacancy, candidate, profile, onOutcome, onBypass }) {
  if (!vacancy.currentOffer || !profile) return null;
  const mandatory = vacancy.currentOffer.tier === "MANDATORY";
  return <section className={`current-offer-card ${mandatory ? "mandatory" : ""}`}><div className="offer-label"><span className="live-dot" />{mandatory ? "MANDATORY RECOMMENDATION" : "ACTIVE ELECTRONIC OFFER"}</div><div className="offer-person-row"><div className={`avatar rank-${profile.rank.toLowerCase()}`}>{profile.rank}</div><div><h3>{shortName(profile.name)}</h3><p>{formatRank(profile.rank)} · {profile.shift} Shift · Station {profile.station}</p></div><div className="offer-clock"><strong>{mandatory ? "Review" : `${vacancy.currentOffer.windowMinutes}:00`}</strong><span>{mandatory ? "Staff approval required" : "Test response window"}</span></div></div><div className="offer-explanation"><div><span>List</span><strong>{TIER_LABELS[vacancy.currentOffer.tier]}</strong></div><div><span>Why selected</span><strong>{describeCandidate(candidate)}</strong></div><div><span>Delivery</span><strong>{mandatory ? "Not sent — recommendation only" : "Delivered (simulated)"}</strong></div></div>{mandatory ? <div className="outcome-buttons"><button className="button outcome-accept" onClick={() => onOutcome("ACCEPTED")}>Approve & Assign</button><button className="button outcome-bypass" onClick={onBypass}>Record Bypass</button></div> : <div className="outcome-buttons"><button className="button outcome-accept" onClick={() => onOutcome("ACCEPTED")}>Accepted</button><button className="button outcome-refuse" onClick={() => onOutcome("REFUSED")}>Refused</button><button className="button outcome-expire" onClick={() => onOutcome("EXPIRED")}>No Contact — Expired</button><button className="button outcome-fail" onClick={() => onOutcome("FAILED_DELIVERY")}>Failed Delivery</button></div>}</section>;
}

function CandidateTable({ queue, currentOffer, actionableCandidate, onSelectOffer }) {
  return <div className="candidate-table-wrap"><table className="candidate-table"><thead><tr><th>#</th><th>Candidate</th><th>Eligibility tier</th><th>Fairness</th><th>Location / fit</th><th /></tr></thead><tbody>{queue.slice(0, 80).map((c, index) => { const isNext = actionableCandidate?.person.id === c.person.id && actionableCandidate?.tier === c.tier; return <tr key={`${c.person.id}-${c.tier}`} className={`${c.mandatoryBypass ? "bypassed" : ""} ${isNext ? "next-by-rule" : ""}`}><td>{index + 1}</td><td><div className="candidate-name"><div className={`mini-rank rank-${c.person.rank.toLowerCase()}`}>{c.person.rank}</div><div><strong>{shortName(c.person.name)}</strong><span>{c.person.shift} Shift · Station {c.person.station}</span></div></div></td><td><Badge tone={c.tier === "MANDATORY" ? "danger" : c.tier.includes("KD") ? "blue" : "neutral"}>{TIER_LABELS[c.tier]}</Badge></td><td><strong>{c.opportunityCount}</strong><span className="cell-subtext">charged opportunities</span></td><td>{c.mandatoryBypass || (["OFF_GOING", "ON_COMING"].includes(c.tier) ? `${c.proximityMiles.toFixed(1)} mi · prior Station ${c.person.previousShiftStation}` : c.workback || (c.exactRank ? "Exact rank" : "Qualified"))}</td><td><button className="table-action" disabled={Boolean(currentOffer) || !isNext || Boolean(c.mandatoryBypass)} onClick={() => onSelectOffer(c)}>{isNext ? (c.tier === "MANDATORY" ? "Recommend" : "Offer") : "Waiting"}</button></td></tr>; })}</tbody></table>{!queue.length ? <EmptyState title="No eligible candidates" body="This vacancy has exhausted the current test pool." /> : null}</div>;
}

function HiringDesk({ state, selectedVacancyId, setSelectedVacancyId, onSetOffer, onOutcome, onBypass, onStageChange }) {
  const selected = state.vacancies.find((v) => v.id === selectedVacancyId) || state.vacancies[0] || null;
  const excludedIds = useMemo(() => { const ids = new Set(); state.vacancies.forEach((v) => { if (v.absentPersonId) ids.add(v.absentPersonId); if (v.status === "FILLED" && v.assignedProfileId && v.id !== selected?.id) ids.add(v.assignedProfileId); }); return [...ids]; }, [state.vacancies, selected?.id]);
  const queue = useMemo(() => selected ? buildCandidateQueue(selected, state.profiles, { excludedIds }) : [], [selected, state.profiles, excludedIds.join("|")]);
  const next = firstActionableCandidate(queue);
  const currentProfile = selected?.currentOffer ? state.profiles.find((p) => p.id === selected.currentOffer.profileId) : null;
  const currentCandidate = selected?.currentOffer ? queue.find((c) => c.person.id === selected.currentOffer.profileId) || selected.currentOffer.candidate : null;
  useEffect(() => { if (!selectedVacancyId && state.vacancies[0]) setSelectedVacancyId(state.vacancies[0].id); }, [selectedVacancyId, state.vacancies, setSelectedVacancyId]);
  if (!selected) return <EmptyState title="No vacancy scenario loaded" body="Return to the roster board to create a vacancy, or load the 18-vacancy sample scenario." />;
  const activeTier = selected.currentOffer?.tier || next?.tier || "MANDATORY";
  const stage = stageForVacancy(selected);
  const assigned = state.profiles.find((p) => p.id === selected.assignedProfileId);
  return <div className="hiring-layout"><VacancyList vacancies={state.vacancies} selectedId={selected.id} setSelectedId={setSelectedVacancyId} /><div className="hiring-main"><section className="vacancy-hero"><div className="vacancy-identity"><div className="vacancy-unit-badge">{selected.unit}</div><div><span className="eyebrow">TEST VACANCY</span><h2>{formatRank(selected.rank)} · Station {selected.station}</h2><p>{selected.reason} · {selected.durationHours} hours · {displayDate(selected.date)}</p></div></div><div className="stage-control"><label>Active hiring stage<select value={selected.stage} disabled={selected.status === "FILLED" || selected.currentOffer} onChange={(e) => onStageChange(selected.id, e.target.value)}>{STAGES.map((item) => <option key={item.id} value={item.id}>{item.time} — {item.label}</option>)}</select></label><span>{stage.shiftPool} shift pool · {offerWindowMinutes(stage.time)} min test window</span></div><Badge tone={selected.status === "FILLED" ? "success" : "danger"}>{selected.status}</Badge></section>{selected.status === "FILLED" ? <div className="filled-banner"><span>✓</span><div><strong>Position filled</strong><p>{shortName(assigned?.name || "Assigned test profile")}</p></div></div> : <><TierRail queue={queue} activeTier={activeTier} /><CurrentOfferCard vacancy={selected} candidate={currentCandidate} profile={currentProfile} onOutcome={(outcome) => onOutcome(selected.id, outcome)} onBypass={() => onBypass(selected.id)} />{!selected.currentOffer && next ? <section className="next-candidate-card"><div><span className="eyebrow">NEXT BY RULE</span><h3>{shortName(next.person.name)}</h3><p>{TIER_LABELS[next.tier]} · {describeCandidate(next)}</p></div><button className={`button ${next.tier === "MANDATORY" ? "button-danger" : "button-primary"}`} onClick={() => onSetOffer(selected.id, next)}>{next.tier === "MANDATORY" ? "Create Mandatory Recommendation" : "Send Simulated Offer"}</button></section> : null}<section className="candidate-panel"><div className="panel-header"><div><span className="eyebrow">FILL BY RULES</span><h3>Ordered candidate queue</h3></div><span className="panel-note">Only the next candidate is actionable; Signup never changes priority.</span></div><CandidateTable queue={queue} currentOffer={selected.currentOffer} actionableCandidate={next} onSelectOffer={(candidate) => onSetOffer(selected.id, candidate)} /></section></>}</div></div>;
}

function RulesAuditView({ audit }) {
  return <><div className="section-heading"><span className="eyebrow">CONFIGURATION BASELINE</span><h2>Working rules and test controls</h2><p>These cards represent the current internal direction. Open decisions remain deliberately unresolved.</p></div><div className="rule-grid">{RULE_CARDS.map(([title, status, body]) => <article className="rule-card" key={title}><div><span className="rule-icon">✓</span><Badge tone={status === "Proposed rule" ? "warning" : status === "Controlled test" ? "danger" : "blue"}>{status}</Badge></div><h3>{title}</h3><p>{body}</p></article>)}</div><div className="rules-two-column"><section className="decision-panel"><div className="panel-header"><div><span className="eyebrow">INTERNAL CONFIRMATION</span><h3>Open decisions</h3></div><Badge tone="warning">{OPEN_DECISIONS.length}</Badge></div><ol>{OPEN_DECISIONS.map((d) => <li key={d}>{d}</li>)}</ol></section><section className="config-panel"><div className="panel-header"><div><span className="eyebrow">ACTIVE TEST VALUES</span><h3>Rule engine configuration</h3></div></div><dl><div><dt>Fairness</dt><dd>Charged opportunities</dd></div><div><dt>Tie-breaker</dt><dd>In-grade seniority</dd></div><div><dt>Exactly 12 hours</dt><dd>Not charged — pending decision</dd></div><div><dt>Day Staff lookback</dt><dd>{DEFAULT_RULE_CONFIG.dayStaffLookbackDays} days</dd></div><div><dt>Mandatory work limit</dt><dd>{DEFAULT_RULE_CONFIG.mandatoryHoursLimit} hours</dd></div><div><dt>Proximity source</dt><dd>Previous roster position</dd></div><div><dt>Mandatory mode</dt><dd>Recommendation only</dd></div></dl></section></div><section className="audit-panel"><div className="panel-header"><div><span className="eyebrow">SIMULATION LOG</span><h3>Offer and assignment audit</h3></div><Badge>{audit.length} events</Badge></div>{audit.length ? <div className="audit-list">{audit.slice().reverse().map((e) => <div className="audit-row" key={e.id}><time>{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><Badge tone={e.outcome === "ACCEPTED" ? "success" : e.outcome === "EXPIRED" ? "warning" : e.outcome === "FAILED_DELIVERY" ? "danger" : "neutral"}>{e.outcome}</Badge><div><strong>{e.profileName ? shortName(e.profileName) : "System"}</strong><p>{e.message}</p></div><span>{e.vacancyLabel}</span></div>)}</div> : <EmptyState title="No hiring activity yet" body="Simulated offers, outcomes, bypasses, and assignments will appear here." />}</section></>;
}

export default function App() {
  const [view, setView] = useState("roster");
  const [date, setDate] = useState(TEST_DATE);
  const [selectedShift, setSelectedShift] = useState(computeShiftKelly(TEST_DATE).shift);
  const [state, setState] = usePersistentTestState();
  const [selectedVacancyId, setSelectedVacancyId] = useState(state.vacancies[0]?.id || null);
  const [vacancyPerson, setVacancyPerson] = useState(null);
  const [transferPerson, setTransferPerson] = useState(null);
  useEffect(() => setSelectedShift(computeShiftKelly(date).shift), [date]);
  const addAudit = (draft, details) => draft.audit.push({ id: `AUD-${Date.now()}-${draft.audit.length}`, at: timestamp(), ...details });

  function loadScenario() {
    const vacancies = createSampleVacancies(state.profiles, date, 18);
    setState((current) => {
      const draft = { ...current, vacancies, audit: [] };
      addAudit(draft, { outcome: "SCENARIO", message: `Loaded ${vacancies.length} independently processing test vacancies.`, vacancyLabel: `${computeShiftKelly(date).shift} Shift` });
      return draft;
    });
    setSelectedVacancyId(vacancies[0]?.id || null);
    setView("hiring");
  }

  function resetTestData() {
    if (!window.confirm("Reset all test profiles, vacancies, transfers, pay entries, notifications, opportunity balances, and audit history?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(freshTestState());
    setSelectedVacancyId(null);
    setView("roster");
  }

  function saveVacancy(vacancy) {
    setState((current) => ({ ...current, vacancies: [...current.vacancies, vacancy] }));
    setSelectedVacancyId(vacancy.id);
    setVacancyPerson(null);
    setView("hiring");
  }

  function changeStage(id, stageId) {
    const stage = STAGES.find((item) => item.id === stageId);
    setState((current) => ({
      ...current,
      vacancies: current.vacancies.map((vacancy) => vacancy.id === id ? { ...vacancy, stage: stageId, runTime: stage.time } : vacancy),
    }));
  }

  function setOffer(id, candidate) {
    setState((current) => {
      const draft = deepClone(current);
      const vacancy = draft.vacancies.find((item) => item.id === id);
      if (!vacancy || vacancy.status !== "OPEN" || vacancy.currentOffer) return current;
      const startedAt = timestamp();
      vacancy.currentOffer = {
        profileId: candidate.person.id,
        tier: candidate.tier,
        startedAt,
        windowMinutes: candidate.tier === "MANDATORY" ? null : offerWindowMinutes(vacancy.runTime),
        candidate,
      };
      if (candidate.tier !== "MANDATORY") {
        const notification = buildOfferNotification(vacancy, candidate, startedAt);
        vacancy.currentOffer.notificationId = notification.id;
        draft.notifications.push(notification);
      }
      vacancy.history.push({ at: startedAt, action: candidate.tier === "MANDATORY" ? "MANDATORY_RECOMMENDED" : "OFFER_SENT", profileId: candidate.person.id, tier: candidate.tier });
      addAudit(draft, {
        outcome: candidate.tier === "MANDATORY" ? "RECOMMENDED" : "OFFERED",
        profileName: candidate.person.name,
        message: candidate.tier === "MANDATORY" ? `${TIER_LABELS[candidate.tier]} selected by Fill by Rules.` : `${TIER_LABELS[candidate.tier]} selected and test text delivered.`,
        vacancyLabel: `${vacancy.unit} ${vacancy.rank}`,
      });
      return draft;
    });
  }

  function recordOutcome(id, outcome) {
    setState((current) => {
      const draft = deepClone(current);
      const vacancy = draft.vacancies.find((item) => item.id === id);
      if (!vacancy?.currentOffer) return current;
      const offer = vacancy.currentOffer;
      const profileIndex = draft.profiles.findIndex((profile) => profile.id === offer.profileId);
      if (profileIndex < 0) return current;
      const profile = draft.profiles[profileIndex];
      const tier = offer.tier;
      const respondedAt = timestamp();
      const chargesOpportunity = Number(vacancy.durationHours) > 12 && tier !== "MANDATORY";
      draft.profiles[profileIndex] = applyOfferOutcome(profile, tier, outcome, vacancy, draft.profiles);
      vacancy.history.push({ at: respondedAt, action: outcome, profileId: profile.id, tier });
      if (offer.notificationId) {
        const notification = draft.notifications.find((item) => item.id === offer.notificationId);
        if (notification) {
          notification.status = outcome;
          notification.response = outcome === "ACCEPTED" ? "ACCEPT" : outcome === "REFUSED" ? "DECLINE" : outcome;
          notification.respondedAt = respondedAt;
        }
      }
      if (outcome === "ACCEPTED") {
        vacancy.status = "FILLED";
        vacancy.assignedProfileId = profile.id;
        if (tier === "MANDATORY") draft.notifications.push(buildMandatoryNotification(vacancy, profile, respondedAt));
      } else {
        vacancy.contactedIds.push(profile.id);
      }
      vacancy.currentOffer = null;
      const chargeText = chargesOpportunity ? "one opportunity charged" : "no opportunity charged under the current short-offer test setting";
      const messages = {
        ACCEPTED: tier === "MANDATORY" ? "Mandatory assignment approved; assignment notice created and rotation moved to the bottom." : `Employee replied ACCEPT; position filled and ${chargeText}.`,
        REFUSED: `Employee replied DECLINE; ${chargeText} and vacancy advanced.`,
        EXPIRED: `Delivered offer expired; coded No Contact — Offer Expired, ${chargeText}, and vacancy advanced.`,
        FAILED_DELIVERY: "Delivery failed; no opportunity charged and vacancy advanced.",
      };
      addAudit(draft, { outcome, profileName: profile.name, message: messages[outcome], vacancyLabel: `${vacancy.unit} ${vacancy.rank}` });
      return draft;
    });
  }

  function recordBypass(id) {
    setState((current) => {
      const draft = deepClone(current);
      const vacancy = draft.vacancies.find((item) => item.id === id);
      if (!vacancy?.currentOffer) return current;
      const profile = draft.profiles.find((item) => item.id === vacancy.currentOffer.profileId);
      vacancy.mandatoryBypassIds.push(profile.id);
      vacancy.history.push({ at: timestamp(), action: "MANDATORY_BYPASS", profileId: profile.id, tier: "MANDATORY" });
      vacancy.currentOffer = null;
      addAudit(draft, { outcome: "BYPASS", profileName: profile.name, message: "Mandatory candidate bypassed for this vacancy; rotation position unchanged.", vacancyLabel: `${vacancy.unit} ${vacancy.rank}` });
      return draft;
    });
  }

  function saveTransfer(profileId, move) {
    setState((current) => {
      const draft = deepClone(current);
      const result = applyPersonnelMove(draft.profiles, profileId, move, timestamp());
      draft.profiles = result.profiles;
      draft.transfers.push(result.historyEntry);
      addAudit(draft, {
        outcome: result.historyEntry.type,
        profileName: result.historyEntry.profileName,
        message: `Master list changed from ${result.historyEntry.from.shift}/${result.historyEntry.from.unit} to ${result.historyEntry.to.shift}/${result.historyEntry.to.unit}; opportunity and mandatory history preserved.`,
        vacancyLabel: "Personnel",
      });
      return draft;
    });
    setTransferPerson(null);
  }

  function addPayEntry(form) {
    setState((current) => {
      const draft = deepClone(current);
      const profile = draft.profiles.find((item) => item.id === form.profileId);
      if (!profile) return current;
      const entry = createPayEntry(profile, form.codeId, form);
      draft.payEntries.push(entry);
      addAudit(draft, {
        outcome: "PAY_CODE",
        profileName: profile.name,
        message: `${entry.telestaffCode} recorded for export preview as ${entry.workdayCode}.`,
        vacancyLabel: entry.date,
      });
      return draft;
    });
  }

  return <div className="app-shell">
    <AppHeader view={view} setView={setView} state={state} date={date} setDate={setDate} onLoadScenario={loadScenario} onReset={resetTestData} />
    <main className={`content-shell content-${view}`}>
      {view !== "hiring" ? <SummaryCards state={state} date={date} /> : null}
      {view === "roster" ? <RosterBoard state={state} date={date} selectedShift={selectedShift} setSelectedShift={setSelectedShift} onCreateVacancy={setVacancyPerson} onOpenHiring={() => setView("hiring")} /> : null}
      {view === "hiring" ? <HiringDesk state={state} selectedVacancyId={selectedVacancyId} setSelectedVacancyId={setSelectedVacancyId} onSetOffer={setOffer} onOutcome={recordOutcome} onBypass={recordBypass} onStageChange={changeStage} /> : null}
      {view === "notifications" ? <NotificationsView notifications={state.notifications} vacancies={state.vacancies} onRespond={(notification, outcome) => recordOutcome(notification.vacancyId, outcome)} /> : null}
      {view === "personnel" ? <WorkforcePersonnelView profiles={state.profiles} transfers={state.transfers} onTransfer={setTransferPerson} /> : null}
      {view === "paycodes" ? <PayCodesView profiles={state.profiles} payEntries={state.payEntries} onAddPayEntry={addPayEntry} /> : null}
      {view === "rules" ? <RulesAuditView audit={state.audit} /> : null}
    </main>
    <footer className="app-footer"><span>OFD TeleStaff Rules Lab · Internal discussion build</span><span>{TEST_ENVIRONMENT_SUMMARY.totalProfiles} synthetic profiles · Stations 1–6 · A/B/C Shifts + Day Staff</span></footer>
    {vacancyPerson ? <VacancyModal person={vacancyPerson} date={date} onClose={() => setVacancyPerson(null)} onSave={saveVacancy} /> : null}
    {transferPerson ? <TransferModal profile={transferPerson} onClose={() => setTransferPerson(null)} onSave={saveTransfer} /> : null}
  </div>;
}
