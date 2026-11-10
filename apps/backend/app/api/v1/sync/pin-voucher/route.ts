import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, requireAuthAsync, resolveLaundelleUser, BadRequestError, UnauthorizedError } from '@/lib/api';
import { OfflineSyncService } from '@/services/OfflineSyncService';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = await requireAuthAsync(req);
  const dbUser = await resolveLaundelleUser(token);
  if (!dbUser) {
    throw new UnauthorizedError('Authenticated user profile not found.');
  }

  const body = await req.json();

  if (body.action === 'GENERATE') {
    if (!body.orderId || !body.deviceId) {
      throw new BadRequestError('orderId and deviceId are required to generate offline PIN voucher.');
    }

    const voucher = await OfflineSyncService.generateOfflinePinVoucher({
      orderId: body.orderId,
      deviceId: body.deviceId,
      actorId: dbUser.publicId || dbUser.staffId || String(dbUser._id),
      actorRole: dbUser.role || token.role,
      operation: body.operation || 'delivery',
      plainPin: body.pin,
      validityHours: body.validityHours
    });

    return successResponse({ voucher }, 201);
  } else if (body.action === 'VERIFY') {
    if (!body.voucher || !body.enteredPin) {
      throw new BadRequestError('voucher and enteredPin are required for offline PIN verification.');
    }

    const result = await OfflineSyncService.verifyOfflinePinVoucher(
      body.voucher,
      body.enteredPin,
      body.operation,
      body.deviceId
    );
    return successResponse(result);
  } else {
    throw new BadRequestError('Invalid action. Expected GENERATE or VERIFY.');
  }
});
