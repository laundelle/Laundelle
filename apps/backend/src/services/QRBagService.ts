import { getDb } from '@/lib/mongodb';
import { QRBag } from '@laundelle/types';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { generateBagId } from '@laundelle/ids';
import { AuditService } from './AuditService';
import { AlertService } from './AlertService';

export interface RegisterBagInput {
  qrCode: string;
  bagNumber?: string;
  condition?: 'new' | 'good' | 'fair' | 'damaged';
  plantId?: string;
  notes?: string;
  registeredBy?: string;
}

export interface QRBagHistoryEntry {
  action:
    | 'REGISTERED'
    | 'ASSIGNED_TO_ORDER'
    | 'COLLECTED_AT_DOORSTEP'
    | 'RECEIVED_AT_PLANT'
    | 'RETURNED_TO_INVENTORY'
    | 'QUARANTINED'
    | 'RETIRED'
    | 'REPORTED_LOST';
  orderId?: string;
  plantId?: string;
  actorId?: string;
  timestamp: string;
  notes?: string;
}

export class QRBagService {
  /**
   * Registers a new physical reusable laundry bag with unique QR code.
   * Enforces uniqueness to prevent duplicate tags across the fleet.
   */
  static async registerBag(data: RegisterBagInput): Promise<QRBag> {
    const db = await getDb();
    const qrCode = (data.qrCode || '').trim();
    if (!qrCode) {
      throw new BadRequestError('QR code string is required to register a bag.');
    }

    const bagNumber = (data.bagNumber || qrCode.replace(/^BAG-?/i, '') || `BAG-${Date.now()}`).trim();
    const bagId = generateBagId();
    const now = new Date().toISOString();

    // 1. Check for duplicate QR code or bag number
    const existing = await db.collection('qr_bags').findOne({
      $or: [
        { qrCode },
        { bagNumber },
        { id: bagId }
      ]
    });

    if (existing) {
      throw new BadRequestError(`A laundry bag with QR code "${qrCode}" or number "${bagNumber}" is already registered.`);
    }

    const newBag: QRBag & {
      history: QRBagHistoryEntry[];
      plantId?: string;
      notes?: string;
    } = {
      id: bagId,
      qrCode,
      bagNumber,
      status: 'available',
      condition: data.condition || 'new',
      plantId: data.plantId,
      notes: data.notes,
      createdAt: now,
      lastScannedAt: now,
      history: [
        {
          action: 'REGISTERED',
          plantId: data.plantId,
          actorId: data.registeredBy || 'system',
          timestamp: now,
          notes: data.notes || 'Initial fleet registration'
        }
      ]
    };

    await db.collection('qr_bags').insertOne(newBag as any);

    await AuditService.recordEvent({
      entityType: 'qr_bag',
      entityId: bagId,
      action: 'bag_registered',
      actorId: data.registeredBy || 'system',
      actorRole: 'admin',
      metadata: { qrCode, bagNumber, plantId: data.plantId }
    });

    return newBag;
  }

  /**
   * Retrieves a single bag by QR code, bag number, or database ID.
   */
  static async getBag(identifier: string): Promise<any> {
    const db = await getDb();
    const clean = (identifier || '').trim();
    if (!clean) return null;

    return await db.collection('qr_bags').findOne({
      $or: [
        { qrCode: clean },
        { bagNumber: clean },
        { id: clean },
        { publicId: clean },
        { qrCode: new RegExp(`^${clean}$`, 'i') }
      ]
    });
  }

  /**
   * Retrieves paginated list of bags with plant and status filters.
   */
  static async listBags(query: {
    plantId?: string;
    status?: string;
    condition?: string;
    page?: number;
    limit?: number;
  }) {
    const db = await getDb();
    const filter: any = {};
    if (query.plantId) filter.plantId = query.plantId;
    if (query.status) filter.status = query.status;
    if (query.condition) filter.condition = query.condition;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(Math.max(1, query.limit || 50), 100);
    const skip = (page - 1) * limit;

    const total = await db.collection('qr_bags').countDocuments(filter);
    const items = await db.collection('qr_bags')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Associates a bag with an order during driver pickup.
   * Prevents duplicate assignment if the bag is actively assigned to another uncompleted order.
   */
  static async assignBagToOrder(
    qrCode: string,
    orderId: string,
    customerName?: string,
    actorId?: string
  ): Promise<any> {
    const db = await getDb();
    const cleanQr = (qrCode || '').trim();
    const now = new Date().toISOString();

    let bag = await this.getBag(cleanQr);

    if (bag) {
      // Validate that bag is not currently in use by a DIFFERENT active order
      if (bag.status === 'in_use' && bag.currentOrderId && bag.currentOrderId !== orderId) {
        // Verify if the other order is still active
        const existingOrder = await db.collection('orders').findOne({
          $or: [{ id: bag.currentOrderId }, { publicId: bag.currentOrderId }]
        });
        if (existingOrder && !['delivered', 'completed', 'cancelled'].includes(existingOrder.status)) {
          throw new BadRequestError(
            `Bag "${cleanQr}" is currently assigned to another active order (${bag.currentOrderId}). Please select an available bag.`
          );
        }
      }

      if (bag.status === 'quarantined' || bag.status === 'retired') {
        throw new BadRequestError(
          `Bag "${cleanQr}" cannot be assigned because its status is "${bag.status}".`
        );
      }

      const historyEntry: QRBagHistoryEntry = {
        action: 'ASSIGNED_TO_ORDER',
        orderId,
        actorId,
        timestamp: now,
        notes: `Assigned to customer order #${orderId}`
      };

      await db.collection('qr_bags').updateOne(
        { _id: bag._id },
        {
          $set: {
            status: 'in_use',
            currentOrderId: orderId,
            currentCustomerName: customerName || bag.currentCustomerName,
            lastScannedAt: now,
            updatedAt: now
          },
          $push: { history: historyEntry } as any
        }
      );
    } else {
      // Auto-register legacy or ad-hoc bag to prevent order failure while establishing chain of custody
      bag = await this.registerBag({
        qrCode: cleanQr,
        bagNumber: cleanQr.replace(/^BAG-?/i, ''),
        condition: 'good',
        notes: `Auto-registered upon pickup for order #${orderId}`,
        registeredBy: actorId
      });

      await db.collection('qr_bags').updateOne(
        { _id: bag._id },
        {
          $set: {
            status: 'in_use',
            currentOrderId: orderId,
            currentCustomerName: customerName,
            lastScannedAt: now
          }
        }
      );
    }

    return (await this.getBag(cleanQr))!;
  }

  /**
   * Records receipt of a bag at the laundry processing plant dock.
   */
  static async recordPlantIntake(
    qrCode: string,
    plantId: string,
    condition?: 'new' | 'good' | 'fair' | 'damaged',
    actorId?: string
  ): Promise<any> {
    const db = await getDb();
    const bag = await this.getBag(qrCode);
    if (!bag) return null;

    const now = new Date().toISOString();
    const historyEntry: QRBagHistoryEntry = {
      action: 'RECEIVED_AT_PLANT',
      orderId: bag.currentOrderId,
      plantId,
      actorId,
      timestamp: now,
      notes: `Scanned at dock intake in plant ${plantId}`
    };

    const updateSet: any = {
      lastScannedAt: now,
      plantId,
      updatedAt: now
    };
    if (condition) updateSet.condition = condition;

    // If damaged at intake, quarantine for repair
    if (condition === 'damaged') {
      updateSet.status = 'quarantined';
    }

    await db.collection('qr_bags').updateOne(
      { _id: bag._id },
      {
        $set: updateSet,
        $push: { history: historyEntry } as any
      }
    );

    return (await this.getBag(bag.qrCode))!;
  }

  /**
   * Releases bag from an order after delivery and returns it to available plant stock.
   */
  static async returnBagToInventory(
    qrCode: string,
    condition: 'new' | 'good' | 'fair' | 'damaged' = 'good',
    actorId?: string
  ): Promise<any> {
    const db = await getDb();
    const bag = await this.getBag(qrCode);
    if (!bag) return null;

    const now = new Date().toISOString();
    const isDamaged = condition === 'damaged';

    const historyEntry: QRBagHistoryEntry = {
      action: isDamaged ? 'QUARANTINED' : 'RETURNED_TO_INVENTORY',
      orderId: bag.currentOrderId,
      actorId,
      timestamp: now,
      notes: isDamaged ? 'Quarantined due to wear/tear damage' : 'Cleaned and returned to active stock'
    };

    await db.collection('qr_bags').updateOne(
      { _id: bag._id },
      {
        $set: {
          status: isDamaged ? 'quarantined' : 'available',
          condition,
          currentOrderId: null,
          currentCustomerName: null,
          lastScannedAt: now,
          updatedAt: now
        },
        $push: { history: historyEntry } as any
      }
    );

    return (await this.getBag(bag.qrCode))!;
  }

  /**
   * Quarantines a damaged or stained bag to prevent reuse until inspected.
   */
  static async quarantineBag(qrCode: string, reason: string, actorId?: string): Promise<any> {
    const db = await getDb();
    const bag = await this.getBag(qrCode);
    if (!bag) throw new NotFoundError(`Bag "${qrCode}" not found.`);

    const now = new Date().toISOString();
    const historyEntry: QRBagHistoryEntry = {
      action: 'QUARANTINED',
      actorId,
      timestamp: now,
      notes: reason
    };

    await db.collection('qr_bags').updateOne(
      { _id: bag._id },
      {
        $set: {
          status: 'quarantined',
          condition: 'damaged',
          updatedAt: now
        },
        $push: { history: historyEntry } as any
      }
    );

    return (await this.getBag(bag.qrCode))!;
  }

  /**
   * Permanently retires a bag from fleet circulation.
   */
  static async retireBag(qrCode: string, reason: string, actorId?: string): Promise<any> {
    const db = await getDb();
    const bag = await this.getBag(qrCode);
    if (!bag) throw new NotFoundError(`Bag "${qrCode}" not found.`);

    const now = new Date().toISOString();
    const historyEntry: QRBagHistoryEntry = {
      action: 'RETIRED',
      actorId,
      timestamp: now,
      notes: reason
    };

    await db.collection('qr_bags').updateOne(
      { _id: bag._id },
      {
        $set: {
          status: 'retired',
          currentOrderId: null,
          updatedAt: now
        },
        $push: { history: historyEntry } as any
      }
    );

    return (await this.getBag(bag.qrCode))!;
  }

  /**
   * Reports a bag lost or missing during transit. Creates operational alert.
   */
  static async reportMissingBag(qrCode: string, orderId?: string, actorId?: string): Promise<any> {
    const db = await getDb();
    const bag = await this.getBag(qrCode);
    if (!bag) throw new NotFoundError(`Bag "${qrCode}" not found.`);

    const now = new Date().toISOString();
    const historyEntry: QRBagHistoryEntry = {
      action: 'REPORTED_LOST',
      orderId: orderId || bag.currentOrderId,
      actorId,
      timestamp: now,
      notes: 'Reported missing or unreturned'
    };

    await db.collection('qr_bags').updateOne(
      { _id: bag._id },
      {
        $set: {
          status: 'lost',
          updatedAt: now
        },
        $push: { history: historyEntry } as any
      }
    );

    await AlertService.createAlert({
      type: 'missing_bag' as any,
      severity: 'high' as any,
      title: `Missing Laundry Bag: ${bag.bagNumber}`,
      message: `Bag ${bag.bagNumber} (${qrCode}) was reported missing for order #${orderId || bag.currentOrderId || 'N/A'}.`,
      entityId: bag.id,
      entityType: 'qr_bag'
    });

    return (await this.getBag(bag.qrCode))!;
  }
}

