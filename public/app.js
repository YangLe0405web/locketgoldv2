/**
 * Locket VIP Studio - Client Application Engine
 * Module 1: State, Auth, Navigation & Theme Management
 */

const STORAGE_AUTH_KEY = 'locket_vip_session';
const STORAGE_THEME_KEY = 'locket_vip_theme';

export const StateManager = {
    auth: null,

    saveAuth(authData) {
        if (!authData) return;
        const payload = {
            ...authData,
            expiresAt: authData.expiresAt || (Date.now() + (Number(authData.expiresIn) || 3600) * 1000)
        };
        this.auth = payload;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(payload));
            }
        } catch (_) {}
    },

    getAuth() {
        if (this.auth) return this.auth;
        try {
            if (typeof localStorage !== 'undefined') {
                const stored = localStorage.getItem(STORAGE_AUTH_KEY);
                if (stored) {
                    this.auth = JSON.parse(stored);
                    return this.auth;
                }
            }
        } catch (_) {}
        return null;
    },

    clearAuth() {
        this.auth = null;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(STORAGE_AUTH_KEY);
            }
        } catch (_) {}
    },

    isTokenExpired() {
        const auth = this.getAuth();
        if (!auth) return true;
        const now = Date.now();
        const expiresAt = Number(auth.expiresAt) || 0;
        // Coi như hết hạn nếu còn dưới 30 giây
        return now >= (expiresAt - 30000);
    },

    getTheme() {
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem(STORAGE_THEME_KEY) || 'gold';
            }
        } catch (_) {}
        return 'gold';
    },

    setTheme(theme) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_THEME_KEY, theme);
            }
        } catch (_) {}
    }
};

export function applyTheme(themeName) {
    if (!themeName) return;
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.theme = themeName;
    }
    StateManager.setTheme(themeName);
}

export async function refreshTokenIfNeeded() {
    const auth = StateManager.getAuth();
    if (!auth || !auth.refreshToken) return null;
    if (!StateManager.isTokenExpired()) return auth.idToken;

    try {
        const res = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: auth.refreshToken })
        });
        if (!res.ok) throw new Error('Refresh token error');
        const data = await res.json();
        if (data.idToken) {
            StateManager.saveAuth({
                ...auth,
                idToken: data.idToken,
                refreshToken: data.refreshToken || auth.refreshToken,
                expiresIn: data.expiresIn || 3600
            });
            return data.idToken;
        }
    } catch (err) {
        console.warn('Không thể gia hạn token:', err.message);
    }
    return auth.idToken;
}

export function switchView(targetView) {
    if (typeof document === 'undefined') return;
    const views = ['feed', 'memories', 'camera', 'messages', 'more'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) {
            if (v === targetView) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    const dockButtons = document.querySelectorAll('.dock button[data-view]');
    dockButtons.forEach(btn => {
        if (btn.dataset.view === targetView) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

/**
 * Module 2: Camera Engine, Dual Cam, Video & GIF
 */
export function calculateDualCamLayout(mode, width = 1080, height = 1080) {
    if (mode === 'pip') {
        const subW = Math.round(width * 0.34);
        const subH = Math.round(height * 0.34);
        const margin = 24;
        return {
            mode: 'pip',
            main: { x: 0, y: 0, w: width, h: height },
            sub: { x: width - subW - margin, y: height - subH - margin, w: subW, h: subH, radius: 24 }
        };
    }
    if (mode === 'split') {
        const halfH = Math.round(height / 2);
        return {
            mode: 'split',
            main: { x: 0, y: 0, w: width, h: halfH },
            sub: { x: 0, y: halfH, w: width, h: halfH, radius: 0 }
        };
    }
    return {
        mode: 'single',
        main: { x: 0, y: 0, w: width, h: height }
    };
}

export function computeCoverCrop(srcW, srcH, dstW, dstH) {
    const srcAspect = srcW / srcH;
    const dstAspect = dstW / dstH;
    let sw, sh, sx, sy;

    if (srcAspect > dstAspect) {
        // Source is wider than destination: crop sides
        sh = srcH;
        sw = Math.round(srcH * dstAspect);
        sx = Math.round((srcW - sw) / 2);
        sy = 0;
    } else {
        // Source is taller than destination: crop top/bottom
        sw = srcW;
        sh = Math.round(srcW / dstAspect);
        sx = 0;
        sy = Math.round((srcH - sh) / 2);
    }
    return { sx, sy, sw, sh };
}

export function drawCoverImage(ctx, media, dx, dy, dw, dh, mirror = false) {
    const srcW = media.videoWidth || media.naturalWidth || media.width || dw;
    const srcH = media.videoHeight || media.naturalHeight || media.height || dh;
    const crop = computeCoverCrop(srcW, srcH, dw, dh);

    ctx.save();
    if (mirror) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(media, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, dw, dh);
    } else {
        ctx.drawImage(media, crop.sx, crop.sy, crop.sw, crop.sh, dx, dy, dw, dh);
    }
    ctx.restore();
}

export const CameraEngine = {
    facingMode: 'user',
    dualMode: 'off',
    audioEnabled: true,
    mainStream: null,
    subStream: null,
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],

    cycleDualMode(current = this.dualMode) {
        if (current === 'off') return 'pip';
        if (current === 'pip') return 'split';
        return 'off';
    },

    toggleFacing(current = this.facingMode) {
        return current === 'user' ? 'environment' : 'user';
    },

    async startCamera(videoElement, options = {}) {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) return null;
        this.facingMode = options.facingMode || this.facingMode;
        if (this.mainStream) {
            this.mainStream.getTracks().forEach(t => t.stop());
        }

        const constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: 1080 },
                height: { ideal: 1080 }
            },
            audio: this.audioEnabled
        };

        try {
            this.mainStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoElement) {
                videoElement.srcObject = this.mainStream;
                await videoElement.play().catch(() => {});
            }
            return this.mainStream;
        } catch (err) {
            console.warn('Lỗi mở camera:', err);
            // Fallback audio = false
            if (constraints.audio) {
                constraints.audio = false;
                try {
                    this.mainStream = await navigator.mediaDevices.getUserMedia(constraints);
                    if (videoElement) {
                        videoElement.srcObject = this.mainStream;
                        await videoElement.play().catch(() => {});
                    }
                    return this.mainStream;
                } catch (e) {
                    console.error('Camera fallback thất bại:', e);
                }
            }
            return null;
        }
    },

    async startSubCamera(subVideoElement) {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) return null;
        const subFacing = this.toggleFacing(this.facingMode);
        try {
            this.subStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: subFacing, width: { ideal: 480 }, height: { ideal: 480 } },
                audio: false
            });
            if (subVideoElement) {
                subVideoElement.srcObject = this.subStream;
                await subVideoElement.play().catch(() => {});
            }
            return this.subStream;
        } catch (err) {
            console.warn('Thiết bị không hỗ trợ 2 camera đồng thời (dùng chế độ fallback):', err);
            this.subStream = null;
            return null;
        }
    },

    async captureSequentialDualShot(videoElement, canvasElement) {
        // 1. Capture primary frame
        const primaryCanvas = document.createElement('canvas');
        primaryCanvas.width = 1080;
        primaryCanvas.height = 1080;
        const pCtx = primaryCanvas.getContext('2d');
        const primaryFacing = this.facingMode;
        drawCoverImage(pCtx, videoElement, 0, 0, 1080, 1080, primaryFacing === 'user');

        // 2. Flip camera to opposite facing mode rapidly
        const oppFacing = this.toggleFacing(primaryFacing);
        await this.startCamera(videoElement, { facingMode: oppFacing });
        // Short delay for auto-focus/exposure
        await new Promise(r => setTimeout(r, 450));

        // 3. Capture secondary frame
        const secondaryCanvas = document.createElement('canvas');
        secondaryCanvas.width = 1080;
        secondaryCanvas.height = 1080;
        const sCtx = secondaryCanvas.getContext('2d');
        drawCoverImage(sCtx, videoElement, 0, 0, 1080, 1080, oppFacing === 'user');

        // 4. Switch back to original facing mode
        await this.startCamera(videoElement, { facingMode: primaryFacing });

        // 5. Composite both into final canvas
        const ctx = canvasElement.getContext('2d');
        const layout = calculateDualCamLayout(this.dualMode, 1080, 1080);
        ctx.clearRect(0, 0, 1080, 1080);
        ctx.drawImage(primaryCanvas, layout.main.x, layout.main.y, layout.main.w, layout.main.h);

        const sub = layout.sub;
        ctx.save();
        ctx.beginPath();
        if (sub.radius) {
            ctx.roundRect(sub.x, sub.y, sub.w, sub.h, sub.radius);
        } else {
            ctx.rect(sub.x, sub.y, sub.w, sub.h);
        }
        ctx.clip();
        ctx.drawImage(secondaryCanvas, 0, 0, 1080, 1080, sub.x, sub.y, sub.w, sub.h);
        ctx.restore();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(sub.x, sub.y, sub.w, sub.h);
    },

    stopAll() {
        if (this.mainStream) {
            this.mainStream.getTracks().forEach(t => t.stop());
            this.mainStream = null;
        }
        if (this.subStream) {
            this.subStream.getTracks().forEach(t => t.stop());
            this.subStream = null;
        }
    }
};

/**
 * Module 3: Photobooth Compositor, Overlays & Moment Dispatcher
 */
export function computePhotoboothGrid(layoutKey = '2x2', totalWidth = 1080, totalHeight = 1080, gap = 16, padding = 20) {
    let cols = 2;
    let rows = 2;

    switch (layoutKey) {
        case '1x2': cols = 1; rows = 2; break;
        case '1x3': cols = 1; rows = 3; break;
        case '1x4': cols = 1; rows = 4; break;
        case '2x2': cols = 2; rows = 2; break;
        case '2x3': cols = 2; rows = 3; break;
        case '3x3': cols = 3; rows = 3; break;
        default:    cols = 2; rows = 2; break;
    }

    const availW = totalWidth - (padding * 2) - (gap * (cols - 1));
    const availH = totalHeight - (padding * 2) - (gap * (rows - 1));
    const cellW = Math.floor(availW / cols);
    const cellH = Math.floor(availH / rows);

    const cells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = padding + c * (cellW + gap);
            const y = padding + r * (cellH + gap);
            cells.push({ col: c, row: r, x, y, w: cellW, h: cellH, radius: 18 });
        }
    }

    return { layoutKey, cols, rows, cells, totalWidth, totalHeight, padding, gap };
}

export function buildMomentPayload(options = {}) {
    const {
        idToken = '',
        localId = '',
        imageBase64 = null,
        videoBase64 = null,
        caption = '',
        overlayType = 'standard',
        bgColorStart = '#ff9a9e',
        bgColorEnd = '#fecfef',
        textColor = '#ffffff',
        audience = 'all',
        recipients = [],
        place = ''
    } = options;

    return {
        idToken,
        localId,
        imageBase64,
        videoBase64,
        caption,
        overlayType,
        bgColorStart,
        bgColorEnd,
        textColor,
        place,
        audience,
        recipients: audience === 'selected' ? recipients : []
    };
}

/**
 * Module 4: Feed Timeline, Reactions, Memories & Social
 */
export function formatRelativeTime(epochMs) {
    const diff = Math.max(0, Date.now() - Number(epochMs));
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'Vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    return `${days} ngày trước`;
}

export function buildReactionPayload(idToken, momentUid, reaction) {
    return { idToken, momentUid, reaction };
}

export function computeMemoriesSummary(moments = [], friends = []) {
    const totalLockets = moments.length;
    const totalFriends = friends.length;
    // Tính chuỗi streak giả định hoặc dựa trên ngày
    const daysSet = new Set(
        moments.map(m => new Date(m.created_at || Date.now()).toDateString())
    );
    const streak = Math.max(1, daysSet.size);
    return { totalLockets, totalFriends, streak, daysActive: Array.from(daysSet) };
}

/**
 * Client DOM Controller & Bootstrapper
 */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        initAppUi();
    });
}

export function initAppUi() {
    if (typeof document === 'undefined') return;

    // Elements
    const loginSection = document.getElementById('login');
    const appSection = document.getElementById('app');
    const loginBtn = document.getElementById('loginBtn');
    const jsonBtn = document.getElementById('jsonBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const overlay = document.getElementById('overlay');
    const backVideo = document.getElementById('backVideo');
    const frontVideo = document.getElementById('frontVideo');
    const shotCanvas = document.getElementById('shot');
    const previewVideo = document.getElementById('previewVideo');
    const shutter = document.getElementById('shutter');
    const normalShutterRow = document.getElementById('normalShutterRow');
    const postShutterRow = document.getElementById('postShutterRow');
    const retakeBtn = document.getElementById('retakeBtn');
    const sendBtn = document.getElementById('sendBtn');
    const galleryBtn = document.getElementById('galleryBtn');
    const filePick = document.getElementById('filePick');
    const frameFilePick = document.getElementById('frameFilePick');
    const editorBar = document.getElementById('editorBar');
    const captionInput = document.getElementById('captionInput');
    const countdownIndicator = document.getElementById('countdownIndicator');

    let currentCapturedData = { imageBase64: null, videoBase64: null };
    let currentOverlayType = 'standard';
    let currentCustomFrameImg = null;
    let selectedAudience = 'all';
    let selectedRecipients = [];
    let photoboothConfig = { layout: '2x2', timer: 3 };
    let isGifMode = false;
    let activeFilterCss = 'none';
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordTimer = null;
    let cachedFriends = [];
    let cachedMoments = [];

    // Check Insecure Context (HTTP on LAN IP)
    if (typeof window !== 'undefined' && window.isSecureContext === false && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        const warn = document.createElement('div');
        warn.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff3b30;color:white;padding:10px 14px;font-size:12px;font-weight:700;text-align:center;z-index:9999;';
        warn.innerHTML = `⚠️ Bạn đang dùng HTTP nên iOS chặn Camera. Vui lòng mở <a href="https://${location.hostname}:3443" style="color:#fff;text-decoration:underline;">https://${location.hostname}:3443</a> hoặc Cài Profile iOS!`;
        document.body.appendChild(warn);
    }

    // Apply saved theme
    applyTheme(StateManager.getTheme());

    // Check existing auth
    const auth = StateManager.getAuth();
    if (auth && auth.idToken) {
        showApp();
    } else {
        showLogin();
    }

    function showLogin() {
        loginSection?.classList.remove('hidden');
        appSection?.classList.add('hidden');
        CameraEngine.stopAll();
    }

    async function showApp() {
        loginSection?.classList.add('hidden');
        appSection?.classList.remove('hidden');
        const user = StateManager.getAuth();
        if (user) {
            const meAvatar = document.getElementById('meAvatar');
            const moreAvatar = document.getElementById('moreAvatar');
            const moreName = document.getElementById('moreDisplayName');
            const moreEmail = document.getElementById('moreEmail');
            if (meAvatar && user.photoUrl) meAvatar.src = user.photoUrl;
            if (moreAvatar && user.photoUrl) moreAvatar.src = user.photoUrl;
            if (moreName) moreName.innerText = user.displayName || 'Yang Lee';
            if (moreEmail) moreEmail.innerText = user.email || '';
        }
        await CameraEngine.startCamera(backVideo);
        loadFeed();
        loadFriends();
    }

    // Authenticated Fetch with automatic 401 token refresh retry
    async function authFetch(url, options = {}) {
        let token = await refreshTokenIfNeeded();
        if (!token) {
            const current = StateManager.getAuth();
            token = current?.idToken;
        }
        const bodyObj = options.body ? JSON.parse(options.body) : {};
        bodyObj.idToken = token;

        let res = await fetch(url, {
            ...options,
            body: JSON.stringify(bodyObj)
        });

        if (res.status === 401) {
            // Force refresh token once
            const auth = StateManager.getAuth();
            if (auth?.refreshToken) {
                try {
                    const refRes = await fetch('/api/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken: auth.refreshToken })
                    });
                    const refData = await refRes.json();
                    if (refData.idToken) {
                        StateManager.saveAuth({ ...auth, idToken: refData.idToken });
                        bodyObj.idToken = refData.idToken;
                        res = await fetch(url, {
                            ...options,
                            body: JSON.stringify(bodyObj)
                        });
                    }
                } catch (_) {}
            }
        }
        return res;
    }

    // Login handlers
    loginBtn?.addEventListener('click', async () => {
        const email = document.getElementById('email')?.value.trim();
        const password = document.getElementById('password')?.value;
        const errEl = document.getElementById('loginError');
        if (!email || !password) {
            if (errEl) errEl.innerText = 'Vui lòng nhập email và mật khẩu!';
            return;
        }
        loginBtn.innerText = 'Đang đăng nhập...';
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.idToken) {
                StateManager.saveAuth(data);
                showApp();
            } else {
                if (errEl) errEl.innerText = data.error || 'Đăng nhập thất bại!';
            }
        } catch (e) {
            if (errEl) errEl.innerText = 'Lỗi kết nối máy chủ: ' + e.message;
        } finally {
            loginBtn.innerText = 'Đăng nhập';
        }
    });

    jsonBtn?.addEventListener('click', () => {
        const raw = document.getElementById('jsonInput')?.value.trim();
        try {
            const parsed = JSON.parse(raw);
            const authObj = parsed.user || parsed;
            if (authObj.idToken) {
                StateManager.saveAuth(authObj);
                showApp();
            } else {
                alert('JSON không chứa idToken hợp lệ!');
            }
        } catch (e) {
            alert('JSON không đúng định dạng!');
        }
    });

    logoutBtn?.addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn đăng xuất?')) {
            StateManager.clearAuth();
            showLogin();
        }
    });

    // Navigation Dock
    document.querySelectorAll('.dock button[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
            if (view === 'feed') loadFeed();
            if (view === 'memories') loadMemories();
            if (view === 'messages') loadMessages();
            if (view === 'camera') {
                if (!CameraEngine.mainStream) CameraEngine.startCamera(backVideo);
            }
        });
    });

    // Sheet Helpers
    function openSheet(sheetId) {
        overlay?.classList.remove('hidden');
        document.querySelectorAll('.sheet').forEach(s => s.classList.add('hidden'));
        document.getElementById(sheetId)?.classList.remove('hidden');
    }
    function closeSheets() {
        overlay?.classList.add('hidden');
        document.querySelectorAll('.sheet').forEach(s => s.classList.add('hidden'));
    }
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeSheets();
    });
    document.querySelectorAll('.closeSheetBtn').forEach(btn => {
        btn.addEventListener('click', closeSheets);
    });

    // Topbar & Tool Buttons
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => openSheet('themeSheet'));
    document.getElementById('openThemesBtn')?.addEventListener('click', () => openSheet('themeSheet'));
    document.getElementById('profileBtn')?.addEventListener('click', () => switchView('more'));
    document.getElementById('fxBtn')?.addEventListener('click', () => openSheet('fxSheet'));
    document.getElementById('frameBtn')?.addEventListener('click', () => openSheet('frameSheet'));
    document.getElementById('photoboothBtn')?.addEventListener('click', () => openSheet('photoboothSheet'));
    document.getElementById('audienceBtn')?.addEventListener('click', () => openSheet('audienceSheet'));

    // Flip Camera
    document.getElementById('flipBtn')?.addEventListener('click', async () => {
        CameraEngine.facingMode = CameraEngine.toggleFacing();
        await CameraEngine.startCamera(backVideo);
    });

    // Dual Cam Toggle (off -> pip -> split -> off)
    document.getElementById('dualBtn')?.addEventListener('click', async () => {
        CameraEngine.dualMode = CameraEngine.cycleDualMode();
        document.body.classList.remove('dual-pip', 'dual-split');
        if (CameraEngine.dualMode === 'pip') {
            document.body.classList.add('dual-pip');
            frontVideo?.classList.remove('hidden');
            await CameraEngine.startSubCamera(frontVideo);
        } else if (CameraEngine.dualMode === 'split') {
            document.body.classList.add('dual-split');
            frontVideo?.classList.remove('hidden');
            await CameraEngine.startSubCamera(frontVideo);
        } else {
            frontVideo?.classList.add('hidden');
            if (CameraEngine.subStream) {
                CameraEngine.subStream.getTracks().forEach(t => t.stop());
                CameraEngine.subStream = null;
            }
        }
    });

    // GIF Button
    document.getElementById('gifBtn')?.addEventListener('click', () => {
        isGifMode = !isGifMode;
        const btn = document.getElementById('gifBtn');
        if (isGifMode) {
            btn?.classList.add('on');
            btn.style.background = 'var(--gold)';
            btn.style.color = '#111';
        } else {
            btn?.classList.remove('on');
            btn.style.background = 'rgba(0,0,0,.5)';
            btn.style.color = 'white';
        }
    });

    // Audio Mic toggle
    document.getElementById('micBtn')?.addEventListener('click', () => {
        CameraEngine.audioEnabled = !CameraEngine.audioEnabled;
        const btn = document.getElementById('micBtn');
        if (btn) btn.innerText = CameraEngine.audioEnabled ? '🎤' : '🔇';
    });

    // FX Filters selection wiring
    const filterMap = {
        'none': 'none',
        'fresh': 'contrast(1.08) saturate(1.2) brightness(1.04)',
        'warm': 'sepia(0.2) saturate(1.25) hue-rotate(-10deg)',
        'cold': 'saturate(0.9) hue-rotate(180deg) brightness(1.05)',
        'golden': 'sepia(0.35) contrast(1.1) brightness(1.05)',
        'vintage': 'sepia(0.4) contrast(0.95) saturate(1.1)',
        'noir': 'grayscale(1) contrast(1.4) brightness(0.9)',
        'bw': 'grayscale(1) contrast(1.1)'
    };
    document.querySelectorAll('[data-fx]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-fx]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            const fxKey = btn.dataset.fx;
            activeFilterCss = filterMap[fxKey] || 'none';
            if (backVideo) backVideo.style.filter = activeFilterCss;
            if (shotCanvas) shotCanvas.style.filter = activeFilterCss;
        });
    });

    // Custom Frames wiring
    document.querySelectorAll('[data-frame]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-frame]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            const frameKey = btn.dataset.frame;
            if (frameKey === 'none') {
                currentCustomFrameImg = null;
            } else {
                // Generate SVG preset overlay
                currentCustomFrameImg = createPresetFrame(frameKey);
            }
        });
    });

    function createPresetFrame(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        if (type === 'polaroid') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 1080, 1080);
            ctx.clearRect(40, 40, 1000, 880);
        } else if (type === 'gold') {
            ctx.strokeStyle = '#f5b942';
            ctx.lineWidth = 28;
            ctx.strokeRect(14, 14, 1052, 1052);
        } else if (type === 'film') {
            ctx.fillStyle = '#0a0a0c';
            ctx.fillRect(0, 0, 1080, 60);
            ctx.fillRect(0, 1020, 1080, 60);
            ctx.fillStyle = '#ffffff';
            for (let x = 30; x < 1050; x += 60) {
                ctx.fillRect(x, 15, 30, 30);
                ctx.fillRect(x, 1035, 30, 30);
            }
        } else if (type === 'heart') {
            ctx.strokeStyle = '#ff6b81';
            ctx.lineWidth = 20;
            ctx.strokeRect(10, 10, 1060, 1060);
        }
        return canvas;
    }

    // Upload custom frame PNG/SVG
    document.getElementById('uploadCustomFrameBtn')?.addEventListener('click', () => frameFilePick?.click());
    frameFilePick?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            currentCustomFrameImg = img;
            alert('Đã tải lên khung viền cá nhân thành công!');
            closeSheets();
        };
        img.src = URL.createObjectURL(file);
    });

    // Audience options wiring
    document.querySelectorAll('[data-audience]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-audience]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            selectedAudience = btn.dataset.audience;
            const checkList = document.getElementById('friendCheckList');
            const audienceBtn = document.getElementById('audienceBtn');
            if (selectedAudience === 'selected') {
                checkList?.classList.remove('hidden');
                if (audienceBtn) audienceBtn.innerText = `⭐ Chọn bạn thân`;
            } else if (selectedAudience === 'private') {
                checkList?.classList.add('hidden');
                if (audienceBtn) audienceBtn.innerText = `🔒 Chỉ mình tôi`;
            } else {
                checkList?.classList.add('hidden');
                if (audienceBtn) audienceBtn.innerText = `👥 Tất cả bạn bè`;
            }
        });
    });

    // Friend checklist listener
    document.getElementById('friendCheckList')?.addEventListener('change', (e) => {
        const checked = Array.from(document.querySelectorAll('#friendCheckList input:checked')).map(i => i.value);
        selectedRecipients = checked;
        const audienceBtn = document.getElementById('audienceBtn');
        if (audienceBtn && selectedAudience === 'selected') {
            audienceBtn.innerText = `⭐ ${checked.length} người bạn`;
        }
    });

    // Caption Presets wiring
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            currentOverlayType = btn.dataset.preset;
            if (currentOverlayType === 'time') {
                const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                if (captionInput) captionInput.value = `${nowStr}`;
            } else if (currentOverlayType === 'music') {
                if (captionInput) captionInput.value = `Đang nghe bài hát yêu thích`;
            } else if (currentOverlayType === 'place') {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(async (pos) => {
                        try {
                            const pRes = await fetch(`/api/place?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
                            const pData = await pRes.json();
                            if (pData.label && captionInput) {
                                captionInput.value = pData.label;
                            }
                        } catch (_) {}
                    }, () => {});
                }
            }
        });
    });

    // Download Button
    document.getElementById('downloadBtn')?.addEventListener('click', () => {
        if (!currentCapturedData.imageBase64 && !currentCapturedData.videoBase64) return;
        const a = document.createElement('a');
        if (currentCapturedData.imageBase64) {
            a.href = currentCapturedData.imageBase64;
            a.download = `locket_vip_${Date.now()}.webp`;
        } else if (currentCapturedData.videoBase64) {
            a.href = currentCapturedData.videoBase64;
            a.download = `locket_vip_${Date.now()}.mp4`;
        }
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // Themes selector
    document.querySelectorAll('[data-theme-name]').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.themeName;
            applyTheme(theme);
            document.querySelectorAll('[data-theme-name]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
        });
    });

    // Photobooth layout & timer picker
    document.querySelectorAll('[data-layout]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-layout]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            photoboothConfig.layout = btn.dataset.layout;
        });
    });
    document.querySelectorAll('[data-timer]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-timer]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            photoboothConfig.timer = Number(btn.dataset.timer) || 3;
        });
    });

    // Start Photobooth button
    document.getElementById('startPhotoboothBtn')?.addEventListener('click', async () => {
        closeSheets();
        await runPhotoboothCapture(photoboothConfig.layout, photoboothConfig.timer);
    });

    // Shutter Trigger (Photo, Hold for Video, or GIF)
    shutter?.addEventListener('click', async () => {
        if (CameraEngine.isRecording) return;
        if (isGifMode) {
            await captureGifBurst();
        } else {
            await captureSinglePhoto();
        }
    });

    // Long press shutter for video
    let pressTimer = null;
    shutter?.addEventListener('touchstart', startLongPress);
    shutter?.addEventListener('mousedown', startLongPress);
    shutter?.addEventListener('touchend', endLongPress);
    shutter?.addEventListener('mouseup', endLongPress);

    function startLongPress() {
        pressTimer = setTimeout(async () => {
            await startVideoRec();
        }, 400);
    }
    function endLongPress() {
        clearTimeout(pressTimer);
        if (CameraEngine.isRecording) {
            stopVideoRec();
        }
    }

    async function startVideoRec() {
        if (!CameraEngine.mainStream) return;
        CameraEngine.isRecording = true;
        shutter?.classList.add('rec');
        recordedChunks = [];
        try {
            mediaRecorder = new MediaRecorder(CameraEngine.mainStream, {
                mimeType: MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
            });
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                const videoUrl = URL.createObjectURL(blob);
                const reader = new FileReader();
                reader.onloadend = () => {
                    currentCapturedData.videoBase64 = reader.result;
                    // Chụp 1 ảnh poster từ video
                    captureSinglePhoto(true);
                    showVideoPreview(videoUrl);
                };
                reader.readAsDataURL(blob);
            };
            mediaRecorder.start();
        } catch (err) {
            console.error('Không thể quay video:', err);
            CameraEngine.isRecording = false;
            shutter?.classList.remove('rec');
        }
    }

    function stopVideoRec() {
        CameraEngine.isRecording = false;
        shutter?.classList.remove('rec');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    async function captureGifBurst() {
        if (!CameraEngine.mainStream) return;
        const hint = document.getElementById('camHint');
        if (hint) hint.innerText = '⚡ Đang quay GIF động...';
        await startVideoRec();
        setTimeout(() => {
            stopVideoRec();
            if (hint) hint.innerText = 'Chạm để chụp · Giữ để quay · Dual cam & GIF & Photobooth đã mở';
        }, 2200);
    }

    async function captureSinglePhoto(isPosterOnly = false) {
        if (!backVideo || !shotCanvas) return;
        const ctx = shotCanvas.getContext('2d');
        shotCanvas.width = 1080;
        shotCanvas.height = 1080;

        // Apply active filter
        ctx.filter = activeFilterCss;

        // If Dual Cam active but second stream is null, use sequential dual fallback!
        if (CameraEngine.dualMode !== 'off' && (!CameraEngine.subStream || !frontVideo)) {
            await CameraEngine.captureSequentialDualShot(backVideo, shotCanvas);
        } else {
            const layout = calculateDualCamLayout(CameraEngine.dualMode, 1080, 1080);
            drawCoverImage(ctx, backVideo, 0, 0, layout.main.w, layout.main.h, CameraEngine.facingMode === 'user');

            if (CameraEngine.dualMode !== 'off' && frontVideo && !frontVideo.classList.contains('hidden')) {
                const sub = layout.sub;
                ctx.save();
                ctx.beginPath();
                if (sub.radius) ctx.roundRect(sub.x, sub.y, sub.w, sub.h, sub.radius);
                else ctx.rect(sub.x, sub.y, sub.w, sub.h);
                ctx.clip();
                drawCoverImage(ctx, frontVideo, sub.x, sub.y, sub.w, sub.h, CameraEngine.facingMode !== 'user');
                ctx.restore();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.strokeRect(sub.x, sub.y, sub.w, sub.h);
            }
        }

        // Draw custom frame if active
        if (currentCustomFrameImg) {
            ctx.drawImage(currentCustomFrameImg, 0, 0, 1080, 1080);
        }
        ctx.filter = 'none';

        currentCapturedData.imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);

        if (!isPosterOnly) {
            showShotPreview();
        }
    }

    async function runPhotoboothCapture(layoutKey, timerSeconds) {
        const grid = computePhotoboothGrid(layoutKey, 1080, 1080, 20, 24);
        const ctx = shotCanvas.getContext('2d');
        shotCanvas.width = 1080;
        shotCanvas.height = 1080;
        ctx.fillStyle = '#141416';
        ctx.fillRect(0, 0, 1080, 1080);

        for (let i = 0; i < grid.cells.length; i++) {
            const cell = grid.cells[i];
            // Countdown
            for (let c = timerSeconds; c > 0; c--) {
                if (countdownIndicator) {
                    countdownIndicator.innerText = c;
                    countdownIndicator.classList.remove('hidden');
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            if (countdownIndicator) countdownIndicator.classList.add('hidden');

            // Draw captured frame into cell with object-fit: cover preservation!
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(cell.x, cell.y, cell.w, cell.h, cell.radius || 18);
            ctx.clip();
            ctx.filter = activeFilterCss;
            drawCoverImage(ctx, backVideo, cell.x, cell.y, cell.w, cell.h, CameraEngine.facingMode === 'user');
            ctx.restore();
        }

        // Draw custom frame if active
        if (currentCustomFrameImg) {
            ctx.drawImage(currentCustomFrameImg, 0, 0, 1080, 1080);
        }

        currentCapturedData.imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);
        showShotPreview();
    }

    function showShotPreview() {
        backVideo?.classList.add('hidden');
        frontVideo?.classList.add('hidden');
        previewVideo?.classList.add('hidden');
        shotCanvas?.classList.remove('hidden');
        editorBar?.classList.remove('hidden');
        normalShutterRow?.classList.add('hidden');
        postShutterRow?.classList.remove('hidden');
    }

    function showVideoPreview(url) {
        backVideo?.classList.add('hidden');
        frontVideo?.classList.add('hidden');
        shotCanvas?.classList.add('hidden');
        if (previewVideo) {
            previewVideo.src = url;
            previewVideo.classList.remove('hidden');
            previewVideo.play().catch(() => {});
        }
        editorBar?.classList.remove('hidden');
        normalShutterRow?.classList.add('hidden');
        postShutterRow?.classList.remove('hidden');
    }

    function resetCamView() {
        shotCanvas?.classList.add('hidden');
        previewVideo?.classList.add('hidden');
        editorBar?.classList.add('hidden');
        backVideo?.classList.remove('hidden');
        if (CameraEngine.dualMode !== 'off') frontVideo?.classList.remove('hidden');
        normalShutterRow?.classList.remove('hidden');
        postShutterRow?.classList.add('hidden');
        currentCapturedData = { imageBase64: null, videoBase64: null };
    }

    retakeBtn?.addEventListener('click', resetCamView);
    document.getElementById('resetCamBtn')?.addEventListener('click', () => {
        CameraEngine.startCamera(backVideo);
    });

    // Gallery upload
    galleryBtn?.addEventListener('click', () => filePick?.click());
    filePick?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type.startsWith('video/')) {
            const videoUrl = URL.createObjectURL(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                currentCapturedData.videoBase64 = reader.result;
                showVideoPreview(videoUrl);
            };
            reader.readAsDataURL(file);
        } else {
            const img = new Image();
            img.onload = () => {
                const ctx = shotCanvas.getContext('2d');
                shotCanvas.width = 1080;
                shotCanvas.height = 1080;
                drawCoverImage(ctx, img, 0, 0, 1080, 1080, false);
                currentCapturedData.imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);
                showShotPreview();
            };
            img.src = URL.createObjectURL(file);
        }
    });

    // Send Moment Dispatcher
    sendBtn?.addEventListener('click', async () => {
        const user = StateManager.getAuth();
        if (!user) return alert('Bạn cần đăng nhập lại!');
        if (!currentCapturedData.imageBase64 && !currentCapturedData.videoBase64) {
            return alert('Chưa có ảnh hoặc video!');
        }

        sendBtn.innerText = '⏳ Đang đăng lên Locket...';
        sendBtn.disabled = true;

        const payload = buildMomentPayload({
            idToken: user.idToken,
            localId: user.localId,
            imageBase64: currentCapturedData.imageBase64,
            videoBase64: currentCapturedData.videoBase64,
            caption: captionInput?.value.trim() || '',
            overlayType: currentOverlayType,
            bgColorStart: document.getElementById('bgStartColor')?.value || '#ff9a9e',
            bgColorEnd: document.getElementById('bgEndColor')?.value || '#fecfef',
            textColor: document.getElementById('textColor')?.value || '#ffffff',
            audience: selectedAudience,
            recipients: selectedRecipients
        });

        try {
            const res = await authFetch('/api/post-moment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                alert('🎉 Bắn khoảnh khắc lên Widget Locket thành công!');
                resetCamView();
                loadFeed();
            } else {
                alert('Lỗi đăng moment: ' + (data.error?.message || data.error || 'Thất bại'));
            }
        } catch (err) {
            alert('Lỗi kết nối khi đăng moment: ' + err.message);
        } finally {
            sendBtn.innerText = '🚀 Bắn lên Locket';
            sendBtn.disabled = false;
        }
    });

    // Social Data Loaders
    async function loadFeed() {
        const feedList = document.getElementById('feedList');
        const user = StateManager.getAuth();
        if (!feedList || !user) return;

        try {
            const res = await authFetch('/api/feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: user.idToken })
            });
            const data = await res.json();
            const moments = data.result?.moments || data.moments || [];
            cachedMoments = moments;
            if (!moments.length) {
                feedList.innerHTML = '<p class="hint">Chưa có khoảnh khắc mới nào từ bạn bè.</p>';
                return;
            }

            feedList.innerHTML = moments.map(m => {
                const timeStr = formatRelativeTime(m.date || m.created_at || Date.now());
                const mediaUrl = m.thumbnail_url || m.image_url;
                return `
                  <div class="moment-card" data-uid="${m.uid || ''}">
                    <div class="moment-header">
                      <img class="avatar" src="/icon.svg" alt="">
                      <div>
                        <strong>${m.user_uid || 'Bạn bè'}</strong>
                        <span class="fine" style="margin-left:6px;">${timeStr}</span>
                      </div>
                    </div>
                    <div class="moment-media">
                      ${m.video_url ? `<video src="${m.video_url}" autoplay loop muted playsinline></video>` : `<img src="${mediaUrl}" alt="">`}
                      ${m.caption ? `<div class="moment-cap">${m.caption}</div>` : ''}
                    </div>
                    <div class="moment-actions">
                      <button class="emoji-btn" data-react="💛">💛</button>
                      <button class="emoji-btn" data-react="🔥">🔥</button>
                      <button class="emoji-btn" data-react="😆">😆</button>
                      <button class="emoji-btn" data-react="😍">😍</button>
                      <button class="emoji-btn" data-react="💬">💬</button>
                    </div>
                  </div>
                `;
            }).join('');

            // React event listeners
            feedList.querySelectorAll('.emoji-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const card = btn.closest('.moment-card');
                    const momentUid = card?.dataset.uid;
                    const emoji = btn.dataset.react;
                    if (!momentUid) return;
                    await authFetch('/api/react', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(buildReactionPayload(user.idToken, momentUid, emoji))
                    });
                    btn.style.transform = 'scale(1.3)';
                    setTimeout(() => { btn.style.transform = 'scale(1)'; }, 200);
                });
            });
        } catch (e) {
            feedList.innerHTML = '<p class="hint">Không tải được bảng tin: ' + e.message + '</p>';
        }
    }

    async function loadFriends() {
        const user = StateManager.getAuth();
        if (!user) return;
        try {
            const res = await authFetch('/api/friends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: user.idToken, localId: user.localId })
            });
            const data = await res.json();
            const friends = data.friends || [];
            cachedFriends = friends;
            const audienceBtn = document.getElementById('audienceBtn');
            if (audienceBtn && selectedAudience === 'all') audienceBtn.innerText = `👥 ${friends.length} bạn bè`;
            const totalFriends = document.getElementById('totalFriends');
            if (totalFriends) totalFriends.innerText = friends.length;

            // Populate checklist
            const checkList = document.getElementById('friendCheckList');
            if (checkList) {
                checkList.innerHTML = friends.map(f => `
                    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;">
                        <input type="checkbox" value="${f.uid}">
                        <span>${f.uid}</span>
                    </label>
                `).join('');
            }
        } catch (_) {}
    }

    async function loadMessages() {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;
        if (!cachedFriends.length) await loadFriends();

        if (!cachedFriends.length) {
            messagesList.innerHTML = '<p class="hint">Chưa có bạn bè nào để nhắn tin.</p>';
            return;
        }

        messagesList.innerHTML = cachedFriends.map(f => `
            <div class="person" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <img class="avatar" src="/icon.svg" alt="">
                    <div>
                        <div style="font-weight:700;font-size:14px;">${f.uid}</div>
                        <div class="fine" style="text-align:left;margin-top:2px;">Bạn bè Locket</div>
                    </div>
                </div>
                <button class="choice on sendDirectBtn" data-friend-uid="${f.uid}" type="button" style="padding:6px 14px;font-size:12px;">Gửi Locket</button>
            </div>
        `).join('');

        messagesList.querySelectorAll('.sendDirectBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.friendUid;
                selectedAudience = 'selected';
                selectedRecipients = [uid];
                const audienceBtn = document.getElementById('audienceBtn');
                if (audienceBtn) audienceBtn.innerText = `⭐ Gửi riêng`;
                switchView('camera');
            });
        });
    }

    async function loadMemories() {
        const streakCount = document.getElementById('streakCount');
        const totalLocketsEl = document.getElementById('totalLockets');
        const calGrid = document.getElementById('calendarGrid');

        const summary = computeMemoriesSummary(cachedMoments, cachedFriends);
        if (streakCount) streakCount.innerText = `${summary.streak} Ngày`;
        if (totalLocketsEl) totalLocketsEl.innerText = `${summary.totalLockets}`;

        if (calGrid) {
            calGrid.innerHTML = Array.from({ length: 28 }).map((_, i) => {
                const day = i + 1;
                const active = day <= summary.streak;
                return `<div class="cal-day ${active ? 'active' : ''}">${day}</div>`;
            }).join('');
        }
    }
}


