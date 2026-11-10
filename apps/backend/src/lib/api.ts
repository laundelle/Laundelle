import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { verifyJwt, verifyJwtAsync, syncRevokedTokens, JwtPayload } from './auth';
import { getDb } from './mongodb';
import { hasPermission, normalizeRole } from '@laundelle/auth';
import { AuditService } from '@/services/AuditService';
import { generateStaffId } from '@laundelle/ids';
import { SessionService, SessionDoc } from '@/services/SessionService';

// ---------------------------------------------------------------------------
// Standard API Responses & Security Headers
// ---------------------------------------------------------------------------

export const secureAuthResponseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
};

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
}

import { corsHeaders, getCorsHeaders, handleOptions } from './cors';
export { handleOptions };

export function successResponse<T>(data: T, status: number = 200, additionalHeaders?: HeadersInit) {
    return NextResponse.json({ success: true, data }, { 
        status,
        headers: {
            ...corsHeaders,
            ...secureAuthResponseHeaders,
            ...(additionalHeaders as Record<string, string> || {}),
        }
    });
}

export function errorResponse(code: string, message: string, status: number = 400, details?: any, additionalHeaders?: HeadersInit) {
    return NextResponse.json({
        success: false,
        error: { code, message, details }
    }, { 
        status,
        headers: {
            ...corsHeaders,
            ...secureAuthResponseHeaders,
            ...(additionalHeaders as Record<string, string> || {}),
        }
    });
}

// ---------------------------------------------------------------------------
// HTTP Error Class for Service Layer
// ---------------------------------------------------------------------------

export class ApiError extends Error {
    public code: string;
    public status: number;
    public details?: any;

    constructor(message: string, code: string = 'INTERNAL_ERROR', status: number = 500, details?: any) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message: string = 'Authentication required') {
        super(message, 'UNAUTHORIZED', 401);
    }
}

export class ForbiddenError extends ApiError {
    constructor(message: string = 'Access denied') {
        super(message, 'FORBIDDEN', 403);
    }
}

export class NotFoundError extends ApiError {
    constructor(message: string = 'Resource not found') {
        super(message, 'NOT_FOUND', 404);
    }
}

export class BadRequestError extends ApiError {
    constructor(message: string = 'Bad request', details?: any) {
        super(message, 'BAD_REQUEST', 400, details);
    }
}

// ---------------------------------------------------------------------------
// JWT Extraction Helper
// ---------------------------------------------------------------------------

export function getAuthenticatedUser(req: NextRequest): JwtPayload | null {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = verifyJwt(token);
        if (user) return user;
    }
    // Cookie-based session extraction fallback
    const cookieToken = req.cookies.get('laundelle_token')?.value || req.cookies.get('l2u_token')?.value;
    if (cookieToken) {
        return verifyJwt(cookieToken);
    }
    return null;
}

export async function getAuthenticatedUserAsync(req: NextRequest): Promise<JwtPayload | null> {
    // 1. Primary API / Mobile flow: Authorization Bearer header
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = await verifyJwtAsync(token);
        if (user) return user;
    }

    // 2. Web Portal BFF flow: Server-side Session Cookie with Anti-CSRF protection
    const sessionId = 
        req.cookies.get('__Host-laundelle_customer_session')?.value ||
        req.cookies.get('__Host-laundelle_ops_session')?.value ||
        req.cookies.get('__Host-laundelle_admin_session')?.value ||
        req.cookies.get('__Host-laundelle_session')?.value ||
        req.cookies.get('laundelle_customer_session')?.value ||
        req.cookies.get('laundelle_ops_session')?.value ||
        req.cookies.get('laundelle_admin_session')?.value ||
        req.cookies.get('laundelle_session')?.value;

    if (sessionId) {
        const session = await SessionService.getSession(sessionId);
        if (session) {
            // Anti-CSRF validation for cookie-authenticated mutating requests
            if (!SessionService.validateCsrf(session, req)) {
                throw new ApiError(
                    'Cross-Site Request Forgery (CSRF) validation failed. Please refresh your browser.',
                    'CSRF_VALIDATION_FAILED',
                    403
                );
            }
            return {
                sub: session.userId,
                userId: session.userId,
                publicId: session.publicId || session.userId,
                auth0UserId: session.auth0UserId,
                email: session.email,
                role: session.role,
                plantId: session.plantId,
                portal: session.portal,
                sessionId: session.sessionId,
                exp: Math.floor(new Date(session.expiresAt).getTime() / 1000),
                iat: Math.floor(new Date(session.createdAt).getTime() / 1000),
            };
        }
    }

    // 3. Legacy cookie-based token fallback during migration
    const cookieToken = req.cookies.get('laundelle_token')?.value || req.cookies.get('l2u_token')?.value;
    if (cookieToken) {
        const method = req.method.toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const secFetchSite = req.headers.get('sec-fetch-site');
            const origin = req.headers.get('origin');
            const host = req.headers.get('host');
            if (secFetchSite && secFetchSite !== 'same-origin' && origin && host && !origin.includes(host)) {
                throw new ApiError('Cross-Site Request Forgery (CSRF) detected on legacy cookie request.', 'CSRF_VALIDATION_FAILED', 403);
            }
        }
        return verifyJwtAsync(cookieToken);
    }

    return null;
}

export function requireAuth(req: NextRequest): JwtPayload {
    const user = getAuthenticatedUser(req);
    if (!user) {
        throw new UnauthorizedError();
    }
    return user;
}

export async function requireAuthAsync(req: NextRequest): Promise<JwtPayload> {
    const user = await getAuthenticatedUserAsync(req);
    if (!user) {
        throw new UnauthorizedError();
    }
    return user;
}

// ---------------------------------------------------------------------------
// Laundelle User Resolution & RBAC Authorization
// ---------------------------------------------------------------------------

export interface AuthenticatedContext {
    token: JwtPayload;
    dbUser: any;
}

/**
 * Resolves a Laundelle user profile from MongoDB given a verified JWT payload.
 * Matches by auth0UserId, auth0_sub, internal _id, or email.
 * Ensures the account is active and not suspended.
 */
export async function resolveLaundelleUser(tokenPayload: JwtPayload): Promise<any> {
    if (!tokenPayload) return null;
    const db = await getDb();
    const sub = tokenPayload.sub;
    const auth0UserId = tokenPayload.auth0UserId || sub;
    const email = tokenPayload.email ? String(tokenPayload.email).toLowerCase().trim() : null;

    const queryConditions: any[] = [];
    if (auth0UserId) {
        queryConditions.push({ auth0UserId });
        queryConditions.push({ auth0_sub: auth0UserId });
    }
    if (sub) {
        queryConditions.push({ _id: sub });
        if (ObjectId.isValid(sub)) {
            queryConditions.push({ _id: new ObjectId(sub) });
        }
        queryConditions.push({ publicId: sub });
        queryConditions.push({ id: sub });
    }

    const envAdminEmails = [
        process.env.ADMIN_EMAIL,
        ...(process.env.ADDITIONAL_ADMIN_EMAILS || '').split(','),
    ].filter(Boolean).map(e => String(e).trim().toLowerCase());

    const isDesignatedAdminEmail = Boolean(email && envAdminEmails.includes(email));

    if (email && (tokenPayload.emailVerified === true || tokenPayload.isLegacyToken || isDesignatedAdminEmail)) {
        queryConditions.push({ email });
    }

    if (queryConditions.length === 0) return null;

    let user = await db.collection('users').findOne({ $or: queryConditions });

    if (user) {
        const isStaff = ['super_admin', 'admin', 'plant_manager', 'driver', 'processor'].includes(user.role);
        if (isStaff) {
            const matchesSub = user.auth0UserId === auth0UserId || 
                               user.auth0_sub === auth0UserId || 
                               String(user._id) === sub ||
                               user.publicId === sub ||
                               user.id === sub ||
                               (user.email && email && user.email === email && (tokenPayload.isLegacyToken || isDesignatedAdminEmail));
            if (!matchesSub) {
                // Deny unlinked identity from assuming staff profile by email alone
                return null;
            }
        }
    }

    // Secure Just-in-Time (JIT) Super Admin Bootstrap
    // Triggered strictly when a verified Auth0 RS256 token belongs to the designated Super Admin
    if (!user && !tokenPayload.isLegacyToken) {
        const isSuperAdminRole = tokenPayload.role === 'super_admin' || (Array.isArray(tokenPayload.roles) && tokenPayload.roles.includes('super_admin'));
        const designatedAdminSub = (process.env.BOOTSTRAP_ADMIN_SUB || process.env.ADMIN_AUTH0_SUB || '').trim();
        const designatedAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

        let isDesignatedAdmin = false;
        if (designatedAdminSub) {
            isDesignatedAdmin = sub === designatedAdminSub;
        } else if (designatedAdminEmail && email) {
            isDesignatedAdmin = email === designatedAdminEmail;
        }

        if (isSuperAdminRole && isDesignatedAdmin) {
            const now = new Date().toISOString();
            const internalDbId = new ObjectId().toHexString();
            const adminPublicId = generateStaffId();
            const adminEmail = email || designatedAdminEmail;
            const adminName = tokenPayload.name || 'System Administrator';

            const newAdminProfile = {
                _id: internalDbId as any,
                publicId: adminPublicId,
                staffId: adminPublicId,
                auth0UserId: auth0UserId,
                auth0_sub: auth0UserId,
                email: adminEmail,
                full_name: adminName,
                role: 'super_admin',
                is_active: true,
                customer_status: 'active',
                email_verified: tokenPayload.emailVerified ?? true,
                created_at: now,
                updated_at: now
            };

            try {
                await db.collection('users').insertOne(newAdminProfile);
                user = newAdminProfile;
                await AuditService.recordEvent({
                    actorId: String(auth0UserId),
                    actorRole: 'super_admin',
                    action: 'super_admin_bootstrap_jit',
                    entityType: 'user',
                    entityId: internalDbId,
                    metadata: {
                        sub,
                        auth0UserId,
                        email: adminEmail,
                        method: 'auth0_rs256_jit_bootstrap'
                    }
                });
            } catch (err: any) {
                // Concurrency-safe: if another concurrent request inserted, retrieve it
                user = await db.collection('users').findOne({ $or: queryConditions });
            }
        }
    }

    if (!user) return null;

    // Verify account is not disabled or suspended
    const isAccountSuspended = user.status === 'suspended' || user.status === 'inactive' || user.is_blocked;
    if (isAccountSuspended) {
        throw new ForbiddenError('Account is deactivated or suspended. Please contact support.');
    }

    // Auto-link Plant Manager to operational plant if missing
    const normUserRole = normalizeRole(user.role);
    if (normUserRole === 'plant_manager' && !user.plant_id && !user.plantId) {
        let plant = await db.collection('plants').findOne({ manager_id: String(user._id) });
        if (!plant) {
            plant = await db.collection('plants').findOne({ status: { $ne: 'inactive' } });
        }
        if (!plant) {
            const defaultPlant = {
                _id: 'plant_preston_central' as any,
                id: 'plant_preston_central',
                name: 'Preston Central Processing Plant',
                code: 'PST-01',
                address: 'Unit 4, Laundelle Industrial Estate, Preston PR1 1AA',
                service_pincodes: ['PR1', 'PR2', 'PR3', 'PR4', 'PR5'],
                manager_id: String(user._id),
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            await db.collection('plants').insertOne(defaultPlant);
            plant = defaultPlant;
        }
        if (plant) {
            const pId = String(plant._id || plant.id);
            user.plant_id = pId;
            user.plantId = pId;
            await db.collection('users').updateOne(
                { _id: user._id } as any,
                { $set: { plant_id: pId, plantId: pId } }
            );
        }
    }

    return user;
}

/**
 * Normalizes role matching for backwards compatibility.
 * e.g. 'super_admin' matches 'admin', 'plant_manager' matches 'manager'.
 */
function isRoleAuthorized(userRole: string | undefined, allowedRoles: string[]): boolean {
    if (!userRole) return false;
    const normUser = normalizeRole(userRole) || userRole.toLowerCase();
    const normalizedAllowed = allowedRoles.map(r => normalizeRole(r) || r.toLowerCase());
    return normalizedAllowed.includes(normUser);
}

export function requireRole(req: NextRequest, allowedRoles: string[]): JwtPayload {
    const user = requireAuth(req);
    if (!isRoleAuthorized(user.role, allowedRoles)) {
        throw new ForbiddenError(`Role ${user.role || 'none'} is not authorized`);
    }
    const normUser = normalizeRole(user.role) || user.role?.toLowerCase();
    const isStaff = ['super_admin', 'admin', 'plant_manager', 'driver', 'processor'].includes(normUser || '');
    if (isStaff) {
        if ((user as any).emailVerified === false) {
            throw new ForbiddenError('Email verification is required to perform staff operations.');
        }
    }
    return user;
}

export async function requireRoleAsync(req: NextRequest, allowedRoles: string[]): Promise<JwtPayload> {
    const user = await requireAuthAsync(req);
    let effectiveRole = user.role;
    let dbUser: any = null;
    if (!isRoleAuthorized(effectiveRole, allowedRoles)) {
        dbUser = await resolveLaundelleUser(user);
        if (dbUser?.role) {
            effectiveRole = dbUser.role;
        }
    }
    if (!isRoleAuthorized(effectiveRole, allowedRoles)) {
        throw new ForbiddenError(`Role ${effectiveRole || 'none'} is not authorized`);
    }
    const normUser = normalizeRole(effectiveRole) || effectiveRole?.toLowerCase();
    const isStaff = ['super_admin', 'admin', 'plant_manager', 'driver', 'processor'].includes(normUser || '');
    if (isStaff) {
        if ((user as any).emailVerified === false) {
            throw new ForbiddenError('Email verification is required to perform staff operations.');
        }
        if (dbUser && dbUser.email_verified === false) {
            throw new ForbiddenError('Email verification is required to perform staff operations.');
        }
    }
    return { ...user, role: effectiveRole };
}

/**
 * Authoritative Backend Authorization:
 * 1. Verifies the Auth0 JWT.
 * 2. Resolves the Laundelle user from MongoDB using auth0UserId / sub.
 * 3. Enforces email verification for staff operations.
 * 4. Enforces the required Auth0 permission.
 */
export async function requirePermission(
    req: NextRequest,
    permission: string
): Promise<AuthenticatedContext> {
    const token = await requireAuthAsync(req);
    const dbUser = await resolveLaundelleUser(token);

    if (!dbUser) {
        throw new UnauthorizedError('Laundelle user profile not found. Complete sign-in to continue.');
    }

    const effectiveRole = dbUser.role || token.role;
    const normRole = normalizeRole(effectiveRole);
    const isStaff = ['super_admin', 'admin', 'plant_manager', 'driver', 'processor'].includes(normRole || '');

    if (isStaff) {
        if (token.emailVerified === false) {
            throw new ForbiddenError('Email verification is required to perform staff operations.');
        }
        if (dbUser.email_verified === false) {
            throw new ForbiddenError('Email verification is required to perform staff operations.');
        }
    }

    const authorized = hasPermission(effectiveRole, token.permissions, permission);

    if (!authorized) {
        throw new ForbiddenError(`Access denied: Missing required permission "${permission}"`);
    }

    return { token, dbUser };
}

/**
 * Resolves both verified JWT payload and authoritative MongoDB user record.
 * Ensures caller is active and mapped to a real database user profile.
 */
export async function requireAuthWithUser(req: NextRequest): Promise<AuthenticatedContext> {
    const token = await requireAuthAsync(req);
    const dbUser = await resolveLaundelleUser(token);
    if (!dbUser) {
        throw new UnauthorizedError('Laundelle user profile not found or inactive.');
    }
    return { token, dbUser };
}

/**
 * Strict Plant Isolation Guard:
 * Ensures Plant Managers can ONLY access their own plant and staff assigned to their facility.
 * Super Admins are granted unrestricted global access.
 */
export function assertPlantIsolation(
    managerDbUser: any,
    targetPlantId?: string | null,
    targetStaff?: any | null
): void {
    if (!managerDbUser) {
        throw new ForbiddenError('Access denied: Authentication required for plant authorization.');
    }

    const normRole = normalizeRole(managerDbUser.role);

    // Super Admin has unrestricted global plant access
    if (normRole === 'super_admin') {
        return;
    }

    if (normRole === 'plant_manager') {
        const managerPlantId = String(managerDbUser.plant_id || managerDbUser.plantId || '').trim();
        if (!managerPlantId) {
            throw new ForbiddenError('Access denied: Plant Manager is not linked to an operational plant.');
        }

        if (targetPlantId && String(targetPlantId).trim() !== managerPlantId) {
            throw new ForbiddenError('Access denied: You are only authorized to manage operations for your assigned plant.');
        }

        if (targetStaff) {
            const staffPlantId = String(targetStaff.plant_id || targetStaff.plantId || '').trim();
            const staffManagerId = String(targetStaff.manager_id || targetStaff.plantManagerId || '').trim();

            const managerIdentifiers = [
                String(managerDbUser._id || '').trim(),
                String(managerDbUser.publicId || '').trim(),
                String(managerDbUser.id || '').trim(),
                String(managerDbUser.staffId || '').trim()
            ].filter(Boolean);

            const isManagerSelf = managerIdentifiers.includes(String(targetStaff._id || '').trim()) ||
                                  managerIdentifiers.includes(String(targetStaff.publicId || '').trim());
            const matchesManager = staffManagerId ? managerIdentifiers.includes(staffManagerId) : false;
            const matchesPlant = Boolean(managerPlantId && staffPlantId && staffPlantId === managerPlantId);

            if (!matchesPlant && !matchesManager && !isManagerSelf) {
                throw new ForbiddenError('Access denied: Staff member does not belong to your facility.');
            }
        }
        return;
    }

    throw new ForbiddenError('Access denied: Unauthorized role for plant operations.');
}


// ---------------------------------------------------------------------------
// Client IP Extraction Utility
// ---------------------------------------------------------------------------

/**
 * Safely extracts client IP address, prioritizing trusted infrastructure headers
 * (e.g. x-vercel-forwarded-for from Vercel Edge) and sanitizing header values.
 */
export function getClientIp(req: NextRequest): string {
    const vercelForwarded = req.headers.get('x-vercel-forwarded-for')?.trim();
    if (vercelForwarded) {
        return vercelForwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip')?.trim();
    if (realIp) {
        return realIp;
    }
    const forwardedFor = req.headers.get('x-forwarded-for')?.trim();
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(s => s.trim()).filter(Boolean);
        if (ips.length > 0) {
            return ips[0];
        }
    }
    return 'unknown';
}

// ---------------------------------------------------------------------------
// Error Handler Wrapper for Route Handlers
// ---------------------------------------------------------------------------

export function withErrorHandler(handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse>) {
    return async (req: NextRequest, ...args: any[]) => {
        try {
            await syncRevokedTokens().catch(() => {});
            const res = await handler(req, ...args);
            const dynamicCors = getCorsHeaders(req);
            Object.entries(dynamicCors).forEach(([key, value]) => {
                res.headers.set(key, value);
            });
            return res;
        } catch (error: any) {
            console.error('[API Error]:', error);
            const res = error instanceof ApiError
                ? errorResponse(error.code, error.message, error.status, error.details)
                : errorResponse('INTERNAL_SERVER_ERROR', 'An unexpected server error occurred', 500);
            const dynamicCors = getCorsHeaders(req);
            Object.entries(dynamicCors).forEach(([key, value]) => {
                res.headers.set(key, value);
            });
            return res;
        }
    };
}
