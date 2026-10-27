import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api';
import { AdminService } from '@/services/AdminService';

export async function GET(req: NextRequest) {
    try {
        const context = await requirePermission(req, 'plants:read');
        const data = await AdminService.getPlants(context.dbUser);
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: e.status || 400 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const context = await requirePermission(req, 'plants:create');
        const body = await req.json();
        const plantPayload = body.plantData || body;
        const actorId = String(context.dbUser._id || context.token.sub);
        const data = await AdminService.createPlant(actorId, plantPayload);
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: e.status || 400 });
    }
}
