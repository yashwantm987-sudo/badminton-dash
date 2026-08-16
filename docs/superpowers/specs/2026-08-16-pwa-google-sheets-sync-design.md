# Badminton Dash — PWA with Google Sheets Sync

**Date:** 2026-08-16
**Status:** Draft

## Problem

The app is a single HTML file using localStorage. Data is trapped on one device — if you open the app on a different phone or browser, it starts empty. There's no way to share live data with the badminton group, and no cloud backup.

## Solution Overview

Convert the app to a PWA hosted on GitHub Pages, with Google Sheets as a cloud backend via Google Apps Script. The app works offline-first (localStorage), syncing to the Sheet in the background. Google login is required for access.

---

## 1. Architecture

Three components:

### PWA (GitHub Pages)
The existing single-file app split into proper static files, served over HTTPS from GitHub Pages. Installable on mobile as a home-screen app.

### Google Apps Script (API)
A small script (~40 lines) deployed as a web app. Acts as a REST API for the Google Sheet. Two endpoints:
- `GET` — reads the JSON blob from Sheet cell A1, returns it
- `POST` — writes incoming JSON to Sheet cell A1, updates timestamp in B1

Deployed with: Execute as "Me" (the Sheet owner), Who has access "Anyone with Google account".

### Google Sheet
A single spreadsheet ("Badminton Dash Data") with one sheet. Cell A1 holds the full app state as a JSON string. Cell B1 holds the last-modified ISO timestamp.

### Data flow

```
User action → localStorage (instant) → render UI
                    ↕ background sync
            Google Apps Script → Google Sheet (cloud)
```

---

## 2. File Structure

```
/
├── index.html          (app HTML shell, links to external JS/CSS)
├── app.js              (all app logic, extracted from inline <script>)
├── style.css           (all CSS, extracted from inline <style>)
├── manifest.json       (PWA manifest)
├── sw.js               (service worker for offline caching)
├── sync.js             (Google Sheet sync module)
├── icons/
│   ├── icon-192.png    (PWA icon, 192x192)
│   └── icon-512.png    (PWA icon, 512x512)
└── Code.gs             (Google Apps Script source, kept in repo for reference)
```

---

## 3. PWA Configuration

### manifest.json
- `name`: "Badminton Dash"
- `short_name`: "BadmintonDash"
- `start_url`: "/index.html"
- `display`: "standalone"
- `background_color`: "#1a1a2e"
- `theme_color`: "#1a1a2e"
- `icons`: 192x192 and 512x512 PNG

### Service Worker (sw.js)
- **Install:** Pre-cache all app files (index.html, app.js, style.css, manifest.json, icons)
- **Fetch strategy:** Cache-first for app shell files (HTML, JS, CSS, icons). Network-only for Apps Script API calls (sync requests should never be cached).
- **Update:** On new version, activate immediately and notify the user to refresh

### index.html additions
- `<link rel="manifest" href="manifest.json">`
- `<meta name="theme-color" content="#1a1a2e">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<link rel="apple-touch-icon" href="icons/icon-192.png">`
- Service worker registration in a `<script>` block

---

## 4. Offline-First Sync Strategy

### On app load
1. Render immediately from localStorage (instant, works offline)
2. In background, fetch latest from Google Sheet via Apps Script GET
3. Compare local `lastModified` timestamp with Sheet's B1 timestamp
4. If Sheet is newer → replace local data, re-render, update local timestamp
5. If local is newer → push local data to Sheet via POST
6. If equal → no action needed

### On every save action
1. Write to localStorage immediately (unchanged from current behavior)
2. Update local `lastModified` timestamp
3. Attempt background POST to Apps Script
4. If online → push succeeds, update sync indicator to "synced"
5. If offline → mark as `pendingSync: true` in localStorage, show "pending" indicator

### When connection returns
Listen for the `online` event. If `pendingSync` is true, push local data to Sheet.

### Conflict resolution
**Last write wins.** The Sheet stores one JSON blob — whichever device writes last overwrites it. This is acceptable because:
- The group is small (8 people)
- They're usually together at the court
- Per-match save means conflicts are rare (saves happen seconds apart, not hours)

### Sync metadata in localStorage
```json
{
  "badminton-dash-sync": {
    "scriptUrl": "https://script.google.com/macros/s/DEPLOY_ID/exec",
    "lastModified": "2026-08-16T10:30:00.000Z",
    "pendingSync": false,
    "lastSyncedAt": "2026-08-16T10:30:00.000Z"
  }
}
```

---

## 5. Sync Indicator UI

A small status icon in the header bar, next to the EDIT button:

| State | Icon | Meaning |
|-------|------|---------|
| Synced | Green dot | Data matches the Sheet |
| Pending | Orange dot | Local changes not yet pushed (offline or in-flight) |
| Error | Red dot | Last sync attempt failed |
| Syncing | Spinner | Sync in progress |

Tapping the indicator shows a tooltip: "Last synced: 2 min ago" or "Offline — will sync when connected".

---

## 6. First-Launch Setup Flow

On first visit (no `scriptUrl` in localStorage):

1. App shows a setup overlay with:
   - Title: "Connect to Google Sheets"
   - Instructions: brief steps to create the Sheet and deploy the script
   - A text input: "Paste your Apps Script URL"
   - A "Connect" button
2. On Connect, the app makes a test GET to the URL
3. If successful → saves the URL, dismisses overlay, starts syncing
4. If the GET triggers Google login → browser redirects to Google OAuth → after login, returns to the app and completes the test
5. If the URL fails → shows an error message, lets user retry

Subsequent visits: the URL is already saved, sync starts automatically. Google login session persists via cookies.

---

## 7. Google Apps Script (Code.gs)

```javascript
var SHEET_NAME = 'Data';

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var data = sheet.getRange('A1').getValue() || '{}';
  var timestamp = sheet.getRange('B1').getValue() || '';
  var result = { data: JSON.parse(data), lastModified: timestamp };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var timestamp = new Date().toISOString();
  sheet.getRange('A1').setValue(JSON.stringify(payload.data));
  sheet.getRange('B1').setValue(timestamp);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, lastModified: timestamp }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Deployment settings:
- Execute as: "Me" (the Sheet owner — Yashwant)
- Who has access: "Anyone with Google account"

---

## 8. Changes to Existing App

### Added
- `sync.js` module with `syncPull()`, `syncPush()`, `initSync()` functions
- Sync indicator element in header
- Setup overlay for first-launch Script URL entry
- Service worker registration
- PWA manifest and icons
- `lastModified` timestamp tracking alongside data saves

### Modified
- `persistToLocalStorage()` — after writing to localStorage, calls `syncPush()` in background
- App initialization — after loading from localStorage, calls `syncPull()` to check for newer Sheet data
- "Save & Export" button → "Download Backup" — exports a JSON file of the current data (not a full HTML copy)
- Data source — the embedded `<script id="tournament-data">` JSON is removed; data comes from localStorage on load, with Sheet as the authoritative cloud copy

### Not changed
- All game logic (tournaments, fixtures, standings, normal games, knockout)
- All UI rendering functions
- All tab navigation
- Per-match save behavior (localStorage first, sync in background)
- Data model shape (tournaments, normalGames, players arrays)

---

## 9. GitHub Pages Deployment

- Push all files to the `gh-pages` branch (or configure GitHub Pages to serve from `main` branch `/docs` folder or root)
- The app is accessible at `https://<username>.github.io/<repo-name>/`
- HTTPS is automatic with GitHub Pages, which is required for service worker and PWA install

---

## 10. Mobile Considerations

- PWA install prompt appears automatically on Android Chrome after visiting twice
- iOS Safari: user taps Share → "Add to Home Screen"
- Standalone display mode hides the browser URL bar
- Theme color matches the app's navy header
- Touch targets and responsive layout are already implemented
- The sync indicator must be visible but not intrusive on small screens
