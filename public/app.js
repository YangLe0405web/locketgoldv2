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
