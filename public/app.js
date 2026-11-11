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
            return null;
        }
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
