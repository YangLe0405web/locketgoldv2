# Locket VIP Unlocked Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, self-hosted, fully unlocked Locket VIP Studio PWA with iOS HTTPS LAN support and WebClip profile installation.

**Architecture:** Express.js backend serving dual HTTP (3000) and persistent Root CA-signed HTTPS (3443) on LAN IP with dynamic iOS `.mobileconfig` generation; mobile-first Vanilla JS SPA frontend (`public/app.js`) handling camera capture, dual cam, video/GIF recording, canvas photobooth compositor (6 layouts, 5 timers), filters, gradient captions, audience picker, feed timeline, memories, and theme customizer.

**Tech Stack:** Node.js, Express, `selfsigned`, `uuid`, `axios`, Vanilla JavaScript (ES Modules), HTML5 Canvas, MediaStream / WebRTC, MediaRecorder.

**Spec:** [docs/superpowers/specs/2026-11-12-locket-vip-unlocked-design.md](file:///d:/locket-vip-clone/docs/superpowers/specs/2026-11-12-locket-vip-unlocked-design.md)

## Global Constraints
- **iOS Safari HTTPS Requirement**: All camera and microphone APIs (`navigator.mediaDevices.getUserMedia`) require a secure context (`https://` or `localhost`).
- **Zero Locked Features**: Dual Cam, GIF, Custom Frames, Photobooth layouts (1×2, 1×3, 1×4, 2×2, 2×3, 3×3) and timers (2s, 3s, 5s, 7s, 10s) must be 100% unlocked with zero donation/paywall prompts.
- **Firebase/Locket Compatibility**: Moment payloads must conform to Locket API V2 requirements (WebP image thumbnail, MD5 hash, Firebase storage resumable upload).
- **Persistent TLS Identity**: TLS certificates must persist in `certs/` on disk so that certificates do not change fingerprints upon server restart.

## Review Focus
1. **iOS WebRTC Insecure Context Failure**: When accessed via LAN IP over HTTP (`http://192.168.x.x`), Safari blocks camera. The server must automatically serve HTTPS on port 3443 and provide certificate installation in `.mobileconfig`.
2. **Camera Hardware Limitation on Dual Cam**: Many mobile devices cannot open front and back cameras simultaneously via two separate MediaStreams. The dual cam engine must gracefully fallback to rapid sequential capture without throwing uncaught runtime errors.
3. **Canvas Memory & Aspect Ratio Distortion**: Photobooth multi-shot grids must preserve 1:1 square aspect ratio without stretching photos across varying device resolutions.
4. **Token Expiration during Long Sessions**: Firebase ID tokens expire after 1 hour. Requests to `/api/post-moment` must automatically refresh expired tokens via `/api/refresh`.
5. **Safari Full-Screen WebClip Profile Rejection**: WebClip XML must include the Root CA payload (`com.apple.security.root`) with valid Base64 DER/PEM encoding to avoid SSL handshake failure in standalone mode.

---

### Task 1: Backend Server HTTPS & Persistent Root CA Architecture

**Files:**
- Modify: `package.json`
- Modify: `server.js`
- Create: `tests/test-server-ssl.js`

**Interfaces:**
- Consumes: `os.networkInterfaces()`, `selfsigned`
- Produces: Persistent `certs/` directory, HTTPS listener on port 3443, HTTP listener on port 3000, updated `/install.mobileconfig` endpoint with `com.apple.security.root` payload.

- [ ] **Step 1: Write the failing test for SSL & MobileConfig generation**

Create `tests/test-server-ssl.js` testing that:
1. `certs/` contains valid PEM cert and key files.
2. The `/install.mobileconfig` endpoint contains both `com.apple.webClip.managed` and `com.apple.security.root` payloads with non-empty certificate data.
3. Server responds on both HTTP and HTTPS ports.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-server-ssl.js`
Expected: FAIL (missing `selfsigned` or cert generation logic).

- [ ] **Step 3: Implement HTTPS & Root CA persistence in `server.js`**

1. Install `selfsigned`: `npm install selfsigned --save`.
2. In `server.js`, implement `ensureCertificates(lanIp)`:
   - Check if `certs/server.crt` and `certs/server.key` exist.
   - If not, generate self-signed cert with SAN containing `lanIp` and `localhost`, save to `certs/`.
3. In `/install.mobileconfig`, embed the cert DER/PEM base64 as a `com.apple.security.root` dict in `PayloadContent` alongside the WebClip dict pointing to `https://${lanIp}:3443`.
4. Listen on both HTTP (PORT || 3000) and HTTPS (3443).

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-server-ssl.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server.js tests/test-server-ssl.js
git commit -m "feat(server): add persistent HTTPS and iOS Root CA mobileconfig"
```

---

### Task 2: PWA HTML Modal Sheets & UI Elements

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Create: `tests/test-dom-structure.js`

**Interfaces:**
- Consumes: DOM elements required by `app.js`
- Produces: HTML structure for Photobooth settings, FX sheet, Frame sheet, Audience selector, Memories view, Messages view, Profile/Themes view.

- [ ] **Step 1: Write the failing test for DOM elements**

Create `tests/test-dom-structure.js` to inspect `public/index.html` and verify existence of required element IDs:
- `#photoboothSheet`, `#fxSheet`, `#frameSheet`, `#audienceSheet`, `#themeSheet`, `#countdownIndicator`
- Layout option buttons: `1x2`, `1x3`, `1x4`, `2x2`, `2x3`, `3x3`
- Timer option buttons: `2s`, `3s`, `5s`, `7s`, `10s`
- Themes in theme picker: `default`, `gold`, `hot-to-go`, `sunrise`, `jewels`, `midnight`, etc.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-dom-structure.js`
Expected: FAIL (missing sheets and buttons).

- [ ] **Step 3: Update `public/index.html` and `public/styles.css`**

1. Add modal sheet templates to `public/index.html`:
   - Photobooth modal with 6 layout choices and 5 countdown timer choices.
   - FX modal with filter presets and adjustment sliders.
   - Custom Frame modal with preset frames + file upload input (`#frameFilePick`).
   - Audience selector sheet with options: "Tất cả bạn bè", "Chỉ mình tôi", and a dynamic friend checklist container.
   - Profile & Themes sheet with 14 theme options.
2. In `public/styles.css`, add styles for the sheets, layout preview cards, timer chips, active states, and theme color variables.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-dom-structure.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/styles.css tests/test-dom-structure.js
git commit -m "feat(ui): add modal sheets and styles for photobooth, fx, frames, and themes"
```

---

### Task 3: Core App State, Auth & Navigation Engine

**Files:**
- Create: `public/app.js`
- Create: `tests/test-app-auth.js`

**Interfaces:**
- Consumes: `/api/login`, `/api/refresh`, `/api/me`, `/api/friends`
- Produces: `window.LocketApp` state manager, session persistence in `localStorage`, tab switching, theme engine.

- [ ] **Step 1: Write the failing test for App State and Auth logic**

Create `tests/test-app-auth.js` testing:
1. Session saving and loading from `localStorage` (`locket_vip_session`).
2. Token expiry check and refresh trigger.
3. Theme switching setting `document.body.dataset.theme`.
4. Navigation switching active views between `feed`, `memories`, `camera`, `messages`, `more`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-app-auth.js`
Expected: FAIL (`public/app.js` not found).

- [ ] **Step 3: Implement Auth, State, Navigation & Themes in `public/app.js`**

1. Define application state: `auth`, `activeView`, `activeTheme`, `friends`, `selectedAudience`.
2. Implement `login(email, password)`, `loginWithJson(jsonString)`, `logout()`.
3. Implement `checkAndRefreshToken()` to guarantee valid ID token before API calls.
4. Implement navigation handler for `.dock button[data-view]` to show/hide sections (`view-feed`, `view-memories`, `view-camera`, `view-messages`, `view-more`).
5. Implement theme switcher for all 14 themes (`default`, `gold`, `hot-to-go`, `sunrise`, `jewels`, `morning-dew`, `sea`, `neptune`, `dreamy-purple`, `orbit`, `pink-candy`, `cloud`, `crystal`, `midnight`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-app-auth.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/app.js tests/test-app-auth.js
git commit -m "feat(app): implement auth state, navigation, and theme switcher"
```

---

### Task 4: Camera Controller, Dual Cam, Video & GIF Engine

**Files:**
- Modify: `public/app.js`
- Create: `tests/test-camera-engine.js`

**Interfaces:**
- Consumes: `navigator.mediaDevices.getUserMedia`, `MediaRecorder`, HTMLVideoElement, HTMLCanvasElement
- Produces: Camera stream management, camera flip, Dual Cam (PiP and Split modes with fallback), video recording with mic audio, burst GIF recording.

- [ ] **Step 1: Write unit tests for camera calculations & GIF sequencing**

Create `tests/test-camera-engine.js` testing:
1. Dual Cam coordinate calculation for PiP mode (bottom-right 34% sub-rect) and Split mode (top 50% / bottom 50%).
2. Video recorder blob handling and base64 conversion.
3. GIF frame capture logic into short looping video stream.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-camera-engine.js`
Expected: FAIL (camera engine functions not exported/implemented).

- [ ] **Step 3: Implement Camera, Dual Cam, Video & GIF in `public/app.js`**

1. `initCamera({ facingMode: 'user' | 'environment', audio: boolean })`.
2. Flip camera button handler (`flipBtn`).
3. Dual Cam mode handler (`dualBtn`): toggle modes `off` -> `pip` -> `split` -> `off`. Support dual hardware streams if available; if second stream fails, set `dualFallback = true` for sequential dual shot.
4. Shutter button handling (`shutter`):
   - Short click: Trigger photo capture or photobooth.
   - Touch/click hold: Start `MediaRecorder` for video recording, show recording animation, stop on release.
5. GIF mode handler (`gifBtn`): Record 2.5s rapid burst via `MediaRecorder` with muted audio, prepare looping payload.
6. File pick handler (`filePick`, `galleryBtn`): Load image or video from device library into preview canvas/video.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-camera-engine.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/app.js tests/test-camera-engine.js
git commit -m "feat(camera): implement camera flip, dual cam, video and gif recording"
```

---

### Task 5: Photobooth Compositor, Overlays & Locket Post Dispatcher

**Files:**
- Modify: `public/app.js`
- Create: `tests/test-photobooth-compositor.js`

**Interfaces:**
- Consumes: Canvas rendering context 2D, `/api/post-moment`, `/api/place`
- Produces: Grid layout algorithms (1×2, 1×3, 1×4, 2×2, 2×3, 3×3), countdown timer, custom frame rendering, gradient caption rendering, moment dispatch to Locket.

- [ ] **Step 1: Write unit tests for photobooth layout calculations & moment payload**

Create `tests/test-photobooth-compositor.js` testing:
1. Grid cell layout calculations for:
   - 1×2: 2 rows, 1 col
   - 1×3: 3 rows, 1 col
   - 1×4: 4 rows, 1 col
   - 2×2: 2 rows, 2 cols
   - 2×3: 3 rows, 2 cols
   - 3×3: 3 rows, 3 cols
2. Overlay text rendering with gradient background.
3. Payload builder verifying correct `thumbnail_url`, `sent_to_all`, and `recipients` formatting.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-photobooth-compositor.js`
Expected: FAIL.

- [ ] **Step 3: Implement Photobooth Compositor, Overlays & Post Dispatcher**

1. Implement `runPhotobooth(layout, timerSeconds)`:
   - Run visual countdown (`#countdownIndicator`) for each shot.
   - Capture N shots sequentially into off-screen canvas buffers.
   - Composite shots into main 1080×1080 canvas using grid math, rounded cell borders, and background color.
2. Implement Custom Frame overlay: draw user-uploaded frame or preset frame PNG over canvas.
3. Implement Caption & Sticker overlay editor: custom caption text, gradient start/end color picker, time/music/place chips.
4. Implement `postMoment()`:
   - Extract WebP image base64 or video base64.
   - Attach audience settings (all friends vs. selected recipients).
   - Call `/api/post-moment` with error handling and feedback notification.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-photobooth-compositor.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/app.js tests/test-photobooth-compositor.js
git commit -m "feat(photobooth): implement 6-layout grid compositor and post moment dispatcher"
```

---

### Task 6: Feed Timeline, Memories & Messages Integration

**Files:**
- Modify: `public/app.js`
- Create: `tests/test-feed-memories.js`

**Interfaces:**
- Consumes: `/api/feed`, `/api/react`, `/api/friends`, `/api/user`
- Produces: Feed timeline UI with moments, emoji reactions, memories streak calendar, messages/friends list.

- [ ] **Step 1: Write unit tests for Feed rendering & reactions**

Create `tests/test-feed-memories.js` testing:
1. Feed moment card DOM generation.
2. Reaction submission payload to `/api/react`.
3. Streak & memories statistics calculation.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test-feed-memories.js`
Expected: FAIL.

- [ ] **Step 3: Implement Feed, Reactions, Memories & Messages in `public/app.js`**

1. In `loadFeed()`: Call `/api/feed`, render moment cards with author photo, moment image/video, caption pill, timestamp, and emoji reaction row (💛, 🔥, 😆, 💬).
2. In `sendReaction(momentUid, emoji)`: Post to `/api/react` and display floating reaction animation.
3. In `loadMemories()`: Display total moments count, current streak days, and calendar date grid.
4. In `loadMessages()`: Fetch friends list via `/api/friends`, display friends with avatar and action to send direct moment.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test-feed-memories.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/app.js tests/test-feed-memories.js
git commit -m "feat(social): implement feed timeline, reactions, memories and messages"
```

---

### Task 7: Full System Integration, Verification & LAN Guide

**Files:**
- Create: `tests/test-e2e-suite.js`
- Create: `README.md`

**Interfaces:**
- Consumes: Endpoints on HTTP 3000 and HTTPS 3443, static PWA files in `public/`.
- Produces: Comprehensive test runner confirming complete server & client integration, updated documentation for LAN IP iPhone setup.

- [ ] **Step 1: Write E2E validation script**

Create `tests/test-e2e-suite.js` running:
1. Server starts and binds ports 3000 and 3443.
2. Cert generation produces valid certificates in `certs/`.
3. `/install.mobileconfig` returns 200 with content-type `application/x-apple-aspen-config` containing valid WebClip and Root CA XML.
4. All static assets (`index.html`, `styles.css`, `app.js`, `manifest.json`, `icon.svg`) return HTTP 200.
5. All 6 photobooth layouts, 5 timers, and 14 themes are accessible without paywall flags.

- [ ] **Step 2: Run test suite**

Run: `node tests/test-e2e-suite.js`
Expected: PASS with 100% checks green.

- [ ] **Step 3: Create User Guide (`README.md`)**

Write step-by-step instructions:
- How to start the server: `npm start`.
- How to connect from iPhone: Open `https://<LAN_IP>:3443` in Safari.
- How to install Profile: Tap "Cài lên iPhone" to download `install.mobileconfig` -> Settings -> Profile Downloaded -> Install -> Open Locket VIP icon on Home Screen.

- [ ] **Step 4: Commit**

```bash
git add tests/test-e2e-suite.js README.md
git commit -m "docs: add comprehensive E2E test suite and iPhone installation guide"
```
