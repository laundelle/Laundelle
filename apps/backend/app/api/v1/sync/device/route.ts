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
  if (!body.deviceId) {
    throw new BadRequestError('deviceId is required for device registration.');
  }

  const device = await OfflineSyncService.registerDevice(
    {
      deviceId: body.deviceId,
      userId: String(dbUser._id),
      userRole: dbUser.role || token.role || 'customer',
      appVersion: body.appVersion || '1.0.0',
      platform: body.platform,
      fcmToken: body.fcmToken
    },
    {
      userId: String(dbUser._id),
      publicId: dbUser.publicId || dbUser.staffId || dbUser.customerId,
      role: dbUser.role || token.role || 'customer',
      plantId: dbUser.plant_id || dbUser.plantId || token.plantId
    }
  );

  return successResponse({ device }, 201);
});

