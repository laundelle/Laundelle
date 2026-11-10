import { NextRequest, NextResponse } from 'next/server';
import { BackgroundJobService } from '@/services/BackgroundJobService';
import { getAuthenticatedUserAsync, resolveLaundelleUser, errorResponse, successResponse, handleOptions } from '@/lib/api';
import { normalizeRole } from '@laundelle/auth';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

/**
 * Validates that the cron request is authorized via dedicated CRON_SECRET header or an active Admin session.
 */
async function authorizeCronRequest(req: NextRequest): Promise<boolean> {
  const configuredSecret = process.env.CRON_SECRET;
  
  // 1. Check Bearer token or x-cron-secret header against dedicated CRON_SECRET only
  const authHeader = req.headers.get('authorization');
  const cronSecretHeader = req.headers.get('x-cron-secret');

  if (configuredSecret && configuredSecret.trim() !== '') {
    if (cronSecretHeader && cronSecretHeader === configuredSecret) {
      return true;
    }
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token === configuredSecret) {
        return true;
      }
    }
  }

  // 2. Check Vercel Cron header
  // When running on Vercel, requests from Vercel Cron automatically include CRON_SECRET in the Authorization header
  const vercelCronHeader = req.headers.get('x-vercel-cron');
  if (vercelCronHeader && configuredSecret && authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  // 3. Fallback: Authenticated Super Admin / Admin user session
  try {
    const authUser = await getAuthenticatedUserAsync(req);
    if (authUser) {
      const dbUser = await resolveLaundelleUser(authUser);
      const role = normalizeRole(dbUser?.role || authUser.role);
      if (['super_admin', 'admin'].includes(role || '')) {
        return true;
      }
    }
  } catch {}

  // In non-production development environments with no secrets set, allow local requests
  if (process.env.NODE_ENV !== 'production' && !configuredSecret) {
    return true;
  }

  return false;
}

async function handleCronExecution(req: NextRequest) {
  const isAuthorized = await authorizeCronRequest(req);
  if (!isAuthorized) {
    return errorResponse(
      'UNAUTHORIZED_CRON',
      'Unauthorized: Valid CRON_SECRET or Administrator session required to trigger maintenance jobs.',
      401
    );
  }

  const { searchParams } = new URL(req.url);
  const targetJob = (searchParams.get('job') || 'all').toLowerCase();
  const force = searchParams.get('force') === 'true';

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'internal_scheduler';
  const instanceId = `cron_${clientIp}_${Date.now()}`;

  try {
    if (targetJob === 'notifications') {
      const results = await BackgroundJobService.runNotificationRetries();
      return successResponse({ job: 'notifications', results });
    }

    if (targetJob === 'retention') {
      const results = await BackgroundJobService.runDataRetentionSweep();
      return successResponse({ job: 'retention', results });
    }

    if (targetJob === 'audit') {
      const results = await BackgroundJobService.runAuditIntegritySweep();
      return successResponse({ job: 'audit', results });
    }

    if (targetJob === 'sla') {
      const results = await BackgroundJobService.runSlaEvaluationSweep();
      return successResponse({ job: 'sla', results });
    }

    if (targetJob === 'vehicles') {
      const results = await BackgroundJobService.runVehicleExpirySweep();
      return successResponse({ job: 'vehicles', results });
    }

    if (targetJob === 'inventory') {
      const results = await BackgroundJobService.runInventoryLowStockSweep();
      return successResponse({ job: 'inventory', results });
    }

    // Default: run all maintenance sweeps with atomic distributed lock
    const execution = await BackgroundJobService.runAllMaintenanceJobs({
      force,
      instanceId,
      lockTtlSec: 300
    });

    if (execution.status === 'SKIPPED_LOCKED') {
      return NextResponse.json({
        success: false,
        status: 'SKIPPED_LOCKED',
        message: 'Maintenance jobs currently running on another instance.',
        execution
      }, { status: 409 });
    }

    return successResponse({
      status: execution.status,
      execution
    });
  } catch (err: any) {
    console.error('[CronEndpoint] Execution failure:', err);
    return errorResponse(
      'CRON_EXECUTION_ERROR',
      err.message || 'An error occurred during scheduled maintenance execution.',
      500
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCronExecution(req);
}

export async function POST(req: NextRequest) {
  return handleCronExecution(req);
}

