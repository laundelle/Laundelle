import { NotificationService } from '@/services/NotificationService';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { AuditService } from '@/services/AuditService';
import { matchesPostcode, validateOtpAttempt, assertValidTransition } from '@/lib/workflow';
import { verifyOrderPinAttempt, hashOrderPin, decryptOrderPin } from '@/lib/orderPin';
import { ExceptionService } from '@/services/ExceptionService';
import { SlaService } from '@/services/SlaService';
import { EvidenceService } from '@/services/EvidenceService';
import { CodService } from '@/services/CodService';
import { PickupFailureReason, DeliveryFailureReason, PickupAttemptRecord, DeliveryAttemptRecord } from '@laundelle/types';
import { generatePickupAttemptId, generateDeliveryAttemptId, generateBagId, buildEntityLookupQuery } from '@laundelle/ids';
import { sendOrderCompletedEmail } from '@/emails';
import { OrderCustomerEnrichmentService } from './OrderCustomerEnrichmentService';
import crypto from 'crypto';

export class DriverService {
    
    // ==========================================
    // 1. DASHBOARD & STATE
    // ==========================================

    private static sanitizeOrder(order: any) {
        if (!order) return order;
        const safe = { ...order };
        delete safe.pickup_otp;
        delete safe.delivery_otp;
        delete safe.pickup_pin;
        delete safe.delivery_pin;
        delete safe.pickup_pin_hash;
        delete safe.pickup_pin_salt;
        delete safe.pickup_pin_enc;
        delete safe.delivery_pin_hash;
        delete safe.delivery_pin_salt;
        delete safe.delivery_pin_enc;
        return safe;
    }

    public static userFilter(driverId: string) {
        const idStr = String(driverId);
        const orConditions: any[] = [
            { _id: idStr },
            { id: idStr },
            { publicId: idStr },
            { staffId: idStr },
            { email: idStr }
        ];
        if (ObjectId.isValid(idStr)) {
            orConditions.push({ _id: new ObjectId(idStr) });
        }
        return { $or: orConditions };
    }

    public static async getDriverIdentifiers(driverId: string): Promise<{ driverUser: any; driverIds: string[] }> {
        const db = await getDb();
        const driverUser = await db.collection('users').findOne(this.userFilter(driverId));
        const idStr = String(driverId);
        const ids = new Set<string>([idStr]);
        if (driverUser) {
            if (driverUser._id) ids.add(String(driverUser._id));
            if (driverUser.id) ids.add(String(driverUser.id));
            if (driverUser.publicId) ids.add(String(driverUser.publicId));
            if (driverUser.staffId) ids.add(String(driverUser.staffId));
            if (driverUser.employee_number) ids.add(String(driverUser.employee_number));
            if (driverUser.email) ids.add(String(driverUser.email));
        }
        return { driverUser, driverIds: Array.from(ids) };
    }

    static async getJobs(driverId: string) {
        const db = await getDb();
        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        if (!driverUser || driverUser.role !== 'driver') {
            throw new ForbiddenError('Access denied: Driver account required.');
        }

        const ACTIVE_DRIVER_STATUSES = [
            'order_placed',
            'booking_confirmed',
            'collection_scheduled',
            'driver_assigned',
            'pickup_in_progress',
            'pickup_failed',
            'ready_for_delivery',
            'qc_passed',
            'waiting_for_driver',
            'delivery_driver_assigned',
            'delivery_driver_accepted',
            'package_collected_for_delivery',
            'out_for_delivery',
            'delivery_attempted',
            'delivery_failed'
        ];

        const driverIdStr = String(driverId);
        const driverPostcodes = driverUser.assigned_postcodes || driverUser.assignedSectors || [];
        const driverPlantId = driverUser.plant_id ? String(driverUser.plant_id) : null;

        const driverQueryOr: any[] = [
            { assigned_driver_id: { $in: driverIds } },
            { 'driver.id': { $in: driverIds } }
        ];
        driverIds.forEach((id) => {
            if (ObjectId.isValid(id)) {
                driverQueryOr.push({ assigned_driver_id: new ObjectId(id) });
            }
        });

        const driverQuery = { $or: driverQueryOr };

        let assigned = await db.collection('orders')
            .find({ ...driverQuery, status: { $in: ACTIVE_DRIVER_STATUSES } })
            .sort({ createdAt: -1 })
            .toArray();

        // Include unassigned collection orders in driver's plant or postcode coverage
        const unassignedQuery = {
            status: { $in: ['order_placed', 'booking_confirmed', 'collection_scheduled'] },
            $or: [
                { assigned_driver_id: { $exists: false } },
                { assigned_driver_id: null },
                { assigned_driver_id: '' }
            ]
        };

        const unassignedOrders = await db.collection('orders')
            .find(unassignedQuery)
            .sort({ createdAt: -1 })
            .toArray();

        const isDriverOnline = driverUser.status !== 'suspended' && !driverUser.is_blocked && (driverUser.availability === 'available' || (driverUser.availability !== 'off-duty' && driverUser.availability !== 'offline'));

        if (isDriverOnline) {
            const assignedIds = new Set(assigned.map((o: any) => String(o._id || o.id)));
            for (const uOrder of unassignedOrders) {
                if (assignedIds.has(String(uOrder._id || uOrder.id))) continue;

            const oPlantId = uOrder.plant_id ? String(uOrder.plant_id) : null;
            const hasPostcodeRestriction = driverPostcodes.length > 0;
            const postcodeMatches = hasPostcodeRestriction ? matchesPostcode(uOrder.postcode || uOrder.address, driverPostcodes) : true;
            const plantMatches = driverPlantId ? (oPlantId ? driverPlantId === oPlantId : true) : true;

            const isEligible = hasPostcodeRestriction
                ? (postcodeMatches && plantMatches)
                : (driverPlantId ? Boolean(oPlantId && driverPlantId === oPlantId) : !oPlantId);

            if (isEligible) {
                const now = new Date().toISOString();
                const driverMeta = {
                    id: driverIdStr,
                    name: driverUser.full_name || 'Assigned Driver',
                    phone: driverUser.phone || '+44 7700 900123',
                    vehicle: driverUser.vehicle || 'Logistics Van'
                };
                const nextStatus = uOrder.status === 'pending_payment' ? 'pending_payment' : 'collection_scheduled';
                const nextLabel = uOrder.status === 'pending_payment' ? 'Pending Payment' : 'Collection Scheduled';

                await db.collection('orders').updateOne(
                    { _id: uOrder._id },
                    {
                        $set: {
                            assigned_driver_id: driverIdStr,
                            driver: driverMeta,
                            status: nextStatus,
                            statusLabel: nextLabel,
                            updated_at: now
                        }
                    }
                );
                assigned.push({
                    ...uOrder,
                    assigned_driver_id: driverIdStr,
                    driver: driverMeta,
                    status: nextStatus,
                    statusLabel: nextLabel
                });
                assignedIds.add(String(uOrder._id || uOrder.id));
            }
        }
    }

        assigned = await OrderCustomerEnrichmentService.enrichOrders(assigned, db);
        assigned = assigned.map((order: any) => {
            order.id = order.id || order.publicId || String(order._id);
            return this.sanitizeOrder(order);
        });

        const completedQuery = {
            $or: [
                { 'qr_tracking.collectedByDriverId': { $in: driverIds } },
                { 'qr_tracking.deliveredByDriverId': { $in: driverIds } },
                {
                    $and: [
                        driverQuery,
                        { status: { $in: ['laundry_collected', 'delivered', 'completed'] } }
                    ]
                }
            ]
        };

        let completedOrdersRaw = await db.collection('orders')
            .find(completedQuery)
            .sort({ updated_at: -1, delivered_at: -1, 'qr_tracking.collectedAt': -1 })
            .limit(200)
            .toArray();

        completedOrdersRaw = await OrderCustomerEnrichmentService.enrichOrders(completedOrdersRaw, db);

        let completed: any[] = [];
        for (const order of completedOrdersRaw) {
            order.id = order.id || order.publicId || String(order._id);
            const sanitized = this.sanitizeOrder(order);
            const didCollect = driverIds.includes(String(order.qr_tracking?.collectedByDriverId));
            const didDeliver = driverIds.includes(String(order.qr_tracking?.deliveredByDriverId)) ||
                ((order.status === 'delivered' || order.status === 'completed') &&
                 driverIds.includes(String(order.assigned_driver_id)));

            if (didCollect && didDeliver) {
                completed.push({
                    ...sanitized,
                    id: `${order.id}-both`,
                    original_id: order.id,
                    completed_action: 'both',
                    pickup_completed_at: order.qr_tracking?.collectedAt || order.pickup_pin_verified_at || order.updated_at,
                    delivery_completed_at: order.qr_tracking?.deliveredAt || order.delivery_pin_verified_at || order.delivered_at || order.updated_at,
                    completed_at: order.qr_tracking?.deliveredAt || order.delivery_pin_verified_at || order.delivered_at || order.updated_at,
                    is_delivered: true,
                    is_both: true
                });
            } else if (didCollect) {
                completed.push({
                    ...sanitized,
                    id: order.id.endsWith('-pickup') ? order.id : `${order.id}-pickup`,
                    original_id: order.id,
                    completed_action: 'collection',
                    completed_at: order.qr_tracking?.collectedAt || order.pickup_pin_verified_at || order.updated_at,
                    pickup_completed_at: order.qr_tracking?.collectedAt || order.pickup_pin_verified_at || order.updated_at,
                    is_delivered: false
                });
            } else if (didDeliver) {
                completed.push({
                    ...sanitized,
                    id: order.id.endsWith('-delivery') ? order.id : `${order.id}-delivery`,
                    original_id: order.id,
                    completed_action: 'delivery',
                    completed_at: order.qr_tracking?.deliveredAt || order.delivery_pin_verified_at || order.delivered_at || order.updated_at,
                    delivery_completed_at: order.qr_tracking?.deliveredAt || order.delivery_pin_verified_at || order.delivered_at || order.updated_at,
                    is_delivered: true
                });
            } else {
                completed.push({
                    ...sanitized,
                    completed_action: order.status === 'delivered' || order.status === 'completed' ? 'delivery' : 'collection',
                    completed_at: order.qr_tracking?.deliveredAt || order.qr_tracking?.collectedAt || order.updated_at,
                    is_delivered: order.status === 'delivered' || order.status === 'completed'
                });
            }
        }

        const deliveryQuery: any = {
            status: { $in: ['ready_for_delivery', 'qc_passed'] }
        };
        if (driverPlantId) {
            deliveryQuery.$or = [
                { plant_id: driverPlantId },
                { plant_id: { $exists: false } },
                { plant_id: null },
                { plant_id: '' }
            ];
        }

        let available_deliveries = await db.collection('orders')
            .find(deliveryQuery)
            .sort({ updated_at: -1 })
            .toArray();
        
        if (driverPostcodes.length > 0) {
            available_deliveries = available_deliveries.filter((o: any) => 
                matchesPostcode(o.postcode || o.address, driverPostcodes)
            );
        }

        available_deliveries = await Promise.all(available_deliveries.map(async (order: any) => {
            if (order.customer_id) {
                const cust = await db.collection('users').findOne({ _id: order.customer_id });
                if (cust) { order.customer_name = cust.full_name; order.customer_phone = cust.phone; }
            }
            return this.sanitizeOrder(order);
        }));

        return {
            driver: {
                id: String(driverUser._id),
                name: driverUser.full_name,
                email: driverUser.email,
                phone: driverUser.phone,
                vehicle: driverUser.vehicle,
                vehicle_type: driverUser.vehicle_type || '',
                vehicle_reg: driverUser.vehicle_reg || '',
                license_number: driverUser.license_number || '',
                emergency_contact: driverUser.emergency_contact || null,
                employee_number: driverUser.employee_number || driverUser.employeeNumber || `EMP-${String(driverUser._id).substring(String(driverUser._id).length - 4).toUpperCase()}`,
                availability: driverUser.availability || 'available',
                is_active: driverUser.status !== 'suspended' && !driverUser.is_blocked && (driverUser.availability === 'available' || (driverUser.availability !== 'off-duty' && driverUser.availability !== 'offline')),
                plant_id: driverUser.plant_id,
                rating: driverUser.rating || 4.8,
                assigned_postcodes: driverPostcodes
            },
            assigned,
            completed,
            available_deliveries
        };
    }

    static async updateAvailability(driverId: string, isAvailable: boolean) {
        const db = await getDb();
        const { driverUser } = await this.getDriverIdentifiers(driverId);
        if (!driverUser) {
            throw new NotFoundError('Driver account not found.');
        }

        const now = new Date().toISOString();
        const nextAvailability = isAvailable ? 'available' : 'off-duty';
        await db.collection('users').updateOne(
            { _id: driverUser._id },
            { 
                $set: { 
                    availability: nextAvailability, 
                    is_active: true, 
                    updated_at: now 
                } 
            }
        );

        let queuedAssigned = 0;
        if (isAvailable) {
            queuedAssigned = await this.assignQueuedOrdersToDriver(String(driverUser._id));
        }

        return {
            success: true,
            isAvailable,
            availability: nextAvailability,
            queuedAssigned
        };
    }

    static async assignQueuedOrdersToDriver(driverId: string): Promise<number> {
        const db = await getDb();
        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        if (!driverUser || driverUser.role !== 'driver') return 0;

        // Ensure driver is on duty and not suspended before assigning
        if (driverUser.status === 'suspended' || driverUser.is_blocked || driverUser.availability === 'off-duty' || driverUser.availability === 'offline') {
            return 0;
        }

        const driverIdStr = String(driverUser._id || driverId);
        const driverPlantId = driverUser.plant_id ? String(driverUser.plant_id) : null;
        const driverPostcodes: string[] = driverUser.assigned_postcodes || driverUser.assignedSectors || [];
        const now = new Date().toISOString();

        const driverMeta = {
            id: driverIdStr,
            name: driverUser.full_name || 'Assigned Driver',
            phone: driverUser.phone || '+44 7700 900123',
            vehicle: driverUser.vehicle || 'Logistics Van'
        };

        const unassignedFilter = {
            $or: [
                { assigned_driver_id: { $exists: false } },
                { assigned_driver_id: null },
                { assigned_driver_id: '' }
            ]
        };

        const queuedOrders = await db.collection('orders').find({
            ...unassignedFilter,
            status: {
                $in: [
                    'waiting_for_driver',
                    'booking_confirmed',
                    'order_placed',
                    'collection_scheduled',
                    'ready_for_delivery',
                    'qc_passed'
                ]
            }
        }).sort({ createdAt: 1, updated_at: 1 }).toArray();

        let assignedCount = 0;

        for (const order of queuedOrders) {
            const rejectedIds = (order.rejected_driver_ids || []).map((id: any) => String(id));
            if (rejectedIds.some((rId: string) => driverIds.includes(rId))) {
                continue;
            }

            const oPlantId = order.plant_id ? String(order.plant_id) : null;
            const hasPostcodeRestriction = driverPostcodes.length > 0;
            const postcodeMatches = hasPostcodeRestriction ? matchesPostcode(order.postcode || order.address, driverPostcodes) : true;
            const plantMatches = driverPlantId ? (oPlantId ? driverPlantId === oPlantId : true) : true;

            const isEligible = hasPostcodeRestriction
                ? (postcodeMatches && plantMatches)
                : (driverPlantId ? Boolean(oPlantId && driverPlantId === oPlantId) : !oPlantId);

            if (isEligible) {
                const isDelivery = ['ready_for_delivery', 'qc_passed'].includes(order.status) ||
                    Boolean(order.processed_at || order.received_at_plant_at || order.qr_tracking?.intakeAt);

                const nextStatus = isDelivery ? 'ready_for_delivery' : (order.status === 'pending_payment' ? 'pending_payment' : 'collection_scheduled');
                const nextLabel = isDelivery ? 'Ready for Delivery' : (order.status === 'pending_payment' ? 'Pending Payment' : 'Collection Scheduled');
                const eventName = isDelivery ? 'delivery_driver_assigned' : 'driver_assigned';
                const eventLabel = isDelivery 
                    ? `Delivery Driver Assigned from Queue: ${driverMeta.name}`
                    : `Pickup Driver Assigned from Queue: ${driverMeta.name}`;

                await db.collection('orders').updateOne(
                    { _id: order._id },
                    {
                        $set: {
                            assigned_driver_id: driverIdStr,
                            driver: driverMeta,
                            status: nextStatus,
                            statusLabel: nextLabel,
                            updated_at: now
                        },
                        $push: {
                            timeline_events: {
                                event: eventName,
                                label: eventLabel,
                                actor: 'system',
                                actorId: 'system',
                                driverId: driverIdStr,
                                driverName: driverMeta.name,
                                timestamp: now
                            }
                        } as any
                    }
                );

                await db.collection('users').updateOne(
                    { _id: driverUser._id },
                    { $set: { last_assigned_at: now } }
                );

                await NotificationService.createNotification({
                    userId: driverIdStr,
                    title: isDelivery ? '🚚 New Delivery Assignment' : '📦 New Pickup Assignment',
                    message: `You have been assigned queued order #${order.id || order.publicId || order._id} for ${isDelivery ? 'delivery' : 'collection'}.`,
                    type: 'driver_assignment',
                    orderId: order.id || order.publicId || String(order._id)
                }).catch(() => {});

                assignedCount++;
            }
        }

        return assignedCount;
    }

    // ==========================================
    // 2. COLLECTION WORKFLOW (Customer -> Plant)
    // ==========================================

    static async rejectJob(driverId: string, orderId: string, reason?: string) {
        const db = await getDb();
        const now = new Date().toISOString();

        const order = await db.collection('orders').findOne({ $or: [{ id: orderId }, { _id: orderId as any }] });
        if (!order) throw new NotFoundError('Order not found.');
        
        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        if (!driverIds.includes(String(order.assigned_driver_id)) && !driverIds.includes(String(order.driver?.id))) {
            throw new ForbiddenError('You can only reject your own assignments.');
        }

        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: {
                    assigned_driver_id: null,
                    driver: null,
                    status: 'booking_confirmed',
                    statusLabel: 'Booking Confirmed',
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: 'driver_rejected',
                        label: 'Driver Rejected Assignment',
                        actor: 'driver',
                        actorId: driverId,
                        reason: reason || 'Not provided',
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId,
            action: 'driver_assignment_rejected',
            actorId: driverId,
            actorRole: 'driver',
            before: { assigned_driver_id: order.assigned_driver_id, status: order.status },
            after: { assigned_driver_id: null, status: 'booking_confirmed' },
            reason
        });
    }

    static async sendOtp(driverId: string, orderId: string) {
        const db = await getDb();
        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        
        if (!order) throw new NotFoundError('Order not found.');
        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver && driverIds.includes(String(order.driver.id))) ||
            (['ready_for_delivery', 'qc_passed'].includes(order.status) && !order.assigned_driver_id);

        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }

        const isDelivery = ['ready_for_delivery', 'qc_passed', 'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery'].includes(order.status);

        // Always create customer in-app notification reminding them to check their app for their PIN
        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: isDelivery ? '🔑 Delivery PIN Requested' : '🔑 Pickup PIN Requested',
                message: isDelivery 
                    ? `Your driver is arriving for order #${orderId}. Please show them your secure in-app Delivery PIN from your order details.`
                    : `Your driver is arriving for order #${orderId}. Please show them your secure in-app Collection PIN from your order details.`,
                type: 'otp_sent',
                orderId
            });
        }

        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { _id: order._id },
            { 
                $push: { 
                    timeline_events: { 
                        event: isDelivery ? 'delivery_pin_requested' : 'pickup_pin_requested', 
                        label: isDelivery ? 'Delivery PIN requested by driver' : 'Pickup PIN requested by driver', 
                        actor: 'driver', 
                        actorId: driverId, 
                        timestamp: now 
                    } 
                } as any 
            }
        );

        return { success: true };
    }

    /**
     * Records a failed pickup attempt at the customer doorstep, preventing illegal progression.
     */
    static async recordPickupFailure(params: {
        driverId: string;
        orderId: string;
        reason: PickupFailureReason;
        notes?: string;
        photoUrl?: string;
        location?: { lat: number; lng: number };
    }) {
        const { driverId, orderId, reason, notes, photoUrl, location } = params;

        if (!orderId || !reason) {
            throw new BadRequestError('Order ID and a valid failure reason are strictly required.');
        }

        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');

        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));

        if (!isOwner) {
            throw new ForbiddenError('You can only log attempts for your own assigned pickups.');
        }

        assertValidTransition(order.status, 'pickup_failed', 'driver', { reason, photoUrl });

        const now = new Date().toISOString();
        const driverName = driverUser?.full_name || order.driver?.name || 'Courier Driver';

        const attemptId = generatePickupAttemptId();
        const attemptRecord: PickupAttemptRecord = {
            id: attemptId,
            publicId: attemptId,
            orderId,
            driverId,
            driverName,
            attemptTimestamp: now,
            success: false,
            reason,
            notes,
            photoUrl,
            location,
            instructionUsed: order.pickupInstructionType || 'IN_PERSON',
            createdAt: now
        };

        // 1. Save to dedicated pickup_attempts collection
        await db.collection('pickup_attempts').insertOne(attemptRecord as any);

        // 2. If photo provided, record evidence
        if (photoUrl) {
            await EvidenceService.recordEvidence({
                orderId,
                type: 'pickup_photo',
                uploadedBy: driverId,
                uploadedByRole: 'driver',
                url: photoUrl
            }).catch(e => console.warn('Evidence recording error:', e.message));
        }

        // 3. Update order state to pickup_failed
        const newAttemptsCount = (order.pickupAttemptsCount || 0) + 1;
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    status: 'pickup_failed',
                    statusLabel: 'Pickup Attempt Failed',
                    pickupAttemptsCount: newAttemptsCount,
                    lastPickupFailureReason: reason,
                    lastPickupFailureNotes: notes,
                    updated_at: now
                },
                $push: {
                    pickupAttempts: attemptRecord,
                    timeline_events: {
                        event: 'pickup_failed',
                        label: `Pickup Attempt Failed: ${reason.replace(/_/g, ' ').toUpperCase()}`,
                        actor: 'driver',
                        actorId: driverId,
                        driverName,
                        reason,
                        notes,
                        photoUrl,
                        location,
                        timestamp: now
                    }
                } as any
            }
        );

        // 4. Create central operational exception for Plant Manager review
        await ExceptionService.createException({
            orderId,
            orderNumber: order.id,
            type: 'pickup_failed',
            priority: 'medium',
            plantId: order.plant_id,
            description: `Driver ${driverName} reported pickup failure for #${orderId} (${reason}). Notes: ${notes || 'None'}`,
            evidence: {
                driverId,
                driverName,
                reason,
                notes,
                photoUrl,
                location
            }
        });

        // 5. Notify Customer with clear action requirement
        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: '⚠️ Collection Attempted - Action Required',
                message: `Our courier arrived for order #${orderId} but was unable to collect your laundry (${reason.replace(/_/g, ' ')}). Please visit your order details to reschedule your pickup slot.`,
                type: 'pickup_failed',
                orderId
            });
        }

        // 6. Log audit event
        await AuditService.recordOrderEvent({
            orderId,
            action: 'driver_pickup_failed',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'pickup_failed' },
            reason,
            metadata: { notes, photoUrl, location }
        });

        return { success: true, attempt: attemptRecord };
    }

    private static verifyOrderVerificationPin(
        submittedPin: string,
        order: any,
        type: 'pickup' | 'delivery'
    ): { valid: boolean; error?: string } {
        if (!submittedPin || typeof submittedPin !== 'string') {
            return { valid: false, error: 'A valid numeric PIN is required.' };
        }
        const cleanPin = submittedPin.trim();

        // Prevent reuse if already verified/consumed
        if (type === 'pickup') {
            if (order.pickup_pin_verified_at || ['laundry_collected', 'received_at_facility', 'sorting', 'washing', 'ready_for_delivery', 'qc_passed', 'delivered', 'completed'].includes(order.status)) {
                return { valid: false, error: 'Pickup PIN has already been verified for this order.' };
            }
        } else {
            if (order.delivery_pin_verified_at || ['delivered', 'completed'].includes(order.status)) {
                return { valid: false, error: 'Delivery PIN has already been verified for this order.' };
            }
        }

        const attempts = type === 'pickup'
            ? (order.pickup_pin_attempts || order.pickup_otp_attempts || 0)
            : (order.delivery_pin_attempts || order.delivery_otp_attempts || 0);

        const isLocked = type === 'pickup'
            ? order.pickup_pin_locked === true
            : order.delivery_pin_locked === true;

        if (isLocked || attempts >= 5) {
            return {
                valid: false,
                error: 'Security Lockout: Too many incorrect PIN attempts. This order PIN is locked. Contact dispatch support.'
            };
        }

        const orderIdCandidates = [
            order.id,
            order.publicId,
            order.orderNumber,
            order.orderId,
            order._id ? String(order._id) : null
        ].filter(Boolean).map(String);

        const custIdCandidates = [
            order.customer_id,
            order.customerId,
            order.userId,
            order.user_id,
            order.auth0UserId,
            order.auth0_sub,
            order.auth0Id
        ].filter(Boolean).map(String);

        // 1. Try decrypting AES encrypted payload if stored
        const encPayload = type === 'pickup' ? order.pickup_pin_enc : order.delivery_pin_enc;
        if (encPayload) {
            for (const oId of orderIdCandidates) {
                for (const cId of custIdCandidates) {
                    const decrypted = decryptOrderPin(encPayload, oId, cId);
                    if (decrypted && decrypted.trim() === cleanPin) {
                        return { valid: true };
                    }
                }
            }
        }

        // 2. Try HMAC hash verification across candidate (orderId, customerId) pairs
        const expectedHash = type === 'pickup' ? order.pickup_pin_hash : order.delivery_pin_hash;
        const salt = type === 'pickup' ? order.pickup_pin_salt : order.delivery_pin_salt;

        if (expectedHash && salt) {
            for (const oId of orderIdCandidates) {
                for (const cId of custIdCandidates) {
                    const computedHash = hashOrderPin(cleanPin, salt, oId, cId);
                    const compBuf = Buffer.from(computedHash, 'utf8');
                    const expBuf = Buffer.from(expectedHash, 'utf8');
                    if (compBuf.length === expBuf.length && crypto.timingSafeEqual(compBuf, expBuf)) {
                        return { valid: true };
                    }
                }
            }
        }

        // 3. Constant-time comparison for plaintext PINs (unencrypted / legacy orders)
        const plaintextPin = type === 'pickup'
            ? (order.pickup_pin || order.pickup_otp)
            : (order.delivery_pin || order.delivery_otp);

        if (plaintextPin) {
            const plainStr = String(plaintextPin).trim();
            const plainBuf = Buffer.from(plainStr, 'utf8');
            const inputBuf = Buffer.from(cleanPin, 'utf8');
            if (plainBuf.length === inputBuf.length && crypto.timingSafeEqual(plainBuf, inputBuf)) {
                return { valid: true };
            }
        }

        if (!expectedHash && !encPayload && !plaintextPin) {
            return { valid: false, error: `No active ${type} PIN found for this order.` };
        }

        const remaining = 5 - (attempts + 1);
        return {
            valid: false,
            error: remaining > 0
                ? `Incorrect ${type === 'pickup' ? 'Collection' : 'Delivery'} PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`
                : 'Incorrect PIN. Attempt limit reached. Order verification PIN is now locked.'
        };
    }

    static async confirmPickup(
        driverId: string,
        orderId: string,
        otp: string,
        qrTagId: string = '',
        bagCount: number = 1,
        photoUrls: string[] = [],
        declaredPieceCount?: number | { pieceCount?: number; notes?: string; location?: { lat: number; lng: number } },
        notes?: string,
        location?: { lat: number; lng: number }
    ) {
        let pieceCountVal: number | undefined;
        let notesVal: string | undefined = notes;
        let locationVal: { lat: number; lng: number } | undefined = location;

        if (declaredPieceCount && typeof declaredPieceCount === 'object') {
            const opts = declaredPieceCount as any;
            pieceCountVal = opts.pieceCount;
            notesVal = opts.notes || notes;
            locationVal = opts.location || location;
        } else if (typeof declaredPieceCount === 'number') {
            pieceCountVal = declaredPieceCount;
        }

        const db = await getDb();
        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new NotFoundError('Order not found.');
        
        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));
        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }
        
        // Idempotency: if already picked up, just return success
        if (['laundry_collected', 'received_at_facility', 'sorting', 'washing'].includes(order.status)) {
            return { success: true, message: 'Pickup already confirmed.' };
        }

        // Validate current order status is pickup-eligible
        const validPickupStatuses = ['booking_confirmed', 'collection_scheduled', 'waiting_for_driver', 'driver_assigned', 'pickup_in_progress', 'pickup_failed'];
        if (!validPickupStatuses.includes(order.status)) {
            throw new BadRequestError(`Cannot confirm pickup. Order is in '${order.status}' stage.`);
        }

        const verifyResult = this.verifyOrderVerificationPin(otp, order, 'pickup');

        if (!verifyResult.valid) {
            const currentAttempts = order.pickup_pin_attempts || order.pickup_otp_attempts || 0;
            const newAttempts = currentAttempts + 1;
            const willLock = newAttempts >= 5;
            await db.collection('orders').updateOne(
                { _id: order._id },
                { 
                    $set: {
                        pickup_pin_attempts: newAttempts,
                        pickup_otp_attempts: newAttempts,
                        pickup_pin_locked: willLock
                    }
                }
            );

            await AuditService.recordOrderEvent({
                orderId: order.id,
                action: willLock ? 'pickup_pin_locked' : 'pickup_pin_attempt_failed',
                actorId: driverId,
                actorRole: 'driver',
                reason: verifyResult.error,
                metadata: { attempt: newAttempts, willLock }
            });

            if (willLock) {
                // Raise operational exception for locked PIN
                await ExceptionService.createException({
                    orderId: order.id,
                    orderNumber: order.id,
                    type: 'PIN_locked',
                    priority: 'high',
                    plantId: order.plant_id,
                    description: `Pickup PIN locked after 5 failed attempts at customer doorstep. Dispatch override required.`
                }).catch(e => console.warn('Exception raise warning:', e.message));
            }

            throw new BadRequestError(verifyResult.error || 'Invalid PIN.');
        }

        const now = new Date().toISOString();
        const driverName = driverUser?.full_name || order.driver?.name || 'Assigned Driver';

        // Verify QR Tag integrity
        if (qrTagId) {
            const tagInUse = await db.collection('orders').findOne({ 
                'qr_tracking.qrTagId': qrTagId, 
                id: { $ne: orderId },
                status: { $nin: ['delivered', 'completed', 'cancelled'] } 
            });
            if (tagInUse) {
                throw new BadRequestError(`QR tag ${qrTagId} is already assigned to another active order.`);
            }
        }

        // 1. Record successful attempt in pickup_attempts collection
        const attemptId = generatePickupAttemptId();
        await db.collection('pickup_attempts').insertOne({
            id: attemptId,
            publicId: attemptId,
            orderId,
            driverId,
            driverName,
            attemptTimestamp: now,
            success: true,
            photoUrl: (photoUrls && photoUrls.length > 0) ? photoUrls[0] : undefined,
            location: locationVal,
            pieceCount: pieceCountVal || order.declaredItemCount || order.itemCount || 0,
            bagQr: qrTagId,
            instructionUsed: order.pickupInstructionType || 'IN_PERSON',
            notes: notesVal,
            createdAt: now
        } as any);

        // 2. Record evidence if photos provided
        if (photoUrls && photoUrls.length > 0) {
            for (const url of photoUrls) {
                await EvidenceService.recordEvidence({
                    orderId,
                    type: 'pickup_photo',
                    uploadedBy: driverId,
                    uploadedByRole: 'driver',
                    url
                }).catch(e => console.warn('Evidence recording error:', e.message));
            }
        }

        // 3. Atomically confirm pickup and wipe pickup PIN / OTP to prevent reuse
        const result = await db.collection('orders').updateOne(
            { 
                _id: order._id,
                status: { $in: validPickupStatuses }
            },
            {
                $set: {
                    status: 'laundry_collected',
                    statusLabel: 'Laundry Collected',
                    pickedUpAt: now,
                    updated_at: now,
                    declaredItemCount: pieceCountVal || order.declaredItemCount || order.itemCount || 0,
                    pickup_otp: null, // Invalidate immediately
                    pickup_pin_hash: null, // Invalidate immediately
                    pickup_pin_salt: null,
                    pickup_pin_enc: null,
                    pickup_pin_verified_at: now,
                    pickup_otp_verified_at: now,
                    bag_id: qrTagId || order.bag_id || order.qr_tracking?.qrTagId || generateBagId(),
                    'qr_tracking.qrTagId': qrTagId || order.qr_tracking?.qrTagId || order.bag_id || generateBagId(),
                    'qr_tracking.collectedByDriverId': driverId,
                    'qr_tracking.collectedAt': now,
                    'qr_tracking.bagCount': bagCount || 1,
                    'qr_tracking.collectionPhotos': photoUrls || [],
                    'qr_tracking.pickupPhoto': (photoUrls && photoUrls.length > 0) ? photoUrls[0] : null,
                    'evidence.pickupPhotos': photoUrls || [],
                    'evidence.pickupPhotoUrl': (photoUrls && photoUrls.length > 0) ? photoUrls[0] : null,
                    'evidence.pickupDriverName': driverName,
                    'evidence.pickupVerifiedAt': now,
                    'evidence.bagQrCode': qrTagId || order.qr_tracking?.qrTagId || order.bag_id || order.bagQrCode || generateBagId(),
                    'evidence.declaredPieceCount': declaredPieceCount || order.declaredItemCount || order.itemCount || 0
                },
                $push: {
                    timeline_events: {
                        event: 'laundry_collected',
                        label: `Laundry Collected by Driver (${declaredPieceCount || order.itemCount || 1} items declared, PIN & Photo Verified)`,
                        actor: 'driver',
                        actorId: driverId,
                        qrTagId,
                        declaredPieceCount,
                        photoUrl: (photoUrls && photoUrls.length > 0) ? photoUrls[0] : undefined,
                        timestamp: now
                    }
                } as any
            }
        );

        if (result.matchedCount === 0) {
            throw new BadRequestError('Pickup confirmation failed. Order status may have changed concurrently.');
        }

        if (qrTagId) {
            await db.collection('qr_tags').updateOne(
                { qrId: qrTagId }, 
                { $set: { status: 'in_use', orderId, lastUsedAt: now } },
                { upsert: true }
            );
        }

        // Notify Customer
        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: '🧺 Laundry Picked Up',
                message: `Your laundry for order #${orderId} has been collected and is heading to our processing facility.`,
                type: 'order_collected',
                orderId
            });
        }

        // Recalculate SLA
        await SlaService.checkAndEscalateSla(orderId).catch(e => console.warn('SLA calc error:', e.message));

        await AuditService.recordOrderEvent({
            orderId,
            action: 'laundry_collected',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'laundry_collected' },
            metadata: { qrTagId, declaredPieceCount, photoUrls }
        });

        return { success: true };
    }

    static async markArrived(driverId: string, orderId: string) {
        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');
        const { driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));
        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }

        if (order.status === 'pickup_in_progress') return { success: true };

        const allowed = ['booking_confirmed', 'collection_scheduled', 'driver_assigned'];
        if (!allowed.includes(order.status)) {
            throw new BadRequestError(`Cannot mark arrived in stage '${order.status}'.`);
        }

        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: { status: 'pickup_in_progress', statusLabel: 'Arrived at Customer', updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'driver_arrived',
                        label: 'Driver Arrived at Customer Location',
                        actor: 'driver',
                        actorId: driverId,
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId,
            action: 'driver_arrived_at_pickup',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'pickup_in_progress' }
        });
        return { success: true };
    }

    static async confirmHandover(driverId: string, orderId: string, packageQr: string) {
        const db = await getDb();
        const { driverIds } = await this.getDriverIdentifiers(driverId);

        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');

        const didCollect = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id))) ||
            (order.qr_tracking?.collectedByDriverId && driverIds.includes(String(order.qr_tracking.collectedByDriverId)));

        if (!didCollect) {
            throw new ForbiddenError('Access denied: You are not the driver assigned to this order.');
        }

        const allowedCurrentStatuses = ['laundry_collected', 'picked_up', 'pickup_in_progress', 'driver_assigned', 'in_transit'];
        if (!allowedCurrentStatuses.includes(order.status)) {
            throw new BadRequestError(`Cannot handover order in stage '${order.status}'. Must be collected first.`);
        }

        const now = new Date().toISOString();

        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    status: 'received_at_facility',
                    statusLabel: 'Received at Facility',
                    'qr_tracking.packageQr': packageQr,
                    'qr_tracking.handedOverToPlantAt': now,
                    'qr_tracking.handedOverByDriverId': driverId,
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: 'order_received_at_facility',
                        label: 'Laundry Handed Over to Plant Facility',
                        actor: 'driver',
                        actorId: driverId,
                        timestamp: now,
                        meta: { packageQr }
                    }
                } as any
            }
        );

        // Notify customer
        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: '🏢 Arrived at Processing Facility',
                message: `Your laundry for order #${orderId} has been checked in at our facility and is being prepped for washing.`,
                type: 'order_update',
                orderId
            });
        }

        await AuditService.recordOrderEvent({
            orderId,
            action: 'driver_handover_confirmed',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: order.status },
            metadata: { packageQr }
        });

        return { success: true };
    }

    // ==========================================
    // 3. DELIVERY WORKFLOW (Plant -> Customer)
    // ==========================================

    static async acceptDelivery(driverId: string, orderId: string) {
        const db = await getDb();
        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new NotFoundError('Order not found.');
        
        const validStatuses = ['ready_for_delivery', 'qc_passed'];
        if (!validStatuses.includes(order.status)) {
            throw new BadRequestError('Order is not currently waiting for a delivery driver.');
        }

        // Driver must cover the postcode
        const { driverUser: driver, driverIds } = await this.getDriverIdentifiers(driverId);
        const driverPostcodes = driver?.assigned_postcodes || driver?.assignedSectors || [];
        if (driverPostcodes.length > 0 && !matchesPostcode(order.postcode || order.address, driverPostcodes)) {
            throw new ForbiddenError('You are not assigned to the postcode area for this delivery.');
        }

        const now = new Date().toISOString();
        const primaryDriverId = driver?._id ? String(driver._id) : driverId;

        // Atomic update to avoid race condition where two drivers accept simultaneously
        const result = await db.collection('orders').updateOne(
            { 
                _id: order._id,
                status: { $in: validStatuses },
                $or: [
                    { assigned_driver_id: null },
                    { assigned_driver_id: { $exists: false } },
                    { assigned_driver_id: { $in: driverIds } }
                ]
            },
            {
                $set: {
                    assigned_driver_id: primaryDriverId,
                    driver: { id: primaryDriverId, name: driver?.full_name, phone: driver?.phone },
                    status: 'delivery_driver_assigned',
                    statusLabel: 'Delivery Driver Assigned',
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: 'delivery_driver_assigned',
                        label: 'Delivery Driver Accepted Job',
                        actor: 'driver',
                        actorId: driverId,
                        timestamp: now
                    }
                } as any
            }
        );

        if (result.matchedCount === 0) {
            throw new BadRequestError('This delivery has already been accepted by another driver.');
        }

        await AuditService.recordOrderEvent({
            orderId,
            action: 'delivery_driver_assigned',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status, assigned_driver_id: order.assigned_driver_id },
            after: { status: 'delivery_driver_assigned', assigned_driver_id: driverId }
        });

        return { success: true };
    }

    static async rejectDelivery(driverId: string, orderId: string, reason?: string) {
        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');
        const { driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));
        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }

        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    assigned_driver_id: null,
                    driver: null,
                    status: 'ready_for_delivery',
                    statusLabel: 'Ready for Delivery',
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: 'delivery_driver_rejected',
                        label: 'Delivery Driver Cancelled Job',
                        actor: 'driver',
                        actorId: driverId,
                        reason: reason || 'No reason provided',
                        timestamp: now
                    }
                } as any
            }
        );
    }

    static async confirmPackageHandover(driverId: string, orderId: string, packageQr: string) {
        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');
        const { driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));
        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }
        
        if (order.status === 'package_collected_for_delivery') return { success: true };

        const orderQr = order.qr_code || order.package?.qr_code || order.packageQr;
        if (orderQr && packageQr && orderQr !== packageQr) {
            throw new BadRequestError('Scan mismatch: QR code does not match the order package tag.');
        }

        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    status: 'package_collected_for_delivery',
                    statusLabel: 'Package Collected for Delivery',
                    updated_at: now,
                    'qr_tracking.dispatchedByDriverId': driverId,
                    'qr_tracking.dispatchedAt': now
                },
                $push: {
                    timeline_events: {
                        event: 'package_collected_for_delivery',
                        label: 'Package handover confirmed via QR scan',
                        actor: 'driver',
                        actorId: driverId,
                        packageQr,
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId,
            action: 'package_collected_for_delivery',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'package_collected_for_delivery' },
            metadata: { packageQr }
        });

        return { success: true };
    }

    static async startDelivery(driverId: string, orderId: string) {
        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');
        const { driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));
        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }
        if (order.status === 'out_for_delivery') return { success: true };

        const allowed = ['ready_for_delivery', 'delivery_driver_assigned', 'package_collected_for_delivery'];
        if (!allowed.includes(order.status)) {
            throw new BadRequestError(`Cannot start delivery while order is in '${order.status}' stage.`);
        }

        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: { status: 'out_for_delivery', statusLabel: 'Out for Delivery', updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'out_for_delivery',
                        label: 'Order is out for delivery',
                        actor: 'driver',
                        actorId: driverId,
                        timestamp: now
                    }
                } as any
            }
        );

        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: '🚚 Out for Delivery',
                message: `Good news! Your laundry order #${orderId} is out for delivery. When your driver arrives, show them your secure in-app Delivery PIN located in your order details.`,
                type: 'delivery',
                orderId,
            });
        }

        await AuditService.recordOrderEvent({
            orderId,
            action: 'out_for_delivery',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'out_for_delivery' }
        });

        return { success: true };
    }

    /**
     * Records a failed delivery attempt at the customer doorstep, preventing premature completion.
     */
    static async recordDeliveryFailure(params: {
        driverId: string;
        orderId: string;
        reason: DeliveryFailureReason;
        notes?: string;
        photoUrl?: string;
        location?: { lat: number; lng: number };
    }) {
        const { driverId, orderId, reason, notes, photoUrl, location } = params;

        if (!orderId || !reason) {
            throw new BadRequestError('Order ID and a valid delivery failure reason are strictly required.');
        }

        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found.');

        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id)));

        if (!isOwner) {
            throw new ForbiddenError('You can only log delivery attempts for your own assignments.');
        }

        assertValidTransition(order.status, 'delivery_failed', 'driver', { reason, photoUrl });

        const now = new Date().toISOString();
        const driverName = driverUser?.full_name || order.driver?.name || 'Courier Driver';

        const attemptId = generateDeliveryAttemptId();
        const attemptRecord: DeliveryAttemptRecord = {
            id: attemptId,
            publicId: attemptId,
            orderId,
            driverId,
            driverName,
            attemptTimestamp: now,
            success: false,
            reason,
            notes,
            photoUrl,
            location,
            instructionUsed: order.deliveryInstructionType || 'IN_PERSON',
            verificationMethod: 'PHOTO',
            createdAt: now
        };

        // 1. Record in delivery_attempts collection
        await db.collection('delivery_attempts').insertOne(attemptRecord as any);

        // 2. Save evidence if photo provided
        if (photoUrl) {
            await EvidenceService.recordEvidence({
                orderId,
                type: 'delivery_photo',
                uploadedBy: driverId,
                uploadedByRole: 'driver',
                url: photoUrl
            }).catch(e => console.warn('Evidence recording error:', e.message));
        }

        // 3. Update order state to delivery_failed
        const newAttemptsCount = (order.deliveryAttemptsCount || 0) + 1;
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    status: 'delivery_failed',
                    statusLabel: 'Delivery Attempt Failed',
                    deliveryAttemptsCount: newAttemptsCount,
                    lastDeliveryFailureReason: reason,
                    lastDeliveryFailureNotes: notes,
                    updated_at: now
                },
                $push: {
                    deliveryAttempts: attemptRecord,
                    timeline_events: {
                        event: 'delivery_failed',
                        label: `Delivery Attempt Failed: ${reason.replace(/_/g, ' ').toUpperCase()}`,
                        actor: 'driver',
                        actorId: driverId,
                        driverName,
                        reason,
                        notes,
                        photoUrl,
                        location,
                        timestamp: now
                    }
                } as any
            }
        );

        // 4. Create central operational exception for Plant Manager & Dispatch review
        await ExceptionService.createException({
            orderId,
            orderNumber: order.id,
            type: 'delivery_failed',
            priority: 'high',
            plantId: order.plant_id,
            description: `Driver ${driverName} reported delivery failure for #${orderId} (${reason}). Notes: ${notes || 'None'}`,
            evidence: {
                driverId,
                driverName,
                reason,
                notes,
                photoUrl,
                location
            }
        });

        // 5. Notify Customer
        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: '📦 Delivery Attempted - Action Required',
                message: `Our courier attempted to deliver your clean garments for order #${orderId} but could not complete handover (${reason.replace(/_/g, ' ')}). Please visit your order details to confirm a new delivery window.`,
                type: 'delivery_failed',
                orderId
            });
        }

        // 6. Log audit event
        await AuditService.recordOrderEvent({
            orderId,
            action: 'driver_delivery_failed',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'delivery_failed' },
            reason,
            metadata: { notes, photoUrl, location }
        });

        return { success: true, attempt: attemptRecord };
    }

    static async confirmDelivery(
        driverId: string,
        orderId: string,
        deliveryPin?: string,
        signatureUrl?: string,
        photoUrls?: string[],
        recipientName?: string | { recipientName?: string; amountCollected?: number; codPaymentMethod?: string; location?: { lat: number; lng: number } },
        codCollectedAmount?: number,
        location?: { lat: number; lng: number }
    ) {
        let recipientNameVal: string | undefined;
        let codCollectedAmountVal: number | undefined = codCollectedAmount;
        let locationVal: { lat: number; lng: number } | undefined = location;

        if (recipientName && typeof recipientName === 'object') {
            const opts = recipientName as any;
            recipientNameVal = opts.recipientName;
            codCollectedAmountVal = opts.amountCollected ?? codCollectedAmount;
            locationVal = opts.location || location;
        } else if (typeof recipientName === 'string') {
            recipientNameVal = recipientName;
        }

        const db = await getDb();
        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new NotFoundError('Order not found.');
        const { driverUser, driverIds } = await this.getDriverIdentifiers(driverId);
        const isOwner = driverIds.includes(String(order.assigned_driver_id)) ||
            (order.driver?.id && driverIds.includes(String(order.driver.id))) ||
            (['ready_for_delivery', 'qc_passed'].includes(order.status) && !order.assigned_driver_id);

        if (!isOwner) {
            throw new ForbiddenError('You do not own this assignment.');
        }
        
        // Idempotency: if already delivered, return success
        if (order.status === 'delivered' || order.status === 'completed') return { success: true };

        const allowedStatuses = [
            'ready_for_delivery',
            'qc_passed',
            'out_for_delivery',
            'package_collected_for_delivery',
            'delivery_driver_assigned',
            'delivery_driver_accepted',
            'delivery_attempted',
            'delivery_failed'
        ];
        if (!allowedStatuses.includes(order.status)) {
            throw new BadRequestError(`Order cannot be completed from '${order.status}' stage.`);
        }

        const deliveryInstruction = (order.deliveryInstructionType || order.deliveryInstruction || 'IN_PERSON').toUpperCase();
        let verificationMethod: 'PIN' | 'PHOTO' | 'RECEPTION_SIGNATURE' = 'PIN';

        // -------------------------------------------------------------
        // INSTRUCTION-BASED VERIFICATION
        // -------------------------------------------------------------
        if (deliveryInstruction === 'LEAVE_AT_DOOR') {
            // LEAVE-AT-DOOR: Customer authorized. Does NOT require customer physically present / PIN.
            // Requires mandatory delivery photograph!
            if (!photoUrls || photoUrls.length === 0) {
                throw new BadRequestError('Customer requested Leave at Door: A clear delivery photograph showing the parcel at the door is strictly mandatory.');
            }
            verificationMethod = 'PHOTO';
        } else if (deliveryInstruction === 'RECEPTION_PORTER') {
            // RECEPTION / PORTER: Recipient identification or signature or PIN
            verificationMethod = (signatureUrl || recipientNameVal) ? 'RECEPTION_SIGNATURE' : 'PIN';
            if (verificationMethod === 'PIN' && deliveryPin) {
                // Validate PIN if provided
                await this.validateDeliveryPinInternal(db, order, deliveryPin);
            }
        } else {
            // IN_PERSON (Default): Strictly require delivery PIN verification
            verificationMethod = 'PIN';
            if (!deliveryPin) {
                throw new BadRequestError('Customer Delivery PIN is required for in-person delivery.');
            }
            await this.validateDeliveryPinInternal(db, order, deliveryPin);
        }

        // If Cash on Delivery, record COD collection
        if (order.paymentMethod === 'Cash on Delivery' && codCollectedAmountVal !== undefined) {
            await CodService.recordCodCollection({
                orderId,
                driverId,
                amountCollected: codCollectedAmountVal
            }).catch(e => console.warn('COD collection record warning:', e.message));
        }

        const now = new Date().toISOString();
        const driverName = driverUser?.full_name || order.driver?.name || 'Assigned Driver';

        // 1. Record successful attempt in delivery_attempts collection
        const attemptId = generateDeliveryAttemptId();
        await db.collection('delivery_attempts').insertOne({
            id: attemptId,
            publicId: attemptId,
            orderId,
            driverId,
            driverName,
            attemptTimestamp: now,
            success: true,
            photoUrl: (photoUrls && photoUrls.length > 0) ? photoUrls[0] : undefined,
            location: locationVal,
            instructionUsed: deliveryInstruction,
            verificationMethod,
            recipientName: recipientNameVal,
            createdAt: now
        } as any);

        // 2. Record evidence photos
        if (photoUrls && photoUrls.length > 0) {
            for (const url of photoUrls) {
                await EvidenceService.recordEvidence({
                    orderId,
                    type: 'delivery_photo',
                    uploadedBy: driverId,
                    uploadedByRole: 'driver',
                    url
                }).catch(e => console.warn('Evidence recording error:', e.message));
            }
        }

        // 3. Atomically complete order and clear delivery PIN / OTP
        const result = await db.collection('orders').updateOne(
            { 
                _id: order._id,
                status: { $in: allowedStatuses }
            },
            {
                $set: {
                    assigned_driver_id: order.assigned_driver_id || String(driverUser?._id || driverId),
                    status: 'delivered',
                    statusLabel: 'Completed',
                    updated_at: now,
                    delivered_at: now,
                    delivery_otp: null, // Clear immediately
                    delivery_pin_hash: null, // Clear immediately
                    delivery_pin_salt: null,
                    delivery_pin_enc: null,
                    delivery_pin_verified_at: now,
                    delivery_otp_verified_at: now,
                    'qr_tracking.deliveredAt': now,
                    'qr_tracking.deliveredByDriverId': driverId,
                    'qr_tracking.deliveryPhotoUrls': photoUrls || [],
                    'qr_tracking.deliveryPhoto': (photoUrls && photoUrls.length > 0) ? photoUrls[0] : null,
                    'qr_tracking.signatureUrl': signatureUrl || null,
                    'evidence.deliveryPhotos': photoUrls || [],
                    'evidence.deliveryPhotoUrl': (photoUrls && photoUrls.length > 0) ? photoUrls[0] : null,
                    'evidence.deliveryDriverName': driverName,
                    'evidence.deliveryVerifiedAt': now,
                    'evidence.verificationMethod': verificationMethod,
                    'evidence.recipientName': recipientName,
                    deliveryProof: {
                        photoUrl: (photoUrls && photoUrls.length > 0) ? photoUrls[0] : undefined,
                        photos: photoUrls || [],
                        signatureUrl: signatureUrl || undefined,
                        verificationMethod,
                        leaveAtDoor: deliveryInstruction === 'LEAVE_AT_DOOR',
                        recipientName: recipientNameVal,
                        verifiedAt: now,
                        location: locationVal
                    }
                },
                $push: {
                    timeline_events: {
                        event: 'delivered',
                        label: deliveryInstruction === 'LEAVE_AT_DOOR' 
                            ? 'Order Left Safely at Door (Photo Verified, GPS Logged)'
                            : `Order Delivered Successfully (${verificationMethod} Verified)`,
                        actor: 'driver',
                        actorId: driverId,
                        verificationMethod,
                        recipientName,
                        photoUrl: (photoUrls && photoUrls.length > 0) ? photoUrls[0] : undefined,
                        location,
                        timestamp: now
                    }
                } as any
            }
        );

        if (result.matchedCount === 0) {
            throw new BadRequestError('Delivery completion failed. Status may have changed concurrently.');
        }

        if (order.qr_tracking?.qrTagId) {
            await db.collection('qr_tags').updateOne(
                { qrId: order.qr_tracking.qrTagId }, 
                { $set: { status: 'available', orderId: null, lastFreedAt: now } }
            );
        }

        // Notify Customer of completion
        if (order.customer_id) {
            await NotificationService.createNotification({
                userId: String(order.customer_id),
                title: '🎉 Delivery Completed',
                message: deliveryInstruction === 'LEAVE_AT_DOOR'
                    ? `Your laundry order #${orderId} was safely left at your door as requested. Photo confirmation is available in your order details.`
                    : `Your laundry order #${orderId} has been safely delivered. Thank you for choosing Laundelle!`,
                type: 'order_completed',
                orderId
            });
        }

        // Send Order Completed Email (Official Tax Invoice & Total Bill)
        (async () => {
            try {
                let customerEmail = order.customer_email || order.contactDetails?.email || order.email;
                let customerName = recipientNameVal || order.customer_name || order.customerName;
                if (!customerEmail && order.customer_id) {
                    const custUser = await db.collection('users').findOne(buildEntityLookupQuery(order.customer_id, 'user') as any);
                    if (custUser) {
                        customerEmail = custUser.email;
                        customerName = customerName || custUser.full_name || custUser.name;
                    }
                }

                if (customerEmail) {
                    const formattedDate = new Date(now).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    });

                    await sendOrderCompletedEmail({
                        to: customerEmail,
                        orderId,
                        invoiceNumber: `INV-${orderId.replace(/^ORD-|^LD-/, '')}`,
                        customerName: customerName || 'Valued Customer',
                        completedDate: formattedDate,
                        deliveryAddress: order.address || order.pickup_address || 'Customer Delivery Address',
                        driverName: driverName || 'Laundelle Dedicated Courier',
                        items: Array.isArray(order.items) ? order.items.map((i: any) => ({
                            name: i.name || i.title || 'Garment Item',
                            quantity: i.quantity || 1,
                            unitPrice: i.price || i.unitPrice || 0,
                            totalPrice: (Number(i.price || i.unitPrice || 0)) * (Number(i.quantity || 1)),
                            unit: i.unit,
                            selectedOption: i.selectedOption || i.category,
                        })) : [],
                        subtotal: order.subtotal || order.amount || 0,
                        discount: order.discount || 0,
                        additionalCharges: order.additionalCharges || order.surcharge || 0,
                        additionalChargeReason: order.additionalChargeReason || '',
                        total: order.total_amount || order.total || order.amount || 0,
                        paymentMethod: order.payment_method || 'Online Payment',
                    });
                }
            } catch (emailErr: any) {
                console.error('[DriverService] Error sending Order Completed invoice email:', emailErr?.message || emailErr);
            }
        })();

        // Recalculate SLA
        await SlaService.checkAndEscalateSla(orderId).catch(e => console.warn('SLA calc error:', e.message));

        await AuditService.recordOrderEvent({
            orderId,
            action: 'delivered',
            actorId: driverId,
            actorRole: 'driver',
            before: { status: order.status },
            after: { status: 'delivered' },
            metadata: { verificationMethod, recipientName: recipientNameVal, photoUrls, location: locationVal }
        });

        return { success: true };
    }

    private static async validateDeliveryPinInternal(db: any, order: any, deliveryPin: string) {
        const verifyResult = this.verifyOrderVerificationPin(deliveryPin, order, 'delivery');

        if (!verifyResult.valid) {
            const currentAttempts = order.delivery_pin_attempts || order.delivery_otp_attempts || 0;
            const newAttempts = currentAttempts + 1;
            const willLock = newAttempts >= 5;
            await db.collection('orders').updateOne(
                { _id: order._id },
                { 
                    $set: {
                        delivery_pin_attempts: newAttempts,
                        delivery_otp_attempts: newAttempts,
                        delivery_pin_locked: willLock
                    }
                }
            );

            await AuditService.recordOrderEvent({
                orderId: order.id,
                action: willLock ? 'delivery_pin_locked' : 'delivery_pin_attempt_failed',
                actorId: 'driver',
                actorRole: 'driver',
                reason: verifyResult.error,
                metadata: { attempt: newAttempts, willLock }
            });

            if (willLock) {
                await ExceptionService.createException({
                    orderId: order.id,
                    orderNumber: order.id,
                    type: 'PIN_locked',
                    priority: 'high',
                    plantId: order.plant_id,
                    description: `Delivery PIN locked after 5 failed attempts at customer doorstep. Dispatch override required.`
                }).catch(e => console.warn('Exception raise warning:', e.message));
            }

            throw new BadRequestError(verifyResult.error || 'Invalid Delivery PIN.');
        }
    }
}

