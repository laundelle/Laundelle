import { getDb } from '@/lib/mongodb';
import {
  generateCustomerId,
  generateStaffId,
  generateOrderId,
  generatePlantId,
  generateVehicleId,
  generateMachineId,
  generateIncidentId,
  generatePaymentId,
  generateSubscriptionId,
  generateSupportTicketId,
  generateEvidenceId,
  generateAddressId,
  generateAlertId,
  generateExceptionId,
  generateInventoryItemId,
  generateCodRecordId,
  generateServiceId,
  generateBookingSlotId,
  isValidCanonicalId
} from '@laundelle/ids';

export interface MigrationSummary {
  usersMigrated: number;
  ordersMigrated: number;
  plantsMigrated: number;
  vehiclesMigrated: number;
  machinesMigrated: number;
  incidentsMigrated: number;
  paymentsMigrated: number;
  subscriptionsMigrated: number;
  ticketsMigrated: number;
  alertsMigrated: number;
  evidenceMigrated: number;
  exceptionsMigrated: number;
  inventoryMigrated: number;
  codMigrated: number;
  servicesMigrated: number;
  slotsMigrated: number;
  errors: string[];
}

export class IdMigrationService {
  /**
   * Backfills canonical publicId across all existing records without touching internal _id
   * and preserves 100% backward compatibility with legacy fields.
   */
  static async runMigration(): Promise<MigrationSummary> {
    const db = await getDb();
    const summary: MigrationSummary = {
      usersMigrated: 0,
      ordersMigrated: 0,
      plantsMigrated: 0,
      vehiclesMigrated: 0,
      machinesMigrated: 0,
      incidentsMigrated: 0,
      paymentsMigrated: 0,
      subscriptionsMigrated: 0,
      ticketsMigrated: 0,
      alertsMigrated: 0,
      evidenceMigrated: 0,
      exceptionsMigrated: 0,
      inventoryMigrated: 0,
      codMigrated: 0,
      servicesMigrated: 0,
      slotsMigrated: 0,
      errors: []
    };

    try {
      const unmigratedFilter = {
        $or: [
          { publicId: { $exists: false } },
          { publicId: null },
          { publicId: '' }
        ]
      };

      // 1. Migrate Users
      const users = await db.collection('users').find({
        $or: [
          ...unmigratedFilter.$or,
          { 'addresses.publicId': { $exists: false } }
        ]
      }).toArray();
      for (const u of users) {
        const isStaff = ['driver', 'processor', 'manager', 'admin', 'super_admin'].includes(u.role);
        let publicId = u.publicId;

        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = isStaff ? generateStaffId() : generateCustomerId();
        }

        const updates: any = { publicId, id: u.id || publicId };
        if (isStaff) {
          updates.staffId = publicId;
        } else {
          updates.customerId = publicId;
        }

        // Migrate addresses if present
        if (Array.isArray(u.addresses)) {
          updates.addresses = u.addresses.map((addr: any) => ({
            ...addr,
            publicId: addr.publicId || generateAddressId(),
            id: addr.id || addr.publicId || generateAddressId()
          }));
        }

        await db.collection('users').updateOne({ _id: u._id }, { $set: updates });
        summary.usersMigrated++;
      }

      // 2. Migrate Plants
      const plants = await db.collection('plants').find(unmigratedFilter).toArray();
      for (const p of plants) {
        let publicId = p.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generatePlantId();
        }
        await db.collection('plants').updateOne(
          { _id: p._id },
          { $set: { publicId, plantId: publicId, id: p.id || publicId } }
        );
        summary.plantsMigrated++;
      }

      // 3. Migrate Orders
      const orders = await db.collection('orders').find(unmigratedFilter).toArray();
      for (const o of orders) {
        let publicId = o.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateOrderId();
        }

        const updates: any = {
          publicId,
          orderNumber: o.orderNumber || publicId,
          customerId: o.customerId || o.customer_id || o.userId || 'CUS-UNKNOWN',
          plantId: o.plantId || o.plant_id || null,
          staffId: o.staffId || o.assigned_driver_id || o.assigned_processor_id || null
        };

        // If legacy id was missing or purely numeric, ensure id mirrors publicId
        if (!o.id) {
          updates.id = publicId;
        }

        await db.collection('orders').updateOne({ _id: o._id }, { $set: updates });
        summary.ordersMigrated++;
      }

      // 4. Migrate Vehicles
      const vehicles = await db.collection('vehicles').find(unmigratedFilter).toArray();
      for (const v of vehicles) {
        let publicId = v.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateVehicleId();
        }
        await db.collection('vehicles').updateOne(
          { _id: v._id },
          { $set: { publicId, vehicleId: publicId, id: v.id || publicId } }
        );
        summary.vehiclesMigrated++;
      }

      // 5. Migrate Machines
      const machines = await db.collection('machines').find(unmigratedFilter).toArray();
      for (const m of machines) {
        let publicId = m.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateMachineId();
        }
        await db.collection('machines').updateOne(
          { _id: m._id },
          { $set: { publicId, machineId: publicId, id: m.id || publicId } }
        );
        summary.machinesMigrated++;
      }

      // 6. Migrate Incidents
      const incidents = await db.collection('incidents').find(unmigratedFilter).toArray();
      for (const inc of incidents) {
        let publicId = inc.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateIncidentId();
        }
        await db.collection('incidents').updateOne(
          { _id: inc._id },
          { $set: { publicId, incidentId: publicId, incidentNumber: publicId, id: inc.id || publicId } }
        );
        summary.incidentsMigrated++;
      }

      // 7. Migrate Payments
      const payments = await db.collection('payments').find(unmigratedFilter).toArray();
      for (const pay of payments) {
        let publicId = pay.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generatePaymentId();
        }
        await db.collection('payments').updateOne(
          { _id: pay._id },
          { $set: { publicId, paymentId: publicId, id: pay.id || publicId } }
        );
        summary.paymentsMigrated++;
      }

      // 8. Migrate Subscriptions
      const subscriptions = await db.collection('subscriptions').find(unmigratedFilter).toArray();
      for (const sub of subscriptions) {
        let publicId = sub.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateSubscriptionId();
        }
        await db.collection('subscriptions').updateOne(
          { _id: sub._id },
          { $set: { publicId, subscriptionId: publicId, id: sub.id || publicId } }
        );
        summary.subscriptionsMigrated++;
      }

      // 9. Migrate Support Tickets
      const tickets = await db.collection('tickets').find(unmigratedFilter).toArray();
      for (const t of tickets) {
        let publicId = t.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateSupportTicketId();
        }
        await db.collection('tickets').updateOne(
          { _id: t._id },
          { $set: { publicId, ticketId: publicId, id: t.id || publicId } }
        );
        summary.ticketsMigrated++;
      }

      // 10. Migrate Unified Alerts
      const alerts = await db.collection('unified_alerts').find(unmigratedFilter).toArray();
      for (const a of alerts) {
        let publicId = a.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateAlertId();
        }
        await db.collection('unified_alerts').updateOne(
          { _id: a._id },
          { $set: { publicId, id: a.id || publicId } }
        );
        summary.alertsMigrated++;
      }

      // 11. Migrate Evidence
      const evidence = await db.collection('evidence').find(unmigratedFilter).toArray();
      for (const ev of evidence) {
        let publicId = ev.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateEvidenceId();
        }
        await db.collection('evidence').updateOne(
          { _id: ev._id },
          { $set: { publicId, evidenceId: publicId, id: ev.id || publicId } }
        );
        summary.evidenceMigrated++;
      }

      // 12. Migrate Operational Exceptions
      const exceptions = await db.collection('exceptions').find(unmigratedFilter).toArray();
      for (const exc of exceptions) {
        let publicId = exc.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateExceptionId();
        }
        await db.collection('exceptions').updateOne(
          { _id: exc._id },
          { $set: { publicId, id: exc.id || publicId } }
        );
        summary.exceptionsMigrated++;
      }

      // 13. Migrate Inventory Items
      const inventory = await db.collection('inventory_items').find(unmigratedFilter).toArray();
      for (const itm of inventory) {
        let publicId = itm.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateInventoryItemId();
        }
        await db.collection('inventory_items').updateOne(
          { _id: itm._id },
          { $set: { publicId, id: itm.id || publicId } }
        );
        summary.inventoryMigrated++;
      }

      // 14. Migrate COD Collections
      const cods = await db.collection('cod_collections').find(unmigratedFilter).toArray();
      for (const c of cods) {
        let publicId = c.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateCodRecordId();
        }
        await db.collection('cod_collections').updateOne(
          { _id: c._id },
          { $set: { publicId, codRecordId: publicId, id: c.id || publicId } }
        );
        summary.codMigrated++;
      }

      // 15. Migrate Services
      const services = await db.collection('services').find(unmigratedFilter).toArray();
      for (const s of services) {
        let publicId = s.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateServiceId();
        }
        await db.collection('services').updateOne(
          { _id: s._id },
          { $set: { publicId, serviceId: publicId, id: s.id || publicId } }
        );
        summary.servicesMigrated++;
      }

      // 16. Migrate Booking Slots
      const slots = await db.collection('booking_slots').find(unmigratedFilter).toArray();
      for (const slt of slots) {
        let publicId = slt.publicId;
        if (!publicId || !isValidCanonicalId(publicId)) {
          publicId = generateBookingSlotId();
        }
        await db.collection('booking_slots').updateOne(
          { _id: slt._id },
          { $set: { publicId, slotId: publicId, id: slt.id || publicId } }
        );
        summary.slotsMigrated++;
      }

    } catch (err: any) {
      summary.errors.push(err.message);
    }

    return summary;
  }
}
