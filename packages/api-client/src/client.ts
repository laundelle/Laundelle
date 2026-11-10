import { Order, UserProfile, UserAddress, UserPreferences, ServiceItem } from '@laundelle/types';
import { getAuthToken } from '@laundelle/auth';

import { getApiBase } from './compat';

declare const process: any;

export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null | Promise<string | null>;
  getRefreshToken?: () => string | null | Promise<string | null>;
  onTokenRefresh?: (tokens: { accessToken: string; refreshToken?: string }) => void | Promise<void>;
  onAuthFailure?: () => void | Promise<void>;
  auth0Domain?: string;
  auth0ClientId?: string;
}

export interface CreateManagerInput {
  name: string;
  email: string;
  phone?: string;
  plant_id?: string | null;
  assigned_postcodes?: string[];
  [key: string]: any;
}

export interface CreateDriverInput {
  name: string;
  email: string;
  phone?: string;
  vehicle?: string;
  vehicle_type?: string;
  vehicle_reg?: string;
  license_number?: string;
  emergency_contact?: { name: string; phone: string };
  manager_id?: string;
  plant_id?: string;
  [key: string]: any;
}

export interface CreateProcessorInput {
  name: string;
  email: string;
  phone?: string;
  shift?: string;
  skills?: string[];
  station?: string;
  manager_id?: string;
  plant_id?: string;
  [key: string]: any;
}

export class LaundelleApiClient {
  private baseUrl: string;
  private getToken: () => string | null | Promise<string | null>;
  private getRefreshToken?: () => string | null | Promise<string | null>;
  private onTokenRefresh?: (tokens: { accessToken: string; refreshToken?: string }) => void | Promise<void>;
  private onAuthFailure?: () => void | Promise<void>;
  private auth0Domain?: string;
  private auth0ClientId?: string;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(options: ApiClientOptions = {}) {
    const defaultBase = options.baseUrl !== undefined ? options.baseUrl : getApiBase();
    this.baseUrl = (defaultBase || '').replace(/\/$/, '');
    this.getToken = options.getToken || getAuthToken;
    this.getRefreshToken = options.getRefreshToken;
    this.onTokenRefresh = options.onTokenRefresh;
    this.onAuthFailure = options.onAuthFailure;
    this.auth0Domain = options.auth0Domain;
    this.auth0ClientId = options.auth0ClientId;
  }

  /**
   * Executes a single-flight token refresh against Auth0 using the refresh_token grant.
   * Concurrent 401 failures coalesce onto this single ongoing promise.
   */
  private async executeTokenRefresh(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        if (!this.getRefreshToken || !this.auth0Domain || !this.auth0ClientId) {
          return null;
        }

        const currentRefreshToken = await this.getRefreshToken();
        if (!currentRefreshToken) {
          return null;
        }

        const tokenUrl = `https://${this.auth0Domain.replace(/\/$/, '')}/oauth/token`;
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: this.auth0ClientId,
            refresh_token: currentRefreshToken,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.access_token) {
          // Token reuse detected or refresh token revoked/expired
          if (data.error === 'invalid_grant' || data.error === 'unauthorized' || res.status === 400 || res.status === 401) {
            if (this.onAuthFailure) {
              await this.onAuthFailure();
            }
          }
          return null;
        }

        const newAccessToken = data.access_token;
        const newRefreshToken = data.refresh_token || currentRefreshToken;

        if (this.onTokenRefresh) {
          await this.onTokenRefresh({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          });
        }

        return newAccessToken;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = await this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const method = (options.method || 'GET').toUpperCase();
    const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);
    
    // For non-idempotent requests (POST/PATCH), ensure idempotency key safeguard is present if retried
    if (!isIdempotent && !headers['Idempotency-Key'] && !headers['idempotency-key'] && !headers['X-Idempotency-Key']) {
      headers['Idempotency-Key'] = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Safeguard: Retry at most once only on confirmed token-expiration 401
    if (response.status === 401 && !isRetry && this.getRefreshToken) {
      const wwwAuth = response.headers.get('www-authenticate') || '';
      // Clone response to inspect error code without consuming body
      let isTokenExpired = true;
      try {
        const errorPeek = await response.clone().json();
        // If error is specifically an account ban or CSRF, do not treat as expired token
        if (errorPeek?.code === 'ACCOUNT_DEACTIVATED' || errorPeek?.code === 'FORBIDDEN' || errorPeek?.code === 'CSRF_VALIDATION_FAILED') {
          isTokenExpired = false;
        }
      } catch {
        // If body is not JSON, check WWW-Authenticate header
        if (wwwAuth && !wwwAuth.includes('invalid_token') && !wwwAuth.includes('expired') && !wwwAuth.includes('Bearer')) {
          isTokenExpired = false;
        }
      }

      if (isTokenExpired) {
        const refreshedToken = await this.executeTokenRefresh();
        if (refreshedToken) {
          return this.request<T>(endpoint, options, true);
        }
      }
    }

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = json?.error?.message || json?.error || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    return json.success && json.data !== undefined ? json.data : json;
  }

  // Auth Endpoints
  public auth = {
    login: (credentials: { email: string; password: string }) =>
      this.request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    register: (userData: any) =>
      this.request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
    logout: () =>
      this.request('/api/v1/auth/logout', { method: 'POST' }),
    auth0Sync: (payload: { email: string; name?: string; sub?: string; picture?: string; portal?: string }, accessToken?: string) =>
      this.request('/api/v1/auth/auth0-sync', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: JSON.stringify(payload),
      }),
    verifyEmail: (payload: { email: string; token: string }) =>
      this.request('/api/v1/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  };

  // Orders
  public orders = {
    get: (orderId?: string) =>
      this.request(orderId ? `/api/v1/orders/${orderId}` : '/api/v1/orders'),
    create: (orderData: Partial<Order>) =>
      this.request('/api/v1/orders', { method: 'POST', body: JSON.stringify(orderData) }),
    update: (orderId: string, updates: any) =>
      this.request(`/api/v1/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    cancel: (orderId: string, reason?: string) =>
      this.request(`/api/v1/orders/${orderId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
    reschedule: (orderId: string, date: string, slot: string) =>
      this.request(`/api/v1/orders/${orderId}/reschedule`, { method: 'POST', body: JSON.stringify({ date, slot }) }),
  };

  // Payments
  public payments = {
    createCheckoutSession: (orderId: string, origin: string) =>
      this.request('/api/v1/payments/create-checkout-session', { method: 'POST', body: JSON.stringify({ orderId, origin }) }),
    verifySession: (sessionId: string) =>
      this.request(`/api/v1/payments/confirm-session?session_id=${encodeURIComponent(sessionId)}`),
  };

  // Customer
  public customer = {
    getProfile: (userId?: string) =>
      this.request(`/api/v1/users/profile${userId ? `?userId=${userId}` : ''}`),
    updateProfile: (profileData: Partial<UserProfile>) =>
      this.request('/api/v1/users/profile', { method: 'PUT', body: JSON.stringify(profileData) }),
    updatePreferences: (prefs: UserPreferences) =>
      this.request('/api/v1/users/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
    createAddress: (address: UserAddress) =>
      this.request('/api/v1/users/addresses', { method: 'POST', body: JSON.stringify(address) }),
    getServices: () =>
      this.request<ServiceItem[]>('/api/v1/platform/services'),
    checkCoverage: (postcode: string) =>
      this.request(`/api/v1/plants/coverage?postcode=${encodeURIComponent(postcode)}`),
  };

  // Driver
  public driver = {
    getJobs: () =>
      this.request('/api/v1/driver/jobs').catch(() => this.request('/api/v1/driver/assignments')),
    updateAvailability: (availability: 'available' | 'busy' | 'offline') =>
      this.request('/api/v1/driver/availability', { method: 'POST', body: JSON.stringify({ availability }) }),
    markArrived: (orderId: string) =>
      this.request(`/api/v1/driver/jobs/${orderId}/arrive`, { method: 'POST' }),
    sendOtp: (orderId: string) =>
      this.request(`/api/v1/driver/jobs/${orderId}/otp`, { method: 'POST' }),
    confirmPickup: (orderId: string, payload: { pin?: string; otp?: string; qrTagId: string; bagCount?: number; pieceCount?: number; photoUrls?: string[]; notes?: string; location?: any }) =>
      this.request(`/api/v1/driver/jobs/${orderId}/pickup/confirm`, { method: 'POST', body: JSON.stringify(payload) }),
    failPickup: (orderId: string, payload: { reason: string; notes?: string; photoUrls?: string[]; location?: any }) =>
      this.request(`/api/v1/driver/jobs/${orderId}/pickup/fail`, { method: 'POST', body: JSON.stringify(payload) }),
    startDelivery: (orderId: string) =>
      this.request(`/api/v1/driver/jobs/${orderId}/delivery/start`, { method: 'POST' }),
    confirmDelivery: (orderId: string, payload: { pin?: string; otp?: string; signatureUrl?: string; photoUrls?: string[]; recipientName?: string; notes?: string; location?: any }) =>
      this.request(`/api/v1/driver/jobs/${orderId}/delivery/confirm`, { method: 'POST', body: JSON.stringify(payload) }),
    failDelivery: (orderId: string, payload: { reason: string; notes?: string; photoUrls?: string[]; location?: any }) =>
      this.request(`/api/v1/driver/jobs/${orderId}/delivery/fail`, { method: 'POST', body: JSON.stringify(payload) }),
  };

  // Processor
  public processor = {
    getJobs: () =>
      this.request('/api/v1/processor/jobs'),
    updateAvailability: (availability: 'available' | 'busy' | 'offline') =>
      this.request('/api/v1/processor/availability', { method: 'POST', body: JSON.stringify({ availability }) }),
    recordIntake: (orderId: string, payload: { weightKg?: number; photoUrls?: string[]; bagCount?: number; pieceCount?: number; notes?: string }) =>
      this.request(`/api/v1/processor/jobs/${orderId}/intake`, { method: 'POST', body: JSON.stringify(payload) }),
    updateStage: (orderId: string, payload: { qrCode?: string; nextStage: string; machineInfo?: any }) =>
      this.request(`/api/v1/processor/jobs/${orderId}/stage`, { method: 'POST', body: JSON.stringify(payload) }),
    qualityCheck: (orderId: string, payload: { status: 'passed' | 'rewash' | 'failed'; notes?: string; reason?: string; checklist?: any; itemChecks?: any }) =>
      this.request(`/api/v1/processor/jobs/${orderId}/qc`, { method: 'POST', body: JSON.stringify(payload) }),
  };

  // Manager
  public manager = {
    getDashboard: () =>
      this.request('/api/v1/manager/dashboard'),
    getOrders: (status?: string) =>
      this.request(`/api/v1/manager/orders${status ? `?status=${status}` : ''}`),
    getDrivers: () =>
      this.request('/api/v1/manager/staff?role=driver'),
    getProcessors: () =>
      this.request('/api/v1/manager/staff?role=processor'),
    assignDriver: (orderId: string, driverId: string | null) =>
      this.request('/api/v1/manager/assign-driver', { method: 'POST', body: JSON.stringify({ orderId, driverId }) }),
    assignProcessor: (orderId: string, processorId: string | null) =>
      this.request('/api/v1/manager/assign-processor', { method: 'POST', body: JSON.stringify({ orderId, processorId }) }),
    orderOverride: (orderId: string, action: string, data?: any) =>
      this.request('/api/v1/manager/order-override', { method: 'POST', body: JSON.stringify({ orderId, action, data }) }),
    getIncidents: (filters?: any) =>
      this.request('/api/v1/manager/incidents'),
  };

  // Admin
  public admin = {
    getMetrics: () =>
      this.request('/api/v1/admin/dashboard'),
    getUsers: () =>
      this.request('/api/v1/admin/users'),
    getCustomers: (search?: string) =>
      this.request(`/api/v1/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    getOrders: (status?: string) =>
      this.request(`/api/v1/admin/orders${status ? `?status=${status}` : ''}`),
    updateOrderStatus: (orderId: string, status: string, notes?: string) =>
      this.request(`/api/v1/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }),
    getPlants: () =>
      this.request('/api/v1/admin/plants'),
    getStaff: () =>
      this.request('/api/v1/admin/staff'),
    getFinance: () =>
      this.request('/api/v1/admin/finance'),
    getReports: (range = '7_days') =>
      this.request(`/api/v1/admin/reports?range=${range}`),
    getAuditLogs: () =>
      this.request('/api/v1/admin/audit-logs'),
    deleteStaff: (staffId: string) =>
      this.request(`/api/v1/admin/staff/${staffId}`, { method: 'DELETE' }),
    deleteCustomer: (customerId: string) =>
      this.request(`/api/v1/admin/customers/${customerId}`, { method: 'DELETE' }),
  };

  // Users (Auth0 Provisioning & Profile Management)
  public users = {
    getMe: () =>
      this.request('/api/v1/users/me'),
    getManagers: () =>
      this.request('/api/v1/users/managers'),
    createManager: (data: CreateManagerInput) => {
      const { password, ...payload } = (data || {}) as any;
      return this.request('/api/v1/users/managers', { method: 'POST', body: JSON.stringify(payload) });
    },
    getDrivers: (plantId?: string) =>
      this.request(`/api/v1/users/drivers${plantId ? `?plantId=${encodeURIComponent(plantId)}` : ''}`),
    createDriver: (data: CreateDriverInput) => {
      const { password, ...payload } = (data || {}) as any;
      return this.request('/api/v1/users/drivers', { method: 'POST', body: JSON.stringify(payload) });
    },
    getProcessors: (plantId?: string) =>
      this.request(`/api/v1/users/processors${plantId ? `?plantId=${encodeURIComponent(plantId)}` : ''}`),
    createProcessor: (data: CreateProcessorInput) => {
      const { password, ...payload } = (data || {}) as any;
      return this.request('/api/v1/users/processors', { method: 'POST', body: JSON.stringify(payload) });
    },
    updateUser: (userId: string, data: any) => {
      const { password, ...payload } = (data || {}) as any;
      return this.request(`/api/v1/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    updateStatus: (userId: string, statusData: any) =>
      this.request(`/api/v1/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify(statusData) }),
    deleteUser: (userId: string) =>
      this.request(`/api/v1/users/${userId}`, { method: 'DELETE' }),
  };
}

// Default global instance
export const api = new LaundelleApiClient();
