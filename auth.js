// auth.js — OAuth2 PKCE Authentication Module for ArcGIS
const STORAGE_KEY = "garage_sale_auth_session_v1";
const PKCE_KEY = "garage_sale_pkce_data_v1";

class ArcGISAuth {
    constructor(config) {
        this.config = config;
        this.portalRest = (config.PORTAL || "https://www.arcgis.com/sharing/rest").replace(/\/$/, "");
        this.clientId = config.CLIENT_ID;
        this.redirectUri = this.buildRedirectUri("callback.html");
        this.callbacks = {
            onSignIn: [],
            onSignOut: [],
            onError: []
        };
    }

    buildRedirectUri(filename = "callback.html") {
        const base = location.origin + location.pathname.replace(/[^/]*$/, "");
        return base + filename;
    }

    oauthBase() {
        return this.portalRest + "/oauth2";
    }

    // Event handling
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }

    // Session management
    saveSession(obj) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }

    loadSession() {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
        } catch {
            return null;
        }
    }

    clearSession() {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(PKCE_KEY);
    }

    isSignedIn() {
        const session = this.loadSession();
        return session && session.access_token && !this.isExpired(session);
    }

    isExpired(session) {
        const now = Math.floor(Date.now() / 1000);
        return !session?.access_token || (session.expires_at && (session.expires_at - now < 60));
    }

    getToken() {
        const session = this.loadSession();
        if (session && !this.isExpired(session)) {
            return session.access_token;
        }
        return null;
    }

    getUserInfo() {
        const session = this.loadSession();
        return session ? {
            username: session.username,
            userId: session.userId,
            fullName: session.fullName
        } : null;
    }

    // PKCE utilities
    base64urlOfBytes(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i++) {
            s += String.fromCharCode(bytes[i]);
        }
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    async sha256(plain) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        return window.crypto.subtle.digest('SHA-256', data);
    }

    randomString(len = 43) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let result = '';
        for (let i = 0; i < len; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    // Main authentication methods
    async signIn() {
        try {
            // Check if already signed in
            if (this.isSignedIn()) {
                this.emit('onSignIn', this.getUserInfo());
                return;
            }

            // Generate PKCE parameters
            const verifier = this.randomString(128);
            const challenge = this.base64urlOfBytes(new Uint8Array(await this.sha256(verifier)));
            const state = this.randomString(32);

            // Store PKCE data
            const pkceData = {
                verifier: verifier,
                state: state,
                post: location.href
            };
            sessionStorage.setItem(PKCE_KEY, JSON.stringify(pkceData));

            // Build authorization URL
            const params = new URLSearchParams();
            params.set("response_type", "code");
            params.set("client_id", this.clientId);
            params.set("redirect_uri", this.redirectUri);
            params.set("scope", "");
            params.set("state", state);
            params.set("code_challenge", challenge);
            params.set("code_challenge_method", "S256");

            const authUrl = this.oauthBase() + "/authorize?" + params.toString();

            // Redirect to authorization server
            window.location.href = authUrl;

        } catch (error) {
            console.error("Sign-in error:", error);
            this.emit('onError', error);
            throw error;
        }
    }

    signOut() {
        this.clearSession();
        this.emit('onSignOut');
    }

    // API request helper with authentication
    async authenticatedRequest(url, options = {}) {
        const token = this.getToken();
        if (!token) {
            throw new Error("Not authenticated");
        }

        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // If token expired, try to refresh or redirect to login
        if (response.status === 401) {
            this.signOut();
            throw new Error("Authentication expired");
        }

        return response;
    }

    // ArcGIS REST API helpers
    async whoAmI() {
        const token = this.getToken();
        if (!token) {
            throw new Error("Not signed in");
        }

        const url = `${this.portalRest}/community/self?f=json&token=${token}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || "API error");
        }

        return data;
    }
}

// Export for use in other modules
window.ArcGISAuth = ArcGISAuth;
