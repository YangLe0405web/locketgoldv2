/**
 * Locket VIP Studio - Client Application Engine
 * Module 1: State, Auth, Navigation & Theme Management
 */

import { mountEffectCatalog, createThemeFrame, drawSticker } from './effect-catalog.js';
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

let pendingRefresh;

export async function refreshTokenIfNeeded(force = false) {
    const auth = StateManager.getAuth();
    if (!auth || !auth.refreshToken) return auth?.idToken;
    if (pendingRefresh?.auth === auth) return pendingRefresh.request;
    if (!force && !StateManager.isTokenExpired()) return auth.idToken;

    const request = (async () => {
      try {
        const res = await fetch('/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: auth.refreshToken })
        });
        if (!res.ok) throw new Error('Refresh token error');
        const data = await res.json();
        if (data.idToken && StateManager.getAuth() === auth) {
            StateManager.saveAuth({
                ...auth,
                expiresAt: null,
                idToken: data.idToken,
                localId: data.localId || auth.localId,
                refreshToken: data.refreshToken || auth.refreshToken,
                expiresIn: data.expiresIn || 3600
            });
            return data.idToken;
        }
      } catch (err) {
        console.warn('Không thể gia hạn token:', err.message);
      }
      return StateManager.getAuth() === auth ? auth.idToken : undefined;
    })();
    pendingRefresh = { auth, request };
    try {
        return await request;
    } finally {
        if (pendingRefresh?.request === request) pendingRefresh = null;
    }
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

function waitForMedia(media, event) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(failed, 8000);
        function cleanup() {
            clearTimeout(timer);
            media.removeEventListener(event, loaded);
            media.removeEventListener('error', failed);
        }
        function loaded() {
            cleanup();
            resolve();
        }
        function failed() {
            cleanup();
            reject(new Error('Không đọc được hình ảnh hoặc video.'));
        }
        media.addEventListener(event, loaded);
        media.addEventListener('error', failed);
    });
}

export const CameraEngine = {
    facingMode: 'user',
    dualMode: 'off',
    audioEnabled: false,
    cameraRequest: 0,
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
        const request = ++this.cameraRequest;
        this.facingMode = options.facingMode || this.facingMode;
        if (this.mainStream) {
            this.mainStream.getTracks().forEach(t => t.stop());
            this.mainStream = null;
        }

        const constraints = {
            video: {
                facingMode: options.exact ? { exact: this.facingMode } : this.facingMode,
                width: { ideal: 1080 },
                height: { ideal: 1080 }
            },
            audio: this.audioEnabled
        };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
            if (!constraints.audio || request !== this.cameraRequest) return null;
            stream = await navigator.mediaDevices.getUserMedia({ ...constraints, audio: false }).catch(() => null);
        }
        if (!stream) return null;
        if (request !== this.cameraRequest) {
            stream.getTracks().forEach(track => track.stop());
            return null;
        }
        this.mainStream = stream;
        if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.classList.toggle('mirrored', this.facingMode === 'user');
            videoElement.play().catch(() => {});
        }
        return stream;
    },

    async startSubCamera(subVideoElement) {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) return null;
        const subFacing = this.toggleFacing(this.facingMode);
        const request = this.cameraRequest;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { exact: subFacing }, width: { ideal: 480 }, height: { ideal: 480 } },
                audio: false
            });
            if (request !== this.cameraRequest) {
                stream.getTracks().forEach(track => track.stop());
                return null;
            }
            this.subStream = stream;
            if (subVideoElement) {
                subVideoElement.srcObject = this.subStream;
                subVideoElement.classList.toggle('mirrored', subFacing === 'user');
                subVideoElement.play().catch(() => {});
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
        const secondaryCanvas = document.createElement('canvas');
        secondaryCanvas.width = 1080;
        secondaryCanvas.height = 1080;
        const stream = await this.startCamera(videoElement, { facingMode: oppFacing, exact: true });
        try {
            if (!stream) throw new Error('Thiết bị chỉ dùng được một camera.');
            if (videoElement.readyState < 2) await waitForMedia(videoElement, 'loadeddata');
            drawCoverImage(secondaryCanvas.getContext('2d'), videoElement, 0, 0, 1080, 1080, oppFacing === 'user');
        } catch {
            canvasElement.getContext('2d').drawImage(primaryCanvas, 0, 0);
            return false;
        } finally {
            if (this.mainStream === stream && this.facingMode === oppFacing) {
                await this.startCamera(videoElement, { facingMode: primaryFacing });
            }
        }

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
        return true;
    },

    stopAll() {
        this.cameraRequest++;
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

function escapeHtml(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
}

async function readApiResponse(response) {
    const data = await response.json();
    const errors = data.result?.errors;
    const error = data.error || (Array.isArray(errors) ? errors[0] : errors);
    if (!response.ok || data.result?.status >= 400 || error) {
        throw new Error(error?.message || (typeof error === 'string' ? error : `Máy chủ trả về lỗi (${response.status}).`));
    }
    return data;
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
    mountEffectCatalog();

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
    const gifPreview = document.getElementById('gifPreview');
    const framePreview = document.getElementById('framePreview');
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
    const cameraTools = document.getElementById('cameraTools');
    const cameraFallback = document.getElementById('cameraFallback');
    const cameraStatus = document.getElementById('cameraStatus');
    const resetCamBtn = document.getElementById('resetCamBtn');
    const hint = document.getElementById('camHint');
    const defaultHint = 'Chạm để chụp · Giữ để quay';

    let currentCapturedData = { imageBase64: null, videoBase64: null };
    let currentOverlayType = 'standard';
    let currentCustomFrameImg = null;
    let selectedAudience = 'all';
    let selectedRecipients = [];
    let photoboothConfig = { layout: '1x2', timer: 3 };
    let selectedSticker = 'off';
    let isGifMode = false;
    let activeFilterCss = 'none';
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordTimer = null;
    let cameraOpening = false;
    let captureBusy = false;
    let videoUrl;
    let gifUrl;
    let cachedFriends = [];
    let activeChat;
    const chatThread = document.getElementById('chatThread');
    const friendDirectory = document.getElementById('friendDirectory');
    const chatHistory = document.getElementById('chatHistory');
    const chatForm = document.getElementById('chatForm');
    const chatText = document.getElementById('chatText');
    const chatStatus = document.getElementById('chatStatus');
    let cachedMoments = [];
    let feedCursor;
    let feedUsers;
    let friendsRequest;
    let feedRequest;

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

    function isSameSession(user) {
        const current = StateManager.getAuth();
        return current === user || Boolean(user?.localId && current?.localId === user.localId);
    }

    async function openCamera(restart = false) {
        const hasLiveCamera = CameraEngine.mainStream?.getVideoTracks().some(track => track.readyState === 'live');
        if (cameraOpening || captureBusy || (!restart && hasLiveCamera)) return;
        cameraOpening = true;
        cameraStatus.textContent = 'Đang mở camera…';
        resetCamBtn.disabled = true;
        if (!currentCapturedData.imageBase64) cameraFallback.classList.remove('hidden');
        if (!window.isSecureContext) {
            const url = new URL(window.location.href);
            url.protocol = 'https:';
            url.port = '3443';
            const link = document.createElement('a');
            link.href = url.href;
            link.textContent = 'Mở bằng HTTPS';
            cameraStatus.replaceChildren('Camera cần HTTPS. ', link);
            cameraOpening = false;
            resetCamBtn.disabled = false;
            return;
        }
        try {
            const stream = await CameraEngine.startCamera(backVideo);
            if (!stream) throw new Error(window.isSecureContext ? 'Hãy cấp quyền camera hoặc chọn ảnh từ thư viện.' : 'Mở trang bằng HTTPS để dùng camera.');
            if (backVideo.readyState < 2) await waitForMedia(backVideo, 'loadeddata');
            cameraFallback.classList.add('hidden');
        } catch (error) {
            cameraStatus.textContent = error.message;
        } finally {
            cameraOpening = false;
            resetCamBtn.disabled = false;
        }
    }

    function showApp(offline = false) {
        loginSection?.classList.add('hidden');
        appSection?.classList.remove('hidden');
        sendBtn.disabled = offline;
        document.getElementById('audienceBtn').disabled = offline;
        logoutBtn.textContent = offline ? 'Về màn hình đăng nhập' : 'Đăng xuất tài khoản';
        const user = StateManager.getAuth();
        if (user) {
            const meAvatar = document.getElementById('meAvatar');
            const moreAvatar = document.getElementById('moreAvatar');
            const moreName = document.getElementById('moreDisplayName');
            const moreEmail = document.getElementById('moreEmail');
            if (meAvatar) meAvatar.src = user.photoUrl || user.profilePicture || '/icon.svg';
            if (moreAvatar) moreAvatar.src = user.photoUrl || user.profilePicture || '/icon.svg';
            if (moreName) moreName.innerText = user.displayName || 'Tài khoản Locket';
            if (moreEmail) moreEmail.innerText = user.email || '';
        }
        switchView('camera');
        openCamera();
        if (!offline) {
            loadFeed();
            loadFriends().catch(() => {});
        }
    }

    document.getElementById('localStudioBtn').addEventListener('click', () => showApp(true));

    // Authenticated Fetch with automatic 401 token refresh retry
    async function authFetch(url, options = {}) {
        const userId = StateManager.getAuth()?.localId;
        const token = await refreshTokenIfNeeded();
        if (!token) throw new Error('Bạn cần đăng nhập lại.');
        const bodyObj = options.body ? JSON.parse(options.body) : {};
        bodyObj.idToken = token;

        let res = await fetch(url, {
            ...options,
            body: JSON.stringify(bodyObj)
        });

        async function needsLogin(response) {
            if (response.status === 401) return true;
            const data = await response.clone().json().catch(() => null);
            const error = data?.error || data?.result?.errors?.[0];
            return /unauthenticated|missing or invalid authentication/i.test(error?.message || String(error || ''));
        }

        if (await needsLogin(res) && StateManager.getAuth()?.localId === userId) {
            const currentToken = StateManager.getAuth()?.idToken;
            const refreshedToken = currentToken === token ? await refreshTokenIfNeeded(true) : currentToken;
            if (refreshedToken && refreshedToken !== token) {
                bodyObj.idToken = refreshedToken;
                res = await fetch(url, { ...options, body: JSON.stringify(bodyObj) });
                if (!(await needsLogin(res))) return res;
            }
            throw new Error('Locket từ chối phiên hiện tại. Vào Cài đặt, đăng xuất rồi đăng nhập lại.');
        }
        return res;
    }

    // Login handlers
    loginBtn?.addEventListener('click', async () => {
        const login = document.getElementById('email')?.value.trim();
        const password = document.getElementById('password')?.value;
        const errEl = document.getElementById('loginError');
        if (!login || !password) {
            if (errEl) errEl.innerText = 'Nhập email hoặc số điện thoại và mật khẩu.';
            return;
        }
        loginBtn.innerText = 'Đang đăng nhập...';
        loginBtn.disabled = true;
        errEl.textContent = '';
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...(login.includes('@') ? { email: login } : { phone: login.replace(/[\s()-]/g, '') }), password })
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
            loginBtn.disabled = false;
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
        if (!StateManager.getAuth() || confirm('Bạn có chắc muốn đăng xuất?')) {
            if (mediaRecorder) mediaRecorder.onstop = null;
            stopVideoRec();
            StateManager.clearAuth();
            showLogin();
            resetCamView();
            cachedFriends = [];
            closeChat();
            document.getElementById('messagesList').replaceChildren();
            cachedMoments = [];
            feedCursor = undefined;
            feedUsers = undefined;
            selectedAudience = 'all';
            selectedRecipients = [];
            document.getElementById('audienceBtn').textContent = 'Tất cả bạn bè';
            document.getElementById('friendCheckList').replaceChildren();
        }
    });

    // Navigation Dock
    document.querySelectorAll('.dock button[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (['feed', 'messages', 'memories'].includes(view) && !StateManager.getAuth()?.idToken) {
                showLogin();
                document.getElementById('loginError').textContent = 'Đăng nhập tài khoản Locket để xem bảng tin, tin nhắn và kỷ niệm.';
                return;
            }
            switchView(view);
            if (view === 'feed') loadFeed();
            if (view === 'memories') loadMemories();
            if (view === 'messages') {
                if (activeChat) loadChat(activeChat);
                else loadMessages();
            }
            if (view === 'camera') openCamera();
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
    document.getElementById('audienceBtn')?.addEventListener('click', () => {
        openSheet('audienceSheet');
        if (!cachedFriends.length) loadFriends().catch(() => {});
    });

    // Flip Camera
    document.getElementById('flipBtn')?.addEventListener('click', async () => {
        if (cameraOpening || captureBusy || CameraEngine.isRecording) return;
        CameraEngine.stopAll();
        CameraEngine.facingMode = CameraEngine.toggleFacing();
        updateDualPreview(false);
        await openCamera(true);
    });

    function updateDualPreview(available) {
        document.body.classList.toggle('dual-pip', available && CameraEngine.dualMode === 'pip');
        document.body.classList.toggle('dual-split', available && CameraEngine.dualMode === 'split');
        frontVideo.classList.toggle('hidden', !available);
        document.getElementById('dualBtn').setAttribute('aria-pressed', String(CameraEngine.dualMode !== 'off'));
    }

    document.getElementById('dualBtn')?.addEventListener('click', async () => {
        if (!canCapture()) return;
        captureBusy = true;
        CameraEngine.dualMode = CameraEngine.cycleDualMode();
        try {
            if (CameraEngine.dualMode === 'off') {
                CameraEngine.subStream?.getTracks().forEach(track => track.stop());
                CameraEngine.subStream = null;
            } else if (!CameraEngine.subStream) {
                await CameraEngine.startSubCamera(frontVideo);
            }
            updateDualPreview(Boolean(CameraEngine.subStream));
            hint.textContent = CameraEngine.dualMode !== 'off' && !CameraEngine.subStream
                ? 'Dual Cam sẽ thử chụp lần lượt khi bạn bấm nút chụp.'
                : defaultHint;
        } finally {
            captureBusy = false;
        }
    });

    // GIF Button
    document.getElementById('gifBtn')?.addEventListener('click', () => {
        if (captureBusy || CameraEngine.isRecording) return;
        isGifMode = !isGifMode;
        const btn = document.getElementById('gifBtn');
        btn.setAttribute('aria-pressed', String(isGifMode));
        hint.textContent = isGifMode ? 'Chạm nút chụp để tạo GIF dài 2 giây.' : defaultHint;
    });

    // Audio Mic toggle
    document.getElementById('micBtn')?.addEventListener('click', async () => {
        if (cameraOpening || captureBusy || CameraEngine.isRecording) return;
        CameraEngine.audioEnabled = !CameraEngine.audioEnabled;
        CameraEngine.stopAll();
        updateDualPreview(false);
        await openCamera(true);
        const btn = document.getElementById('micBtn');
        const hasAudio = Boolean(CameraEngine.mainStream?.getAudioTracks().length);
        if (CameraEngine.audioEnabled && !hasAudio) hint.textContent = 'Không mở được micro.';
        CameraEngine.audioEnabled = hasAudio;
        btn.textContent = hasAudio ? '🎤' : '🔇';
        btn.setAttribute('aria-pressed', String(hasAudio));
    });

    // FX Filters selection wiring
    const filterMap = {
        'none': 'none',
        'fresh': 'contrast(1.08) saturate(1.2) brightness(1.04)',
        'warm': 'sepia(0.2) saturate(1.25) hue-rotate(-10deg)',
        'cold': 'saturate(0.9) hue-rotate(9deg) brightness(1.05)',
        'golden': 'sepia(0.35) contrast(1.1) brightness(1.05)',
        'vintage': 'sepia(0.4) contrast(0.95) saturate(1.1)',
        'noir': 'grayscale(1) contrast(1.4) brightness(0.9)',
        'bw': 'grayscale(1) contrast(1.1)',
        'natural': 'brightness(1.04) contrast(1.04) saturate(1.08)',
        'lowlight': 'brightness(1.24) contrast(0.95) saturate(1.05)'
    };
    function setCameraFilter(key, button) {
        document.querySelectorAll('[data-fx], #aiFilterBtn').forEach(item => item.classList.toggle('on', item === button));
        activeFilterCss = filterMap[key] || 'none';
        backVideo.style.filter = activeFilterCss;
        frontVideo.style.filter = activeFilterCss;
    }
    document.querySelectorAll('[data-fx]').forEach(btn => {
        btn.addEventListener('click', () => {
            setCameraFilter(btn.dataset.fx, btn);
            closeSheets();
        });
    });

    const aiFilterBtn = document.getElementById('aiFilterBtn');
    aiFilterBtn.addEventListener('click', () => {
        if (!canCapture()) {
            closeSheets();
            return;
        }
        const session = StateManager.getAuth();
        closeSheets();
        runCapture(async () => {
            hint.textContent = 'AI đang phân tích khung hình…';
            const sample = document.createElement('canvas');
            sample.width = sample.height = 224;
            drawCoverImage(sample.getContext('2d'), backVideo, 0, 0, 224, 224);
            const { recommendFilter } = await import('./ai-filter.js');
            let timer;
            try {
                const key = await Promise.race([
                    recommendFilter(sample),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Chưa tải được mô hình AI. Kiểm tra mạng rồi thử lại.')), 25000);
                    })
                ]);
                if (!isSameSession(session) || appSection.classList.contains('hidden')) return;
                setCameraFilter(key, aiFilterBtn);
                const names = { lowlight: 'Tăng sáng', natural: 'Tự nhiên', cold: 'Mát lạnh', warm: 'Ấm áp', fresh: 'Trong trẻo' };
                hint.textContent = `AI đã chọn màu ${names[key]}. Bấm nút chụp để lưu.`;
            } catch {
                throw new Error('AI chưa sẵn sàng. Kiểm tra mạng rồi thử lại.');
            } finally {
                clearTimeout(timer);
            }
        });
    });

    const costumePreview = document.getElementById('costumePreview');
    const costumeButtons = document.querySelectorAll('[data-costume]');
    const skinSmooth = document.getElementById('skinSmooth');
    let costume = 'off';
    let costumeVersion = 0;
    skinSmooth.addEventListener('input', () => {
        document.getElementById('skinSmoothValue').textContent = `${skinSmooth.value}%`;
    });
    skinSmooth.addEventListener('change', () => startFacePreview());
    costumeButtons.forEach(button => button.addEventListener('click', () => {
        costume = button.dataset.costume;
        costumeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        closeSheets();
        startFacePreview();
    }));

    async function startFacePreview() {
        const version = ++costumeVersion;
        costumePreview.classList.add('hidden');
        if (costume === 'off' && Number(skinSmooth.value) === 0) return;
        hint.textContent = 'Đang tải nhận diện khuôn mặt…';
        try {
            const { loadFaceDetector, drawCostumes, drawSmoothSkin, drawFaceWarp } = await import('./face-costume.js');
            const detector = await loadFaceDetector();
            if (version !== costumeVersion) return;
            hint.textContent = 'Đưa mặt vào khung rồi chụp.';
            const sample = document.createElement('canvas');
            sample.width = sample.height = 192;
            const scratch = document.createElement('canvas');
            scratch.width = scratch.height = 192;
            const input = sample.getContext('2d');
            const output = costumePreview.getContext('2d');
            async function trackFace() {
                if (version !== costumeVersion) return;
                if (appSection.classList.contains('hidden')) {
                    costumePreview.classList.add('hidden');
                    return;
                }
                try {
                    const live = !backVideo.classList.contains('hidden') && !document.hidden &&
                        !document.getElementById('view-camera').classList.contains('hidden') &&
                        backVideo.readyState >= 2 && CameraEngine.dualMode === 'off';
                    costumePreview.classList.toggle('hidden', !live);
                    if (live) {
                        input.filter = activeFilterCss;
                        drawCoverImage(input, backVideo, 0, 0, 192, 192, CameraEngine.facingMode === 'user');
                        const faces = await detector.estimateFaces(sample, false);
                        if (version !== costumeVersion) return;
                        output.clearRect(0, 0, 480, 480);
                        if (!drawFaceWarp(output, sample, scratch, faces, costume)) {
                            drawSmoothSkin(output, sample, scratch, faces, Number(skinSmooth.value) / 100);
                            if (costume !== 'off') drawCostumes(output, faces, costume, 480 / 192);
                        }
                    }
                    setTimeout(trackFace, 100);
                } catch {
                    costumePreview.classList.add('hidden');
                    hint.textContent = 'Không theo dõi được khuôn mặt. Hãy bật lại hóa trang.';
                }
            }
            trackFace();
        } catch {
            if (version === costumeVersion) hint.textContent = 'Không tải được mô hình hóa trang. Kiểm tra mạng rồi thử lại.';
        }
    }

    // Custom Frames wiring
    function updateFramePreview() {
        const ctx = framePreview.getContext('2d');
        ctx.clearRect(0, 0, 1080, 1080);
        if (currentCustomFrameImg) ctx.drawImage(currentCustomFrameImg, 0, 0, 1080, 1080);
        drawSticker(ctx, selectedSticker, 1080);
        framePreview.classList.toggle('hidden', !currentCustomFrameImg && selectedSticker === 'off');
        document.getElementById('frameBtn').setAttribute('aria-pressed', String(Boolean(currentCustomFrameImg) || selectedSticker !== 'off'));
    }
    document.querySelectorAll('[data-sticker]').forEach(button => button.addEventListener('click', () => {
        selectedSticker = button.dataset.sticker;
        document.querySelectorAll('[data-sticker]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        updateFramePreview(); closeSheets();
    }));

    document.querySelectorAll('[data-frame]').forEach(btn => {
        const frameKey = btn.dataset.frame;
        const preset = frameKey === 'none' ? null : createPresetFrame(frameKey);
        const swatch = document.createElement('canvas');
        swatch.className = 'frame-swatch';
        swatch.width = swatch.height = 96;
        swatch.setAttribute('aria-hidden', 'true');
        if (preset) swatch.getContext('2d').drawImage(preset, 0, 0, 96, 96);
        btn.prepend(swatch);
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-frame]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            currentCustomFrameImg = preset;
            updateFramePreview();
            closeSheets();
        });
    });

    function createPresetFrame(type) {
        if (type.startsWith('theme-')) return createThemeFrame(type.slice(6));
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
            ctx.fillStyle = '#ff6b81';
            ctx.font = '82px system-ui';
            [[25, 99], [970, 99], [25, 1038], [970, 1038]].forEach(([x, y]) => ctx.fillText('♥', x, y));
        } else if (type === 'pastel' || type === 'stars') {
            const pastel = type === 'pastel';
            const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
            gradient.addColorStop(0, pastel ? '#ffcddd' : '#171841');
            gradient.addColorStop(1, pastel ? '#bbdfff' : '#5552a2');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 1080, 1080);
            ctx.clearRect(42, 42, 996, 996);
            ctx.fillStyle = '#fff5ca';
            ctx.font = '55px system-ui';
            [[20, 65], [990, 72], [20, 1030], [980, 1050]].forEach(([x, y]) => ctx.fillText(pastel ? '✿' : '✦', x, y));
        } else if (type === 'postcard') {
            ctx.fillStyle = '#f7e6ce';
            ctx.fillRect(0, 0, 1080, 1080);
            ctx.clearRect(46, 46, 988, 910);
            ctx.strokeStyle = '#986044';
            ctx.setLineDash([15, 10]);
            ctx.lineWidth = 4;
            ctx.strokeRect(20, 20, 1040, 1040);
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
            document.querySelectorAll('[data-frame]').forEach(button => button.classList.remove('on'));
            updateFramePreview();
            URL.revokeObjectURL(url);
            closeSheets();
        };
        const url = URL.createObjectURL(file);
        img.onerror = () => {
            URL.revokeObjectURL(url);
            hint.textContent = 'Không đọc được khung ảnh đã chọn.';
            closeSheets();
        };
        e.target.value = '';
        img.src = url;
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
        const a = document.createElement('a');
        if (gifUrl) {
            a.href = gifUrl;
            a.download = `locket_${Date.now()}.gif`;
        } else if (currentCapturedData.videoBase64) {
            a.href = currentCapturedData.videoBase64;
            const type = currentCapturedData.videoBase64.split(';')[0];
            const extension = type === 'data:video/mp4' ? 'mp4' : type === 'data:video/quicktime' ? 'mov' : 'webm';
            a.download = `locket_${Date.now()}.${extension}`;
        } else if (currentCapturedData.imageBase64) {
            a.href = currentCapturedData.imageBase64;
            a.download = `locket_${Date.now()}.${a.href.startsWith('data:image/png') ? 'png' : 'webp'}`;
        } else {
            return;
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
    document.querySelectorAll('[data-booth]').forEach(button => {
        button.addEventListener('click', () => {
            if (captureBusy || CameraEngine.isRecording) return;
            document.querySelector(`[data-layout="${button.dataset.booth}"]`)?.click();
            const frame = button.dataset.boothFrame;
            currentCustomFrameImg = frame === 'none' ? null : createPresetFrame(frame);
            document.querySelectorAll('[data-frame]').forEach(option => option.classList.toggle('on', option.dataset.frame === frame));
            updateFramePreview();
            openSheet('photoboothSheet');
        });
    });
    document.querySelectorAll('[data-timer]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-timer]').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            photoboothConfig.timer = Number(btn.dataset.timer) || 3;
        });
    });

    function canCapture() {
        if (cameraOpening || captureBusy || CameraEngine.isRecording || normalShutterRow.classList.contains('hidden')) return false;
        if (CameraEngine.mainStream?.getVideoTracks().some(track => track.readyState === 'live') && backVideo.readyState >= 2) return true;
        hint.textContent = 'Hãy mở camera hoặc chọn ảnh từ thư viện.';
        return false;
    }

    async function runCapture(action) {
        captureBusy = true;
        try {
            await action();
        } catch (error) {
            hint.textContent = error.message || 'Không thể chụp ảnh.';
        } finally {
            captureBusy = false;
            countdownIndicator.classList.add('hidden');
        }
    }

    document.getElementById('startPhotoboothBtn')?.addEventListener('click', () => {
        closeSheets();
        if (canCapture()) runCapture(() => runPhotoboothCapture(photoboothConfig.layout, photoboothConfig.timer));
    });

    let pressTimer;
    let held = false;
    shutter?.addEventListener('click', () => {
        if (held || !canCapture()) return;
        if (isGifMode) {
            runCapture(captureGif);
        } else {
            runCapture(captureSinglePhoto);
        }
    });

    async function captureGif() {
        const session = StateManager.getAuth();
        hint.textContent = 'Đang chụp GIF…';
        const { GIFEncoder, applyPalette, quantize } = await import('/vendor/gifenc.js');
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const encoder = GIFEncoder();
        const frame = currentCustomFrameImg;
        const filter = activeFilterCss;
        for (let index = 0; index < 16; index++) {
            if (!isSameSession(session) || appSection.classList.contains('hidden')) return;
            if (backVideo.readyState < 2 || !CameraEngine.mainStream) throw new Error('Camera đã ngắt trong lúc chụp GIF.');
            ctx.filter = filter;
            drawCoverImage(ctx, backVideo, 0, 0, size, size, CameraEngine.facingMode === 'user');
            ctx.filter = 'none';
            if (!costumePreview.classList.contains('hidden')) ctx.drawImage(costumePreview, 0, 0, size, size);
            if (frame) ctx.drawImage(frame, 0, 0, size, size);
            drawSticker(ctx, selectedSticker, size);
            const rgba = ctx.getImageData(0, 0, size, size).data;
            const palette = quantize(rgba, 128);
            encoder.writeFrame(applyPalette(rgba, palette), size, size, { palette, delay: 125 });
            if (index < 15) await new Promise(resolve => setTimeout(resolve, 125));
        }
        encoder.finish();
        gifUrl = URL.createObjectURL(new Blob([encoder.bytes()], { type: 'image/gif' }));
        gifPreview.src = gifUrl;
        showShotPreview();
        shotCanvas.classList.add('hidden');
        gifPreview.classList.remove('hidden');
        editorBar.classList.add('hidden');
        sendBtn.classList.add('hidden');
        hint.textContent = 'GIF đã sẵn sàng. Bấm ↓ để tải về.';
    }

    shutter?.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        held = false;
        if (isGifMode || !canCapture()) return;
        shutter.setPointerCapture(event.pointerId);
        pressTimer = setTimeout(() => {
            held = true;
            if (canCapture() && startVideoRec()) recordTimer = setTimeout(stopVideoRec, 15000);
        }, 400);
    });
    function endLongPress() {
        clearTimeout(pressTimer);
        if (held && CameraEngine.isRecording) stopVideoRec();
    }
    shutter?.addEventListener('pointerup', endLongPress);
    shutter?.addEventListener('pointercancel', endLongPress);
    shutter?.addEventListener('lostpointercapture', endLongPress);
    shutter?.addEventListener('keydown', () => { held = false; });
    shutter?.addEventListener('contextmenu', event => event.preventDefault());

    function startVideoRec() {
        recordedChunks = [];
        try {
            const type = ['video/mp4', 'video/webm'].find(mime => MediaRecorder.isTypeSupported(mime));
            mediaRecorder = new MediaRecorder(CameraEngine.mainStream, type ? { mimeType: type } : undefined);
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                if (StateManager.getAuth()) runCapture(() => prepareMedia(blob, true));
            };
            mediaRecorder.onerror = () => {
                mediaRecorder.onstop = null;
                stopVideoRec();
                hint.textContent = 'Không thể quay video.';
            };
            mediaRecorder.start();
            CameraEngine.isRecording = true;
            shutter?.classList.add('rec');
            hint.textContent = 'Đang quay video…';
            return true;
        } catch (err) {
            hint.textContent = 'Trình duyệt không quay được video từ camera này.';
            return false;
        }
    }

    function stopVideoRec() {
        clearTimeout(recordTimer);
        CameraEngine.isRecording = false;
        shutter?.classList.remove('rec');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            captureBusy = Boolean(mediaRecorder.onstop);
            mediaRecorder.stop();
        }
    }

    async function captureSinglePhoto() {
        if (!backVideo || !shotCanvas) return;
        const ctx = shotCanvas.getContext('2d');
        shotCanvas.width = 1080;
        shotCanvas.height = 1080;

        // Apply active filter
        ctx.filter = activeFilterCss;

        // If Dual Cam active but second stream is null, use sequential dual fallback!
        if (CameraEngine.dualMode !== 'off' && (!CameraEngine.subStream || !frontVideo)) {
            const capturedBoth = await CameraEngine.captureSequentialDualShot(backVideo, shotCanvas);
            if (!capturedBoth) hint.textContent = 'Thiết bị chỉ chụp được một camera.';
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

        ctx.filter = 'none';
        if (CameraEngine.dualMode === 'off' && !costumePreview.classList.contains('hidden')) {
            ctx.drawImage(costumePreview, 0, 0, 1080, 1080);
        }
        // Draw custom frame if active
        if (currentCustomFrameImg) {
            ctx.drawImage(currentCustomFrameImg, 0, 0, 1080, 1080);
        }
        ctx.filter = 'none';

        drawSticker(ctx, selectedSticker, 1080);
        currentCapturedData.imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);

        showShotPreview();
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
            if (backVideo.readyState < 2) throw new Error('Camera đã ngắt. Hãy mở lại để chụp Photobooth.');
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(cell.x, cell.y, cell.w, cell.h, cell.radius || 18);
            ctx.clip();
            ctx.filter = activeFilterCss;
            drawCoverImage(ctx, backVideo, cell.x, cell.y, cell.w, cell.h, CameraEngine.facingMode === 'user');
            ctx.filter = 'none';
            if (!costumePreview.classList.contains('hidden')) drawCoverImage(ctx, costumePreview, cell.x, cell.y, cell.w, cell.h);
            ctx.restore();
        }

        // Draw custom frame if active
        if (currentCustomFrameImg) {
            ctx.drawImage(currentCustomFrameImg, 0, 0, 1080, 1080);
        }

        drawSticker(ctx, selectedSticker, 1080);
        currentCapturedData.imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);
        showShotPreview();
    }

    function showShotPreview() {
        document.getElementById('transformShotBtn').classList.toggle('hidden', !currentCapturedData.imageBase64 || Boolean(currentCapturedData.videoBase64 || gifUrl));
        costumePreview.classList.add('hidden');
        framePreview.classList.add('hidden');
        cameraFallback.classList.add('hidden');
        cameraTools.classList.add('hidden');
        backVideo?.classList.add('hidden');
        frontVideo?.classList.add('hidden');
        previewVideo?.classList.add('hidden');
        shotCanvas?.classList.remove('hidden');
        editorBar?.classList.remove('hidden');
        normalShutterRow?.classList.add('hidden');
        postShutterRow?.classList.remove('hidden');
    }

    function showVideoPreview(url) {
        showShotPreview();
        shotCanvas?.classList.add('hidden');
        if (previewVideo) {
            if (previewVideo.src !== url) previewVideo.src = url;
            previewVideo.classList.remove('hidden');
            previewVideo.play().catch(() => {});
        }
    }

    function resetCamView() {
        document.getElementById('transformShotBtn').classList.add('hidden');
        if (gifUrl) URL.revokeObjectURL(gifUrl);
        gifUrl = null;
        gifPreview.removeAttribute('src');
        gifPreview.classList.add('hidden');
        sendBtn.classList.remove('hidden');
        previewVideo.pause();
        previewVideo.removeAttribute('src');
        previewVideo.load();
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        videoUrl = null;
        shotCanvas?.classList.add('hidden');
        previewVideo?.classList.add('hidden');
        editorBar?.classList.add('hidden');
        backVideo?.classList.remove('hidden');
        updateDualPreview(Boolean(CameraEngine.subStream));
        cameraTools.classList.remove('hidden');
        updateFramePreview();
        cameraFallback.classList.toggle('hidden', Boolean(CameraEngine.mainStream) && backVideo.readyState >= 2);
        normalShutterRow?.classList.remove('hidden');
        postShutterRow?.classList.add('hidden');
        currentCapturedData = { imageBase64: null, videoBase64: null };
        captionInput.value = '';
        hint.textContent = isGifMode ? 'Chạm nút chụp để tạo GIF dài 2 giây.' : defaultHint;
    }

    retakeBtn?.addEventListener('click', resetCamView);

    const transformForm = document.getElementById('transformForm');
    const transformStatus = document.getElementById('transformStatus');
    const transformStyle = document.getElementById('transformStyle');
    const transformReference = document.getElementById('transformReference');
    let transformSource;
    let transformBusy = false;

    async function updateTransformMode() {
        const local = transformStyle.value.startsWith('local-');
        const device = transformStyle.value.startsWith('device-');
        const reference = transformStyle.value === 'reference';
        transformReference.hidden = !reference;
        transformReference.disabled = !reference;
        document.querySelector('label[for="transformReference"]').hidden = !reference;
        document.getElementById('transformModeHint').textContent = local
            ? 'Xử lý ngay trên máy, không cần Gemini hay API key. Lần đầu cần mạng để tải bộ nhận diện khuôn mặt.'
            : device ? 'AI xử lý trên máy tính, không gửi ảnh tới Gemini. Có thể mất vài phút và có thể làm thay đổi nét mặt. Dùng ảnh thấy rõ mặt và phần thân.'
            : 'Kiểu này dùng AI tạo ảnh: cần API có hạn mức và gửi ảnh tới dịch vụ AI. Chọn nhóm Trên máy nếu không muốn dùng API.';
        transformForm.querySelector('[type="submit"]').textContent = local ? 'Áp dụng trên máy' : device ? 'Biến hình bằng AI trên máy' : 'Tạo ảnh bằng AI';
        if (device) {
            try {
                const response = await fetch('/api/local-ai/status');
                const status = await response.json();
                if (transformStyle.value.startsWith('device-') && !status.ready) {
                    document.getElementById('transformModeHint').textContent = `AI cục bộ chưa cài xong. Gói GPU đã tải ${status.downloadPercent}%; sau đó còn tải mô hình. Bạn có thể dùng nhóm Ghép hóa trang trước.`;
                }
            } catch (_) {
                if (transformStyle.value.startsWith('device-')) document.getElementById('transformModeHint').textContent = 'Chưa kiểm tra được AI cục bộ. Kiểm tra server hoặc dùng Ghép hóa trang trước.';
            }
        }
    }
    transformStyle.addEventListener('change', updateTransformMode);

    function openTransform(source) {
        transformSource = source;
        transformForm.reset();
        updateTransformMode();
        transformStatus.textContent = '';
        document.getElementById('transformSourceLabel').textContent = source ? 'Đang dùng ảnh xem trước. Có thể chọn ảnh khác.' : '';
        openSheet('transformSheet');
    }

    document.getElementById('openTransformBtn').addEventListener('click', () => {
        if (!transformBusy) openTransform(null);
    });
    document.getElementById('transformShotBtn').addEventListener('click', () => {
        if (!transformBusy) openTransform(currentCapturedData.imageBase64);
    });
    transformReference.addEventListener('change', () => {
        if (transformReference.files.length) transformStyle.value = 'reference';
        updateTransformMode();
    });

    async function readTransformPhoto(file) {
        if (file.size > 32 * 1024 * 1024) throw new Error('Chọn ảnh dưới 32 MB.');
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            const loaded = waitForMedia(img, 'load');
            img.src = url;
            await loaded;
            const ratio = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/webp', 0.9);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    transformForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (transformBusy || captureBusy || CameraEngine.isRecording) return;
        const sourceFile = document.getElementById('transformSource').files[0];
        const style = transformStyle.value;
        const referenceFile = style === 'reference' ? transformReference.files[0] : null;
        if ((!sourceFile && !transformSource) || (style === 'reference' && !referenceFile)) {
            transformStatus.textContent = 'Chọn ảnh gốc và thêm ảnh mẫu nếu dùng kiểu Theo ảnh mẫu.';
            return;
        }
        const session = StateManager.getAuth();
        const submit = transformForm.querySelector('[type="submit"]');
        transformBusy = true;
        captureBusy = true;
        submit.disabled = true;
        transformStatus.textContent = style.startsWith('local-') ? 'Đang xử lý trên máy…' : style.startsWith('device-') ? 'AI trên máy đang biến hình, có thể mất vài phút…' : 'Đang chờ dịch vụ AI tạo ảnh…';
        hint.textContent = 'Đang tạo diện mạo…';
        try {
            const [image, reference] = await Promise.all([
                sourceFile ? readTransformPhoto(sourceFile) : transformSource,
                referenceFile ? readTransformPhoto(referenceFile) : null
            ]);
            const local = style.startsWith('local-');
            const device = style.startsWith('device-');
            const result = local ? { image } : await readApiResponse(await fetch(device ? '/api/local-ai/transform' : '/api/ai/transform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image, reference, style: device ? style.slice(7) : style })
            }));
            const img = new Image();
            const loaded = waitForMedia(img, 'load');
            img.src = result.image;
            await loaded;
            let edited;
            if (local) {
                const { loadFaceDetector, drawFaceWarp, drawSmoothSkin, drawCostumes } = await import('./face-costume.js');
                const source = document.createElement('canvas');
                const scratch = document.createElement('canvas');
                edited = document.createElement('canvas');
                source.width = source.height = scratch.width = scratch.height = 480;
                edited.width = edited.height = 1080;
                drawCoverImage(source.getContext('2d'), img, 0, 0, 480, 480);
                const detector = await loadFaceDetector();
                const faces = await detector.estimateFaces(source, false);
                if (!faces.length) throw new Error('Không thấy khuôn mặt. Hãy chọn ảnh chính diện rõ hơn.');
                const ctx = edited.getContext('2d');
                drawCoverImage(ctx, img, 0, 0, 1080, 1080);
                if (style === 'local-smooth') drawSmoothSkin(ctx, source, scratch, faces, 0.6);
                else if (style === 'local-santa' || style === 'local-tire') drawCostumes(ctx, faces, style.slice(6), 1080 / 480);
                else drawFaceWarp(ctx, source, scratch, faces, style.slice(6));
            }
            if (!isSameSession(session) || appSection.classList.contains('hidden')) return;
            resetCamView();
            drawCoverImage(shotCanvas.getContext('2d'), edited || img, 0, 0, 1080, 1080);
            currentCapturedData.imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);
            switchView('camera');
            closeSheets();
            showShotPreview();
            hint.textContent = 'Ảnh đã sẵn sàng. Bấm ↓ để tải về.';
        } catch (error) {
            transformStatus.textContent = error.message;
            if (isSameSession(session)) hint.textContent = error.message;
        } finally {
            transformBusy = false;
            captureBusy = false;
            submit.disabled = false;
        }
    });
    document.getElementById('resetCamBtn')?.addEventListener('click', () => {
        openCamera(true);
    });

    // Gallery upload
    galleryBtn?.addEventListener('click', () => filePick?.click());
    filePick?.addEventListener('change', e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || captureBusy || CameraEngine.isRecording) return;
        runCapture(() => prepareMedia(file, file.type.startsWith('video/')));
    });

    async function prepareMedia(file, isVideo) {
        if (!file.size) throw new Error('Tệp này không có dữ liệu.');
        if (file.size > 32 * 1024 * 1024) throw new Error('Hãy chọn tệp dưới 32 MB.');
        hint.textContent = 'Đang đọc tệp…';
        const url = URL.createObjectURL(file);
        const user = StateManager.getAuth();
        const media = isVideo ? previewVideo : new Image();
        try {
            const loaded = waitForMedia(media, isVideo ? 'loadeddata' : 'load');
            media.src = url;
            await loaded;
            const ctx = shotCanvas.getContext('2d');
            ctx.clearRect(0, 0, 1080, 1080);
            drawCoverImage(ctx, media, 0, 0, 1080, 1080);
            const imageBase64 = shotCanvas.toDataURL('image/webp', 0.92);
            const videoBase64 = isVideo ? await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Không đọc được tệp video.'));
                reader.readAsDataURL(file);
            }) : null;
            if (!isSameSession(user)) return;
            currentCapturedData = { imageBase64, videoBase64 };
            if (isVideo) {
                videoUrl = url;
                showVideoPreview(url);
            } else {
                showShotPreview();
            }
            hint.textContent = 'Thêm chú thích hoặc gửi Locket.';
        } finally {
            if (videoUrl !== url) URL.revokeObjectURL(url);
        }
    }
    // Send Moment Dispatcher
    sendBtn?.addEventListener('click', async () => {
        const user = StateManager.getAuth();
        if (!user) return alert('Bạn cần đăng nhập lại!');
        if (!currentCapturedData.imageBase64) {
            return alert('Chưa có ảnh hoặc video!');
        }
        if (selectedAudience === 'selected' && !selectedRecipients.length) {
            return alert('Hãy chọn ít nhất một người nhận.');
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
            sendBtn.innerText = 'Gửi Locket ↑';
            sendBtn.disabled = false;
        }
    });

    // Social Data Loaders
    document.getElementById('feedRefresh').addEventListener('click', () => loadFeed());
    document.getElementById('feedOlder').addEventListener('click', () => loadFeed(true));

    function loadFeed(older = false) {
        if (!feedRequest) feedRequest = fetchFeed(older).finally(() => { feedRequest = null; });
        return feedRequest;
    }

    async function fetchFeed(older) {
        const feedList = document.getElementById('feedList');
        const status = document.getElementById('feedStatus');
        const refresh = document.getElementById('feedRefresh');
        const more = document.getElementById('feedOlder');
        const user = StateManager.getAuth();
        if (!feedList || !user) return;

        refresh.disabled = true;
        more.disabled = true;
        status.textContent = 'Đang tải bài đăng…';
        try {
            async function requestMoments(users, syncToken) {
                const res = await authFetch('/api/feed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ users, syncToken })
                });
                const data = await readApiResponse(res);
                const moments = [data.result?.data, data.result?.data?.moments, data.result?.moments, data.moments].find(Array.isArray);
                if (!moments && data.result?.status !== 304) throw new Error('Locket trả về dữ liệu bảng tin không đọc được.');
                const cursor = data.result?.sync_token || data.result?.data?.sync_token;
                return { moments: moments || [], cursor };
            }
            let users = older ? feedUsers : undefined;
            const previousCursor = older ? feedCursor : undefined;
            let page = await requestMoments(users, previousCursor);
            if (!older && !page.moments.length && isSameSession(user)) {
                if (!cachedFriends.length) await loadFriends();
                if (cachedFriends.length && isSameSession(user)) {
                    users = cachedFriends.map(friend => friend.uid);
                    page = await requestMoments(users);
                }
            }
            if (!isSameSession(user)) return;
            const combined = older ? [...cachedMoments, ...page.moments] : [...page.moments, ...cachedMoments];
            const seen = new Set();
            const moments = combined.filter(moment => {
                const key = moment.canonical_uid || moment.uid || moment.thumbnail_url || moment.video_url;
                if (!key) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            feedUsers = users;
            const last = page.moments.at(-1);
            const next = page.cursor || last?.canonical_uid;
            const addedPosts = moments.length > cachedMoments.length;
            if (page.moments.length) {
                feedCursor = next !== previousCursor && (!older || addedPosts) ? next : undefined;
            } else if (older) {
                feedCursor = undefined;
            }
            more.classList.toggle('hidden', !feedCursor);
            cachedMoments = moments;
            status.textContent = older && !addedPosts ? 'Locket chưa trả thêm bài cũ.' : '';
            if (!moments.length) {
                feedList.innerHTML = '<p class="hint">Locket chưa trả về bài đăng nào.</p>';
                return;
            }

            feedList.innerHTML = moments.map(m => {
                const timeStr = formatRelativeTime(m.date?._seconds ? m.date._seconds * 1000 : m.date || m.created_at || Date.now());
                const mediaUrl = m.thumbnail_url || m.image_url;
                const authorId = m.user_uid || (typeof m.user === 'string' ? m.user : m.user?.uid);
                const friend = cachedFriends.find(item => item.uid === authorId);
                const name = friend ? friendName(friend) : m.user?.first_name || 'Bạn bè';
                return `
                  <div class="moment-card" data-uid="${escapeHtml(m.canonical_uid || m.uid)}">
                    <div class="moment-header">
                      <img class="avatar" src="/icon.svg" alt="">
                      <div>
                        <strong>${escapeHtml(name)}</strong>
                        <span class="fine" style="margin-left:6px;">${timeStr}</span>
                      </div>
                    </div>
                    <div class="moment-media">
                      ${m.video_url ? `<video src="${escapeHtml(m.video_url)}" controls muted playsinline preload="metadata"></video>` : `<img src="${escapeHtml(mediaUrl)}" loading="lazy" alt="">`}
                      ${m.caption ? `<div class="moment-cap">${escapeHtml(m.caption)}</div>` : ''}
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
                    btn.disabled = true;
                    try {
                        const res = await authFetch('/api/react', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(buildReactionPayload(user.idToken, momentUid, emoji))
                        });
                        await readApiResponse(res);
                        btn.setAttribute('aria-pressed', 'true');
                    } catch (error) {
                        alert('Không gửi được cảm xúc. ' + error.message);
                    } finally {
                        btn.disabled = false;
                    }
                });
            });
        } catch (e) {
            if (!isSameSession(user)) return;
            status.textContent = 'Không tải được bảng tin. ' + e.message;
            if (!cachedMoments.length) feedList.replaceChildren();
        } finally {
            refresh.disabled = false;
            more.disabled = false;
        }
    }

    function loadFriends() {
        if (!friendsRequest) friendsRequest = fetchFriends().finally(() => { friendsRequest = null; });
        return friendsRequest;
    }

    async function fetchFriends() {
        const user = StateManager.getAuth();
        if (!user) return;
        try {
            const res = await authFetch('/api/friends', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: user.idToken, localId: user.localId })
            });
            const data = await readApiResponse(res);
            if (!isSameSession(user)) return;
            const friends = data.friends || [];
            cachedFriends = friends;
            const audienceBtn = document.getElementById('audienceBtn');
            if (audienceBtn && selectedAudience === 'all') audienceBtn.innerText = 'Tất cả bạn bè';
            const totalFriends = document.getElementById('totalFriends');
            if (totalFriends) totalFriends.innerText = friends.length;

            // Populate checklist
            const checkList = document.getElementById('friendCheckList');
            if (checkList) {
                checkList.innerHTML = friends.map(f => `
                    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;">
                        <input type="checkbox" value="${escapeHtml(f.uid)}" ${selectedRecipients.includes(f.uid) ? 'checked' : ''}>
                        <span>${escapeHtml(friendName(f))}</span>
                    </label>
                `).join('');
            }
        } catch (error) {
            if (!isSameSession(user)) return;
            document.getElementById('friendCheckList').innerHTML = `<p class="hint">Không tải được danh sách bạn bè. ${escapeHtml(error.message)}</p>`;
            throw error;
        }
    }

    function friendName(friend) {
        return friend.name || (friend.username ? '@' + friend.username : friend.uid);
    }

    function closeChat() {
        activeChat = null;
        chatThread.classList.add('hidden');
        friendDirectory.classList.remove('hidden');
        chatForm.reset();
        chatHistory.replaceChildren();
        chatStatus.textContent = '';
    }

    async function chatRequest(path, chat, message) {
        const response = await authFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendUid: chat.friend.uid, localId: StateManager.getAuth()?.localId, conversationId: chat.conversationId, message })
        });
        return readApiResponse(response);
    }

    function appendChatMessage(message) {
        const bubble = document.createElement('p');
        bubble.className = message.mine ? 'chat-bubble mine' : 'chat-bubble';
        bubble.textContent = message.text;
        chatHistory.appendChild(bubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    async function loadChat(chat, quiet = false) {
        if (chat.historyRequest) return;
        const request = Symbol();
        chat.historyRequest = request;
        if (!quiet) chatStatus.textContent = 'Đang tải tin nhắn…';
        try {
            const { messages, conversationId } = await chatRequest('/api/chat/history', chat);
            if (activeChat !== chat || chat.historyRequest !== request) return;
            chat.conversationId = conversationId;
            const delivered = new Set(messages.map(message => message.clientToken?.toUpperCase()).filter(Boolean));
            chat.recent = chat.recent.filter(message => !delivered.has(message.clientToken));
            const visibleMessages = [...messages, ...chat.recent];
            const signature = JSON.stringify(visibleMessages);
            if (signature !== chat.signature) {
                chat.signature = signature;
                chatHistory.replaceChildren();
                visibleMessages.forEach(appendChatMessage);
            }
            chatStatus.textContent = visibleMessages.length ? '' : 'Chưa có tin nhắn.';
        } catch (error) {
            if (activeChat === chat && chat.historyRequest === request) chatStatus.textContent = 'Không tải được tin nhắn. ' + error.message;
        } finally {
            if (chat.historyRequest === request) chat.historyRequest = null;
        }
    }

    setInterval(() => {
        if (activeChat && !document.hidden && !chatThread.closest('#view-messages').classList.contains('hidden')) {
            loadChat(activeChat, true);
        }
    }, 12000);
    document.getElementById('chatBack').addEventListener('click', closeChat);
    document.getElementById('chatRefresh').addEventListener('click', () => {
        if (activeChat) loadChat(activeChat);
    });
    chatForm.addEventListener('submit', async event => {
        event.preventDefault();
        const chat = activeChat;
        const text = chatText.value.trim();
        if (!chat || !text) return;
        const submit = chatForm.querySelector('button');
        submit.disabled = true;
        chatText.readOnly = true;
        chatStatus.textContent = 'Đang gửi…';
        try {
            const { clientToken } = await chatRequest('/api/chat/send', chat, text);
            if (activeChat !== chat) return;
            chat.historyRequest = null;
            const message = { text, mine: true, clientToken };
            chat.recent.push(message);
            appendChatMessage(message);
            chatForm.reset();
            chatStatus.textContent = 'Đã gửi';
        } catch (error) {
            if (activeChat === chat) chatStatus.textContent = 'Không gửi được tin nhắn. ' + error.message;
        } finally {
            submit.disabled = false;
            chatText.readOnly = false;
        }
    });

    async function loadMessages() {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;
        const session = StateManager.getAuth();
        const inboxRequest = authFetch('/api/chat/inbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ localId: session?.localId })
        }).then(readApiResponse).catch(() => null);
        const [inbox, friendsResult] = await Promise.all([
            inboxRequest,
            cachedFriends.length ? null : loadFriends().catch(error => error)
        ]);
        if (!isSameSession(session)) return;
        const friends = new Map(cachedFriends.map(friend => [friend.uid, friend]));
        const conversations = [...(inbox?.conversations || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const rows = new Map();
        for (const conversation of conversations) {
            const uid = conversation.friendUid;
            if (uid && !rows.has(uid)) rows.set(uid, { uid, ...friends.get(uid), ...conversation });
        }
        for (const [uid, friend] of friends) {
            if (!rows.has(uid)) rows.set(uid, friend);
        }
        if (!rows.size) {
            const message = friendsResult instanceof Error ? 'Không tải được bạn bè. ' + friendsResult.message
                : inbox ? 'Chưa có cuộc trò chuyện hoặc bạn bè.' : 'Không tải được hộp thư từ Locket.';
            messagesList.innerHTML = `<p class="hint">${escapeHtml(message)}</p><button class="ghost" type="button">Tải lại</button>`;
            messagesList.querySelector('button').addEventListener('click', loadMessages);
            return;
        }

        messagesList.innerHTML = (inbox ? '' : '<p class="hint">Chưa tải được tin nhắn mới nhất từ Locket.</p>') + [...rows.values()].map(f => `
            <div class="friend-row">
                <div class="friend-info">
                    <img class="avatar" src="${escapeHtml(/^https:\/\//i.test(f.photoUrl) ? f.photoUrl : '/icon.svg')}" loading="lazy" alt="">
                    <div><strong>${escapeHtml(friendName(f))}</strong>
                    ${f.text ? `<div class="fine" style="margin:3px 0;text-align:left">${escapeHtml(f.text.slice(0, 100))}</div>` : ''}
                    ${f.unread ? `<small>${escapeHtml(f.unread)} tin chưa đọc</small>` : ''}</div>
                </div>
                <button class="choice on chatOpenBtn" data-friend-uid="${escapeHtml(f.uid)}" type="button">Nhắn</button>
                <button class="choice sendDirectBtn" data-friend-uid="${escapeHtml(f.uid)}" type="button">Gửi ảnh</button>
            </div>
        `).join('');

        messagesList.querySelectorAll('.chatOpenBtn').forEach(button => {
            button.addEventListener('click', () => {
                const friend = rows.get(button.dataset.friendUid);
                if (!friend) return;
                activeChat = { friend, recent: [], conversationId: friend.conversationId };
                document.getElementById('chatName').textContent = friendName(friend);
                chatForm.reset();
                chatHistory.replaceChildren();
                friendDirectory.classList.add('hidden');
                chatThread.classList.remove('hidden');
                loadChat(activeChat);
            });
        });

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


