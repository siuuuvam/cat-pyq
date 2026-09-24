# Theme Consistency Audit — Findings (Part 1)

Date: pre-fix audit. Live site JS and CSS verified byte-identical to local
(SHA256), so these findings apply to production as-is. Evidence gathered via
headless Chrome in both themes against real data.

Scope: items 1–8 + 1B from the consistency review. Status colors locked:
navy background, orange brand accent, blue mock-exam accent, green/red/gray/purple
status. This is an audit only — no fixes applied yet.

---

## 1. Hero → content seam — CONFIRMED

- `.landing-hero` uses `linear-gradient(135deg, var(--accent-light), var(--bg-secondary))`:
  the bottom edge is uniform only at the right; the left half still carries the
  orange glow and cuts hard against the flat year-grid section (visible step in
  screenshots; dark: `rgb(28,16,8)` mix vs body `rgb(30,41,59)`).
- **Proposed fix:** switch to a vertical `180deg` gradient that lands exactly on
  `--bg-secondary` at the bottom → seamless edge in both themes, no glow loss at top.

## 2. Nav active states — CONFIRMED incomplete

- `updateNavActive` only matches `data-year` links → active `["2024"]` on
  year/slot/question pages; **`[]` on Home, Progress, Bookmarks, Quick Practice**
  (measured live).
- Desktop `.header-nav` has only Home, Mock Exam, years — **Bookmarks / Progress /
  Quick Practice exist only in the mobile menu**, and mobile links never receive
  `.active` (no `data-year`, no other logic).
- **Proposed fix:** add `Bookmarks` + `Progress` to desktop header; track current
  route (`view=`) and mark active for Home / Bookmarks / Progress / Quick Practice /
  years in both desktop and mobile menus.

## 3. Two active-pill styles — CONFIRMED

- `.header-nav a.active` (`styles.css:143`) = tinted `--accent-light` fill + orange
  text, no border — identical computed style on slot page and question page
  (`rgb(28,16,8)` / orange, both themes).
- `.tab.active` (`styles.css:300`) = **solid orange, white text** — the solid pill
  seen on question pages (Slot/Section tabs). The described contrast is
  header-tint vs tab-solid.
- **Proposed fix:** one treatment everywhere — solid filled pill (orange bg, white
  text, weight 600) for header year links, mobile menu, and tabs.

## 4. Progress bars flat orange — CONFIRMED

- `.progress-bar-fill` computes to `rgb(249,115,22)`; stats row already uses
  green/red/amber numbers but the bar does not.
- **Proposed fix:** split fill into green (correct) + red (incorrect) segments of
  attempted answers, neutral track remainder; keep `x/y correct (z%)` label.

## 5. Palette status colors — WORKING (claim disproven)

- Verified end-to-end: incorrect → `q-nav-incorrect` bg `#450a0a` (dark) /
  `#fee2e2` (light); correct → `q-nav-correct` `#14532d` / `#dcfce7`.
  Classes at `styles.css:759–760`, status logic at `app.js:614–616`, live JS identical.
- Grading is sound: `correct_answer` is the **1-based option index** (872/876 MCQs
  are `1–4`; the 4 odd values like `"Option 2 Correct Answer"` / `45` are
  intentionally handled by `normalizeAnswer` and unit-tested). Q1 key `3` → option C
  → text `4` → correct remainder of 10^100 mod 7.
- Likely perception cause: dark-theme status fills are very dark (`#450a0a` /
  `#14532d` on navy) so orange/gray dominate at a glance; also an answered *current*
  question loses its orange “you are here” fill (status rule wins over `.active`,
  `styles.css:758` vs `759`).
- **Proposed fix (optional):** orange ring on current question so “you are here”
  survives status fills; optionally brighten dark-theme status fills slightly.
  Otherwise no change.

## 6. Theme toggle — BROKEN, CONFIRMED

- Button click → theme unchanged (measured: still `dark` after click).
  `__toggleDarkMode` exists (`app.js:1247`) and `applyDarkMode` updates the icon,
  but **no click listener is ever bound** (zero listeners on `#theme-toggle`).
- Current appearance comes from `catpyq_dark` / `prefers-color-scheme` only.
  Light-mode tokens are complete; home renders cleanly in light.
- **Proposed fix:** bind `#theme-toggle` → `__toggleDarkMode` (2 lines in `init()`).
  `exam.html` intentionally has no toggle (fixed TCS white) — leave as-is unless
  a toggle is wanted there too.

## 7. Inconsistent cards — CONFIRMED

- Measured: `mode-card` = radius 12px, pad 18/20, shadow `0 1px 3px`; `year-card` =
  radius 16px, pad 28/20, shadow `0 1px 2px`; plus `slot-card`, `progress-stat`,
  `progress-set-item`, `bookmark-item`, `question-card` each with their own
  radius/pad/shadow; exam side adds 6/8/4px variants. No shared class.
- **Proposed fix:** one shared `.card` (radius 12, 1px `--border`, `--shadow-sm`,
  consistent base padding) with small modifiers; apply across Home / year / slot /
  Progress / Bookmarks. Exam cards stay visually tighter but move onto shared
  radius/shadow tokens in step 1B.

## 8. Accent carry-through — CONFIRMED leaks (exam side only)

- Review Mode: consistently orange (logo, buttons, tabs, timer, year numbers);
  blue reserved for mock-exam entry points.
- Mock Exam Mode: active tab/banner/Submit/score correctly blue
  (`rgb(25,118,210)`), but orange leaks: `.exam-title` = `rgb(247,179,43)`
  (topbar, setup, review, results), `.results-hero .rh-title`, `.paper-head h2`,
  orange-tinted `.attempt-banner`.
- **Proposed fix:** those titles → white on navy; attempt-banner → blue tint;
  orange retained only in Review Mode.

## 1B. Shared tokens — GAP confirmed

- `styles.css`: colors only — no type scale, no spacing scale, no navy ramp, no
  purple status token.
- `exam-mode.css`: separate `--exam-*` palette + dozens of hardcoded hexes
  (`#7d8896`, `#eef3f8`, `#0d47a1`, …); two parallel status systems (review pale
  tints vs exam solid TCS colors); purple exists only exam-side; no file shared by
  both pages (`index.html` loads styles.css, `exam.html` loads exam-mode.css only).
- **Proposed fix:** new `site/shared/tokens.css` — navy ramp, orange, blue,
  green/red/gray/purple (solid + light/dark tints), type scale, spacing scale,
  radius scale — linked by both pages; alias `--exam-*` onto it and sweep
  hardcoded hexes. Shown as findings before writing it.

---

## Side findings (outside items 1–8 — flagged only)

1. **TITA grading in Review Mode is wrong:** `submitAnswer` runs TITA text through
   `normalizeAnswer`, which compares only the **first digit** → typing `150` marks
   correct against key `15`. Exam mode has a proper `titaAnswersEqual`
   (unit-tested). Recommend fixing alongside item 5.
2. **Difficulty pills unstyled:** `diff-hard/medium/easy` classes are emitted
   (`app.js:630`) but defined nowhere in CSS → bare text next to blue pills.
3. **“Correct answer: 3” is misleading:** the reveal prints the raw option *index*,
   so the key for the option showing text `4` displays as `3`. Should print
   letter + text (e.g. `C — 4`).
4. **Current-question marker disappears once answered** (related to item 5).

---

## Proposed execution order

1. Show these findings (done — this document).
2. Fix items 1–8 one page at a time, confirming each before the next.
3. Part 2.1–2.2: section-wise marks + per-question time tracking (verify with one
   completed mock).
4. Part 2.3: `site/shared/percentile-reference.json` + percentile card with
   disclaimers.
5. Show finished results screen on a real completed mock.
