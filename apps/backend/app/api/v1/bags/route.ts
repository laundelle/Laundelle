import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, requireRoleAsync, BadRequestError, handleOptions } from '@/lib/api';
import { QRBagService } from '@/services/QRBagService';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireRoleAsync(req, ['super_admin', 'admin', 'manager', 'plant_manager', 'processor']);

  const { searchParams } = new URL(req.url);
  const plantId = searchParams.get('plantId') || (session.plantId ? String(session.plantId) : undefined);
  const status = searchParams.get('status') || undefined;
  const condition = searchParams.get('condition') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const result = await QRBagService.listBags({
    plantId,
    status,
    condition,
    page,
    limit
  });

  return successResponse(result);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await requireRoleAsync(req, ['super_admin', 'admin', 'manager', 'plant_manager']);

  const body = await req.json().catch(() => ({}));
  if (!body.qrCode) {
    throw new BadRequestError('Field "qrCode" is required.');
  }

  const bag = await QRBagService.registerBag({
    qrCode: body.qrCode,
    bagNumber: body.bagNumber,
    condition: body.condition || 'new',
    plantId: body.plantId || (session.plantId ? String(session.plantId) : undefined),
    notes: body.notes,
    registeredBy: session.sub
  });

  return successResponse(bag, 201);
});

