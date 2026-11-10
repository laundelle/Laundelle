import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, requireAuthAsync, resolveLaundelleUser, BadRequestError, UnauthorizedError, ForbiddenError } from '@/lib/api';
import { CodService } from '@/services/CodService';

export const POST = withErrorHandler(async (req: NextRequest, context: any) => {
    const token = await requireAuthAsync(req);
    const dbUser = await resolveLaundelleUser(token);
    if (!dbUser) {
        throw new UnauthorizedError('Authenticated user profile not found.');
    }

    const role = dbUser.role || token.role;
    if (!['driver', 'admin', 'super_admin'].includes(role)) {
        throw new ForbiddenError('Access denied: Driver privileges required for COD recording.');
    }

    const body = await req.json();
    const { amountCollected, paymentMethod, receiptReference, notes, idempotencyKey } = body;

    if (amountCollected === undefined || typeof amountCollected !== 'number') {
        throw new BadRequestError('amountCollected is required and must be a number.');
    }

    const params = await context.params;
    const orderId = params.id;

    const record = await CodService.recordCodCollection({
        orderId,
        actor: {
            id: String(dbUser._id),
            publicId: dbUser.publicId || dbUser.staffId,
            role,
            plantId: dbUser.plant_id || dbUser.plantId,
            name: dbUser.full_name
        },
        amountCollected,
        paymentMethod,
        receiptReference,
        notes,
        idempotencyKey: idempotencyKey || req.headers.get('idempotency-key') || undefined
    });

    return successResponse({ record });
});
