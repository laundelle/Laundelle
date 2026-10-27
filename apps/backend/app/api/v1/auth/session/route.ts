import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, getAuthenticatedUserAsync, resolveLaundelleUser } from '@/lib/api';
import { SessionService } from '@/services/SessionService';

async function sessionHandler(req: NextRequest) {
    try {
        const tokenUser = await getAuthenticatedUserAsync(req);
        if (!tokenUser) {
            return successResponse({
                isAuthenticated: false,
                user: null,
                csrfToken: null,
            });
        }

        const dbUser = await resolveLaundelleUser(tokenUser);
        if (!dbUser || dbUser.is_blocked || dbUser.status === 'suspended') {
            return successResponse({
                isAuthenticated: false,
                user: null,
                csrfToken: null,
            });
        }

        let csrfToken = null;
        if (tokenUser.sessionId) {
            const session = await SessionService.getSession(tokenUser.sessionId);
            if (session) {
                csrfToken = session.csrfToken;
            }
        }

        const publicId = dbUser.publicId || dbUser.customerId || dbUser.staffId || String(dbUser._id);
        const role = dbUser.role || tokenUser.role || 'customer';

        return successResponse({
            isAuthenticated: true,
            csrfToken,
            user: {
                id: publicId,
                publicId,
                customerId: role === 'customer' ? publicId : undefined,
                staffId: role !== 'customer' ? publicId : undefined,
                internalId: String(dbUser._id),
                email: dbUser.email,
                name: dbUser.full_name,
                role,
                plantId: dbUser.plantId || dbUser.plant_id || tokenUser.plantId || null,
                plant_id: dbUser.plant_id || dbUser.plantId || tokenUser.plantId || null,
                plantName: dbUser.plantName || dbUser.plant_name || null,
                manager_id: dbUser.manager_id || dbUser.plantManagerId || null,
                avatar_url: dbUser.avatar_url,
                phone: dbUser.phone || '',
            }
        });
    } catch {
        return successResponse({
            isAuthenticated: false,
            user: null,
            csrfToken: null,
        });
    }
}

export const GET = withErrorHandler(sessionHandler);
