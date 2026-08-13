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
        { teamA: 0, teamB: 1, scoreA: 21, scoreB: 15, stage: "semifinal1" },
        { teamA: 2, teamB: 3, scoreA: 21, scoreB: 18, stage: "semifinal2" },
        { teamA: 0, teamB: 2, scoreA: 19, scoreB: 21, stage: "final" },
        { teamA: 1, teamB: 3, scoreA: 21, scoreB: 17, stage: "thirdPlace" }
        // ...or, for a round-robin day (3 teams, or 5+ teams), matches
        // omit `stage` entirely and are just added one at a time against
        // whichever two teams actually played, in any number
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
- Each match has an optional `stage`: `"semifinal1"`, `"semifinal2"`,
  `"final"`, `"thirdPlace"`, or omitted (round-robin/unstaged). Stage tags
  are only used for **4-team days** that play a bracket, which is the
  normal format when exactly 4 teams show up. 3-team days (no bracket
  possible) and 5+ team days always use round-robin, unstaged matches.
- **Rank is not stored — it's derived** from `matches` each time the page
  loads, using one of two methods depending on what was logged that day:
  - **Bracket ranking** (used whenever a `"final"`-stage match exists for
    the day): the Final's winner is 1st, its loser is 2nd. If a
    `"thirdPlace"`-stage match also exists, its winner is 3rd and its
    loser is 4th. `"semifinal1"`/`"semifinal2"` results aren't needed for
    ranking (the Final/3rd-place results already imply who won each
    semifinal) — they're recorded for match-log/partnership/match-stats
    purposes. A 4-team day always plays a 3rd-place match once a Final is
    played, so an incomplete bracket (Final logged but no 3rd-place match
    yet) simply leaves that day's rank as "not yet finalized" until it's
    added — the UI shouldn't guess at 3rd/4th from semifinal results alone.
  - **Round-robin ranking** (used when no `"final"`-stage match exists,
    i.e. 3-team or 5+-team days): for every team, tally match wins, then
    total point differential (points scored − points conceded across all
    their matches that day) as tiebreak. Sorting descending gives the
    day's 1st, 2nd, 3rd, ... order. If a tiebreak is still exactly equal,
    the tied teams share a rank and both receive that rank's points; the
    next distinct team's rank accounts for the tie-group size (standard
    "1-2-2-4" competition ranking, not "1-2-2-3"). If literally every team
    ends up in one tied group with no separation possible at all, the day
    is **unresolved**: it stays in history and still counts toward
    matches-played, partnership, and match-log stats for everyone who
    played, but nobody earns rank-based points for that day.
- Ranks 1–4 earn points (see below). Teams ranked 5th or lower (only
  possible in round-robin days with 5+ teams) earn 0 points, same as 4th,
  but still count toward matches-played / win-rate / partnership stats.
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
  2. **Log matches** — the form differs by team count:
     - **Exactly 4 teams**: four fixed slots — Semifinal 1, Semifinal 2,
       Final, 3rd-Place Match. Pick the two teams for each semifinal and
       enter its score; once both semifinals have scores, the Final's and
       3rd-Place Match's team slots auto-fill from the winners/losers
       (read-only — no re-picking) and just need scores entered. Rank is
       computed directly from the Final and 3rd-Place results (see Data
       model).
     - **3 teams, or 5+ teams**: repeatable "Add Match" rows — pick any
       two of that day's teams and enter the score, add as many matches
       as were actually played (round robin or partial). Rank is computed
       from wins + point differential.
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

## Visual design — "Night Match" (navy control zone + light content)

**Palette:**
| Token | Hex | Use |
|---|---|---|
| Navy | `#161F38` | Header / leaderboard / tab-bar zone |
| Navy deep | `#0F1526` | Recessed surfaces within the navy zone (leaderboard chips) |
| Paper | `#F2EFE7` | Page content background (below the navy zone) |
| Card white | `#FFFFFF` | Card/table surfaces on the paper background |
| Amber | `#F2A93C` | Brand accent — leader highlight, 1st place, active tab |
| Teal | `#1E9C79` | Semantic positive (win margins, positive streak) |
| Coral | `#E1503F` | Semantic negative (loss margins, destructive actions) |
| Periwinkle | `#A3B0D1` | Secondary text on navy |
| Ink | `#1B2333` | Primary text on light/card surfaces |

Amber is the single decorative accent; teal/coral are semantic only (never
used decoratively) so they stay legible as "good/bad" signals.

**Type:** Bold condensed display face for numerals/headings (scoreboard
feel), clean humanist sans for names/body text. System font stacks only —
no external font loading, since the file must work fully offline from a
local copy or Drive. The file must declare `<meta charset="UTF-8">`
explicitly — without it, special characters used throughout (en dashes,
middle dots) render as mojibake depending on how the file happens to be
served or opened, which surfaced during mockup testing.

**Layout:** A navy "control zone" spans the top of the page and contains,
top to bottom: the page header, a persistent horizontally-scrolling
leaderboard strip (always visible, never buried behind a tab), and a tab
bar — **Match History**, **Player Stats**, **Partnerships**, **Match
Stats**. Only one tab's content is visible at a time, below the navy zone
on the lighter paper background, keeping any single screen focused rather
than one long scroll. Match History shows match days as stacked cards,
most recent first, each showing its ranked teams with an amber accent on
the 1st-place row(s). Match Stats includes both aggregate tiles (total
matches, closest match, most lopsided win, average margin) and a full
day-grouped log of every individual match with its score.

**Signature element:** rank-1 rows get a small custom inline-SVG
shuttlecock mark in amber instead of a generic emoji medal or numbered
badge — ties the scoring visual directly to badminton rather than a
borrowed trophy metaphor.

## Testing / verification

Since this is a static single-file app with no backend, verification is
manual in-browser:
- Define a day with 3 teams, 4 teams, and 5+ teams; log a mix of match
  results (including a tie-in-standings case) and confirm ranks, points,
  and leaderboard all update correctly, including 0-point handling below
  rank 4 and shared-rank point handling.
- Log a full 4-team bracket day (both semifinals, Final, 3rd-Place Match)
  and confirm rank/points come from bracket results, not win-tally.
  Confirm the Final/3rd-Place team slots correctly auto-fill from
  semifinal winners/losers.
- Construct a round-robin day where every team ends up exactly tied with
  no possible separation; confirm the day is recorded (counts toward
  matches played/partnerships) but awards 0 points to everyone.
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
