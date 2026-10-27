import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, requireRoleAsync, resolveLaundelleUser } from '@/lib/api';
import { OrderService } from '@/services/OrderService';

const ALL_AUTHENTICATED_ROLES = [
    'customer',
    'user',
    'driver',
    'processor',
    'manager',
    'plant_manager',
    'admin',
    'super_admin'
];

async function submitOrderRatingHandler(req: NextRequest, context: any) {
    const user = await requireRoleAsync(req, ALL_AUTHENTICATED_ROLES);
    const dbUser = await resolveLaundelleUser(user);
    const customerId = String(dbUser?._id || dbUser?.publicId || user.sub);
    const params = await context.params;
    const orderId = params.id;
    const body = await req.json().catch(() => ({}));
    const result = await OrderService.submitOrderRating(customerId, orderId, body.rating, body.feedback);
    return successResponse(result);
}

export const POST = withErrorHandler(submitOrderRatingHandler);
