import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { hashPassword, signJwt, verifyPassword, isLegacyHash, revokeToken, JwtPayload } from '@/lib/auth';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '@/lib/api';
import { AuditService } from '@/services/AuditService';
import crypto from 'crypto';

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

        const newUser = {
            _id: internalDbId as any,
            publicId: customerId,
            customerId: customerId,
            id: customerId,
            email: formatted,
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

        // Link any prior guest orders to the newly registered customer
        await OrderService.linkGuestOrdersToCustomer(formatted, customerId, internalDbId).catch(err => {
            console.error('[AuthService] Error linking guest orders on signup:', err);
        });

        // Write an audit event
        await AuditService.recordEvent({
            entityType: 'user',
            entityId: customerId,
            action: 'user_registered',
            actorId: customerId,
            actorRole: 'customer',
            ipAddress: clientIp
        });

        // Send Welcome email (with WELCOME20 coupon) & Verification email asynchronously
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.CUSTOMER_APP_URL || 'https://laundelle.com';
        sendWelcomeEmail({
            to: formatted,
            customerName: newUser.full_name,
            couponCode: 'WELCOME20',
            discountPercent: 20,
            appUrl
        }).catch(err => console.error('[AuthService] Welcome email error:', err?.message || err));

        sendVerificationEmail({
            to: formatted,
            customerName: newUser.full_name,
            verificationUrl: `${appUrl}/verify-email?email=${encodeURIComponent(formatted)}&token=${customerId}`,
            appUrl
        }).catch(err => console.error('[AuthService] Verification email error:', err?.message || err));

        const token = signJwt({ sub: internalDbId, email: formatted, role: 'customer' });
        
        return {
            token,
            user: {
                id: customerId,
                publicId: customerId,
                customerId,
                internalId: internalDbId,
                email: formatted,
                name: newUser.full_name,
                phone: newUser.phone,
                role: 'customer'
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

        const token = signJwt({ sub: String(user._id), email: formatted, role: user.role || 'customer' });
        
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
     * Verifies Admin MFA TOTP / static code.
     */
    static verifyAdminMfa(user: any, mfaCode: string): boolean {
        if (!user.mfaEnabled) return true;
        if (!user.mfaSecret || !mfaCode) return false;
        const expected = String(user.mfaSecret).trim();
        return String(mfaCode).trim() === expected;
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
                    const appR = m2mUser.appMetadata?.roles || m2mUser.appMetadata?.role;
                    if (Array.isArray(appR)) candidateRoles.push(...appR);
                    else if (typeof appR === 'string') candidateRoles.push(appR);

                    const userR = m2mUser.userMetadata?.roles || m2mUser.userMetadata?.role;
                    if (Array.isArray(userR)) candidateRoles.push(...userR);
                    else if (typeof userR === 'string') candidateRoles.push(userR);
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
                email_verified: true,
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

            if (role === 'customer') {
                await OrderService.linkGuestOrdersToCustomer(formatted, customerId, String(internalDbId)).catch(err => {
                    console.error('[AuthService] Error linking guest orders on Auth0 registration:', err);
                });
            }

            await AuditService.recordEvent({
                entityType: 'user',
                entityId: role === 'customer' ? customerId : String(internalDbId),
                action: role === 'customer' ? 'user_registered_auth0' : `${role}_registered_auth0`,
                actorId: sub || customerId,
                actorRole: role,
                ipAddress: clientIp
            });
        } else {
            const updateDoc: any = { updated_at: now, last_login_at: now };
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

            if (user.role === 'customer') {
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

        // Dispatch Welcome Email (WELCOME20) and Email Verification Mail for customers signing in via Google / Auth0
        if (user.role === 'customer' || isCustomerPortal) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.CUSTOMER_APP_URL || 'https://laundelle.com';
            const customerDisplayName = user.full_name || name || formatted.split('@')[0] || 'Valued Customer';
            const customerIdentifier = user.customerId || user.publicId || String(user._id);

            // 1. Welcome Email with WELCOME20 coupon
            if (!user.welcome_email_sent) {
                sendWelcomeEmail({
                    to: formatted,
                    customerName: customerDisplayName,
                    couponCode: 'WELCOME20',
                    discountPercent: 20,
                    appUrl
                }).then(async (res) => {
                    await db.collection('users').updateOne(
                        { _id: user._id } as any,
                        { $set: { welcome_email_sent: true, welcome_email_sent_at: new Date().toISOString() } }
                    );
                    user.welcome_email_sent = true;
                }).catch(err => console.error('[AuthService] Google login welcome email error:', err?.message || err));
            }

            // 2. Email Verification Mail (Universal account verification button)
            if (!user.verification_email_sent) {
                const verificationUrl = `${appUrl}/verify-email?email=${encodeURIComponent(formatted)}&token=${customerIdentifier}&provider=google`;
                sendVerificationEmail({
                    to: formatted,
                    customerName: customerDisplayName,
                    verificationUrl,
                    appUrl
                }).then(async (res) => {
                    await db.collection('users').updateOne(
                        { _id: user._id } as any,
                        { $set: { verification_email_sent: true, verification_email_sent_at: new Date().toISOString() } }
                    );
                    user.verification_email_sent = true;
                }).catch(err => console.error('[AuthService] Google login verification email error:', err?.message || err));
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
                plantId: user.plant_id || user.plantId
            }
        };
    }
}

