import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, requireRoleAsync } from '@/lib/api';
import { SystemHealthService } from '@/services/SystemHealthService';

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireRoleAsync(req, ['admin', 'super_admin', 'manager']);
  const health = await SystemHealthService.checkHealth();
  return successResponse({ health });
});
