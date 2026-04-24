import React, { useEffect, useMemo, useState } from "react";
import staffingBuild from "./data/staffing_build.json";

const SNAPSHOT_DATE = "2026-04-20";
const API_BASE = "";

const DISTRICTS = {
  D1: ["AC1", "D1", "E1", "E101", "E4", "E5", "E6", "T1", "T6", "R1", "R6"],
  D2: ["D2", "E10", "E12", "E17", "T10", "R10", "R12"],
  D3: ["D3", "E2", "E3", "E7", "E9", "T2", "T9", "HR1", "R3", "R7", "R9"],
  D4: ["D4", "E8", "E11", "E13", "T8", "T11", "R8", "R11"],
  D5: ["D5", "E14", "E15", "E16", "E19", "T15", "HAZ1", "R15"],
};

const ALL_UNITS = Object.values(DISTRICTS).flat();

const PAY_CODES = [
  "",
  "REG",
  "VAC",
  "SICK",
  "ORSA",
  "MIL",
  "TRAINING",
  "LIGHT DUTY",
  "TS+",
  "TS-",
  "WHE",
  "WHL",
  "WHD",
  "WHA",
  "TRP",
];

function computeShiftKelly(dateStr) {
  // Matches April 2026 calendar pattern:
  // Apr 20 = B-8, Apr 21 = C-1, Apr 22 = A-1, Apr 23 = B-1
  const anchor = new Date("2026-04-21T00:00:00");
  const target = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.floor((target - anchor) / 86400000);

  const shifts = ["C", "A", "B"];
  const shift = shifts[((diffDays % 3) + 3) % 3];
  const kelly = (((Math.floor(diffDays / 3) + 1 - 1) % 8) + 8) % 8 + 1;

  return { shift, kelly };
}

function normalizeUnit(unit) {
  return String(unit || "")
    .toUpperCase()
    .replace("ENGINE", "E")
    .replace("TOWER", "T")
    .replace("TRUCK", "T")
    .replace("RESCUE", "R")
    .replace("DISTRICT", "D")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/^E0+/, "E")
    .replace(/^T0+/, "T")
    .replace(/^R0+/, "R")
    .replace(/^D0+/, "D")
    .replace(/^HR01$/, "HR1")
    .replace(/^HM1$/, "HAZ1");
}

function normalizePerson(p) {
  return {
    ...p,
    name: String(p.name || "").trim(),
    rank: String(p.rank || "").trim(),
    shift: String(p.shift || "").trim().toUpperCase(),
    kd: Number(p.kd) || null,
    assignment: normalizeUnit(p.assignment || p.unit),
    payCode: String(p.payCode || p.pay_code || "").trim(),
    credentials: Array.isArray(p.credentials) ? p.credentials : [],
  };
}

function personKey(person) {
  return person.employee_id || `${person.name}-${person.rank}-${person.shift}-${person.kd}`;
}

function getCredentialCodes(person) {
  return (person.credentials || [])
    .map((c) => String(c.code || c.Credential || c.credential || "").trim())
    .filter(Boolean);
}

function hasCredential(person, codes) {
  const personCodes = getCredentialCodes(person).map((c) => c.toUpperCase());
  return codes.some((c) => personCodes.includes(c.toUpperCase()));
}

function isOfficer(person) {
  const rank = String(person.rank || "").toUpperCase().replace(/\s+/g, "");
  return rank.includes("LT") || rank.includes("LTP") || rank.includes("LTE") || rank.includes("LIEUTENANT");
}

function isEngineer(person) {
  const rank = String(person.rank || "").toUpperCase().replace(/\s+/g, "");
  return (
    rank.includes("ENG") ||
    rank.includes("ENGINEER") ||
    rank.includes("ENP") ||
    rank.includes("ENE") ||
    rank.includes("ENGEMT") ||
    rank.includes("ENGPM")
  );
}

function isParamedic(person) {
  const rank = String(person.rank || "").toUpperCase().replace(/\s+/g, "");
  return rank.includes("PM") || rank.includes("PARAMEDIC") || rank.includes("LTP") || rank.includes("ENP") || rank.includes("ENGPM") || rank.includes("FFP") || hasCredential(person, ["P", "PM"]);
}

function buildModel() {
  const map = {};

  staffingBuild.Position_Build.forEach((row) => {
    const unit = normalizeUnit(row.Unit);
    if (!map[unit]) map[unit] = [];

    map[unit].push({
      position: row["Position Label"],
      rank: row["Rank Required"],
      order: Number(row["Position Order"]) || 0,
    });
  });

  // Chief officer positions: one seat each
  ["AC1", "D1", "D2", "D3", "D4", "D5"].forEach((unit) => {
    map[unit] = [
      {
        position: "Chief",
        rank: "Chief Officer",
        order: 1,
      },
    ];
  });

  // Heavy Rescue 1: force 5 seats
  map.HR1 = [
    { position: "Officer", rank: "Lieutenant", order: 1 },
    { position: "Engineer", rank: "Engineer", order: 2 },
    { position: "Firefighter", rank: "Firefighter", order: 3 },
    { position: "Firefighter", rank: "Firefighter", order: 4 },
    { position: "Firefighter", rank: "Firefighter", order: 5 },
  ];

  Object.keys(map).forEach((unit) => map[unit].sort((a, b) => a.order - b.order));
  return map;
}

function canFillSeat(person, seat) {
  const required = String(seat.rank || seat.position || "").toUpperCase();
  if (required.includes("CHIEF")) return true;
  if (required.includes("LIEUTENANT") || required.includes("OFFICER") || required.includes("LT")) return isOfficer(person);
  if (required.includes("ENGINEER") || required.includes("DRIVER")) return isEngineer(person) || hasCredential(person, ["E"]);
  return true;
}

function scoreSeatFit(person, seat, unit) {
  let score = 0;
  const position = String(seat.position || "").toUpperCase();
  const cleanUnit = normalizeUnit(unit);
  if (canFillSeat(person, seat)) score += 100;
  if (isParamedic(person)) score += 15;
  if (cleanUnit.startsWith("T") && hasCredential(person, ["L", "T"])) score += 25;
  if (cleanUnit === "HAZ1" && hasCredential(person, ["H"])) score += 30;
  if (cleanUnit === "HR1" && hasCredential(person, ["A", "B", "D"])) score += 30;
  if (position.includes("PARAMEDIC") && isParamedic(person)) score += 40;
  return score;
}

function makeManualLeaveSet(manualLeave) {
  return new Set(
    manualLeave
      .split(/\n|,/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
  );
}

function autoStaff(model, rawPeople, shift, kelly, manualLeave) {
  const manualLeaveSet = makeManualLeaveSet(manualLeave);
  const people = rawPeople.map(normalizePerson);
  const used = new Set();
  const board = {};

  const activePeople = people.filter(
    (p) => p.shift === shift && Number(p.kd) !== Number(kelly) && !manualLeaveSet.has(p.name.toUpperCase())
  );

  ALL_UNITS.forEach((unit) => {
    const seats = model[unit] || [];
    const assignedToUnit = activePeople.filter((p) => p.assignment === unit);

    const rows = seats.map((seat) => {
      const candidates = assignedToUnit
        .filter((p) => !used.has(personKey(p)) && canFillSeat(p, seat))
        .sort((a, b) => scoreSeatFit(b, seat, unit) - scoreSeatFit(a, seat, unit));
      const pick = candidates[0] || null;
      if (pick) used.add(personKey(pick));
      return { ...seat, assigned: pick };
    });

    const extras = assignedToUnit.filter((p) => !used.has(personKey(p)));
    extras.forEach((p) => used.add(personKey(p)));
    board[unit] = { unit, rows, extras };
  });

  const floaters = activePeople.filter((p) => {
    const key = personKey(p);
    return !used.has(key) || !ALL_UNITS.includes(p.assignment);
  });

  return { board, floaters, activePeople };
}

function CredentialBadges({ person }) {
  if (!person) return null;
  const codes = getCredentialCodes(person);
  if (!codes.length) return null;
  return (
    <div className="credential-row">
      {codes.map((code, idx) => (
        <span key={`${person.name}-${code}-${idx}`} className="cred-badge">{code}</span>
      ))}
    </div>
  );
}

function PersonChip({ person, draggable = false, onDragStart, onClick }) {
  if (!person) return <span className="vacant-text">Vacant</span>;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(person);
      }}
      className={`person-chip ${isParamedic(person) ? "medic" : ""}`}
      title="Click to edit unit or pay code"
    >
      <div className="person-chip-main">
        <strong>{person.name}</strong>
        <span>{person.rank}</span>
      </div>

      <div className="person-chip-subline">
        <span>{person.assignment || "No Unit"}</span>
        {person.payCode ? <span className="pay-code-pill">{person.payCode}</span> : null}
      </div>

      <CredentialBadges person={person} />
    </div>
  );
}
function UnitCard({ unit, unitData, onDragStart, onDrop, onPersonClick }) {
  const rows = unitData?.rows || [];
  const extras = unitData?.extras || [];
  const vacantCount = rows.filter((r) => !r.assigned).length;
  const medicCount = [...rows.map((r) => r.assigned), ...extras].filter(Boolean).filter(isParamedic).length;
  const status = vacantCount > 0 ? "open" : extras.length > 0 ? "extra" : "covered";

  return (
    <div className={`unit-card ${status}`}>
      <div className="unit-card-header">
        <div>
          <h3>{unit}</h3>
          <p>{rows.length} seats • {medicCount} PM</p>
        </div>
        <span className={`status-pill ${status}`}>{status === "covered" ? "Covered" : status === "extra" ? `+${extras.length}` : `${vacantCount} open`}</span>
      </div>

      <div className="slot-list">
        {rows.map((row, index) => (
          <div key={`${unit}-${index}`} className="slot-row" onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(unit, index, "seat")}>
            <div className="slot-label">{row.position}</div>
            <PersonChip
              person={row.assigned}
              draggable={Boolean(row.assigned)}
              onDragStart={() => onDragStart({ unit, index, type: "seat" })}
              onClick={onPersonClick}
            />
          </div>
        ))}
      </div>

      <div className="extra-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(unit, null, "extra")}>
        <div className="extra-zone-title">Extra assigned to {unit}</div>
        {extras.length ? extras.map((person, index) => (
          <PersonChip
            key={`${unit}-extra-${personKey(person)}-${index}`}
            person={person}
            draggable
            onDragStart={() => onDragStart({ unit, index, type: "extra" })}
            onClick={onPersonClick}
          />
        )) : <div className="empty-extra">Drop extra personnel here</div>}
      </div>
    </div>
  );
}

function FloatersPanel({ floaters, onDragStart, onDrop, onPersonClick }) {
  return (
    <aside className="floaters-panel" onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop("FLOATERS", null, "floater")}>
      <div className="floaters-header"><h2>Floaters / Unassigned</h2><span>{floaters.length}</span></div>
      <p className="panel-note">Personnel not assigned to a modeled unit, or manually moved here.</p>
      <div className="floater-list">
        {floaters.length ? floaters.map((person, index) => (
          <PersonChip
            key={`floater-${personKey(person)}-${index}`}
            person={person}
            draggable
            onDragStart={() => onDragStart({ unit: "FLOATERS", index, type: "floater" })}
            onClick={onPersonClick}
          />
        )) : <div className="empty-extra">No floaters</div>}
      </div>
    </aside>
  );
}

function LeaveList({ title, people, tone = "gray", onPersonClick }) {
  return (
    <div className={`leave-list ${tone}`}>
      <div className="leave-list-header">
        <h3>{title}</h3>
        <span>{people.length}</span>
      </div>
      <div className="leave-list-body">
        {people.length ? people.slice(0, 100).map((person) => (
          <div key={`${title}-${personKey(person)}`} className="leave-person-row" onClick={() => onPersonClick(person)}>
            <div>
              <strong>{person.name}</strong>
              <p>{person.rank} • {person.assignment || "No assignment"} • {person.shift || "?"} shift • KD {person.kd || "?"}</p>
            </div>
            <CredentialBadges person={person} />
          </div>
        )) : <div className="empty-extra">None listed</div>}
      </div>
    </div>
  );
}

function EditPersonModal({ person, setPerson, onSave, onCancel }) {
  if (!person) return null;

  return (
    <div className="edit-modal-backdrop" onClick={onCancel}>
      <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Personnel</h2>

        <div className="edit-person-header">
          <strong>{person.name}</strong>
          <span>{person.rank} • {person.shift || "?"} shift • KD {person.kd || "?"}</span>
        </div>

        <label>
          Assigned Unit
          <select
            value={person.assignment || ""}
            onChange={(e) => setPerson({ ...person, assignment: e.target.value })}
          >
            <option value="">No Unit / Floater</option>
            {ALL_UNITS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </label>

        <label>
          Pay Code
          <select
            value={person.payCode || ""}
            onChange={(e) => setPerson({ ...person, payCode: e.target.value })}
          >
            {PAY_CODES.map((code) => (
              <option key={code || "blank"} value={code}>{code || "None"}</option>
            ))}
          </select>
        </label>

        <div className="edit-modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
function LeaveChipGroup({ title, people, onDragStart, onPersonClick }) {
  return (
    <div className="leave-chip-group">
      <div className="leave-chip-header">
        <h3>{title}</h3>
        <span>{people.length}</span>
      </div>

      <div className="leave-chip-list">
        {people.length ? (
          people.map((person, index) => (
            <PersonChip
              key={`${title}-${personKey(person)}-${index}`}
              person={person}
              draggable
              onDragStart={() =>
                onDragStart({
                  unit: "LEAVE",
                  index,
                  type: "leave",
                  person,
                })
              }
              onClick={onPersonClick}
            />
          ))
        ) : (
          <div className="empty-extra">None</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const model = useMemo(() => buildModel(), []);
  const [date, setDate] = useState(SNAPSHOT_DATE);
  const [people, setPeople] = useState([]);
  const [fileStatus, setFileStatus] = useState("No roster loaded");
  const [board, setBoard] = useState({});
  const [floaters, setFloaters] = useState([]);
  const [drag, setDrag] = useState(null);
  const [search, setSearch] = useState("");
  const [manualLeave, setManualLeave] = useState("");
  const [showLeavePanel, setShowLeavePanel] = useState(true);
  const [editingPerson, setEditingPerson] = useState(null);

  const { shift, kelly } = computeShiftKelly(date);

  const leaveGroups = useMemo(() => {
    const normalized = people.map(normalizePerson);
    const manualLeaveSet = makeManualLeaveSet(manualLeave);
    return {
      manualLeave: normalized.filter((p) => manualLeaveSet.has(p.name.toUpperCase())),
      kellyDay: normalized.filter((p) => p.shift === shift && Number(p.kd) === Number(kelly)),
      offShift: normalized.filter((p) => p.shift && p.shift !== shift),
      noAssignment: normalized.filter((p) => !p.assignment),
      activeOnShift: normalized.filter((p) => p.shift === shift && Number(p.kd) !== Number(kelly) && !manualLeaveSet.has(p.name.toUpperCase())),
    };
  }, [people, shift, kelly, manualLeave]);

  const totals = useMemo(() => {
    const units = Object.values(board);
    const seats = units.flatMap((u) => u.rows || []);
    const extras = units.flatMap((u) => u.extras || []);
    return {
      personnel: people.length,
      activeAssigned: seats.filter((s) => s.assigned).length + extras.length,
      vacancies: seats.filter((s) => !s.assigned).length,
      extras: extras.length,
      floaters: floaters.length,
      medics: [...seats.map((s) => s.assigned), ...extras, ...floaters].filter(Boolean).filter(isParamedic).length,
      kellyLeave: leaveGroups.kellyDay.length,
      manualLeave: leaveGroups.manualLeave.length,
      offShift: leaveGroups.offShift.length,
    };
  }, [board, floaters, people.length, leaveGroups]);

  async function loadBackendRoster() {
    try {
      const res = await fetch(`${API_BASE}/api/roster/current`);
      const data = await res.json();
      setPeople((data.people || []).map(normalizePerson));
      setFileStatus(`${data.count ?? data.people?.length ?? 0} personnel loaded`);
    } catch (err) {
      console.error(err);
      setFileStatus("Backend not reachable");
    }
  }

  async function uploadRoster(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/roster/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setFileStatus(`Upload failed: ${data.detail || data.error || "Unknown error"}`);
        return;
      }
      setPeople((data.people || []).map(normalizePerson));
      setFileStatus(`${data.count} people uploaded`);
    } catch (err) {
      console.error(err);
      setFileStatus("Upload error");
    }
  }

  useEffect(() => { loadBackendRoster(); }, []);

  useEffect(() => {
    const result = autoStaff(model, people, shift, kelly, manualLeave);
    setBoard(result.board);
    setFloaters(result.floaters);
  }, [model, people, shift, kelly, manualLeave]);

  function updatePersonEverywhere(updatedPerson) {
    const normalized = normalizePerson(updatedPerson);
    const key = personKey(normalized);

    setPeople((prev) =>
      prev.map((p) => (personKey(normalizePerson(p)) === key ? { ...p, ...normalized } : p))
    );

    setBoard((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      Object.values(copy).forEach((unitData) => {
        unitData.rows?.forEach((row) => {
          if (row.assigned && personKey(normalizePerson(row.assigned)) === key) {
            row.assigned = { ...row.assigned, ...normalized };
          }
        });
        unitData.extras = (unitData.extras || []).map((p) =>
          personKey(normalizePerson(p)) === key ? { ...p, ...normalized } : p
        );
      });
      return copy;
    });

    setFloaters((prev) =>
      prev.map((p) => (personKey(normalizePerson(p)) === key ? { ...p, ...normalized } : p))
    );
  }

  function drop(targetUnit, targetIndex, targetType) {
    if (!drag) return;
    const copy = JSON.parse(JSON.stringify(board));
    const floaterCopy = [...floaters];
    let draggedPerson = null;

    if (drag.type === "seat") draggedPerson = copy[drag.unit]?.rows?.[drag.index]?.assigned || null;
    if (drag.type === "extra") draggedPerson = copy[drag.unit]?.extras?.[drag.index] || null;
    if (drag.type === "floater") draggedPerson = floaterCopy[drag.index] || null;
    if (!draggedPerson) return;

    if (drag.type === "seat") copy[drag.unit].rows[drag.index].assigned = null;
    if (drag.type === "extra") copy[drag.unit].extras.splice(drag.index, 1);
    if (drag.type === "floater") floaterCopy.splice(drag.index, 1);

    if (targetType === "seat") {
      const existing = copy[targetUnit].rows[targetIndex].assigned;
      copy[targetUnit].rows[targetIndex].assigned = draggedPerson;
      if (existing) copy[targetUnit].extras.push(existing);
    }
    if (targetType === "extra") copy[targetUnit].extras.push(draggedPerson);
    if (targetType === "floater") floaterCopy.push(draggedPerson);

    setBoard(copy);
    setFloaters(floaterCopy);
    setDrag(null);
  }

  const filteredDistricts = Object.entries(DISTRICTS).map(([district, units]) => [
    district,
    units.filter((unit) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const unitData = board[unit];
      const names = [
        ...(unitData?.rows || []).map((r) => r.assigned?.name || ""),
        ...(unitData?.extras || []).map((p) => p.name || ""),
      ].join(" ").toLowerCase();
      return unit.toLowerCase().includes(q) || names.includes(q);
    }),
  ]).filter(([, units]) => units.length);

  return (
    <div className="page-shell">
      <header className="app-header">
        <div><h1>OFD Staffing</h1><p>{fileStatus}</p></div>
        <div className="control-bar">
          <label className="upload-button">Upload Excel<input type="file" accept=".xlsx,.xls" onChange={uploadRoster} /></label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={loadBackendRoster}>Reload</button>
        </div>
      </header>

      <section className="summary-strip">
        <div><span>{shift}</span><label>Shift</label></div>
        <div><span>{kelly}</span><label>Kelly Day</label></div>
        <div><span>{totals.activeAssigned}</span><label>Assigned</label></div>
        <div><span>{totals.vacancies}</span><label>Vacancies</label></div>
        <div><span>{totals.extras}</span><label>Extras</label></div>
        <div><span>{totals.floaters}</span><label>Floaters</label></div>
        <div><span>{totals.medics}</span><label>Paramedics</label></div>
        <div><span>{totals.kellyLeave}</span><label>KD Leave</label></div>
        <div><span>{totals.manualLeave}</span><label>Manual Leave</label></div>
      </section>

      <div className="search-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search unit or personnel..." />
        <button className="toggle-leave-button" onClick={() => setShowLeavePanel((v) => !v)}>{showLeavePanel ? "Hide Leave Lists" : "Show Leave Lists"}</button>
      </div>

      {showLeavePanel && (
        <section className="leave-panel">
          <div className="leave-editor">
            <h2>Leave / Availability Lists</h2>
            <p>Enter vacation, sick, training, ORSA, military leave, light duty, or other leave manually for now. Names must match the uploaded roster.</p>
            <textarea value={manualLeave} onChange={(e) => setManualLeave(e.target.value)} placeholder={`Example:\nBASSANI, AL\nJELENEK, ANTHONY`} />
          </div>
          <LeaveChipGroup title="Manual Leave / Unavailable" people={leaveGroups.manualLeave} onDragStart={setDrag} onPersonClick={setEditingPerson} />
          <LeaveChipGroup title={`Kelly Day ${kelly}`} people={leaveGroups.kellyDay} onDragStart={setDrag} onPersonClick={setEditingPerson} />
          <LeaveChipGroup title="Off Shift" people={leaveGroups.offShift} onDragStart={setDrag} onPersonClick={setEditingPerson} />
          <LeaveChipGroup title="No Assignment" people={leaveGroups.noAssignment} onDragStart={setDrag} onPersonClick={setEditingPerson} />
        </section>
      )}

      <main className="layout-grid">
        <div className="district-board">
          {filteredDistricts.map(([district, units]) => (
            <section key={district} className="district-section">
              <h2>{district}</h2>
              <div className="unit-grid">
                {units.map((unit) => (
                  <UnitCard
                    key={unit}
                    unit={unit}
                    unitData={board[unit]}
                    onDragStart={setDrag}
                    onDrop={drop}
                    onPersonClick={setEditingPerson}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <FloatersPanel floaters={floaters} onDragStart={setDrag} onDrop={drop} onPersonClick={setEditingPerson} />
      </main>

      <EditPersonModal
        person={editingPerson}
        setPerson={setEditingPerson}
        onCancel={() => setEditingPerson(null)}
        onSave={() => {
          updatePersonEverywhere({ ...editingPerson, assignment: normalizeUnit(editingPerson.assignment) });
          setEditingPerson(null);
        }}
      />
    </div>
  );
}
