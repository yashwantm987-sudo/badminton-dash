# PWA and Google Sheets Sync Implementation Plan

This plan outlines the process of splitting the single-file `badminton-dash.html` into a modular, clean PWA file structure and integrating a robust, offline-first Google Sheets synchronization engine using Google Apps Script.

## User Review Required

> [!IMPORTANT]
> **Google Apps Script Access Control & CORS**
>
> In the design spec, the Google Apps Script Web App was proposed to be deployed with:
> - Execute as: **Me**
> - Who has access: **Anyone with Google account**
>
> **Technical Issue:** Cross-Origin Resource Sharing (CORS) fetches from a PWA cannot follow redirects to the Google Account login page. Because Google Apps Script does not support CORS requests with credentials, a fetch request to an "Anyone with Google account" endpoint will be rejected.
>
> **Recommended Solution:** Deploy the Apps Script Web App with:
> - Execute as: **Me**
> - Who has access: **Anyone**
>
> This allows the PWA to sync directly using normal CORS fetch requests. Security is maintained because the deployment ID is a long, unguessable string in the URL (acting as a private API token/key). Only players with access to this URL (entered in the app) can read or modify the data.

> [!NOTE]
> **Export Button Change**
>
> The "Save & Export" button will be renamed to **"Download Backup"** and will download a raw JSON file containing the full app data (e.g., `badminton-dash-backup.json`) rather than exporting a full, self-contained copy of the HTML file. This keeps the application code cleanly separated from user data.

---

## Open Questions

> [!NOTE]
> **Archiving `badminton-dash.html`**
>
> Should we keep the old `badminton-dash.html` file in the project root as an archive/backup during development, and delete it only after the PWA is fully verified and working?
> *Recommended: Yes, keep it for safety during development.*

---

## Proposed Changes

We will split the application code and implement PWA/Sync features across the following files:

### Application Files

#### [NEW] [index.html](file:///c:/Badminton%20Dash/index.html)
The HTML shell of the application. It will contain:
- PWA `<meta>` viewport, theme color, and mobile tags.
- `<link rel="manifest" href="manifest.json">` for PWA installation.
- `<link rel="stylesheet" href="style.css">` to load styles.
- The base HTML structure (brand header, leaderboard container, tab buttons, main panel containers, edit modal).
- **Setup Overlay HTML:** For first-launch entry of the Apps Script Web App URL.
- **Sync Indicator HTML:** Added to the header (next to the Edit button) to show current sync status (Synced, Pending, Syncing, Error) with interactive tooltips.
- Service Worker registration script.
- Script tags linking to `sync.js` and `app.js` at the end of the `<body>`.

#### [NEW] [style.css](file:///c:/Badminton%20Dash/style.css)
Contains all layout and typography rules extracted from the `<style>` block in `badminton-dash.html`, plus:
- Styling for the **Sync Indicator** (colored status dots, pulsing animations for syncing, and hover tooltips).
- Styling for the **Setup Overlay** (modal background, instructions, text input, validation warnings, and buttons).

#### [NEW] [app.js](file:///c:/Badminton%20Dash/app.js)
Contains all application logic extracted from the inline scripts, including:
- Data structure initialization (loading from `localStorage` under `badminton-dash-data`).
- Game calculations (standings, season leaderboard, player stats, partnership stats).
- UI rendering code (rendering panels, tables, fixture cards, modals).
- Player management (adding players via Edit modal).
- **Modification:** Modify `persistToLocalStorage()` to update the local timestamp and invoke `syncPush()` in the background to sync changes to the cloud.
- **Modification:** Rename the "Save & Export" button behavior to download a JSON file instead of an HTML clone.

---

### PWA & Sync Modules

#### [NEW] [sync.js](file:///c:/Badminton%20Dash/sync.js)
The synchronization engine. It will handle:
- Checking for `badminton-dash-sync` configuration in `localStorage`.
- Displaying the Setup Overlay on first load if not configured.
- Managing setup actions: verifying the user's Apps Script Web App URL using a test GET request, saving it, and dismissing the overlay.
- Implementing the offline-first sync lifecycle:
  - **`syncPull()` (on load):** Fetches the latest JSON from the sheet, compares timestamps, and replaces local data if sheet is newer.
  - **`syncPush()` (on save):** Sends local data to the sheet via POST. If offline/fails, sets `pendingSync: true` and shows the pending indicator.
  - **`online` Event Listener:** Listens for browser connection changes to retry pending pushes.
- Sync Status UI updates (updating classes on the `#syncIndicator` and tooltip text).
- Providing "Setup Sync" and "Disconnect Sync" options inside the Edit Modal.

#### [NEW] [manifest.json](file:///c:/Badminton%20Dash/manifest.json)
Standard PWA manifest defining:
- App identity (`name`, `short_name`, `description`).
- Visual constraints (`display: "standalone"`, `theme_color`, `background_color`).
- Launch URL (`start_url: "/index.html"`).
- Icon set mapping to 192x192 and 512x512 PNG assets.

#### [NEW] [sw.js](file:///c:/Badminton%20Dash/sw.js)
The service worker script:
- Caches all static app shell assets (`index.html`, `style.css`, `app.js`, `sync.js`, `manifest.json`, and icons).
- Implements a cache-first fetch strategy for the static assets to enable instant load times and complete offline capability.
- Explicitly bypasses caching (network-only) for any Google Apps Script API calls to prevent stale data transfers.
- Automatically claims clients on activation to update the app immediately.

---

### Assets and Reference Scripts

#### [NEW] [Code.gs](file:///c:/Badminton%20Dash/Code.gs)
Reference Google Apps Script code to be copy-pasted into the Google Sheet's Apps Script editor:
- Handles `GET` requests: reads cell A1 (JSON string) and B1 (timestamp) and returns them as a JSON response.
- Handles `POST` requests: parses the JSON payload, writes the app state to cell A1, writes an ISO timestamp to cell B1, and returns success with the timestamp.

#### [NEW] [icons/icon-192.png](file:///c:/Badminton%20Dash/icons/icon-192.png)
#### [NEW] [icons/icon-512.png](file:///c:/Badminton%20Dash/icons/icon-512.png)
PNG icon assets for PWA installability, generated and resized from our new custom badminton asset.

---

## Verification Plan

### Automated Tests
*None (Vanilla client-side app).*

### Manual Verification
1. **File Loading & UI Verification:**
   - Launch a local HTTP server (using Python or `npx live-server`).
   - Open the page in a browser and verify all styling and layout elements render exactly like the original app.
2. **First-Launch Setup Overlay:**
   - Verify the "Connect Google Sheets" setup overlay appears when there is no saved configuration.
   - Verify clicking "Use Offline Only" dismisses the overlay and allows normal local operation.
   - Verify the "Setup Sync" button in the Edit modal opens the overlay again.
3. **Apps Script Web App Integration:**
   - Create a Google Sheet and deploy the Apps Script Web App.
   - Enter the Web App URL in the setup input and verify successful connection.
   - Confirm cell A1 and B1 in the Sheet are populated with initial data and timestamps.
4. **Sync Syncing Operations:**
   - Perform updates in the app (e.g., enter a fixture score or add a player) and confirm:
     - The sync indicator shows "Syncing" (pulse), then turns Green ("Synced").
     - The Google Sheet updates automatically with the new data.
   - Simulate offline mode (toggle DevTools network offline) and save a score:
     - Verify the indicator turns Amber ("Pending changes").
     - Toggle network online and verify it pushes automatically, turning Green.
5. **Conflict Resolution & Loading:**
   - Update the data directly in the Sheet and increment the timestamp in cell B1.
   - Reload the app and verify it pulls the newer data, re-renders, and displays the correct sheet state.
6. **PWA Installability & Service Worker:**
   - Audit the PWA configuration in Chrome DevTools (Lighthouse or Application tab) to ensure it satisfies PWA installation criteria.
   - Verify the service worker installs, caches files, and allows the app to load instantly when completely offline.
