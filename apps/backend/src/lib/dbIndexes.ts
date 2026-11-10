import { getDb } from './mongodb';

let indexesEnsured = false;

/**
 * Safely creates or upgrades a unique index on a string field using partialFilterExpression.
 * Unlike standard sparse indexes which fail if multiple documents possess an explicit null value ({ field: null }),
 * partialFilterExpression strictly indexes only non-null string values, fully immunizing against
 * duplicate null collisions on legacy or unpopulated records.
 */
async function ensureSafeUniqueStringIndex(collection: any, field: string, indexName?: string) {
  const name = indexName || `${field}_1`;

  // Pre-flight normalization: unset empty strings so they never collide on unique index
  try {
    await collection.updateMany(
      { [field]: "" },
      { $unset: { [field]: "" } }
    );
  } catch {}

  const existingIndexes = await collection.indexes().catch(() => []);
  const existing = existingIndexes.find((idx: any) => idx.name === name);

  // Exclude empty strings and nulls: only non-empty strings are indexed
  const expectedFilter = { [field]: { $type: 'string', $gt: '' } };

  if (existing) {
    const hasCorrectFilter = existing.unique &&
      existing.partialFilterExpression &&
      JSON.stringify(existing.partialFilterExpression) === JSON.stringify(expectedFilter);

    if (hasCorrectFilter) {
      return;
    }

    // Drop outdated sparse, non-partial, or $type:'string'-only index so it upgrades safely
    await collection.dropIndex(name).catch(() => {});
  }

  await collection.createIndex(
    { [field]: 1 },
    {
      unique: true,
      partialFilterExpression: expectedFilter,
      background: true,
      name
    }
  );
}

/**
 * Safely creates an index only if an index with identical key specification does not already exist.
 * Preserves existing production indexes, avoids index drops, and prevents IndexOptionsConflict / code 85.
 */
async function ensureSafeIndex(collection: any, keys: Record<string, any>, options: any = {}) {
  try {
    const existingIndexes = await collection.indexes().catch(() => []);
    const keyEntries = Object.entries(keys);

    const matchingIndex = existingIndexes.find((idx: any) => {
      if (!idx.key) return false;
      const idxEntries = Object.entries(idx.key);
      if (idxEntries.length !== keyEntries.length) return false;
      return keyEntries.every(([k, v]) => idx.key[k] === v);
    });

    if (matchingIndex) {
      // Existing index satisfies key specification; preserve it
      return matchingIndex.name;
    }

    return await collection.createIndex(keys, options);
  } catch (err: any) {
    if (err.code === 85 || err.message?.includes('Index already exists')) {
      return;
    }
    throw err;
  }
}

/**
 * Ensures optimal MongoDB database indexes for production performance,
 * concurrency safety, and fast query execution across all collections.
 */
export async function ensureDatabaseIndexes() {
  if (indexesEnsured) return;
  try {
    const db = await getDb();

    // 1. Orders collection
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('orders'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('orders'), 'id'),
      ensureSafeUniqueStringIndex(db.collection('orders'), 'stripe_session_id'),
      db.collection('orders').createIndex({ customer_id: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ customerId: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ plant_id: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ plantId: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ assigned_driver_id: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ assigned_processor_id: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ status: 1, createdAt: -1 }, { background: true }),
      db.collection('orders').createIndex({ pickupDate: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ deliveryDate: 1, status: 1 }, { background: true }),
      db.collection('orders').createIndex({ 'sla.deadlineAt': 1 }, { background: true })
    ]);

    // 2. Order Items collection (Garment tracking)
    await Promise.all([
      db.collection('order_items').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('order_items').createIndex({ orderId: 1, qcStatus: 1 }, { background: true }),
      db.collection('order_items').createIndex({ orderId: 1, currentStage: 1 }, { background: true })
    ]);

    // 3. Pickup Attempts
    await Promise.all([
      db.collection('pickup_attempts').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('pickup_attempts').createIndex({ orderId: 1, createdAt: -1 }, { background: true }),
      db.collection('pickup_attempts').createIndex({ driverId: 1, createdAt: -1 }, { background: true })
    ]);

    // 4. Delivery Attempts
    await Promise.all([
      db.collection('delivery_attempts').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('delivery_attempts').createIndex({ orderId: 1, createdAt: -1 }, { background: true }),
      db.collection('delivery_attempts').createIndex({ driverId: 1, createdAt: -1 }, { background: true })
    ]);

    // 5. Operational Exceptions
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('exceptions'), 'publicId'),
      db.collection('exceptions').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('exceptions').createIndex({ plantId: 1, status: 1, priority: 1 }, { background: true }),
      db.collection('exceptions').createIndex({ orderId: 1, status: 1 }, { background: true })
    ]);

    // 6. Machine Runs
    await Promise.all([
      db.collection('machine_runs').createIndex({ runId: 1 }, { unique: true, background: true }),
      db.collection('machine_runs').createIndex({ machineId: 1, status: 1 }, { background: true }),
      db.collection('machine_runs').createIndex({ plantId: 1, status: 1 }, { background: true })
    ]);

    // 7. COD Collections
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('cod_collections'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('cod_collections'), 'idempotencyKey'),
      ensureSafeUniqueStringIndex(db.collection('cod_collections'), 'receiptNumber'),
      ensureSafeUniqueStringIndex(db.collection('cod_collections'), 'referenceNumber'),
      db.collection('cod_collections').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('cod_collections').createIndex({ orderId: 1 }, { background: true }),
      db.collection('cod_collections').createIndex({ reconciliationStatus: 1 }, { background: true }),
      db.collection('cod_collections').createIndex({ driverId: 1, collectedAt: -1 }, { background: true })
    ]);

    // 8. Evidence Metadata
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('evidence'), 'publicId'),
      db.collection('evidence').createIndex({ fileId: 1 }, { unique: true, background: true }),
      db.collection('evidence').createIndex({ orderId: 1, type: 1 }, { background: true })
    ]);

    // 9. Notifications
    await Promise.all([
      db.collection('notifications').createIndex({ id: 1 }, { unique: true, background: true }),
      ensureSafeUniqueStringIndex(db.collection('notifications'), 'idempotencyKey'),
      db.collection('notifications').createIndex({ userId: 1, read: 1, createdAt: -1 }, { background: true }),
      db.collection('notifications').createIndex({ status: 1, scheduledAt: 1 }, { background: true })
    ]);

    // 9b. Offline Sync Queue & Vouchers
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('offline_sync_queue'), 'operationId'),
      ensureSafeUniqueStringIndex(db.collection('offline_sync_queue'), 'clientMutationId'),
      ensureSafeUniqueStringIndex(db.collection('consumed_vouchers'), 'voucherHash'),
      ensureSafeUniqueStringIndex(db.collection('consumed_vouchers'), 'voucherId'),
      ensureSafeUniqueStringIndex(db.collection('registered_devices'), 'deviceId')
    ]);

    // 10. Audit Log (Tamper-evident chain)
    await Promise.all([
      db.collection('audit_log').createIndex({ entityId: 1, timestamp: -1 }, { background: true }),
      db.collection('audit_log').createIndex({ actorId: 1, timestamp: -1 }, { background: true }),
      db.collection('audit_log').createIndex({ action: 1, timestamp: -1 }, { background: true }),
      db.collection('audit_log').createIndex({ currentHash: 1 }, { background: true })
    ]);

    // 11. Files Collection (Metadata & Checksums)
    await Promise.all([
      db.collection('files').createIndex({ fileId: 1 }, { unique: true, background: true }),
      db.collection('files').createIndex({ orderId: 1, fileType: 1 }, { background: true }),
      db.collection('files').createIndex({ checksum: 1 }, { background: true }),
      db.collection('files').createIndex({ retentionUntil: 1 }, { background: true })
    ]);

    // 12. Subscriptions Collection
    await Promise.all([
      db.collection('subscriptions').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('subscriptions').createIndex({ customerId: 1, status: 1 }, { background: true }),
      db.collection('subscriptions').createIndex({ nextBillingAt: 1 }, { background: true })
    ]);

    // 13. Notification Templates
    await Promise.all([
      db.collection('notification_templates').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('notification_templates').createIndex({ eventType: 1, channel: 1 }, { background: true })
    ]);

    // 14. Privacy Requests
    await Promise.all([
      db.collection('privacy_requests').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('privacy_requests').createIndex({ userId: 1, status: 1 }, { background: true })
    ]);

    // 15. Machines Fleet
    await Promise.all([
      db.collection('machines').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('machines').createIndex({ plantId: 1, status: 1 }, { background: true }),
      db.collection('machines').createIndex({ machineCode: 1 }, { background: true })
    ]);

    // 16. Vehicles Fleet (P2)
    await Promise.all([
      db.collection('vehicles').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('vehicles').createIndex({ registrationNumber: 1 }, { unique: true, background: true }),
      db.collection('vehicles').createIndex({ plantId: 1, status: 1 }, { background: true }),
      db.collection('vehicles').createIndex({ currentDriverId: 1 }, { background: true })
    ]);

    // 18. Vehicle Assignments (P2 Lineage)
    await Promise.all([
      db.collection('vehicle_assignments').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('vehicle_assignments').createIndex({ vehicleId: 1, status: 1 }, { background: true }),
      db.collection('vehicle_assignments').createIndex({ driverId: 1, status: 1 }, { background: true }),
      db.collection('vehicle_assignments').createIndex({ assignedAt: -1 }, { background: true })
    ]);

    // 19. Vehicle Maintenance (P2)
    await Promise.all([
      db.collection('vehicle_maintenance').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('vehicle_maintenance').createIndex({ vehicleId: 1, performedDate: -1 }, { background: true }),
      db.collection('vehicle_maintenance').createIndex({ plantId: 1 }, { background: true })
    ]);

    // 20. Inventory Items (P2)
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('inventory_items'), 'publicId'),
      db.collection('inventory_items').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('inventory_items').createIndex({ plantId: 1, sku: 1 }, { unique: true, background: true }),
      db.collection('inventory_items').createIndex({ plantId: 1, category: 1 }, { background: true }),
      db.collection('inventory_items').createIndex({ plantId: 1, isLowStock: 1 }, { background: true })
    ]);

    // 21. Inventory Transactions (P2 Ledger)
    await Promise.all([
      db.collection('inventory_transactions').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('inventory_transactions').createIndex({ itemId: 1, performedAt: -1 }, { background: true }),
      db.collection('inventory_transactions').createIndex({ plantId: 1, performedAt: -1 }, { background: true }),
      db.collection('inventory_transactions').createIndex({ referenceId: 1 }, { background: true })
    ]);

    // 22. Inventory Transfers (P2 Inter-plant)
    await Promise.all([
      db.collection('inventory_transfers').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('inventory_transfers').createIndex({ sourcePlantId: 1, status: 1 }, { background: true }),
      db.collection('inventory_transfers').createIndex({ destinationPlantId: 1, status: 1 }, { background: true }),
      db.collection('inventory_transfers').createIndex({ requestedAt: -1 }, { background: true })
    ]);

    // 23. Registered Devices (P2 Offline sync)
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('registered_devices'), 'deviceId'),
      db.collection('registered_devices').createIndex({ userId: 1, status: 1 }, { background: true }),
      db.collection('registered_devices').createIndex({ lastSyncAt: -1 }, { background: true })
    ]);

    // 24. Offline Sync Queue (P2)
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('offline_sync_queue'), 'operationId'),
      db.collection('offline_sync_queue').createIndex({ deviceId: 1, syncStatus: 1 }, { background: true }),
      db.collection('offline_sync_queue').createIndex({ clientTimestamp: 1 }, { background: true })
    ]);

    // 25. Unified Alerts (P2 Alert Center)
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('unified_alerts'), 'publicId'),
      db.collection('unified_alerts').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('unified_alerts').createIndex({ plantId: 1, resolved: 1, severity: 1 }, { background: true }),
      db.collection('unified_alerts').createIndex({ createdAt: -1 }, { background: true })
    ]);

    // 26. Users (Canonical Customer & Staff Identity)
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('users'), 'auth0UserId'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'auth0_sub'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'customerId'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'staffId'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'driverId'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'email'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'phone'),
      ensureSafeUniqueStringIndex(db.collection('users'), 'secondaryPhone'),
      db.collection('users').createIndex({ role: 1 }, { background: true })
    ]);


    // 27. Plants & Facilities
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('plants'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('plants'), 'id'),
      ensureSafeUniqueStringIndex(db.collection('plants'), 'code')
    ]);

    // 28. Payments
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('payments'), 'publicId'),
      db.collection('payments').createIndex({ orderId: 1 }, { background: true }),
      db.collection('payments').createIndex({ customerId: 1 }, { background: true })
    ]);

    // 29. Incidents & Disputes
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('incidents'), 'publicId'),
      db.collection('incidents').createIndex({ orderId: 1 }, { background: true }),
      db.collection('incidents').createIndex({ plant_id: 1 }, { background: true })
    ]);

    // 30. Support Tickets
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('tickets'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('tickets'), 'ticketId')
    ]);

    // 31. Services Catalog
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('services'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('services'), 'id')
    ]);

    // 32. Booking Slots
    await Promise.all([
      ensureSafeUniqueStringIndex(db.collection('booking_slots'), 'publicId'),
      ensureSafeUniqueStringIndex(db.collection('booking_slots'), 'id')
    ]);

    // 33. Coupon Redemptions Collection (Strict concurrency and webhook idempotency)
    const redemptionsColl = db.collection('coupon_redemptions');
    const duplicateRedemptions = await redemptionsColl.aggregate([
      { $match: { orderId: { $ne: null }, code: { $ne: null } } },
      { $group: { _id: { orderId: '$orderId', code: '$code' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (duplicateRedemptions.length > 0) {
      const summary = duplicateRedemptions.map((d: any) => `${d._id.orderId}:${d._id.code} (${d.count} occurrences)`).join(', ');
      throw new Error(`[Laundelle DB FATAL] Cannot create unique index on coupon_redemptions: found ${duplicateRedemptions.length} duplicate (orderId, code) record set(s): [${summary}]. Action required: Deduplicate records before applying unique constraint.`);
    }

    await Promise.all([
      ensureSafeIndex(
        redemptionsColl,
        { orderId: 1, code: 1 },
        { unique: true, background: true, name: 'uniq_coupon_redemptions_orderId_code' }
      ),
      ensureSafeIndex(
        redemptionsColl,
        { stripeSessionId: 1, code: 1 },
        { sparse: true, background: true, name: 'idx_coupon_redemptions_stripeSession_code' }
      ),
      ensureSafeIndex(
        redemptionsColl,
        { code: 1, redeemedAt: -1 },
        { background: true, name: 'idx_coupon_redemptions_code_redeemedAt' }
      ),
      ensureSafeIndex(
        db.collection('coupons'),
        { code: 1 },
        { unique: true, background: true, name: 'uniq_coupons_code' }
      ),
      // 10. Sessions collection (Server-side Session Security)
      ensureSafeIndex(
        db.collection('sessions'),
        { sessionId: 1 },
        { unique: true, background: true, name: 'uniq_sessions_sessionId' }
      ),
      ensureSafeIndex(
        db.collection('sessions'),
        { userId: 1, revokedAt: 1 },
        { background: true, name: 'idx_sessions_userId_revokedAt' }
      ),
      ensureSafeIndex(
        db.collection('sessions'),
        { publicId: 1, revokedAt: 1 },
        { background: true, name: 'idx_sessions_publicId_revokedAt' }
      ),
      ensureSafeIndex(
        db.collection('sessions'),
        { auth0UserId: 1, revokedAt: 1 },
        { background: true, name: 'idx_sessions_auth0UserId_revokedAt' }
      ),
      ensureSafeIndex(
        db.collection('sessions'),
        { expiresAt: 1 },
        { expireAfterSeconds: 0, background: true, name: 'ttl_sessions_expiresAt' }
      ),
      // 11. Revoked Tokens collection (Distributed token invalidation)
      ensureSafeIndex(
        db.collection('revoked_tokens'),
        { token: 1 },
        { unique: true, background: true, name: 'uniq_revoked_tokens_token' }
      ),
      ensureSafeIndex(
        db.collection('revoked_tokens'),
        { expiresAt: 1 },
        { expireAfterSeconds: 0, background: true, name: 'ttl_revoked_tokens_expiresAt' }
      ),
      // 12. Rate Limits collection (Distributed atomic rate limiting)
      ensureSafeIndex(
        db.collection('rate_limits'),
        { key: 1 },
        { unique: true, background: true, name: 'uniq_rate_limits_key' }
      ),
      ensureSafeIndex(
        db.collection('rate_limits'),
        { expiresAt: 1 },
        { expireAfterSeconds: 0, background: true, name: 'ttl_rate_limits_expiresAt' }
      ),
      // 13. Job Locks collection (Distributed background job locking)
      ensureSafeIndex(
        db.collection('job_locks'),
        { lockedUntil: 1 },
        { background: true, name: 'idx_job_locks_lockedUntil' }
      ),
      // 14. QR Bags collection (Reusable laundry bag fleet tracking)
      ensureSafeUniqueStringIndex(db.collection('qr_bags'), 'qrCode'),
      ensureSafeUniqueStringIndex(db.collection('qr_bags'), 'bagNumber'),
      ensureSafeUniqueStringIndex(db.collection('qr_bags'), 'publicId'),
      ensureSafeIndex(
        db.collection('qr_bags'),
        { plantId: 1, status: 1 },
        { background: true, name: 'idx_qr_bags_plantId_status' }
      ),
      ensureSafeIndex(
        db.collection('qr_bags'),
        { currentOrderId: 1 },
        { background: true, name: 'idx_qr_bags_currentOrderId' }
      )
    ]);

    indexesEnsured = true;
    console.log('[Laundelle DB] Production indexes successfully validated & ensured.');

    // Run IdMigrationService to backfill canonical publicIds
    try {
      const { IdMigrationService } = await import('../services/IdMigrationService');
      const migrationRes = await IdMigrationService.runMigration();
      console.log('[Laundelle DB] Canonical ID migration verified:', migrationRes);
    } catch (migErr: any) {
      console.warn('[Laundelle DB] Canonical ID migration notice:', migErr.message);
    }
  } catch (err: any) {
    indexesEnsured = false;
    console.error('[Laundelle DB FATAL] Index initialization error:', err.message);
    throw err;
  }
}

/**
 * Verification procedure to confirm the unique index on coupon_redemptions exists in MongoDB.
 */
export async function verifyCouponRedemptionsIndex(): Promise<{
  verified: boolean;
  name?: string;
  unique?: boolean;
  key?: Record<string, number>;
}> {
  const db = await getDb();
  const indexes = await db.collection('coupon_redemptions').indexes();
  const matched = indexes.find((idx: any) => {
    const key = idx.key || {};
    return key.orderId === 1 && key.code === 1;
  });

  if (!matched) {
    return { verified: false };
  }

  return {
    verified: Boolean(matched.unique),
    name: matched.name,
    unique: Boolean(matched.unique),
    key: matched.key as Record<string, number>
  };
}
