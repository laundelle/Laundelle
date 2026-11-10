import { NextRequest, NextResponse } from 'next/server';
import { requireAuthAsync, resolveLaundelleUser, ForbiddenError } from '@/lib/api';
import { normalizeRole } from '@laundelle/auth';
import { DriverService } from '@/services/DriverService';

export async function POST(req: NextRequest, context: any) {
    try {
        const token = await requireAuthAsync(req);
        const dbUser = await resolveLaundelleUser(token);
        const role = normalizeRole(dbUser?.role || token.role);

        if (!['driver', 'admin', 'super_admin'].includes(role)) {
            throw new ForbiddenError('Access denied: Driver or administrator privileges required.');
        }

        const body = await req.json();
        const { otp, pin, qrTagId, bagCount, pieceCount, photoUrls, notes, location } = body;
        const verificationPin = pin || otp;

        if (!verificationPin || !qrTagId) {
            return NextResponse.json({ error: 'Pickup PIN and QR Tag ID are required.' }, { status: 400 });
        }

        const params = await context.params;
        const orderId = params.id;
        const driverIdentity = String(dbUser?._id || dbUser?.publicId || token.sub);

        const result = await DriverService.confirmPickup(
            driverIdentity, 
            orderId, 
            verificationPin, 
            qrTagId, 
            bagCount || 1, 
            photoUrls,
            {
                pieceCount: typeof pieceCount === 'number' ? pieceCount : undefined,
                location,
                notes
            }
        );

        return NextResponse.json(result);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: err.status || 400 });
    }
}
