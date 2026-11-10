import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, successResponse, BadRequestError, getClientIp } from '@/lib/api';
import { AuthService } from '@/services/AuthService';
import { SessionService } from '@/services/SessionService';
import { RateLimitService } from '@/services/RateLimitService';

async function verifyEmailHandler(req: NextRequest) {
    const clientIp = getClientIp(req);

    // Rate limit email verification attempts (10/min per IP) to prevent token brute force
    const rateCheck = await RateLimitService.checkLimit({
        key: `auth:verify_email:${clientIp}`,
        maxRequests: 10,
        windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
        return NextResponse.json(
            { error: 'Too many verification attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(rateCheck.resetInSeconds) } }
        );
    }

    let email = '';
    let token = '';

    if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        email = body.email;
        token = body.token;
    } else {
        const { searchParams } = new URL(req.url);
        email = searchParams.get('email') || '';
        token = searchParams.get('token') || '';
    }

    if (!email || !token) {
        throw new BadRequestError('Email and verification token are required.');
    }
    const rawOrigin = req.headers.get('origin') || req.headers.get('referer') || '';
    let parsedOrigin = '';
    try {
        if (rawOrigin) parsedOrigin = new URL(rawOrigin).origin;
    } catch {}

    const result = await AuthService.verifyEmail(email, token, parsedOrigin);

    // Create server-side session in MongoDB
    const { sessionId, csrfToken } = await SessionService.createSession({
        userId: (result.user as any).internalId || result.user.id,
        publicId: result.user.publicId || result.user.id,
        email: result.user.email,
        role: result.user.role || 'customer',
        portal: 'customer',
        userAgent: req.headers.get('user-agent') || 'unknown',
        ipAddress: clientIp,
    });

    (result as any).csrfToken = csrfToken;

    const response = successResponse({
        ...result,
        message: 'Email verified successfully. You are now logged in.'
    });

    const cookieConfig = SessionService.getCookieConfig('customer');
    response.cookies.set(cookieConfig.name, sessionId, cookieConfig.options);

    return response;
}

export const GET = withErrorHandler(verifyEmailHandler);
export const POST = withErrorHandler(verifyEmailHandler);

