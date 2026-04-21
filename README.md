# OFD Staffing Model App

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
