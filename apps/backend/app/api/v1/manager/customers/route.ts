import { NextRequest, NextResponse } from 'next/server';
import { requireAuthAsync, requireRoleAsync, resolveLaundelleUser, withErrorHandler, BadRequestError } from '@/lib/api';
import { ManagerService } from '@/services/ManagerService';
import { AdminService } from '@/services/AdminService';

async function getManagerCustomersHandler(req: NextRequest) {
    const session = await requireAuthAsync(req);
    await requireRoleAsync(req, ['manager', 'plant_manager', 'admin', 'super_admin']);
    const dbUser = await resolveLaundelleUser(session);

    const url = new URL(req.url);
    const search = url.searchParams.get('search') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const page = parseInt(url.searchParams.get('page') || '1', 10);

    const normRole = (session.role || dbUser?.role || '').toLowerCase();
    const isManager = normRole === 'manager' || normRole === 'plant_manager';
    const queryManagerId = url.searchParams.get('managerId');
    const targetManagerId = isManager
        ? (dbUser ? String(dbUser._id) : session.sub)
        : (queryManagerId || (dbUser ? String(dbUser._id) : session.sub));

    const data = await ManagerService.getCustomers(targetManagerId, search, status, limit, page);
    return NextResponse.json({ success: true, ...data, data: data.customers });
}

async function postManagerCustomersHandler(req: NextRequest) {
    const session = await requireAuthAsync(req);
    await requireRoleAsync(req, ['manager', 'plant_manager', 'admin', 'super_admin']);
    const dbUser = await resolveLaundelleUser(session);
    const actorName = dbUser?.full_name || dbUser?.name || session.name || 'Plant Manager';
    const actorId = String(dbUser?._id || dbUser?.publicId || session.sub);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'flag') {
        const res = await AdminService.addCustomerFlag(actorId, actorName, body.flagData);
        return NextResponse.json(res);
    } else if (action === 'note') {
        const res = await AdminService.addCustomerNote(
            actorId,
            actorName,
            'Plant Manager',
            body.customerId,
            body.note
        );
        return NextResponse.json(res);
    } else {
        throw new BadRequestError('Invalid customer action.');
    }
}

export const GET = withErrorHandler(getManagerCustomersHandler);
export const POST = withErrorHandler(postManagerCustomersHandler);
