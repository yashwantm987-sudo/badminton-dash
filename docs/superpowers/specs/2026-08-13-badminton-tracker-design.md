# Badminton Tournament Tracker — Design Spec

Date: 2026-08-13

## Purpose

A single self-contained HTML file that tracks a recurring Saturday/Sunday
badminton tournament played by a fixed-but-growable group of friends. Teams
are re-drawn every match day (players don't keep the same partner), so
standings are tracked per-player across all match days, not per-team.

The file's owner (Yashwant) edits results after each match day and
re-uploads the file to Google Drive, where friends view it read-only via a
share link. There is no backend, database, or hosting — the file must be
fully self-contained and work offline.

## Non-goals

- No authentication/password protection on Edit Mode (trusted friend group;
  the "friends only view" boundary is enforced by Yashwant simply not
  sharing edit access to the raw file, not by the app).
- No multi-user concurrent editing / live sync. Only one person (Yashwant)
  edits, at a time, locally.
- No server-side storage. `localStorage` is a crash/reload safety net only,
  never the source of truth.

## Data model

Embedded as a JSON object in a `<script>` tag near the top of the HTML file:

```js
const TOURNAMENT_DATA = {
  players: ["Anthony", "Harish", "Kartik", "Mahesh", "Shajith", "Shiva", "Vinay", "Yashwant"],
  matchDays: [
    {
      date: "2026-08-08", // ISO date; day-of-week derived from it
      teams: [
        ["Yashwant", "Shiva"],
        ["Mahesh", "Vinay"],
        ["Anthony", "Harish"],
        ["Kartik", "Shajith"]
      ],
      matches: [
        { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15 },
        { teamA: 2, teamB: 3, scoreA: 21, scoreB: 18 },
        { teamA: 0, teamB: 2, scoreA: 19, scoreB: 21 }
        // ...as many matches as were actually played that day; round
        // robin or partial schedule both work, since matches are added
        // one at a time against whichever two teams played
      ]
    }
  ]
};
```

Rules:
- `players` is the full roster, always rendered/selected in alphabetical
  order. New players can be added via Edit Mode; they're inserted
  alphabetically and have zero history until they appear in a match day.
- Each match day first defines its **teams** — 3 or more pairs, always
  **exactly 2 players** per team (doubles only). This is a distinct setup
  step done before logging any matches, so match entry can just reference
  "Team 1 vs Team 2" instead of re-picking 4 player names every time.
- `matches` reference teams by index into that day's `teams` array, plus a
  single-game score (`scoreA`, `scoreB`). A day can have any number of
  matches (not all teams need to play each other the same number of times).
- **Rank is not stored — it's derived** from `matches` each time the page
  loads: for every team, tally match wins, then total point differential
  (points scored − points conceded across all their matches that day) as
  tiebreak. Sorting descending gives the day's 1st, 2nd, 3rd, ... order.
  If a tiebreak is still exactly equal, the tied teams share a rank and
  both receive that rank's points; the next distinct team's rank accounts
  for the tie-group size (standard "1-2-2-4" competition ranking, not
  "1-2-2-3").
- Ranks 1–4 earn points (see below). Teams ranked 5th or lower (only
  possible with 5+ teams in a day) earn 0 points, same as 4th, but still
  count toward matches-played / win-rate / partnership stats.
- A player's name is the join key across match days (no separate ID). If a
  name is corrected/renamed via "Manage Players," all historical entries
  referencing the old name are updated so history stays attached to the
  same person.
- All derived stats (points, win %, streaks, partnerships, match stats,
  etc.) are computed from this array on page load — nothing is
  pre-aggregated or stored redundantly, so stats can never drift out of
  sync with the raw log.

## Scoring

- 1st place team: 3 points per player
- 2nd place team: 2 points per player
- 3rd place team: 1 point per player
- 4th place (or lower) team: 0 points per player

## Derived stats (per player)

- **Total points** — sum of points across all match days played.
- **Matches played** — count of match days the player appears in.
- **Championships** — count of rank-1 finishes.
- **Win %** — championships ÷ matches played. "Win" means rank-1 only (not
  podium finishes generally); this keeps "win rate" and "championships"
  semantically the same thing viewed two ways.
- **Current streak** — count of consecutive rank-1 finishes in the most
  recent match days the player participated in, walking backward from
  their latest played day until a non-1st-place finish is hit. Days the
  player did not play are simply not part of their sequence at all (skipped
  match days neither break nor extend a streak — the streak is defined
  purely over the player's own played-days timeline).
- **Longest streak** — the longest such run anywhere in the player's
  played-days timeline, not just the most recent one.

## Partnership stats

For every pair of players who have ever been teamed together (derived from
`teams` entries across all match days, no extra data entry needed): times
played together, wins together (day-rank of 1 for that pairing), and win %
as a duo. Shown as a sortable table, e.g. sortable by "best duo by win %"
or "most-played duo."

## Match stats

Aggregate numbers derived from the raw `matches` list across all days:
total matches logged, closest match (smallest score margin, with the teams
involved), most lopsided win, and average score margin. A lightweight
supplementary section beyond points/rank — not the primary focus of the
page.

## Leaderboard

Sorted by total points descending, tie players shown grouped together
(e.g. "Yashwant & Shiva — tied, 14 pts"). Rendered as a persistent strip
near the top of the page so current standings are visible without
scrolling into match history.

## Edit Mode & export workflow

- An unobtrusive "Edit" toggle (no password) reveals admin controls. This
  is a convenience boundary, not a security boundary.
- **Add Match Day** — two-step form:
  1. **Define teams**: date picker + repeatable "Add Team" rows (minimum
     3), each with two player dropdowns sourced from the roster.
     Validation: no player appears twice in the same day's teams, minimum
     3 teams before moving on.
  2. **Log matches**: once teams exist for the day, repeatable "Add Match"
     rows — pick Team A, Team B (from that day's teams, shown by player
     names for clarity), and enter the score (e.g. 21-15). Add as many
     matches as were actually played. Final ranks and points are computed
     automatically from these once saved (see Data model).
- **Edit / delete a past match day**: pick a day from a list, adjust its
  teams or match scores, or remove the day entirely (for data-entry
  corrections). Ranks/points recompute automatically after any edit.
- **Manage players**: add a new name (inserted alphabetically) or rename an
  existing one (propagates through match history).
- **Save & Export**: serializes the current in-memory `TOURNAMENT_DATA`
  back into the HTML template and triggers a browser download of the
  updated `badminton-tracker.html`. Yashwant re-uploads that file to
  Google Drive, overwriting the previous version. Viewers just reload
  their existing Drive link.
- While Edit Mode is active and unsaved, changes are mirrored to
  `localStorage` as a crash-recovery safety net, but the exported file is
  always the authoritative record.

## Visual design — "Match Card / Scoreboard"

**Palette:**
| Token | Hex | Use |
|---|---|---|
| Court green | `#0B3D2E` | Header/background |
| Chalk white | `#F7F5F0` | Card surfaces |
| Muted gold | `#D4AF37` | 1st place / leader accent |
| Sage | `#8FA998` | Secondary text/dividers |
| Warm red | `#C0392B` | Destructive actions only (delete, in Edit Mode) |

**Type:** Bold condensed display face for numerals/leaderboard (scoreboard
feel), clean humanist sans for names/body text. System font stacks only
(no external font loading — must work fully offline from a local file or
Drive).

**Layout:** Persistent compact leaderboard strip at top. Below it, match
days rendered as stacked cards, most recent first, each showing its ranked
teams with a gold accent on the 1st-place row. Per-player detail stats
(streaks, championships, win %) live in an expandable row or dedicated
"Player Stats" section.

**Signature element:** rank-1 rows get a small custom inline-SVG
shuttlecock mark instead of a generic emoji medal or numbered badge —
ties the scoring visual directly to badminton rather than a borrowed
trophy metaphor.

## Testing / verification

Since this is a static single-file app with no backend, verification is
manual in-browser:
- Define a day with 3 teams, 4 teams, and 5+ teams; log a mix of match
  results (including a tie-in-standings case) and confirm ranks, points,
  and leaderboard all update correctly, including 0-point handling below
  rank 4 and shared-rank point handling.
- Add/rename a player mid-session; confirm alphabetical ordering and that
  renaming propagates through existing match-day and partnership history.
- Verify streak logic against a hand-built scenario: a player who wins,
  skips a week, then wins again should show current streak continuing
  (per the skip-doesn't-break-or-extend rule) — validate against the
  precise definition above with a few constructed edge cases.
- Verify partnership stats: same two players teamed on multiple different
  days should aggregate into one partnership row with correct win %.
- Verify match stats: closest match and most lopsided win correctly
  identify the right teams/scores across a multi-day dataset.
- Export, reopen the downloaded file fresh, confirm all data round-trips
  correctly (no data loss between save and reload).
- Resize to mobile width and confirm the leaderboard and match cards
  remain usable (this will be opened on phones by friends checking Drive).
