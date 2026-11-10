import crypto from 'crypto';
import { getDb } from './mongodb';

// JWT_SECRET must be set in .env for production security
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Application cannot start securely.');
}
const SECRET = JWT_SECRET || 'dev-laundelle-jwt-secret-stable-local-fallback';

// ---------------------------------------------------------------------------
// Cryptographic Password Hashing (OWASP-Compliant PBKDF2 with Per-User Salt)
// ---------------------------------------------------------------------------
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const LEGACY_SALT = 'l2u26-fixed-salt-2026';

/**
 * Hashes a password using PBKDF2-HMAC-SHA512 with a cryptographically secure random per-user salt.
 * Output format: `$pbkdf2$<iterations>$<salt>$<hash>`
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
    return `$pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/**
 * Checks whether a stored password hash uses the legacy static salt format.
 */
export function isLegacyHash(storedHash?: string | null): boolean {
    return !storedHash || !storedHash.startsWith('$pbkdf2$');
}

/**
 * Constant-time password verification supporting both the modern per-user salt format
 * and backwards-compatible legacy fixed-salt hashes.
 */
export function verifyPassword(password: string, storedHash?: string | null): boolean {
    if (!password || !storedHash) return false;

    try {
        if (storedHash.startsWith('$pbkdf2$')) {
            const parts = storedHash.split('$');
            // Expected format: ['', 'pbkdf2', '100000', '<salt>', '<hash>']
            if (parts.length !== 5) return false;
            const iterations = parseInt(parts[2], 10);
            const salt = parts[3];
            const expectedHash = parts[4];

            const computedHash = crypto.pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
            const expectedBuf = Buffer.from(expectedHash, 'hex');
            const computedBuf = Buffer.from(computedHash, 'hex');

            if (expectedBuf.length !== computedBuf.length) return false;
            return crypto.timingSafeEqual(expectedBuf, computedBuf);
        }

        // Backward compatibility: legacy fixed-salt verification
        const legacyHash = crypto.pbkdf2Sync(password, LEGACY_SALT, 10000, 64, 'sha512').toString('hex');
        const expectedBuf = Buffer.from(storedHash, 'hex');
        const computedBuf = Buffer.from(legacyHash, 'hex');

        if (expectedBuf.length !== computedBuf.length) return false;
        return crypto.timingSafeEqual(expectedBuf, computedBuf);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Base64Url Helpers
// ---------------------------------------------------------------------------
function base64UrlEncode(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf.toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64').toString('utf8');
}

export interface JwtPayload {
    sub: string;
    auth0UserId?: string;
    email?: string;
    name?: string;
    role?: string;
    roles?: string[];
    permissions?: string[];
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string | string[];
    emailVerified?: boolean;
    isLegacyToken?: boolean;
    [key: string]: any;
}


// ---------------------------------------------------------------------------
// JWT Signing
// ---------------------------------------------------------------------------

/**
 * Signs a payload as a compact HS256 JWT.
 * @param payload    - Claims to include. `sub` (subject/user ID) is required.
 * @param expiryDays - Number of days until the token expires (default: 7)
 */
export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiryDays = 7): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + expiryDays * 24 * 60 * 60;

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify({ ...payload, iat, exp }));

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac('sha256', SECRET)
        .update(signingInput)
        .digest('base64url');

    return `${signingInput}.${signature}`;
}

/**
 * Signs an Admin payload with shorter expiry (default 8 hours) for heightened security.
 */
export function signAdminJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiryHours = 8): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + expiryHours * 60 * 60;

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify({ ...payload, iat, exp }));

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac('sha256', SECRET)
        .update(signingInput)
        .digest('base64url');

    return `${signingInput}.${signature}`;
}

// ---------------------------------------------------------------------------
// Multi-Instance & Serverless Distributed Token Revocation
// ---------------------------------------------------------------------------

// In-memory cache for ultra-fast checks, kept synchronized with MongoDB revoked_tokens collection
const REVOKED_TOKENS_CACHE = new Set<string>();
let lastRevokedSyncTime = 0;
const CACHE_TTL_MS = 15000; // Synchronize from MongoDB at most once every 15 seconds per worker

/**
 * Synchronizes the local memory cache with MongoDB's revoked_tokens collection.
 */
export async function syncRevokedTokens(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastRevokedSyncTime < CACHE_TTL_MS) {
        return;
    }

    try {
        lastRevokedSyncTime = now;
        const db = await getDb();
        const activeRevoked = await db.collection('revoked_tokens')
            .find({ expiresAt: { $gt: new Date() } }, { projection: { token: 1 } })
            .toArray();

        for (const item of activeRevoked) {
            if (item.token) REVOKED_TOKENS_CACHE.add(item.token);
        }
    } catch {
        // Retain in-memory cache if MongoDB is temporarily unreachable
    }
}

/**
 * Revokes a token by immediately updating the local memory cache and persisting to MongoDB
 * with TTL expiration so all serverless instances and worker replicas synchronize revocation.
 */
export async function revokeToken(token: string, userId?: string, expiryDate?: Date): Promise<void> {
    if (!token) return;
    REVOKED_TOKENS_CACHE.add(token);

    try {
        const db = await getDb();
        const expiresAt = expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.collection('revoked_tokens').updateOne(
            { token },
            {
                $setOnInsert: {
                    token,
                    userId: userId || 'unknown',
                    revokedAt: new Date().toISOString(),
                    expiresAt,
                },
            },
            { upsert: true }
        );
    } catch (err) {
        console.error('[Token Revocation] Error persisting revoked token to MongoDB:', err);
    }
}

/**
 * Synchronously checks whether a token has been revoked.
 * Automatically triggers background cache synchronization if the cache is stale.
 */
export function isTokenRevoked(token: string): boolean {
    if (!token) return true;
    if (REVOKED_TOKENS_CACHE.has(token)) return true;

    // Trigger non-blocking cache synchronization if stale
    if (Date.now() - lastRevokedSyncTime >= CACHE_TTL_MS) {
        syncRevokedTokens().catch(() => {});
    }

    return false;
}

/**
 * Asynchronously checks whether a token is revoked by verifying against the cache
 * and directly checking MongoDB if not cached. Recommended for critical endpoints.
 * Fails securely if authentication/revocation storage is unreachable.
 */
export async function isTokenRevokedAsync(token: string, userId?: string): Promise<boolean> {
    if (!token) return true;
    if (REVOKED_TOKENS_CACHE.has(token)) return true;
    if (userId && REVOKED_TOKENS_CACHE.has(`user_revoked_${userId}`)) return true;

    try {
        const db = await getDb();
        const conditions: any[] = [{ token }];
        if (userId) {
            conditions.push({ token: `user_revoked_${userId}` });
            conditions.push({ userId });
        }

        const record = await db.collection('revoked_tokens').findOne({
            $or: conditions,
            expiresAt: { $gt: new Date() },
        });

        if (record) {
            REVOKED_TOKENS_CACHE.add(token);
            return true;
        }
    } catch (err) {
        // Fail securely: When session/revocation storage is unavailable, do not silently assume valid
        console.error('[Token Revocation] Error querying revocation storage:', err);
        throw new Error('AUTH_STORAGE_UNAVAILABLE: Authentication and revocation storage is temporarily unreachable.');
    }

    return false;
}

// ---------------------------------------------------------------------------
// Primary Auth0 JWKS Key Fetching & Caching (Production Authentication)
// ---------------------------------------------------------------------------

interface Auth0Jwk {
    kty: string;
    use?: string;
    n: string;
    e: string;
    kid: string;
    alg?: string;
}

interface Auth0JwksResponse {
    keys: Auth0Jwk[];
}

interface CachedKey {
    key: crypto.KeyObject;
    fetchedAt: number;
}

const AUTH0_KEY_CACHE = new Map<string, CachedKey>();
const AUTH0_KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour key cache
let lastJwksFetchTime = 0;
const MIN_JWKS_FETCH_INTERVAL_MS = 10000; // Throttle JWKS network requests

function getAuth0Domain(): string {
    const raw = process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN || '';
    return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Fetches and caches the JSON Web Key Set (JWKS) from Auth0.
 */
async function fetchAuth0Jwks(force = false): Promise<void> {
    const domain = getAuth0Domain();
    if (!domain) {
        return;
    }

    const now = Date.now();
    if (!force && now - lastJwksFetchTime < MIN_JWKS_FETCH_INTERVAL_MS) {
        return;
    }
    lastJwksFetchTime = now;

    const jwksUrl = `https://${domain}/.well-known/jwks.json`;

    try {
        const res = await fetch(jwksUrl, {
            headers: { 'User-Agent': 'Laundelle-Backend-Auth/1.0' },
            cache: 'no-store'
        });
        if (!res.ok) {
            console.error(`[Auth0 JWKS] Failed to fetch JWKS from ${jwksUrl}: HTTP ${res.status}`);
            return;
        }
        const data: Auth0JwksResponse = await res.json();
        if (!Array.isArray(data?.keys)) return;

        for (const jwk of data.keys) {
            if (jwk.kty === 'RSA' && jwk.n && jwk.e && jwk.kid) {
                try {
                    const keyObject = crypto.createPublicKey({
                        key: {
                            kty: jwk.kty,
                            n: jwk.n,
                            e: jwk.e
                        },
                        format: 'jwk'
                    });
                    AUTH0_KEY_CACHE.set(jwk.kid, { key: keyObject, fetchedAt: now });
                } catch (keyErr) {
                    console.error(`[Auth0 JWKS] Failed to parse key for kid ${jwk.kid}:`, keyErr);
                }
            }
        }
    } catch (err) {
        console.error('[Auth0 JWKS] Network error fetching JWKS:', err);
    }
}

/**
 * Retrieves an Auth0 RSA public key by key ID (kid).
 */
async function getAuth0PublicKey(kid?: string): Promise<crypto.KeyObject | null> {
    if (!kid) {
        if (AUTH0_KEY_CACHE.size === 0) {
            await fetchAuth0Jwks(true);
        }
        const first = AUTH0_KEY_CACHE.values().next().value;
        return first ? first.key : null;
    }

    const cached = AUTH0_KEY_CACHE.get(kid);
    if (cached && Date.now() - cached.fetchedAt < AUTH0_KEY_CACHE_TTL_MS) {
        return cached.key;
    }

    await fetchAuth0Jwks(true);
    const updated = AUTH0_KEY_CACHE.get(kid);
    return updated ? updated.key : null;
}

/**
 * Synchronous cached key lookup (returns null if key not yet cached).
 */
function getAuth0PublicKeySync(kid?: string): crypto.KeyObject | null {
    if (!kid) {
        const first = AUTH0_KEY_CACHE.values().next().value;
        return first ? first.key : null;
    }
    return AUTH0_KEY_CACHE.get(kid)?.key || null;
}

// ---------------------------------------------------------------------------
// Token Parsing & Claim Normalization
// ---------------------------------------------------------------------------

interface DecodedTokenHeader {
    alg: string;
    typ?: string;
    kid?: string;
}

function parseTokenParts(token: string): {
    header: DecodedTokenHeader;
    encodedHeader: string;
    encodedPayload: string;
    signature: string;
    signingInput: string;
} | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    try {
        const header: DecodedTokenHeader = JSON.parse(base64UrlDecode(encodedHeader));
        if (!header.alg) return null;
        return {
            header,
            encodedHeader,
            encodedPayload,
            signature,
            signingInput: `${encodedHeader}.${encodedPayload}`
        };
    } catch {
        return null;
    }
}

/**
 * Normalizes an Auth0 decoded payload into Laundelle's standard JwtPayload.
 */
function normalizeAuth0Payload(raw: any): JwtPayload {
    const rawRoles = raw['https://laundelle.co.uk/roles'] ||
        raw['https://laundelle/roles'] ||
        raw['https://auth.laundelle.co.uk/roles'] ||
        raw['http://laundelle.co.uk/roles'] ||
        raw['https://laundelle.com/roles'] ||
        raw.roles ||
        raw.app_metadata?.roles ||
        raw.user_metadata?.roles ||
        (raw.app_metadata?.role ? [raw.app_metadata.role] : []) ||
        (raw.user_metadata?.role ? [raw.user_metadata.role] : []) ||
        [];
    const roles: string[] = Array.isArray(rawRoles) ? rawRoles : [String(rawRoles)];
    const permissions: string[] = raw.permissions || raw['https://laundelle.co.uk/permissions'] || [];
    const directRole = roles[0] ||
        raw['https://laundelle.co.uk/role'] ||
        raw['https://laundelle/role'] ||
        raw['https://auth.laundelle.co.uk/role'] ||
        raw.app_metadata?.role ||
        raw.user_metadata?.role ||
        raw.role ||
        'customer';
    const emailVerified = typeof raw.email_verified === 'boolean'
        ? raw.email_verified
        : (raw.email_verified !== undefined ? Boolean(raw.email_verified) : undefined);

    return {
        ...raw,
        sub: raw.sub,
        auth0UserId: raw.sub,
        email: raw.email ? String(raw.email).toLowerCase().trim() : undefined,
        name: raw.name || raw.nickname || (raw.email ? String(raw.email).split('@')[0] : 'User'),
        role: directRole,
        roles,
        permissions,
        emailVerified,
        isLegacyToken: false
    };
}

/**
 * Primary Production Verification: Verifies Auth0 RS256 JWT using JWKS.
 */
async function verifyAuth0Rs256Async(token: string): Promise<JwtPayload | null> {
    const parsed = parseTokenParts(token);
    if (!parsed || parsed.header.alg !== 'RS256') return null;

    try {
        const publicKey = await getAuth0PublicKey(parsed.header.kid);
        if (!publicKey) {
            console.error('[Auth0 Verify] Public key not found for kid:', parsed.header.kid);
            return null;
        }

        const isSignatureValid = crypto.verify(
            'RSA-SHA256',
            Buffer.from(parsed.signingInput, 'utf8'),
            publicKey,
            Buffer.from(parsed.signature, 'base64url')
        );

        if (!isSignatureValid) {
            console.warn('[Auth0 Verify] Invalid RSA-SHA256 signature');
            return null;
        }

        const rawPayload = JSON.parse(base64UrlDecode(parsed.encodedPayload));
        const nowSec = Math.floor(Date.now() / 1000);

        // Check expiration with 10-second clock skew tolerance
        if (rawPayload.exp && nowSec > rawPayload.exp + 10) {
            console.warn(`[Auth0 Verify] Token expired: exp=${rawPayload.exp}, nowSec=${nowSec}, expired ${nowSec - rawPayload.exp}s ago`);
            return null; // Expired
        }

        // Check not-before claim with 10-second clock skew tolerance
        if (rawPayload.nbf && nowSec < rawPayload.nbf - 10) {
            return null; // Not yet valid
        }

        // Validate issuer
        const expectedDomain = getAuth0Domain();
        if (rawPayload.iss) {
            const normalizedIss = rawPayload.iss.replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (normalizedIss !== expectedDomain) {
                console.warn(`[Auth0 Verify] Issuer mismatch: expected ${expectedDomain}, got ${normalizedIss}`);
                return null;
            }
        }

        // Validate audience against explicitly configured backend audiences.
        // In Auth0 architecture:
        // - Dedicated API access tokens carry the backend API identifier (AUTH0_AUDIENCE or AUTH0_API_IDENTIFIER).
        // - Frontend SPA user tokens carry the client ID (AUTH0_CLIENT_ID or NEXT_PUBLIC_AUTH0_CLIENT_ID).
        // Tokens issued for unrelated APIs or Auth0 Management API (/api/v2/) are strictly rejected.
        const allowedAudiences = [
            process.env.AUTH0_AUDIENCE,
            process.env.AUTH0_API_IDENTIFIER,
            process.env.AUTH0_CLIENT_ID,
            process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
            expectedDomain ? `https://${expectedDomain}/userinfo` : '',
        ].filter(Boolean) as string[];

        if (allowedAudiences.length > 0) {
            if (!rawPayload.aud) {
                console.warn('[Auth0 Verify] Token is missing required audience claim');
                return null;
            }
            const tokenAudiences = Array.isArray(rawPayload.aud) ? rawPayload.aud : [rawPayload.aud];
            const hasValidAudience = tokenAudiences.some((aud: string) => allowedAudiences.includes(aud));
            if (!hasValidAudience) {
                console.warn(`[Auth0 Verify] Audience mismatch: token audience [${tokenAudiences.join(', ')}] does not match allowed audiences [${allowedAudiences.join(', ')}]`);
                return null;
            }
        }

        return normalizeAuth0Payload(rawPayload);
    } catch (err) {
        console.error('[Auth0 Verify] Verification error:', err);
        return null;
    }
}

let hasLoggedHs256Deprecation = false;

/**
 * @deprecated LEGACY HS256 VERIFICATION ONLY.
 * Kept strictly for backwards compatibility during migration.
 * Scheduled for removal once Phase 5 verification is complete.
 */
function verifyLegacyHs256(token: string): JwtPayload | null {
    const parsed = parseTokenParts(token);
    if (!parsed || parsed.header.alg !== 'HS256') return null;

    if (process.env.ALLOW_HS256_LEGACY === 'false' || (process.env.NODE_ENV === 'production' && process.env.ALLOW_HS256_LEGACY !== 'true')) {
        console.warn('[AUTH REJECTED] HS256 legacy token rejected. Production requires Auth0 RS256 JWKS tokens.');
        return null;
    }

    if (process.env.NODE_ENV !== 'test') {
        const shouldLog = process.env.DEBUG_AUTH === 'true' || !hasLoggedHs256Deprecation;
        if (shouldLog) {
            console.warn('[AUTH DEPRECATION] Received deprecated HS256 JWT. Migration to Auth0 RS256 is in progress.');
            hasLoggedHs256Deprecation = true;
        }
    }

    try {
        const expectedSig = crypto
            .createHmac('sha256', SECRET)
            .update(parsed.signingInput)
            .digest('base64url');

        const sigBuf = Buffer.from(parsed.signature);
        const expBuf = Buffer.from(expectedSig);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return null;
        }

        const payload: JwtPayload = JSON.parse(base64UrlDecode(parsed.encodedPayload));

        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
            return null; // Expired
        }

        payload.isLegacyToken = true;
        return payload;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// JWT Verification Interface
// ---------------------------------------------------------------------------

/**
 * Primary Asynchronous Token Verification.
 * Prioritizes Auth0 RS256 JWKS verification; falls back to legacy HS256 for backwards compatibility.
 */
export async function verifyJwtAsync(token: string): Promise<JwtPayload | null> {
    if (!token) return null;

    try {
        if (await isTokenRevokedAsync(token)) {
            return null;
        }

        const parsed = parseTokenParts(token);
        if (!parsed) return null;

        let payload: JwtPayload | null = null;

        // 1. Primary path: Auth0 RS256 token
        if (parsed.header.alg === 'RS256') {
            payload = await verifyAuth0Rs256Async(token);
        } else if (parsed.header.alg === 'HS256') {
            // 2. Legacy fallback path: deprecated HS256 token
            payload = verifyLegacyHs256(token);
        }

        if (!payload) return null;

        // Exhaustive check: Verify user-level revocation
        if (payload.sub && (await isTokenRevokedAsync(token, payload.sub))) {
            return null;
        }

        return payload;
    } catch (err: any) {
        if (err?.message?.includes('AUTH_STORAGE_UNAVAILABLE')) {
            throw err;
        }
        return null;
    }
}

/**
 * Synchronous Token Verification (Supports legacy HS256 and cached RS256 keys).
 * For non-blocking endpoints or synchronous caller compatibility.
 */
export function verifyJwt(token: string): JwtPayload | null {
    if (!token) return null;

    try {
        if (isTokenRevoked(token)) {
            return null;
        }

        const parsed = parseTokenParts(token);
        if (!parsed) return null;

        // Try cached RS256 key if present
        if (parsed.header.alg === 'RS256') {
            const cachedKey = getAuth0PublicKeySync(parsed.header.kid);
            if (cachedKey) {
                const isValid = crypto.verify(
                    'RSA-SHA256',
                    Buffer.from(parsed.signingInput, 'utf8'),
                    cachedKey,
                    Buffer.from(parsed.signature, 'base64url')
                );
                if (isValid) {
                    const rawPayload = JSON.parse(base64UrlDecode(parsed.encodedPayload));
                    if (!rawPayload.exp || Math.floor(Date.now() / 1000) <= rawPayload.exp + 10) {
                        return normalizeAuth0Payload(rawPayload);
                    }
                }
            }
            return null;
        }

        // Legacy fallback
        if (parsed.header.alg === 'HS256') {
            return verifyLegacyHs256(token);
        }

        return null;
    } catch {
        return null;
    }
}
