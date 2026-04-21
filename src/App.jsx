import React, { useMemo, useState } from 'react'
import otDataset from './data/ot_dataset.json'
import staffingBuild from './data/staffing_build.json'
import rosterSnapshot from './data/roster_snapshot_2026-04-20.json'
import availabilitySnapshot from './data/availability_snapshot_2026-04-20.json'
import vacationsByDate from './data/vacations_by_date.json'

const SNAPSHOT_DATE = '2026-04-20'
const DISTRICTS = {
  D1: ['AC1', 'D1', 'E1', 'E101', 'E4', 'E5', 'E6', 'T1', 'T6', 'R1', 'R6', 'M102'],
  D2: ['D2', 'E10', 'E12', 'E17', 'T10', 'R10', 'R12', 'M171'],
  D3: ['D3', 'E2', 'E3', 'E7', 'E9', 'T2', 'T9', 'HR1', 'R2', 'R3', 'R7', 'R9'],
  D4: ['D4', 'E8', 'E11', 'E13', 'T8', 'T11', 'R8', 'R11', 'M141', 'M801'],
  D5: ['D5', 'E14', 'E15', 'E16', 'E19', 'T15', 'HAZ1', 'R15', 'M161', 'M901'],
}

const SHORT_TO_LONG = {
  E1:'Engine 1', E2:'Engine 2', E3:'Engine 3', E4:'Engine 4', E5:'Engine 5', E6:'Engine 6', E7:'Engine 7', E8:'Engine 8', E9:'Engine 9',
  E10:'Engine 10', E11:'Engine 11', E12:'Engine 12', E13:'Engine 13', E14:'Engine 14', E15:'Engine 15', E16:'Engine 16', E17:'Engine 17', E19:'Engine 19', E101:'Engine 101',
  T1:'Tower 1', T2:'Tower 2', T6:'Tower 6', T8:'Tower 8', T9:'Tower 9', T10:'Tower 10', T11:'Tower 11', T15:'Tower 15',
  R1:'Rescue 1', R2:'Rescue 2', R3:'Rescue 3', R6:'Rescue 6', R7:'Rescue 7', R8:'Rescue 8', R9:'Rescue 9', R10:'Rescue 10', R11:'Rescue 11', R12:'Rescue 12', R15:'Rescue 15',
  HR1:'Heavy Rescue 1', HAZ1:'Hazmat 1',
  M102:'Medic 102', M141:'Medic 141', M161:'Medic 161', M171:'Medic 171', M801:'Medic 801', M901:'Medic 901',
  D1:'District Chief 1', D2:'District Chief 2', D3:'District Chief 3', D4:'District Chief 4', D5:'District Chief 5', AC1:'Assistant Chief 1'
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
  const byLongName = {}
  for (const row of staffingBuild.Unit_Summary || []) {
    const unit = row.Unit
    if (!unit) continue
    const rule = {
      unit,
      unitType: row['Unit Type'] || '',
      staffingPattern: row['Staffing Pattern'] || '',
      specialTeamType: row['Special Team Type'] || null,
      specialTeamMinimum: parseFirstInt(row['Special Team Minimum']),
      paramedicMinimum: String(row['Unit Paramedic Minimum'] || '').includes('At least 1 PARAMEDIC') ? 1 : 0,
      paramedicPreference: row['Paramedic Preference'] || null,
      transportPayRule: row['Transport Pay Rule'] || null,
      notes: row['Notes'] || '',
    }
    unitRules[unit] = rule
    byLongName[unit] = rule
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
      preferenceOrder: row['Preference Order'] || '',
      whcCode: row['WHC Code If Alternate Assigned'] || '',
      whcMinimumHours: row['WHC Minimum Hours'] || '',
      notes: row['Position Notes'] || '',
    })
  }
  for (const unit of Object.keys(positionMap)) positionMap[unit].sort((a,b)=>a.order-b.order)

  const shortRules = {}
  const shortPositions = {}
  for (const [shortName, longName] of Object.entries(SHORT_TO_LONG)) {
    if (byLongName[longName]) shortRules[shortName] = byLongName[longName]
    if (positionMap[longName]) shortPositions[shortName] = positionMap[longName]
  }

  return { unitRules: shortRules, positionMap: shortPositions, fullRules: byLongName, fullPositions: positionMap }
}

function computeShiftKelly(dateStr) {
  const base = new Date('2026-01-01T00:00:00')
  const target = new Date(`${dateStr}T00:00:00`)
  const diffDays = Math.floor((target - base) / 86400000)
  const shifts = ['A', 'B', 'C']
  const shift = shifts[((diffDays % 3) + 3) % 3]
  const kelly = (((4 - 1 + diffDays) % 8) + 8) % 8 + 1
  return { shift, kelly }
}

function normalizeName(name) {
  return String(name || '').toUpperCase().replace(/\s+/g, ' ').trim()
}

function buildOffLists(dateStr, shift) {
  const dateVac = vacationsByDate?.[dateStr]?.[shift] || []
  const scheduledVacation = [...new Set(dateVac.filter((e) => e.code === 'VAC').map((e) => e.name))]
  const rdof = [...new Set(dateVac.filter((e) => e.code === 'RDOF').map((e) => e.name))]
  if (dateStr === SNAPSHOT_DATE) {
    return {
      scheduledVacation,
      rdof,
      sick24: [...new Set(availabilitySnapshot.sick24 || [])],
      kelly: [...new Set(availabilitySnapshot.kelly || [])],
      sickPartial: availabilitySnapshot.sickPartial || [],
      miscLeave: [...new Set((availabilitySnapshot.miscLeave || []).map((x) => typeof x === 'string' ? x : x.name))],
      timeSwap: availabilitySnapshot.timeSwap || [],
      lightDuty: [...new Set(availabilitySnapshot.lightDuty || [])],
      otLeave: [...new Set((availabilitySnapshot.otLeave || []).map((x) => typeof x === 'string' ? x : x.name))],
    }
  }
  return { scheduledVacation, rdof, sick24: [], kelly: [], sickPartial: [], miscLeave: [], timeSwap: [], lightDuty: [], otLeave: [] }
}

function buildProjectedShiftPeople(dateStr, shift, offLists) {
  const offNames = new Set([...offLists.scheduledVacation, ...offLists.rdof, ...offLists.sick24].map(normalizeName))
  return (otDataset.people_by_shift?.[shift] || []).filter((p) => !offNames.has(normalizeName(p.name)))
}

function candidateEligibility(person, position) {
  const reasons = []
  const exact = person.rank === position.rankRequired
  if (!exact) {
    const alt = position.alternateRankAllowed
    if (alt && person.rank === alt) {
      if (position.alternateRankCondition && position.alternateRankCondition !== 'No special qualification required') {
        const m = String(position.alternateRankCondition).match(/([A-Z_]+)\s*=\s*YES/)
        if (m && !person.skills.includes(m[1])) reasons.push(`Missing ${m[1]}`)
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

function comparePriority(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return -1
    if ((a[i] ?? 0) > (b[i] ?? 0)) return 1
  }
  return 0
}

function personScoreForPosition(person, position, unit) {
  let score = 100
  if (person.unit && person.unit.replace(/^0+/, '') === unit.replace(/^0+/, '')) score -= 40
  if (person.rank === position.rankRequired) score -= 25
  else if (position.rankRequired === 'Lieutenant' && person.rank === 'Engineer') score -= 12
  else if (position.rankRequired === 'Engineer' && person.rank === 'Firefighter' && person.skills.includes('RELIEF_DRIVER')) score -= 10
  if (position.rankRequired === 'Lieutenant' && person.rank === 'Engineer' && person.skills.includes('PROMOTIONAL_LIST')) score -= 5
  if (position.label !== 'Lieutenant' && person.skills.includes('PARAMEDIC')) score -= 4
  if (position.label === 'Lieutenant' && person.skills.includes('PARAMEDIC')) score += 3
  score += (person.ot_hours_total || 0) / 100
  score += (person.refusals || 0) * 0.25
  return score
}

function autoStaffUnits(model, shiftPeople, districtConfig) {
  const available = [...shiftPeople]
  const used = new Set()
  const assignments = {}
  const getCandidates = (unit, position) =>
    available
      .filter((p) => !used.has(p.employee_id))
      .map((person) => ({ person, eligibility: candidateEligibility(person, position) }))
      .filter((row) => row.eligibility.ok)
      .sort((a, b) => {
        const sA = personScoreForPosition(a.person, position, unit)
        const sB = personScoreForPosition(b.person, position, unit)
        if (sA !== sB) return sA - sB
        return comparePriority([a.person.ot_hours_total || 0, a.person.refusals || 0, a.person.name], [b.person.ot_hours_total || 0, b.person.refusals || 0, b.person.name])
      })
      .map((row) => row.person)

  for (const district of Object.keys(districtConfig)) {
    for (const unit of districtConfig[district]) {
      const positions = model.positionMap[unit] || []
      assignments[unit] = []
      for (const position of positions) {
        const candidates = getCandidates(unit, position)
        const picked = candidates[0] || null
        if (picked) used.add(picked.employee_id)
        assignments[unit].push({
          position: position.label,
          rank: position.rankRequired,
          notes: position.notes,
          assigned: picked ? {
            name: picked.name,
            rank: picked.rank,
            status: ['PROJECTED'],
            skills: picked.skills,
            unit: picked.unit || '',
            ot_hours_total: picked.ot_hours_total || 0,
            refusals: picked.refusals || 0,
          } : null
        })
      }
    }
  }
  return assignments
}

function getSpecialSkills(skills) {
  const flags = ['HAZMAT_TEAM','TRT_TEAM','DIVE_TEAM','STRUCTURAL_COLLAPSE_TEAM','TOWER_CERTIFIED','TOWER_RELIEF_DRIVER','RELIEF_DRIVER','PARAMEDIC','SURFACE_WATER_SWIMMER','WOODS_TRUCK']
  return (skills || []).filter((s) => flags.includes(s))
}

function toneForStatus(s) {
  const str = String(s || '')
  if (str.includes('OT')) return 'warning'
  if (str.includes('TS')) return 'info'
  if (str.includes('SICK')) return 'danger'
  if (str.includes('PROJECTED')) return 'default'
  return 'success'
}

function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function Tile({ label, value, sublabel }) {
  return <div className="tile"><div className="tile-label">{label}</div><div className="tile-value">{value}</div>{sublabel ? <div className="tile-sub">{sublabel}</div> : null}</div>
}

function UnitHeader({ unit, rule }) {
  return (
    <div className="unit-header-rule">
      <div className="unit-rule-line"><strong>{rule?.unitType || ''}</strong>{rule?.staffingPattern ? ` • ${rule.staffingPattern}` : ''}</div>
      <div className="unit-rule-line">
        {rule?.specialTeamType && rule.specialTeamType !== 'None' ? `Special Team: ${rule.specialTeamType}${rule.specialTeamMinimum ? ` (min ${rule.specialTeamMinimum})` : ''}` : 'No special team requirement'}
      </div>
      <div className="unit-rule-line">
        {rule?.paramedicMinimum ? `Medic rule: ${rule.paramedicMinimum} minimum` : 'No unit medic minimum'}
      </div>
    </div>
  )
}

function UnitCard({ unit, rows, rule, projected = false }) {
  return (
    <div className="unit-card">
      <div className="unit-head">
        <div>
          <div className="unit-name">{unit}</div>
          <div className="unit-meta">{projected ? 'Estimated roster' : 'Roster snapshot'}</div>
        </div>
        <div>{projected ? <Badge>Projected</Badge> : <Badge tone="success">Live roster</Badge>}</div>
      </div>

      <UnitHeader unit={unit} rule={rule} />

      <div className="position-stack">
        {rows.map((row, idx) => {
          const person = row.assigned || row
          const statuses = Array.isArray(person?.status) ? person.status : (person?.status ? [person.status] : [])
          const special = getSpecialSkills(person?.skills)
          return (
            <div className="position-row" key={`${unit}-${idx}-${row.position || row.label || idx}`}>
              <div className="position-left">
                <div className="position-label">{row.position || row.label}</div>
                <div className="position-rank">{row.rank || person?.rank || ''}</div>
              </div>
              <div className="position-right">
                {person ? (
                  <>
                    <div className="assigned-name">{person.name || 'Vacant'}</div>
                    <div className="assigned-meta">{person.rank || ''}{person.unit ? ` • ${person.unit}` : ''}</div>
                    <div className="skill-wrap compact">
                      {statuses.filter(Boolean).map((s) => <Badge key={s} tone={toneForStatus(s)}>{s}</Badge>)}
                    </div>
                    {special.length ? <div className="skill-wrap compact">{special.map((s) => <Badge key={s} tone="info">{s}</Badge>)}</div> : null}
                  </>
                ) : <div className="vacant">Vacant</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListCard({ title, items, tone = 'default' }) {
  return (
    <div className="list-card">
      <div className="list-title">{title}</div>
      <div className="list-count">{items.length}</div>
      <div className="list-items">
        {items.length ? items.slice(0, 12).map((item) => <Badge key={item} tone={tone}>{item}</Badge>) : <span className="muted">None</span>}
      </div>
    </div>
  )
}

export default function App() {
  const model = useMemo(() => buildModel(), [])
  const [dateStr, setDateStr] = useState(SNAPSHOT_DATE)
  const [selectedDistrict, setSelectedDistrict] = useState('D1')
  const { shift, kelly } = useMemo(() => computeShiftKelly(dateStr), [dateStr])
  const isSnapshotDate = dateStr === SNAPSHOT_DATE
  const offLists = useMemo(() => buildOffLists(dateStr, shift), [dateStr, shift])
  const projectedPeople = useMemo(() => buildProjectedShiftPeople(dateStr, shift, kelly, offLists), [dateStr, shift, kelly, offLists])
  const projectedAssignments = useMemo(() => autoStaffUnits(model, projectedPeople, DISTRICTS), [model, projectedPeople])
  const districtUnits = DISTRICTS[selectedDistrict] || []

  let visibleVacancies = 0
  if (!isSnapshotDate) {
    for (const unit of districtUnits) visibleVacancies += (projectedAssignments[unit] || []).filter((r) => !r.assigned).length
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <h1>OFD Staffing Board</h1>
          <p>
            Live roster view on 2026-04-20 with special-team details added to each staffed seat. For any other date, the app creates an estimated roster from the staffing build, shift calendar, and scheduled vacation file.
          </p>
        </div>
        <div className="hero-badges">
          <Badge tone="success">{dateStr}</Badge>
          <Badge tone="info">{shift}-Shift / Kelly {kelly}</Badge>
          <Badge>{isSnapshotDate ? 'Live snapshot mode' : 'Estimated future roster mode'}</Badge>
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <div className="field">
            <label>Date</label>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </div>
          <div className="field grow">
            <label>District</label>
            <div className="district-tabs">
              {Object.keys(DISTRICTS).map((district) => (
                <button key={district} className={`district-tab ${selectedDistrict === district ? 'active' : ''}`} onClick={() => setSelectedDistrict(district)}>
                  {district}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tile-grid">
          <Tile label="On-duty shift" value={shift} sublabel={`Kelly group ${kelly}`} />
          <Tile label="People available for estimate" value={projectedPeople.length} />
          <Tile label="Scheduled vacation" value={offLists.scheduledVacation.length} />
          <Tile label="RDO floating" value={offLists.rdof.length} />
          <Tile label="District vacancies" value={visibleVacancies} sublabel={isSnapshotDate ? 'Live roster date' : 'Estimated from build'} />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Availability overlays</h2>
          <p>Scheduled vacation and RDOF apply for future estimates. Snapshot-only lists come from the uploaded 4/20/2026 roster.</p>
        </div>
        <div className="off-grid">
          <ListCard title="Scheduled Vacation" items={offLists.scheduledVacation} tone="danger" />
          <ListCard title="RDO Floating" items={offLists.rdof} tone="warning" />
          <ListCard title="Kelly Day (snapshot only)" items={offLists.kelly} tone="info" />
          <ListCard title="Sick 24 (snapshot only)" items={offLists.sick24} tone="danger" />
          <ListCard title="Light Duty (snapshot only)" items={offLists.lightDuty} />
          <ListCard title="OT Leave (snapshot only)" items={offLists.otLeave} tone="warning" />
        </div>
      </section>

      {!isSnapshotDate ? (
        <section className="panel notice-panel">
          <div className="section-head">
            <h2>Estimate assumptions</h2>
            <p>
              Future dates are estimated from the staffing build and scheduled vacation file. Kelly-group membership by employee is not yet modeled beyond the uploaded sample snapshot, so future Kelly-day removals are not employee-specific yet.
            </p>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-head">
          <h2>{selectedDistrict} units</h2>
          <p>{isSnapshotDate ? 'Exact mapped positions from the uploaded sample roster, with special-team flags shown on each member.' : 'Estimated staffing from the build and vacation calendar for the selected date.'}</p>
        </div>

        <div className="unit-grid">
          {districtUnits.map((unit) => {
            const rows = isSnapshotDate ? (rosterSnapshot.districts?.[selectedDistrict]?.[unit] || []) : (projectedAssignments[unit] || [])
            return <UnitCard key={unit} unit={unit} rows={rows} rule={model.unitRules[unit]} projected={!isSnapshotDate} />
          })}
        </div>
      </section>
    </div>
  )
}
