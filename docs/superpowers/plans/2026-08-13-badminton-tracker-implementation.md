# Badminton Tournament Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `badminton-dash.html`, a single self-contained, offline-capable HTML file that tracks Yashwant's Saturday/Sunday badminton group: per-match scores, auto-derived rank/points (bracket or round-robin), a leaderboard, player/partnership/match stats, and an in-page Edit Mode that lets Yashwant add/edit/delete match days, manage players, and export an updated copy of the file to re-upload to Google Drive.

**Architecture:** Pure calculation logic (ranking, points, streaks, partnerships, match stats) lives in `dev/scoring.js`, tested with Node's built-in test runner (`node --test`, zero dependencies). Presentational HTML-string-building logic lives in `dev/render.js`, tested the same way. Both files' contents are copied verbatim into `badminton-dash.html`'s inline `<script>` — the shipped file must be fully self-contained (no `<script src>`, no external fonts/CDNs), since it's opened from Google Drive or a local copy with no guarantee of internet access. DOM wiring (Edit Mode modal, tab switching, localStorage, file export) lives only in `badminton-dash.html` and is verified manually in-browser, per the spec's own testing approach for this kind of static single-file app.

**Tech Stack:** Vanilla HTML/CSS/JS only. No build tool, no framework, no npm dependencies in the shipped file. Node.js (already installed, v24) is used only as a local dev-time test runner for the pure logic in `dev/`.

## Global Constraints

- The shipped file is exactly one HTML file (`badminton-dash.html`), fully self-contained: no external `<script src>`, no external stylesheets/fonts/CDNs. It must work opened directly from disk or Google Drive with no network access.
- Must declare `<meta charset="UTF-8">` explicitly (special characters otherwise render as mojibake depending on how the file is served — found during mockup testing).
- System font stacks only (no `@font-face`/webfont loading).
- Roster is always rendered/selected in alphabetical order.
- Teams are always exactly 2 players (doubles only); a match day has a minimum of 3 teams.
- Scoring: 1st place = 3 pts/player, 2nd = 2 pts/player, 3rd = 1 pt/player, 4th-or-lower = 0 pts/player.
- Exactly 4 teams in a day play a bracket (Semifinal 1, Semifinal 2, Final, 3rd-Place Match); 3 teams or 5+ teams always play round robin (unstaged matches).
- Round-robin rank = most wins, then point differential tiebreak; ties share a rank ("1-2-2-4" competition-ranking style, not "1-2-2-3").
- If literally every team in a round-robin day ends up tied with no separation possible, the day is **unresolved**: it still counts toward matches-played/partnership/match-log stats for participants, but awards 0 points to everyone that day.
- A "win" (for win %, championships, streaks) means rank 1 only — not any podium finish.
- Streaks are computed only over the days a player actually played; a day they skipped is invisible to the sequence (it neither breaks nor extends a streak).
- `localStorage` is a crash-recovery safety net only — the exported HTML file is always the source of truth.
- No authentication on Edit Mode — it's a convenience boundary, not a security boundary.
- Renaming a player must propagate through every `matchDays[].teams` entry referencing the old name, so history stays attached to the same person.

---

## File Structure

- `dev/scoring.js` — pure calculation functions (ranking, points, player stats, leaderboard, partnerships, match stats). No DOM, no I/O.
- `dev/scoring.test.js` — `node --test` coverage for every function in `scoring.js`.
- `dev/render.js` — pure HTML-string-building functions, consuming `scoring.js`'s outputs (`require('./scoring')`).
- `dev/render.test.js` — `node --test` coverage for every function in `render.js`.
- `dev/reference-mockup.html` — **already committed**, the approved interactive design mockup. Later tasks cite exact line ranges from this file for CSS and Edit-Mode JS logic that transfers over with minimal changes, instead of re-transcribing hundreds of lines.
- `badminton-dash.html` — the shipped deliverable. Built in Task 12 onward by combining the CSS/HTML from the mockup, the tested logic from `dev/scoring.js` + `dev/render.js` (copied in verbatim), and new DOM-wiring code for real data, editing, persistence, and export.

---

### Task 1: Dev test setup + `pointsForRank`

**Files:**
- Create: `dev/scoring.js`
- Create: `dev/scoring.test.js`

**Interfaces:**
- Produces: `pointsForRank(rank: number|null): number`

- [ ] **Step 1: Write the failing test**

```js
// dev/scoring.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pointsForRank } = require('./scoring');

test('pointsForRank maps rank to points', () => {
  assert.equal(pointsForRank(1), 3);
  assert.equal(pointsForRank(2), 2);
  assert.equal(pointsForRank(3), 1);
  assert.equal(pointsForRank(4), 0);
  assert.equal(pointsForRank(7), 0);
  assert.equal(pointsForRank(null), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — `Cannot find module './scoring'`

- [ ] **Step 3: Write minimal implementation**

```js
// dev/scoring.js
function pointsForRank(rank) {
  if (rank === 1) return 3;
  if (rank === 2) return 2;
  if (rank === 3) return 1;
  return 0;
}

module.exports = {
  pointsForRank: pointsForRank
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `1 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Add pointsForRank with tests"
```

---

### Task 2: `deriveDayResult` — round-robin ranking

**Files:**
- Modify: `dev/scoring.js`
- Modify: `dev/scoring.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 directly (independent function)
- Produces: `deriveDayResult(day: {teams: string[][], matches: {teamA:number,teamB:number,scoreA:number,scoreB:number,stage?:string}[]}): {rankings: {teamIndex:number,wins:number,diff:number,rank:number|null,tied:boolean}[], unresolved: boolean, pending: boolean}`

- [ ] **Step 1: Write the failing tests**

```js
// append to dev/scoring.test.js
const { deriveDayResult } = require('./scoring');

test('deriveDayResult: round robin, no ties', () => {
  const day = {
    teams: [['Yashwant', 'Shiva'], ['Mahesh', 'Vinay'], ['Anthony', 'Harish']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 },
      { teamA: 1, teamB: 2, scoreA: 19, scoreB: 21 },
      { teamA: 0, teamB: 2, scoreA: 21, scoreB: 18 }
    ]
  };
  const result = deriveDayResult(day);
  assert.equal(result.unresolved, false);
  assert.equal(result.pending, false);
  assert.deepEqual(result.rankings[0], { teamIndex: 0, wins: 2, diff: 9, rank: 1, tied: false });
  assert.deepEqual(result.rankings[1], { teamIndex: 1, wins: 0, diff: -8, rank: 3, tied: false });
  assert.deepEqual(result.rankings[2], { teamIndex: 2, wins: 1, diff: -1, rank: 2, tied: false });
});

test('deriveDayResult: round robin with a tie for 1st and a tie for 3rd', () => {
  const day = {
    teams: [['Yashwant', 'Mahesh'], ['Shiva', 'Kartik'], ['Anthony', 'Vinay'], ['Harish', 'Shajith']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 },
      { teamA: 2, teamB: 3, scoreA: 21, scoreB: 15 },
      { teamA: 0, teamB: 3, scoreA: 21, scoreB: 17 },
      { teamA: 2, teamB: 1, scoreA: 21, scoreB: 17 }
    ]
  };
  const result = deriveDayResult(day);
  assert.equal(result.unresolved, false);
  assert.equal(result.rankings[0].rank, 1);
  assert.equal(result.rankings[0].tied, true);
  assert.equal(result.rankings[2].rank, 1);
  assert.equal(result.rankings[2].tied, true);
  assert.equal(result.rankings[1].rank, 3);
  assert.equal(result.rankings[1].tied, true);
  assert.equal(result.rankings[3].rank, 3);
  assert.equal(result.rankings[3].tied, true);
});

test('deriveDayResult: fully unresolved round-robin day', () => {
  const day = {
    teams: [['A', 'B'], ['C', 'D'], ['E', 'F']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 16 },
      { teamA: 1, teamB: 2, scoreA: 21, scoreB: 16 },
      { teamA: 2, teamB: 0, scoreA: 21, scoreB: 16 }
    ]
  };
  const result = deriveDayResult(day);
  assert.equal(result.unresolved, true);
  result.rankings.forEach((r) => {
    assert.equal(r.rank, 1);
    assert.equal(r.tied, true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — `deriveDayResult is not a function`

- [ ] **Step 3: Implement `deriveDayResult` (round-robin branch only for now)**

```js
// add to dev/scoring.js, above module.exports
function deriveDayResult(day) {
  var tally = day.teams.map(function () { return { wins: 0, diff: 0 }; });

  day.matches.forEach(function (m) {
    tally[m.teamA].diff += m.scoreA - m.scoreB;
    tally[m.teamB].diff += m.scoreB - m.scoreA;
    if (m.scoreA > m.scoreB) tally[m.teamA].wins++; else tally[m.teamB].wins++;
  });

  var rankings = tally.map(function (t, i) {
    return { teamIndex: i, wins: t.wins, diff: t.diff, rank: null, tied: false };
  });

  var order = rankings.slice().sort(function (a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.diff - a.diff;
  });

  var place = 1;
  order.forEach(function (r, i) {
    if (i > 0) {
      var prev = order[i - 1];
      var sameAsPrev = r.wins === prev.wins && r.diff === prev.diff;
      if (!sameAsPrev) place = i + 1;
    }
    r.rank = place;
  });

  var rankCounts = {};
  order.forEach(function (r) { rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1; });
  order.forEach(function (r) { r.tied = rankCounts[r.rank] > 1; });

  var allTied = order.every(function (r) { return r.wins === order[0].wins && r.diff === order[0].diff; });

  return { rankings: rankings, unresolved: allTied, pending: false };
}

module.exports = {
  pointsForRank: pointsForRank,
  deriveDayResult: deriveDayResult
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `4 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Add deriveDayResult round-robin ranking with tie-sharing and unresolved-day detection"
```

---

### Task 3: `deriveDayResult` — bracket ranking

**Files:**
- Modify: `dev/scoring.js`
- Modify: `dev/scoring.test.js`

**Interfaces:**
- Consumes: extends `deriveDayResult` from Task 2 (same function signature)
- Produces: same `deriveDayResult` return shape, now also correctly handling `stage`-tagged matches

- [ ] **Step 1: Write the failing tests**

```js
// append to dev/scoring.test.js
test('deriveDayResult: complete bracket ranks by Final/3rd-Place, not win-tally', () => {
  const day = {
    teams: [['Yashwant', 'Mahesh'], ['Anthony', 'Vinay'], ['Shiva', 'Kartik'], ['Harish', 'Shajith']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15, stage: 'semifinal1' },
      { teamA: 2, teamB: 3, scoreA: 21, scoreB: 17, stage: 'semifinal2' },
      { teamA: 0, teamB: 2, scoreA: 21, scoreB: 18, stage: 'final' },
      { teamA: 1, teamB: 3, scoreA: 21, scoreB: 19, stage: 'thirdPlace' }
    ]
  };
  const result = deriveDayResult(day);
  assert.equal(result.unresolved, false);
  assert.equal(result.pending, false);
  assert.equal(result.rankings[0].rank, 1);
  assert.equal(result.rankings[2].rank, 2);
  assert.equal(result.rankings[1].rank, 3);
  assert.equal(result.rankings[3].rank, 4);
});

test('deriveDayResult: bracket with Final but no 3rd-Place match is pending', () => {
  const day = {
    teams: [['Yashwant', 'Mahesh'], ['Anthony', 'Vinay'], ['Shiva', 'Kartik'], ['Harish', 'Shajith']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15, stage: 'semifinal1' },
      { teamA: 2, teamB: 3, scoreA: 21, scoreB: 17, stage: 'semifinal2' },
      { teamA: 0, teamB: 2, scoreA: 21, scoreB: 18, stage: 'final' }
    ]
  };
  const result = deriveDayResult(day);
  assert.equal(result.pending, true);
  assert.equal(result.unresolved, false);
  assert.equal(result.rankings[0].rank, 1);
  assert.equal(result.rankings[2].rank, 2);
  assert.equal(result.rankings[1].rank, null);
  assert.equal(result.rankings[3].rank, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — bracket-tagged matches currently fall through to round-robin ranking, producing wrong ranks (assertion mismatches, not a crash)

- [ ] **Step 3: Extend `deriveDayResult` with the bracket branch**

```js
// in dev/scoring.js, replace the deriveDayResult function with:
function deriveDayResult(day) {
  var tally = day.teams.map(function () { return { wins: 0, diff: 0 }; });

  day.matches.forEach(function (m) {
    tally[m.teamA].diff += m.scoreA - m.scoreB;
    tally[m.teamB].diff += m.scoreB - m.scoreA;
    if (m.scoreA > m.scoreB) tally[m.teamA].wins++; else tally[m.teamB].wins++;
  });

  var rankings = tally.map(function (t, i) {
    return { teamIndex: i, wins: t.wins, diff: t.diff, rank: null, tied: false };
  });

  var finalMatch = day.matches.find(function (m) { return m.stage === 'final'; });

  if (finalMatch) {
    var thirdMatch = day.matches.find(function (m) { return m.stage === 'thirdPlace'; });
    var finalWinner = finalMatch.scoreA > finalMatch.scoreB ? finalMatch.teamA : finalMatch.teamB;
    var finalLoser = finalMatch.scoreA > finalMatch.scoreB ? finalMatch.teamB : finalMatch.teamA;
    rankings[finalWinner].rank = 1;
    rankings[finalLoser].rank = 2;

    var pending = !thirdMatch;
    if (thirdMatch) {
      var thirdWinner = thirdMatch.scoreA > thirdMatch.scoreB ? thirdMatch.teamA : thirdMatch.teamB;
      var thirdLoser = thirdMatch.scoreA > thirdMatch.scoreB ? thirdMatch.teamB : thirdMatch.teamA;
      rankings[thirdWinner].rank = 3;
      rankings[thirdLoser].rank = 4;
    }
    return { rankings: rankings, unresolved: false, pending: pending };
  }

  var order = rankings.slice().sort(function (a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.diff - a.diff;
  });

  var place = 1;
  order.forEach(function (r, i) {
    if (i > 0) {
      var prev = order[i - 1];
      var sameAsPrev = r.wins === prev.wins && r.diff === prev.diff;
      if (!sameAsPrev) place = i + 1;
    }
    r.rank = place;
  });

  var rankCounts = {};
  order.forEach(function (r) { rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1; });
  order.forEach(function (r) { r.tied = rankCounts[r.rank] > 1; });

  var allTied = order.every(function (r) { return r.wins === order[0].wins && r.diff === order[0].diff; });

  return { rankings: rankings, unresolved: allTied, pending: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `6 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Extend deriveDayResult with bracket (Final/3rd-Place) ranking and pending state"
```

---

### Task 4: `computePlayerStats`

**Files:**
- Modify: `dev/scoring.js`
- Modify: `dev/scoring.test.js`

**Interfaces:**
- Consumes: `deriveDayResult` (Task 2/3), `pointsForRank` (Task 1)
- Produces: `computePlayerStats(players: string[], matchDays: Day[]): {name, points, matchesPlayed, championships, winPct, currentStreak, longestStreak}[]` (same order as `players`)

- [ ] **Step 1: Write the failing tests**

```js
// append to dev/scoring.test.js
const { computePlayerStats } = require('./scoring');

test('computePlayerStats: points, matches played, championships, win %', () => {
  const matchDays = [
    { date: '2026-08-01', teams: [['Ann', 'Bob'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 }] },
    { date: '2026-08-02', teams: [['Ann', 'Cara'], ['Bob', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 18, scoreB: 21 }] },
    { date: '2026-08-03', teams: [['Bob', 'Dee'], ['Cara', 'Xavier']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 10 }] }
  ];
  const stats = computePlayerStats(['Ann', 'Bob'], matchDays);
  const ann = stats.find((s) => s.name === 'Ann');
  const bob = stats.find((s) => s.name === 'Bob');

  assert.deepEqual(ann, {
    name: 'Ann', points: 5, matchesPlayed: 2, championships: 1, winPct: 0.5, currentStreak: 0, longestStreak: 1
  });
  assert.deepEqual(bob, {
    name: 'Bob', points: 9, matchesPlayed: 3, championships: 3, winPct: 1, currentStreak: 3, longestStreak: 3
  });
});

test('computePlayerStats: a skipped day neither breaks nor extends a streak', () => {
  const matchDays = [
    { date: '2026-08-01', teams: [['Xavier', 'A'], ['B', 'C']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 10 }] },
    { date: '2026-08-02', teams: [['B', 'C'], ['D', 'E']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 10 }] },
    { date: '2026-08-03', teams: [['Xavier', 'A'], ['B', 'C']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 5 }] }
  ];
  const stats = computePlayerStats(['Xavier'], matchDays);
  assert.deepEqual(stats[0], {
    name: 'Xavier', points: 6, matchesPlayed: 2, championships: 2, winPct: 1, currentStreak: 2, longestStreak: 2
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — `computePlayerStats is not a function`

- [ ] **Step 3: Implement `computePlayerStats`**

```js
// add to dev/scoring.js, above module.exports
function computePlayerStats(players, matchDays) {
  var sortedDays = matchDays.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });

  return players.map(function (name) {
    var matchesPlayed = 0, points = 0, championships = 0;
    var playedWins = [];

    sortedDays.forEach(function (day) {
      var teamIndex = day.teams.findIndex(function (team) { return team.indexOf(name) !== -1; });
      if (teamIndex === -1) return;

      matchesPlayed++;
      var result = deriveDayResult(day);
      var entry = result.rankings[teamIndex];
      var awardedRank = result.unresolved ? null : entry.rank;
      points += pointsForRank(awardedRank);
      var isWin = !result.unresolved && entry.rank === 1;
      if (isWin) championships++;
      playedWins.push(isWin);
    });

    var currentStreak = 0;
    for (var i = playedWins.length - 1; i >= 0; i--) {
      if (playedWins[i]) currentStreak++; else break;
    }

    var longestStreak = 0, run = 0;
    playedWins.forEach(function (isWin) {
      run = isWin ? run + 1 : 0;
      if (run > longestStreak) longestStreak = run;
    });

    return {
      name: name,
      points: points,
      matchesPlayed: matchesPlayed,
      championships: championships,
      winPct: matchesPlayed > 0 ? championships / matchesPlayed : 0,
      currentStreak: currentStreak,
      longestStreak: longestStreak
    };
  });
}

module.exports = {
  pointsForRank: pointsForRank,
  deriveDayResult: deriveDayResult,
  computePlayerStats: computePlayerStats
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `8 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Add computePlayerStats with streak skip-rule"
```

---

### Task 5: `computeLeaderboard`

**Files:**
- Modify: `dev/scoring.js`
- Modify: `dev/scoring.test.js`

**Interfaces:**
- Consumes: array shape produced by `computePlayerStats` (only reads `.name`/`.points`)
- Produces: `computeLeaderboard(playerStats: {name,points}[]): {name, points, place, tied}[]` sorted by points descending

- [ ] **Step 1: Write the failing test**

```js
// append to dev/scoring.test.js
const { computeLeaderboard } = require('./scoring');

test('computeLeaderboard: sorts by points, shares place on ties', () => {
  const input = [
    { name: 'A', points: 5 }, { name: 'B', points: 9 }, { name: 'C', points: 5 }, { name: 'D', points: 2 }
  ];
  const board = computeLeaderboard(input);
  assert.deepEqual(board, [
    { name: 'B', points: 9, place: 1, tied: false },
    { name: 'A', points: 5, place: 2, tied: true },
    { name: 'C', points: 5, place: 2, tied: true },
    { name: 'D', points: 2, place: 4, tied: false }
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — `computeLeaderboard is not a function`

- [ ] **Step 3: Implement `computeLeaderboard`**

```js
// add to dev/scoring.js, above module.exports
function computeLeaderboard(playerStats) {
  var sorted = playerStats.slice().sort(function (a, b) { return b.points - a.points; });

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

module.exports = {
  pointsForRank: pointsForRank,
  deriveDayResult: deriveDayResult,
  computePlayerStats: computePlayerStats,
  computeLeaderboard: computeLeaderboard
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `9 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Add computeLeaderboard with tie grouping"
```

---

### Task 6: `computePartnershipStats`

**Files:**
- Modify: `dev/scoring.js`
- Modify: `dev/scoring.test.js`

**Interfaces:**
- Consumes: `deriveDayResult` (Task 2/3)
- Produces: `computePartnershipStats(matchDays: Day[]): {players:[string,string], timesPlayed:number, wins:number, winPct:number}[]`

- [ ] **Step 1: Write the failing test**

```js
// append to dev/scoring.test.js
const { computePartnershipStats } = require('./scoring');

test('computePartnershipStats: merges a pair regardless of slot order, tracks wins', () => {
  const matchDays = [
    { date: '2026-08-01', teams: [['Ann', 'Bob'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 }] },
    { date: '2026-08-02', teams: [['Bob', 'Ann'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 18, scoreB: 21 }] }
  ];
  const stats = computePartnershipStats(matchDays);
  const annBob = stats.find((p) => p.players.join('|') === 'Ann|Bob');
  const caraDee = stats.find((p) => p.players.join('|') === 'Cara|Dee');

  assert.deepEqual(annBob, { players: ['Ann', 'Bob'], timesPlayed: 2, wins: 1, winPct: 0.5 });
  assert.deepEqual(caraDee, { players: ['Cara', 'Dee'], timesPlayed: 2, wins: 1, winPct: 0.5 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — `computePartnershipStats is not a function`

- [ ] **Step 3: Implement `computePartnershipStats`**

```js
// add to dev/scoring.js, above module.exports
function computePartnershipStats(matchDays) {
  var map = {};
  matchDays.forEach(function (day) {
    var result = deriveDayResult(day);
    day.teams.forEach(function (team, teamIndex) {
      var pair = team.slice().sort();
      var key = pair.join('|');
      if (!map[key]) map[key] = { players: pair, timesPlayed: 0, wins: 0 };
      map[key].timesPlayed++;
      var entry = result.rankings[teamIndex];
      if (!result.unresolved && entry.rank === 1) map[key].wins++;
    });
  });

  return Object.keys(map).map(function (key) {
    var p = map[key];
    return { players: p.players, timesPlayed: p.timesPlayed, wins: p.wins, winPct: p.wins / p.timesPlayed };
  }).sort(function (a, b) {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    return b.timesPlayed - a.timesPlayed;
  });
}

module.exports = {
  pointsForRank: pointsForRank,
  deriveDayResult: deriveDayResult,
  computePlayerStats: computePlayerStats,
  computeLeaderboard: computeLeaderboard,
  computePartnershipStats: computePartnershipStats
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `10 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Add computePartnershipStats"
```

---

### Task 7: `computeMatchStats`

**Files:**
- Modify: `dev/scoring.js`
- Modify: `dev/scoring.test.js`

**Interfaces:**
- Consumes: nothing (reads `day.matches`/`day.teams`/`day.date` directly)
- Produces: `computeMatchStats(matchDays: Day[]): {totalMatches:number, closest: MatchInfo|null, mostLopsided: MatchInfo|null, avgMargin:number}` where `MatchInfo = {date, teamA:[string,string], teamB:[string,string], scoreA:number, scoreB:number, margin:number}`

- [ ] **Step 1: Write the failing tests**

```js
// append to dev/scoring.test.js
const { computeMatchStats } = require('./scoring');

test('computeMatchStats: totals, closest, most lopsided, average margin', () => {
  const matchDays = [
    { date: '2026-08-01', teams: [['Ann', 'Bob'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 19 }] },
    { date: '2026-08-02', teams: [['Ann', 'Bob'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 10 }] }
  ];
  const stats = computeMatchStats(matchDays);
  assert.equal(stats.totalMatches, 2);
  assert.equal(stats.avgMargin, 6.5);
  assert.equal(stats.closest.margin, 2);
  assert.equal(stats.closest.date, '2026-08-01');
  assert.equal(stats.mostLopsided.margin, 11);
  assert.equal(stats.mostLopsided.date, '2026-08-02');
});

test('computeMatchStats: empty input', () => {
  const stats = computeMatchStats([]);
  assert.deepEqual(stats, { totalMatches: 0, closest: null, mostLopsided: null, avgMargin: 0 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/scoring.test.js`
Expected: FAIL — `computeMatchStats is not a function`

- [ ] **Step 3: Implement `computeMatchStats`**

```js
// add to dev/scoring.js, above module.exports
function computeMatchStats(matchDays) {
  var flat = [];
  matchDays.forEach(function (day) {
    day.matches.forEach(function (m) {
      flat.push({
        date: day.date,
        teamA: day.teams[m.teamA],
        teamB: day.teams[m.teamB],
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        margin: Math.abs(m.scoreA - m.scoreB)
      });
    });
  });

  if (flat.length === 0) {
    return { totalMatches: 0, closest: null, mostLopsided: null, avgMargin: 0 };
  }

  var closest = flat[0], mostLopsided = flat[0], sum = 0;
  flat.forEach(function (m) {
    if (m.margin < closest.margin) closest = m;
    if (m.margin > mostLopsided.margin) mostLopsided = m;
    sum += m.margin;
  });

  return {
    totalMatches: flat.length,
    closest: closest,
    mostLopsided: mostLopsided,
    avgMargin: Math.round((sum / flat.length) * 10) / 10
  };
}

module.exports = {
  pointsForRank: pointsForRank,
  deriveDayResult: deriveDayResult,
  computePlayerStats: computePlayerStats,
  computeLeaderboard: computeLeaderboard,
  computePartnershipStats: computePartnershipStats,
  computeMatchStats: computeMatchStats
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/scoring.test.js`
Expected: PASS — `12 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/scoring.js dev/scoring.test.js
git commit -m "Add computeMatchStats"
```

---

### Task 8: `render.js` — helpers + `renderLeaderboard`

**Files:**
- Create: `dev/render.js`
- Create: `dev/render.test.js`

**Interfaces:**
- Consumes: nothing from `scoring.js` yet (helpers are standalone); `renderLeaderboard` consumes the shape produced by `computeLeaderboard` (Task 5)
- Produces: `formatDayHeading(dateStr:string):string`, `ordinal(n:number):string`, `escapeHtml(str:string):string`, `renderLeaderboard(leaderboard):string`

- [ ] **Step 1: Write the failing tests**

```js
// dev/render.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDayHeading, ordinal, escapeHtml, renderLeaderboard } = require('./render');

test('formatDayHeading formats an ISO date as a weekday heading', () => {
  assert.equal(formatDayHeading('2026-08-01'), 'Saturday, Aug 1');
  assert.equal(formatDayHeading('2026-08-02'), 'Sunday, Aug 2');
  assert.equal(formatDayHeading('2026-08-08'), 'Saturday, Aug 8');
});

test('ordinal formats place numbers', () => {
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(2), '2nd');
  assert.equal(ordinal(3), '3rd');
  assert.equal(ordinal(4), '4th');
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(21), '21st');
});

test('escapeHtml escapes dangerous characters', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml("O'Brien & Sons"), 'O&#39;Brien &amp; Sons');
});

test('renderLeaderboard marks the leader and tied places', () => {
  const board = [
    { name: 'B', points: 9, place: 1, tied: false },
    { name: 'A', points: 5, place: 2, tied: true }
  ];
  const html = renderLeaderboard(board);
  assert.ok(html.includes('lb-chip leader'));
  assert.ok(html.includes('1st'));
  assert.ok(html.includes('B'));
  assert.ok(html.includes('9'));
  assert.ok(html.includes('2nd · tied'));
  assert.ok(!html.match(/lb-chip leader[\s\S]*A</));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/render.test.js`
Expected: FAIL — `Cannot find module './render'`

- [ ] **Step 3: Implement the helpers and `renderLeaderboard`**

```js
// dev/render.js
function formatDayHeading(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function ordinal(n) {
  var s = ['th', 'st', 'nd', 'rd'];
  var v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function renderLeaderboard(leaderboard) {
  return leaderboard.map(function (p) {
    var posLabel = ordinal(p.place) + (p.tied ? ' · tied' : '');
    var leaderClass = p.place === 1 ? ' leader' : '';
    return '<div class="lb-chip' + leaderClass + '"><div class="lb-pos">' + posLabel + '</div>' +
      '<div class="lb-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="lb-pts">' + p.points + '<span>pts</span></div></div>';
  }).join('');
}

module.exports = {
  formatDayHeading: formatDayHeading,
  ordinal: ordinal,
  escapeHtml: escapeHtml,
  renderLeaderboard: renderLeaderboard
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/render.test.js`
Expected: PASS — `5 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/render.js dev/render.test.js
git commit -m "Add render.js helpers and renderLeaderboard"
```

---

### Task 9: `renderDayCard` + `renderMatchHistory`

**Files:**
- Modify: `dev/render.js`
- Modify: `dev/render.test.js`

**Interfaces:**
- Consumes: `deriveDayResult`, `pointsForRank` (from `dev/scoring.js`, via `require('./scoring')`); `formatDayHeading`, `escapeHtml` (Task 8)
- Produces: `renderDayCard(day):string`, `renderMatchHistory(matchDays):string`

- [ ] **Step 1: Write the failing tests**

```js
// append to dev/render.test.js
const { renderDayCard, renderMatchHistory } = require('./render');

test('renderDayCard shows rank, record, diff, points, and a gold/tied marker', () => {
  const day = {
    date: '2026-08-01',
    teams: [['Yashwant', 'Shiva'], ['Mahesh', 'Vinay'], ['Anthony', 'Harish']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 },
      { teamA: 1, teamB: 2, scoreA: 19, scoreB: 21 },
      { teamA: 0, teamB: 2, scoreA: 21, scoreB: 18 }
    ]
  };
  const html = renderDayCard(day);
  assert.ok(html.includes('Saturday, Aug 1'));
  assert.ok(html.includes('Yashwant'));
  assert.ok(html.includes('rank-badge gold'));
  assert.ok(html.includes('2–0'));
  assert.ok(html.includes('+9'));
  assert.ok(html.includes('+3 each'));
  assert.ok(html.includes('+1 each'));
});

test('renderDayCard flags a pending bracket day', () => {
  const day = {
    date: '2026-08-08',
    teams: [['Yashwant', 'Mahesh'], ['Anthony', 'Vinay'], ['Shiva', 'Kartik'], ['Harish', 'Shajith']],
    matches: [
      { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15, stage: 'semifinal1' },
      { teamA: 2, teamB: 3, scoreA: 21, scoreB: 17, stage: 'semifinal2' },
      { teamA: 0, teamB: 2, scoreA: 21, scoreB: 18, stage: 'final' }
    ]
  };
  const html = renderDayCard(day);
  assert.ok(html.includes('rank pending'));
});

test('renderMatchHistory sorts most recent day first and handles an empty list', () => {
  const days = [
    { date: '2026-08-01', teams: [['A', 'B'], ['C', 'D'], ['E', 'F']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 }] },
    { date: '2026-08-08', teams: [['A', 'B'], ['C', 'D'], ['E', 'F']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 }] }
  ];
  const html = renderMatchHistory(days);
  assert.ok(html.indexOf('Aug 8') < html.indexOf('Aug 1'));
  assert.equal(renderMatchHistory([]), '<p style="color:var(--ink-soft);font-size:13px;">No match days recorded yet.</p>');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/render.test.js`
Expected: FAIL — `renderDayCard is not a function`

- [ ] **Step 3: Implement `renderDayCard` and `renderMatchHistory`**

```js
// add to top of dev/render.js
var scoring = require('./scoring');
var deriveDayResult = scoring.deriveDayResult;
var pointsForRank = scoring.pointsForRank;

// add to dev/render.js, above module.exports
function renderDayCard(day) {
  var result = deriveDayResult(day);
  var rows = result.rankings.slice().sort(function (a, b) {
    if (a.rank === null && b.rank === null) return 0;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });

  var teamRowsHtml = rows.map(function (r) {
    var team = day.teams[r.teamIndex];
    var teamMatches = day.matches.filter(function (m) { return m.teamA === r.teamIndex || m.teamB === r.teamIndex; }).length;
    var losses = teamMatches - r.wins;
    var rankLabel = r.rank === null ? '?' : String(r.rank);
    var goldClass = r.rank === 1 ? ' gold' : '';
    var tieTag = r.tied ? '<span class="rank-tie-tag">T</span>' : '';
    var shuttle = r.rank === 1 ? '<svg class="shuttle" viewBox="0 0 24 24" fill="#F2A93C"><path d="M12 2 L14 9 L21 10.5 L15.5 15 L17 22 L12 18.5 L7 22 L8.5 15 L3 10.5 L10 9 Z"/></svg>' : '';
    var diffClass = r.diff > 0 ? 'pos' : (r.diff < 0 ? 'neg' : '');
    var diffLabel = (r.diff > 0 ? '+' : '') + r.diff;
    var pts = pointsForRank(result.unresolved ? null : r.rank);
    var ptsLabel = (pts > 0 ? '+' : '') + pts + ' each';

    return '<div class="team-row">' +
      '<span class="rank-badge' + goldClass + '">' + rankLabel + tieTag + '</span>' +
      '<span class="team-players">' + shuttle + escapeHtml(team[0]) + '<span class="amp">&amp;</span>' + escapeHtml(team[1]) + '</span>' +
      '<span class="team-record">' + r.wins + '–' + losses + '</span>' +
      '<span class="team-diff ' + diffClass + '">' + diffLabel + '</span>' +
      '<span class="team-pts">' + ptsLabel + '</span></div>';
  }).join('');

  var meta = day.teams.length + ' teams · ' + day.matches.length + ' matches';
  var pendingNote = result.pending ? '<p style="color:var(--coral);font-size:11.5px;margin:6px 4px 0;">3rd-place match not yet recorded — rank pending.</p>' : '';
  var unresolvedNote = result.unresolved ? '<p style="color:var(--coral);font-size:11.5px;margin:6px 4px 0;">Unresolved day — no points awarded.</p>' : '';

  return '<div class="day-card"><div class="day-card-head"><span class="date">' + formatDayHeading(day.date) + '</span>' +
    '<span class="meta">' + meta + '</span></div>' +
    '<div class="col-headers"><span>Rk</span><span>Team</span><span>Record</span><span>Diff</span><span>Pts</span></div>' +
    teamRowsHtml + pendingNote + unresolvedNote + '</div>';
}

function renderMatchHistory(matchDays) {
  if (matchDays.length === 0) {
    return '<p style="color:var(--ink-soft);font-size:13px;">No match days recorded yet.</p>';
  }
  var sorted = matchDays.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return sorted.map(renderDayCard).join('');
}

// update module.exports:
module.exports = {
  formatDayHeading: formatDayHeading,
  ordinal: ordinal,
  escapeHtml: escapeHtml,
  renderLeaderboard: renderLeaderboard,
  renderDayCard: renderDayCard,
  renderMatchHistory: renderMatchHistory
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/render.test.js`
Expected: PASS — `8 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/render.js dev/render.test.js
git commit -m "Add renderDayCard and renderMatchHistory"
```

---

### Task 10: `renderPlayerStatsTable` + `renderPartnerships`

**Files:**
- Modify: `dev/render.js`
- Modify: `dev/render.test.js`

**Interfaces:**
- Consumes: `computeLeaderboard` (Task 5, via `require('./scoring')`); `escapeHtml` (Task 8)
- Produces: `renderPlayerStatsTable(playerStats):string`, `renderPartnerships(partnershipStats):string`

- [ ] **Step 1: Write the failing tests**

```js
// append to dev/render.test.js
const { renderPlayerStatsTable, renderPartnerships } = require('./render');

test('renderPlayerStatsTable orders rows by leaderboard place and shows all columns', () => {
  const playerStats = [
    { name: 'Ann', points: 5, matchesPlayed: 2, championships: 1, winPct: 0.5, currentStreak: 0, longestStreak: 1 },
    { name: 'Bob', points: 9, matchesPlayed: 3, championships: 3, winPct: 1, currentStreak: 3, longestStreak: 3 }
  ];
  const html = renderPlayerStatsTable(playerStats);
  assert.ok(html.indexOf('Bob') < html.indexOf('Ann'));
  assert.ok(html.includes('50%'));
  assert.ok(html.includes('100%'));
  assert.ok(html.includes('trophy-count'));
});

test('renderPartnerships highlights the most-played duo and handles an empty list', () => {
  const partnerships = [
    { players: ['Ann', 'Bob'], timesPlayed: 1, wins: 1, winPct: 1 },
    { players: ['Cara', 'Dee'], timesPlayed: 2, wins: 0, winPct: 0 }
  ];
  const html = renderPartnerships(partnerships);
  assert.ok(html.includes('most-played'));
  assert.ok(html.includes('Cara &amp; Dee'));
  assert.equal(renderPartnerships([]), '<p style="color:var(--ink-soft);font-size:13px;">No partnerships recorded yet.</p>');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/render.test.js`
Expected: FAIL — `renderPlayerStatsTable is not a function`

- [ ] **Step 3: Implement `renderPlayerStatsTable` and `renderPartnerships`**

```js
// add to top of dev/render.js, alongside the existing scoring requires
var computeLeaderboard = scoring.computeLeaderboard;

// add to dev/render.js, above module.exports
function renderPlayerStatsTable(playerStats) {
  var order = computeLeaderboard(playerStats);
  var byName = {};
  playerStats.forEach(function (p) { byName[p.name] = p; });

  var rows = order.map(function (o) {
    var p = byName[o.name];
    var winPctLabel = Math.round(p.winPct * 100) + '%';
    var streakClass = p.currentStreak > 0 ? ' flame' : '';
    return '<tr><td class="name">' + escapeHtml(p.name) + '</td>' +
      '<td class="num pts">' + p.points + '</td>' +
      '<td class="num">' + p.matchesPlayed + '</td>' +
      '<td class="num">' + winPctLabel + '</td>' +
      '<td class="num' + (p.championships > 0 ? ' trophy-count' : '') + '">' + p.championships + '</td>' +
      '<td class="num' + streakClass + '">' + p.currentStreak + '</td>' +
      '<td class="num">' + p.longestStreak + '</td></tr>';
  }).join('');

  return '<table><thead><tr><th>Player</th><th class="num">Pts</th><th class="num">Played</th>' +
    '<th class="num">Win %</th><th class="num">🏆</th><th class="num">Streak</th><th class="num">Best</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

function renderPartnerships(partnershipStats) {
  if (partnershipStats.length === 0) {
    return '<p style="color:var(--ink-soft);font-size:13px;">No partnerships recorded yet.</p>';
  }
  var mostPlayed = partnershipStats.slice().sort(function (a, b) { return b.timesPlayed - a.timesPlayed; })[0];
  var top = partnershipStats.slice(0, 4);

  var topHtml = top.map(function (p) {
    return '<div class="partner-card top"><div><div class="names">' + escapeHtml(p.players[0]) + ' &amp; ' + escapeHtml(p.players[1]) + '</div>' +
      '<div class="sub">' + p.timesPlayed + (p.timesPlayed === 1 ? ' game together' : ' games together') + '</div></div>' +
      '<div class="winrate">' + Math.round(p.winPct * 100) + '%</div></div>';
  }).join('');

  var mostPlayedHtml = '<div class="partner-card most-played"><div><div class="names">' + escapeHtml(mostPlayed.players[0]) + ' &amp; ' + escapeHtml(mostPlayed.players[1]) + '</div>' +
    '<div class="sub">Most-played duo · ' + mostPlayed.timesPlayed + (mostPlayed.timesPlayed === 1 ? ' game together' : ' games together') + '</div></div>' +
    '<div class="winrate">' + Math.round(mostPlayed.winPct * 100) + '%</div></div>';

  return '<div class="partner-grid">' + topHtml + mostPlayedHtml + '</div>';
}

// update module.exports to add renderPlayerStatsTable and renderPartnerships
module.exports = {
  formatDayHeading: formatDayHeading,
  ordinal: ordinal,
  escapeHtml: escapeHtml,
  renderLeaderboard: renderLeaderboard,
  renderDayCard: renderDayCard,
  renderMatchHistory: renderMatchHistory,
  renderPlayerStatsTable: renderPlayerStatsTable,
  renderPartnerships: renderPartnerships
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/render.test.js`
Expected: PASS — `10 passing`

- [ ] **Step 5: Commit**

```bash
git add dev/render.js dev/render.test.js
git commit -m "Add renderPlayerStatsTable and renderPartnerships"
```

---

### Task 11: `renderMatchStats`

**Files:**
- Modify: `dev/render.js`
- Modify: `dev/render.test.js`

**Interfaces:**
- Consumes: `escapeHtml`, `formatDayHeading` (Task 8)
- Produces: `renderMatchStats(matchStats, matchDays):string`

- [ ] **Step 1: Write the failing test**

```js
// append to dev/render.test.js
const { renderMatchStats } = require('./render');

test('renderMatchStats renders tiles and a day-grouped match log with closest/lopsided tags', () => {
  const matchDays = [
    { date: '2026-08-01', teams: [['Ann', 'Bob'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 19 }] },
    { date: '2026-08-02', teams: [['Ann', 'Bob'], ['Cara', 'Dee']], matches: [{ teamA: 0, teamB: 1, scoreA: 21, scoreB: 10 }] }
  ];
  const matchStats = require('./scoring').computeMatchStats(matchDays);
  const html = renderMatchStats(matchStats, matchDays);

  assert.ok(html.includes('Matches logged'));
  assert.ok(html.includes('>2<'));
  assert.ok(html.includes('All Matches (2)'));
  assert.ok(html.includes('closest'));
  assert.ok(html.includes('most lopsided'));
  assert.ok(html.indexOf('Aug 2') < html.indexOf('Aug 1'));
});

test('renderMatchStats handles no matches logged', () => {
  const matchStats = require('./scoring').computeMatchStats([]);
  const html = renderMatchStats(matchStats, []);
  assert.ok(html.includes('—'));
  assert.ok(html.includes('All Matches (0)'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dev/render.test.js`
Expected: FAIL — `renderMatchStats is not a function`

- [ ] **Step 3: Implement `renderMatchStats`**

```js
// add to dev/render.js, above module.exports
function renderStatTile(label, match) {
  if (!match) return '<div class="tile"><div class="label">' + label + '</div><div class="value">—</div></div>';
  var winner = match.scoreA > match.scoreB ? match.teamA : match.teamB;
  var loser = match.scoreA > match.scoreB ? match.teamB : match.teamA;
  return '<div class="tile"><div class="label">' + label + '</div>' +
    '<div class="value">' + Math.max(match.scoreA, match.scoreB) + '–' + Math.min(match.scoreA, match.scoreB) + '</div>' +
    '<div class="detail">' + escapeHtml(winner[0]) + ' &amp; ' + escapeHtml(winner[1]) + ' vs. ' + escapeHtml(loser[0]) + ' &amp; ' + escapeHtml(loser[1]) + '</div></div>';
}

function sameTeams(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function renderMatchLog(matchDays, matchStats) {
  var sorted = matchDays.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var groups = sorted.map(function (day) {
    var rowsHtml = day.matches.map(function (m) {
      var teamA = day.teams[m.teamA], teamB = day.teams[m.teamB];
      var aWon = m.scoreA > m.scoreB;
      var winner = aWon ? teamA : teamB, loser = aWon ? teamB : teamA;
      var winScore = Math.max(m.scoreA, m.scoreB), loseScore = Math.min(m.scoreA, m.scoreB);
      var margin = winScore - loseScore;
      var tag;
      if (matchStats.closest && matchStats.closest.date === day.date && matchStats.closest.margin === margin &&
          sameTeams(matchStats.closest.teamA, teamA) && sameTeams(matchStats.closest.teamB, teamB)) {
        tag = '<span class="match-margin closest">+' + margin + ' · closest</span>';
      } else if (matchStats.mostLopsided && matchStats.mostLopsided.date === day.date && matchStats.mostLopsided.margin === margin &&
          sameTeams(matchStats.mostLopsided.teamA, teamA) && sameTeams(matchStats.mostLopsided.teamB, teamB)) {
        tag = '<span class="match-margin lopsided">+' + margin + ' · most lopsided</span>';
      } else {
        tag = '<span class="match-margin">+' + margin + '</span>';
      }

      return '<div class="match-row"><span class="match-teams"><span class="win">' + escapeHtml(winner[0]) + ' &amp; ' + escapeHtml(winner[1]) +
        '</span><span class="vs">def.</span><span class="lose">' + escapeHtml(loser[0]) + ' &amp; ' + escapeHtml(loser[1]) + '</span></span>' +
        '<span class="match-score">' + winScore + '–' + loseScore + '</span>' + tag + '</div>';
    }).join('');

    return '<div class="match-day-group"><div class="match-day-label">' + formatDayHeading(day.date) + '</div>' + rowsHtml + '</div>';
  }).join('');

  return '<div class="match-log"><div class="match-log-head">All Matches (' + matchStats.totalMatches + ')</div>' + groups + '</div>';
}

function renderMatchStats(matchStats, matchDays) {
  var tiles = '<div class="tile-row">' +
    '<div class="tile"><div class="label">Matches logged</div><div class="value">' + matchStats.totalMatches + '</div></div>' +
    renderStatTile('Closest match', matchStats.closest) +
    renderStatTile('Most lopsided', matchStats.mostLopsided) +
    '<div class="tile"><div class="label">Avg. margin</div><div class="value">' + matchStats.avgMargin + ' pts</div></div>' +
    '</div>';

  return tiles + renderMatchLog(matchDays, matchStats);
}

// update module.exports to add renderMatchStats
module.exports = {
  formatDayHeading: formatDayHeading,
  ordinal: ordinal,
  escapeHtml: escapeHtml,
  renderLeaderboard: renderLeaderboard,
  renderDayCard: renderDayCard,
  renderMatchHistory: renderMatchHistory,
  renderPlayerStatsTable: renderPlayerStatsTable,
  renderPartnerships: renderPartnerships,
  renderMatchStats: renderMatchStats
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dev/render.test.js`
Expected: PASS — `12 passing`. Also run `node --test dev/` to confirm both files together report `24 passing` (12 from scoring.test.js + 12 from render.test.js).

- [ ] **Step 5: Commit**

```bash
git add dev/render.js dev/render.test.js
git commit -m "Add renderMatchStats with tiles and day-grouped match log"
```

---

### Task 12: Assemble `badminton-dash.html` skeleton with real data wiring

**Files:**
- Create: `badminton-dash.html`
- Reference: `dev/reference-mockup.html` (CSS lines 4–626)
- Reference: `dev/scoring.js`, `dev/render.js` (final contents from Tasks 1–11)

**Interfaces:**
- Consumes: every function from `dev/scoring.js` and `dev/render.js`
- Produces: a working page that renders an empty-state leaderboard/tabs/panels from a real (currently empty) `TOURNAMENT_DATA`, ready for Edit Mode to be wired on top of it in later tasks

This task has no automated test — it's verified by loading the page in a browser and checking the console is clean and each tab renders correctly against empty data. Follow the steps exactly; each produces a concrete, checkable result.

- [ ] **Step 1: Create `badminton-dash.html` with charset, viewport, and title**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Badminton Dash</title>
<style>
</style>
</head>
<body>
<div class="shell">
</div>
<script>
</script>
</body>
</html>
```

- [ ] **Step 2: Copy the CSS**

Open `dev/reference-mockup.html`, copy everything between (and including neither of) the `<style>` tag at line 4 and the `</style>` tag at line 626, and paste it inside the empty `<style></style>` block in `badminton-dash.html` from Step 1.

- [ ] **Step 3: Build the page shell (header, leaderboard container, tabs, empty panels)**

Replace the empty `<div class="shell"></div>` with:

```html
<div class="shell">
  <div class="control-zone">
    <header class="top">
      <div class="brand">
        <svg class="mark" viewBox="0 0 24 24" fill="none"><path d="M12 2 L14 9 L21 10.5 L15.5 15 L17 22 L12 18.5 L7 22 L8.5 15 L3 10.5 L10 9 Z" fill="#F2A93C"/></svg>
        <div>
          <h1>Badminton Dash</h1>
          <div class="season" id="seasonLabel">Season 2026 · Sat &amp; Sun</div>
        </div>
      </div>
      <button class="edit-toggle" id="editBtn" type="button">Edit</button>
    </header>

    <p class="section-label">Leaderboard</p>
    <div class="leaderboard" id="leaderboardEl"></div>

    <nav class="tabs" role="tablist" aria-label="Sections">
      <button class="tab-btn active" data-tab="history" role="tab" aria-selected="true">Match History</button>
      <button class="tab-btn" data-tab="players" role="tab" aria-selected="false">Player Stats</button>
      <button class="tab-btn" data-tab="partners" role="tab" aria-selected="false">Partnerships</button>
      <button class="tab-btn" data-tab="matches" role="tab" aria-selected="false">Match Stats</button>
    </nav>
  </div>

  <main>
    <div class="panel active" id="panel-history"></div>
    <div class="panel" id="panel-players"><div class="stats-table" id="playersTableEl"></div></div>
    <div class="panel" id="panel-partners" id="partnersEl"></div>
    <div class="panel" id="panel-matches" id="matchesEl"></div>
  </main>
</div>
```

- [ ] **Step 4: Seed `TOURNAMENT_DATA` and inline `scoring.js` + `render.js`**

Inside the empty `<script></script>` block, add (in this order):

```html
<script id="tournament-data" type="application/json">
{
  "players": ["Anthony", "Harish", "Kartik", "Mahesh", "Shajith", "Shiva", "Vinay", "Yashwant"],
  "matchDays": []
}
</script>
<script>
  var TOURNAMENT_DATA = JSON.parse(document.getElementById('tournament-data').textContent);
</script>
<script>
  // ---- begin dev/scoring.js content (paste verbatim, then delete the trailing module.exports block) ----
  // ---- end dev/scoring.js content ----
</script>
<script>
  // ---- begin dev/render.js content (paste verbatim, but: ----
  //   1. delete the `var scoring = require('./scoring'); ...` lines at the top —
  //      scoring.js's functions are already in scope from the previous inline <script>
  //   2. delete the trailing module.exports block
  // ---- end dev/render.js content ----
</script>
```

Copy the full contents of `dev/scoring.js` into the first block, removing only its `module.exports = {...}` statement (the functions themselves stay — they become global functions in the page). Copy the full contents of `dev/render.js` into the second block, removing its `var scoring = require('./scoring'); var deriveDayResult = ...; var pointsForRank = ...; var computeLeaderboard = ...;` lines (those functions are already globally available from the scoring block above it) and its `module.exports = {...}` statement.

- [ ] **Step 5: Add `renderApp()` and tab-switching wiring, then call it on load**

Append to the same `<script>` block, after the pasted `render.js` content:

```js
function renderApp() {
  var playerStats = computePlayerStats(TOURNAMENT_DATA.players, TOURNAMENT_DATA.matchDays);
  var leaderboard = computeLeaderboard(playerStats);
  var partnerships = computePartnershipStats(TOURNAMENT_DATA.matchDays);
  var matchStats = computeMatchStats(TOURNAMENT_DATA.matchDays);

  document.getElementById('leaderboardEl').innerHTML = renderLeaderboard(leaderboard);
  document.getElementById('panel-history').innerHTML = renderMatchHistory(TOURNAMENT_DATA.matchDays);
  document.getElementById('playersTableEl').innerHTML = renderPlayerStatsTable(playerStats);
  document.getElementById('partnersEl').innerHTML = renderPartnerships(partnerships);
  document.getElementById('matchesEl').innerHTML = renderMatchStats(matchStats, TOURNAMENT_DATA.matchDays);
}

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

renderApp();
```

- [ ] **Step 6: Fix the duplicate-`id` bug from Step 3**

The `panel-partners` and `panel-matches` divs in Step 3 each accidentally have two `id` attributes (`id="panel-partners" id="partnersEl"`), which is invalid HTML — only the first `id` wins, so `partnersEl`/`matchesEl` don't actually exist yet. Fix by wrapping each panel's dynamic content in its own inner container:

```html
<div class="panel" id="panel-partners"><div id="partnersEl"></div></div>
<div class="panel" id="panel-matches"><div id="matchesEl"></div></div>
```

- [ ] **Step 7: Verify in a browser**

Serve the file locally (e.g. `python -m http.server 8934` from the repo root) and open `http://localhost:8934/badminton-dash.html`. Confirm:
- No console errors.
- The page title bar shows "Badminton Dash" correctly (not mojibake) — confirms the UTF-8 meta tag is working.
- Leaderboard shows all 8 players tied for 1st place at 0 points each (everyone starts exactly tied, so the leaderboard is not visually empty — this confirms tie-grouping renders correctly even before any match day exists).
- Match History tab shows "No match days recorded yet."
- Player Stats tab shows a table with all 8 players, each row 0 points/0 matches/0%/0/0/0.
- Partnerships tab shows "No partnerships recorded yet."
- Match Stats tab shows the 4 tiles (0 / — / — / 0 pts) and "All Matches (0)".
- All 4 tabs switch correctly.

- [ ] **Step 8: Commit**

```bash
git add badminton-dash.html
git commit -m "Assemble badminton-dash.html skeleton with real (empty) data wiring"
```

---

### Task 13: Edit Mode shell + Manage Players (add name)

**Files:**
- Modify: `badminton-dash.html`
- Reference: `dev/reference-mockup.html` (CSS lines 385–625; roster JS logic lines 1167–1194)

**Interfaces:**
- Consumes: `renderApp()` (Task 12), `TOURNAMENT_DATA.players` (Task 12)
- Produces: a working Edit Mode modal shell with 3 sub-tabs (Add Match Day / Past Days / Players), and a real "add player" flow that mutates `TOURNAMENT_DATA.players`

- [ ] **Step 1: Copy the Edit Mode CSS**

Open `dev/reference-mockup.html`, copy everything from the `/* ---------- edit mode: add match day modal ---------- */` comment (line 385) through the end of the `<style>` block (line 625, i.e. everything up to but not including `</style>`), and paste it at the end of `badminton-dash.html`'s `<style>` block (after the CSS copied in Task 12).

- [ ] **Step 2: Add sub-nav CSS for the modal's 3 sections**

Append to the `<style>` block:

```css
.modal-subnav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid rgba(27, 35, 51, 0.1); }
.modal-subtab { appearance: none; background: none; border: none; color: var(--ink-soft); font-family: var(--font-body); font-size: 12.5px; font-weight: 600; padding: 8px 12px 7px; cursor: pointer; border-bottom: 2px solid transparent; }
.modal-subtab.active { color: var(--amber-deep); border-bottom-color: var(--amber); }
.modal-subpanel { display: none; }
.modal-subpanel.active { display: block; }
```

- [ ] **Step 3: Replace the modal body with the 3-section shell**

Add the modal markup right before `</div>` that closes `.shell` (i.e. as the last child of `.shell`, after `<main>...</main>`):

```html
<div class="modal-backdrop" id="modalBackdrop">
  <div class="modal">
    <div class="modal-head">
      <h2 id="modalTitle">Edit</h2>
      <button class="modal-close" id="modalClose" type="button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <nav class="modal-subnav">
        <button class="modal-subtab active" data-subtab="add" type="button">Add Match Day</button>
        <button class="modal-subtab" data-subtab="past" type="button">Past Days</button>
        <button class="modal-subtab" data-subtab="players" type="button">Players</button>
      </nav>

      <div class="modal-subpanel active" id="subpanel-add">
        <div class="step-block">
          <div class="step-head"><span class="step-title">1. Teams for the day</span></div>
          <div class="date-row">
            <label class="field-label" for="dayDate">Date</label>
            <input type="date" id="dayDate">
          </div>
          <div id="teamRows"></div>
          <button class="btn btn-add" id="addTeamBtn" type="button">+ Add team</button>
        </div>
        <div class="step-block">
          <div class="step-head"><span class="step-title">2. Match scores</span></div>
          <div id="matchSection"></div>
        </div>
        <p class="validation-msg" id="validationMsg"></p>
        <div class="save-confirm" id="saveConfirm">✓ Match day saved.</div>
      </div>

      <div class="modal-subpanel" id="subpanel-past">
        <div id="pastDaysList"></div>
      </div>

      <div class="modal-subpanel" id="subpanel-players">
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
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="exportBtn" type="button">Save &amp; Export</button>
      <button class="btn btn-secondary" id="cancelBtn" type="button">Close</button>
      <button class="btn btn-primary" id="saveBtn" type="button" disabled>Save match day</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Wire the modal open/close and sub-tab switching**

Append to the page's `<script>` block, after `renderApp();`:

```js
var backdrop = document.getElementById('modalBackdrop');

function openModal() {
  backdrop.classList.add('open');
  document.getElementById('saveConfirm').classList.remove('show');
  renderRoster();
}
function closeModal() { backdrop.classList.remove('open'); }

document.getElementById('editBtn').addEventListener('click', openModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });

document.querySelectorAll('.modal-subtab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.modal-subtab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.modal-subpanel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('subpanel-' + btn.dataset.subtab).classList.add('active');
    if (btn.dataset.subtab === 'past') renderPastDaysList();
  });
});

function renderPastDaysList() {
  document.getElementById('pastDaysList').innerHTML = '<p style="color:var(--ink-soft);font-size:13px;">Wired in Task 19.</p>';
}
```

- [ ] **Step 5: Wire Manage Players (add name) to real `TOURNAMENT_DATA.players`**

Append to the same `<script>` block:

```js
function renderRoster() {
  document.getElementById('rosterChips').innerHTML = TOURNAMENT_DATA.players.map(function (name) {
    return '<span class="roster-chip">' + escapeHtml(name) + '</span>';
  }).join('');
}

document.getElementById('addPlayerBtn').addEventListener('click', addPlayer);
document.getElementById('newPlayerInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); addPlayer(); }
});

function addPlayer() {
  var input = document.getElementById('newPlayerInput');
  var msg = document.getElementById('rosterMsg');
  var name = input.value.trim();

  if (!name) { msg.textContent = 'Enter a name.'; msg.classList.remove('ok'); return; }
  var exists = TOURNAMENT_DATA.players.some(function (n) { return n.toLowerCase() === name.toLowerCase(); });
  if (exists) { msg.textContent = name + ' is already on the roster.'; msg.classList.remove('ok'); return; }

  TOURNAMENT_DATA.players.push(name);
  TOURNAMENT_DATA.players.sort(function (a, b) { return a.localeCompare(b); });
  input.value = '';
  msg.textContent = 'Added ' + name + ' to the roster.';
  msg.classList.add('ok');
  renderRoster();
  renderTeamRows();
  renderApp();
}
```

- [ ] **Step 6: Verify in a browser**

Reload the page. Click "Edit" — the modal opens on the "Add Match Day" sub-tab. Click "Players" — roster chips show all 8 seeded names alphabetically. Type "Priya", click "+ Add player" — confirm it's inserted alphabetically between Mahesh and Shajith, the confirmation message shows, and (after closing the modal) the Player Stats tab on the main page now lists 9 players including Priya at 0 points. Reload the page (this resets `TOURNAMENT_DATA` back to the seed, since nothing is persisted yet — that's expected until Task 17).

- [ ] **Step 7: Commit**

```bash
git add badminton-dash.html
git commit -m "Add Edit Mode modal shell with sub-tabs and real player-add wiring"
```

---

### Task 14: Add Match Day — team setup step

**Files:**
- Modify: `badminton-dash.html`
- Reference: `dev/reference-mockup.html` (JS lines 949–1024)

**Interfaces:**
- Consumes: `TOURNAMENT_DATA.players` (Task 12), modal shell (Task 13)
- Produces: `pendingDay` module-level state object `{teams: {a,b}[], matches: {...}}`, `renderTeamRows()`, `teamLabel(i)`, `playerOptions(selected)`

- [ ] **Step 1: Add the pending-day state and player-option/team-label helpers**

Append to the page's `<script>` block:

```js
var pendingDay = {
  teams: [{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }],
  rrMatches: [{ teamA: '', teamB: '', scoreA: '', scoreB: '' }],
  bracket: { sf1: { a: '', b: '' }, sf2: { a: '', b: '' } }
};

var teamRowsEl = document.getElementById('teamRows');
var matchSectionEl = document.getElementById('matchSection');
var saveBtn = document.getElementById('saveBtn');
var validationMsg = document.getElementById('validationMsg');

function resetPendingDay() {
  pendingDay = {
    teams: [{ a: '', b: '' }, { a: '', b: '' }, { a: '', b: '' }],
    rrMatches: [{ teamA: '', teamB: '', scoreA: '', scoreB: '' }],
    bracket: { sf1: { a: '', b: '' }, sf2: { a: '', b: '' } }
  };
  document.getElementById('dayDate').value = new Date().toISOString().slice(0, 10);
}

function playerOptions(selected) {
  return '<option value="">— Select —</option>' + TOURNAMENT_DATA.players.map(function (name) {
    return '<option value="' + escapeHtml(name) + '"' + (name === selected ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
  }).join('');
}

function teamLabel(i) {
  var t = pendingDay.teams[i];
  if (t.a && t.b) return t.a + ' & ' + t.b;
  return 'Team ' + (i + 1) + ' (incomplete)';
}
```

- [ ] **Step 2: Add `renderTeamRows()` and the "+ Add team" wiring**

```js
function renderTeamRows() {
  var chosen = {};
  pendingDay.teams.forEach(function (t) { [t.a, t.b].forEach(function (n) { if (n) chosen[n] = (chosen[n] || 0) + 1; }); });

  teamRowsEl.innerHTML = pendingDay.teams.map(function (t, i) {
    var isDup = (t.a && chosen[t.a] > 1) || (t.b && chosen[t.b] > 1);
    return '<div class="team-edit-row' + (isDup ? ' dup' : '') + '">' +
      '<span class="team-edit-num">' + (i + 1) + '</span>' +
      '<select data-i="' + i + '" data-slot="a" class="team-select">' + playerOptions(t.a) + '</select>' +
      '<select data-i="' + i + '" data-slot="b" class="team-select">' + playerOptions(t.b) + '</select>' +
      '<button class="row-remove" data-remove="' + i + '" type="button" ' + (pendingDay.teams.length <= 3 ? 'disabled' : '') + '>&times;</button>' +
      '</div>';
  }).join('');

  teamRowsEl.querySelectorAll('.team-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var i = +sel.dataset.i, slot = sel.dataset.slot;
      pendingDay.teams[i][slot] = sel.value;
      pendingDay.bracket = { sf1: { a: '', b: '' }, sf2: { a: '', b: '' } };
      pendingDay.rrMatches = [{ teamA: '', teamB: '', scoreA: '', scoreB: '' }];
      renderAddMatchDayForm();
    });
  });
  teamRowsEl.querySelectorAll('[data-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (pendingDay.teams.length <= 3) return;
      pendingDay.teams.splice(+btn.dataset.remove, 1);
      pendingDay.bracket = { sf1: { a: '', b: '' }, sf2: { a: '', b: '' } };
      pendingDay.rrMatches = [{ teamA: '', teamB: '', scoreA: '', scoreB: '' }];
      renderAddMatchDayForm();
    });
  });
}

document.getElementById('addTeamBtn').addEventListener('click', function () {
  pendingDay.teams.push({ a: '', b: '' });
  renderAddMatchDayForm();
});

function renderAddMatchDayForm() {
  renderTeamRows();
  attachValidation();
}
```

- [ ] **Step 3: Reset and render the form each time the modal opens**

Modify `openModal()` from Task 13 to also reset and render the Add Match Day form:

```js
function openModal() {
  backdrop.classList.add('open');
  document.getElementById('saveConfirm').classList.remove('show');
  resetPendingDay();
  renderRoster();
  renderAddMatchDayForm();
}
```

- [ ] **Step 4: Add a placeholder `attachValidation()` (fully implemented in Task 15)**

```js
function attachValidation() {
  saveBtn.disabled = true;
  validationMsg.textContent = '';
}
```

- [ ] **Step 5: Verify in a browser**

Reload, click "Edit" (modal opens with today's date pre-filled and 3 empty team rows). Use the dropdowns to pick 4 distinct players for team 1, confirm no `dup` styling appears. Pick the same player for two different teams, confirm both those rows get the coral `dup` outline. Click "+ Add team" repeatedly, confirm new rows appear and the row-remove button is disabled while only 3 rows remain, then enabled once a 4th exists.

- [ ] **Step 6: Commit**

```bash
git add badminton-dash.html
git commit -m "Add match-day team setup step wired to real roster"
```

---

### Task 15: Add Match Day — round-robin match entry + save

**Files:**
- Modify: `badminton-dash.html`
- Reference: `dev/reference-mockup.html` (JS lines 1105–1140, 1143–1165 round-robin validation branch)

**Interfaces:**
- Consumes: `pendingDay`, `renderAddMatchDayForm()`, `teamLabel()` (Task 14); `renderApp()` (Task 12)
- Produces: working round-robin match entry (3 or 5+ teams) and a real "Save match day" that commits into `TOURNAMENT_DATA.matchDays`

- [ ] **Step 1: Add `teamOptionsForBracket` (shared by both round-robin and bracket entry) and the round-robin branch of match-section rendering**

```js
function teamOptionsForBracket(selected, excludeIdx) {
  return '<option value="">— Select —</option>' + pendingDay.teams.map(function (t, i) {
    if (i === excludeIdx) return '';
    return '<option value="' + i + '"' + (String(i) === String(selected) ? ' selected' : '') + '>' + teamLabel(i) + '</option>';
  }).join('');
}

function renderMatchSection() {
  var teamsComplete = pendingDay.teams.every(function (t) { return t.a && t.b; });
  if (!teamsComplete) {
    matchSectionEl.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft);">Finish naming all teams above to enter scores.</p>';
    return;
  }

  if (pendingDay.teams.length === 4) {
    renderBracketMatchSection();
    return;
  }

  var rows = pendingDay.rrMatches.map(function (m, i) {
    return '<div class="rr-match-row">' +
      '<select data-i="' + i + '" data-f="teamA" class="rr-select">' + teamOptionsForBracket(m.teamA) + '</select>' +
      '<input type="number" min="0" placeholder="0" data-i="' + i + '" data-f="scoreA" class="rr-score" value="' + m.scoreA + '">' +
      '<span class="vs-sep">–</span>' +
      '<input type="number" min="0" placeholder="0" data-i="' + i + '" data-f="scoreB" class="rr-score" value="' + m.scoreB + '">' +
      '<select data-i="' + i + '" data-f="teamB" class="rr-select">' + teamOptionsForBracket(m.teamB) + '</select>' +
      '<button class="row-remove" data-rr-remove="' + i + '" type="button">&times;</button>' +
      '</div>';
  }).join('');
  matchSectionEl.innerHTML = rows + '<button class="btn btn-add" id="addMatchBtn" type="button">+ Add match</button>';

  matchSectionEl.querySelectorAll('.rr-select, .rr-score').forEach(function (el) {
    var handler = function () {
      pendingDay.rrMatches[+el.dataset.i][el.dataset.f] = el.value;
      attachValidation();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
  matchSectionEl.querySelectorAll('[data-rr-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      pendingDay.rrMatches.splice(+btn.dataset.rrRemove, 1);
      renderMatchSection();
      attachValidation();
    });
  });
  document.getElementById('addMatchBtn').addEventListener('click', function () {
    pendingDay.rrMatches.push({ teamA: '', teamB: '', scoreA: '', scoreB: '' });
    renderMatchSection();
    attachValidation();
  });
}

function renderBracketMatchSection() {
  matchSectionEl.innerHTML = '<p style="font-size:12.5px;color:var(--ink-soft);">Wired in Task 16.</p>';
}
```

- [ ] **Step 2: Call `renderMatchSection()` from `renderAddMatchDayForm()`**

Update the function from Task 14:

```js
function renderAddMatchDayForm() {
  renderTeamRows();
  renderMatchSection();
  attachValidation();
}
```

- [ ] **Step 3: Implement full `attachValidation()` (round-robin branch complete, bracket branch stubbed for Task 16)**

Replace the placeholder from Task 14:

```js
function attachValidation() {
  var teamsComplete = pendingDay.teams.every(function (t) { return t.a && t.b; });
  var chosen = {};
  pendingDay.teams.forEach(function (t) { [t.a, t.b].forEach(function (n) { if (n) chosen[n] = (chosen[n] || 0) + 1; }); });
  var hasDup = Object.keys(chosen).some(function (k) { return chosen[k] > 1; });

  var msg = '';
  var ok = true;

  if (!teamsComplete) { msg = 'Finish selecting both players for every team.'; ok = false; }
  else if (hasDup) { msg = 'A player is on more than one team — fix before saving.'; ok = false; }
  else if (pendingDay.teams.length === 4) {
    var b = pendingDay.bracket;
    var hasFinal = b.final && b.final.scoreA !== '' && b.final.scoreA !== undefined && b.final.scoreB !== '' && b.final.scoreB !== undefined;
    var hasThird = b.thirdPlace && b.thirdPlace.scoreA !== '' && b.thirdPlace.scoreA !== undefined && b.thirdPlace.scoreB !== '' && b.thirdPlace.scoreB !== undefined;
    if (!hasFinal || !hasThird) { msg = 'Enter Semifinal, Final, and 3rd-Place scores to complete the bracket.'; ok = false; }
  } else {
    var validMatches = pendingDay.rrMatches.filter(function (m) { return m.teamA !== '' && m.teamB !== '' && m.scoreA !== '' && m.scoreB !== ''; });
    if (validMatches.length === 0) { msg = 'Add at least one match with both teams and a score.'; ok = false; }
  }

  validationMsg.textContent = ok ? '' : msg;
  saveBtn.disabled = !ok;
}
```

- [ ] **Step 4: Implement the real "Save match day" handler**

```js
function buildDayTeamsArray() {
  return pendingDay.teams.map(function (t) { return [t.a, t.b]; });
}

function saveMatchDay(matches) {
  var date = document.getElementById('dayDate').value;
  TOURNAMENT_DATA.matchDays.push({
    date: date,
    teams: buildDayTeamsArray(),
    matches: matches
  });
  renderApp();
  document.getElementById('saveConfirm').classList.add('show');
}

saveBtn.addEventListener('click', function () {
  if (pendingDay.teams.length === 4) {
    saveMatchDay(buildBracketMatches());
  } else {
    var matches = pendingDay.rrMatches
      .filter(function (m) { return m.teamA !== '' && m.teamB !== '' && m.scoreA !== '' && m.scoreB !== ''; })
      .map(function (m) { return { teamA: +m.teamA, teamB: +m.teamB, scoreA: +m.scoreA, scoreB: +m.scoreB }; });
    saveMatchDay(matches);
  }
});

function buildBracketMatches() {
  return []; // implemented in Task 16
}
```

- [ ] **Step 5: Verify in a browser**

Reload, click Edit. Leave the default 3 team rows, fill all 6 player slots with 6 distinct players, confirm the match section shows one round-robin row. Fill in Team A, Team B, and a score (e.g. 21-15), confirm "Save match day" becomes enabled. Click "+ Add match", add a second match between two other teams, confirm both are required to have valid data or the button disables correctly if one is left incomplete then re-enables once filled. Click "Save match day" — confirm the confirmation banner shows, and after closing the modal, the Match History tab on the main page shows the new day card with correct ranks/records/points (cross-check the math against Task 2's round-robin logic by hand for the specific scores you entered).

- [ ] **Step 6: Commit**

```bash
git add badminton-dash.html
git commit -m "Add round-robin match entry and real match-day save"
```

---

### Task 16: Add Match Day — bracket match entry

**Files:**
- Modify: `badminton-dash.html`
- Reference: `dev/reference-mockup.html` (JS lines 1032–1104)

**Interfaces:**
- Consumes: `pendingDay.bracket`, `teamLabel()`, `renderMatchSection()`, `attachValidation()` (Tasks 14–15)
- Produces: full bracket match entry (Semifinal 1/2 with auto-derived Semifinal 2 teams, Final/3rd-Place auto-filled from winners/losers), `buildBracketMatches()`

- [ ] **Step 1: Implement `renderBracketMatchSection()`, replacing the Task 15 stub**

```js
function renderBracketMatchSection() {
  var bracket = pendingDay.bracket;
  var sf1a = bracket.sf1.a, sf1b = bracket.sf1.b;
  var remaining = pendingDay.teams.map(function (_, i) { return i; }).filter(function (i) { return String(i) !== String(sf1a) && String(i) !== String(sf1b); });
  var sf1HasScore = bracket.sf1.scoreA !== undefined && bracket.sf1.scoreA !== '' && bracket.sf1.scoreB !== '' && bracket.sf1.scoreB !== undefined;
  var sf2HasScore = bracket.sf2.scoreA !== undefined && bracket.sf2.scoreA !== '' && bracket.sf2.scoreB !== '' && bracket.sf2.scoreB !== undefined;

  var html = '';
  html += '<div class="bracket-match"><div class="stage-label">Semifinal 1</div><div class="vs-line">' +
    '<select id="sf1a">' + teamOptionsForBracket(sf1a, sf1b) + '</select>' +
    '<input type="number" id="sf1sa" min="0" placeholder="0" value="' + (bracket.sf1.scoreA || '') + '">' +
    '<span class="vs-sep">–</span>' +
    '<input type="number" id="sf1sb" min="0" placeholder="0" value="' + (bracket.sf1.scoreB || '') + '">' +
    '</div><div class="vs-line" style="margin-top:6px;">' +
    '<select id="sf1b">' + teamOptionsForBracket(sf1b, sf1a) + '</select><span></span><span></span><span></span></div></div>';

  if (sf1a !== '' && sf1b !== '') {
    var sf2a = remaining[0], sf2b = remaining[1];
    html += '<div class="bracket-match"><div class="stage-label">Semifinal 2</div><div class="vs-line">' +
      '<span class="side-name readonly">' + (sf2a !== undefined ? teamLabel(sf2a) : '—') + '</span>' +
      '<input type="number" id="sf2sa" min="0" placeholder="0" value="' + (bracket.sf2.scoreA || '') + '">' +
      '<span class="vs-sep">–</span>' +
      '<input type="number" id="sf2sb" min="0" placeholder="0" value="' + (bracket.sf2.scoreB || '') + '">' +
      '</div><div class="vs-line" style="margin-top:6px;">' +
      '<span class="side-name readonly">' + (sf2b !== undefined ? teamLabel(sf2b) : '—') + '</span></div></div>';
    bracket.sf2.a = sf2a; bracket.sf2.b = sf2b;
  }

  if (sf1HasScore && sf2HasScore && sf1a !== '' && sf1b !== '') {
    var sf1Winner = (+bracket.sf1.scoreA > +bracket.sf1.scoreB) ? sf1a : sf1b;
    var sf1Loser = (+bracket.sf1.scoreA > +bracket.sf1.scoreB) ? sf1b : sf1a;
    var sf2Winner = (+bracket.sf2.scoreA > +bracket.sf2.scoreB) ? bracket.sf2.a : bracket.sf2.b;
    var sf2Loser = (+bracket.sf2.scoreA > +bracket.sf2.scoreB) ? bracket.sf2.b : bracket.sf2.a;

    html += '<div class="bracket-match derived"><div class="stage-label">Final (auto-filled from semifinal winners)</div><div class="vs-line">' +
      '<span class="side-name readonly">' + teamLabel(sf1Winner) + '</span>' +
      '<input type="number" id="finalsa" min="0" placeholder="0" value="' + (bracket.final && bracket.final.scoreA || '') + '">' +
      '<span class="vs-sep">–</span>' +
      '<input type="number" id="finalsb" min="0" placeholder="0" value="' + (bracket.final && bracket.final.scoreB || '') + '">' +
      '</div><div class="vs-line" style="margin-top:6px;">' +
      '<span class="side-name readonly">' + teamLabel(sf2Winner) + '</span></div></div>';

    html += '<div class="bracket-match derived"><div class="stage-label">3rd-Place Match (auto-filled from semifinal losers)</div><div class="vs-line">' +
      '<span class="side-name readonly">' + teamLabel(sf1Loser) + '</span>' +
      '<input type="number" id="tpsa" min="0" placeholder="0" value="' + (bracket.thirdPlace && bracket.thirdPlace.scoreA || '') + '">' +
      '<span class="vs-sep">–</span>' +
      '<input type="number" id="tpsb" min="0" placeholder="0" value="' + (bracket.thirdPlace && bracket.thirdPlace.scoreB || '') + '">' +
      '</div><div class="vs-line" style="margin-top:6px;">' +
      '<span class="side-name readonly">' + teamLabel(sf2Loser) + '</span></div></div>';
  }

  matchSectionEl.innerHTML = html;

  document.getElementById('sf1a').addEventListener('change', function (e) { bracket.sf1.a = e.target.value; bracket.final = undefined; bracket.thirdPlace = undefined; renderMatchSection(); attachValidation(); });
  document.getElementById('sf1b').addEventListener('change', function (e) { bracket.sf1.b = e.target.value; bracket.final = undefined; bracket.thirdPlace = undefined; renderMatchSection(); attachValidation(); });
  document.getElementById('sf1sa').addEventListener('input', function (e) { bracket.sf1.scoreA = e.target.value; attachValidation(); });
  document.getElementById('sf1sa').addEventListener('change', function (e) { bracket.sf1.scoreA = e.target.value; bracket.final = undefined; bracket.thirdPlace = undefined; renderMatchSection(); attachValidation(); });
  document.getElementById('sf1sb').addEventListener('input', function (e) { bracket.sf1.scoreB = e.target.value; attachValidation(); });
  document.getElementById('sf1sb').addEventListener('change', function (e) { bracket.sf1.scoreB = e.target.value; bracket.final = undefined; bracket.thirdPlace = undefined; renderMatchSection(); attachValidation(); });
  var sf2sa = document.getElementById('sf2sa'), sf2sb = document.getElementById('sf2sb');
  if (sf2sa) sf2sa.addEventListener('input', function (e) { bracket.sf2.scoreA = e.target.value; attachValidation(); });
  if (sf2sa) sf2sa.addEventListener('change', function (e) { bracket.sf2.scoreA = e.target.value; bracket.final = undefined; bracket.thirdPlace = undefined; renderMatchSection(); attachValidation(); });
  if (sf2sb) sf2sb.addEventListener('input', function (e) { bracket.sf2.scoreB = e.target.value; attachValidation(); });
  if (sf2sb) sf2sb.addEventListener('change', function (e) { bracket.sf2.scoreB = e.target.value; bracket.final = undefined; bracket.thirdPlace = undefined; renderMatchSection(); attachValidation(); });
  var fsa = document.getElementById('finalsa'), fsb = document.getElementById('finalsb');
  if (fsa) fsa.addEventListener('input', function (e) { bracket.final = bracket.final || {}; bracket.final.scoreA = e.target.value; attachValidation(); });
  if (fsb) fsb.addEventListener('input', function (e) { bracket.final = bracket.final || {}; bracket.final.scoreB = e.target.value; attachValidation(); });
  var tpa = document.getElementById('tpsa'), tpb = document.getElementById('tpsb');
  if (tpa) tpa.addEventListener('input', function (e) { bracket.thirdPlace = bracket.thirdPlace || {}; bracket.thirdPlace.scoreA = e.target.value; attachValidation(); });
  if (tpb) tpb.addEventListener('input', function (e) { bracket.thirdPlace = bracket.thirdPlace || {}; bracket.thirdPlace.scoreB = e.target.value; attachValidation(); });
}
```

- [ ] **Step 2: Implement `buildBracketMatches()`, replacing the Task 15 stub**

```js
function buildBracketMatches() {
  var b = pendingDay.bracket;
  return [
    { teamA: +b.sf1.a, teamB: +b.sf1.b, scoreA: +b.sf1.scoreA, scoreB: +b.sf1.scoreB, stage: 'semifinal1' },
    { teamA: +b.sf2.a, teamB: +b.sf2.b, scoreA: +b.sf2.scoreA, scoreB: +b.sf2.scoreB, stage: 'semifinal2' },
    { teamA: (+b.sf1.scoreA > +b.sf1.scoreB ? +b.sf1.a : +b.sf1.b), teamB: (+b.sf2.scoreA > +b.sf2.scoreB ? +b.sf2.a : +b.sf2.b), scoreA: +b.final.scoreA, scoreB: +b.final.scoreB, stage: 'final' },
    { teamA: (+b.sf1.scoreA > +b.sf1.scoreB ? +b.sf1.b : +b.sf1.a), teamB: (+b.sf2.scoreA > +b.sf2.scoreB ? +b.sf2.b : +b.sf2.a), scoreA: +b.thirdPlace.scoreA, scoreB: +b.thirdPlace.scoreB, stage: 'thirdPlace' }
  ];
}
```

- [ ] **Step 3: Verify in a browser**

Reload, click Edit, fill in 4 teams (8 distinct players). Confirm the bracket UI appears: Semifinal 1 team pickers, Semifinal 2 auto-shown as read-only once Semifinal 1's two teams are picked. Enter SF1 and SF2 scores, confirm Final and 3rd-Place Match sections appear auto-filled with the correct winner/loser team names (cross-check against the actual scores you entered). Enter Final and 3rd-Place scores, confirm "Save match day" enables. Save, close the modal, and confirm the Match History tab shows the new day card with rank 1/2/3/4 matching the bracket results (not a win-tally computation — verify by picking scores where win-tally would have produced a different order, e.g. give the eventual 3rd-place team more total points across their 2 games than the 2nd-place team, and confirm the *bracket* result still wins out).

- [ ] **Step 4: Commit**

```bash
git add badminton-dash.html
git commit -m "Add bracket match entry (Semifinal/Final/3rd-Place) with auto-fill"
```

---

### Task 17: `localStorage` persistence

**Files:**
- Modify: `badminton-dash.html`

**Interfaces:**
- Consumes: `TOURNAMENT_DATA`, `renderApp()` (Task 12)
- Produces: `persistToLocalStorage()`, load-time restore with a dismissible banner

- [ ] **Step 1: Add a save-to-localStorage helper, called after every mutation**

Append to the `<script>` block:

```js
var LOCAL_STORAGE_KEY = 'badminton-dash-data';

function persistToLocalStorage() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(TOURNAMENT_DATA));
  } catch (e) {
    // localStorage unavailable (private browsing, storage full, etc.) — safety net only, not fatal
  }
}
```

- [ ] **Step 2: Call it from every place `TOURNAMENT_DATA` is mutated**

Add `persistToLocalStorage();` immediately after each of these existing lines:
- In `addPlayer()` (Task 13): right after `TOURNAMENT_DATA.players.sort(...)`.
- In `saveMatchDay()` (Task 15): right after `TOURNAMENT_DATA.matchDays.push(...)`.

- [ ] **Step 3: Restore from `localStorage` on load, with a dismissible banner**

Replace the `TOURNAMENT_DATA` initialization from Task 12:

```js
var TOURNAMENT_DATA = JSON.parse(document.getElementById('tournament-data').textContent);
var restoredFromLocalStorage = false;
try {
  var saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (saved) {
    TOURNAMENT_DATA = JSON.parse(saved);
    restoredFromLocalStorage = true;
  }
} catch (e) {
  // ignore — fall back to the seeded data above
}
```

Add a banner element right after the opening `<div class="shell">` tag in the HTML:

```html
<div class="shell">
  <div id="restoreBanner" style="display:none;background:var(--amber);color:#4a3007;font-size:12.5px;font-weight:600;padding:8px 16px;text-align:center;">
    Showing unsaved changes recovered from your browser. Use "Save &amp; Export" to make them permanent, or they'll be lost if you clear browser data.
  </div>
```

Show it from the script, right before the `renderApp();` call at the end of Task 12's Step 5:

```js
if (restoredFromLocalStorage) {
  document.getElementById('restoreBanner').style.display = 'block';
}
renderApp();
```

- [ ] **Step 4: Verify in a browser**

Reload the page fresh (clear localStorage first via devtools if it has data from earlier testing: `localStorage.removeItem('badminton-dash-data')`). Add a player and a match day. Reload the page (no navigation away, just refresh) — confirm the amber "recovered" banner appears and the added player/match day are still present. Clear localStorage again and reload — confirm the banner is gone and the page is back to the original 8-player empty-history seed.

- [ ] **Step 5: Commit**

```bash
git add badminton-dash.html
git commit -m "Add localStorage crash-recovery persistence"
```

---

### Task 18: Save & Export

**Files:**
- Modify: `badminton-dash.html`

**Interfaces:**
- Consumes: `TOURNAMENT_DATA` (Task 12), `closeModal()` (Task 13)
- Produces: working "Save & Export" button that downloads an updated, self-contained copy of the file

- [ ] **Step 1: Implement the export handler**

Append to the `<script>` block:

```js
document.getElementById('exportBtn').addEventListener('click', function () {
  var dataScript = document.getElementById('tournament-data');
  dataScript.textContent = JSON.stringify(TOURNAMENT_DATA, null, 2);

  // exportBtn lives inside the modal footer, so the modal (and possibly the
  // save-confirm banner / restore banner) is live in the DOM at the exact
  // moment this fires — clear that transient UI state before snapshotting,
  // or the exported file would open with the modal stuck open.
  closeModal();
  document.getElementById('saveConfirm').classList.remove('show');
  document.getElementById('restoreBanner').style.display = 'none';

  var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  var blob = new Blob([html], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'badminton-dash.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
```

- [ ] **Step 2: Verify in a browser**

Reload the page fresh. Add a match day and a new player through Edit Mode, **then click "Save & Export" while the modal is still open** (this is the only way to reach the button, so it's the real usage path — not an edge case). Confirm a `badminton-dash.html` file downloads. Open the downloaded file directly (double-click, or drag into a browser tab — not via the local dev server, to simulate the real Google Drive / local-file usage pattern). Confirm: **the modal is closed on load, not stuck open** (this is the specific bug the `closeModal()`/banner-clearing calls in Step 1 prevent — verify it, don't just assume it), the added player and match day are present, the leaderboard/stats are correctly computed from them, and clicking "Edit" still works (the exported copy is a fully independent, working file, not just a static snapshot).

- [ ] **Step 3: Commit**

```bash
git add badminton-dash.html
git commit -m "Add Save & Export to download an updated self-contained copy"
```

---

### Task 19: Edit/delete a past match day

**Files:**
- Modify: `badminton-dash.html`

**Interfaces:**
- Consumes: `pendingDay`, `renderAddMatchDayForm()`, `renderMatchSection()` (Tasks 14–16); `TOURNAMENT_DATA.matchDays`, `renderApp()`, `persistToLocalStorage()` (Task 17)
- Produces: a working "Past Days" sub-tab listing every match day with Edit/Delete actions

- [ ] **Step 1: Add CSS for the past-day list rows**

Append to the `<style>` block:

```css
.past-day-row { display: flex; align-items: center; justify-content: space-between; background: var(--card); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
.past-day-row .info { font-size: 13px; }
.past-day-row .info .d { font-weight: 700; }
.past-day-row .info .m { color: var(--ink-soft); font-size: 11.5px; margin-left: 6px; }
.past-day-actions button { margin-left: 6px; }
```

- [ ] **Step 2: Replace the `renderPastDaysList()` stub from Task 13**

```js
var editingDayIndex = null;

function renderPastDaysList() {
  var container = document.getElementById('pastDaysList');
  if (TOURNAMENT_DATA.matchDays.length === 0) {
    container.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;">No match days recorded yet.</p>';
    return;
  }
  var sorted = TOURNAMENT_DATA.matchDays.map(function (d, i) { return { day: d, index: i }; })
    .sort(function (a, b) { return a.day.date < b.day.date ? 1 : a.day.date > b.day.date ? -1 : 0; });

  container.innerHTML = sorted.map(function (entry) {
    return '<div class="past-day-row"><div class="info"><span class="d">' + formatDayHeading(entry.day.date) + '</span>' +
      '<span class="m">' + entry.day.teams.length + ' teams · ' + entry.day.matches.length + ' matches</span></div>' +
      '<div class="past-day-actions">' +
      '<button class="btn btn-secondary" data-edit-day="' + entry.index + '" type="button">Edit</button>' +
      '<button class="btn btn-secondary" data-delete-day="' + entry.index + '" type="button">Delete</button>' +
      '</div></div>';
  }).join('');

  container.querySelectorAll('[data-edit-day]').forEach(function (btn) {
    btn.addEventListener('click', function () { loadDayForEditing(+btn.dataset.editDay); });
  });
  container.querySelectorAll('[data-delete-day]').forEach(function (btn) {
    btn.addEventListener('click', function () { deleteDay(+btn.dataset.deleteDay); });
  });
}

function deleteDay(index) {
  if (!confirm('Delete this match day? This cannot be undone.')) return;
  TOURNAMENT_DATA.matchDays.splice(index, 1);
  persistToLocalStorage();
  renderApp();
  renderPastDaysList();
}
```

- [ ] **Step 3: Implement "load for editing" — populate `pendingDay` from an existing day and switch to the Add Match Day sub-tab**

```js
function loadDayForEditing(index) {
  editingDayIndex = index;
  var day = TOURNAMENT_DATA.matchDays[index];

  pendingDay = {
    teams: day.teams.map(function (t) { return { a: t[0], b: t[1] }; }),
    rrMatches: [{ teamA: '', teamB: '', scoreA: '', scoreB: '' }],
    bracket: { sf1: { a: '', b: '' }, sf2: { a: '', b: '' } }
  };

  if (day.teams.length === 4 && day.matches.some(function (m) { return m.stage === 'final'; })) {
    var sf1 = day.matches.find(function (m) { return m.stage === 'semifinal1'; });
    var sf2 = day.matches.find(function (m) { return m.stage === 'semifinal2'; });
    var final = day.matches.find(function (m) { return m.stage === 'final'; });
    var third = day.matches.find(function (m) { return m.stage === 'thirdPlace'; });
    pendingDay.bracket.sf1 = { a: String(sf1.teamA), b: String(sf1.teamB), scoreA: sf1.scoreA, scoreB: sf1.scoreB };
    pendingDay.bracket.sf2 = { a: sf2.teamA, b: sf2.teamB, scoreA: sf2.scoreA, scoreB: sf2.scoreB };
    if (final) pendingDay.bracket.final = { scoreA: final.scoreA, scoreB: final.scoreB };
    if (third) pendingDay.bracket.thirdPlace = { scoreA: third.scoreA, scoreB: third.scoreB };
  } else {
    pendingDay.rrMatches = day.matches.map(function (m) {
      return { teamA: String(m.teamA), teamB: String(m.teamB), scoreA: m.scoreA, scoreB: m.scoreB };
    });
  }

  document.getElementById('dayDate').value = day.date;
  document.querySelectorAll('.modal-subtab').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.modal-subpanel').forEach(function (p) { p.classList.remove('active'); });
  document.querySelector('.modal-subtab[data-subtab="add"]').classList.add('active');
  document.getElementById('subpanel-add').classList.add('active');
  document.getElementById('modalTitle').textContent = 'Edit Match Day';
  renderAddMatchDayForm();
}
```

- [ ] **Step 4: Make `saveMatchDay()` update in place when editing, and reset `editingDayIndex`/modal title when starting a fresh Add**

Replace `saveMatchDay()` from Task 15:

```js
function saveMatchDay(matches) {
  var date = document.getElementById('dayDate').value;
  var dayRecord = { date: date, teams: buildDayTeamsArray(), matches: matches };

  if (editingDayIndex !== null) {
    TOURNAMENT_DATA.matchDays[editingDayIndex] = dayRecord;
  } else {
    TOURNAMENT_DATA.matchDays.push(dayRecord);
  }

  persistToLocalStorage();
  renderApp();
  document.getElementById('saveConfirm').classList.add('show');
  editingDayIndex = null;
  document.getElementById('modalTitle').textContent = 'Edit';
}
```

Update `openModal()` (Task 13) to also clear `editingDayIndex` when opening fresh:

```js
function openModal() {
  backdrop.classList.add('open');
  document.getElementById('saveConfirm').classList.remove('show');
  editingDayIndex = null;
  document.getElementById('modalTitle').textContent = 'Edit';
  resetPendingDay();
  renderRoster();
  renderAddMatchDayForm();
}
```

- [ ] **Step 5: Verify in a browser**

Reload, add two match days (one round-robin, one bracket) through normal Add Match Day flow. Open Edit → "Past Days" — confirm both are listed with correct date/team/match counts, most recent first. Click "Edit" on the bracket day — confirm it switches to "Add Match Day" pre-filled with the same 4 teams and the bracket scores already entered, modal title reads "Edit Match Day". Change one score and save — confirm the Match History tab reflects the updated score/ranks (and that it replaced the old entry rather than adding a duplicate). Go back to "Past Days" and delete the round-robin day — confirm the browser's confirm dialog appears, and after accepting, the day disappears from both the Past Days list and the Match History tab.

- [ ] **Step 6: Commit**

```bash
git add badminton-dash.html
git commit -m "Add edit/delete for past match days"
```

---

### Task 20: Rename a player

**Files:**
- Modify: `badminton-dash.html`

**Interfaces:**
- Consumes: `TOURNAMENT_DATA.players`, `TOURNAMENT_DATA.matchDays`, `renderRoster()`, `renderApp()`, `persistToLocalStorage()`
- Produces: a working rename control that propagates through match-day history

- [ ] **Step 1: Add the rename form markup**

In the "Players" sub-panel (Task 13), right after the closing `</div>` of `add-player-row`'s block (i.e. after the `<p class="roster-msg" id="rosterMsg"></p>` line), add:

```html
<div class="step-block">
  <div class="step-head"><span class="step-title">Rename a player</span></div>
  <div class="add-player-row">
    <select id="renameFromSelect"></select>
    <input type="text" id="renameToInput" placeholder="New name">
    <button class="btn btn-add" id="renameBtn" type="button">Rename</button>
  </div>
  <p class="roster-msg" id="renameMsg"></p>
</div>
```

- [ ] **Step 2: Populate the rename dropdown whenever the roster renders**

Update `renderRoster()` from Task 13:

```js
function renderRoster() {
  document.getElementById('rosterChips').innerHTML = TOURNAMENT_DATA.players.map(function (name) {
    return '<span class="roster-chip">' + escapeHtml(name) + '</span>';
  }).join('');

  document.getElementById('renameFromSelect').innerHTML = TOURNAMENT_DATA.players.map(function (name) {
    return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
  }).join('');
}
```

- [ ] **Step 3: Implement the rename handler, propagating through match-day history**

```js
document.getElementById('renameBtn').addEventListener('click', function () {
  var fromName = document.getElementById('renameFromSelect').value;
  var toInput = document.getElementById('renameToInput');
  var toName = toInput.value.trim();
  var msg = document.getElementById('renameMsg');

  if (!toName) { msg.textContent = 'Enter a new name.'; msg.classList.remove('ok'); return; }
  var exists = TOURNAMENT_DATA.players.some(function (n) { return n.toLowerCase() === toName.toLowerCase() && n !== fromName; });
  if (exists) { msg.textContent = toName + ' is already on the roster.'; msg.classList.remove('ok'); return; }

  TOURNAMENT_DATA.players = TOURNAMENT_DATA.players.map(function (n) { return n === fromName ? toName : n; }).sort(function (a, b) { return a.localeCompare(b); });

  TOURNAMENT_DATA.matchDays.forEach(function (day) {
    day.teams.forEach(function (team) {
      for (var i = 0; i < team.length; i++) {
        if (team[i] === fromName) team[i] = toName;
      }
    });
  });

  toInput.value = '';
  msg.textContent = 'Renamed ' + fromName + ' to ' + toName + '.';
  msg.classList.add('ok');
  persistToLocalStorage();
  renderRoster();
  renderApp();
});
```

- [ ] **Step 4: Verify in a browser**

Reload, add a match day featuring "Mahesh". Open Edit → Players. In the rename form, select "Mahesh" from the dropdown, type "Mahesh K" as the new name, click Rename. Confirm: the roster chips now show "Mahesh K" (alphabetically re-sorted), the rename dropdown reflects it, and the Match History / Player Stats / Partnerships tabs all now show "Mahesh K" instead of "Mahesh" for that player's existing history (points/matches/streaks carried over unchanged — same person, new label). Try renaming to an existing name (e.g. "Shiva") and confirm it's rejected with a message instead of silently merging two players.

- [ ] **Step 5: Commit**

```bash
git add badminton-dash.html
git commit -m "Add player renaming that propagates through match-day history"
```

---

### Task 21: Final manual verification pass

**Files:**
- No file changes expected unless a bug is found; fix in place and re-verify if so.

**Interfaces:**
- Consumes: the complete `badminton-dash.html` from Tasks 12–20

This task walks the spec's full "Testing / verification" checklist end-to-end against the finished file, using a real browser (not the dev test runner).

- [ ] **Step 1: Serve and open the file**

```bash
python -m http.server 8934
```

Open `http://localhost:8934/badminton-dash.html`. Clear any leftover `localStorage` from earlier testing first (`localStorage.removeItem('badminton-dash-data')` in devtools console) so you're starting from the clean 8-player seed.

- [ ] **Step 2: Round-robin ranking across 3, 4 (non-bracket), and 5+ teams**

Add a 3-team day and a 5-team day (both round robin, since only exactly-4-team days get the bracket form), with a mix of scores including one tie-in-standings case (reuse the tie fixture from Task 2's test: two teams with identical wins+diff). Confirm ranks, points, and the leaderboard all update correctly, including 0-point handling below rank 4 (5-team day) and the shared-rank tie badge.

- [ ] **Step 3: Full 4-team bracket**

Add a 4-team day, completing Semifinal 1, Semifinal 2, Final, and 3rd-Place Match. Confirm rank/points come from the bracket results, not a win-tally — verify with scores where the win/diff order would differ from the bracket order (as in Task 16 Step 3).

- [ ] **Step 4: Unresolved round-robin day**

Add a day using the exact fully-tied fixture from Task 2 (3 teams in a symmetric win-loss cycle). Confirm the day appears in Match History with the "Unresolved day — no points awarded" note, and that it still counts toward each participant's matches-played (Player Stats tab) without adding any points.

- [ ] **Step 5: Add/rename mid-session**

Add a new player, then use them in a new match day, then rename them. Confirm alphabetical ordering holds at every step and the renamed history is intact (Task 20 already covers this in detail — this step just confirms it still holds combined with everything else added in this session).

- [ ] **Step 6: Streak logic**

Reconstruct the Task 4 skip-streak fixture (win, skip a week, win again) using real player names through the UI, and confirm the Player Stats tab shows the correct current/longest streak per the skip-doesn't-break-or-extend rule.

- [ ] **Step 7: Partnership and match stats**

Team up the same two players on two different days. Confirm the Partnerships tab aggregates them into one row with the correct win %. Confirm the Match Stats tab's closest/most-lopsided tiles and match log correctly identify the actual closest and most lopsided matches across everything added this session.

- [ ] **Step 8: Export round-trip**

Click "Save & Export", open the downloaded file fresh (not via the dev server — double-click it or drag it into a browser tab), and confirm all data from Steps 2–7 is present and correctly computed, with no data loss.

- [ ] **Step 9: Mobile usability**

Resize the browser to 375px wide (or use devtools device emulation). Confirm: the leaderboard and tab bar remain usable (tabs wrap rather than requiring an undiscoverable horizontal scroll, per the fix already validated in the mockup), match-day cards and the player stats table don't cause horizontal page overflow, and the Edit Mode modal is usable full-screen on a small viewport.

- [ ] **Step 10: Fix any issues found, then final commit**

If Steps 2–9 surface any bugs, fix them in `badminton-dash.html` directly and re-run the relevant step to confirm the fix. Once everything passes:

```bash
git add badminton-dash.html
git commit -m "Fix issues found during final manual verification pass"
```

If no issues were found, no commit is needed for this task.

---

## Self-Review

**Spec coverage:** Purpose/non-goals (single file, no auth, localStorage as safety net) → Global Constraints + Task 17. Data model (players/matchDays/teams/matches/stage) → Tasks 1–3, 12. Scoring (3/2/1/0) → Task 1. Derived stats (points, matches played, championships, win %, streaks) → Task 4. Partnership stats → Task 6. Match stats → Task 7. Leaderboard → Task 5. Edit Mode: Add Match Day (teams + bracket/round-robin) → Tasks 14–16; Edit/delete a past day → Task 19; Manage players (add + rename) → Tasks 13, 20; Save & Export → Task 18. Visual design (palette/type/layout/signature) → Task 12 Step 2 (CSS reuse from the approved mockup) + Task 13 Step 1. UTF-8 requirement → Task 12 Step 1. All of the spec's explicit "Testing / verification" bullets → Task 21.

**Placeholder scan:** No "TBD"/"similar to Task N"/vague instructions remain — every step has complete code or a fully spelled-out manual verification action. The only intentional stubs (`renderBracketMatchSection`, `buildBracketMatches`, `renderPastDaysList` initially returning a "Wired in Task N" message) are deliberate incremental-TDD placeholders that are each replaced with real implementations in their named follow-up task, not left unresolved at the end of the plan.

**Type consistency:** `deriveDayResult`'s return shape (`{rankings, unresolved, pending}`) is used identically in Tasks 4, 6, 9, and 21. `pointsForRank(rank: number|null)` is used identically in Tasks 4 and 9. `computeLeaderboard`'s `{name, points, place, tied}` shape is used identically in Tasks 8 and 10. `pendingDay`'s shape (`{teams, rrMatches, bracket}`) is established in Task 14 and consumed unchanged through Tasks 15, 16, and 19. Function names (`renderAddMatchDayForm`, `renderMatchSection`, `renderTeamRows`, `teamOptionsForBracket`, `attachValidation`, `saveMatchDay`, `buildBracketMatches`, `buildDayTeamsArray`) are spelled identically everywhere they're defined and called across Tasks 13–19.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-13-badminton-tracker-implementation.md`.** Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
