import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { hashPassword, signJwt, verifyPassword, isLegacyHash, revokeToken, JwtPayload } from '@/lib/auth';
import { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/lib/api';
import { AuditService } from '@/services/AuditService';
import crypto from 'crypto';
import { generateSecret as generateTotpSecret, verifySync as verifyTotpSync } from 'otplib';
import { generateCustomerId, generateStaffId } from '@laundelle/ids';
import { OrderService } from '@/services/OrderService';
import { Auth0Service } from '@/services/Auth0Service';
import { sendWelcomeEmail, sendVerificationEmail } from '@/emails';

export class AuthService {
    
    static async signUp(body: any, clientIp: string = 'unknown') {
        const { email, password, fullName, phone } = body;
        
        if (!email || !password || !fullName) {
            throw new BadRequestError('Email, password and username/full name are required.');
        }
        if (!phone || String(phone).trim().length < 7) {
            throw new BadRequestError('A valid mobile number is required.');
        }
        if (password.length < 8) {
            throw new BadRequestError('Password must be at least 8 characters.');
        }

        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        const existing = await db.collection('users').findOne({ email: formatted });
        
        if (existing) {
            throw new BadRequestError('An account with this email already exists.', { status: 409 });
        }

        const internalDbId = new ObjectId().toHexString();
        const customerId = generateCustomerId();
        const now = new Date().toISOString();
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
        const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const newUser = {
            _id: internalDbId as any,
            publicId: customerId,
            customerId: customerId,
            id: customerId,
            email: formatted,
            verificationTokenHash,
            verificationTokenExpiresAt,
            email_verified: false,
            verification_email_sent: true,
            verification_email_sent_at: now,
            welcome_email_sent: false,
            first_login_at: now,
            last_login_at: now,
            login_count: 1,
            password: hashPassword(password),
            full_name: fullName.trim(),
            phone: String(phone).trim(),
            role: 'customer',
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=03045E&color=CAF0F8&size=128`,
            wallet_balance: 0,
            reward_points: 0,
            customer_status: 'new',
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
                marketingEmails: false
            },
            marketing_consent: false,
            created_at: now,
            updated_at: now
        };

        await db.collection('users').insertOne(newUser);

        // Security requirement: Guest orders are strictly linked AFTER email verification, not on unverified signup.

        // Write an audit event
        await AuditService.recordEvent({
            entityType: 'user',
            entityId: customerId,
            action: 'user_registered',
            actorId: customerId,
            actorRole: 'customer',
            ipAddress: clientIp
        });

        // First send Verification email only. Welcome email will be dispatched once verified.
        const canonicalBase = (body?.appUrl || process.env.CUSTOMER_APP_URL || process.env.PUBLIC_CUSTOMER_URL || process.env.VERIFICATION_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
        sendVerificationEmail({
            to: formatted,
            customerName: newUser.full_name,
            verificationUrl: `${canonicalBase}/verify-email?email=${encodeURIComponent(formatted)}&token=${verificationToken}`,
            appUrl: canonicalBase
        }).catch(err => console.error('[AuthService] Verification email error:', err?.message || err));

        const token = signJwt({ sub: internalDbId, email: formatted, role: 'customer', emailVerified: false });
        
        return {
            token,
            ...(process.env.NODE_ENV === 'test' ? { rawVerificationToken: verificationToken } : {}),
            user: {
                id: customerId,
                publicId: customerId,
                customerId,
                internalId: internalDbId,
                email: formatted,
                name: newUser.full_name,
                phone: newUser.phone,
                role: 'customer',
                emailVerified: false
            }
        };
    }

    static async login(body: any, clientIp: string = 'unknown') {
        const { email, password, requiredRole, mfaCode } = body;
        
        if (!email || !password) {
            throw new BadRequestError('Email and password are required.');
        }

        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        let user = await db.collection('users').findOne({ email: formatted });

        const envAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
        if (envAdminEmail && formatted === envAdminEmail) {
            throw new ForbiddenError('System Administrator accounts must authenticate via Auth0 Universal Login.');
        }

        if (user && ['super_admin', 'admin', 'plant_manager', 'driver', 'processor'].includes(user.role)) {
            throw new ForbiddenError('Staff accounts must authenticate via Auth0 Universal Login.');
        }

        if (user) {
            // Check lockout
            if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
                const remainingMinutes = Math.ceil((new Date(user.lockoutUntil).getTime() - Date.now()) / (60 * 1000));
                throw new ForbiddenError(`Account is temporarily locked due to excessive failed login attempts. Try again in ${remainingMinutes} minute(s).`);
            }
        }

        const isPasswordValid = Boolean(user && user.password && verifyPassword(password, user.password));

        if (!user || !isPasswordValid) {
            if (user) {
                const nextFailed = (user.failedLoginAttempts || 0) + 1;
                const lockoutUntil = nextFailed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

                await db.collection('users').updateOne(
                    { _id: user._id } as any,
                    {
                        $set: {
                            failedLoginAttempts: nextFailed,
                            ...(lockoutUntil ? { lockoutUntil } : {})
                        }
                    }
                );

                await AuditService.recordEvent({
                    entityType: 'user',
                    entityId: String(user._id),
                    action: 'login_failed',
                    actorId: String(user._id),
                    actorRole: user.role || 'customer',
                    ipAddress: clientIp,
                    metadata: { failedAttempts: nextFailed, lockedOut: Boolean(lockoutUntil) }
                });

                if (lockoutUntil) {
                    throw new ForbiddenError('Account is temporarily locked due to 5 consecutive failed login attempts. Try again in 15 minutes.');
                }
            }
            throw new UnauthorizedError('Invalid email or password.');
        }

        if (user.is_blocked) {
            throw new ForbiddenError('This account has been suspended. Please contact support.');
        }

        // For non-customer roles, verify the role matches
        if (requiredRole && user.role !== requiredRole && user.role !== 'admin' && user.role !== 'super_admin') {
            throw new ForbiddenError('Access denied for this role.');
        }

        // Admin MFA validation
        if (['admin', 'super_admin'].includes(user.role) && user.mfaEnabled) {
            if (!mfaCode || !user.mfaSecret || String(mfaCode).trim() !== String(user.mfaSecret).trim()) {
                throw new UnauthorizedError('Two-factor authentication code is required or invalid.');
            }
        }

        // Reset failed login attempts and seamlessly upgrade legacy password hash to modern salt
        const updateDoc: any = { failedLoginAttempts: 0, lockoutUntil: null };
        if (isLegacyHash(user.password)) {
            updateDoc.password = hashPassword(password);
            updateDoc.password_upgraded_at = new Date().toISOString();
        }

        await db.collection('users').updateOne(
            { _id: user._id } as any,
            { $set: updateDoc }
        );

        const now = new Date().toISOString();
        await AuditService.recordEvent({
            entityType: 'user',
            entityId: String(user._id),
            action: 'user_login',
            actorId: String(user._id),
            actorRole: user.role || 'customer',
            ipAddress: clientIp
        });

        const isEmailVerified = Boolean(user.email_verified);
        if (user.role === 'customer' && isEmailVerified) {
            await OrderService.linkGuestOrdersToCustomer(
                formatted,
                user.customerId || user.publicId || String(user._id),
                String(user._id)
            ).catch(err => {
                console.error('[AuthService] Error recovering guest order links on customer login:', err);
            });
        }

        const token = signJwt({ sub: String(user._id), email: formatted, role: user.role || 'customer', emailVerified: isEmailVerified });
        
        let resolvedPlantId = user.plantId || user.plant_id || null;
        let resolvedPlantName = user.plantName || user.plant_name || null;
        if (!resolvedPlantId && (user.manager_id || user.plantManagerId)) {
            const mgrId = user.manager_id || user.plantManagerId;
            const plant = await db.collection('plants').findOne({
                $or: [
                    { manager_id: mgrId },
                    ...(ObjectId.isValid(mgrId) ? [{ manager_id: new ObjectId(mgrId) }] : [])
                ]
            });
            if (plant) {
                resolvedPlantId = plant.publicId || plant.id || String(plant._id);
                resolvedPlantName = plant.name;
            }
        } else if (resolvedPlantId && !resolvedPlantName) {
            const plant = await db.collection('plants').findOne({
                $or: [
                    { _id: resolvedPlantId as any },
                    { id: resolvedPlantId },
                    { publicId: resolvedPlantId },
                    { code: resolvedPlantId },
                    ...(ObjectId.isValid(resolvedPlantId) ? [{ _id: new ObjectId(resolvedPlantId) }] : [])
                ]
            } as any);
            if (plant) resolvedPlantName = plant.name;
        }

        const publicId = user.publicId || user.customerId || user.staffId || String(user._id);
        const isStaff = ['driver', 'processor', 'manager', 'admin', 'super_admin'].includes(user.role);
        return {
            token,
            user: { 
                id: publicId,
                publicId,
                customerId: !isStaff ? publicId : undefined,
                staffId: isStaff ? publicId : undefined,
                internalId: String(user._id),
                email: user.email, 
                name: user.full_name, 
                role: user.role || 'customer',
                emailVerified: isEmailVerified,
                plantId: resolvedPlantId,
                plant_id: resolvedPlantId,
                plantName: resolvedPlantName || (resolvedPlantId ? `Plant Unit (${resolvedPlantId})` : null),
                manager_id: user.manager_id || user.plantManagerId || null,
            }
        };
    }

    /**
     * Records a failed login attempt and applies a 15-minute lockout upon 5 consecutive failures.
     */
    static async recordFailedLogin(email: string, clientIp: string = 'unknown') {
        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        const user = await db.collection('users').findOne({ email: formatted });
        if (!user) return { locked: false, attempts: 0 };

        const nextFailed = (user.failedLoginAttempts || 0) + 1;
        const lockoutUntil = nextFailed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

        await db.collection('users').updateOne(
            { _id: user._id } as any,
            {
                $set: {
                    failedLoginAttempts: nextFailed,
                    ...(lockoutUntil ? { lockoutUntil } : {})
                }
            }
        );

        return { locked: Boolean(lockoutUntil), attempts: nextFailed, lockoutUntil };
    }

    /**
     * Resets failed login attempts after successful authentication.
     */
    static async resetFailedLogin(email: string) {
        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        await db.collection('users').updateOne(
            { email: formatted },
            { $set: { failedLoginAttempts: 0, lockoutUntil: null } }
        );
        return { success: true };
    }

    /**
     * Checks if an account is currently locked out.
     */
    static async isAccountLocked(email: string): Promise<boolean> {
        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        const user = await db.collection('users').findOne({ email: formatted });
        if (!user || !user.lockoutUntil) return false;
        return new Date(user.lockoutUntil) > new Date();
    }

    /**
     * Verifies Admin MFA using RFC 6238 TOTP (via otplib).
     * The user's mfaSecret must be a base32-encoded TOTP seed generated by generateMfaSecret().
     */
    static verifyAdminMfa(user: any, mfaCode: string): boolean {
        if (!user.mfaEnabled) return true;
        if (!user.mfaSecret || !mfaCode) return false;
        try {
            const res = verifyTotpSync({ token: String(mfaCode).trim(), secret: String(user.mfaSecret).trim() });
            return Boolean(res && (res as any).valid === true);
        } catch {
            return false;
        }
    }

    /**
     * Generates a new base32 TOTP secret for MFA provisioning.
     * Store the returned value in user.mfaSecret (never expose it after provisioning).
     */
    static generateMfaSecret(): string {
        return generateTotpSecret();
    }

    /**
     * Invalidate user session and revoke token on logout.
     */
    static async logout(token: string, userId?: string) {
        if (!token) return { success: true };
        await revokeToken(token, userId);
        return { success: true };
    }

    /**
     * Synchronizes an Auth0 authenticated user into MongoDB and returns a valid Laundelle backend JWT token.
     */
    /**
     * Synchronizes an Auth0 authenticated user into MongoDB.
     * Prevents unauthenticated privilege escalation:
     * - Only verified Auth0 tokens with designated super_admin claims can provision/sync super_admin profiles.
     * - Unauthenticated requests with ADMIN_EMAIL or targeting staff accounts are strictly rejected.
     * - Unauthenticated requests can only register ordinary 'customer' accounts.
     */
    static async syncAuth0User(body: any, clientIp: string = 'unknown', verifiedToken?: JwtPayload | null) {
        if (!verifiedToken) {
            throw new UnauthorizedError('Valid Auth0 identity token required for synchronization.');
        }

        if (verifiedToken.isLegacyToken) {
            throw new UnauthorizedError('Auth0 synchronization requires an authentic Auth0 identity token, not a legacy token.');
        }

        const tokenEmail = verifiedToken.email ? String(verifiedToken.email).toLowerCase().trim() : '';
        const bodyEmail = body?.email ? String(body.email).toLowerCase().trim() : '';
        if (bodyEmail && tokenEmail && bodyEmail !== tokenEmail) {
            throw new BadRequestError('Supplied email does not match verified identity token.');
        }

        const formatted = tokenEmail || bodyEmail;
        if (!formatted) {
            throw new BadRequestError('Email is required for Auth0 synchronization.');
        }

        const sub = verifiedToken.sub;
        if (!sub) {
            throw new UnauthorizedError('Subject claim missing from verified token.');
        }

        const db = await getDb();
        const now = new Date().toISOString();
        const name = verifiedToken.name || body?.name;
        const picture = body?.picture;

        const isCustomerPortal = body?.portal === 'customer';
        const isAdminPortal = body?.portal === 'admin';
        const isOperationsPortal = body?.portal === 'operations';

        const envAdminEmails = [
            process.env.ADMIN_EMAIL,
            ...(process.env.ADDITIONAL_ADMIN_EMAILS || '').split(','),
        ].filter(Boolean).map(e => String(e).trim().toLowerCase());
        const isEnvAdmin = envAdminEmails.length > 0 && envAdminEmails.includes(formatted);

        // Gather all role candidates from verified token claims and Auth0 metadata
        const candidateRoles: string[] = [];
        if (isEnvAdmin) {
            candidateRoles.push('super_admin');
        }
        if (Array.isArray(verifiedToken.roles)) {
            candidateRoles.push(...verifiedToken.roles);
        }
        if (verifiedToken.role && typeof verifiedToken.role === 'string') {
            candidateRoles.push(verifiedToken.role);
        }
        const customTokenRoles = (verifiedToken as any)['https://laundelle.co.uk/roles'] ||
            (verifiedToken as any)['https://laundelle/roles'] ||
            (verifiedToken as any)['https://auth.laundelle.co.uk/roles'] ||
            (verifiedToken as any)['http://laundelle.co.uk/roles'] ||
            (verifiedToken as any)['https://laundelle.com/roles'];
        if (Array.isArray(customTokenRoles)) {
            candidateRoles.push(...customTokenRoles);
        } else if (typeof customTokenRoles === 'string') {
            candidateRoles.push(customTokenRoles);
        }
        const customTokenRole = (verifiedToken as any)['https://laundelle.co.uk/role'] ||
            (verifiedToken as any)['https://laundelle/role'] ||
            (verifiedToken as any)['https://auth.laundelle.co.uk/role'];
        if (typeof customTokenRole === 'string') {
            candidateRoles.push(customTokenRole);
        }

        // Check Auth0 Management API if configured (e.g. roles assigned in Auth0 Dashboard)
        if (Auth0Service.isConfigured()) {
            try {
                const [m2mRoles, m2mUser] = await Promise.all([
                    Auth0Service.getUserRoles(sub).catch(() => []),
                    Auth0Service.getUser(sub).catch(() => null),
                ]);
                if (Array.isArray(m2mRoles)) {
                    candidateRoles.push(...m2mRoles);
                }
                if (m2mUser) {
                    // Strictly use administrator-controlled appMetadata. NEVER grant roles from user-controlled metadata.
                    const appR = m2mUser.appMetadata?.roles || m2mUser.appMetadata?.role;
                    if (Array.isArray(appR)) candidateRoles.push(...appR);
                    else if (typeof appR === 'string') candidateRoles.push(appR);
                }
            } catch (m2mErr) {
                console.warn('[AuthService] Auth0 Management API role check notice:', m2mErr);
            }
        }

        // Resolve highest staff role from candidate roles
        let resolvedStaffRole: string | null = null;
        for (const raw of candidateRoles) {
            if (!raw) continue;
            const r = String(raw).toLowerCase().trim();
            if (r === 'super_admin' || r === 'super admin' || r === 'superadmin' || r === 'super-admin') {
                resolvedStaffRole = 'super_admin';
                break;
            }
            if (r === 'admin' || r === 'administrator') {
                if (!resolvedStaffRole || resolvedStaffRole !== 'super_admin') {
                    resolvedStaffRole = 'admin';
                }
            }
            if (r === 'plant_manager' || r === 'plant manager' || r === 'plant-manager' || r === 'manager' || r === 'operations manager' || r === 'ops' || r === 'operations' || r === 'operations staff' || r === 'staff') {
                if (!resolvedStaffRole || !['super_admin', 'admin'].includes(resolvedStaffRole)) {
                    resolvedStaffRole = 'plant_manager';
                }
            }
            if (r === 'driver' || r === 'courier') {
                if (!resolvedStaffRole || !['super_admin', 'admin', 'plant_manager'].includes(resolvedStaffRole)) {
                    resolvedStaffRole = 'driver';
                }
            }
            if (r === 'processor' || r === 'operator' || r === 'facility operator') {
                if (!resolvedStaffRole || !['super_admin', 'admin', 'plant_manager', 'driver'].includes(resolvedStaffRole)) {
                    resolvedStaffRole = 'processor';
                }
            }
        }

        // Administrative accounts require authentic RS256 Auth0 token
        if (resolvedStaffRole === 'super_admin' || isEnvAdmin) {
            const isVerifiedRs256 = Boolean(verifiedToken && !verifiedToken.isLegacyToken);
            if (!isVerifiedRs256) {
                throw new ForbiddenError('Super Admin accounts require verified Auth0 authentication with designated administrative credentials.');
            }
        }

        // Primary user lookup: match immutable Auth0 subject
        let user = await db.collection('users').findOne({
            $or: [
                { auth0UserId: sub },
                { auth0_sub: sub }
            ]
        });

        // If no user found by subject, link with existing account by email only with verified binding
        if (!user) {
            const existingByEmail = await db.collection('users').findOne({ email: formatted });
            if (existingByEmail) {
                const isStaff = ['super_admin', 'admin', 'plant_manager', 'driver', 'processor', 'manager'].includes(existingByEmail.role);
                if (isStaff || resolvedStaffRole) {
                    const isLinked = existingByEmail.auth0UserId || existingByEmail.auth0_sub;
                    if (isLinked && existingByEmail.auth0UserId !== sub && existingByEmail.auth0_sub !== sub) {
                        const isPrevSocial = String(existingByEmail.auth0UserId || '').startsWith('google-oauth2|') ||
                                             String(existingByEmail.auth0UserId || '').startsWith('apple|') ||
                                             String(existingByEmail.auth0UserId || '').startsWith('windowslive|');
                        if (isEnvAdmin || Boolean(resolvedStaffRole) || isPrevSocial) {
                            await db.collection('users').updateOne(
                                { _id: existingByEmail._id },
                                { $set: { auth0UserId: sub, auth0_sub: sub, updated_at: now } }
                            );
                            existingByEmail.auth0UserId = sub;
                            existingByEmail.auth0_sub = sub;
                        } else {
                            throw new ForbiddenError('Staff identity mismatch: Account is bound to a different identity provider subject.');
                        }
                    } else if (!isLinked) {
                        await db.collection('users').updateOne(
                            { _id: existingByEmail._id },
                            { $set: { auth0UserId: sub, auth0_sub: sub, updated_at: now } }
                        );
                        existingByEmail.auth0UserId = sub;
                        existingByEmail.auth0_sub = sub;
                    }
                } else {
                    // Customer account linking: bind this Auth0 subject (e.g. Google OAuth) to existing customer record
                    const isLinked = existingByEmail.auth0UserId || existingByEmail.auth0_sub;
                    if (!isLinked || existingByEmail.auth0UserId !== sub) {
                        await db.collection('users').updateOne(
                            { _id: existingByEmail._id },
                            { $set: { auth0UserId: sub, auth0_sub: sub, updated_at: now } }
                        );
                        existingByEmail.auth0UserId = sub;
                        existingByEmail.auth0_sub = sub;
                    }
                }
                user = existingByEmail;
            }
        }

        if (user && (user.is_blocked || user.status === 'blocked' || user.status === 'suspended')) {
            throw new ForbiddenError('This account has been suspended or blocked. Please contact support.');
        }

        if (!user) {
            const internalDbId = new ObjectId().toHexString();
            const customerId = generateCustomerId();
            const staffId = generateStaffId();
            const isStaff = !isCustomerPortal && Boolean(resolvedStaffRole);
            const role = isStaff ? (resolvedStaffRole as string) : 'customer';
            const fullName = (name || formatted.split('@')[0] || (role === 'customer' ? 'Customer' : 'Staff Member')).trim();

            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
            const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const newUser: any = {
                _id: internalDbId as any,
                publicId: isStaff ? staffId : customerId,
                customerId: isStaff ? undefined : customerId,
                staffId: isStaff ? staffId : undefined,
                id: isStaff ? staffId : customerId,
                email: formatted,
                auth0UserId: sub,
                auth0_sub: sub,
                full_name: fullName,
                phone: isStaff ? (process.env.ADMIN_PHONE || '') : '',
                role: role,
                avatar_url: picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=03045E&color=CAF0F8&size=128`,
                wallet_balance: 0,
                reward_points: 0,
                customer_status: 'active',
                status: 'active',
                email_verified: isStaff ? true : false,
                verificationTokenHash: !isStaff ? verificationTokenHash : undefined,
                verificationTokenExpiresAt: !isStaff ? verificationTokenExpiresAt : undefined,
                verification_email_sent: !isStaff,
                verification_email_sent_at: !isStaff ? now : undefined,
                welcome_email_sent: false,
                first_login_at: now,
                last_login_at: now,
                login_count: 1,
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
                    marketingEmails: false
                },
                marketing_consent: false,
                created_at: now,
                updated_at: now
            };

            await db.collection('users').insertOne(newUser);
            user = newUser;

            await AuditService.recordEvent({
                entityType: 'user',
                entityId: role === 'customer' ? customerId : String(internalDbId),
                action: role === 'customer' ? 'user_registered_auth0' : `${role}_registered_auth0`,
                actorId: sub || customerId,
                actorRole: role,
                ipAddress: clientIp
            });

            // Dispatch first-login Verification Email for customer accounts
            if (role === 'customer' || isCustomerPortal) {
                const canonicalBase = (body?.appUrl || process.env.CUSTOMER_APP_URL || process.env.PUBLIC_CUSTOMER_URL || process.env.VERIFICATION_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
                const customerDisplayName = user.full_name || name || formatted.split('@')[0] || 'Valued Customer';
                const verificationUrl = `${canonicalBase}/verify-email?email=${encodeURIComponent(formatted)}&token=${verificationToken}`;

                sendVerificationEmail({
                    to: formatted,
                    customerName: customerDisplayName,
                    verificationUrl,
                    appUrl: canonicalBase
                }).catch(err => console.error('[AuthService] First login verification email error:', err?.message || err));
            }
        } else {
            const updateDoc: any = {
                updated_at: now,
                last_login_at: now,
            };
            if (!user.first_login_at) {
                updateDoc.first_login_at = user.created_at || now;
            }
            updateDoc.login_count = (user.login_count || 1) + 1;

            // If customer account is NOT verified, dispatch verification email so they can complete verification
            if (user.role === 'customer' && !user.email_verified) {
                const verificationToken = crypto.randomBytes(32).toString('hex');
                const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
                const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                updateDoc.verificationTokenHash = verificationTokenHash;
                updateDoc.verificationTokenExpiresAt = verificationTokenExpiresAt;
                updateDoc.verification_email_sent = true;
                updateDoc.verification_email_sent_at = now;

                const canonicalBase = (body?.appUrl || process.env.CUSTOMER_APP_URL || process.env.PUBLIC_CUSTOMER_URL || process.env.VERIFICATION_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
                const customerDisplayName = user.full_name || name || formatted.split('@')[0] || 'Valued Customer';
                const verificationUrl = `${canonicalBase}/verify-email?email=${encodeURIComponent(formatted)}&token=${verificationToken}`;

                sendVerificationEmail({
                    to: formatted,
                    customerName: customerDisplayName,
                    verificationUrl,
                    appUrl: canonicalBase
                }).catch(err => console.error('[AuthService] Existing user verification email error:', err?.message || err));
            } else if (user.role === 'customer' && user.email_verified && !user.welcome_email_sent) {
                // If verified and welcome email was not sent yet, send welcome email
                const canonicalBase = (body?.appUrl || process.env.CUSTOMER_APP_URL || process.env.PUBLIC_CUSTOMER_URL || process.env.VERIFICATION_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
                const customerDisplayName = user.full_name || name || formatted.split('@')[0] || 'Valued Customer';
                sendWelcomeEmail({
                    to: formatted,
                    customerName: customerDisplayName,
                    couponCode: 'WELCOME20',
                    discountPercent: 20,
                    appUrl: canonicalBase
                }).then(async () => {
                    await db.collection('users').updateOne(
                        { _id: user._id },
                        { $set: { welcome_email_sent: true, welcome_email_sent_at: new Date().toISOString() } }
                    );
                    user.welcome_email_sent = true;
                }).catch(err => console.error('[AuthService] Welcome email send error:', err?.message || err));
            }
            const unsetDoc: any = {};

            const existingIsStaff = ['super_admin', 'admin', 'plant_manager', 'manager', 'driver', 'processor'].includes(user.role);

            if (isCustomerPortal) {
                // If an operational or administrative staff member attempts to sign into the customer portal,
                // do NOT demote or mutate their staff record in MongoDB. Reject cleanly with portal guidance.
                if (existingIsStaff || resolvedStaffRole) {
                    throw new ForbiddenError(
                        `Access Restricted: Account "${formatted}" is registered as operational/administrative staff (${user.role || resolvedStaffRole}). Please use the Operations or Administrator Portal.`
                    );
                }
                if (user.role !== 'customer') {
                    updateDoc.role = 'customer';
                    user.role = 'customer';
                }
                const existingCustId = user.customerId && String(user.customerId).startsWith('CUST-') ? user.customerId : null;
                const finalCustId = existingCustId || generateCustomerId();
                if (!user.customerId || user.customerId !== finalCustId) {
                    updateDoc.customerId = finalCustId;
                    user.customerId = finalCustId;
                }
                if (user.publicId !== finalCustId) {
                    updateDoc.publicId = finalCustId;
                    user.publicId = finalCustId;
                }
                if (user.id !== finalCustId) {
                    updateDoc.id = finalCustId;
                    user.id = finalCustId;
                }
            } else {
                // Logging in via Admin or Operations portal
                // If Auth0 grants a staff role or user already had a staff role, sync/restore their role
                const targetRole = resolvedStaffRole || (existingIsStaff ? user.role : null);
                if (targetRole) {
                    if (user.role !== targetRole) {
                        updateDoc.role = targetRole;
                        user.role = targetRole;
                    }
                    if (!user.staffId) {
                        const newStaffId = generateStaffId();
                        updateDoc.staffId = newStaffId;
                        user.staffId = newStaffId;
                    }
                    if (!user.publicId || user.publicId.startsWith('CUST-')) {
                        updateDoc.publicId = user.staffId;
                        user.publicId = user.staffId;
                    }
                }
            }

            if (user.role === 'customer' && (user.email_verified || verifiedToken.emailVerified === true)) {
                await OrderService.linkGuestOrdersToCustomer(
                    formatted,
                    user.customerId || user.publicId || String(user._id),
                    String(user._id)
                ).catch(err => {
                    console.error('[AuthService] Error linking guest orders on Auth0 login:', err);
                });
            }

            if (sub && user.auth0UserId !== sub) updateDoc.auth0UserId = sub;
            if (sub && user.auth0_sub !== sub) updateDoc.auth0_sub = sub;
            if (picture && (!user.avatar_url || String(user.avatar_url).includes('ui-avatars.com'))) {
                updateDoc.avatar_url = picture;
            }
            if (name && (!user.full_name || user.full_name === formatted.split('@')[0])) {
                updateDoc.full_name = name;
            }

            const updateOps: any = {};
            if (Object.keys(updateDoc).length > 0) {
                updateOps.$set = updateDoc;
            }
            if (Object.keys(unsetDoc).length > 0) {
                updateOps.$unset = unsetDoc;
            }

            if (Object.keys(updateOps).length > 0) {
                await db.collection('users').updateOne(
                    { _id: user._id } as any,
                    updateOps
                );
            }
        }

        // Enforce portal-level role restrictions: Restrict unauthorized logins
        if (body?.portal === 'admin' && user.role !== 'admin' && user.role !== 'super_admin') {
            throw new ForbiddenError(`Access Restricted: Account "${formatted}" has role "${user.role || 'customer'}" and is not authorized to access the Administrator Portal.`);
        }
        if (body?.portal === 'operations' && !['driver', 'processor', 'manager', 'plant_manager', 'admin', 'super_admin'].includes(user.role)) {
            throw new ForbiddenError(`Access Restricted: Account "${formatted}" has role "${user.role || 'customer'}". This portal is restricted to authorized Operations Staff only.`);
        }
        if (body?.portal === 'customer' && ['driver', 'processor', 'manager', 'plant_manager', 'admin', 'super_admin'].includes(user.role)) {
            throw new ForbiddenError(`Access Restricted: Account "${formatted}" is registered as operational/administrative staff (${user.role}). Please use the Operations or Administrator Portal or sign in with a Customer account.`);
        }

        const internalId = String(user._id);
        const role = user.role || 'customer';
        const isStaffUser = ['driver', 'processor', 'manager', 'plant_manager', 'admin', 'super_admin'].includes(role);
        const publicId = user.publicId || (isStaffUser ? user.staffId : user.customerId) || user.id || internalId;
        const token = signJwt({ 
            sub: internalId, 
            auth0UserId: user.auth0UserId || sub,
            email: formatted, 
            role,
            emailVerified: user.email_verified ?? true 
        });

        const phone = user.phone || '';
        const needsProfileCompletion = !phone || phone.trim() === '';

        return {
            token,
            needsProfileCompletion,
            user: {
                id: publicId,
                publicId,
                customerId: !isStaffUser ? publicId : undefined,
                staffId: isStaffUser ? publicId : undefined,
                internalId,
                email: user.email,
                name: user.full_name,
                phone,
                role,
                emailVerified: Boolean(user.email_verified),
                plantId: user.plant_id || user.plantId
            }
        };
    }

    /**
     * Safely migrates existing plaintext verification tokens in MongoDB to SHA-256 hashes
     * and permanently strips plaintext token fields.
     */
    static async migrateLegacyVerificationTokens(): Promise<{ migratedCount: number }> {
        const db = await getDb();
        const cursor = db.collection('users').find({
            email_verified: { $ne: true },
            $or: [
                { verificationToken: { $exists: true, $ne: '' } },
                { verification_token: { $exists: true, $ne: '' } }
            ],
            verificationTokenHash: { $in: [null, '', undefined] }
        });

        let migratedCount = 0;
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            if (!doc) break;
            const plainToken = doc.verificationToken || doc.verification_token;
            if (plainToken && typeof plainToken === 'string') {
                const hash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');
                const expiresAt = doc.verificationTokenExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                await db.collection('users').updateOne(
                    { _id: doc._id },
                    {
                        $set: {
                            verificationTokenHash: hash,
                            verificationTokenExpiresAt: expiresAt
                        },
                        $unset: {
                            verificationToken: '',
                            verification_token: ''
                        }
                    }
                );
                migratedCount++;
            }
        }
        return { migratedCount };
    }

    /**
     * Verifies a customer's email address using their verification token.
     * Updates MongoDB and Auth0 to mark email as verified, links prior guest orders,
     * creates an authenticated session, and returns session credentials for seamless one-click login.
     */
    static async verifyEmail(email: string, token: string, appUrl?: string) {
        if (!email || !token || typeof token !== 'string') {
            throw new BadRequestError('Email and verification token are required.');
        }

        const cleanToken = token.trim();
        // Public identifiers (customerId, publicId, _id) are strictly prohibited as verification credentials
        if (cleanToken.length < 16 || cleanToken.startsWith('CUST-') || cleanToken.startsWith('STF-') || cleanToken.startsWith('ORD-')) {
            throw new BadRequestError('Invalid or expired verification token.');
        }

        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        const now = new Date().toISOString();
        const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

        // On-the-fly migration for any legacy unverified user before token query
        const legacyUser = await db.collection('users').findOne({
            email: formatted,
            email_verified: { $ne: true },
            verificationTokenHash: { $in: [null, '', undefined] },
            $or: [
                { verificationToken: { $exists: true, $ne: '' } },
                { verification_token: { $exists: true, $ne: '' } }
            ]
        });
        if (legacyUser) {
            const raw = legacyUser.verificationToken || legacyUser.verification_token;
            if (raw && typeof raw === 'string') {
                const legacyHash = crypto.createHash('sha256').update(raw.trim()).digest('hex');
                const legacyExpiresAt = legacyUser.verificationTokenExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                await db.collection('users').updateOne(
                    { _id: legacyUser._id },
                    {
                        $set: { verificationTokenHash: legacyHash, verificationTokenExpiresAt: legacyExpiresAt },
                        $unset: { verificationToken: '', verification_token: '' }
                    }
                );
            }
        }

        // Single atomic conditional database operation to verify and consume token
        // Strictly queries verificationTokenHash (plaintext tokens are permanently non-accepted)
        const user = await db.collection('users').findOneAndUpdate(
            {
                email: formatted,
                verificationTokenHash: tokenHash,
                verificationTokenExpiresAt: { $gt: now, $exists: true, $ne: null },
                email_verified: { $ne: true }
            },
            {
                $set: {
                    email_verified: true,
                    status: 'active',
                    customer_status: 'active',
                    verified_at: now,
                    updated_at: now,
                    verification_email_sent: true,
                    verification_email_sent_at: now
                },
                $unset: {
                    verificationToken: '',
                    verification_token: '',
                    verificationTokenHash: '',
                    verificationTokenExpiresAt: ''
                }
            },
            { returnDocument: 'after' }
        );

        if (!user) {
            const existing = await db.collection('users').findOne({ email: formatted });
            if (!existing) {
                throw new NotFoundError('No account found associated with this email address.');
            }
            if (existing.email_verified) {
                throw new BadRequestError('This email is already verified. Please proceed to log in.');
            }
            if (existing.verificationTokenExpiresAt && new Date(existing.verificationTokenExpiresAt).getTime() <= Date.now()) {
                throw new BadRequestError('This email verification link has expired. Please sign in or request a new link.');
            }
            throw new BadRequestError('Invalid or expired verification token.');
        }

        // Link prior guest orders to customer profile strictly after verified email ownership
        const publicId = user.publicId || user.customerId || user.id || String(user._id);
        const internalId = String(user._id);
        let linkedGuestOrders = 0;
        try {
            linkedGuestOrders = await OrderService.linkGuestOrdersToCustomer(formatted, publicId, internalId);
        } catch (linkErr) {
            console.error('[AuthService] Error linking guest orders on email verification:', linkErr);
        }

        // Update Auth0 user record if configured
        const auth0Id = user.auth0UserId || user.auth0_sub;
        if (auth0Id && Auth0Service.isConfigured()) {
            try {
                await Auth0Service.updateUser(auth0Id, { emailVerified: true });
            } catch (auth0Err: any) {
                console.warn('[AuthService] Notice: Could not update email_verified in Auth0:', auth0Err?.message || auth0Err);
            }
        }

        const role = user.role || 'customer';
        const isStaff = ['driver', 'processor', 'manager', 'admin', 'super_admin'].includes(role);

        const jwtToken = signJwt({
            sub: internalId,
            auth0UserId: auth0Id,
            email: user.email,
            role,
            emailVerified: true
        });

        await AuditService.recordEvent({
            entityType: 'user',
            entityId: publicId,
            action: 'email_verified',
            actorId: publicId,
            actorRole: role,
            metadata: { email: user.email, linkedGuestOrders }
        });

        // Dispatch Welcome Email now that the account is verified successfully!
        if (!user.welcome_email_sent) {
            const canonicalBase = (appUrl || process.env.CUSTOMER_APP_URL || process.env.PUBLIC_CUSTOMER_URL || process.env.VERIFICATION_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
            const customerDisplayName = user.full_name || user.name || formatted.split('@')[0] || 'Valued Customer';
            try {
                await sendWelcomeEmail({
                    to: formatted,
                    customerName: customerDisplayName,
                    couponCode: 'WELCOME20',
                    discountPercent: 20,
                    appUrl: canonicalBase
                });
                await db.collection('users').updateOne(
                    { _id: user._id },
                    { $set: { welcome_email_sent: true, welcome_email_sent_at: new Date().toISOString() } }
                );
            } catch (err: any) {
                console.error('[AuthService] Welcome email error on email verification:', err?.message || err);
            }
        }

        return {
            success: true,
            token: jwtToken,
            user: {
                id: publicId,
                publicId,
                customerId: !isStaff ? publicId : undefined,
                staffId: isStaff ? publicId : undefined,
                internalId,
                email: user.email,
                name: user.full_name,
                phone: user.phone || '',
                role,
                emailVerified: true
            }
        };
    }
}

