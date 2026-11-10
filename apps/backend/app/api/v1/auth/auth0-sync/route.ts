import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, UnauthorizedError } from '@/lib/api';
import { verifyJwtAsync, JwtPayload } from '@/lib/auth';
import { AuthService } from '@/services/AuthService';
import { SessionService } from '@/services/SessionService';

async function auth0SyncHandler(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Authorization header with Bearer token is required for Auth0 synchronization.');
    }

    const rawToken = authHeader.substring(7).trim();
    const verifiedToken: JwtPayload | null = await verifyJwtAsync(rawToken);

    if (!verifiedToken) {
        throw new UnauthorizedError('Invalid or expired Auth0 identity token.');
    }

    if (verifiedToken.isLegacyToken) {
        throw new UnauthorizedError('Auth0 synchronization requires an authentic Auth0 identity token, not a legacy token.');
    }

    const body = await req.json().catch(() => ({}));
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';

    // Capture caller origin to ensure verification emails point back to the actual running environment
    const rawOrigin = req.headers.get('origin') || req.headers.get('referer') || '';
    let parsedOrigin = '';
    try {
        if (rawOrigin) parsedOrigin = new URL(rawOrigin).origin;
    } catch {}
    if (parsedOrigin && !body.appUrl) {
        body.appUrl = parsedOrigin;
    }

    // Portal determination:
    // 1. Explicit body.portal takes precedence if provided.
    // 2. Secondary fallback based on trusted origin/referer headers for development/multi-domain routing.
    // Note: Actual access control and permissions are enforced authoritatively by AuthService.syncAuth0User via database roles.
    if (!body.portal) {
        const origin = (req.headers.get('origin') || req.headers.get('referer') || '').toLowerCase();

        const isAdminOrigin = origin.includes(':3002') ||
            origin.includes('admin.') ||
            origin.includes('3002.inc1.devtunnels.ms');

        const isOpsOrigin = origin.includes(':3001') ||
            origin.includes('ops.') ||
            origin.includes('operations.') ||
            origin.includes('3001.inc1.devtunnels.ms');

        const isExplicitCustomerOrigin = origin.includes(':3000') ||
            origin.includes('customer.') ||
            origin.includes('3000.inc1.devtunnels.ms') ||
            (!isAdminOrigin && !isOpsOrigin && (origin.includes('laundelle.co.uk') || origin.includes('localhost') || origin.includes('127.0.0.1')));

        if (isAdminOrigin) {
            body.portal = 'admin';
        } else if (isOpsOrigin) {
            body.portal = 'operations';
        } else if (isExplicitCustomerOrigin) {
            body.portal = 'customer';
        } else {
            body.portal = 'customer';
        }
    }
    
    const result = await AuthService.syncAuth0User(body, clientIp, verifiedToken);
    const portal = body.portal || 'customer';

    // Create server-side session in MongoDB
    const { sessionId, csrfToken } = await SessionService.createSession({
        userId: (result.user as any).internalId || result.user.id,
        publicId: result.user.publicId || result.user.id,
        auth0UserId: verifiedToken.sub,
        email: result.user.email,
        role: result.user.role || 'customer',
        plantId: (result.user as any).plantId,
        portal,
        userAgent: req.headers.get('user-agent') || 'unknown',
        ipAddress: clientIp,
    });

    (result as any).csrfToken = csrfToken;

    const response = successResponse(result);
    const cookieConfig = SessionService.getCookieConfig(portal);
    response.cookies.set(cookieConfig.name, sessionId, cookieConfig.options);

    return response;
}

export const POST = withErrorHandler(auth0SyncHandler);
