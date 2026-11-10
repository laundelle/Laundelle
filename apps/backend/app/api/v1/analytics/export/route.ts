import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, requireRoleAsync, BadRequestError } from '@/lib/api';
import { AnalyticsService } from '@/services/AnalyticsService';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireRoleAsync(req, ['manager', 'plant_manager', 'admin', 'super_admin']);
  const type = (req.nextUrl.searchParams.get('type') || 'ORDERS').toUpperCase() as any;
  const startDate = req.nextUrl.searchParams.get('startDate') || undefined;
  const endDate = req.nextUrl.searchParams.get('endDate') || undefined;
  const plantId = req.nextUrl.searchParams.get('plantId') || (user.role === 'manager' ? user.plant_id : undefined);

  const validTypes = ['ORDERS', 'DRIVERS', 'MACHINES', 'INVENTORY', 'FINANCIAL'];
  if (!validTypes.includes(type)) {
    throw new BadRequestError(`Invalid export type ${type}. Must be one of: ${validTypes.join(', ')}`);
  }

  const csvContent = await AnalyticsService.exportCsvReport(
    type,
    { startDate, endDate, plantId },
    { id: user.id || 'manager', role: user.role || 'manager' }
  );

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="laundelle_${type.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
});
