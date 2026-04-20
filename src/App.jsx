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
    })
  }

  for (const unit of Object.keys(positionMap)) {
    positionMap[unit].sort((a, b) => a.order - b.order)
  }

  return { unitRules, positionMap }
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
  if (!name) return ''
  return String(name).toUpperCase().replace(/\s+/g, ' ').trim()
}

function candidateEligibility(person, position) {
  const reasons = []
  const rankMatches = person.rank === position.rankRequired

  if (!rankMatches) {
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

  if (person.unit && person.unit.replace('001','1').replace('002','2') === unit) score -= 40
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

  const getCandidates = (unit, position) => {
    return available
      .filter((p) => !used.has(p.employee_id))
      .map((person) => ({ person, eligibility: candidateEligibility(person, position) }))
      .filter((row) => row.eligibility.ok)
      .sort((a, b) => {
        const sA = personScoreForPosition(a.person, position, unit)
        const sB = personScoreForPosition(b.person, position, unit)
        if (sA !== sB) return sA - sB
        return comparePriority(
          [a.person.ot_hours_total || 0, a.person.refusals || 0, a.person.name],
          [b.person.ot_hours_total || 0, b.person.refusals || 0, b.person.name]
        )
      })
      .map((row) => row.person)
  }

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

function dedupe(list) {
  return [...new Set(list)]
}

function buildOffLists(dateStr, shift) {
  const dateVac = vacationsByDate?.[dateStr]?.[shift] || []
  const scheduledVacation = dedupe(dateVac.filter((e) => e.code === 'VAC').map((e) => e.name))
  const rdof = dedupe(dateVac.filter((e) => e.code === 'RDOF').map((e) => e.name))

  if (dateStr === SNAPSHOT_DATE) {
    return {
      scheduledVacation,
      rdof,
      sick24: dedupe(availabilitySnapshot.sick24 || []),
      kelly: dedupe(availabilitySnapshot.kelly || []),
      sickPartial: availabilitySnapshot.sickPartial || [],
      miscLeave: dedupe((availabilitySnapshot.miscLeave || []).map((x) => typeof x === 'string' ? x : x.name)),
      timeSwap: availabilitySnapshot.timeSwap || [],
      lightDuty: dedupe(availabilitySnapshot.lightDuty || []),
      otLeave: dedupe((availabilitySnapshot.otLeave || []).map((x) => typeof x === 'string' ? x : x.name)),
    }
  }

  return {
    scheduledVacation,
    rdof,
    sick24: [],
    kelly: [],
    sickPartial: [],
    miscLeave: [],
    timeSwap: [],
    lightDuty: [],
    otLeave: [],
  }
}

function buildProjectedShiftPeople(dateStr, shift, offLists) {
  const offNames = new Set([
    ...offLists.scheduledVacation,
    ...offLists.rdof,
    ...offLists.sick24,
  ].map(normalizeName))

  return (otDataset.people_by_shift?.[shift] || []).filter((p) => !offNames.has(normalizeName(p.name)))
}

function toneForStatus(statuses) {
  const list = Array.isArray(statuses) ? statuses : [statuses]
  if (list.some((s) => String(s).includes('OT'))) return 'warning'
  if (list.some((s) => String(s).includes('TS'))) return 'info'
  if (list.some((s) => String(s).includes('SICK'))) return 'danger'
  if (list.some((s) => String(s).includes('PROJECTED'))) return 'default'
  return 'success'
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

function UnitCard({ unit, rows, projected = false }) {
  return (
    <div className="unit-card">
      <div className="unit-head">
        <div>
          <div className="unit-name">{unit}</div>
          <div className="unit-meta">{projected ? 'Projected staffing' : 'Roster snapshot'}</div>
        </div>
        <div>{projected ? <Badge>Projected</Badge> : <Badge tone="success">Live roster</Badge>}</div>
      </div>

      <div className="position-stack">
        {rows.map((row, idx) => {
          const person = row.assigned || row
          const statuses = person?.status || []
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
                      {(Array.isArray(statuses) ? statuses : [statuses]).filter(Boolean).map((s) => (
                        <Badge key={s} tone={toneForStatus([s])}>{s}</Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="vacant">Vacant</div>
                )}
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
  const offLists = useMemo(() => buildOffLists(dateStr, shift), [dateStr, shift])
  const projectedPeople = useMemo(() => buildProjectedShiftPeople(dateStr, shift, offLists), [dateStr, shift, offLists])
  const projectedAssignments = useMemo(() => autoStaffUnits(model, projectedPeople, DISTRICTS), [model, projectedPeople])

  const isSnapshotDate = dateStr === SNAPSHOT_DATE
  const districtUnits = DISTRICTS[selectedDistrict] || []

  const districtVacancies = useMemo(() => {
    if (isSnapshotDate) return 0
    let count = 0
    for (const unit of districtUnits) {
      count += (projectedAssignments[unit] || []).filter((row) => !row.assigned).length
    }
    return count
  }, [isSnapshotDate, districtUnits, projectedAssignments])

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <h1>OFD Staffing Board</h1>
          <p>
            Uses the 2026 shift/Kelly calendar, scheduled vacations, and the exact 4/20/2026 B-Shift roster snapshot.
            On the sample roster date it shows the live mapped board. On other dates it shows a projected board from the shift book data.
          </p>
        </div>
        <div className="hero-badges">
          <Badge tone="success">{dateStr}</Badge>
          <Badge tone="info">{shift}-Shift / Kelly {kelly}</Badge>
          <Badge>{isSnapshotDate ? 'Live snapshot mode' : 'Projected mode'}</Badge>
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
                <button
                  key={district}
                  className={`district-tab ${selectedDistrict === district ? 'active' : ''}`}
                  onClick={() => setSelectedDistrict(district)}
                >
                  {district}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tile-grid">
          <Tile label="On-duty shift" value={shift} sublabel={`Kelly group ${kelly}`} />
          <Tile label="Projected people available" value={projectedPeople.length} />
          <Tile label="Scheduled vacation" value={offLists.scheduledVacation.length} />
          <Tile label="Kelly day (snapshot)" value={offLists.kelly.length} sublabel={isSnapshotDate ? 'From roster snapshot' : 'Unavailable without roster'} />
          <Tile label="District vacancies" value={districtVacancies} sublabel={isSnapshotDate ? 'Live roster mode' : 'Projected board only'} />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Availability overlays</h2>
          <p>Scheduled vacation always applies. Snapshot-only overlays come from the sample roster’s off lists.</p>
        </div>
        <div className="off-grid">
          <ListCard title="Scheduled Vacation" items={offLists.scheduledVacation} tone="danger" />
          <ListCard title="RDO Floating" items={offLists.rdof} tone="warning" />
          <ListCard title="Sick 24" items={offLists.sick24} tone="danger" />
          <ListCard title="Kelly Day" items={offLists.kelly} tone="info" />
          <ListCard title="Light Duty" items={offLists.lightDuty} />
          <ListCard title="OT Leave" items={offLists.otLeave} tone="warning" />
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{selectedDistrict} units</h2>
          <p>{isSnapshotDate ? 'Exact position mapping from the uploaded sample roster.' : 'Projected staffing using the staffing build and available shift personnel.'}</p>
        </div>

        <div className="unit-grid">
          {districtUnits.map((unit) => {
            const rows = isSnapshotDate
              ? (rosterSnapshot.districts?.[selectedDistrict]?.[unit] || [])
              : (projectedAssignments[unit] || [])
            return <UnitCard key={unit} unit={unit} rows={rows} projected={!isSnapshotDate} />
          })}
        </div>
      </section>
    </div>
  )
}
