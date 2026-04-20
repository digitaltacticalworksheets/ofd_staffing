import React, { useMemo, useState } from 'react'
import otDataset from './data/ot_dataset.json'
import staffingBuild from './data/staffing_build.json'

const specialTeamMap = {
  Hazmat: new Set(['HAZMAT_TEAM']),
  TRT: new Set(['TRT_TEAM']),
  'TRT, Dive': new Set(['TRT_TEAM', 'DIVE_TEAM']),
  Dive: new Set(['DIVE_TEAM']),
  None: new Set(),
  null: new Set(),
  undefined: new Set(),
}

function parseSkills(value) {
  if (!value || value === 'None') return new Set()
  return new Set(
    String(value)
      .replaceAll('/', ',')
      .replaceAll('+', ',')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s !== 'None')
  )
}

function parseFirstInt(value) {
  if (value == null || value === '') return null
  const m = String(value).match(/(\d+)/)
  return m ? Number(m[1]) : null
}

function buildModel() {
  const unitRules = {}
  for (const row of staffingBuild.Unit_Summary || []) {
    const unit = row.Unit
    if (!unit) continue
    unitRules[unit] = {
      unit,
      unitType: row['Unit Type'] || '',
      specialTeamType: row['Special Team Type'] || null,
      specialTeamMinimum: parseFirstInt(row['Special Team Minimum']),
      paramedicMinimum: String(row['Unit Paramedic Minimum'] || '').includes('At least 1 PARAMEDIC') ? 1 : 0,
      paramedicPreference: row['Paramedic Preference'] || null,
      transportPayRule: row['Transport Pay Rule'] || null,
    }
  }

  const positionMap = {}
  for (const row of staffingBuild.Position_Build || []) {
    const unit = row.Unit
    if (!unit) continue
    if (!positionMap[unit]) positionMap[unit] = []
    positionMap[unit].push({
      unit,
      unitType: row['Unit Type'] || '',
      label: row['Position Label'] || '',
      order: Number(row['Position Order'] || 0),
      rankRequired: row['Rank Required'] || '',
      requiredSkills: parseSkills(row['Required Skills']),
      alternateRankAllowed: row['Alternate Rank Allowed'] || null,
      alternateRankCondition: row['Alternate Rank Condition'] || null,
      notes: row['Notes'] || '',
    })
  }

  for (const unit of Object.keys(positionMap)) {
    positionMap[unit].sort((a, b) => a.order - b.order)
  }

  return { unitRules, positionMap }
}

function candidateEligibility(person, position) {
  const reasons = []
  const rankMatches = person.rank === position.rankRequired

  if (!rankMatches) {
    const alt = position.alternateRankAllowed
    if (alt && person.rank === alt) {
      if (position.alternateRankCondition && position.alternateRankCondition !== 'No special qualification required') {
        const m = String(position.alternateRankCondition).match(/([A-Z_]+)\s*=\s*YES/)
        if (m && !person.skills.includes(m[1])) {
          reasons.push(`Missing ${m[1]} for alternate-rank fill`)
        }
      }
    } else {
      reasons.push(`Requires ${position.rankRequired}${alt ? ` or ${alt}` : ''}`)
    }
  }

  for (const skill of position.requiredSkills) {
    if (position.label === 'Engineer' && person.rank === 'Engineer') continue
    if (!person.skills.includes(skill)) reasons.push(`Missing ${skill}`)
  }

  return { ok: reasons.length === 0, reasons }
}

function candidatePriority(person, position) {
  let bucket = 9
  let pref = 1
  if (person.rank === position.rankRequired) {
    bucket = 0
  } else if (position.rankRequired === 'Lieutenant' && person.rank === 'Engineer') {
    bucket = 1
    pref = person.skills.includes('PROMOTIONAL_LIST') ? 0 : 1
  } else if (position.rankRequired === 'Engineer' && person.rank === 'Firefighter') {
    bucket = 1
    pref = person.skills.includes('RELIEF_DRIVER') ? 0 : 1
  } else {
    bucket = 5
  }
  return [bucket, pref, person.ot_hours_total, person.refusals, person.name]
}

function comparePriority(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return -1
    if ((a[i] ?? 0) > (b[i] ?? 0)) return 1
  }
  return 0
}

function getPositionFamily(unit) {
  if (unit.startsWith('E')) return 'Engine'
  if (unit.startsWith('T')) return 'Tower'
  if (unit.startsWith('R')) return 'Rescue'
  if (unit.startsWith('M')) return 'Medic'
  return 'Other'
}

function summaryForShift(people) {
  const totalHours = people.reduce((sum, p) => sum + (p.ot_hours_total || 0), 0)
  const totalRefusals = people.reduce((sum, p) => sum + (p.refusals || 0), 0)
  const paramedics = people.filter((p) => p.skills.includes('PARAMEDIC')).length
  const special = people.filter((p) =>
    p.skills.some((s) => ['HAZMAT_TEAM', 'TRT_TEAM', 'DIVE_TEAM', 'STRUCTURAL_COLLAPSE_TEAM'].includes(s))
  ).length
  return { totalHours, totalRefusals, paramedics, special }
}

function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function Tile({ label, value, sublabel }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sublabel ? <div className="tile-sub">{sublabel}</div> : null}
    </div>
  )
}

export default function App() {
  const model = useMemo(() => buildModel(), [])
  const [shift, setShift] = useState('A')
  const [unit, setUnit] = useState('E1')
  const [positionLabel, setPositionLabel] = useState('Lieutenant')
  const [search, setSearch] = useState('')

  const people = useMemo(() => otDataset.people_by_shift?.[shift] || [], [shift])
  const shiftSummary = useMemo(() => summaryForShift(people), [people])
  const units = useMemo(() => Object.keys(model.positionMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [model])
  const positionsForUnit = useMemo(() => (model.positionMap[unit] || []).map((p) => p.label), [model, unit])
  const selectedPosition = useMemo(() => (model.positionMap[unit] || []).find((p) => p.label === positionLabel), [model, unit, positionLabel])

  const candidates = useMemo(() => {
    if (!selectedPosition) return []
    return people
      .map((person) => ({ person, eligibility: candidateEligibility(person, selectedPosition) }))
      .filter((row) => row.eligibility.ok)
      .map((row) => ({
        ...row.person,
        priority: candidatePriority(row.person, selectedPosition),
      }))
      .sort((a, b) => comparePriority(a.priority, b.priority))
  }, [people, selectedPosition])

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q) ||
      p.rank.toLowerCase().includes(q) ||
      p.skills.join(' ').toLowerCase().includes(q)
    )
  }, [people, search])

  const unitRule = model.unitRules[unit]
  const specialFlags = Array.from(specialTeamMap[unitRule?.specialTeamType] || [])

  React.useEffect(() => {
    if (!positionsForUnit.includes(positionLabel) && positionsForUnit.length) {
      setPositionLabel(positionsForUnit[0])
    }
  }, [positionsForUnit, positionLabel])

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <h1>OFD Staffing Model</h1>
          <p>
            GitHub-ready web app using your staffing build plus normalized A, B, and C shift KD/OT books.
          </p>
        </div>
        <div className="hero-badges">
          <Badge tone="success">{otDataset.people.length} people loaded</Badge>
          <Badge>{Object.keys(model.positionMap).length} staffed units</Badge>
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <div className="field">
            <label>Shift</label>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {Object.keys(otDataset.people_by_shift).map((s) => (
                <option key={s} value={s}>{s} Shift</option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label>Search personnel</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, unit, rank, or skill" />
          </div>
        </div>

        <div className="tile-grid">
          <Tile label="People in shift" value={people.length} />
          <Tile label="OT hours worked" value={shiftSummary.totalHours.toFixed(0)} />
          <Tile label="Refusals" value={shiftSummary.totalRefusals} />
          <Tile label="Paramedics" value={shiftSummary.paramedics} />
          <Tile label="Special team members" value={shiftSummary.special} />
        </div>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="section-head">
            <h2>Vacancy tool</h2>
            <p>Ranks eligible off-duty candidates using your staffing rules, ride-up logic, OT hours, and refusals.</p>
          </div>

          <div className="toolbar toolbar-3">
            <div className="field">
              <label>Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Position</label>
              <select value={positionLabel} onChange={(e) => setPositionLabel(e.target.value)}>
                {positionsForUnit.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
            </div>
            <div className="rule-card">
              <div className="rule-title">{unit} rules</div>
              <div className="rule-line">Type: <strong>{unitRule?.unitType || getPositionFamily(unit)}</strong></div>
              <div className="rule-line">Paramedic minimum: <strong>{unitRule?.paramedicMinimum || 0}</strong></div>
              <div className="rule-line">Special team minimum: <strong>{unitRule?.specialTeamMinimum || 0}</strong></div>
              <div className="rule-line">Special team flags: <strong>{specialFlags.join(', ') || 'None'}</strong></div>
            </div>
          </div>

          <div className="candidate-list">
            {selectedPosition ? candidates.slice(0, 25).map((c, idx) => (
              <div className="candidate-card" key={c.employee_id}>
                <div className="candidate-head">
                  <div>
                    <div className="candidate-rankno">#{idx + 1}</div>
                    <div className="candidate-name">{c.name}</div>
                    <div className="candidate-meta">{c.rank} • {c.unit || 'No unit listed'} • Promo {c.promo_date || 'n/a'}</div>
                  </div>
                  <div className="candidate-stats">
                    <Badge tone="info">{c.ot_hours_total.toFixed(0)} hrs</Badge>
                    <Badge tone="warning">{c.refusals} refusals</Badge>
                    {c.no_contacts ? <Badge tone="danger">{c.no_contacts} NC</Badge> : null}
                  </div>
                </div>
                <div className="skill-wrap">
                  {c.skills.map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
              </div>
            )) : <div className="empty">Choose a unit and position.</div>}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Shift personnel</h2>
            <p>This view is using the normalized OT dataset extracted from the three books.</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rank</th>
                  <th>Unit</th>
                  <th>OT Hours</th>
                  <th>Ref</th>
                  <th>NC</th>
                  <th>Skills</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.slice(0, 200).map((p) => (
                  <tr key={p.employee_id}>
                    <td>{p.name}</td>
                    <td>{p.rank}</td>
                    <td>{p.unit || ''}</td>
                    <td>{p.ot_hours_total.toFixed(0)}</td>
                    <td>{p.refusals}</td>
                    <td>{p.no_contacts}</td>
                    <td className="skills-cell">{p.skills.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <h2>What’s included</h2>
          <p>The app ships with your current staffing build and normalized OT data.</p>
        </div>
        <ul className="notes">
          <li>Embedded staffing build from <strong>OFD Telestaff Staffing Build.xlsx</strong>.</li>
          <li>Embedded personnel and OT history from all three 2026 KD/OT books.</li>
          <li>Hours worked and refusals are used in candidate ranking.</li>
          <li>Ride-up logic supports Firefighter → Engineer via <strong>RELIEF_DRIVER</strong>.</li>
          <li>Ride-up logic supports Engineer → Lieutenant, with <strong>PROMOTIONAL_LIST</strong> preference when present in source data.</li>
          <li>Unknown skill letters are preserved as <strong>RAW_*</strong> tags so nothing gets lost.</li>
        </ul>
      </section>
    </div>
  )
}
