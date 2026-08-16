# Badminton Dash — Tournament & Normal Games Redesign

**Date:** 2026-08-16
**Status:** Draft

## Problem

The current app has a "match day" model where all matches for a day are entered and saved as a batch. This causes:
1. Data duplication/loss on re-save (the bug the user hit)
2. No visibility of match stages (semifinals, finals) in the UI
3. No way to save progress incrementally — a misclick or navigation loses everything
4. No separation between tournament play (unique teams) and casual games (flexible teams)

## Solution Overview

Restructure the app into two modes — **Tournament** and **Normal Games** — with per-match saving. Each individual fixture/game is saved immediately to localStorage when its score is entered.

---

## 1. Data Model

### Top-level structure

```json
{
  "players": ["Anthony", "Harish", "Kartik", "Mahesh", "Shajith", "Shiva", "Vinay", "Yashwant"],
  "tournaments": [ /* Tournament objects */ ],
  "normalGames": [ /* NormalGame objects */ ],
  "matchDays": [ /* Legacy — kept for migration, not used after conversion */ ]
}
```

### Tournament object

```json
{
  "id": "t_1723801200000",
  "name": "Saturday Tournament",
  "date": "2026-08-16",
  "teams": [["Anthony", "Shajith"], ["Mahesh", "Harish"], ["Shiva", "Yashwant"]],
  "fixtures": [
    {
      "id": "f_0",
      "teamA": 0,
      "teamB": 1,
      "stage": "group",
      "status": "pending",
      "scoreA": null,
      "scoreB": null
    }
  ]
}
```

- `id`: Timestamp-based unique ID (e.g., `"t_" + Date.now()`)
- `teams`: Array of `[playerA, playerB]` pairs. Player uniqueness enforced (a player can only be on one team within a tournament).
- `fixtures[].stage`: One of `"group"`, `"semifinal"`, `"final"`, `"thirdPlace"`
- `fixtures[].status`: `"pending"` or `"completed"`
- `fixtures[].scoreA/scoreB`: `null` when pending, integer when completed

### NormalGame object

```json
{
  "id": "n_1723801200000",
  "date": "2026-08-16",
  "teamA": ["Anthony", "Harish"],
  "teamB": ["Kartik", "Shiva"],
  "scoreA": 21,
  "scoreB": 18
}
```

- Teams store player names directly (not indices) since there's no shared team roster for casual games.
- No uniqueness constraint — same player can appear on multiple teams across different games.

---

## 2. Navigation Structure

### Top-level tabs (in the navy control zone)

| Tab | Description |
|-----|-------------|
| **Tournament** | Active/past tournaments. Tap one to enter its view. |
| **Normal Games** | Casual match log + stats |
| **Leaderboard** | Season leaderboard from tournament points |
| **Player Stats** | Per-player stats (with toggle for tournament/normal) |
| **Partnerships** | Partnership win rates (with toggle for tournament/normal) |

### Inside a Tournament (sub-sections within the Tournament tab)

| Section | Description |
|---------|-------------|
| **Fixtures** | All matches as cards. Pending = tappable to enter score. Completed = shows score + checkmark. Playable in any order. |
| **Standings** | Live points table — team rankings, W/L, point diff. Updates on each save. |
| **Knockout** | Add Semifinal / Final / 3rd Place fixtures manually. Same card UI. |

---

## 3. Tournament Flow

### Creating a tournament

1. On the Tournament tab, click **"+ New Tournament"** button
2. A form appears (inline, not modal) with:
   - Date picker (defaults to today)
   - Optional tournament name text input
   - Team rows (same UI as current — two player dropdowns per row, min 3 teams)
   - Player uniqueness enforced across teams within the tournament
3. Click **"Generate Fixtures"** — creates all round-robin group stage matchups (each pair plays once)
4. Tournament is saved to localStorage immediately. Fixture list appears.

### Playing games (any order)

1. Fixture cards are listed under the Fixtures section, grouped by stage (Group, then Knockout)
2. Each pending card shows: `Team A vs Team B` · stage label · "Tap to play"
3. Tap any pending card → card expands inline with two score inputs and a **"Save"** button
4. Enter scores → click **"Save"** → fixture status flips to `completed`, card collapses to show final score with a green checkmark
5. Standings table updates immediately
6. The user can play fixtures in any order — game 5 before game 2, etc.

### Adding knockout matches

1. In the **Knockout** section, click **"+ Add Semifinal"**, **"+ Add Final"**, or **"+ Add 3rd Place"**
2. Two team dropdowns appear (populated from the tournament's teams)
3. Select teams → a new fixture card appears with the chosen stage
4. Play it the same way as group fixtures — tap, enter score, save

### Editing fixtures

- **Pending fixture**: Can edit teams or delete it
- **Completed fixture**: Tap to re-open for score editing. Can also delete to reset to pending.
- **Add extra fixtures**: A "+" button allows adding ad-hoc group matches (e.g., a rematch)

### Fixture card visual states

| State | Appearance |
|-------|------------|
| **Pending** | White card, team names, subtle "tap to play" hint |
| **Active** (entering score) | Expanded with score inputs + Save button |
| **Completed** | Green-tinted left border or checkmark badge, scores displayed, slightly muted text |

---

## 4. Normal Games Flow

### Entering a new game

1. On the Normal Games tab, click **"+ New Game"** button
2. Inline form appears with:
   - Date picker (defaults to today)
   - Two team selectors, each with two player dropdowns
   - No uniqueness constraint (same player can be on both teams if desired)
   - Two score inputs
3. Click **"Save"** → game saved immediately to localStorage, appears in match log below

### Match log

- All casual games listed, most recent first
- Each row: team names, score, date, margin
- Same visual style as current match log rows

### Stats (computed from normal games only)

- **Leaderboard**: Win = 3 pts per game won (simple per-game points, no day-ranking)
- **Player Stats**: Games played, wins, win%, current streak, longest streak
- **Partnerships**: Win rates for each pair, most-played duo

---

## 5. Standings Table (Tournament)

Displayed within a tournament view. Updates live as fixtures are completed.

| Column | Description |
|--------|-------------|
| **Rank** | Position based on points, then point diff tiebreaker |
| **Team** | Player A & Player B |
| **P** | Games played (completed fixtures) |
| **W** | Wins |
| **L** | Losses |
| **Diff** | Score differential (total points scored minus conceded) |
| **Pts** | Points: 3 per win, 0 per loss (within group stage) |

Final tournament ranking uses the existing rank-based points system (1st=3, 2nd=2, 3rd=1) for the season leaderboard.

---

## 6. Backward Compatibility & Migration

### Migration from matchDays

On first load, if `matchDays` array has entries:
1. Each match day is converted to a Tournament object
2. All matches become fixtures with `status: "completed"`
3. For the existing Aug 15 data: first 6 matches → `stage: "group"`, last match → `stage: "final"`
4. The original `matchDays` array is cleared after successful migration
5. Migration runs once; the `matchDays` key remains but stays empty

### Export

The "Save & Export" button exports the full data structure (tournaments + normalGames) as JSON embedded in a downloadable copy of the HTML file.

---

## 7. Persistence

- **localStorage key**: `badminton-dash-data` (same as current)
- **Save granularity**: Each individual fixture save / normal game save triggers `persistToLocalStorage()` with the full data object
- **Restore banner**: Same behavior — shows when data is restored from localStorage on load

---

## 8. Scoring Rules

### Tournament group stage standings
- Win = 3 pts, Loss = 0 pts (per fixture, for the standings table within the tournament)
- Tiebreaker: point differential

### Season leaderboard (across tournaments)
- Same as current: 1st place = 3 pts, 2nd = 2 pts, 3rd = 1 pt, 4th+ = 0 pts
- Final tournament placement: if a final was played, the final winner = 1st, loser = 2nd; if a 3rd-place match was played, its winner = 3rd, loser = 4th. If no knockout matches exist, placement comes from group standings (sorted by group pts, then diff).

### Normal games
- Win = 3 pts per game (for the normal games leaderboard)
- No ranking-based points since there's no day/tournament structure

---

## 9. Mobile Considerations

- Fixture cards should be full-width and tappable with comfortable touch targets
- Score inputs should use `inputmode="numeric"` for mobile keyboards
- Standings table should scroll horizontally on narrow screens
- Tab bar should scroll horizontally if it overflows (already implemented)
