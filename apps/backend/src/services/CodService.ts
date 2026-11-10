import { getDb, getMongoClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { CodCollectionRecord, CodReconciliationStatus } from '@laundelle/types';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { ExceptionService } from './ExceptionService';
import { AuditService } from '@/services/AuditService';
import { DriverService } from './DriverService';
import { generateCodRecordId, buildEntityLookupQuery } from '@laundelle/ids';

export interface CodActor {
  id: string;
  publicId?: string;
  role: string;
  plantId?: string;
  name?: string;
}

export class CodService {
  /**
   * Records a COD collection attempt by an authorized courier driver during delivery.
   * Guarantees driver assignment check, non-negative monetary precision, atomic status update,
   * plant isolation, and durable idempotency against concurrent submissions.
   */
  static async recordCodCollection(params: {
    orderId: string;
    driverId?: string;
    actor?: CodActor;
    amountCollected: number;
    paymentMethod?: string;
    notes?: string;
    receiptReference?: string;
    idempotencyKey?: string;
  }): Promise<CodCollectionRecord> {
    const { orderId, driverId, actor, amountCollected, paymentMethod, notes, receiptReference, idempotencyKey } = params;

    // 1. Monetary validation & finite precision check
    if (
      amountCollected === undefined ||
      amountCollected === null ||
      typeof amountCollected !== 'number' ||
      !Number.isFinite(amountCollected) ||
      amountCollected < 0
    ) {
      throw new BadRequestError('A valid finite, non-negative collection amount is required.');
    }

    const sanitizedCollected = Math.round(amountCollected * 100) / 100;

    const db = await getDb();
    const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
    if (!order) throw new NotFoundError(`Order ${orderId} not found.`);

    // 2. Identify actor & verify driver assignment
    const effectiveActorId = actor?.publicId || actor?.id || driverId;
    if (!effectiveActorId) {
      throw new ForbiddenError('Driver identity is required for COD collection.');
    }

    const { driverUser, driverIds } = await DriverService.getDriverIdentifiers(effectiveActorId);
    const actorRole = actor?.role || driverUser?.role || 'driver';
    const driverName = actor?.name || driverUser?.full_name || order.driver?.name || 'Courier Driver';

    if (!['admin', 'super_admin'].includes(actorRole)) {
      const isAssigned = driverIds.includes(String(order.assigned_driver_id)) ||
        (order.driver?.id && driverIds.includes(String(order.driver.id)));

      if (!isAssigned) {
        throw new ForbiddenError('Access denied: You are not assigned to collect COD for this order.');
      }
    }

    // 3. Plant isolation
    const actorPlantId = actor?.plantId || driverUser?.plant_id || driverUser?.plantId;
    if (actorPlantId && order.plant_id && !['super_admin'].includes(actorRole)) {
      if (String(actorPlantId) !== String(order.plant_id)) {
        throw new ForbiddenError('Access denied: Order belongs to a different plant facility.');
      }
    }

    // 4. Order status & payment eligibility
    if ((order.status || '').toLowerCase() === 'cancelled') {
      throw new BadRequestError('Cannot record COD collection for a cancelled order.');
    }

    const paymentMethodLower = (order.payment_method || order.paymentMethod || '').toLowerCase();
    const isCodOrder = order.is_cod === true || paymentMethodLower.includes('cash') || paymentMethodLower.includes('cod');
    if (!isCodOrder) {
      throw new BadRequestError('Order is not configured for Cash on Delivery payment.');
    }

    // 5. Durable Idempotency & Failure Recovery Check
    const effectiveIdempotencyKey = idempotencyKey || `cod_${order.publicId || order.id || orderId}`;
    let existingRecord = await db.collection('cod_collections').findOne({
      $or: [
        { idempotencyKey: effectiveIdempotencyKey },
        { orderId: order.publicId || order.id || orderId }
      ]
    });

    if (existingRecord) {
      return existingRecord as unknown as CodCollectionRecord;
    }

    // Recoverable consistency: If a prior attempt updated order.codRecord but crashed before saving to cod_collections
    if (order.codRecord) {
      await db.collection('cod_collections').updateOne(
        { id: order.codRecord.id },
        { $set: order.codRecord },
        { upsert: true }
      );
      return order.codRecord as unknown as CodCollectionRecord;
    }

    const isAlreadyPaid = order.isPaid === true || (order.paymentStatus || '').toLowerCase() === 'paid';
    if (isAlreadyPaid) {
      throw new BadRequestError('Payment for this order has already been recorded and settled.');
    }

    // 6. Authoritative amount expected from order
    const amountExpected = Math.round(Number(order.total || order.total_amount || 0) * 100) / 100;
    const discrepancyAmount = Math.round((sanitizedCollected - amountExpected) * 100) / 100;

    let reconciliationStatus: CodReconciliationStatus = 'COLLECTED';
    if (discrepancyAmount !== 0) {
      reconciliationStatus = 'DISCREPANCY';
    } else if (sanitizedCollected === 0 && amountExpected > 0) {
      reconciliationStatus = 'FAILED';
    }

    const now = new Date().toISOString();
    const recordId = generateCodRecordId();

    const codRecord: CodCollectionRecord = {
      id: recordId,
      publicId: recordId,
      codRecordId: recordId,
      orderId: order.publicId || order.id || orderId,
      orderNumber: order.orderNumber || order.order_number || order.publicId || order.id || orderId,
      amountExpected,
      amountCollected: sanitizedCollected,
      discrepancyAmount,
      paymentMethod: paymentMethod || 'Cash on Delivery',
      driverId: effectiveActorId,
      driverName,
      collectedAt: now,
      receiptReference,
      notes,
      reconciliationStatus,
      idempotencyKey: effectiveIdempotencyKey,
      createdAt: now
    };

    // 7. Atomic transaction or recoverable two-phase persistence
    const client = await getMongoClient();
    let committed = false;

    // Try MongoDB multi-document transaction where supported (replica set/mongos)
    try {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const updateRes = await db.collection('orders').updateOne(
            {
              _id: order._id,
              isPaid: { $ne: true },
              'codRecord.id': { $exists: false }
            },
            {
              $set: {
                codRecord,
                paymentStatus: discrepancyAmount === 0 ? 'Paid' : 'Pending',
                isPaid: discrepancyAmount === 0,
                updated_at: now
              },
              $push: {
                timeline_events: {
                  event: 'cod_collected',
                  label: `Cash on Delivery Collected: £${sanitizedCollected.toFixed(2)} (Expected £${amountExpected.toFixed(2)})`,
                  actor: 'driver',
                  actorId: effectiveActorId,
                  timestamp: now,
                  discrepancy: discrepancyAmount !== 0 ? discrepancyAmount : undefined
                }
              } as any
            },
            { session }
          );

          if (updateRes.matchedCount === 0) {
            const existingInTx = await db.collection('cod_collections').findOne(
              {
                $or: [
                  { idempotencyKey: effectiveIdempotencyKey },
                  { orderId: order.publicId || order.id || orderId }
                ]
              },
              { session }
            );
            if (existingInTx) {
              return;
            }
            const refreshedInTx = await db.collection('orders').findOne({ _id: order._id }, { session });
            if (refreshedInTx?.codRecord) {
              await db.collection('cod_collections').updateOne(
                { id: refreshedInTx.codRecord.id },
                { $set: refreshedInTx.codRecord },
                { upsert: true, session }
              );
              return;
            }
            throw new BadRequestError('COD collection rejected: Order is already paid or concurrent collection occurred.');
          }

          await db.collection('cod_collections').updateOne(
            { id: recordId },
            { $set: codRecord },
            { upsert: true, session }
          );
        });
        committed = true;
      } finally {
        await session.endSession();
      }

      const settledFinal = await db.collection('cod_collections').findOne({
        $or: [
          { idempotencyKey: effectiveIdempotencyKey },
          { orderId: order.publicId || order.id || orderId }
        ]
      });
      if (settledFinal) {
        return settledFinal as unknown as CodCollectionRecord;
      }
    } catch (txErr: any) {
      if (txErr instanceof BadRequestError || txErr instanceof NotFoundError || txErr instanceof ForbiddenError) {
        throw txErr;
      }
      // Transaction unsupported on standalone Mongo or transient network error: fallback to recoverable strategy
    }

    if (!committed) {
      // Non-transactional fallback with atomic condition and compensation rollback
      const orderUpdateResult = await db.collection('orders').updateOne(
        {
          _id: order._id,
          isPaid: { $ne: true },
          'codRecord.id': { $exists: false }
        },
        {
          $set: {
            codRecord,
            paymentStatus: discrepancyAmount === 0 ? 'Paid' : 'Pending',
            isPaid: discrepancyAmount === 0,
            updated_at: now
          },
          $push: {
            timeline_events: {
              event: 'cod_collected',
              label: `Cash on Delivery Collected: £${sanitizedCollected.toFixed(2)} (Expected £${amountExpected.toFixed(2)})`,
              actor: 'driver',
              actorId: effectiveActorId,
              timestamp: now,
              discrepancy: discrepancyAmount !== 0 ? discrepancyAmount : undefined
            }
          } as any
        }
      );

      if (orderUpdateResult.matchedCount === 0) {
        // Check if concurrent request already completed it
        const refreshed = await db.collection('orders').findOne({ _id: order._id });
        if (refreshed?.codRecord) {
          await db.collection('cod_collections').updateOne(
            { id: refreshed.codRecord.id },
            { $set: refreshed.codRecord },
            { upsert: true }
          );
          return refreshed.codRecord as unknown as CodCollectionRecord;
        }
        throw new BadRequestError('COD collection rejected: Order is already paid or concurrent collection occurred.');
      }

      // Persist in cod_collections with compensation rollback if insert fails
      try {
        await db.collection('cod_collections').updateOne(
          { id: recordId },
          { $set: codRecord },
          { upsert: true }
        );
      } catch (insertErr) {
        // Rollback order update so retries can succeed and state does not strand unpaid/unrecorded
        await db.collection('orders').updateOne(
          { _id: order._id, 'codRecord.id': recordId },
          {
            $unset: { codRecord: '' },
            $set: {
              isPaid: order.isPaid || false,
              paymentStatus: order.paymentStatus || 'Pending'
            }
          }
        ).catch(() => {});
        throw insertErr;
      }
    }

    // 9. If there is a financial discrepancy, automatically raise a single operational exception
    if (discrepancyAmount !== 0) {
      const canonicalOrderId = order.publicId || order.id || orderId;
      const existingException = await db.collection('exceptions').findOne({
        orderId: canonicalOrderId,
        type: 'COD_discrepancy'
      });

      if (!existingException) {
        await ExceptionService.createException({
          orderId: canonicalOrderId,
          orderNumber: order.orderNumber || order.order_number || canonicalOrderId,
          type: 'COD_discrepancy',
          priority: 'high',
          plantId: order.plant_id,
          description: `COD Discrepancy detected: Expected £${amountExpected.toFixed(2)}, driver collected £${sanitizedCollected.toFixed(2)} (Variance: £${discrepancyAmount.toFixed(2)}).`,
          evidence: {
            driverId: effectiveActorId,
            driverName,
            amountExpected,
            amountCollected: sanitizedCollected,
            discrepancyAmount,
            notes,
            receiptReference
          }
        });
      }
    }

    // 10. Audit event
    await AuditService.recordOrderEvent({
      orderId: order.publicId || order.id || orderId,
      action: 'cod_collected',
      actorId: effectiveActorId,
      actorRole: 'driver',
      before: { paymentStatus: order.paymentStatus },
      after: { paymentStatus: discrepancyAmount === 0 ? 'Paid' : 'Pending', amountCollected: sanitizedCollected },
      metadata: { amountExpected, amountCollected: sanitizedCollected, discrepancyAmount, receiptReference, idempotencyKey: effectiveIdempotencyKey }
    });

    return codRecord;
  }

  /**
   * Fetches all COD collection records for reconciliation dashboard.
   */
  static async getCodRecords(filter: { reconciliationStatus?: string; driverId?: string } = {}, limit = 100) {
    const db = await getDb();
    const query: any = {};
    if (filter.reconciliationStatus && filter.reconciliationStatus !== 'ALL') {
      query.reconciliationStatus = filter.reconciliationStatus;
    }
    if (filter.driverId) {
      query.driverId = filter.driverId;
    }

    const records = await db.collection('cod_collections')
      .find(query)
      .sort({ collectedAt: -1 })
      .limit(limit)
      .toArray();

    return records as unknown as CodCollectionRecord[];
  }
}
