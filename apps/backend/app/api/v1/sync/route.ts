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

  if (!body.deviceId || !Array.isArray(body.operations)) {
    throw new BadRequestError('deviceId and operations array are required for sync.');
  }

  const result = await OfflineSyncService.processSyncBatch(
    {
      deviceId: body.deviceId,
      operations: body.operations,
      lastSyncSequence: body.lastSyncSequence
    },
    {
      userId: String(dbUser._id),
      publicId: dbUser.publicId || dbUser.staffId || dbUser.customerId,
      role: dbUser.role || token.role || 'customer',
      plantId: dbUser.plant_id || dbUser.plantId || token.plantId
    }
  );

  return successResponse(result);
});
