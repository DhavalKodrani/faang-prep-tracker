# FAANG Data Prep Tracker

A GitHub-style tracker for a 50-session SQL + Python plan (1 hour/day, Monday–Friday only).
Tick tasks, rate your confidence and write notes. Progress is saved to [`progress.json`](progress.json)
in this repo, so it stays in sync on your laptop, iPad and phone.

- **Schedule:** Mon Sep 28, 2026 → Tue Dec 8, 2026 (weekends and Thanksgiving skipped)
- **Phases:** SQL Mastery (10) · Python Basics (10) · Python Extended (30)
- Every save is a commit, so studying also fills your GitHub contribution graph.

## Set up on each device (once)

1. Open the site (GitHub Pages URL for this repo).
2. Create a token: <https://github.com/settings/personal-access-tokens/new>
   - Repository access → **Only select repositories** → this repo
   - Permissions → Repository → **Contents: Read and write** (nothing else)
3. On the site, tap **⚙︎ Sync**, paste the token, then **Save & sync**.

The token is stored only in that browser. Without a token the site still shows your progress (read-only).

## Files

| File | What it is |
|---|---|
| `plan.json` | The curriculum: start date, skipped dates, and each day's tasks and links. Edit it to change the plan. |
| `progress.json` | Your progress database (written by the site). |
| `index.html`, `app.js`, `style.css` | The site. No build step. |
