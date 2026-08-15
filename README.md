# OFD TeleStaff Rules Lab

This branch of the OFD staffing model is a **synthetic test environment** for the proposed TeleStaff overtime-hiring workflow. It models Stations 1–6, three shifts, Day Staff, concurrent vacancies, electronic offers, opportunity charging, proximity, personnel transfers, payroll-code mapping, and controlled mandatory recommendations.

No real employee names are used in the simulator.

## Test workflow

1. Open the Roster Board and click a position to create a vacancy, or load the 18-vacancy scenario.
2. Use the Hiring Desk to inspect the Fill by Rules queue.
3. Send a simulated offer, open the Notifications tab, and respond to the exact sample employee text with ACCEPT, DECLINE, Offer Expired, or Failed Delivery.
4. Use Personnel & Transfers to test a transfer, promotion, or Kelly Day change. The prior assignment remains the next-shift proximity source and overtime history is preserved.
5. Use Pay Codes to review the discussed TeleStaff-to-Workday crosswalk and create test export entries.
6. Review opportunity balances and the audit trail.
7. Mandatory overtime becomes actionable only after voluntary candidates have been exhausted and is recommendation-only until staff approval.

The working voluntary order is Regular KD → Floating KD → KDS not working → Day Staff → off-going/on-coming → mandatory. Opportunity counts, not hours worked, are the fairness measure; in-grade seniority breaks ties.

The pay-code catalog includes Regular Time, Overtime, Vacation, Travel Pay 1/2, Transport Pay, all four WHC levels, both time-swap records, DOI, RDO/RDOF, and both Kelly Day Swap records. Unresolved Workday mappings remain labeled `TBD` so the lab does not present a proposed treatment as final policy.

## Run and validate

```bash
npm install
npm test
npm run dev
npm run build
```

## GitHub Pages deployment

The `Deploy GitHub Pages` workflow runs the tests, builds the Vite site, and publishes the `dist` artifact whenever a commit reaches `main`. Repository Pages settings must use **GitHub Actions** as the publishing source. The production site is:

`https://digitaltacticalworksheets.github.io/ofd_staffing/`

---

## Legacy staffing-model background

GitHub-ready Vite + React app built from:

- `OFD Telestaff Staffing Build.xlsx`
- `2026 A Shift KD-OT Book.xlsx`
- `2026 B SHIFT KD-OT BOOK.xlsx`
- `2026 C-Shift KD-OT Book.xlsx`

## What it does

- shows normalized personnel by shift
- uses OT hours and refusals from the KD/OT books
- ranks candidates for vacancies using your staffing rules
- includes ride-up logic:
  - Firefighter → Engineer with `RELIEF_DRIVER`
  - Engineer → Lieutenant
- preserves unknown skill codes as `RAW_*`

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Notes

- The app ships with embedded JSON data in `src/data`.
- It is static and GitHub Pages friendly.
- `base: './'` is already set in `vite.config.js`.

## Data files

- `src/data/ot_dataset.json`
- `src/data/staffing_build.json`

## Current assumptions

- OT books are used as the off-duty candidate dataset by shift.
- Candidate ranking favors:
  1. exact rank match
  2. valid ride-up path
  3. lower OT hours
  4. fewer refusals
- If your source books later include a true promotional-list field, that can be added directly to ranking.


## Roster / vacation / calendar layer

This version adds:

- exact sample roster mapping for **2026-04-20**
- scheduled vacation overlay from `FOB Vacations Scheduled.csv`
- 2026 shift / Kelly computation anchored to **2026-01-01 = A-4**
- projected staffing mode for dates other than the sample roster date

### Behavior

- On `2026-04-20`, the app shows the uploaded live roster snapshot by district and unit.
- On other dates, the app builds a projected board using:
  - the staffing build
  - the OT-book personnel dataset for the computed shift
  - scheduled vacation / RDOF exclusions


## Special teams + future estimates

This version adds:
- special-team information on each rostered member card
- unit-level special-team requirements from the staffing workbook
- estimated future roster mode based on:
  - staffing build
  - computed shift by date
  - scheduled vacation file


## Kelly group support

This build assigns each employee a `kelly_group` from the A/B/C KD book sheet they are listed on. Projected future-date boards now exclude the correct Kelly group automatically.
