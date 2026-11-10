import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, successResponse, getClientIp } from '@/lib/api';
import { AuthService } from '@/services/AuthService';
import { SessionService } from '@/services/SessionService';
import { RateLimitService } from '@/services/RateLimitService';

async function signupHandler(req: NextRequest) {
    const clientIp = getClientIp(req);

    // Rate limit signup attempts: 5 per minute per IP
    const rateCheck = await RateLimitService.checkLimit({
        key: `auth:signup:${clientIp}`,
        maxRequests: 5,
        windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: 'Too many signup attempts. Please try again later.' },
            { 
                status: 429, 
                headers: { 
                    'Retry-After': String(rateCheck.resetInSeconds),
                    'X-RateLimit-Limit': String(rateCheck.limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': rateCheck.resetAt.toISOString(),
                } 
            }
        );
    }

    const body = await req.json();

    const rawOrigin = req.headers.get('origin') || req.headers.get('referer') || '';
    let parsedOrigin = '';
    try {
        if (rawOrigin) parsedOrigin = new URL(rawOrigin).origin;
    } catch {}
    if (parsedOrigin && !body.appUrl) {
        body.appUrl = parsedOrigin;
    }
    
    const result = await AuthService.signUp(body, clientIp);
    const portal = body.portal || 'customer';

    // Create server-side session in MongoDB
    const { sessionId, csrfToken } = await SessionService.createSession({
        userId: (result.user as any).internalId || result.user.id,
        publicId: result.user.publicId || result.user.id,
        email: result.user.email,
        role: result.user.role || 'customer',
        portal,
        userAgent: req.headers.get('user-agent') || 'unknown',
        ipAddress: clientIp,
    });

    const isNonBrowserClient = req.headers.get('x-client-type') === 'mobile' ||
        req.headers.get('x-auth-transport') === 'token' ||
        body.clientType === 'mobile' ||
        body.returnToken === true;

    const responseData: any = {
        ...result,
        csrfToken
    };

    // BFF Architecture: Suppress browser-accessible JWT exposure in response body for cookie-based browser sessions
    if (!isNonBrowserClient) {
        delete responseData.token;
    }

    const response = successResponse(responseData, 201);
    const cookieConfig = SessionService.getCookieConfig(portal);
    response.cookies.set(cookieConfig.name, sessionId, cookieConfig.options);

    return response;
}

export const POST = withErrorHandler(signupHandler);
