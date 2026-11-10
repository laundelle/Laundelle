import { NotificationService } from './NotificationService';
import { PrivacyService } from './PrivacyService';
import { AuditService } from './AuditService';
import { SlaService } from './SlaService';
import { VehicleService } from './VehicleService';
import { InventoryService } from './InventoryService';
import { getDb } from '@/lib/mongodb';
import { getSecureRandomString } from '@laundelle/ids';
import crypto from 'crypto';

export interface JobExecutionResult {
  jobId: string;
  jobName: string;
  status: 'COMPLETED' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SKIPPED_LOCKED';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  instanceId: string;
  results?: {
    notifications?: { retriedCount: number; failedPermanentlyCount: number };
    retentionSweep?: { purgedPhotosCount: number; purgedNotificationsCount: number };
    auditIntegrity?: { valid: boolean; totalChecked: number; message: string };
    slaCheck?: { totalEvaluated: number; atRiskCount: number; breachedCount: number };
    vehicleSweep?: { scanned: number; warnings: number; expired: number };
    inventorySweep?: { totalChecked: number; lowStockCount: number };
    [key: string]: any;
  };
  errors: string[];
}

export class BackgroundJobService {
  private static defaultInstanceId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

  /**
   * Attempts to acquire an atomic distributed lock in MongoDB.
   * Prevents concurrent job executions across multiple serverless instances or replicas.
   *
   * @param jobName    - Unique identifier for the job (e.g. 'maintenance_all')
   * @param ttlSeconds - Lock duration in seconds (after which the lock is considered abandoned)
   * @param instanceId - Identifier of the acquiring worker
   * @returns true if lock successfully acquired, false if held by another active worker
   */
  static async acquireLock(
    jobName: string,
    ttlSeconds: number = 300,
    instanceId: string = this.defaultInstanceId
  ): Promise<boolean> {
    const db = await getDb();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlSeconds * 1000);

    try {
      const res = await db.collection('job_locks').findOneAndUpdate(
        {
          _id: jobName as any,
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: null },
            { lockedUntil: { $lte: now } },
            { lockedBy: instanceId }
          ]
        },
        {
          $set: {
            lockedUntil,
            lockedBy: instanceId,
            acquiredAt: now.toISOString(),
            updatedAt: now.toISOString()
          }
        },
        {
          upsert: true,
          returnDocument: 'after'
        }
      );

      return res !== null;
    } catch (err: any) {
      // E11000 duplicate key error means another concurrent request won the lock insert
      if (err.code === 11000) {
        return false;
      }
      console.error(`[BackgroundJobLock] Lock acquisition failed for ${jobName}:`, err.message);
      return false;
    }
  }

  /**
   * Releases an acquired distributed lock, ensuring only the locking instance can release it.
   */
  static async releaseLock(
    jobName: string,
    instanceId: string = this.defaultInstanceId
  ): Promise<void> {
    try {
      const db = await getDb();
      await db.collection('job_locks').updateOne(
        {
          _id: jobName as any,
          lockedBy: instanceId
        },
        {
          $set: {
            lockedUntil: null,
            releasedAt: new Date().toISOString()
          }
        }
      );
    } catch (err: any) {
      console.warn(`[BackgroundJobLock] Failed to release lock for ${jobName}:`, err.message);
    }
  }

  /**
   * Sweeps and processes pending notification retries.
   */
  static async runNotificationRetries(): Promise<{ retriedCount: number; failedPermanentlyCount: number }> {
    return await NotificationService.processRetries();
  }

  /**
   * Sweeps and purges operational files & old notification logs past retention limits.
   */
  static async runDataRetentionSweep(): Promise<{ purgedPhotosCount: number; purgedNotificationsCount: number }> {
    const sweepRes = await PrivacyService.runDataRetentionSweep();
    return {
      purgedPhotosCount: sweepRes.purgedPhotosCount,
      purgedNotificationsCount: sweepRes.purgedNotificationsCount
    };
  }

  /**
   * Verifies the cryptographic SHA-256 chain integrity of the immutable audit log.
   */
  static async runAuditIntegritySweep(): Promise<{ valid: boolean; totalChecked: number; message: string }> {
    return await AuditService.verifyChainIntegrity();
  }

  /**
   * Evaluates SLA deadlines for all active in-flight customer orders.
   */
  static async runSlaEvaluationSweep(): Promise<{ totalEvaluated: number; atRiskCount: number; breachedCount: number }> {
    const db = await getDb();
    const activeOrders = await db.collection('orders')
      .find({ status: { $nin: ['delivered', 'completed', 'cancelled'] } })
      .toArray();

    let atRisk = 0;
    let breached = 0;
    for (const order of activeOrders) {
      const orderId = order.id || order.publicId || String(order._id);
      if (order.pickupDate || order.bookedAt) {
        try {
          const evalRes = await SlaService.checkAndEscalateSla(orderId);
          if (evalRes?.status === 'AT_RISK') atRisk++;
          if (evalRes?.status === 'BREACHED') breached++;
        } catch {}
      }
    }
    return { totalEvaluated: activeOrders.length, atRiskCount: atRisk, breachedCount: breached };
  }

  /**
   * Sweeps vehicle fleet documents for approaching or past MOT/Insurance expiry.
   */
  static async runVehicleExpirySweep(): Promise<{ scanned: number; warnings: number; expired: number }> {
    return await VehicleService.runDocumentExpirySweep();
  }

  /**
   * Sweeps plant consumables inventory for items that have breached minimum stock thresholds.
   */
  static async runInventoryLowStockSweep(): Promise<{ totalChecked: number; lowStockCount: number }> {
    return await InventoryService.runLowStockSweep();
  }

  /**
   * Executes all scheduled background maintenance jobs with distributed locking,
   * audit recording, granular error boundaries, and execution telemetry.
   *
   * @param options.force      - Bypass lock acquisition (testing or emergency administrative run)
   * @param options.lockTtlSec - Lock lease duration in seconds (default: 300)
   * @param options.instanceId - Identifier for the executing worker or request
   */
  static async runAllMaintenanceJobs(options: {
    force?: boolean;
    lockTtlSec?: number;
    instanceId?: string;
  } = {}): Promise<JobExecutionResult> {
    const instanceId = options.instanceId || this.defaultInstanceId;
    const lockTtlSec = options.lockTtlSec || 300;
    const lockKey = 'all_maintenance_jobs';

    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();
    const jobId = `job_${getSecureRandomString(10)}`;

    // 1. Atomic Distributed Lock Acquisition
    if (!options.force) {
      const acquired = await this.acquireLock(lockKey, lockTtlSec, instanceId);
      if (!acquired) {
        return {
          jobId,
          jobName: lockKey,
          status: 'SKIPPED_LOCKED',
          startedAt,
          completedAt: startedAt,
          durationMs: 0,
          instanceId,
          errors: ['Job is currently running on another instance or active lock has not expired.']
        };
      }
    }

    const errors: string[] = [];
    const results: NonNullable<JobExecutionResult['results']> = {};

    try {
      // 2. Notification Retries
      try {
        results.notifications = await this.runNotificationRetries();
      } catch (err: any) {
        const msg = `Notification retries sweep error: ${err.message}`;
        console.error(`[BackgroundJob] ${msg}`);
        errors.push(msg);
      }

      // 3. GDPR Data Retention Sweep
      try {
        results.retentionSweep = await this.runDataRetentionSweep();
      } catch (err: any) {
        const msg = `Retention sweep error: ${err.message}`;
        console.error(`[BackgroundJob] ${msg}`);
        errors.push(msg);
      }

      // 4. Audit Chain Cryptographic Integrity
      try {
        results.auditIntegrity = await this.runAuditIntegritySweep();
      } catch (err: any) {
        const msg = `Audit integrity sweep error: ${err.message}`;
        console.error(`[BackgroundJob] ${msg}`);
        errors.push(msg);
      }

      // 5. SLA Deadline Monitoring Sweep
      try {
        results.slaCheck = await this.runSlaEvaluationSweep();
      } catch (err: any) {
        const msg = `SLA evaluation sweep error: ${err.message}`;
        console.error(`[BackgroundJob] ${msg}`);
        errors.push(msg);
      }

      // 6. Vehicle Fleet Document Expiry Sweep
      try {
        results.vehicleSweep = await this.runVehicleExpirySweep();
      } catch (err: any) {
        const msg = `Vehicle sweep error: ${err.message}`;
        console.error(`[BackgroundJob] ${msg}`);
        errors.push(msg);
      }

      // 7. Consumables Inventory Low-Stock Sweep
      try {
        results.inventorySweep = await this.runInventoryLowStockSweep();
      } catch (err: any) {
        const msg = `Inventory sweep error: ${err.message}`;
        console.error(`[BackgroundJob] ${msg}`);
        errors.push(msg);
      }
    } finally {
      // 8. Always release distributed lock
      if (!options.force) {
        await this.releaseLock(lockKey, instanceId);
      }
    }

    const endTime = Date.now();
    const completedAt = new Date(endTime).toISOString();
    const durationMs = endTime - startTime;

    const status: JobExecutionResult['status'] =
      errors.length === 0 ? 'COMPLETED' : (Object.keys(results).length > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');

    const executionRecord: JobExecutionResult = {
      jobId,
      jobName: lockKey,
      status,
      startedAt,
      completedAt,
      durationMs,
      instanceId,
      results,
      errors
    };

    // 9. Persist execution record in background_jobs
    try {
      const db = await getDb();
      await db.collection('background_jobs').insertOne({
        ...executionRecord,
        createdAt: completedAt
      });
    } catch (logErr: any) {
      console.error('[BackgroundJob] Failed to persist execution log:', logErr.message);
    }

    return executionRecord;
  }
}
