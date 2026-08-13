import React, { useMemo, useState } from "react";
import { SHIFTS, STATIONS, unitsForStation } from "./data/testEnvironment.js";
import { PAY_CODES } from "./workforceConfig.js";

const RANKS = ["FF", "ENG", "LT", "DC", "AC"];
const shortName = (name = "") => name.replace("TEST — ", "");
const toneForStatus = (status) => ({
  CONFIRMED: "success",
  WORKING: "blue",
  OPEN: "warning",
  AWAITING_RESPONSE: "warning",
  ACCEPTED: "success",
  REFUSED: "danger",
  EXPIRED: "warning",
  FAILED_DELIVERY: "danger",
  NOTICE_ONLY: "blue",
}[status] || "neutral");

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><div className="empty-state-icon">◇</div><h3>{title}</h3><p>{body}</p></div>;
}

export function PersonnelView({ profiles, transfers, onTransfer }) {
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState("ALL");
  const [rank, setRank] = useState("ALL");
  const filtered = profiles.filter((profile) => (
    (!search || profile.name.toLowerCase().includes(search.toLowerCase()) || profile.id.toLowerCase().includes(search.toLowerCase()))
    && (shift === "ALL" || profile.shift === shift)
    && (rank === "ALL" || profile.rank === rank)
  ));
  const rankCounts = RANKS.map((item) => [item, profiles.filter((profile) => profile.rank === item).length]);

  return <>
    <div className="section-heading split-heading">
      <div>
        <span className="eyebrow">SYNTHETIC DIRECTORY</span>
        <h2>{profiles.length} test personnel profiles</h2>
        <p>Transfer personnel, process promotions, or change Kelly groups while retaining overtime and mandatory history.</p>
      </div>
      <div className="rank-counts">{rankCounts.map(([item, count]) => <div key={item}><strong>{count}</strong><span>{item}</span></div>)}</div>
    </div>
    <div className="filter-bar">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search synthetic name or ID…" />
      <select value={shift} onChange={(event) => setShift(event.target.value)}><option value="ALL">All shifts</option>{[...SHIFTS, "DAY"].map((item) => <option key={item}>{item}</option>)}</select>
      <select value={rank} onChange={(event) => setRank(event.target.value)}><option value="ALL">All ranks</option>{RANKS.map((item) => <option key={item}>{item}</option>)}</select>
      <Badge tone="blue">{filtered.length} shown</Badge>
    </div>
    <div className="personnel-table-wrap">
      <table className="personnel-table">
        <thead><tr><th>Profile</th><th>Assignment</th><th>Kelly</th><th>Qualifications</th><th>Opportunity balances</th><th>Mandatory</th><th /></tr></thead>
        <tbody>{filtered.map((profile) => <tr key={profile.id}>
          <td><div className="candidate-name"><div className={`mini-rank rank-${profile.rank.toLowerCase()}`}>{profile.rank}</div><div><strong>{shortName(profile.name)}</strong><span>{profile.id}</span></div></div></td>
          <td><strong>{profile.shift} Shift</strong><span className="cell-subtext">{profile.unit} · Station {profile.station}</span>{profile.transferHistory?.length ? <span className="cell-subtext transfer-flag">Transferred · prior Station {profile.previousShiftStation}</span> : null}</td>
          <td>{profile.kellyGroup ? `Group ${profile.kellyGroup}` : "Day Staff"}</td>
          <td><div className="qualification-list">{profile.qualifications.length ? profile.qualifications.map((item) => <Badge key={item}>{item}</Badge>) : "—"}</div></td>
          <td><strong>KD {profile.regularKdOpportunities}</strong><span className="cell-subtext">FKD {profile.floatingKdOpportunities} · Other {profile.voluntaryOpportunities}</span></td>
          <td><strong>#{profile.mandatoryOrder}</strong><span className="cell-subtext">{profile.overtimeHours30} tracked hrs</span></td>
          <td><button className="table-action" onClick={() => onTransfer(profile)}>Transfer</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <section className="transfer-history-panel">
      <div className="panel-header"><div><span className="eyebrow">MASTER LIST CHANGES</span><h3>Transfer and promotion history</h3></div><Badge>{transfers.length} changes</Badge></div>
      {transfers.length ? <div className="transfer-history-list">{transfers.slice().reverse().map((move) => <div className="transfer-history-row" key={move.id}>
        <time>{move.effectiveDate}</time>
        <Badge tone="blue">{move.type.replaceAll("_", " ")}</Badge>
        <div><strong>{shortName(move.profileName)}</strong><span>{move.from.shift} / {move.from.unit} / KD {move.from.kellyGroup || "—"} → {move.to.shift} / {move.to.unit} / KD {move.to.kellyGroup || "—"}</span></div>
        <span>{move.note || "Master list updated; history preserved"}</span>
      </div>)}</div> : <EmptyState title="No personnel changes" body="Use Transfer on a personnel record to test a move during the pay period." />}
    </section>
  </>;
}

export function TransferModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({
    type: "TRANSFER",
    effectiveDate: "2026-08-14",
    shift: profile.shift,
    station: profile.station,
    unit: profile.unit,
    rank: profile.rank,
    kellyGroup: profile.kellyGroup || 1,
    note: "",
  });
  const availableUnits = form.shift === "DAY" ? ["DAY STAFF"] : unitsForStation(form.station);

  function update(next) {
    const merged = { ...form, ...next };
    const options = merged.shift === "DAY" ? ["DAY STAFF"] : unitsForStation(merged.station);
    if (!options.includes(merged.unit)) merged.unit = options[0];
    setForm(merged);
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <form className="modal-card transfer-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(profile.id, form); }}>
      <div className="modal-header"><div><span className="eyebrow">PERSONNEL MASTER LIST</span><h2>Transfer {shortName(profile.name)}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      <div className="current-assignment-strip"><span>Current assignment</span><strong>{profile.shift} Shift · {profile.unit} · Station {profile.station} · {profile.rank} · KD {profile.kellyGroup || "—"}</strong></div>
      <div className="form-grid">
        <label>Change type<select value={form.type} onChange={(event) => update({ type: event.target.value })}><option value="TRANSFER">Permanent transfer</option><option value="PROMOTION">Promotion</option><option value="KELLY_DAY_CHANGE">Kelly Day change</option></select></label>
        <label>Effective date<input type="date" value={form.effectiveDate} onChange={(event) => update({ effectiveDate: event.target.value })} required /></label>
        <label>Shift<select value={form.shift} onChange={(event) => update({ shift: event.target.value })}>{[...SHIFTS, "DAY"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Rank<select value={form.rank} onChange={(event) => update({ rank: event.target.value })}>{RANKS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Station<select value={form.station} onChange={(event) => update({ station: Number(event.target.value) })}>{STATIONS.map((station) => <option key={station.id} value={station.id}>Station {station.id}</option>)}</select></label>
        <label>Unit<select value={form.unit} onChange={(event) => update({ unit: event.target.value })}>{availableUnits.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Kelly group<select value={form.kellyGroup} disabled={form.shift === "DAY"} onChange={(event) => update({ kellyGroup: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="span-two">Transfer note<input value={form.note} onChange={(event) => update({ note: event.target.value })} placeholder="Optional UAT note or transfer order reference" /></label>
      </div>
      <div className="modal-note">The prior assignment becomes the proximity source for the next shift. Opportunity counts, overtime hours, and mandatory rotation position are retained. A promotion enters the member at the bottom of the new in-grade list.</div>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary">Apply personnel change</button></div>
    </form>
  </div>;
}

export function PayCodesView({ profiles, payEntries, onAddPayEntry }) {
  const [form, setForm] = useState({ profileId: profiles[0]?.id || "", codeId: "OVERTIME", date: "2026-08-14", quantity: 24, note: "" });
  const selectedCode = PAY_CODES.find((code) => code.id === form.codeId) || PAY_CODES[0];
  const confirmed = PAY_CODES.filter((code) => code.status === "CONFIRMED").length;
  const open = PAY_CODES.filter((code) => code.status === "OPEN").length;

  return <>
    <div className="section-heading split-heading"><div><span className="eyebrow">TELESTAFF → WORKDAY</span><h2>Pay-code configuration lab</h2><p>Review the discussed crosswalk and create test entries without affecting staffing or production payroll.</p></div><div className="paycode-summary"><div><strong>{PAY_CODES.length}</strong><span>Codes</span></div><div><strong>{confirmed}</strong><span>Confirmed</span></div><div><strong>{open}</strong><span>Open mappings</span></div></div></div>
    <div className="paycode-layout">
      <section className="pay-entry-panel">
        <div className="panel-header"><div><span className="eyebrow">TEST ENTRY</span><h3>Record a personnel pay code</h3></div><Badge tone={toneForStatus(selectedCode.status)}>{selectedCode.status}</Badge></div>
        <form className="pay-entry-form" onSubmit={(event) => { event.preventDefault(); onAddPayEntry(form); setForm({ ...form, note: "" }); }}>
          <label>Employee<select value={form.profileId} onChange={(event) => setForm({ ...form, profileId: event.target.value })}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{shortName(profile.name)} · {profile.rank}</option>)}</select></label>
          <label>TeleStaff pay code<select value={form.codeId} onChange={(event) => setForm({ ...form, codeId: event.target.value })}>{PAY_CODES.map((code) => <option key={code.id} value={code.id}>{code.telestaff}</option>)}</select></label>
          <div className="pay-entry-row"><label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>{selectedCode.quantityType}<input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label></div>
          <label>Note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional test note" /></label>
          <div className="mapping-preview"><span>Workday preview</span><strong>{selectedCode.workday}</strong><code>{selectedCode.workdayCode}</code><p>{selectedCode.treatment}</p></div>
          <button className="button button-primary">Add test entry</button>
        </form>
      </section>
      <section className="pay-ledger-panel">
        <div className="panel-header"><div><span className="eyebrow">EXPORT PREVIEW</span><h3>Recent test entries</h3></div><Badge>{payEntries.length}</Badge></div>
        {payEntries.length ? <div className="pay-ledger-list">{payEntries.slice().reverse().map((entry) => <div className="pay-ledger-row" key={entry.id}><time>{entry.date}</time><div><strong>{shortName(entry.profileName)}</strong><span>{entry.telestaffCode}</span></div><div><strong>{entry.quantity} {entry.quantityType}</strong><span>{entry.workdayCode} · {entry.workday}</span></div></div>)}</div> : <EmptyState title="No test pay entries" body="Select an employee and pay code to preview the Telestaff-to-Workday record." />}
      </section>
    </div>
    <section className="paycode-catalog">
      <div className="panel-header"><div><span className="eyebrow">CONFIGURATION CATALOG</span><h3>Discussed OFD pay codes</h3></div><span className="panel-note">TBD mappings remain visibly unresolved for the vendor work group.</span></div>
      <div className="paycode-table-wrap"><table><thead><tr><th>TeleStaff code</th><th>Workday target</th><th>Workday ID</th><th>Quantity</th><th>Status</th><th>Required treatment</th></tr></thead><tbody>{PAY_CODES.map((code) => <tr key={code.id}><td><strong>{code.telestaff}</strong><span className="cell-subtext">{code.id}</span></td><td>{code.workday}</td><td><code>{code.workdayCode}</code></td><td>{code.quantityType}</td><td><Badge tone={toneForStatus(code.status)}>{code.status}</Badge></td><td>{code.treatment}</td></tr>)}</tbody></table></div>
    </section>
  </>;
}

const NOTIFICATION_COLUMNS = [
  { id: "AWAITING", label: "Awaiting response", statuses: ["AWAITING_RESPONSE"] },
  { id: "ACCEPTED", label: "Accepted", statuses: ["ACCEPTED"] },
  { id: "DECLINED", label: "Declined", statuses: ["REFUSED"] },
  { id: "CLOSED", label: "Expired / delivery / notices", statuses: ["EXPIRED", "FAILED_DELIVERY", "NOTICE_ONLY"] },
];

export function NotificationsView({ notifications, vacancies, onRespond }) {
  const vacancyMap = useMemo(() => new Map(vacancies.map((vacancy) => [vacancy.id, vacancy])), [vacancies]);
  return <>
    <div className="section-heading split-heading"><div><span className="eyebrow">EMPLOYEE EXPERIENCE</span><h2>Text-message notification board</h2><p>Sample wording is clearly marked as test content. Employee responses update the same offer, vacancy, and fairness records used by the Hiring Desk.</p></div><div className="notification-summary"><strong>{notifications.filter((item) => item.status === "AWAITING_RESPONSE").length}</strong><span>awaiting response</span></div></div>
    <div className="notification-guidance"><strong>Reply behavior:</strong> ACCEPT fills the vacancy; DECLINE advances to the next eligible person; no response may be simulated as Offer Expired; failed delivery does not charge an opportunity.</div>
    <div className="notification-board">{NOTIFICATION_COLUMNS.map((column) => {
      const items = notifications.filter((item) => column.statuses.includes(item.status));
      return <section className="notification-column" key={column.id}><header><h3>{column.label}</h3><Badge tone={column.id === "AWAITING" ? "warning" : column.id === "ACCEPTED" ? "success" : column.id === "DECLINED" ? "danger" : "neutral"}>{items.length}</Badge></header><div className="notification-stack">{items.length ? items.slice().reverse().map((item) => {
        const vacancy = vacancyMap.get(item.vacancyId);
        return <article className="phone-card" key={item.id}>
          <div className="phone-card-header"><div><strong>{shortName(item.recipientName)}</strong><span>{item.phone}</span></div><Badge tone={toneForStatus(item.status)}>{item.status.replaceAll("_", " ")}</Badge></div>
          <div className="text-bubble">{item.message}</div>
          <div className="phone-card-meta"><span>{vacancy ? `${vacancy.unit} · Station ${vacancy.station}` : "Vacancy record"}</span><time>{new Date(item.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
          {item.status === "AWAITING_RESPONSE" ? <div className="response-controls"><button className="response-accept" onClick={() => onRespond(item, "ACCEPTED")}>Reply ACCEPT</button><button className="response-decline" onClick={() => onRespond(item, "REFUSED")}>Reply DECLINE</button><button onClick={() => onRespond(item, "EXPIRED")}>Expire</button><button onClick={() => onRespond(item, "FAILED_DELIVERY")}>Delivery failed</button></div> : <div className="recorded-response"><span>Recorded response</span><strong>{item.response || (item.status === "NOTICE_ONLY" ? "ASSIGNED" : item.status)}</strong></div>}
        </article>;
      }) : <EmptyState title="No messages" body="Messages will move through this column as offers are sent and answered." />}</div></section>;
    })}</div>
  </>;
}
