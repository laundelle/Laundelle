import { getDb } from '@/lib/mongodb';
import {
  RegisteredDevice,
  OfflineOperation,
  OfflineSyncRequest,
  OfflineSyncResponse,
  OfflinePinVoucher
} from '@laundelle/types';
import { AlertService } from './AlertService';
import { AuditService } from './AuditService';
import { DriverService } from './DriverService';
import { buildEntityLookupQuery } from '@laundelle/ids';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api';
import crypto from 'crypto';

/**
 * Secret key for offline PIN vouchers.
 * Fails securely in production if not explicitly configured.
 */
function getVoucherSecret(): string {
  const secret = process.env.OFFLINE_VOUCHER_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: OFFLINE_VOUCHER_SECRET environment variable is not set. Offline sync cannot operate securely.');
    }
    return 'dev_offline_voucher_secret_do_not_use_in_prod';
  }
  return secret;
}

export interface AuthenticatedSyncActor {
  userId: string;
  publicId?: string;
  role: string;
  plantId?: string;
}

export class OfflineSyncService {
  /**
   * Registers or refreshes a client device for offline synchronization.
   * Bound to the server-verified authenticated identity.
   */
  static async registerDevice(
    params: {
      deviceId: string;
      userId: string;
      userRole: string;
      appVersion: string;
      platform?: 'ANDROID' | 'IOS' | 'WEB_PWA';
      fcmToken?: string;
    },
    authenticatedActor?: AuthenticatedSyncActor
  ): Promise<RegisteredDevice> {
    const db = await getDb();
    const now = new Date().toISOString();

    const effectiveUserId = authenticatedActor
      ? (authenticatedActor.publicId || authenticatedActor.userId)
      : params.userId;
    const effectiveRole = authenticatedActor ? authenticatedActor.role : params.userRole;

    const device: RegisteredDevice = {
      deviceId: params.deviceId,
      userId: effectiveUserId,
      userRole: effectiveRole,
      appVersion: params.appVersion,
      platform: params.platform || 'WEB_PWA',
      lastSyncAt: now,
      status: 'ACTIVE',
      fcmToken: params.fcmToken
    };

    await db.collection('registered_devices').updateOne(
      { deviceId: params.deviceId },
      { $set: device },
      { upsert: true }
    );

    return device;
  }

  /**
   * Generates a tamper-proof cryptographic offline PIN voucher for safe mobile storage.
   * Authorizes the actor, verifies authoritative order PIN from database (rejecting arbitrary caller-supplied PINs),
   * and cryptographically binds order, operation, device, actor, and expiry.
   */
  static async generateOfflinePinVoucher(params: {
    orderId: string;
    deviceId: string;
    actorId: string;
    actorRole?: string;
    operation?: 'pickup' | 'delivery';
    plainPin?: string;
    validityHours?: number;
  }): Promise<OfflinePinVoucher> {
    const db = await getDb();
    const order = await db.collection('orders').findOne(buildEntityLookupQuery(params.orderId, 'order'));
    if (!order) {
      throw new NotFoundError(`Order ${params.orderId} not found.`);
    }

    const operation = params.operation || 'delivery';
    const actorRole = params.actorRole || 'driver';

    // Verify actor is assigned driver or administrator
    if (!['admin', 'super_admin'].includes(actorRole)) {
      const { driverIds } = await DriverService.getDriverIdentifiers(params.actorId);
      const isAssigned = driverIds.includes(String(order.assigned_driver_id)) ||
        (order.driver?.id && driverIds.includes(String(order.driver.id)));
      if (!isAssigned) {
        throw new ForbiddenError('Access denied: You are not assigned to generate offline vouchers for this order.');
      }
    }

    // Authoritative PIN derivation: NEVER trust caller-supplied PIN as authoritative
    let authoritativePin = '';
    const customerIdentifier = String(order.customerId || order.customer_id || order.userId || order.user_id || '');
    const canonicalOrderId = String(order.publicId || order.id || params.orderId);

    if (operation === 'pickup') {
      authoritativePin = order.pickup_pin || order.pickup_otp || '';
    } else {
      authoritativePin = order.delivery_pin || order.delivery_otp || '';
    }

    if (params.plainPin) {
      // If caller provided a PIN, verify it matches the encrypted/hashed order PIN
      const testResult = DriverService.verifyOrderVerificationPin(params.plainPin, order, operation);
      if (!testResult.valid) {
        throw new BadRequestError(`Provided PIN does not match order ${operation} verification PIN.`);
      }
      authoritativePin = params.plainPin.trim();
    } else if (!authoritativePin) {
      throw new BadRequestError(`No active authoritative ${operation} PIN found for order ${params.orderId}.`);
    }

    const hours = params.validityHours || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const salt = crypto.randomBytes(16).toString('hex');
    const voucherId = `VCH-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const version = 1;

    // Cryptographic MAC covers all security-relevant fields: version, voucherId, orderId, operation, deviceId, actorId, expiresAt, salt, pin
    const macPayload = `${version}:${voucherId}:${canonicalOrderId}:${operation}:${params.deviceId}:${params.actorId}:${expiresAt}:${salt}:${authoritativePin.trim()}`;
    const pinHash = crypto
      .createHmac('sha256', getVoucherSecret())
      .update(macPayload)
      .digest('hex');

    return {
      orderId: canonicalOrderId,
      deviceId: params.deviceId,
      pinHash,
      expiresAt,
      salt,
      version,
      operation,
      actorId: params.actorId,
      voucherId
    } as any;
  }

  /**
   * Verifies an offline voucher, checking expiration, device binding, cryptographic signature,
   * and optional atomic single-use replay protection.
   */
  static async verifyOfflinePinVoucher(
    voucher: OfflinePinVoucher,
    enteredPin: string,
    expectedOperation?: 'pickup' | 'delivery',
    expectedDeviceId?: string,
    options: { autoConsume?: boolean } = { autoConsume: true }
  ): Promise<{ valid: boolean; error?: string }> {
    if (!voucher || !voucher.pinHash || !voucher.salt) {
      return { valid: false, error: 'Malformed offline voucher payload.' };
    }

    // 1. Expiration Check
    if (new Date(voucher.expiresAt).getTime() < Date.now()) {
      return { valid: false, error: 'Offline voucher has expired.' };
    }

    // 2. Device binding check
    if (expectedDeviceId && voucher.deviceId && voucher.deviceId !== expectedDeviceId) {
      return { valid: false, error: 'Offline voucher is bound to a different device.' };
    }

    // 3. Operation binding check
    const voucherOp = (voucher as any).operation || expectedOperation;
    if (expectedOperation && voucherOp && voucherOp !== expectedOperation) {
      return { valid: false, error: `Offline voucher is for ${voucherOp}, not ${expectedOperation}.` };
    }

    const db = await getDb();

    // 4. Replay Check: Ensure voucher was not previously consumed
    const existingConsumption = await db.collection('consumed_vouchers').findOne({
      $or: [
        { voucherHash: voucher.pinHash },
        { voucherId: (voucher as any).voucherId || voucher.pinHash }
      ]
    });
    if (existingConsumption) {
      return { valid: false, error: 'Offline voucher has already been consumed and cannot be replayed.' };
    }

    // 5. Signature verification
    let matches = false;
    const version = (voucher as any).version;

    if (version === 1 && (voucher as any).voucherId) {
      const macPayload = `${version}:${(voucher as any).voucherId}:${voucher.orderId}:${voucherOp}:${voucher.deviceId}:${(voucher as any).actorId}:${voucher.expiresAt}:${voucher.salt}:${enteredPin.trim()}`;
      const expectedHash = crypto.createHmac('sha256', getVoucherSecret()).update(macPayload).digest('hex');
      try {
        matches = crypto.timingSafeEqual(Buffer.from(voucher.pinHash, 'hex'), Buffer.from(expectedHash, 'hex'));
      } catch {
        matches = false;
      }
    } else {
      // Legacy voucher format fallback
      const legacyPayload = `${voucher.orderId}:${voucher.deviceId}:${enteredPin.trim()}:${voucher.salt}`;
      const legacyHash = crypto.createHmac('sha256', getVoucherSecret()).update(legacyPayload).digest('hex');
      try {
        matches = crypto.timingSafeEqual(Buffer.from(voucher.pinHash, 'hex'), Buffer.from(legacyHash, 'hex'));
      } catch {
        matches = false;
      }
    }

    if (!matches) {
      return { valid: false, error: 'Incorrect PIN for offline voucher.' };
    }

    // 6. Atomically record consumed voucher to prevent replay attacks (if autoConsume enabled)
    if (options.autoConsume !== false) {
      try {
        await db.collection('consumed_vouchers').insertOne({
          voucherHash: voucher.pinHash,
          voucherId: (voucher as any).voucherId || voucher.pinHash,
          orderId: voucher.orderId,
          deviceId: voucher.deviceId,
          consumedAt: new Date().toISOString()
        });
      } catch {
        return { valid: false, error: 'Offline voucher replay collision.' };
      }
    }

    return { valid: true };
  }

  /**
   * Records a voucher as consumed in consumed_vouchers after successful mutation.
   */
  static async recordVoucherConsumed(voucher: OfflinePinVoucher, deviceId?: string): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.collection('consumed_vouchers').updateOne(
      {
        $or: [
          { voucherHash: voucher.pinHash },
          { voucherId: (voucher as any).voucherId || voucher.pinHash }
        ]
      },
      {
        $setOnInsert: {
          voucherHash: voucher.pinHash,
          voucherId: (voucher as any).voucherId || voucher.pinHash,
          orderId: voucher.orderId,
          deviceId: deviceId || voucher.deviceId,
          consumedAt: now
        }
      },
      { upsert: true }
    ).catch(() => {});
  }

  /**
   * Processes a batch of offline actions idempotently with strict server-side authorization,
   * device binding, terminal state protections, driver ownership, and race-safe state transitions.
   */
  static async processSyncBatch(
    request: OfflineSyncRequest,
    authenticatedUser: AuthenticatedSyncActor
  ): Promise<OfflineSyncResponse> {
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw new ForbiddenError('Authentication required for offline synchronization.');
    }

    const db = await getDb();
    const now = new Date().toISOString();

    const appliedOperations: string[] = [];
    const conflicts: OfflineSyncResponse['conflicts'] = [];
    const rejectedOperations: OfflineSyncResponse['rejectedOperations'] = [];

    // Verify registered device belongs to authenticated actor
    const registeredDevice = await db.collection('registered_devices').findOne({
      deviceId: request.deviceId,
      status: 'ACTIVE'
    });

    if (!registeredDevice) {
      throw new ForbiddenError('Device is not registered or active for offline synchronization.');
    }

    const actorIdentifiers = new Set<string>([
      authenticatedUser.userId,
      authenticatedUser.publicId || '',
    ].filter(Boolean));

    const { driverIds } = await DriverService.getDriverIdentifiers(authenticatedUser.userId);
    driverIds.forEach(id => actorIdentifiers.add(id));

    if (!actorIdentifiers.has(registeredDevice.userId)) {
      throw new ForbiddenError('Device ownership mismatch: Registered device belongs to another account.');
    }

    // Refresh device lastSyncAt
    await db.collection('registered_devices').updateOne(
      { deviceId: request.deviceId },
      { $set: { lastSyncAt: now } }
    );

    for (const op of request.operations) {
      try {
        // Bind server-derived identity. Never trust request body fields
        const actorId = authenticatedUser.publicId || authenticatedUser.userId;
        const actorRole = authenticatedUser.role;

        // 1. Atomic Idempotency Claim: Ensure duplicate operations never execute business logic twice
        const claimResult = await db.collection('offline_sync_queue').findOneAndUpdate(
          { operationId: op.operationId },
          {
            $setOnInsert: {
              operationId: op.operationId,
              clientTimestamp: op.clientTimestamp,
              deviceId: request.deviceId,
              userId: actorId,
              role: actorRole,
              action: op.action,
              entityId: op.entityId,
              payload: op.payload,
              syncStatus: 'PROCESSING',
              receivedAt: now
            }
          },
          { upsert: true, returnDocument: 'before' }
        );

        if (claimResult) {
          if (claimResult.syncStatus === 'APPLIED') {
            appliedOperations.push(op.operationId);
            continue;
          }
          if (claimResult.syncStatus === 'CONFLICT') {
            conflicts.push(claimResult.conflictDetails);
            continue;
          }
          if (claimResult.syncStatus === 'REJECTED') {
            rejectedOperations.push({ operationId: op.operationId, reason: claimResult.failureReason || 'Operation previously rejected' });
            continue;
          }
          if (claimResult.syncStatus === 'PROCESSING') {
            const ABANDONED_OPERATION_TIMEOUT_MS = 60 * 1000;
            const opAge = Date.now() - new Date(claimResult.receivedAt || claimResult.updatedAt || 0).getTime();
            if (opAge > ABANDONED_OPERATION_TIMEOUT_MS) {
              const reclaimed = await db.collection('offline_sync_queue').findOneAndUpdate(
                {
                  operationId: op.operationId,
                  syncStatus: 'PROCESSING',
                  receivedAt: claimResult.receivedAt
                },
                {
                  $set: {
                    receivedAt: now,
                    updatedAt: now,
                    recoveredAt: now,
                    recoveryCount: ((claimResult as any).recoveryCount || 0) + 1
                  }
                },
                { returnDocument: 'after' }
              );
              if (!reclaimed) {
                continue;
              }
              // Successfully reclaimed abandoned operation, continue processing
            } else {
              rejectedOperations.push({ operationId: op.operationId, reason: 'Operation is currently being processed concurrently.' });
              continue;
            }
          }
        }

        // 2. Role-Based Permissions Enforcement per action
        const actionRoleMap: Record<string, string[]> = {
          COLLECT_ORDER: ['driver', 'admin', 'super_admin'],
          DELIVER_ORDER: ['driver', 'admin', 'super_admin'],
          PROCESS_STAGE: ['processor', 'plant_manager', 'admin', 'super_admin'],
          QC_INSPECT: ['processor', 'plant_manager', 'admin', 'super_admin']
        };

        const allowedRoles = actionRoleMap[op.action];
        if (allowedRoles && !allowedRoles.includes(actorRole)) {
          const reason = `Role "${actorRole}" is not authorized to execute action "${op.action}".`;
          await db.collection('offline_sync_queue').updateOne(
            { operationId: op.operationId },
            { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
          );
          rejectedOperations.push({ operationId: op.operationId, reason });
          continue;
        }

        // 3. Action Execution with business integrity
        if (op.action === 'COLLECT_ORDER') {
          const order = await db.collection('orders').findOne(buildEntityLookupQuery(op.entityId, 'order'));
          if (!order) {
            const reason = `Order ${op.entityId} not found.`;
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
            );
            rejectedOperations.push({ operationId: op.operationId, reason });
            continue;
          }

          // Check Driver Assignment
          if (actorRole === 'driver') {
            const isAssigned = actorIdentifiers.has(String(order.assigned_driver_id)) ||
              (order.driver?.id && actorIdentifiers.has(String(order.driver.id)));
            if (!isAssigned) {
              const reason = `Access denied: Driver ${actorId} is not assigned to collect order ${op.entityId}.`;
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
          }

          // Check Plant Scope
          if (authenticatedUser.plantId && order.plant_id && actorRole !== 'super_admin') {
            if (String(authenticatedUser.plantId) !== String(order.plant_id)) {
              const reason = `Plant boundary violation: Order ${op.entityId} belongs to a different facility.`;
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
          }

          // Terminal State & Stale State Protections
          const terminalOrAdvancedStatuses = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'LAUNDRY_COLLECTED', 'RECEIVED_AT_PLANT', 'WASHING'];
          const currentStatusUpper = (order.status || '').toUpperCase();
          if (terminalOrAdvancedStatuses.includes(currentStatusUpper)) {
            if (currentStatusUpper === 'LAUNDRY_COLLECTED') {
              // Recover cleanly if prior attempt mutated order before marking queue APPLIED
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'APPLIED', appliedAt: now, updatedAt: now } }
              );
              appliedOperations.push(op.operationId);
              continue;
            }
            const conflict = {
              operationId: op.operationId,
              reason: `Order ${op.entityId} has advanced to status ${order.status} on server.`,
              entityId: op.entityId,
              serverState: { status: order.status, updatedAt: order.updated_at || order.updatedAt }
            };
            conflicts.push(conflict);
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'CONFLICT', failureReason: conflict.reason, conflictDetails: conflict, updatedAt: now } }
            );
            await AlertService.createAlert({
              plantId: order.plant_id,
              type: 'OFFLINE_CONFLICT',
              severity: 'WARNING',
              title: `Offline Sync Conflict: Order ${order.id || order.publicId}`,
              message: `Driver attempted offline collection for order ${order.id || order.publicId}, but server status is ${order.status}.`,
              entityId: order.publicId || order.id,
              entityType: 'ORDER'
            });
            continue;
          }

          // Verify Verification Evidence (PIN or Offline Voucher)
          let verificationPassed = false;
          if (op.payload.voucher) {
            const voucherRes = await this.verifyOfflinePinVoucher(op.payload.voucher, op.payload.pin || '', 'pickup', request.deviceId, { autoConsume: false });
            if (!voucherRes.valid) {
              const reason = `Pickup verification voucher invalid: ${voucherRes.error}`;
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
            verificationPassed = true;
          } else if (op.payload.pin) {
            const pinRes = DriverService.verifyOrderVerificationPin(op.payload.pin, order, 'pickup');
            if (!pinRes.valid) {
              const reason = `Pickup PIN verification failed: ${pinRes.error}`;
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
            verificationPassed = true;
          } else {
            const reason = 'Pickup verification evidence (valid PIN or authorized offline voucher) is required.';
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
            );
            rejectedOperations.push({ operationId: op.operationId, reason });
            continue;
          }

          // State transition condition: Update order only if still in pickup-eligible status
          const allowedPickupStatuses = ['booking_confirmed', 'collection_scheduled', 'waiting_for_driver', 'driver_assigned', 'pickup_in_progress', 'pickup_failed'];
          const updateRes = await db.collection('orders').updateOne(
            { _id: order._id, status: { $in: allowedPickupStatuses } },
            {
              $set: {
                status: 'laundry_collected',
                statusLabel: 'Order Pickup Completed',
                pickupDate: op.payload.collectedAt || now,
                pickup_pin_verified_at: now,
                pickup_pin_hash: null,
                pickup_pin_salt: null,
                pickup_pin_enc: null,
                actual_weight_kg: op.payload.weightKg || order.actual_weight_kg,
                bag_count: op.payload.bagCount || order.bag_count,
                updated_at: now
              },
              $push: {
                timeline_events: {
                  status: 'laundry_collected',
                  timestamp: op.payload.collectedAt || op.clientTimestamp || now,
                  note: 'Collected via verified offline mobile sync',
                  performedBy: actorId
                }
              } as any
            }
          );

          if (updateRes.matchedCount === 0) {
            const conflict = {
              operationId: op.operationId,
              reason: `Order ${op.entityId} state transitioned concurrently.`,
              entityId: op.entityId,
              serverState: { status: order.status }
            };
            conflicts.push(conflict);
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'CONFLICT', failureReason: conflict.reason, conflictDetails: conflict, updatedAt: now } }
            );
            continue;
          }

          // Order mutation completed: Now safely consume voucher to prevent voucher burnout on mutation failures
          if (op.payload.voucher) {
            await this.recordVoucherConsumed(op.payload.voucher, request.deviceId);
          }

          await AuditService.recordOrderEvent({
            orderId: order.publicId || order.id || op.entityId,
            action: 'offline_pickup_synced',
            actorId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'laundry_collected' },
            reason: 'Collected via offline mobile app sync',
            metadata: { weightKg: op.payload.weightKg, bagCount: op.payload.bagCount, clientTimestamp: op.clientTimestamp }
          });
        } else if (op.action === 'DELIVER_ORDER') {
          const order = await db.collection('orders').findOne(buildEntityLookupQuery(op.entityId, 'order'));
          if (!order) {
            const reason = `Order ${op.entityId} not found.`;
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
            );
            rejectedOperations.push({ operationId: op.operationId, reason });
            continue;
          }

          if ((order.status || '').toLowerCase() === 'delivered' || (order.status || '').toLowerCase() === 'completed') {
            // Already delivered idempotently
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'APPLIED', appliedAt: now, updatedAt: now } }
            );
            appliedOperations.push(op.operationId);
            continue;
          }

          // Check Driver Assignment
          if (actorRole === 'driver') {
            const isAssigned = actorIdentifiers.has(String(order.assigned_driver_id)) ||
              (order.driver?.id && actorIdentifiers.has(String(order.driver.id)));
            if (!isAssigned) {
              const reason = `Access denied: Driver ${actorId} is not assigned to deliver order ${op.entityId}.`;
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
          }

          // Terminal Status & Cancellation Check
          if ((order.status || '').toLowerCase() === 'cancelled') {
            const reason = `Cannot complete delivery for cancelled order ${op.entityId}.`;
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
            );
            rejectedOperations.push({ operationId: op.operationId, reason });
            continue;
          }

          // Authoritative Payment Rule: Delivery completion requires payment unless COD
          const isPaid = order.isPaid === true || (order.paymentStatus || '').toLowerCase() === 'paid';
          const isCod = (order.payment_method || order.paymentMethod || '').toLowerCase().includes('cash') ||
            (order.payment_method || order.paymentMethod || '').toLowerCase().includes('cod');

          if (!isPaid && !isCod) {
            const reason = `Payment requirement violation: Order ${op.entityId} is unpaid. Delivery requires payment settlement.`;
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
            );
            rejectedOperations.push({ operationId: op.operationId, reason });
            continue;
          }

          // Delivery Verification Evidence
          const instruction = (order.deliveryInstructionType || order.deliveryInstruction || 'IN_PERSON').toUpperCase();
          if (instruction === 'LEAVE_AT_DOOR') {
            if (!op.payload.photoUrls && !op.payload.photoUrl) {
              const reason = 'Leave at door delivery requires photo confirmation evidence.';
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
          } else {
            // Require PIN or Offline Voucher
            let deliveryVerified = false;
            if (op.payload.voucher) {
              const vRes = await this.verifyOfflinePinVoucher(op.payload.voucher, op.payload.pin || '', 'delivery', request.deviceId, { autoConsume: false });
              if (!vRes.valid) {
                const reason = `Delivery voucher verification failed: ${vRes.error}`;
                await db.collection('offline_sync_queue').updateOne(
                  { operationId: op.operationId },
                  { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
                );
                rejectedOperations.push({ operationId: op.operationId, reason });
                continue;
              }
              deliveryVerified = true;
            } else if (op.payload.pin) {
              const pRes = DriverService.verifyOrderVerificationPin(op.payload.pin, order, 'delivery');
              if (!pRes.valid) {
                const reason = `Delivery PIN verification failed: ${pRes.error}`;
                await db.collection('offline_sync_queue').updateOne(
                  { operationId: op.operationId },
                  { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
                );
                rejectedOperations.push({ operationId: op.operationId, reason });
                continue;
              }
              deliveryVerified = true;
            } else {
              const reason = 'Delivery verification evidence (valid PIN or authorized offline voucher) is required.';
              await db.collection('offline_sync_queue').updateOne(
                { operationId: op.operationId },
                { $set: { syncStatus: 'REJECTED', failureReason: reason, updatedAt: now } }
              );
              rejectedOperations.push({ operationId: op.operationId, reason });
              continue;
            }
          }

          const allowedDeliveryStatuses = ['ready_for_delivery', 'qc_passed', 'out_for_delivery', 'package_collected_for_delivery', 'delivery_driver_assigned', 'delivery_attempted', 'delivery_failed'];
          const updateRes = await db.collection('orders').updateOne(
            { _id: order._id, status: { $in: allowedDeliveryStatuses } },
            {
              $set: {
                status: 'delivered',
                statusLabel: 'Completed',
                completedAt: op.payload.deliveredAt || now,
                delivered_at: op.payload.deliveredAt || now,
                delivery_pin_verified_at: now,
                delivery_pin_hash: null,
                delivery_pin_salt: null,
                delivery_pin_enc: null,
                podNotes: op.payload.notes,
                updated_at: now
              },
              $push: {
                timeline_events: {
                  status: 'delivered',
                  timestamp: op.payload.deliveredAt || op.clientTimestamp || now,
                  note: 'Delivered via verified offline mobile sync',
                  performedBy: actorId
                }
              } as any
            }
          );

          if (updateRes.matchedCount === 0) {
            const conflict = {
              operationId: op.operationId,
              reason: `Order ${op.entityId} state transitioned concurrently.`,
              entityId: op.entityId,
              serverState: { status: order.status }
            };
            conflicts.push(conflict);
            await db.collection('offline_sync_queue').updateOne(
              { operationId: op.operationId },
              { $set: { syncStatus: 'CONFLICT', failureReason: conflict.reason, conflictDetails: conflict, updatedAt: now } }
            );
            continue;
          }

          // Order mutation completed: Now safely consume voucher to prevent voucher burnout on mutation failures
          if (op.payload.voucher) {
            await this.recordVoucherConsumed(op.payload.voucher, request.deviceId);
          }

          await AuditService.recordOrderEvent({
            orderId: order.publicId || order.id || op.entityId,
            action: 'offline_delivery_synced',
            actorId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'delivered' },
            reason: 'Delivered via offline mobile app sync',
            metadata: { podNotes: op.payload.notes, clientTimestamp: op.clientTimestamp }
          });
        } else if (op.action === 'PROCESS_STAGE') {
          const order = await db.collection('orders').findOne(buildEntityLookupQuery(op.entityId, 'order'));
          if (order) {
            await db.collection('orders').updateOne(
              { _id: order._id },
              {
                $set: {
                  processingStage: op.payload.stage,
                  updated_at: now
                },
                $push: {
                  timeline_events: {
                    status: `STAGE_${(op.payload.stage || '').toUpperCase()}`,
                    timestamp: op.clientTimestamp || now,
                    performedBy: actorId
                  }
                } as any
              }
            );

            await AuditService.recordOrderEvent({
              orderId: order.publicId || order.id || op.entityId,
              action: 'offline_processing_stage_synced',
              actorId,
              actorRole: actorRole as any,
              before: { processingStage: order.processingStage },
              after: { processingStage: op.payload.stage },
              reason: 'Processing stage updated via offline mobile app sync',
              metadata: { stage: op.payload.stage, clientTimestamp: op.clientTimestamp }
            });
          }
        } else if (op.action === 'QC_INSPECT') {
          await db.collection('order_items').updateOne(
            { id: op.entityId },
            {
              $set: {
                qcStatus: op.payload.qcStatus,
                qcNotes: op.payload.qcNotes,
                qcDefectReason: op.payload.defectReason,
                qcInspectedAt: now,
                qcInspectorId: actorId
              }
            }
          );
        }

        // Operation applied cleanly
        await db.collection('offline_sync_queue').updateOne(
          { operationId: op.operationId },
          {
            $set: {
              syncStatus: 'APPLIED',
              appliedAt: now,
              updatedAt: now
            }
          }
        );

        appliedOperations.push(op.operationId);

        await AuditService.recordEvent({
          actorId,
          actorRole,
          action: `OFFLINE_SYNC_${op.action}`,
          entityType: 'OFFLINE_OPERATION',
          entityId: op.operationId,
          metadata: { deviceId: request.deviceId, entityId: op.entityId }
        });
      } catch (err: any) {
        // Return safe, non-sensitive error message
        const safeReason = err instanceof BadRequestError || err instanceof ForbiddenError || err instanceof NotFoundError
          ? err.message
          : 'Operation could not be processed due to a validation error.';
        await db.collection('offline_sync_queue').updateOne(
          { operationId: op.operationId },
          { $set: { syncStatus: 'REJECTED', failureReason: safeReason, updatedAt: now } }
        ).catch(() => { });
        rejectedOperations.push({ operationId: op.operationId, reason: safeReason });
      }
    }

    return {
      success: true,
      appliedOperations,
      conflicts,
      rejectedOperations,
      serverTimestamp: now
    };
  }

  /**
   * Retrieves count of pending or conflicted sync operations.
   */
  static async getBacklogCount(): Promise<number> {
    const db = await getDb();
    return await db.collection('offline_sync_queue').countDocuments({
      syncStatus: { $in: ['PENDING', 'CONFLICT'] }
    });
  }
}
