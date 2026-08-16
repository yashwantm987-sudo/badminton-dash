# Tournament & Normal Games Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Badminton Dash from a batch "match day" model into two modes — Tournament (with fixtures, standings, knockout) and Normal Games (casual play) — with per-match saving.

**Architecture:** Single-file HTML app (`badminton-dash.html`) with inline CSS and JS. All state lives in a `TOURNAMENT_DATA` global persisted to localStorage. The app renders by rebuilding innerHTML from data on each state change. No frameworks, no build tools.

**Tech Stack:** Vanilla HTML/CSS/JS, localStorage for persistence.

## Global Constraints

- Single file: all CSS and JS inline in `badminton-dash.html`
- No external dependencies or CDN imports
- Must work on mobile (touch targets, `inputmode="numeric"`, horizontal scroll for tables)
- localStorage key: `badminton-dash-data`
- All IDs are timestamp-based: `"t_" + Date.now()` for tournaments, `"n_" + Date.now()` for normal games, `"f_" + counter` for fixtures
- Existing visual design language (navy control zone, amber accents, paper background, card style) must be preserved
- No test framework — verify manually in browser after each task

---

### Task 1: Data model migration and new top-level structure

**Files:**
- Modify: `badminton-dash.html` — the `<script id="tournament-data">` block (line 727-732), the data loading script (lines 734-755), and the `persistToLocalStorage` function (line 736-742)

**Interfaces:**
- Produces: `TOURNAMENT_DATA` global with shape `{ players: string[], tournaments: Tournament[], normalGames: NormalGame[], matchDays: MatchDay[] }`. `migrateMatchDays()` function that converts legacy data. `generateRoundRobinFixtures(teamCount)` that returns fixture array. `persistToLocalStorage()` unchanged signature.

- [ ] **Step 1: Update the seed data structure**

Replace the `<script id="tournament-data">` block:

```html
<script id="tournament-data" type="application/json">
{
  "players": ["Anthony", "Harish", "Kartik", "Mahesh", "Shajith", "Shiva", "Vinay", "Yashwant"],
  "tournaments": [],
  "normalGames": [],
  "matchDays": []
}
</script>
```

- [ ] **Step 2: Write the migration function**

Add `migrateMatchDays()` in the data-loading script block (replacing lines 744-755). This runs once on load if `matchDays` has entries:

```javascript
function migrateMatchDays() {
  if (!TOURNAMENT_DATA.matchDays || TOURNAMENT_DATA.matchDays.length === 0) return;
  if (!TOURNAMENT_DATA.tournaments) TOURNAMENT_DATA.tournaments = [];
  if (!TOURNAMENT_DATA.normalGames) TOURNAMENT_DATA.normalGames = [];

  TOURNAMENT_DATA.matchDays.forEach(function (day) {
    var fixtures = day.matches.map(function (m, i) {
      var stage = 'group';
      if (m.stage === 'final') stage = 'final';
      else if (m.stage === 'thirdPlace') stage = 'thirdPlace';
      else if (m.stage === 'semifinal1' || m.stage === 'semifinal2') stage = 'semifinal';
      return {
        id: 'f_' + i,
        teamA: m.teamA,
        teamB: m.teamB,
        stage: stage,
        status: 'completed',
        scoreA: m.scoreA,
        scoreB: m.scoreB
      };
    });

    TOURNAMENT_DATA.tournaments.push({
      id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: '',
      date: day.date,
      teams: day.teams,
      fixtures: fixtures
    });
  });

  TOURNAMENT_DATA.matchDays = [];
  persistToLocalStorage();
}
```

- [ ] **Step 3: Write the round-robin fixture generator**

```javascript
function generateRoundRobinFixtures(teamCount) {
  var fixtures = [];
  var counter = 0;
  for (var i = 0; i < teamCount; i++) {
    for (var j = i + 1; j < teamCount; j++) {
      fixtures.push({
        id: 'f_' + counter++,
        teamA: i,
        teamB: j,
        stage: 'group',
        status: 'pending',
        scoreA: null,
        scoreB: null
      });
    }
  }
  return fixtures;
}
```

- [ ] **Step 4: Update the data loading logic**

Replace the data loading script (lines 744-755) to initialize missing fields and run migration:

```javascript
var TOURNAMENT_DATA = JSON.parse(document.getElementById('tournament-data').textContent);
var restoredFromLocalStorage = false;
try {
  var saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (saved) {
    TOURNAMENT_DATA = JSON.parse(saved);
    restoredFromLocalStorage = true;
  }
} catch (e) {}

if (!TOURNAMENT_DATA.tournaments) TOURNAMENT_DATA.tournaments = [];
if (!TOURNAMENT_DATA.normalGames) TOURNAMENT_DATA.normalGames = [];
if (!TOURNAMENT_DATA.matchDays) TOURNAMENT_DATA.matchDays = [];

migrateMatchDays();
```

- [ ] **Step 5: Verify in browser**

Open `badminton-dash.html` in a browser. Open DevTools console, type `TOURNAMENT_DATA`. Confirm:
- `tournaments` array exists (with migrated data if localStorage had matchDays)
- `normalGames` array exists (empty)
- `matchDays` is empty (migrated away)
- No console errors

- [ ] **Step 6: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: add new data model with tournaments/normalGames and migration from matchDays"
```

---

### Task 2: New tab navigation and panel structure

**Files:**
- Modify: `badminton-dash.html` — the nav tabs HTML (lines 657-662), the main panels HTML (lines 665-670), the tab click handler JS (lines 1133-1141), and CSS for new elements

**Interfaces:**
- Consumes: `TOURNAMENT_DATA` global from Task 1
- Produces: Tab navigation with 5 tabs (Tournament, Normal Games, Leaderboard, Player Stats, Partnerships). Panel containers `#panel-tournament`, `#panel-normal`, `#panel-leaderboard`, `#panel-players`, `#panel-partners`. A `currentView` object tracking which tournament is selected and which sub-view is active.

- [ ] **Step 1: Replace the nav tabs HTML**

Replace the `<nav class="tabs">` block (lines 657-662):

```html
<nav class="tabs" role="tablist" aria-label="Sections">
  <button class="tab-btn active" data-tab="tournament" role="tab" aria-selected="true">Tournament</button>
  <button class="tab-btn" data-tab="normal" role="tab" aria-selected="false">Normal Games</button>
  <button class="tab-btn" data-tab="leaderboard" role="tab" aria-selected="false">Leaderboard</button>
  <button class="tab-btn" data-tab="players" role="tab" aria-selected="false">Player Stats</button>
  <button class="tab-btn" data-tab="partners" role="tab" aria-selected="false">Partnerships</button>
</nav>
```

- [ ] **Step 2: Replace the main panels HTML**

Replace the `<main>` block (lines 665-670):

```html
<main>
  <div class="panel active" id="panel-tournament"></div>
  <div class="panel" id="panel-normal"></div>
  <div class="panel" id="panel-leaderboard">
    <div id="leaderboardPanel"></div>
    <div class="stats-table" id="playersTableEl"></div>
  </div>
  <div class="panel" id="panel-players"><div class="stats-table" id="playerStatsEl"></div></div>
  <div class="panel" id="panel-partners"><div id="partnersEl"></div></div>
</main>
```

- [ ] **Step 3: Add sub-view switcher CSS**

Add to the `<style>` block:

```css
.sub-tabs { display: flex; gap: 4px; margin-bottom: 14px; }
.sub-tab {
  appearance: none; background: none; border: 1px solid rgba(27,35,51,0.14);
  border-radius: 5px; font-family: var(--font-body); font-size: 12px; font-weight: 600;
  color: var(--ink-soft); padding: 6px 14px; cursor: pointer;
}
.sub-tab.active { background: var(--amber); color: #4a3007; border-color: var(--amber); }

.fixture-card {
  background: var(--card); border-radius: 10px; padding: 12px 14px;
  margin-bottom: 8px; box-shadow: 0 1px 2px rgba(22,31,56,0.06);
  cursor: pointer; border-left: 3px solid transparent;
}
.fixture-card.completed { border-left-color: var(--teal); cursor: default; }
.fixture-card.active-entry { border: 1px solid var(--amber); border-left: 3px solid var(--amber); }
.fixture-card .f-stage {
  font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--amber-deep); margin-bottom: 6px;
}
.fixture-card .f-stage.knockout { color: var(--coral); }
.fixture-card .f-teams {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.fixture-card .f-team { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.fixture-card .f-vs { font-size: 10px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
.fixture-card .f-score {
  font-family: var(--font-display); font-weight: 700; font-size: 14px;
  color: var(--ink); text-align: right; min-width: 50px;
}
.fixture-card .f-hint { font-size: 11px; color: var(--ink-soft); margin-top: 4px; }
.fixture-card .f-done { font-size: 11px; color: var(--teal); margin-top: 4px; }

.score-row {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(27,35,51,0.07);
}
.score-row input[type="number"] { width: 56px; text-align: center; }
.score-row .sep { color: var(--ink-soft); font-size: 12px; }
.score-row .btn-save {
  margin-left: auto; background: var(--amber); color: #4a3007;
  font-weight: 700; border: none; border-radius: 5px; padding: 6px 16px;
  font-size: 12.5px; cursor: pointer;
}

.btn-new {
  appearance: none; background: none;
  border: 1px dashed rgba(27,35,51,0.28); border-radius: 6px;
  color: var(--ink-soft); font-size: 12.5px; font-weight: 600;
  padding: 8px 14px; cursor: pointer; margin-bottom: 14px;
}
.btn-new:hover { border-color: var(--ink-soft); color: var(--ink); }

.standings-wrap {
  background: var(--card); border-radius: 10px; overflow-x: auto;
  box-shadow: 0 1px 2px rgba(22,31,56,0.06);
}

.tournament-list-card {
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  margin-bottom: 10px; box-shadow: 0 1px 2px rgba(22,31,56,0.06);
  cursor: pointer; display: flex; align-items: center; justify-content: space-between;
}
.tournament-list-card .t-name { font-size: 14.5px; font-weight: 600; color: var(--ink); }
.tournament-list-card .t-meta { font-size: 11.5px; color: var(--ink-soft); }
.tournament-list-card .t-arrow { color: var(--ink-soft); font-size: 18px; }

.back-link {
  appearance: none; background: none; border: none; color: var(--ink-soft);
  font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 12px;
}
.back-link:hover { color: var(--ink); }

.normal-game-card {
  background: var(--card); border-radius: 10px; padding: 10px 14px;
  margin-bottom: 8px; box-shadow: 0 1px 2px rgba(22,31,56,0.06);
  border-left: 3px solid var(--teal);
}
.normal-game-card .ng-teams { font-size: 13px; }
.normal-game-card .ng-teams .win { font-weight: 700; color: var(--ink); }
.normal-game-card .ng-teams .lose { font-weight: 500; color: var(--ink-soft); }
.normal-game-card .ng-teams .vs { color: var(--ink-soft); font-size: 10.5px; text-transform: uppercase; margin: 0 5px; }
.normal-game-card .ng-score {
  font-family: var(--font-display); font-weight: 700; font-size: 13px; color: var(--ink);
}
.normal-game-card .ng-date { font-size: 10.5px; color: var(--ink-soft); margin-top: 2px; }

.new-game-form {
  background: var(--card); border-radius: 10px; padding: 14px 16px;
  margin-bottom: 14px; box-shadow: 0 1px 2px rgba(22,31,56,0.06);
}
.new-game-form .form-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.new-game-form .form-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-soft); width: 100%; }
```

- [ ] **Step 4: Add the view state and tab switching JS**

Add after the data loading, before the scoring functions:

```javascript
var currentView = { tab: 'tournament', tournamentId: null, subView: 'fixtures' };

function switchTab(tab) {
  currentView.tab = tab;
  if (tab === 'tournament') currentView.tournamentId = null;
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
  document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
  document.querySelector('[data-tab="' + tab + '"]').setAttribute('aria-selected', 'true');
  document.getElementById('panel-' + tab).classList.add('active');
  renderApp();
}

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
});
```

Remove the old tab click handler (lines 1133-1141) since it's replaced above.

- [ ] **Step 5: Verify in browser**

Open the file. Confirm:
- 5 tabs visible in the navy bar (Tournament, Normal Games, Leaderboard, Player Stats, Partnerships)
- Clicking each tab switches the visible panel
- No console errors

- [ ] **Step 6: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: replace tabs with Tournament/Normal Games/Leaderboard/Player Stats/Partnerships"
```

---

### Task 3: Tournament list view and creation form

**Files:**
- Modify: `badminton-dash.html` — add rendering functions and form logic in the JS section

**Interfaces:**
- Consumes: `TOURNAMENT_DATA.tournaments`, `TOURNAMENT_DATA.players`, `generateRoundRobinFixtures()`, `persistToLocalStorage()`, `currentView`, `escapeHtml()` from Tasks 1-2
- Produces: `renderTournamentPanel()` that renders tournament list or single-tournament view. `createTournament(name, date, teams)` that creates and saves a tournament.

- [ ] **Step 1: Write renderTournamentPanel()**

Add this function in the render section:

```javascript
function renderTournamentPanel() {
  var el = document.getElementById('panel-tournament');

  if (currentView.tournamentId) {
    var t = TOURNAMENT_DATA.tournaments.find(function (t) { return t.id === currentView.tournamentId; });
    if (!t) { currentView.tournamentId = null; renderTournamentPanel(); return; }
    el.innerHTML = renderSingleTournament(t);
    attachTournamentHandlers(t);
    return;
  }

  var html = '<button class="btn-new" id="newTournamentBtn">+ New Tournament</button>';

  if (TOURNAMENT_DATA.tournaments.length === 0) {
    html += '<p style="color:var(--ink-soft);font-size:13px;">No tournaments yet.</p>';
  } else {
    var sorted = TOURNAMENT_DATA.tournaments.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
    sorted.forEach(function (t) {
      var completed = t.fixtures.filter(function (f) { return f.status === 'completed'; }).length;
      var total = t.fixtures.length;
      var label = t.name || formatDayHeading(t.date);
      html += '<div class="tournament-list-card" data-tid="' + t.id + '">' +
        '<div><div class="t-name">' + escapeHtml(label) + '</div>' +
        '<div class="t-meta">' + t.teams.length + ' teams · ' + completed + '/' + total + ' matches played</div></div>' +
        '<span class="t-arrow">›</span></div>';
    });
  }

  html += '<div id="newTournamentForm" style="display:none;"></div>';
  el.innerHTML = html;

  document.getElementById('newTournamentBtn').addEventListener('click', showNewTournamentForm);
  el.querySelectorAll('[data-tid]').forEach(function (card) {
    card.addEventListener('click', function () {
      currentView.tournamentId = card.dataset.tid;
      currentView.subView = 'fixtures';
      renderTournamentPanel();
    });
  });
}
```

- [ ] **Step 2: Write showNewTournamentForm()**

```javascript
var newTournamentState = { teams: [{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }] };

function showNewTournamentForm() {
  newTournamentState = { teams: [{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }] };
  var formEl = document.getElementById('newTournamentForm');
  formEl.style.display = 'block';
  document.getElementById('newTournamentBtn').style.display = 'none';
  renderNewTournamentForm();
}

function renderNewTournamentForm() {
  var formEl = document.getElementById('newTournamentForm');
  var chosen = {};
  newTournamentState.teams.forEach(function (t) {
    [t.a, t.b].forEach(function (n) { if (n) chosen[n] = (chosen[n] || 0) + 1; });
  });

  var teamRowsHtml = newTournamentState.teams.map(function (t, i) {
    var isDup = (t.a && chosen[t.a] > 1) || (t.b && chosen[t.b] > 1);
    return '<div class="team-edit-row' + (isDup ? ' dup' : '') + '">' +
      '<span class="team-edit-num">' + (i + 1) + '</span>' +
      '<select data-i="' + i + '" data-slot="a" class="nt-team-select">' + playerOptions(t.a) + '</select>' +
      '<select data-i="' + i + '" data-slot="b" class="nt-team-select">' + playerOptions(t.b) + '</select>' +
      '<button class="row-remove" data-nt-remove="' + i + '" type="button" ' +
      (newTournamentState.teams.length <= 3 ? 'disabled' : '') + '>&times;</button></div>';
  }).join('');

  var teamsComplete = newTournamentState.teams.every(function (t) { return t.a && t.b; });
  var hasDup = Object.keys(chosen).some(function (k) { return chosen[k] > 1; });
  var canGenerate = teamsComplete && !hasDup;

  formEl.innerHTML = '<div class="new-game-form">' +
    '<div class="form-row"><span class="form-label">Tournament name (optional)</span>' +
    '<input type="text" id="ntName" placeholder="e.g. Saturday Tournament" style="flex:1;font-family:var(--font-body);font-size:13.5px;color:var(--ink);background:var(--card);border:1px solid rgba(27,35,51,0.16);border-radius:5px;padding:7px 9px;"></div>' +
    '<div class="form-row"><span class="form-label">Date</span>' +
    '<input type="date" id="ntDate" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
    '<div class="form-row"><span class="form-label">Teams</span></div>' +
    teamRowsHtml +
    '<button class="btn btn-add" id="ntAddTeam" type="button" style="margin-bottom:10px;">+ Add team</button>' +
    (hasDup ? '<p class="validation-msg">A player is on more than one team.</p>' : '') +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
    '<button class="btn btn-secondary" id="ntCancel" type="button">Cancel</button>' +
    '<button class="btn btn-primary" id="ntGenerate" type="button"' + (canGenerate ? '' : ' disabled') + '>Generate Fixtures</button></div></div>';

  formEl.querySelectorAll('.nt-team-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      newTournamentState.teams[+sel.dataset.i][sel.dataset.slot] = sel.value;
      renderNewTournamentForm();
    });
  });
  formEl.querySelectorAll('[data-nt-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (newTournamentState.teams.length <= 3) return;
      newTournamentState.teams.splice(+btn.dataset.ntRemove, 1);
      renderNewTournamentForm();
    });
  });
  document.getElementById('ntAddTeam').addEventListener('click', function () {
    newTournamentState.teams.push({ a: '', b: '' });
    renderNewTournamentForm();
  });
  document.getElementById('ntCancel').addEventListener('click', function () {
    document.getElementById('newTournamentForm').style.display = 'none';
    document.getElementById('newTournamentBtn').style.display = '';
  });
  document.getElementById('ntGenerate').addEventListener('click', function () {
    var teams = newTournamentState.teams.map(function (t) { return [t.a, t.b]; });
    var tournament = {
      id: 't_' + Date.now(),
      name: document.getElementById('ntName').value.trim(),
      date: document.getElementById('ntDate').value,
      teams: teams,
      fixtures: generateRoundRobinFixtures(teams.length)
    };
    TOURNAMENT_DATA.tournaments.push(tournament);
    persistToLocalStorage();
    currentView.tournamentId = tournament.id;
    currentView.subView = 'fixtures';
    renderTournamentPanel();
  });
}
```

- [ ] **Step 3: Verify in browser**

Open the file. On the Tournament tab:
- Click "+ New Tournament" — form appears with date, name, 3 team rows
- Add a 4th team row, fill all players (unique), click "Generate Fixtures"
- Tournament card appears in the list with "X teams · 0/N matches played"
- Click the card — navigates into it (will be empty for now, renderSingleTournament not yet written)

- [ ] **Step 4: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: add tournament list view and creation form with round-robin fixture generation"
```

---

### Task 4: Single tournament view — fixtures, standings, knockout

**Files:**
- Modify: `badminton-dash.html` — add `renderSingleTournament()`, `renderFixtures()`, `renderStandings()`, `renderKnockout()`, `attachTournamentHandlers()`, and fixture save logic

**Interfaces:**
- Consumes: `currentView`, `TOURNAMENT_DATA.tournaments`, `escapeHtml()`, `formatDayHeading()`, `persistToLocalStorage()`, `playerOptions()` from Tasks 1-3
- Produces: Full tournament view with sub-tabs (Fixtures, Standings, Knockout). `saveFixtureScore(tournamentId, fixtureId, scoreA, scoreB)` function. `computeTournamentStandings(tournament)` function.

- [ ] **Step 1: Write computeTournamentStandings()**

```javascript
function computeTournamentStandings(tournament) {
  var standings = tournament.teams.map(function (team, i) {
    return { teamIndex: i, played: 0, wins: 0, losses: 0, diff: 0, pts: 0 };
  });

  tournament.fixtures.forEach(function (f) {
    if (f.status !== 'completed') return;
    standings[f.teamA].played++;
    standings[f.teamB].played++;
    standings[f.teamA].diff += f.scoreA - f.scoreB;
    standings[f.teamB].diff += f.scoreB - f.scoreA;
    if (f.scoreA > f.scoreB) {
      standings[f.teamA].wins++;
      standings[f.teamA].pts += 3;
      standings[f.teamB].losses++;
    } else {
      standings[f.teamB].wins++;
      standings[f.teamB].pts += 3;
      standings[f.teamA].losses++;
    }
  });

  standings.sort(function (a, b) {
    if (b.pts !== a.pts) return b.pts - a.pts;
    return b.diff - a.diff;
  });

  standings.forEach(function (s, i) {
    s.rank = i + 1;
    if (i > 0 && standings[i - 1].pts === s.pts && standings[i - 1].diff === s.diff) {
      s.rank = standings[i - 1].rank;
    }
  });

  return standings;
}
```

- [ ] **Step 2: Write renderSingleTournament()**

```javascript
var activeFixtureId = null;

function renderSingleTournament(t) {
  var label = t.name || formatDayHeading(t.date);
  var subTabs = '<div class="sub-tabs">' +
    '<button class="sub-tab' + (currentView.subView === 'fixtures' ? ' active' : '') + '" data-sv="fixtures">Fixtures</button>' +
    '<button class="sub-tab' + (currentView.subView === 'standings' ? ' active' : '') + '" data-sv="standings">Standings</button>' +
    '<button class="sub-tab' + (currentView.subView === 'knockout' ? ' active' : '') + '" data-sv="knockout">Knockout</button></div>';

  var content = '';
  if (currentView.subView === 'fixtures') content = renderFixtures(t);
  else if (currentView.subView === 'standings') content = renderStandingsTable(t);
  else if (currentView.subView === 'knockout') content = renderKnockout(t);

  return '<button class="back-link" id="backToList">← All Tournaments</button>' +
    '<div style="font-family:var(--font-display);font-weight:800;font-size:17px;color:var(--ink);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.02em;">' + escapeHtml(label) + '</div>' +
    subTabs + content;
}

function renderFixtures(t) {
  var groupFixtures = t.fixtures.filter(function (f) { return f.stage === 'group'; });
  if (groupFixtures.length === 0) return '<p style="color:var(--ink-soft);font-size:13px;">No fixtures yet.</p>';

  return '<p class="section-label" style="margin-top:4px;">Group Stage</p>' +
    groupFixtures.map(function (f) { return renderFixtureCard(t, f); }).join('');
}

function renderFixtureCard(t, f) {
  var teamA = t.teams[f.teamA];
  var teamB = t.teams[f.teamB];
  var isActive = activeFixtureId === f.id;
  var stageClass = (f.stage === 'semifinal' || f.stage === 'final' || f.stage === 'thirdPlace') ? ' knockout' : '';
  var stageLabel = f.stage === 'group' ? 'Group' : f.stage === 'semifinal' ? 'Semifinal' : f.stage === 'final' ? 'Final' : '3rd Place';

  if (f.status === 'completed') {
    var aWon = f.scoreA > f.scoreB;
    return '<div class="fixture-card completed" data-fid="' + f.id + '">' +
      '<div class="f-stage' + stageClass + '">' + stageLabel + '</div>' +
      '<div class="f-teams">' +
      '<span class="f-team" style="' + (aWon ? '' : 'color:var(--ink-soft);font-weight:500;') + '">' + escapeHtml(teamA[0]) + ' & ' + escapeHtml(teamA[1]) + '</span>' +
      '<span class="f-vs">vs</span>' +
      '<span class="f-team" style="' + (aWon ? 'color:var(--ink-soft);font-weight:500;' : '') + '">' + escapeHtml(teamB[0]) + ' & ' + escapeHtml(teamB[1]) + '</span>' +
      '<span class="f-score">' + f.scoreA + '–' + f.scoreB + '</span></div>' +
      '<div class="f-done">✓ Completed</div></div>';
  }

  if (isActive) {
    return '<div class="fixture-card active-entry" data-fid="' + f.id + '">' +
      '<div class="f-stage' + stageClass + '">' + stageLabel + '</div>' +
      '<div class="f-teams">' +
      '<span class="f-team">' + escapeHtml(teamA[0]) + ' & ' + escapeHtml(teamA[1]) + '</span>' +
      '<span class="f-vs">vs</span>' +
      '<span class="f-team">' + escapeHtml(teamB[0]) + ' & ' + escapeHtml(teamB[1]) + '</span></div>' +
      '<div class="score-row">' +
      '<input type="number" min="0" inputmode="numeric" id="scoreA_' + f.id + '" placeholder="0">' +
      '<span class="sep">–</span>' +
      '<input type="number" min="0" inputmode="numeric" id="scoreB_' + f.id + '" placeholder="0">' +
      '<button class="btn-save" data-save-fid="' + f.id + '">Save</button></div></div>';
  }

  return '<div class="fixture-card" data-fid="' + f.id + '">' +
    '<div class="f-stage' + stageClass + '">' + stageLabel + '</div>' +
    '<div class="f-teams">' +
    '<span class="f-team">' + escapeHtml(teamA[0]) + ' & ' + escapeHtml(teamA[1]) + '</span>' +
    '<span class="f-vs">vs</span>' +
    '<span class="f-team">' + escapeHtml(teamB[0]) + ' & ' + escapeHtml(teamB[1]) + '</span></div>' +
    '<div class="f-hint">Tap to play</div></div>';
}
```

- [ ] **Step 3: Write renderStandingsTable()**

```javascript
function renderStandingsTable(t) {
  var standings = computeTournamentStandings(t);
  var rows = standings.map(function (s) {
    var team = t.teams[s.teamIndex];
    var diffClass = s.diff > 0 ? 'pos' : (s.diff < 0 ? 'neg' : '');
    var diffLabel = (s.diff > 0 ? '+' : '') + s.diff;
    return '<tr><td class="num">' + s.rank + '</td><td class="name">' + escapeHtml(team[0]) + ' & ' + escapeHtml(team[1]) + '</td>' +
      '<td class="num">' + s.played + '</td><td class="num">' + s.wins + '</td><td class="num">' + s.losses + '</td>' +
      '<td class="num"><span class="team-diff ' + diffClass + '">' + diffLabel + '</span></td>' +
      '<td class="num pts">' + s.pts + '</td></tr>';
  }).join('');

  return '<div class="standings-wrap"><table><thead><tr>' +
    '<th class="num">#</th><th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">L</th><th class="num">Diff</th><th class="num">Pts</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}
```

- [ ] **Step 4: Write renderKnockout()**

```javascript
function renderKnockout(t) {
  var knockoutFixtures = t.fixtures.filter(function (f) { return f.stage !== 'group'; });

  var teamOpts = t.teams.map(function (team, i) {
    return '<option value="' + i + '">' + escapeHtml(team[0]) + ' & ' + escapeHtml(team[1]) + '</option>';
  }).join('');

  var buttons = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
    '<button class="btn-new" data-add-stage="semifinal">+ Add Semifinal</button>' +
    '<button class="btn-new" data-add-stage="final">+ Add Final</button>' +
    '<button class="btn-new" data-add-stage="thirdPlace">+ Add 3rd Place</button></div>';

  var addFormHtml = '<div id="knockoutAddForm" style="display:none;" class="new-game-form">' +
    '<div class="form-row"><span class="form-label" id="knockoutStageLabel">Semifinal</span></div>' +
    '<div class="form-row"><select id="koTeamA"><option value="">— Select Team —</option>' + teamOpts + '</select>' +
    '<span style="color:var(--ink-soft);font-size:12px;">vs</span>' +
    '<select id="koTeamB"><option value="">— Select Team —</option>' + teamOpts + '</select></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button class="btn btn-secondary" id="koCancel">Cancel</button>' +
    '<button class="btn btn-primary" id="koAdd">Add Match</button></div></div>';

  var cards = knockoutFixtures.length === 0 ?
    '<p style="color:var(--ink-soft);font-size:13px;">No knockout matches yet.</p>' :
    knockoutFixtures.map(function (f) { return renderFixtureCard(t, f); }).join('');

  return buttons + addFormHtml + cards;
}
```

- [ ] **Step 5: Write attachTournamentHandlers()**

```javascript
function attachTournamentHandlers(t) {
  var el = document.getElementById('panel-tournament');

  document.getElementById('backToList').addEventListener('click', function () {
    currentView.tournamentId = null;
    activeFixtureId = null;
    renderTournamentPanel();
  });

  el.querySelectorAll('.sub-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentView.subView = btn.dataset.sv;
      activeFixtureId = null;
      renderTournamentPanel();
    });
  });

  el.querySelectorAll('.fixture-card:not(.completed):not(.active-entry)').forEach(function (card) {
    card.addEventListener('click', function () {
      activeFixtureId = card.dataset.fid;
      renderTournamentPanel();
    });
  });

  el.querySelectorAll('.fixture-card.completed').forEach(function (card) {
    card.addEventListener('click', function () {
      activeFixtureId = card.dataset.fid;
      var f = t.fixtures.find(function (f) { return f.id === card.dataset.fid; });
      if (f) { f.status = 'pending'; f.scoreA = null; f.scoreB = null; persistToLocalStorage(); }
      renderTournamentPanel();
    });
  });

  el.querySelectorAll('[data-save-fid]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fid = btn.dataset.saveFid;
      var scoreA = +document.getElementById('scoreA_' + fid).value;
      var scoreB = +document.getElementById('scoreB_' + fid).value;
      if (scoreA === scoreB || (scoreA === 0 && scoreB === 0)) return;
      var f = t.fixtures.find(function (f) { return f.id === fid; });
      if (f) {
        f.status = 'completed';
        f.scoreA = scoreA;
        f.scoreB = scoreB;
        persistToLocalStorage();
        activeFixtureId = null;
        renderTournamentPanel();
        renderApp();
      }
    });
  });

  el.querySelectorAll('[data-add-stage]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var stage = btn.dataset.addStage;
      var stageLabels = { semifinal: 'Semifinal', final: 'Final', thirdPlace: '3rd Place' };
      document.getElementById('knockoutAddForm').style.display = 'block';
      document.getElementById('knockoutStageLabel').textContent = stageLabels[stage] || stage;
      document.getElementById('knockoutAddForm').dataset.stage = stage;
    });
  });

  var koCancel = document.getElementById('koCancel');
  if (koCancel) koCancel.addEventListener('click', function () {
    document.getElementById('knockoutAddForm').style.display = 'none';
  });

  var koAdd = document.getElementById('koAdd');
  if (koAdd) koAdd.addEventListener('click', function () {
    var teamA = document.getElementById('koTeamA').value;
    var teamB = document.getElementById('koTeamB').value;
    var stage = document.getElementById('knockoutAddForm').dataset.stage;
    if (teamA === '' || teamB === '' || teamA === teamB) return;
    var maxId = t.fixtures.reduce(function (max, f) {
      var n = parseInt(f.id.replace('f_', ''), 10);
      return n > max ? n : max;
    }, -1);
    t.fixtures.push({
      id: 'f_' + (maxId + 1),
      teamA: +teamA,
      teamB: +teamB,
      stage: stage,
      status: 'pending',
      scoreA: null,
      scoreB: null
    });
    persistToLocalStorage();
    document.getElementById('knockoutAddForm').style.display = 'none';
    renderTournamentPanel();
  });
}
```

- [ ] **Step 6: Verify in browser**

Open the file. Create a tournament with 3 teams. Confirm:
- Fixture cards show 3 group matches (round-robin)
- Tap a fixture → score inputs appear
- Enter scores, click Save → card flips to completed with green border
- Click Standings sub-tab → table shows live rankings
- Click Knockout sub-tab → buttons to add SF/Final/3rd Place appear
- Add a Final, pick two teams, it appears as a pending card
- Play the final → it completes

- [ ] **Step 7: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: add tournament fixture view, standings table, knockout management, and per-match save"
```

---

### Task 5: Normal Games mode

**Files:**
- Modify: `badminton-dash.html` — add `renderNormalGamesPanel()`, new game form logic, and normal games stats computation

**Interfaces:**
- Consumes: `TOURNAMENT_DATA.normalGames`, `TOURNAMENT_DATA.players`, `escapeHtml()`, `formatDayHeading()`, `persistToLocalStorage()`, `playerOptions()` from Tasks 1-4
- Produces: `renderNormalGamesPanel()` function. `computeNormalGameStats(players, normalGames)` returning player stats. `computeNormalLeaderboard(playerStats)`.

- [ ] **Step 1: Write computeNormalGameStats()**

```javascript
function computeNormalGameStats(players, normalGames) {
  return players.map(function (name) {
    var gamesPlayed = 0, wins = 0;
    var playedWins = [];

    normalGames.forEach(function (g) {
      var onA = g.teamA.indexOf(name) !== -1;
      var onB = g.teamB.indexOf(name) !== -1;
      if (!onA && !onB) return;
      gamesPlayed++;
      var isWin = (onA && g.scoreA > g.scoreB) || (onB && g.scoreB > g.scoreA);
      if (isWin) wins++;
      playedWins.push(isWin);
    });

    var currentStreak = 0;
    for (var i = playedWins.length - 1; i >= 0; i--) {
      if (playedWins[i]) currentStreak++; else break;
    }

    return {
      name: name,
      points: wins * 3,
      gamesPlayed: gamesPlayed,
      wins: wins,
      winPct: gamesPlayed > 0 ? wins / gamesPlayed : 0,
      currentStreak: currentStreak
    };
  });
}
```

- [ ] **Step 2: Write renderNormalGamesPanel()**

```javascript
var showNewGameForm = false;
var newGameState = { teamA: { a: '', b: '' }, teamB: { a: '', b: '' }, scoreA: '', scoreB: '' };

function renderNormalGamesPanel() {
  var el = document.getElementById('panel-normal');
  var html = '';

  html += '<button class="btn-new" id="newGameBtn">+ New Game</button>';

  if (showNewGameForm) {
    html += '<div class="new-game-form" id="newGameFormEl">' +
      '<div class="form-row"><span class="form-label">Date</span>' +
      '<input type="date" id="ngDate" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="form-row"><span class="form-label">Team 1</span></div>' +
      '<div class="form-row">' +
      '<select class="ng-sel" data-t="A" data-s="a">' + playerOptions(newGameState.teamA.a) + '</select>' +
      '<select class="ng-sel" data-t="A" data-s="b">' + playerOptions(newGameState.teamA.b) + '</select></div>' +
      '<div class="form-row"><span class="form-label">Team 2</span></div>' +
      '<div class="form-row">' +
      '<select class="ng-sel" data-t="B" data-s="a">' + playerOptions(newGameState.teamB.a) + '</select>' +
      '<select class="ng-sel" data-t="B" data-s="b">' + playerOptions(newGameState.teamB.b) + '</select></div>' +
      '<div class="form-row"><span class="form-label">Score</span></div>' +
      '<div class="score-row" style="border:none;padding:0;margin:0;">' +
      '<input type="number" min="0" inputmode="numeric" id="ngScoreA" placeholder="0" value="' + newGameState.scoreA + '">' +
      '<span class="sep">–</span>' +
      '<input type="number" min="0" inputmode="numeric" id="ngScoreB" placeholder="0" value="' + newGameState.scoreB + '">' +
      '<button class="btn-save" id="ngSave">Save</button></div>' +
      '<p class="validation-msg" id="ngMsg"></p></div>';
  }

  if (TOURNAMENT_DATA.normalGames.length > 0) {
    html += '<p class="section-label">Recent Games</p>';
    var sorted = TOURNAMENT_DATA.normalGames.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1);
    });
    sorted.forEach(function (g) {
      var aWon = g.scoreA > g.scoreB;
      var winner = aWon ? g.teamA : g.teamB;
      var loser = aWon ? g.teamB : g.teamA;
      var winScore = Math.max(g.scoreA, g.scoreB);
      var loseScore = Math.min(g.scoreA, g.scoreB);
      html += '<div class="normal-game-card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<span class="ng-teams"><span class="win">' + escapeHtml(winner[0]) + ' & ' + escapeHtml(winner[1]) +
        '</span><span class="vs">def.</span><span class="lose">' + escapeHtml(loser[0]) + ' & ' + escapeHtml(loser[1]) + '</span></span>' +
        '<span class="ng-score">' + winScore + '–' + loseScore + '</span></div>' +
        '<div class="ng-date">' + formatDayHeading(g.date) + '</div></div>';
    });
  } else if (!showNewGameForm) {
    html += '<p style="color:var(--ink-soft);font-size:13px;">No games played yet.</p>';
  }

  el.innerHTML = html;

  document.getElementById('newGameBtn').addEventListener('click', function () {
    showNewGameForm = !showNewGameForm;
    newGameState = { teamA: { a: '', b: '' }, teamB: { a: '', b: '' }, scoreA: '', scoreB: '' };
    renderNormalGamesPanel();
  });

  if (showNewGameForm) {
    el.querySelectorAll('.ng-sel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var team = sel.dataset.t === 'A' ? 'teamA' : 'teamB';
        newGameState[team][sel.dataset.s] = sel.value;
      });
    });

    document.getElementById('ngSave').addEventListener('click', function () {
      var a = newGameState.teamA, b = newGameState.teamB;
      var sA = +document.getElementById('ngScoreA').value;
      var sB = +document.getElementById('ngScoreB').value;
      var msg = document.getElementById('ngMsg');
      if (!a.a || !a.b || !b.a || !b.b) { msg.textContent = 'Select all 4 players.'; return; }
      if (sA === 0 && sB === 0) { msg.textContent = 'Enter scores.'; return; }
      if (sA === sB) { msg.textContent = 'Scores cannot be tied.'; return; }

      TOURNAMENT_DATA.normalGames.push({
        id: 'n_' + Date.now(),
        date: document.getElementById('ngDate').value,
        teamA: [a.a, a.b],
        teamB: [b.a, b.b],
        scoreA: sA,
        scoreB: sB
      });
      persistToLocalStorage();
      showNewGameForm = false;
      newGameState = { teamA: { a: '', b: '' }, teamB: { a: '', b: '' }, scoreA: '', scoreB: '' };
      renderNormalGamesPanel();
      renderApp();
    });
  }
}
```

- [ ] **Step 3: Verify in browser**

Open the file. Click "Normal Games" tab:
- Click "+ New Game" — form appears with team selectors and score inputs
- Select 4 players, enter scores, click Save
- Game appears in the match log below
- Add 2-3 more games, confirm they all show

- [ ] **Step 4: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: add Normal Games mode with new game form, match log, and per-game save"
```

---

### Task 6: Leaderboard, Player Stats, and Partnerships panels

**Files:**
- Modify: `badminton-dash.html` — update `renderApp()` to populate the new panels, wire up season leaderboard from tournaments, and add toggle for tournament/normal stats

**Interfaces:**
- Consumes: All functions from Tasks 1-5: `computeTournamentStandings()`, `computeNormalGameStats()`, `computePlayerStats()` (existing, adapted), `computeLeaderboard()`, `computePartnershipStats()`, `renderLeaderboard()`, `renderPlayerStatsTable()`, `renderPartnerships()`, `TOURNAMENT_DATA`
- Produces: Updated `renderApp()` that populates all 5 panels.

- [ ] **Step 1: Write computeSeasonLeaderboard()**

This computes points from tournament final placements:

```javascript
function computeSeasonLeaderboard(players, tournaments) {
  var pointsMap = {};
  players.forEach(function (name) { pointsMap[name] = 0; });

  tournaments.forEach(function (t) {
    var placement = getTournamentPlacement(t);
    placement.forEach(function (p) {
      p.players.forEach(function (name) {
        if (pointsMap[name] !== undefined) pointsMap[name] += p.points;
      });
    });
  });

  var sorted = players.map(function (name) {
    return { name: name, points: pointsMap[name] };
  }).sort(function (a, b) { return b.points - a.points; });

  var places = sorted.map(function (p, i) {
    if (i === 0) return 1;
    return sorted[i - 1].points === p.points ? null : i + 1;
  });
  for (var i = 1; i < places.length; i++) {
    if (places[i] === null) places[i] = places[i - 1];
  }
  var counts = {};
  places.forEach(function (pl) { counts[pl] = (counts[pl] || 0) + 1; });

  return sorted.map(function (p, i) {
    return { name: p.name, points: p.points, place: places[i], tied: counts[places[i]] > 1 };
  });
}

function getTournamentPlacement(t) {
  var finalMatch = t.fixtures.find(function (f) { return f.stage === 'final' && f.status === 'completed'; });
  var thirdMatch = t.fixtures.find(function (f) { return f.stage === 'thirdPlace' && f.status === 'completed'; });

  if (finalMatch) {
    var result = [];
    var winner = finalMatch.scoreA > finalMatch.scoreB ? finalMatch.teamA : finalMatch.teamB;
    var loser = finalMatch.scoreA > finalMatch.scoreB ? finalMatch.teamB : finalMatch.teamA;
    result.push({ players: t.teams[winner], points: 3 });
    result.push({ players: t.teams[loser], points: 2 });
    if (thirdMatch) {
      var tw = thirdMatch.scoreA > thirdMatch.scoreB ? thirdMatch.teamA : thirdMatch.teamB;
      var tl = thirdMatch.scoreA > thirdMatch.scoreB ? thirdMatch.teamB : thirdMatch.teamA;
      result.push({ players: t.teams[tw], points: 1 });
      result.push({ players: t.teams[tl], points: 0 });
    }
    return result;
  }

  var standings = computeTournamentStandings(t);
  var hasCompleted = t.fixtures.some(function (f) { return f.status === 'completed'; });
  if (!hasCompleted) return [];

  return standings.map(function (s) {
    return { players: t.teams[s.teamIndex], points: pointsForRank(s.rank) };
  });
}
```

- [ ] **Step 2: Update renderApp()**

Replace the existing `renderApp()` function:

```javascript
function renderApp() {
  var seasonLB = computeSeasonLeaderboard(TOURNAMENT_DATA.players, TOURNAMENT_DATA.tournaments);
  document.getElementById('leaderboardEl').innerHTML = renderLeaderboard(seasonLB);

  if (currentView.tab === 'tournament') {
    renderTournamentPanel();
  } else if (currentView.tab === 'normal') {
    renderNormalGamesPanel();
  } else if (currentView.tab === 'leaderboard') {
    document.getElementById('leaderboardPanel').innerHTML =
      '<p class="section-label">Season Leaderboard</p>' +
      '<div class="leaderboard" style="flex-wrap:wrap;">' + renderLeaderboard(seasonLB) + '</div>';
    document.getElementById('playersTableEl').innerHTML = '';
  } else if (currentView.tab === 'players') {
    var normalStats = computeNormalGameStats(TOURNAMENT_DATA.players, TOURNAMENT_DATA.normalGames);
    var rows = seasonLB.map(function (o) {
      var ns = normalStats.find(function (n) { return n.name === o.name; }) || { gamesPlayed: 0, wins: 0, winPct: 0, currentStreak: 0 };
      var tGames = 0, tWins = 0;
      TOURNAMENT_DATA.tournaments.forEach(function (t) {
        t.fixtures.forEach(function (f) {
          if (f.status !== 'completed') return;
          var teamIdx = -1;
          t.teams.forEach(function (team, idx) { if (team.indexOf(o.name) !== -1) teamIdx = idx; });
          if (teamIdx === -1) return;
          if (f.teamA === teamIdx || f.teamB === teamIdx) {
            tGames++;
            if ((f.teamA === teamIdx && f.scoreA > f.scoreB) || (f.teamB === teamIdx && f.scoreB > f.scoreA)) tWins++;
          }
        });
      });
      return '<tr><td class="name">' + escapeHtml(o.name) + '</td>' +
        '<td class="num pts">' + o.points + '</td>' +
        '<td class="num">' + tGames + '</td><td class="num">' + tWins + '</td>' +
        '<td class="num">' + ns.gamesPlayed + '</td><td class="num">' + ns.wins + '</td></tr>';
    }).join('');

    document.getElementById('playerStatsEl').innerHTML =
      '<table><thead><tr><th>Player</th><th class="num">Season Pts</th>' +
      '<th class="num">T Games</th><th class="num">T Wins</th>' +
      '<th class="num">N Games</th><th class="num">N Wins</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } else if (currentView.tab === 'partners') {
    var allGames = [];
    TOURNAMENT_DATA.tournaments.forEach(function (t) {
      t.fixtures.forEach(function (f) {
        if (f.status !== 'completed') return;
        allGames.push({ teamA: t.teams[f.teamA], teamB: t.teams[f.teamB], scoreA: f.scoreA, scoreB: f.scoreB });
      });
    });
    TOURNAMENT_DATA.normalGames.forEach(function (g) {
      allGames.push({ teamA: g.teamA, teamB: g.teamB, scoreA: g.scoreA, scoreB: g.scoreB });
    });

    var map = {};
    allGames.forEach(function (g) {
      [g.teamA, g.teamB].forEach(function (team, tIdx) {
        var pair = team.slice().sort();
        var key = pair.join('|');
        if (!map[key]) map[key] = { players: pair, timesPlayed: 0, wins: 0 };
        map[key].timesPlayed++;
        var won = (tIdx === 0 && g.scoreA > g.scoreB) || (tIdx === 1 && g.scoreB > g.scoreA);
        if (won) map[key].wins++;
      });
    });

    var partnerships = Object.keys(map).map(function (key) {
      var p = map[key];
      return { players: p.players, timesPlayed: p.timesPlayed, wins: p.wins, winPct: p.wins / p.timesPlayed };
    }).sort(function (a, b) {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      return b.timesPlayed - a.timesPlayed;
    });

    document.getElementById('partnersEl').innerHTML = renderPartnerships(partnerships);
  }
}
```

- [ ] **Step 3: Remove old unused rendering calls and the old tab handler**

Delete the old `document.querySelectorAll('.tab-btn').forEach(...)` handler block (the one from the original code at the bottom of the file) since it was replaced in Task 2. Also remove the old `renderApp()` call at the bottom and add the new one:

```javascript
if (restoredFromLocalStorage) {
  document.getElementById('restoreBanner').style.display = 'block';
}
renderApp();
```

- [ ] **Step 4: Verify in browser**

Open the file. Confirm:
- Season leaderboard chips show in the navy header (from tournament placements)
- Leaderboard tab shows the same leaderboard in the content area
- Player Stats tab shows a table with tournament + normal game columns
- Partnerships tab shows partnership win rates from all games combined
- No console errors

- [ ] **Step 5: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: wire up Leaderboard, Player Stats, and Partnerships panels with combined stats"
```

---

### Task 7: Edit modal cleanup, export, and player management

**Files:**
- Modify: `badminton-dash.html` — update the Edit button to open a simpler modal for player management only, update export logic

**Interfaces:**
- Consumes: `TOURNAMENT_DATA`, `persistToLocalStorage()`, `renderApp()`, `escapeHtml()` from Tasks 1-6
- Produces: Simplified Edit modal with Players sub-panel only. Updated export that saves tournaments + normalGames.

- [ ] **Step 1: Simplify the modal HTML**

Replace the modal body content (inside `.modal-body`, lines 678-717) to remove the "Add Match Day" and "Past Days" sub-tabs, keeping only the Players panel:

```html
<div class="modal-body">
  <div class="step-block">
    <div class="step-head"><span class="step-title">Players</span></div>
    <div class="roster-chips" id="rosterChips"></div>
    <div class="add-player-row">
      <input type="text" id="newPlayerInput" placeholder="New player name">
      <button class="btn btn-add" id="addPlayerBtn" type="button">+ Add player</button>
    </div>
    <p class="roster-msg" id="rosterMsg"></p>
  </div>
</div>
```

- [ ] **Step 2: Simplify modal footer**

Replace the modal footer (lines 719-723):

```html
<div class="modal-foot">
  <button class="btn btn-secondary" id="exportBtn" type="button">Save &amp; Export</button>
  <button class="btn btn-secondary" id="cancelBtn" type="button">Close</button>
</div>
```

- [ ] **Step 3: Remove the old modal sub-tab navigation**

Remove the `<nav class="modal-subnav">` block and the `subpanel-add` / `subpanel-past` divs. Remove all the old `pendingDay`, `renderTeamRows()`, `renderMatchSection()`, `renderBracketMatchSection()`, `attachValidation()`, `buildDayTeamsArray()`, `saveMatchDay()`, `buildBracketMatches()`, `renderPastDaysList()`, and related event handlers from the JS. Keep only: `openModal()`, `closeModal()`, `renderRoster()`, `addPlayer()`, and the export handler.

- [ ] **Step 4: Update openModal()**

```javascript
function openModal() {
  backdrop.classList.add('open');
  renderRoster();
}
```

- [ ] **Step 5: Update the export handler**

Replace the export button handler to generate a downloadable HTML file with current data:

```javascript
document.getElementById('exportBtn').addEventListener('click', function () {
  var dataStr = JSON.stringify(TOURNAMENT_DATA, null, 2);
  var htmlContent = document.documentElement.outerHTML;
  var scriptTag = '<script id="tournament-data" type="application/json">';
  var idx = htmlContent.indexOf(scriptTag);
  if (idx === -1) return;
  var endIdx = htmlContent.indexOf('</script>', idx);
  var newHtml = htmlContent.slice(0, idx + scriptTag.length) + '\n' + dataStr + '\n' + htmlContent.slice(endIdx);

  var blob = new Blob([newHtml], { type: 'text/html' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'badminton-dash.html';
  a.click();
  URL.revokeObjectURL(a.href);
});
```

- [ ] **Step 6: Verify in browser**

Open the file. Click "Edit" button:
- Modal opens with Players section only
- Can add new players
- Click "Save & Export" — downloads a copy of the HTML with embedded data
- Open the exported file — data is preserved

- [ ] **Step 7: Commit**

```bash
git add badminton-dash.html
git commit -m "feat: simplify Edit modal to player management, update export for new data model"
```

---

### Task 8: Final polish — remove dead code, fix mobile, end-to-end test

**Files:**
- Modify: `badminton-dash.html` — remove unused CSS/JS, verify mobile layout, add `inputmode` attributes

**Interfaces:**
- Consumes: Everything from Tasks 1-7
- Produces: Clean, working single-file app

- [ ] **Step 1: Remove dead CSS**

Remove CSS rules that are no longer used (old match day cards, old modal sub-tabs, old bracket styles):
- `.day-card`, `.day-card-head`, `.team-row`, `.rank-badge`, `.col-headers` — remove if not used
- `.modal-subnav`, `.modal-subtab`, `.modal-subpanel` — remove
- `.bracket-match`, `.vs-line`, `.rr-match-row` — remove

- [ ] **Step 2: Remove dead JS functions**

Remove functions no longer called:
- `renderDayCard()`, `renderMatchHistory()`, `renderMatchStats()`, `renderMatchLog()`, `renderStatTile()`, `sameTeams()`, `computeMatchStats()`
- `deriveDayResult()` — remove if not used by migration (check: it's only used in old `computePlayerStats()` which is being replaced)
- `pendingDay`, `resetPendingDay()`, `renderTeamRows()`, `renderMatchSection()`, `renderBracketMatchSection()`, `attachValidation()`, `buildDayTeamsArray()`, `saveMatchDay()`, `buildBracketMatches()`, `renderPastDaysList()`

Keep: `pointsForRank()`, `escapeHtml()`, `formatDayHeading()`, `ordinal()`, `playerOptions()`, `renderLeaderboard()`, `renderPartnerships()`, `persistToLocalStorage()`, `computeLeaderboard()` (if still used by renderLeaderboard)

- [ ] **Step 3: Add inputmode="numeric" to all score inputs**

Search for `type="number"` in the JS template strings and ensure each also has `inputmode="numeric"` for mobile keyboard. Already done in Task 4/5 score inputs. Verify all are present.

- [ ] **Step 4: End-to-end verification in browser**

Full test flow:
1. Open fresh (clear localStorage first)
2. Tournament tab → create tournament with 3 teams → 3 fixtures generated
3. Play fixture 2 first (any order) → scores save → standings update
4. Play fixture 1 → standings update
5. Play fixture 3 → all group done
6. Switch to Knockout → add Final → pick two teams → play it → saves
7. Switch to Normal Games → add 2 casual games → match log shows both
8. Leaderboard tab → shows season points from tournament
9. Player Stats tab → shows tournament + normal columns
10. Partnerships tab → shows combined win rates
11. Edit → add a player → they appear in dropdowns for next tournament/game
12. Export → download works, re-open exported file → data intact

- [ ] **Step 5: Commit**

```bash
git add badminton-dash.html
git commit -m "chore: remove dead code from old match-day model, polish mobile inputs"
```
