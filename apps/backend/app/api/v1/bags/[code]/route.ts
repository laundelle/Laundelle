import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, requireRoleAsync, BadRequestError, NotFoundError, handleOptions } from '@/lib/api';
import { QRBagService } from '@/services/QRBagService';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export const GET = withErrorHandler(async (req: NextRequest, context: any) => {
  await requireRoleAsync(req, ['super_admin', 'admin', 'manager', 'plant_manager', 'driver', 'processor']);

  const params = await context.params;
  const code = decodeURIComponent(params?.code || '');
  if (!code) throw new BadRequestError('Bag code is required.');

  const bag = await QRBagService.getBag(code);
  if (!bag) throw new NotFoundError(`Bag "${code}" not found.`);

  return successResponse(bag);
});

export const PATCH = withErrorHandler(async (req: NextRequest, context: any) => {
  const session = await requireRoleAsync(req, ['super_admin', 'admin', 'manager', 'plant_manager', 'processor']);

  const params = await context.params;
  const code = decodeURIComponent(params?.code || '');
  if (!code) throw new BadRequestError('Bag code is required.');

  const body = await req.json().catch(() => ({}));
  const action = (body.action || '').toUpperCase();
  const reason = body.reason || body.notes || 'Status updated via API';

  let updatedBag: any;

  if (action === 'QUARANTINE') {
    updatedBag = await QRBagService.quarantineBag(code, reason, session.sub);
  } else if (action === 'RETIRE') {
    updatedBag = await QRBagService.retireBag(code, reason, session.sub);
  } else if (action === 'RETURN_INVENTORY') {
    updatedBag = await QRBagService.returnBagToInventory(code, body.condition || 'good', session.sub);
  } else if (action === 'REPORT_LOST') {
    updatedBag = await QRBagService.reportMissingBag(code, body.orderId, session.sub);
  } else {
    throw new BadRequestError(`Invalid or unsupported action: "${body.action}". Supported actions: QUARANTINE, RETIRE, RETURN_INVENTORY, REPORT_LOST.`);
  }

  return successResponse(updatedBag);
});

