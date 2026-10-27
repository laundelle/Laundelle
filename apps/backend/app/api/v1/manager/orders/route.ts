import { NextRequest, NextResponse } from 'next/server';
import { requireAuthAsync, requireRoleAsync, resolveLaundelleUser } from '@/lib/api';
import { ManagerService } from '@/services/ManagerService';

export async function GET(req: NextRequest) {
    try {
        const session = await requireAuthAsync(req);
        await requireRoleAsync(req, ['manager', 'plant_manager', 'admin', 'super_admin']);
        const dbUser = await resolveLaundelleUser(session);

        const url = new URL(req.url);
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const status = url.searchParams.get('status') || undefined;
        const dateFilter = url.searchParams.get('dateFilter') || undefined;
        const startDate = url.searchParams.get('startDate') || undefined;
        const endDate = url.searchParams.get('endDate') || undefined;
        const normRole = (session.role || dbUser?.role || '').toLowerCase();
        const isManager = normRole === 'manager' || normRole === 'plant_manager';
        const queryManagerId = url.searchParams.get('managerId');
        const targetManagerId = isManager
            ? (dbUser ? String(dbUser._id) : session.sub)
            : (queryManagerId || (dbUser ? String(dbUser._id) : session.sub));

        const data = await ManagerService.getOrders(targetManagerId, limit, page, status, dateFilter, startDate, endDate);
        return NextResponse.json({ success: true, ...data, data: data.orders, orders: data.orders, total: data.total });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
}

