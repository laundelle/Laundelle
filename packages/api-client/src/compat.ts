/**
 * db.ts — MongoDB Client Utility
 * All data operations proxy to our secure server-side API at /api/db.
 */

declare const process: any;


export const getApiBase = (): string => {
  if (typeof window !== 'undefined') {
    // In browser context across all portals (customer, operations, admin),
    // always use relative path ('') so requests route through the Next.js server
    // rewrite proxy (/api/:path* -> http://127.0.0.1:4000/api/:path*).
    // This completely eliminates CORS issues, mixed-content errors, and avoids
    // needing to expose or tunnel port 4000.
    return '';
  }

  // Server-side context (SSR / node)
  if (typeof process !== 'undefined') {
    const internalUrl = process.env?.INTERNAL_API_URL || process.env?.NEXT_PUBLIC_API_URL;
    if (internalUrl && !internalUrl.includes('devtunnels.ms') && !internalUrl.includes('ngrok') && !internalUrl.includes('localhost') && !internalUrl.includes('127.0.0.1')) {
      return internalUrl.replace(/\/$/, '');
    }
    if (process.env?.NODE_ENV === 'production' || process.env?.VERCEL) {
      return 'https://api.laundelle.co.uk';
    }
    if (internalUrl) {
      return internalUrl.replace(/\/$/, '');
    }
  }
  return 'http://localhost:4000';
};
export const apiUrl = (path: string): string => `${getApiBase()}${path.startsWith('/') ? path : '/' + path}`;

import {
  setCsrfToken as setSharedCsrfToken,
  getCsrfToken as getSharedCsrfToken,
  getAuthToken as getSharedAuthToken,
  saveSession as saveSharedSession,
  clearSession as clearSharedSession,
  getStoredSession as getSharedStoredSession
} from '@laundelle/auth';

// In-memory token and CSRF state (protects against XSS token exfiltration)
let inMemoryCsrfToken: string | null = null;
let inMemoryAuthToken: string | null = null;
let inMemorySession: MongoAuthSession | null = null;

export function setCsrfToken(csrf: string | null): void {
  inMemoryCsrfToken = csrf;
  try {
    setSharedCsrfToken(csrf);
  } catch {}
}

export function getCsrfToken(): string | null {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  try {
    const shared = getSharedCsrfToken();
    if (shared) {
      inMemoryCsrfToken = shared;
      return shared;
    }
  } catch {}
  return null;
}

export const apiFetch = (path: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers || {});
  
  // Attach CSRF token on mutating requests if present
  const method = (init?.method || 'GET').toUpperCase();
  const csrf = getCsrfToken();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrf && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', csrf);
  }

  // Attach Authorization Bearer token if present in memory
  const token = inMemoryAuthToken || getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(apiUrl(path), {
    ...init,
    credentials: init?.credentials || 'include',
    headers,
  });
};

import { UserProfile, UserAddress, UserPreferences, Order, CustomerNotification } from '@laundelle/types';
import { LAUNDELLE_SERVICE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';

// ─── Auth Session Helpers ─────────────────────────────────────────────────────

export interface MongoAuthSession {
    token: string;
    user: {
        id: string;
        email: string;
        name: string;
        role?: string;
        plantId?: string;
        publicId?: string;
        phone?: string;
    };
    isAuthenticated: boolean;
    csrfToken?: string;
}

const SESSION_KEY = 'l2u_auth_session';

export function getStoredSession(): MongoAuthSession | null {
    if (inMemorySession) return inMemorySession;
    try {
        const shared = getSharedStoredSession();
        if (shared && (shared.token || shared.isAuthenticated)) {
            inMemorySession = shared as any;
            if (shared.token) inMemoryAuthToken = shared.token;
            if (shared.csrfToken) inMemoryCsrfToken = shared.csrfToken;
            return inMemorySession;
        }
    } catch {}
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.token || parsed.isAuthenticated)) {
            if (!parsed.token) {
                const storedToken = localStorage.getItem('l2u_token');
                if (storedToken) parsed.token = storedToken;
            }
            inMemorySession = parsed as MongoAuthSession;
            if (parsed.token) inMemoryAuthToken = parsed.token;
            if (parsed.csrfToken) inMemoryCsrfToken = parsed.csrfToken;
            return inMemorySession;
        }
        return null;
    } catch {
        return null;
    }
}

export function saveSession(session: MongoAuthSession): void {
    inMemorySession = session;
    if (session.token) inMemoryAuthToken = session.token;
    if (session.csrfToken) inMemoryCsrfToken = session.csrfToken;
    try {
        saveSharedSession(session as any);
    } catch {}
    if (typeof window === 'undefined') return;
    try {
        // Do not persist raw secret token in localStorage (prevents token exfiltration).
        // Only safe session metadata (user, role, isAuthenticated) is stored.
        const safeSession = {
            user: session.user,
            isAuthenticated: session.isAuthenticated,
        };
        const prevRaw = localStorage.getItem(SESSION_KEY);
        const nextRaw = JSON.stringify(safeSession);
        if (prevRaw !== nextRaw) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(safeSession));
            window.dispatchEvent(new Event('l2u_auth_change'));
        }
    } catch (err) {
        console.error('Failed to save session:', err);
    }
}

export function clearSession(): void {
    inMemorySession = null;
    inMemoryAuthToken = null;
    inMemoryCsrfToken = null;
    try {
        clearSharedSession();
    } catch {}
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('l2u_token');
        localStorage.removeItem(LOCAL_PROFILE_KEY);
        localStorage.removeItem(LOCAL_ORDERS_KEY);
        localStorage.removeItem(LOCAL_NOTIF_KEY);
        window.dispatchEvent(new Event('l2u_auth_change'));
    } catch (err) {
        console.error('Failed to clear session:', err);
    }
}

export function getAuthToken(): string | null {
    if (inMemoryAuthToken) return inMemoryAuthToken;
    if (inMemorySession?.token) return inMemorySession.token;
    try {
        const shared = getSharedAuthToken();
        if (shared) return shared;
    } catch {}
    if (typeof window !== 'undefined') {
        try {
            const stored = getStoredSession();
            if (stored?.token) {
                inMemoryAuthToken = stored.token;
                return stored.token;
            }
            const direct = localStorage.getItem('l2u_token');
            if (direct) {
                inMemoryAuthToken = direct;
                return direct;
            }
        } catch {}
    }
    return null;
}

export function authHeaders(): HeadersInit {
    const token = getAuthToken();
    const csrf = getCsrfToken();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    };
}

// ─── Auth Actions ─────────────────────────────────────────────────────────────

export interface AuthResult {
    user: { id: string; publicId?: string; email: string; name: string; phone?: string; role?: string; plantId?: string; plant_id?: string; emailVerified?: boolean } | null;
    token: string | null;
    error: string | null;
    needsProfileCompletion?: boolean;
    csrfToken?: string;
}


function getErrorMessage(err: any, fallback: string): string {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
        if (typeof err.message === 'string') return err.message;
        if (typeof err.error === 'string') return err.error;
        if (err.error && typeof err.error === 'object') return getErrorMessage(err.error, fallback);
        return err.code || (err.details && typeof err.details === 'string' ? err.details : null) || fallback;
    }
    return String(err);
}

export async function mongoSignIn(email: string, password: string): Promise<AuthResult> {
    try {
        const res = await apiFetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return { user: null, token: null, error: getErrorMessage(data.error, 'Login failed') };

        const session: MongoAuthSession = {
            token: data.token || '',
            user: data.user,
            isAuthenticated: true,
            csrfToken: data.csrfToken,
        };
        if (data.csrfToken) {
            setCsrfToken(data.csrfToken);
        }
        saveSession(session);
        return { user: data.user, token: data.token, error: null };
    } catch (e: any) {
        return { user: null, token: null, error: e.message || 'Network error' };
    }
}

export async function mongoSignUp(
    email: string,
    password: string,
    fullName: string,
    phone: string
): Promise<AuthResult> {
    try {
        const res = await apiFetch('/api/v1/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, fullName, phone }),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return { user: null, token: null, error: getErrorMessage(data.error, 'Registration failed') };

        const session: MongoAuthSession = {
            token: data.token || '',
            user: data.user,
            isAuthenticated: true,
            csrfToken: data.csrfToken,
        };
        if (data.csrfToken) {
            setCsrfToken(data.csrfToken);
        }
        saveSession(session);
        return { user: data.user, token: data.token, error: null };
    } catch (e: any) {
        return { user: null, token: null, error: e.message || 'Network error' };
    }
}

export async function dbAuth0Sync(auth0User: {
    email: string;
    name?: string;
    sub?: string;
    picture?: string;
    portal?: string;
}, accessToken?: string): Promise<AuthResult> {
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }
        const res = await apiFetch('/api/v1/auth/auth0-sync', {
            method: 'POST',
            headers,
            body: JSON.stringify(auth0User),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) {
            return { user: null, token: null, error: getErrorMessage(data.error, 'Auth0 synchronization failed') };
        }

        const effectiveToken = data.token || accessToken || '';
        const session: MongoAuthSession = {
            token: effectiveToken,
            user: data.user,
            isAuthenticated: true,
            csrfToken: data.csrfToken,
        };
        if (data.csrfToken) {
            setCsrfToken(data.csrfToken);
        }
        saveSession(session);
        return { 
            user: data.user, 
            token: effectiveToken, 
            error: null,
            needsProfileCompletion: Boolean(data.needsProfileCompletion || !data.user?.phone),
            csrfToken: data.csrfToken
        };
    } catch (e: any) {
        return { user: null, token: null, error: e.message || 'Network error' };
    }
}

/**
 * Verifies email via token and establishes authenticated customer session.
 */
export async function dbVerifyEmail(email: string, token: string): Promise<AuthResult> {
    try {
        const res = await apiFetch('/api/v1/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token }),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) {
            return { user: null, token: null, error: getErrorMessage(data.error, 'Email verification failed') };
        }

        const effectiveToken = data.token || '';
        const session: MongoAuthSession = {
            token: effectiveToken,
            user: data.user,
            isAuthenticated: true,
            csrfToken: data.csrfToken,
        };
        if (data.csrfToken) {
            setCsrfToken(data.csrfToken);
        }
        saveSession(session);
        return {
            user: data.user,
            token: effectiveToken,
            error: null,
            csrfToken: data.csrfToken
        };
    } catch (e: any) {
        return { user: null, token: null, error: e.message || 'Network error during email verification' };
    }
}

/**
 * Queries current server-side session via BFF endpoint without reading tokens from localStorage.
 */
export async function dbFetchSession(): Promise<{ isAuthenticated: boolean; user: any; csrfToken?: string | null }> {
    try {
        const res = await apiFetch('/api/v1/auth/session', { method: 'GET' });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (data && data.isAuthenticated && data.user) {
            if (data.csrfToken) {
                setCsrfToken(data.csrfToken);
            }
            const session: MongoAuthSession = {
                token: '',
                user: data.user,
                isAuthenticated: true,
                csrfToken: data.csrfToken,
            };
            saveSession(session);
            return { isAuthenticated: true, user: data.user, csrfToken: data.csrfToken };
        }
        return { isAuthenticated: false, user: null, csrfToken: null };
    } catch {
        return { isAuthenticated: false, user: null, csrfToken: null };
    }
}

export function mongoSignOut(): void {
    apiFetch('/api/v1/auth/logout', {
        method: 'POST',
    }).catch(() => {});
    clearSession();
}

// ─── Local Caches ─────────────────────────────────────────────────────────────

const LOCAL_PROFILE_KEY = 'l2u_customer_profile';
const LOCAL_ORDERS_KEY = 'l2u_customer_orders';
const LOCAL_NOTIF_KEY = 'l2u_customer_notifications';
const LOCAL_SERVICES_KEY = 'l2u_services';

function getLocal<T>(key: string, fallback: T): T {
    try {
        if (typeof window === 'undefined') return fallback;
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
    } catch {
        return fallback;
    }
}

function setLocal<T>(key: string, val: T): void {
    try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(key, JSON.stringify(val));
    } catch { }
}

const DEFAULT_PROFILE: UserProfile = {
    name: '',
    email: '',
    phone: '',
    avatar: '',
    walletBalance: 0,
    rewardPoints: 0,
    addresses: [],
    preferences: {
        detergent: 'Standard',
        softener: 'Standard',
        fragrance: 'Fresh Linen',
        foldingPreference: 'Standard Flat Fold',
        starchedShirts: 'No Starch',
        smsNotifications: true,
        emailReceipts: true,
        whatsappUpdates: true,
        marketingEmails: false,
    },
};

// ─── Postcode & Waiting List ────────────────────────────────────────────────

export async function checkPostcodeSectorActive(postcode: string): Promise<boolean> {
    try {
        const res = await apiFetch('/api/v1/platform/postcodes/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postcode }),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        return !!data.isServiceable;
    } catch {
        return false;
    }
}

export async function dbFetchActiveDistricts(): Promise<string[]> {
    try {
        const res = await apiFetch('/api/v1/platform/postcodes');
        const json = await res.json().catch(() => ({}));
        const data = json.success ? json.data : json;
        return Array.isArray(data?.districts) ? data.districts : [];
    } catch {
        return [];
    }
}

export async function checkPostcodeCoverage(postcode: string): Promise<{
    isServiceable: boolean;
    location: string | null;
    city?: string | null;
    district?: string | null;
    plantId?: string | null;
    plantCode?: string | null;
    plantName?: string | null;
    managerName?: string | null;
    services?: any[];
}> {
    try {
        const res = await apiFetch('/api/v1/platform/postcodes/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postcode }),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        return {
            isServiceable: !!data.isServiceable,
            location: data.location || null,
            city: data.city || null,
            district: data.district || null,
            plantId: data.plantId || null,
            plantCode: data.plantCode || null,
            plantName: data.plantName || null,
            managerName: data.managerName || null,
            services: data.services || []
        };
    } catch {
        return { isServiceable: false, location: null, services: [] };
    }
}

export const SERVICE_NAME_IMAGES: Record<string, string> = Object.entries(LAUNDELLE_SERVICE_IMAGES).reduce(
    (acc, [name, meta]) => {
        acc[name] = getOptimizedImageUrl(meta);
        return acc;
    },
    {} as Record<string, string>
);

export function resolveServiceImage(s: { name?: string; id?: string; image?: string; category?: string }): string {
    if (s.name && SERVICE_NAME_IMAGES[s.name]) {
        return SERVICE_NAME_IMAGES[s.name];
    }
    if (s.name && LAUNDELLE_SERVICE_IMAGES[s.name]) {
        return getOptimizedImageUrl(LAUNDELLE_SERVICE_IMAGES[s.name]);
    }
    if (s.image && !s.image.startsWith('/Images/')) {
        return s.image;
    }
    return SERVICE_NAME_IMAGES['Wash + Dry + Fold'] || '';
}

export async function dbFetchServices(): Promise<any[]> {
    const cached = getLocal<any[]>(LOCAL_SERVICES_KEY, []);
    try {
        const res = await apiFetch('/api/v1/platform/services', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const json = await res.json().catch(() => ({}));
        const data = json.success ? json.data : json;
        if (!res.ok || data?.error) {
            throw new Error(getErrorMessage(data?.error, !res.ok ? `HTTP ${res.status} Error fetching services` : 'Failed to fetch services'));
        }
        const servicesArray = Array.isArray(data) ? data : (data.services || []);
        
        // Ensure every service uses its matching image from public/Images/<name>.png
        const sanitized = servicesArray.map((s: any) => ({
            ...s,
            image: resolveServiceImage(s),
        }));

        setLocal(LOCAL_SERVICES_KEY, sanitized);
        return sanitized;
    } catch (e: any) {
        console.error('[db] dbFetchServices:', e?.message || e);
        return cached.map((s: any) => ({
            ...s,
            image: resolveServiceImage(s),
        }));
    }
}

export async function joinWaitingList(entry: {
    full_name: string;
    email: string;
    phone?: string;
    postcode: string;
    requested_service_id?: string;
    launch_notification_consent: boolean;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/platform/waitlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        });
        if (!res.ok) {
            const data = await res.json();
            return { success: false, error: data.error || 'Failed to join waitlist' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function dbFetchProfile(_userId?: string): Promise<UserProfile> {
    const cached = getLocal<UserProfile>(LOCAL_PROFILE_KEY, DEFAULT_PROFILE);
    try {
        const res = await apiFetch('/api/v1/users/me', {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        const data = json.success ? json.data : json;
        if (res.status === 401 || data?.code === 'UNAUTHORIZED' || data?.error === 'Authentication required') {
            clearSession();
            return cached;
        }
        if (!res.ok || data?.error) {
            throw new Error(getErrorMessage(data?.error, !res.ok ? `HTTP ${res.status} Error fetching profile` : 'Failed to fetch profile'));
        }
        setLocal(LOCAL_PROFILE_KEY, data);
        return data as UserProfile;
    } catch (e: any) {
        if (!e?.message?.includes('Authentication required') && !e?.message?.includes('401')) {
            console.error('[db] dbFetchProfile:', e?.message || e);
        }
        return cached;
    }
}

export async function dbUpdateProfile(_userId: string, name: string, phone: string): Promise<void> {
    const local = getLocal<UserProfile>(LOCAL_PROFILE_KEY, DEFAULT_PROFILE);
    local.name = name;
    local.phone = phone;
    setLocal(LOCAL_PROFILE_KEY, local);
    try {
        await apiFetch('/api/v1/users/me', {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ name, phone }),
        });
    } catch (e) {
        console.error('[db] dbUpdateProfile:', e);
    }
}

export async function dbUpdatePreferences(_userId: string, prefs: UserPreferences): Promise<void> {
    const local = getLocal<UserProfile>(LOCAL_PROFILE_KEY, DEFAULT_PROFILE);
    local.preferences = prefs;
    setLocal(LOCAL_PROFILE_KEY, local);
    try {
        await apiFetch('/api/v1/users/me/preferences', {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ preferences: prefs }),
        });
    } catch (e) {
        console.error('[db] dbUpdatePreferences:', e);
    }
}

// ─── Addresses ───────────────────────────────────────────────────────────────

export async function dbCreateAddress(_userId: string, address: UserAddress): Promise<void> {
    const local = getLocal<UserProfile>(LOCAL_PROFILE_KEY, DEFAULT_PROFILE);
    if (address.isDefault) local.addresses.forEach((a) => (a.isDefault = false));
    local.addresses.push(address);
    setLocal(LOCAL_PROFILE_KEY, local);
    try {
        await apiFetch('/api/v1/users/me/addresses', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(address),
        });
    } catch (e) {
        console.error('[db] dbCreateAddress:', e);
    }
}

export async function dbUpdateAddress(_userId: string, address: UserAddress): Promise<void> {
    const local = getLocal<UserProfile>(LOCAL_PROFILE_KEY, DEFAULT_PROFILE);
    if (address.isDefault) local.addresses.forEach((a) => (a.isDefault = false));
    local.addresses = local.addresses.map((a) => (a.id === address.id ? address : a));
    setLocal(LOCAL_PROFILE_KEY, local);
    try {
        await apiFetch(`/api/v1/users/me/addresses/${address.id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(address),
        });
    } catch (e) {
        console.error('[db] dbUpdateAddress:', e);
    }
}

export async function dbDeleteAddress(_userId: string, addressId: string): Promise<void> {
    const local = getLocal<UserProfile>(LOCAL_PROFILE_KEY, DEFAULT_PROFILE);
    local.addresses = local.addresses.filter((a) => a.id !== addressId);
    setLocal(LOCAL_PROFILE_KEY, local);
    try {
        await apiFetch(`/api/v1/users/me/addresses/${addressId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
    } catch (e) {
        console.error('[db] dbDeleteAddress:', e);
    }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function dbFetchOrders(_userId?: string): Promise<Order[]> {
    try {
        // SECURITY: Do NOT pass session_id here.
        // Payment confirmation must only happen via POST /api/stripe/confirm-session (explicit)
        // or via the Stripe webhook. Auto-injecting session_id to GET /orders was allowing
        // orders to be confirmed without a running webhook (direct Stripe API call).
        const res = await apiFetch('/api/v1/orders', {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        const data = json.success ? json.data : json;
        if (res.status === 401 || data?.code === 'UNAUTHORIZED' || data?.error === 'Authentication required') {
            clearSession();
            return getLocal<Order[]>(LOCAL_ORDERS_KEY, []);
        }
        if (!res.ok || data?.error) {
            throw new Error(getErrorMessage(data?.error, !res.ok ? `HTTP ${res.status} Error fetching orders` : 'Failed to fetch orders'));
        }
        const ordersArray = Array.isArray(data) ? data : (data.orders || []);
        setLocal(LOCAL_ORDERS_KEY, ordersArray);
        return ordersArray;
    } catch (e: any) {
        if (!e?.message?.includes('Authentication required') && !e?.message?.includes('401')) {
            console.error('[db] dbFetchOrders:', e?.message || e);
        }
        return getLocal<Order[]>(LOCAL_ORDERS_KEY, []);
    }
}

export async function dbCreateOrder(_userIdOrOrder?: string | Order, _maybeOrder?: Order): Promise<Order | any> {
    console.error(
        '[db] dbCreateOrder blocked: Cash on Delivery is disabled. All Laundelle orders must be placed and paid securely online via Stripe checkout.'
    );
    throw new Error(
        'Cash payment is not accepted. All orders must be placed and paid securely online via Stripe checkout.'
    );
}

export async function dbCancelOrder(_userId: string, orderId: string, reason: string = 'Customer requested cancellation'): Promise<{ success: boolean; error?: string }> {
    const local = getLocal<Order[]>(LOCAL_ORDERS_KEY, []);
    setLocal(
        LOCAL_ORDERS_KEY,
        local.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' as const, statusLabel: 'Cancelled', cancelReason: reason } : o))
    );
    try {
        const res = await apiFetch(`/api/v1/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            return { success: false, error: data.error?.message || data.error || 'Failed to cancel order' };
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('l2u_orders_change'));
        }
        return { success: true };
    } catch (e: any) {
        console.error('[db] dbCancelOrder:', e);
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbRescheduleOrder(
    _userId: string,
    orderId: string,
    newDate: string,
    newTime: string
): Promise<void> {
    const local = getLocal<Order[]>(LOCAL_ORDERS_KEY, []);
    setLocal(
        LOCAL_ORDERS_KEY,
        local.map((o) => (o.id === orderId ? { ...o, pickupDate: newDate, pickupSlot: newTime, pickupTime: newTime } : o))
    );
    try {
        await apiFetch(`/api/v1/orders/${orderId}/reschedule`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ newDate, newTime }),
        });
    } catch (e) {
        console.error('[db] dbRescheduleOrder:', e);
    }
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function dbFetchNotifications(_userId?: string): Promise<CustomerNotification[]> {
    try {
        const res = await apiFetch('/api/v1/notifications', {
            headers: authHeaders(),
        });
        const json = await res.json().catch(() => ({}));
        const data = json.success ? json.data : json;
        if (res.status === 401 || data?.code === 'UNAUTHORIZED' || data?.error === 'Authentication required') {
            clearSession();
            return getLocal<CustomerNotification[]>(LOCAL_NOTIF_KEY, []);
        }
        if (!res.ok || data?.error) {
            throw new Error(getErrorMessage(data?.error, !res.ok ? `HTTP ${res.status} Error fetching notifications` : 'Failed to fetch notifications'));
        }
        setLocal(LOCAL_NOTIF_KEY, data.items || []);
        return data.items || [];
    } catch (e: any) {
        if (!e?.message?.includes('Authentication required') && !e?.message?.includes('401')) {
            console.error('[db] dbFetchNotifications:', e?.message || e);
        }
        return getLocal<CustomerNotification[]>(LOCAL_NOTIF_KEY, []);
    }
}

export async function dbMarkNotificationRead(notificationId: string): Promise<void> {
    const local = getLocal<CustomerNotification[]>(LOCAL_NOTIF_KEY, []);
    setLocal(
        LOCAL_NOTIF_KEY,
        local.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    try {
        await apiFetch(`/api/v1/notifications/${notificationId}/read`, {
            method: 'PATCH',
            headers: authHeaders(),
        });
    } catch (e) {
        console.error('[db] dbMarkNotificationRead:', e);
    }
}

export async function dbMarkAllNotificationsRead(): Promise<void> {
    const local = getLocal<CustomerNotification[]>(LOCAL_NOTIF_KEY, []);
    setLocal(
        LOCAL_NOTIF_KEY,
        local.map((n) => ({ ...n, read: true }))
    );
    try {
        await apiFetch('/api/v1/notifications/read-all', {
            method: 'PATCH',
            headers: authHeaders(),
        });
    } catch (e) {
        console.error('[db] dbMarkAllNotificationsRead:', e);
    }
}

// ─── Support Tickets ─────────────────────────────────────────────────────────

export async function dbCreateSupportTicket(_userId: string, ticket: any): Promise<void> {
    try {
        await apiFetch('/api/v1/support/tickets', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ ticket }),
        });
    } catch (e) {
        console.error('[db] dbCreateSupportTicket:', e);
    }
}

export async function dbFetchStaff(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/admin/staff', {
            method: 'GET',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return [];
        return data.data?.staff || data.staff || [];
    } catch {
        return [];
    }
}

export async function dbFetchManagers(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/admin/staff?role=manager', {
            method: 'GET',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return [];
        const staff: any[] = data.data?.staff || data.staff || [];
        return staff.filter((s: any) => s.role === 'manager' || s.role === 'plant_manager');
    } catch {
        return [];
    }
}

export async function dbFetchManagerDetails(managerId: string): Promise<{ staff: any; plant: any | null; inheritedPostcodes: string[] } | null> {
    try {
        const res = await apiFetch(`/api/v1/admin/staff/${managerId}`, {
            method: 'GET',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return null;
        return data.data || data;
    } catch {
        return null;
    }
}


export async function dbCreateStaffMember(staffData: any): Promise<{ success: boolean; error?: string; staffId?: string; ticketUrl?: string }> {
    try {
        const { password, ...sanitized } = staffData || {};
        const res = await apiFetch('/api/v1/admin/staff', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(sanitized),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to create staff member' };
        }
        return { success: true, staffId: data.staffId, ticketUrl: data.ticketUrl };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbUpdateStaffMember(staffId: string, staffData: any): Promise<{ success: boolean; error?: string }> {
    try {
        const { password, ...sanitized } = staffData || {};
        const res = await apiFetch(`/api/v1/admin/staff/${staffId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(sanitized),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to update staff member' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbDeleteStaffMember(staffId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/admin/staff/${staffId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to delete staff member' };
        }
        return { success: true, message: data.message };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}


export async function dbFetchPlants(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/admin/plants', {
            method: 'GET',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return [];
        const list = data.data?.plants || data.plants || (Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export async function dbCreatePlant(plantData: any): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/admin/plants', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(plantData),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to create plant' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbUpdatePlant(plantId: string, plantData: any): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/admin/plants/${plantId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(plantData),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to update plant' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbFetchAdminDashboardMetrics(location?: string, dateFilter?: string, startDate?: string, endDate?: string): Promise<any> {
    try {
        const params = new URLSearchParams();
        if (location && location !== 'All Locations') {
            params.set('location', location);
        }
        if (dateFilter) {
            params.set('dateFilter', dateFilter);
        }
        if (startDate) {
            params.set('startDate', startDate);
        }
        if (endDate) {
            params.set('endDate', endDate);
        }
        const qs = params.toString();
        const url = qs ? `/api/v1/admin/metrics?${qs}` : '/api/v1/admin/metrics';
        const res = await apiFetch(url, {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return null;
        return data;
    } catch {
        return null;
    }
}

export async function dbFetchManagerDashboard(dateFilter?: string, startDate?: string, endDate?: string): Promise<any> {
    try {
        const params = new URLSearchParams();
        if (dateFilter) params.set('dateFilter', dateFilter);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const qs = params.toString();
        const url = qs ? `/api/v1/manager/dashboard?${qs}` : '/api/v1/manager/dashboard';
        const res = await apiFetch(url, {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return null;
        const data = (json.success && json.data && json.data.plantName) ? json.data : json;
        return data;
    } catch {
        return null;
    }
}

export async function dbFetchManagerOrders(status?: string, dateFilter?: string, startDate?: string, endDate?: string): Promise<any[]> {
    try {
        const DATE_KEYWORDS = ['today', 'yesterday', 'this week', 'this_week', 'this month', 'this_month', 'all time', 'all_time', 'custom', 'custom range'];
        let effectiveStatus = status;
        let effectiveDateFilter = dateFilter;
        let effectiveStartDate = startDate;
        let effectiveEndDate = endDate;

        // If the first argument is a date keyword, realign the parameters
        if (effectiveStatus && DATE_KEYWORDS.includes(effectiveStatus.toLowerCase())) {
            effectiveEndDate = startDate;
            effectiveStartDate = dateFilter;
            effectiveDateFilter = effectiveStatus;
            effectiveStatus = undefined;
        }

        const params = new URLSearchParams();
        if (effectiveStatus && effectiveStatus !== 'all') params.set('status', effectiveStatus);
        if (effectiveDateFilter && effectiveDateFilter !== 'all') params.set('dateFilter', effectiveDateFilter);
        if (effectiveStartDate) params.set('startDate', effectiveStartDate);
        if (effectiveEndDate) params.set('endDate', effectiveEndDate);
        const qs = params.toString();
        const url = qs ? `/api/v1/manager/orders?${qs}` : '/api/v1/manager/orders';
        const res = await apiFetch(url, {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return [];
        return Array.isArray(data) ? data : (data.orders || []);
    } catch {
        return [];
    }
}

export async function dbFetchManagerStaff(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/manager/staff', {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return [];
        const raw = json.data ?? json.staff ?? json;
        const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.staff) ? raw.staff : []);
        (arr as any).plantPincodes = json.plantPincodes || [];
        return arr;
    } catch {
        return [];
    }
}

export async function dbFetchManagerStaffData(): Promise<{ staff: any[]; plantPincodes: string[] }> {
    try {
        const res = await apiFetch('/api/v1/manager/staff', {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { staff: [], plantPincodes: [] };
        const raw = json.data ?? json.staff ?? json;
        const staff = Array.isArray(raw) ? raw : (Array.isArray(raw?.staff) ? raw.staff : []);
        return {
            staff,
            plantPincodes: Array.isArray(json.plantPincodes) ? json.plantPincodes : []
        };
    } catch {
        return { staff: [], plantPincodes: [] };
    }
}

export async function dbManagerUpdateStaff(staffId: string, staffData: any): Promise<{ success: boolean; error?: string }> {
    try {
        const { password, ...sanitized } = staffData || {};
        const res = await apiFetch(`/api/v1/manager/staff/${staffId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ staffData: sanitized }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to update staff member' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbManagerCreateStaff(staffData: any): Promise<{ success: boolean; error?: string; staffId?: string; ticketUrl?: string }> {
    try {
        const { password, ...sanitized } = staffData || {};
        const res = await apiFetch('/api/v1/manager/staff', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ staffData: sanitized }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to create staff member' };
        }
        return { success: true, staffId: data.staffId, ticketUrl: data.ticketUrl };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbManagerAssignDriver(orderId: string, driverId?: string | null): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/manager/orders/${encodeURIComponent(orderId)}/assign-driver`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ driverId }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error || 'Failed to assign driver' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbManagerAssignProcessor(orderId: string, processorId?: string | null): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/manager/orders/${encodeURIComponent(orderId)}/assign-processor`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ processorId }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error || 'Failed to assign processor' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbManagerOrderOverride(orderId: string, action: string, data?: any): Promise<{ success: boolean; error?: string; status?: string }> {
    try {
        const res = await apiFetch(`/api/v1/manager/orders/${encodeURIComponent(orderId)}/override`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ action, data }),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to perform override' };
        return { success: true, status: json.status };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbManagerBatchReassignOrders(orderIds: string[], targetId: string | null, type: 'driver' | 'processor'): Promise<{ success: boolean; error?: string; results?: any[] }> {
    try {
        const res = await apiFetch('/api/v1/manager/orders/batch-reassign', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ orderIds, targetId, type }),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to batch reassign orders' };
        return { success: true, results: json.results };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbManagerReassignAllDriverOrders(driverId: string, targetDriverId: string | null): Promise<{ success: boolean; error?: string; count?: number; message?: string }> {
    try {
        const res = await apiFetch(`/api/v1/manager/drivers/${encodeURIComponent(driverId)}/reassign-all`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ targetDriverId }),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to reassign driver orders' };
        return { success: true, count: json.count, message: json.message };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbFetchOrderAuditLogs(orderId: string): Promise<{ success: boolean; error?: string; logs?: any[] }> {
    try {
        const res = await apiFetch(`/api/v1/manager/orders/${encodeURIComponent(orderId)}/audit-logs`, {
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to fetch audit logs' };
        return { success: true, logs: json.logs || [] };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbFetchManagerIncidents(filters?: { status?: string; orderId?: string; type?: string; priority?: string }): Promise<{ success: boolean; error?: string; incidents?: any[] }> {
    try {
        const params = new URLSearchParams();
        if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
        if (filters?.orderId) params.set('orderId', filters.orderId);
        if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
        if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);

        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await apiFetch(`/api/v1/manager/incidents${qs}`, {
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to fetch incidents' };
        return { success: true, incidents: json.incidents || [] };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbCreateManagerIncident(incidentData: any): Promise<{ success: boolean; error?: string; incident?: any }> {
    try {
        const res = await apiFetch('/api/v1/manager/incidents', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(incidentData),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to file incident' };
        return { success: true, incident: json.incident };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbAddIncidentNote(incidentId: string, note: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/manager/incidents/${encodeURIComponent(incidentId)}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ note }),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to add note' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbResolveIncident(incidentId: string, resolutionData: { type: string; amount?: number; creditVoucherCode?: string; explanation: string }): Promise<{ success: boolean; error?: string; status?: string }> {
    try {
        const res = await apiFetch(`/api/v1/manager/incidents/${encodeURIComponent(incidentId)}/resolve`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(resolutionData),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to resolve incident' };
        return { success: true, status: json.status };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbAdminFetchOrders(status?: string): Promise<any[]> {
    try {
        const session = getStoredSession();
        const isManager = session?.user?.role === 'manager';
        const baseEndpoint = isManager ? '/api/v1/manager/orders' : '/api/v1/admin/orders';
        const url = status && status !== 'all'
            ? `${baseEndpoint}?status=${encodeURIComponent(status)}`
            : baseEndpoint;

        const res = await apiFetch(url, {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return [];
        return Array.isArray(data) ? data : (data.orders || []);
    } catch {
        return [];
    }
}

export async function dbAdminUpdateOrderStatus(
    orderId: string,
    newStatus: string,
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const session = getStoredSession();
        const isManager = session?.user?.role === 'manager';
        const endpoint = isManager 
            ? `/api/v1/manager/orders/${orderId}/status` 
            : `/api/v1/admin/orders/${orderId}/status`;
        const res = await apiFetch(endpoint, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ newStatus, reason }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error || 'Failed to update order status' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbFetchPostcodeSectors(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/platform/postcodes', {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return [];
        return data.postcodes || [];
    } catch {
        return [];
    }
}

export async function dbUpdatePostcodeSector(district: string, sector: string, updates: any): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/platform/postcodes/${district}-${sector}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(updates),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error?.message || 'Failed to update postcode sector' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbSearchPostcodeDistricts(query: string): Promise<string[]> {
    if (!query || !query.trim()) return [];
    try {
        const res = await apiFetch(`/api/v1/platform/postcodes/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: authHeaders(),
        });
        if (res.ok) {
            const json = await res.json();
            const data = json.success ? json.data : json;
            if (Array.isArray(data.districts)) {
                return data.districts;
            }
        }
    } catch (e) {
        console.error('Error searching postcode districts:', e);
    }
    return [];
}


export async function dbFetchSlots(params?: { postcode?: string; plant_id?: string }): Promise<any[]> {
    try {
        const searchParams = new URLSearchParams();
        if (params?.postcode) searchParams.set('postcode', params.postcode);
        if (params?.plant_id) searchParams.set('plant_id', params.plant_id);
        const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
        const res = await apiFetch(`/api/v1/platform/slots${query}`, {
            method: 'GET',
            headers: authHeaders(),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || data.error) return [];
        return Array.isArray(data) ? data : (data.slots || []);
    } catch {
        return [];
    }
}

export async function dbCreateSlot(slotData: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/platform/slots', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(slotData)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            return { success: false, error: json.error?.message || json.error || 'Failed to create slot' };
        }
        return { success: true, data: json.data };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbUpdateSlot(slotId: string, updates: any): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/platform/slots/${slotId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(updates)
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            return { success: false, error: json.error?.message || json.error || 'Failed to update slot' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbDeleteSlot(slotId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/platform/slots/${slotId}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            return { success: false, error: json.error?.message || json.error || 'Failed to delete slot' };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}


// ─── Driver API ───────────────────────────────────────────────────────────────

export async function dbDriverFetchAssignments(): Promise<{ driver: any; assigned: any[]; completed: any[]; available_deliveries: any[] }> {
    try {
        const res = await apiFetch('/api/v1/driver/jobs', {
            method: 'GET',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { driver: null, assigned: [], completed: [], available_deliveries: [] };
        return { driver: data.driver, assigned: data.assigned || [], completed: data.completed || [], available_deliveries: data.available_deliveries || [] };
    } catch {
        return { driver: null, assigned: [], completed: [], available_deliveries: [] };
    }
}

export async function dbDriverUpdateAvailability(availability: 'available' | 'busy' | 'offline'): Promise<{ success: boolean; error?: string; queuedAssigned?: number; isAvailable?: boolean }> {
    try {
        const res = await apiFetch('/api/v1/driver/availability', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ isAvailable: availability === 'available', availability }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true, queuedAssigned: data.queuedAssigned, isAvailable: data.isAvailable };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverMarkArrived(orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/arrive`, {
            method: 'POST',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverSendOtp(orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/otp/send`, {
            method: 'POST',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverConfirmPickup(
    orderId: string,
    otp: string,
    photoUrls?: string[] | string,
    pieceCount?: number
): Promise<{ success: boolean; error?: string }> {
    try {
        const photos = Array.isArray(photoUrls)
            ? photoUrls
            : photoUrls
            ? [photoUrls]
            : [];
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/pickup/confirm`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ otp, qrTagId: `qr_${orderId}`, bagCount: 1, pieceCount, photoUrls: photos }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverRejectJob(orderId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/reject`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverAcceptDelivery(orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/delivery/accept`, {
            method: 'POST',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverRejectDelivery(orderId: string, reason: string): Promise<{ success: boolean; error?: string; reassignedDriverId?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/delivery/reject`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ reason }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true, reassignedDriverId: data.reassignedDriverId };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverConfirmPackageHandover(orderId: string, packageQr: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/handover/confirm`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ packageQr }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverStartDelivery(orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/delivery/start`, {
            method: 'POST',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbDriverConfirmDelivery(
    orderId: string,
    otp: string,
    notes?: string,
    photoUrls?: string[],
    signatureUrl?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/driver/jobs/${orderId}/delivery/confirm`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                otp,
                notes: notes || '',
                photoUrls: photoUrls || [],
                signatureUrl: signatureUrl || ''
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── Processor API ────────────────────────────────────────────────────────────

export async function dbProcessorFetchJobs(): Promise<{ processor: any; assigned: any[]; queue: any[]; completed: any[] }> {
    try {
        const res = await apiFetch('/api/v1/processor/jobs', {
            method: 'GET',
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok || data.error) return { processor: null, assigned: [], queue: [], completed: [] };
        return {
            processor: data.processor,
            assigned: data.assigned || [],
            queue: data.queue || [],
            completed: data.completed || []
        };
    } catch {
        return { processor: null, assigned: [], queue: [], completed: [] };
    }
}

export async function dbProcessorUpdateAvailability(availability: 'available' | 'busy' | 'offline'): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/processor/availability', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ availability }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbProcessorIntakeOrder(
    orderId: string,
    actualWeightKg: number,
    photoUrls: string[],
    bagCondition: string,
    restrictedItems: string[],
    processingAction?: string
): Promise<{ success: boolean; error?: string; additionalCharge?: any; newStatus?: string; packageObj?: any }> {
    try {
        const res = await apiFetch(`/api/v1/processor/jobs/${encodeURIComponent(orderId)}/intake`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                actualWeightKg,
                photoUrls,
                bagCondition,
                restrictedItems,
                processingAction: processingAction || 'washing'
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return {
            success: true,
            additionalCharge: data.additionalCharge,
            newStatus: data.newStatus,
            packageObj: data.packageObj
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbProcessorUpdateStage(
    orderId: string,
    qrCode: string,
    nextStage: 'washing' | 'drying' | 'folding' | 'qc_ready'
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/processor/jobs/${orderId}/stage`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                qrCode,
                nextStage
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbProcessorQualityCheck(
    orderId: string,
    status: 'passed' | 'rewash',
    notes: string,
    reason?: string
): Promise<{ success: boolean; error?: string; status?: string; reassigned?: boolean }> {
    try {
        const res = await apiFetch(`/api/v1/processor/jobs/${orderId}/qc`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                status,
                notes,
                reason
            }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return {
            success: true,
            status: data.status,
            reassigned: data.reassigned
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── Admin CRM & Real Data Helpers ───────────────────────────────────────────

export async function dbAdminFetchCustomers(search?: string, status?: string): Promise<{ customers: any[]; flags: any[]; notes: any[] }> {
    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status && status !== 'all') params.append('status', status);
        const res = await apiFetch(`/api/v1/admin/customers?${params.toString()}`, {
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { customers: [], flags: [], notes: [] };
        return {
            customers: data.customers || [],
            flags: data.flags || [],
            notes: data.notes || []
        };
    } catch {
        return { customers: [], flags: [], notes: [] };
    }
}

export async function dbFetchManagerCustomers(search?: string, status?: string): Promise<{ customers: any[]; flags: any[]; notes: any[] }> {
    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status && status !== 'all') params.append('status', status);
        const qs = params.toString();
        const res = await apiFetch(qs ? `/api/v1/manager/customers?${qs}` : '/api/v1/manager/customers', {
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { customers: [], flags: [], notes: [] };
        return {
            customers: data.customers || data.data || [],
            flags: data.flags || [],
            notes: data.notes || []
        };
    } catch {
        return { customers: [], flags: [], notes: [] };
    }
}


export async function dbAdminAddCustomerFlag(flagData: any): Promise<{ success: boolean; flag?: any; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/admin/customers', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ action: 'flag', flagData }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true, flag: data.flag };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbAdminAddCustomerNote(customerId: string, note: string): Promise<{ success: boolean; note?: any; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/admin/customers', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ action: 'note', customerId, note }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true, note: data.note };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbAdminUpdateCustomerStatus(customerId: string, status: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/admin/customers', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ action: 'status', customerId, status }),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbAdminDeleteCustomer(customerId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/admin/customers/${customerId}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            const msg = typeof data.error === 'string' ? data.error : data.error?.message;
            return { success: false, error: msg || 'Failed to delete customer' };
        }
        return { success: true, message: data.message };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}


export async function dbAdminFetchServices(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/admin/services', {
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return [];
        return data.services || [];
    } catch {
        return [];
    }
}

export async function dbAdminCreateService(serviceData: any): Promise<{ success: boolean; service?: any; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/admin/services', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(serviceData),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true, service: data.service };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbAdminUpdateService(serviceId: string, serviceData: any): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/admin/services/${serviceId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(serviceData),
        });
        const data = await res.json();
        if (!res.ok || data.error) return { success: false, error: data.error };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function dbAdminFetchFinance(): Promise<any> {
    try {
        const res = await apiFetch('/api/v1/admin/finance', {
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return null;
        return data;
    } catch {
        return null;
    }
}

export async function dbAdminFetchReports(range = '7_days'): Promise<any> {
    try {
        const res = await apiFetch(`/api/v1/admin/reports?range=${range}`, {
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return null;
        return data;
    } catch {
        return null;
    }
}

export async function dbAdminFetchAuditLogs(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/admin/audit-logs', {
            headers: authHeaders(),
        });
        const data = await res.json();
        if (!res.ok || data.error) return [];
        return data.logs || [];
    } catch {
        return [];
    }
}

// ─── Coupons & Pricing Charges ───────────────────────────────────────────────────

export async function dbFetchPricingCharges(): Promise<any> {
    try {
        const res = await apiFetch('/api/v1/platform/pricing-charges');
        const json = await res.json();
        if (!res.ok || json.error) return null;
        return json.success ? json.data : json;
    } catch (e) {
        console.error('dbFetchPricingCharges error:', e);
        return null;
    }
}

export async function dbUpdatePricingCharges(updates: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/platform/pricing-charges', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(),
            },
            body: JSON.stringify(updates),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to update pricing charges' };
        return { success: true, data: json.success ? json.data : json };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbFetchAdminCoupons(): Promise<any[]> {
    try {
        const res = await apiFetch('/api/v1/platform/coupons', {
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return [];
        return json.success ? json.data : (Array.isArray(json) ? json : []);
    } catch (e) {
        console.error('dbFetchAdminCoupons error:', e);
        return [];
    }
}

export async function dbCreateCoupon(couponData: any): Promise<{ success: boolean; coupon?: any; error?: string }> {
    try {
        const res = await apiFetch('/api/v1/platform/coupons', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(),
            },
            body: JSON.stringify(couponData),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to create coupon' };
        return { success: true, coupon: json.success ? json.data : json };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbUpdateCoupon(id: string, updates: any): Promise<{ success: boolean; coupon?: any; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/platform/coupons/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(),
            },
            body: JSON.stringify(updates),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to update coupon' };
        return { success: true, coupon: json.success ? json.data : json };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbDeleteCoupon(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await apiFetch(`/api/v1/platform/coupons/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { success: false, error: json.error || 'Failed to delete coupon' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

export async function dbValidateCoupon(code: string, subtotal: number): Promise<{
    valid: boolean;
    discountAmount?: number;
    coupon?: any;
    message?: string;
}> {
    try {
        const res = await apiFetch('/api/v1/platform/coupons/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, subtotal }),
        });
        const json = await res.json();
        const data = json.success ? json.data : json;
        if (!res.ok || json.error) {
            return { valid: false, message: json.error || 'Failed to validate coupon' };
        }
        return data;
    } catch (e: any) {
        return { valid: false, message: e.message || 'Network error validating promo code' };
    }
}

export async function dbSubmitOrderRating(
    orderId: string,
    rating?: number | null,
    feedback?: string
): Promise<{ success: boolean; error?: string; order?: Order; rating?: any }> {
    const local = getLocal<Order[]>(LOCAL_ORDERS_KEY, []);
    const now = new Date().toISOString();
    const ratingObj = {
        rating: rating !== undefined && rating !== null ? Number(rating) : null,
        feedback: feedback ? String(feedback).trim() : '',
        createdAt: now
    };

    setLocal(
        LOCAL_ORDERS_KEY,
        local.map((o) =>
            o.id === orderId || (o as any)._id === orderId
                ? {
                    ...o,
                    rating: ratingObj.rating ?? undefined,
                    ratingFeedback: ratingObj.feedback,
                    ratingSubmittedAt: now,
                    customerRating: ratingObj
                }
                : o
        )
    );

    try {
        const res = await apiFetch(`/api/v1/orders/${orderId}/rating`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ rating, feedback }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            return { success: false, error: data.error?.message || data.error || 'Failed to submit rating' };
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('l2u_orders_change'));
        }
        return { success: true, order: data.data?.order, rating: data.data?.rating || ratingObj };
    } catch (e: any) {
        console.error('[db] dbSubmitOrderRating:', e);
        return { success: false, error: e.message || 'Network error' };
    }
}



