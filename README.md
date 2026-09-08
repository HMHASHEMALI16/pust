# PUST Teachers' Evaluation — full website

Anonymous ratings + reviews for Pabna University of Science and Technology. Clone of duevaluation.com, seeded with real PUST data from `pust.ac.bd`.

## Run in 30 seconds (no build)

```powershell
cd T_evaluation
python -m http.server 8000
# open http://localhost:8000/index.html
```

Or just double-click `index.html` (recommended: use the server above so `fetch(data/*.json)` works). Deploy free: push this folder to GitHub → Settings → Pages → Deploy from branch.

## What's inside

```
index.html, departments.html, department.html, professors.html, professor.html,
reviews.html, guidelines.html, write-review.html, login.html, settings.html, admin.html
css/style.css
js/config.js — app name, @s.pust.ac.bd student regex, data paths, storage mode
js/db.js     — public JSON loader + anonymous reviews store + GitHub/Drive sync
js/ui.js     — navbar, footer, avatar, stars, report dialog
js/auth.js   — demo OTP (6-digit, 10 min). Plug real email later.
data/departments.json (21), data/professors.json (214), data/questions.json (15 Qs), data/reviews/seed.json (3 demo)
assets/logo.svg
apps-script/Code.gs — Google Sheet + Drive backend
```

## Data strategy (as you asked)

- **Public data in GitHub repo:** everything under `/data/*.json` (departments, professors, questions, seed reviews). Edit + commit to update. Photos hotlink to `pust.ac.bd` with initials fallback, so repo stays small.
- **Reviews when public sharing needed:** Settings → Mode = `github` → enter owner/repo/branch + PAT (`contents:write`) → Sync writes `data/reviews/browser-*.json` into the same repo via API. Admin merges.
- **Google Drive when GitHub not possible:** create Sheet → Extensions → Apps Script → paste `apps-script/Code.gs` → Deploy Web App (Execute as Me, Anyone) → paste URL in Settings → Mode = `drive` → Sync POSTs reviews; script appends to Sheet tabs + keeps `pust-reviews-backup.json` in Drive.
- **Default:** `local` — localStorage only, works offline / file://. Export/Import JSON in Settings for backup.

## Auth — real mail verification (free, no server)

Students only (`@s.pust.ac.bd`). Teachers (`@pust.ac.bd`) blocked everywhere including backend.

1. Create Google Sheet "PUST Reviews" (your Gmail).
2. Extensions → Apps Script → paste `apps-script/Code.gs` → Save.
3. Deploy → New deployment → Web app → Execute as **Me** → Who has access: **Anyone** → Deploy → authorize Gmail → copy `/exec` URL.
4. Open site `settings.html` → paste URL → Save. Done — login page now emails real 6-digit codes (10 min expiry, 5 sends/hour, 8 tries max).
5. Without backend URL, login stays in testing mode (code shown on screen) — good for local dev.

Anonymity kept: reviews never store email; duplicate-check (`pust_receipts`) is separate. OTPs live in Apps Script Cache only, never in the repo.

## Adapt

- Colors/logo: `css/style.css` `:root` + `assets/logo.svg`
- Email domain: `js/config.js` `emailRegex`
- Questions: `data/questions.json` (15, 6 groups — same as DU)
- Re-scrape PUST: see `../Collected_Data/README.md` + scraper in temp (re-run to refresh `data/`).
