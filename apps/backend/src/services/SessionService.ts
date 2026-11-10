import crypto from 'crypto';
import { getDb } from '../lib/mongodb';
import { NextRequest } from 'next/server';
import { isOriginAllowed } from '../lib/cors';

export interface SessionDoc {
    sessionId: string;
    userId: string;
    publicId?: string;
    auth0UserId?: string;
    email: string;
    role: string;
    plantId?: string;
    portal: 'customer' | 'operations' | 'admin' | string;
    csrfToken: string;
    createdAt: Date;
    lastActivityAt: Date;
    expiresAt: Date;
    revokedAt?: Date | null;
    userAgent?: string;
    ipAddress?: string;
}

const DEFAULT_IDLE_TIMEOUT_MINUTES = parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES || '30', 10);
const DEFAULT_ABSOLUTE_TIMEOUT_HOURS = parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS || '24', 10);

export class SessionService {
    /**
     * Generates a cryptographically strong, unguessable opaque session identifier.
     */
    static generateSessionId(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    /**
     * Generates a cryptographically strong anti-CSRF token.
     */
    static generateCsrfToken(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    /**
     * Creates and stores a new authenticated session in MongoDB.
     */
    static async createSession(params: {
        userId: string;
        publicId?: string;
        auth0UserId?: string;
        email: string;
        role: string;
        plantId?: string;
        portal?: string;
        userAgent?: string;
        ipAddress?: string;
    }): Promise<{ sessionId: string; csrfToken: string; session: SessionDoc }> {
        const db = await getDb();
        const sessionId = this.generateSessionId();
        const csrfToken = this.generateCsrfToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + DEFAULT_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000);

        const session: SessionDoc = {
            sessionId,
            userId: params.userId,
            publicId: params.publicId || params.userId,
            auth0UserId: params.auth0UserId,
            email: params.email ? params.email.toLowerCase().trim() : '',
            role: params.role || 'customer',
            plantId: params.plantId,
            portal: params.portal || 'customer',
            csrfToken,
            createdAt: now,
            lastActivityAt: now,
            expiresAt,
            revokedAt: null,
            userAgent: params.userAgent || 'unknown',
            ipAddress: params.ipAddress || 'unknown',
        };

        await db.collection('sessions').insertOne(session as any);

        return { sessionId, csrfToken, session };
    }

    /**
     * Retrieves an active session by its opaque identifier.
     * Enforces absolute expiration, idle timeout, and revocation status.
     */
    static async getSession(sessionId: string): Promise<SessionDoc | null> {
        if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 16) {
            return null;
        }

        try {
            const db = await getDb();
            const session = await db.collection<SessionDoc>('sessions').findOne({ sessionId });

            if (!session) return null;
            if (session.revokedAt) return null;

            const now = Date.now();

            // Absolute expiration check
            if (new Date(session.expiresAt).getTime() <= now) {
                return null;
            }

            // Idle timeout check (e.g. 30 minutes since last activity)
            const idleLimitMs = DEFAULT_IDLE_TIMEOUT_MINUTES * 60 * 1000;
            const lastActivity = new Date(session.lastActivityAt).getTime();
            if (now - lastActivity > idleLimitMs) {
                // Session expired due to inactivity - mark revoked
                await this.revokeSession(sessionId);
                return null;
            }

            // Throttle lastActivityAt update to at most once every 60 seconds
            if (now - lastActivity > 60 * 1000) {
                await db.collection('sessions').updateOne(
                    { sessionId },
                    { $set: { lastActivityAt: new Date(now) } }
                ).catch(() => {});
            }

            return session;
        } catch (err) {
            console.error('[SessionService] Error retrieving session:', err);
            return null;
        }
    }

    /**
     * Revokes a single session immediately.
     */
    static async revokeSession(sessionId: string): Promise<void> {
        if (!sessionId) return;
        try {
            const db = await getDb();
            await db.collection('sessions').updateOne(
                { sessionId },
                { $set: { revokedAt: new Date() } }
            );
        } catch (err) {
            console.error('[SessionService] Error revoking session:', err);
        }
    }

    /**
     * Revokes all active sessions for a user (e.g., password change, account suspension, or universal logout).
     * Gathers all user alias identifiers (staffId, customerId, publicId, auth0UserId) to ensure exhaustive revocation.
     */
    static async revokeAllUserSessions(userId: string): Promise<void> {
        if (!userId) return;
        try {
            const db = await getDb();
            const cleanId = String(userId).trim();
            const possibleIdentifiers = new Set<string>([cleanId]);

            // Query user document to gather all aliased identifiers (staffId, customerId, publicId, email, auth0UserId)
            const userDoc = await db.collection('users').findOne({
                $or: [
                    { _id: cleanId as any },
                    { id: cleanId },
                    { publicId: cleanId },
                    { staffId: cleanId },
                    { customerId: cleanId },
                    { auth0UserId: cleanId },
                    { auth0_sub: cleanId },
                    { email: cleanId.toLowerCase() }
                ]
            });

            if (userDoc) {
                if (userDoc._id) possibleIdentifiers.add(String(userDoc._id));
                if (userDoc.publicId) possibleIdentifiers.add(String(userDoc.publicId));
                if (userDoc.staffId) possibleIdentifiers.add(String(userDoc.staffId));
                if (userDoc.customerId) possibleIdentifiers.add(String(userDoc.customerId));
                if (userDoc.auth0UserId) possibleIdentifiers.add(String(userDoc.auth0UserId));
                if (userDoc.auth0_sub) possibleIdentifiers.add(String(userDoc.auth0_sub));
                if (userDoc.email) possibleIdentifiers.add(String(userDoc.email));
            }

            const idList = Array.from(possibleIdentifiers);
            await db.collection('sessions').updateMany(
                {
                    $or: [
                        { userId: { $in: idList } },
                        { publicId: { $in: idList } },
                        { auth0UserId: { $in: idList } },
                        { email: { $in: idList } }
                    ],
                    revokedAt: null
                },
                { $set: { revokedAt: new Date() } }
            );

            // Record in revoked_tokens collection so distributed instances and workers invalidate active tokens
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            for (const id of idList) {
                await db.collection('revoked_tokens').updateOne(
                    { token: `user_revoked_${id}` },
                    {
                        $set: {
                            token: `user_revoked_${id}`,
                            userId: id,
                            revokedAt: now.toISOString(),
                            expiresAt
                        }
                    },
                    { upsert: true }
                ).catch(() => {});
            }
        } catch (err) {
            console.error('[SessionService] Error revoking user sessions:', err);
            throw err;
        }
    }

    /**
     * Validates anti-CSRF protection for state-changing requests authenticated via cookies.
     * Checks x-csrf-token header and verifies origin matching.
     */
    static validateCsrf(session: SessionDoc, req: NextRequest): boolean {
        // Safe read methods do not mutate state and are exempt from CSRF checks
        const method = req.method.toUpperCase();
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return true;
        }

        const providedToken = req.headers.get('x-csrf-token') || req.headers.get('X-CSRF-Token');
        if (providedToken) {
            try {
                const a = Buffer.from(providedToken);
                const b = Buffer.from(session.csrfToken);
                if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
                    return true;
                }
            } catch {}
        }

        // Secondary defense: strictly require token for admin & ops portals
        if (session.portal === 'admin' || session.portal === 'operations') {
            return false;
        }

        // For customer portal, allow only exact same-origin browser requests (sec-fetch-site: same-origin)
        // Never allow arbitrary cross-subdomain origin bypasses without a valid CSRF token.
        const secFetchSite = req.headers.get('sec-fetch-site');
        const origin = req.headers.get('origin');
        const host = req.headers.get('host');
        const forwardedHost = req.headers.get('x-forwarded-host');

        if (secFetchSite === 'same-origin' && origin) {
            try {
                const originUrl = new URL(origin);
                const currentHost = forwardedHost || host;
                if (currentHost && originUrl.host === currentHost) {
                    return true;
                }
            } catch {
                return false;
            }
        }

        return false;
    }

    /**
     * Cookie configuration helper matching target portal and host-only semantics.
     */
    static getCookieConfig(portal?: string): {
        name: string;
        options: {
            httpOnly: boolean;
            secure: boolean;
            sameSite: 'lax' | 'strict';
            path: string;
            maxAge: number;
        };
    } {
        const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
        
        let cookieName = '__Host-laundelle_session';
        if (portal === 'customer') cookieName = '__Host-laundelle_customer_session';
        else if (portal === 'operations') cookieName = '__Host-laundelle_ops_session';
        else if (portal === 'admin') cookieName = '__Host-laundelle_admin_session';

        // In non-https development, __Host- prefix is ignored or rejected by some browsers, so fallback to standard name
        if (!isProd) {
            cookieName = cookieName.replace('__Host-', '');
        }

        // L-4: Use SameSite: strict for admin and operations sessions to prevent cross-site navigation leaks
        const sameSite: 'lax' | 'strict' = (portal === 'admin' || portal === 'operations') ? 'strict' : 'lax';

        return {
            name: cookieName,
            options: {
                httpOnly: true,
                secure: isProd,
                sameSite,
                path: '/',
                maxAge: DEFAULT_ABSOLUTE_TIMEOUT_HOURS * 60 * 60,
            }
        };
    }
}
