import { NotificationService } from '@/services/NotificationService';
import { ExceptionService } from '@/services/ExceptionService';
import { MachineRunService } from '@/services/MachineRunService';
import { SlaService } from '@/services/SlaService';
import { AuditService } from '@/services/AuditService';
import { OrderItem } from '@laundelle/types';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { matchesPostcode, assertValidTransition } from '@/lib/workflow';
import crypto from 'crypto';
import { generateBagId, generateOrderItemId, buildEntityLookupQuery, generateId, generatePaymentId } from '@laundelle/ids';
import { normalizeRole } from '@laundelle/auth';
import { OrderCustomerEnrichmentService } from './OrderCustomerEnrichmentService';
import { ManagerService } from './ManagerService';

export class ProcessorService {
    public static userFilter(userId: string) {
        const idStr = String(userId || '').trim();
        const orConditions: any[] = [
            { _id: idStr },
            { id: idStr },
            { publicId: idStr },
            { staffId: idStr },
            { email: idStr.toLowerCase() },
            { auth0UserId: idStr },
            { auth0_sub: idStr }
        ];
        if (ObjectId.isValid(idStr)) {
            orConditions.push({ _id: new ObjectId(idStr) });
        }
        return { $or: orConditions };
    }

    public static async findProcessorUser(processorId: string) {
        if (!processorId) return null;
        const db = await getDb();
        return await db.collection('users').findOne(this.userFilter(processorId));
    }

    public static isAuthorizedProcessorRole(role?: string | null): boolean {
        const norm = normalizeRole(role);
        return norm === 'processor' || norm === 'plant_manager' || norm === 'super_admin';
    }

    public static async resolvePlantDoc(db: any, plantIdentifier: any): Promise<any | null> {
        if (!plantIdentifier) return null;
        const objectIdConverter = (id: string) => ObjectId.isValid(id) ? new ObjectId(id) : null;
        const key = typeof plantIdentifier === 'object' && plantIdentifier !== null && !(plantIdentifier instanceof ObjectId)
            ? (plantIdentifier.id || plantIdentifier._id || plantIdentifier.plantId || plantIdentifier.code)
            : plantIdentifier;
        if (!key) return null;

        const keyStr = String(key).trim();
        const query = buildEntityLookupQuery(keyStr, 'plant', objectIdConverter);
        let plant = await db.collection('plants').findOne(query);
        if (!plant && ObjectId.isValid(keyStr)) {
            try {
                plant = await db.collection('plants').findOne({ _id: new ObjectId(keyStr) });
            } catch {}
        }
        return plant;
    }

    public static async resolveProcessorPlant(db: any, processor: any): Promise<any | null> {
        if (!processor) return null;

        // 1. Direct plant fields on user
        const directKey = processor.plantId || processor.plant_id || processor.assigned_plant || processor.assignedPlant;
        if (directKey) {
            const plant = await this.resolvePlantDoc(db, directKey);
            if (plant) return plant;
        }

        // 2. Manager inheritance (driver or processor subordinate to manager)
        const managerId = processor.manager_id || processor.plantManagerId;
        if (managerId) {
            const res = await ManagerService.resolveManagerAndPlant(db, String(managerId));
            if (res?.plant) return res.plant;
        }

        // 3. User themselves is a plant manager or admin
        const normRole = normalizeRole(processor.role);
        if (normRole === 'plant_manager') {
            const res = await ManagerService.resolveManagerAndPlant(db, String(processor._id || processor.id));
            if (res?.plant) return res.plant;
        }

        return null;
    }

    public static async resolveOrderPlant(db: any, order: any): Promise<any | null> {
        if (!order) return null;

        // 1. Direct plant fields on order
        const directKey = order.plant_id || order.plantId || order.plant_code || order.plantCode;
        if (directKey) {
            const plant = await this.resolvePlantDoc(db, directKey);
            if (plant) return plant;
        }

        // 2. Order's assigned manager
        if (order.manager_id) {
            const res = await ManagerService.resolveManagerAndPlant(db, String(order.manager_id));
            if (res?.plant) return res.plant;
        }

        // 3. Order's assigned driver
        const driverId = order.assigned_driver_id || order.staffId || order.driver?.id;
        if (driverId) {
            const driverUser = await this.findProcessorUser(String(driverId));
            if (driverUser) {
                const driverPlant = await this.resolveProcessorPlant(db, driverUser);
                if (driverPlant) return driverPlant;
            }
        }

        return null;
    }

    public static async verifyPlantAndManagerMatch(
        db: any,
        processor: any,
        order: any
    ): Promise<{
        matches: boolean;
        orderPlantId: string | null;
        orderPlantName: string;
        processorPlantId: string | null;
        processorPlantName: string;
    }> {
        const normRole = normalizeRole(processor?.role);
        if (normRole === 'super_admin') {
            const ordPlant = await this.resolveOrderPlant(db, order);
            const ordPlantName = ordPlant?.name || order.plantName || order.plant_name || 'All Facilities (Admin)';
            const ordPlantId = ordPlant?.publicId || ordPlant?.id || String(ordPlant?._id || order.plant_id || '');
            return {
                matches: true,
                orderPlantId: ordPlantId,
                orderPlantName: ordPlantName,
                processorPlantId: ordPlantId,
                processorPlantName: ordPlantName
            };
        }

        const processorPlant = await this.resolveProcessorPlant(db, processor);
        const orderPlant = await this.resolveOrderPlant(db, order);

        const procPlantId = processorPlant ? (processorPlant.publicId || processorPlant.id || String(processorPlant._id)) : (processor.plantId || processor.plant_id || null);
        const procPlantName = processorPlant?.name || processor.plantName || processor.plant_name || 'Processor Facility';

        let ordPlantId = orderPlant ? (orderPlant.publicId || orderPlant.id || String(orderPlant._id)) : (order.plant_id || order.plantId || null);
        let ordPlantName = orderPlant?.name || order.plantName || order.plant_name || (ordPlantId ? `Plant (${ordPlantId})` : 'Unknown Facility');

        // If neither has any plant assigned
        if (!procPlantId && !ordPlantId) {
            return {
                matches: true,
                orderPlantId: null,
                orderPlantName: ordPlantName,
                processorPlantId: null,
                processorPlantName: procPlantName
            };
        }

        // 1. If resolved to the same MongoDB plant document
        if (processorPlant && orderPlant) {
            const sameDoc = String(processorPlant._id) === String(orderPlant._id) ||
                (processorPlant.id && orderPlant.id && processorPlant.id === orderPlant.id) ||
                (processorPlant.publicId && orderPlant.publicId && processorPlant.publicId === orderPlant.publicId) ||
                (processorPlant.code && orderPlant.code && processorPlant.code.toUpperCase() === orderPlant.code.toUpperCase());
            if (sameDoc) {
                return {
                    matches: true,
                    orderPlantId: procPlantId,
                    orderPlantName: procPlantName,
                    processorPlantId: procPlantId,
                    processorPlantName: procPlantName
                };
            }
        }

        // 2. Normalized plant ID match
        if (procPlantId && ordPlantId) {
            const norm = (s: string) => String(s).trim().toLowerCase().replace(/[-_]/g, '');
            if (norm(procPlantId) === norm(ordPlantId)) {
                return {
                    matches: true,
                    orderPlantId: procPlantId,
                    orderPlantName: procPlantName,
                    processorPlantId: procPlantId,
                    processorPlantName: procPlantName
                };
            }
        }

        // 3. Manager Inheritance & Shared Team Matching
        const processorManagerId = processor.manager_id || processor.plantManagerId;

        // A. Match order manager with processor manager
        if (order.manager_id && processorManagerId) {
            if (String(order.manager_id).trim() === String(processorManagerId).trim()) {
                return {
                    matches: true,
                    orderPlantId: procPlantId,
                    orderPlantName: procPlantName,
                    processorPlantId: procPlantId,
                    processorPlantName: procPlantName
                };
            }
        }

        // B. Match order driver with processor (inherited from same manager or same plant)
        const orderDriverId = order.assigned_driver_id || order.staffId || order.driver?.id;
        if (orderDriverId) {
            const driver = await this.findProcessorUser(String(orderDriverId));
            if (driver) {
                const driverManagerId = driver.manager_id || driver.plantManagerId;
                if (driverManagerId && processorManagerId && String(driverManagerId).trim() === String(processorManagerId).trim()) {
                    return {
                        matches: true,
                        orderPlantId: procPlantId,
                        orderPlantName: procPlantName,
                        processorPlantId: procPlantId,
                        processorPlantName: procPlantName
                    };
                }

                const driverPlant = await this.resolveProcessorPlant(db, driver);
                if (driverPlant && processorPlant) {
                    const driverPlantMatch = String(driverPlant._id) === String(processorPlant._id) ||
                        (driverPlant.id && processorPlant.id && driverPlant.id === processorPlant.id) ||
                        (driverPlant.publicId && processorPlant.publicId && driverPlant.publicId === processorPlant.publicId);
                    if (driverPlantMatch) {
                        return {
                            matches: true,
                            orderPlantId: procPlantId,
                            orderPlantName: procPlantName,
                            processorPlantId: procPlantId,
                            processorPlantName: procPlantName
                        };
                    }
                }
            }
        }

        // If either one has no plant assigned, associate rather than block
        if (!procPlantId || !ordPlantId) {
            return {
                matches: true,
                orderPlantId: procPlantId || ordPlantId,
                orderPlantName: procPlantName || ordPlantName,
                processorPlantId: procPlantId || ordPlantId,
                processorPlantName: procPlantName || ordPlantName
            };
        }

        return {
            matches: false,
            orderPlantId: ordPlantId,
            orderPlantName: ordPlantName,
            processorPlantId: procPlantId,
            processorPlantName: procPlantName
        };
    }

    static async getJobs(processorId: string) {
        const db = await getDb();
        const processor = await this.findProcessorUser(processorId);
        
        if (!processor || !this.isAuthorizedProcessorRole(processor.role)) {
            throw new ForbiddenError('Access denied: Processor account required.');
        }

        const isProcessor = normalizeRole(processor.role) === 'processor';
        const plant = await this.resolveProcessorPlant(db, processor);
        let plantId = plant ? (plant.publicId || plant.id || String(plant._id)) : (processor.plantId || processor.plant_id);

        if (isProcessor && !plantId) {
            throw new ForbiddenError('Access denied: Processor is not assigned to any laundry plant. Please contact your Plant Manager.');
        }

        const plantIds: any[] = [];
        if (plant) {
            plantIds.push(plant._id);
            plantIds.push(String(plant._id));
            if (plant.id) plantIds.push(plant.id);
            if (plant.publicId) plantIds.push(plant.publicId);
        } else if (plantId) {
            plantIds.push(plantId);
        }

        const assignedStatuses = [
            'received_at_facility',
            'received',
            'processor_assigned',
            'sorting',
            'washing',
            'drying',
            'ironing',
            'folding',
            'quality_check',
            'qc_ready',
            'ready_for_qc',
            'awaiting_customer_approval',
            'processing'
        ];

        const plantCondition = plantIds.length > 1 ? { plant_id: { $in: plantIds } } : (plantIds.length === 1 ? { plant_id: plantIds[0] } : (plantId ? { plant_id: plantId } : null));

        const processorQuery: any = {
            $or: [
                { assigned_processor_id: processorId },
                { assigned_processor_id: processor._id.toString() },
                { 'processor.id': processorId },
                { 'processor.id': processor._id.toString() },
                ...(plantCondition ? [plantCondition] : [])
            ],
            status: { $in: assignedStatuses }
        };

        if (plantCondition) {
            processorQuery.plant_id = plantCondition.plant_id;
        }

        let assigned = await db.collection('orders')
            .find(processorQuery)
            .sort({ updated_at: -1, updatedAt: -1 })
            .toArray();

        // If staff has no specifically assigned orders in admin mode, fetch plant orders
        if (assigned.length === 0 && (processor.role === 'admin' || processor.role === 'super_admin')) {
            const adminQuery: any = { status: { $in: assignedStatuses } };
            if (plantCondition) adminQuery.plant_id = plantCondition.plant_id;
            assigned = await db.collection('orders')
                .find(adminQuery)
                .sort({ updated_at: -1, updatedAt: -1 })
                .limit(50)
                .toArray();
        }

        const queue = plantCondition ? await db.collection('orders')
            .find({
                plant_id: plantCondition.plant_id,
                status: { $in: ['received_at_facility', 'waiting_for_processor', 'laundry_collected', 'booking_confirmed', 'pickup_in_progress'] }
            })
            .sort({ updated_at: 1, updatedAt: 1 })
            .toArray() : [];

        const completedQuery: any = {
            $or: [
                { assigned_processor_id: processorId },
                { assigned_processor_id: processor._id.toString() },
                { 'processor.id': processorId },
                { 'processor.id': processor._id.toString() }
            ],
            status: { $in: ['ready_for_delivery', 'out_for_delivery', 'delivered'] }
        };
        if (plantCondition) {
            completedQuery.plant_id = plantCondition.plant_id;
        }

        const completed = await db.collection('orders')
            .find(completedQuery)
            .sort({ updated_at: -1, updatedAt: -1 })
            .limit(20)
            .toArray();

        // Enrich customer names and redact sensitive OTPs
        const enrichOrders = async (ordersList: any[]) => {
            await OrderCustomerEnrichmentService.enrichOrders(ordersList, db);

            // Redact OTPs and PINs from processor views
            ordersList.forEach(o => {
                delete o.pickup_otp;
                delete o.delivery_otp;
                delete o.pickup_pin;
                delete o.delivery_pin;
                delete o.pickup_pin_hash;
                delete o.pickup_pin_salt;
                delete o.pickup_pin_enc;
                delete o.delivery_pin_hash;
                delete o.delivery_pin_salt;
                delete o.delivery_pin_enc;
            });

            return ordersList;
        };

        const enrichedAssigned = await enrichOrders(assigned);
        const enrichedQueue = await enrichOrders(queue);
        const enrichedCompleted = await enrichOrders(completed);

        return {
            processor: {
                id: processor._id.toString(),
                name: processor.full_name,
                plant_id: plantId || null,
                availability: processor.availability || 'available',
                is_active: processor.status !== 'suspended' && !processor.is_blocked && processor.availability !== 'offline'
            },
            assigned: enrichedAssigned,
            queue: enrichedQueue,
            completed: enrichedCompleted
        };
    }


    static async updateAvailability(processorId: string, availability: 'available' | 'busy' | 'offline') {
        const db = await getDb();
        const processor = await this.findProcessorUser(processorId);
        
        if (!processor || normalizeRole(processor.role) !== 'processor') {
            throw new Error('Access denied: Processor account required.');
        }

        const now = new Date().toISOString();
        await db.collection('users').updateOne(
            { _id: processor._id },
            { $set: { availability, is_active: true, updated_at: now } }
        );

        await AuditService.recordEvent({
            entityType: 'processor',
            entityId: processorId,
            action: 'processor_availability_updated',
            actorId: processorId,
            actorRole: 'processor',
            after: { availability }
        });

        if (availability === 'available' && processor.plant_id) {
            const pendingOrder = await db.collection('orders').findOne({
                plant_id: processor.plant_id,
                status: { $in: ['received_at_facility', 'waiting_for_processor'] }
            }, { sort: { updatedAt: 1 } });

            if (pendingOrder) {
                await db.collection('users').updateOne(
                    { _id: (ObjectId.isValid(processorId) ? new ObjectId(processorId) : processorId) as any },
                    { $set: { availability: 'busy' } }
                );

                const processorObj = {
                    id: String(processor._id),
                    name: processor.full_name,
                    email: processor.email
                };

                const timelineEvents = [...(pendingOrder.timeline_events || [])];
                timelineEvents.push({
                    event: 'processor_assigned',
                    label: `Processor Assigned (Automatic Pickup): ${processor.full_name}`,
                    actor: 'system',
                    processorId: String(processor._id),
                    processorName: processor.full_name,
                    timestamp: now
                });

                await db.collection('orders').updateOne(
                    { id: pendingOrder.id },
                    {
                        $set: {
                            status: 'processor_assigned',
                            statusLabel: 'Processor Assigned',
                            assigned_processor_id: processorId,
                            processor: processorObj,
                            timeline_events: timelineEvents,
                            updated_at: now
                        }
                    }
                );

                await AuditService.recordOrderEvent({
                    orderId: pendingOrder.id,
                    action: 'system_auto_processor_assigned',
                    actorId: 'system',
                    actorRole: 'system',
                    after: { assigned_processor_id: processorId },
                    metadata: { trigger: 'availability_change' }
                });
            }
        }

        return { success: true, availability };
    }

    static async getOrderForIntake(code: string, processorId?: string) {
        const db = await getDb();
        let clean = (code || '').trim();
        try {
            if (clean.startsWith('{') && clean.endsWith('}')) {
                const parsed = JSON.parse(clean);
                clean = parsed.orderId || parsed.id || parsed.order_id || parsed.bagQr || clean;
            }
        } catch {}
        clean = clean.replace(/^["']|["']$/g, '').trim();

        const strippedClean = clean.replace(/^BAG-/, '');
        const queryList: any[] = [
            { publicId: clean },
            { publicId: strippedClean },
            { id: clean },
            { id: strippedClean },
            { orderNumber: clean },
            { orderCode: clean },
            { publicId: new RegExp(`^${clean}$`, 'i') },
            { id: new RegExp(`^${clean}$`, 'i') },
            { 'qr_tracking.qrTagId': clean },
            { 'qr_tracking.qrTagId': new RegExp(`^${clean}$`, 'i') },
            { 'evidence.bagQrCode': clean },
            { bagQrCode: clean },
            { 'package.qr_code': clean },
            { qr_code: clean }
        ];
        if (ObjectId.isValid(clean)) {
            queryList.push({ _id: new ObjectId(clean) });
        }

        let order = await db.collection('orders').findOne({ $or: queryList });

        if (!order) {
            const match = clean.match(/(?:L2U|ORD|LD|BAG)[-_]?[A-Za-z0-9]+/i);
            if (match && match[0] !== clean) {
                const matchedVal = match[0];
                const strippedMatched = matchedVal.replace(/^BAG-/, '');
                order = await db.collection('orders').findOne({
                    $or: [
                        { publicId: matchedVal },
                        { publicId: strippedMatched },
                        { id: matchedVal },
                        { id: strippedMatched },
                        { orderNumber: matchedVal },
                        { orderCode: matchedVal },
                        { publicId: new RegExp(`^${matchedVal}$`, 'i') },
                        { id: new RegExp(`^${matchedVal}$`, 'i') }
                    ]
                });
            }
        }

        if (order) {
            await OrderCustomerEnrichmentService.enrichOrder(order, db);
            let customerName = order.customerName || order.customer_name;
            let customerPhone = order.customerPhone || order.customer_phone || order.phone;

            let plantMismatch = false;
            let processorPlantId: string | null = null;
            let processorPlantName = '';
            let orderPlantName = order.plantName || order.plant_name || '';

            if (processorId) {
                const processor = await this.findProcessorUser(processorId);
                if (processor) {
                    const matchResult = await this.verifyPlantAndManagerMatch(db, processor, order);
                    plantMismatch = !matchResult.matches;
                    processorPlantId = matchResult.processorPlantId;
                    processorPlantName = matchResult.processorPlantName;
                    orderPlantName = matchResult.orderPlantName;

                    if (matchResult.matches && processorPlantId) {
                        if (!order.plant_id || String(order.plant_id).trim() !== String(processorPlantId).trim()) {
                            order.plant_id = processorPlantId;
                            order.plantId = processorPlantId;
                            order.plant_name = processorPlantName;
                            order.plantName = processorPlantName;
                            db.collection('orders').updateOne(
                                { _id: order._id },
                                { $set: { plant_id: processorPlantId, plantId: processorPlantId, plant_name: processorPlantName, plantName: processorPlantName } }
                            ).catch(() => {});
                        }
                    }
                }
            } else {
                const ordPlant = await this.resolveOrderPlant(db, order);
                if (ordPlant) orderPlantName = ordPlant.name;
            }

            // Rule 1: Check driver pickup & OTP verification
            // The bag intake should only happen after the driver picks up the bag from the customer after verifying the OTP successfully
            const isDriverCollected = order.status === 'laundry_collected' || 
                Boolean(order.pickedUpAt) || 
                Boolean(order.pickup_otp_verified_at) || 
                Boolean(order.pickup_pin_verified_at) ||
                Boolean(order.evidence?.pickupVerifiedAt) ||
                Boolean(order.qr_tracking?.collectedAt);

            // Rule 2: Check if already intaked
            // One order cannot be intaked multiple times
            const postIntakeStatuses = [
                'received_at_facility',
                'washing',
                'sorting',
                'drying',
                'ironing',
                'quality_check',
                'ready_for_qc',
                'qc_ready',
                'ready_for_delivery',
                'out_for_delivery',
                'delivered',
                'completed'
            ];
            const alreadyIntaked = Boolean(order.receivedAtFacilityAt) || 
                Boolean(order.intake?.intakeAt) || 
                postIntakeStatuses.includes(order.status);

            return {
                found: true,
                plantMismatch,
                isDriverCollected,
                alreadyIntaked,
                orderPlantId: order.plant_id ? String(order.plant_id) : (processorPlantId || null),
                orderPlantName: orderPlantName || processorPlantName || 'Assigned Plant',
                processorPlantId,
                processorPlantName: processorPlantName || processorPlantId || 'Current Facility',
                order: {
                    id: order.id || order._id?.toString(),
                    customerName: customerName || 'Customer',
                    customerPhone: customerPhone || '',
                    service: order.items?.[0]?.name || order.service || 'Laundry Service',
                    items: order.items || [],
                    weightKg: order.actualWeightKg || order.weightKg || 5.0,
                    status: order.status,
                    statusLabel: order.statusLabel || order.status,
                    isDriverCollected,
                    alreadyIntaked,
                    total: order.total || order.total_price || 0,
                    address: order.address || '',
                    plant_id: order.plant_id ? String(order.plant_id) : (processorPlantId || null),
                    plantName: orderPlantName || processorPlantName || '',
                    bagQr: order.package?.qr_code || order.qr_code || order.qr_tracking?.qrTagId || order.bag_id || order.publicId || order.id || clean
                }
            };
        }

        return { found: false };
    }

    static async recordFacilityIntake(
        processorId: string,
        orderId: string,
        actualWeightKg: number,
        photoUrls: string[],
        bagCondition: string,
        restrictedItems: string[],
        processingAction: 'washing' | 'sorting' | 'received_at_facility' | 'processing' = 'washing',
        garmentItems?: Partial<OrderItem>[]
    ) {
        const db = await getDb();
        const processor = await this.findProcessorUser(processorId);
        
        if (!processor || !this.isAuthorizedProcessorRole(processor.role)) {
            throw new Error('Access denied: Processor or facility manager account required.');
        }
        if (processor.is_active === false || processor.status === 'suspended') throw new Error('Access denied: Processor is inactive.');

        // 1. Clean and sanitize orderId
        let cleanOrderId = (orderId || '').trim();
        try {
            if (cleanOrderId.startsWith('{') && cleanOrderId.endsWith('}')) {
                const parsed = JSON.parse(cleanOrderId);
                cleanOrderId = parsed.orderId || parsed.id || parsed.order_id || cleanOrderId;
            }
        } catch {}
        cleanOrderId = cleanOrderId.replace(/^["']|["']$/g, '').trim();

        // 2. Query order by canonical publicId, id, orderCode, or package.qr_code
        const orderQuery = buildEntityLookupQuery(cleanOrderId, 'order');
        let order: any = await db.collection('orders').findOne(orderQuery);

        const now = new Date().toISOString();

        if (!order) {
            throw new NotFoundError(`Order #${cleanOrderId} not found or invalid barcode/QR code.`);
        }

        // Rule 1: Driver pickup and OTP verification check
        const isDriverCollected = order.status === 'laundry_collected' || 
            Boolean(order.pickedUpAt) || 
            Boolean(order.pickup_otp_verified_at) || 
            Boolean(order.pickup_pin_verified_at) ||
            Boolean(order.evidence?.pickupVerifiedAt) ||
            Boolean(order.qr_tracking?.collectedAt);

        if (!isDriverCollected) {
            throw new Error(`Order #${cleanOrderId} has not been collected by a driver yet. Driver OTP verification is required before plant intake.`);
        }

        // Rule 2: Cannot be intaked multiple times
        const postIntakeStatuses = [
            'received_at_facility',
            'washing',
            'sorting',
            'drying',
            'ironing',
            'quality_check',
            'ready_for_qc',
            'qc_ready',
            'ready_for_delivery',
            'out_for_delivery',
            'delivered',
            'completed'
        ];
        if (order.receivedAtFacilityAt || order.intake?.intakeAt || postIntakeStatuses.includes(order.status)) {
            throw new Error(`Order #${cleanOrderId} has already been intaked at the facility. An order cannot be intaked multiple times.`);
        }

        // Enforce plant assignment: Reject intake if order is assigned to a different plant
        const matchResult = await this.verifyPlantAndManagerMatch(db, processor, order);
        if (!matchResult.matches) {
            throw new Error(`Order #${cleanOrderId} is assigned to a different plant (${matchResult.orderPlantName || order.plant_id}). Cannot intake at this facility (${matchResult.processorPlantName}).`);
        }
        if (matchResult.processorPlantId) {
            order.plant_id = matchResult.processorPlantId;
            order.plantId = matchResult.processorPlantId;
            order.plant_name = matchResult.processorPlantName;
            order.plantName = matchResult.processorPlantName;
        }

        // Enrich customer name if missing or null in order document
        await OrderCustomerEnrichmentService.enrichOrder(order, db);

        const estimatedWeight = order.weightKg || 0;
        const weightDiff = actualWeightKg - estimatedWeight;
        const additionalChargeThreshold = 0.5;

        // Only assess extra weight fee if service is per-kg/bag and excess is genuine
        const hasWeightBasedItem = (order.items || []).some((item: any) => 
            item.unit === 'per kg' || 
            item.unit === 'per bag' || 
            (item.name && item.name.toLowerCase().includes('kg')) ||
            (item.name && item.name.toLowerCase().includes('wash & fold'))
        );

        let additionalCharge = null;
        if (hasWeightBasedItem && estimatedWeight > 0 && weightDiff > additionalChargeThreshold) {
            const extraRate = 3.50; // Standard excess rate per kg
            const extraCost = Math.round(weightDiff * extraRate * 100) / 100;
            const chargeId = generatePaymentId();
            additionalCharge = {
                id: chargeId,
                publicId: chargeId,
                chargeId,
                originalAmount: order.total || 0,
                updatedAmount: (order.total || 0) + extraCost,
                additionalAmount: extraCost,
                reason: `Laundry weighed ${actualWeightKg} kg at intake (estimated ${estimatedWeight} kg). Surcharge of +£${extraCost.toFixed(2)} applies.`,
                status: 'pending',
            };
        }

        const bagId = order.package?.publicId || order.package?.package_id || generateBagId();
        const packageId = bagId;
        const packageQr = bagId;
        const packageObj = {
            publicId: bagId,
            bagId: bagId,
            package_id: bagId,
            qr_code: bagId,
            attached_at: now,
            status: 'in_plant'
        };

        const hasAdditionalCharge = !!additionalCharge;
        const assignedAction = processingAction === 'processing' ? 'washing' : (processingAction || 'washing');
        const validStatuses = ['washing', 'sorting', 'received_at_facility'];
        const chosenStatus = validStatuses.includes(assignedAction) ? assignedAction : 'washing';

        // Critical hardening: If an overweight charge is generated, the order MUST halt in awaiting_customer_approval
        const finalStatus = hasAdditionalCharge ? 'awaiting_customer_approval' : chosenStatus;
        const finalStatusLabel = hasAdditionalCharge
            ? 'Awaiting Customer Approval'
            : (chosenStatus === 'washing' ? 'Washing' : chosenStatus === 'sorting' ? 'Sorting' : 'Received at Facility');

        // Item-level garment recording
        let savedItems: OrderItem[] = [];
        if (garmentItems && garmentItems.length > 0) {
            savedItems = garmentItems.map((g) => {
                const itemId = g.id || generateOrderItemId();
                return {
                    id: itemId,
                    publicId: itemId,
                    orderId: order.id,
                    category: g.category || 'General Laundry',
                    description: g.description || 'Garment Item',
                    color: g.color,
                    brand: g.brand,
                    material: g.material,
                    serviceType: g.serviceType || 'wash_and_fold',
                    quantity: g.quantity || 1,
                    conditionAtIntake: g.conditionAtIntake || 'good',
                    conditionNotes: g.conditionNotes || '',
                    damagePhotos: g.damagePhotos || [],
                    specialInstructions: g.specialInstructions || '',
                    processingRequirements: g.processingRequirements || '',
                    currentStage: (hasAdditionalCharge ? 'received_at_facility' : chosenStatus) as any,
                    qcStatus: 'PENDING',
                    rewashRequired: false,
                    createdAt: now,
                    updatedAt: now
                };
            });
            await db.collection('order_items').insertMany(savedItems);
        } else if (order.items && order.items.length > 0) {
            savedItems = order.items.map((it: any) => {
                const itemId = it.id || generateOrderItemId();
                return {
                    id: itemId,
                    publicId: itemId,
                    orderId: order.id,
                    category: it.category || 'General Laundry',
                    description: it.name || 'Garment Item',
                    serviceType: it.serviceType || 'wash_and_fold',
                    quantity: it.quantity || 1,
                    currentStage: (hasAdditionalCharge ? 'received_at_facility' : chosenStatus) as any,
                    qcStatus: 'PENDING',
                    rewashRequired: false,
                    createdAt: now,
                    updatedAt: now
                };
            });
            await db.collection('order_items').insertMany(savedItems);
        }

        const updateFields: any = {
            status: finalStatus,
            statusLabel: finalStatusLabel,
            actualWeightKg,
            receivedAtFacilityAt: now,
            orderItems: savedItems,
            assigned_processor_id: String(processor._id),
            processor: {
                id: String(processor._id),
                name: processor.full_name,
                email: processor.email
            },
            'intake.intakeByStaffId': String(processor._id),
            'intake.intakeAt': now,
            'intake.photoUrls': photoUrls || [],
            'intake.bagCondition': bagCondition || 'Good',
            'intake.restrictedItems': restrictedItems || [],
            package: packageObj,
            updated_at: now
        };

        if (order.customerName) {
            updateFields.customerName = order.customerName;
        }
        if (order.customerPhone) {
            updateFields.customerPhone = order.customerPhone;
        }

        if (additionalCharge) {
            updateFields.additionalCharge = additionalCharge;
        }

        const eventsPush: any[] = [{
            event: 'facility_intake',
            label: `Received at Facility & Status set to ${finalStatusLabel} by ${processor.full_name}`,
            actor: 'processor',
            actorId: String(processor._id),
            actualWeightKg,
            estimatedWeightKg: estimatedWeight,
            bagCondition,
            restrictedItems,
            packageId,
            packageQr,
            timestamp: now
        }];

        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: updateFields,
                $push: { timeline_events: { $each: eventsPush } } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId: order.id,
            action: 'facility_intake',
            actorId: String(processor._id),
            actorRole: processor.role || 'processor',
            before: { status: order.status },
            after: { status: finalStatus, actualWeightKg },
            metadata: {
                actualWeightKg,
                packageId,
                packageQr,
                hasAdditionalCharge
            }
        });

        if (additionalCharge && order.customer_id) {
            await NotificationService.createNotification({
                userId: order.customer_id,
                title: 'Additional Charge Approval Required',
                message: `Your laundry for #${order.id} weighed ${actualWeightKg} kg (+£${additionalCharge.additionalAmount.toFixed(2)} difference). Please review and accept.`,
                type: 'charge',
                orderId: order.id,
            });

            // Log operational exception for pending charge
            await ExceptionService.createException({
                orderId: order.id,
                type: 'additional_charge_pending',
                priority: 'HIGH',
                plantId: order.plant_id,
                description: `Order #${order.id} overweight by ${weightDiff.toFixed(2)}kg (+£${additionalCharge.additionalAmount.toFixed(2)}). Awaiting customer approval before processing.`,
                evidence: {
                    actualWeightKg,
                    estimatedWeight,
                    excessCost: additionalCharge.additionalAmount,
                    photos: photoUrls
                }
            });
        }

        return { 
            success: true, 
            orderId: order.id, 
            customerName: order.customerName, 
            additionalCharge, 
            newStatus: finalStatus, 
            packageObj 
        };
    }

    static async updateStage(
        processorId: string, 
        orderId: string, 
        _qrCode?: string, 
        nextStage: string = '',
        machineInfo?: { machineId: string; cycleType?: string; temperature?: string }
    ) {
        const db = await getDb();
        const processor = await this.findProcessorUser(processorId);
        
        if (!processor || !this.isAuthorizedProcessorRole(processor.role)) {
            throw new Error('Access denied: Processor, manager, or admin account required.');
        }
        if (processor.is_active === false || processor.status === 'suspended') throw new Error('Access denied: Processor is inactive.');

        let cleanOrderId = (orderId || '').trim();
        try {
            if (cleanOrderId.startsWith('{') && cleanOrderId.endsWith('}')) {
                const parsed = JSON.parse(cleanOrderId);
                cleanOrderId = parsed.orderId || parsed.id || parsed.order_id || cleanOrderId;
            }
        } catch {}
        cleanOrderId = cleanOrderId.replace(/^["']|["']$/g, '').trim();

        const strippedClean = cleanOrderId.replace(/^BAG-/, '');
        const queryList: any[] = [
            { publicId: cleanOrderId },
            { publicId: strippedClean },
            { id: cleanOrderId },
            { id: strippedClean },
            { orderNumber: cleanOrderId },
            { orderCode: cleanOrderId },
            { publicId: new RegExp(`^${cleanOrderId}$`, 'i') },
            { id: new RegExp(`^${cleanOrderId}$`, 'i') },
            { 'qr_tracking.qrTagId': cleanOrderId },
            { 'qr_tracking.qrTagId': new RegExp(`^${cleanOrderId}$`, 'i') },
            { 'evidence.bagQrCode': cleanOrderId },
            { bagQrCode: cleanOrderId },
            { 'package.qr_code': cleanOrderId },
            { qr_code: cleanOrderId }
        ];
        if (ObjectId.isValid(cleanOrderId)) {
            queryList.push({ _id: new ObjectId(cleanOrderId) });
        }
        let order: any = await db.collection('orders').findOne({ $or: queryList });
        if (!order) throw new Error('Order not found.');
        if (order.plant_id && processor.plant_id && String(order.plant_id) !== String(processor.plant_id)) {
            order.plant_id = processor.plant_id;
        }

        const now = new Date().toISOString();
        
        // Stage label and mapping
        const stageLabels: Record<string, string> = {
            'received': 'Received at Facility',
            'received_at_facility': 'Received at Facility',
            'sorting': 'Sorting',
            'washing': 'Washing',
            'drying': 'Drying',
            'ironing': 'Ironing',
            'folding': 'Folding',
            'quality_check': 'Ready for QC',
            'qc_ready': 'Ready for QC',
            'ready_for_delivery': 'Ready for Delivery'
        };

        // If processor attempts to move directly to ready_for_delivery without passing QC, route to QC first
        let targetStage = nextStage === 'quality_check' ? 'qc_ready' : nextStage;
        let routedToQC = false;
        if (targetStage === 'ready_for_delivery' && !order.qc?.passed) {
            targetStage = 'qc_ready';
            routedToQC = true;
        }
        const updatedStatusLabel = stageLabels[targetStage] || stageLabels[nextStage] || nextStage;

        // Machine Run handling
        let runId: string | null = null;
        if ((targetStage === 'washing' || targetStage === 'drying') && machineInfo?.machineId && order.plant_id) {
            try {
                const runResult = await MachineRunService.startRun({
                    plantId: order.plant_id,
                    machineId: machineInfo.machineId,
                    processorId: String(processor._id),
                    orderIds: [order.id],
                    cycleType: machineInfo.cycleType || 'Standard',
                    temperature: machineInfo.temperature || '40C'
                });
                runId = runResult.runId;
            } catch (err: any) {
                console.warn('[MachineRun] Could not start run:', err.message);
            }
        }

        // Complete any active runs for this order if moving past washing/drying
        if (targetStage !== 'washing' && targetStage !== 'drying') {
            const activeRuns = await db.collection('machine_runs').find({
                orderIds: order.id,
                status: 'RUNNING'
            }).toArray();
            for (const r of activeRuns) {
                await MachineRunService.completeRun(r.runId, String(processor._id));
            }
        }

        const updateSet: any = {
            status: targetStage,
            statusLabel: updatedStatusLabel,
            assigned_processor_id: String(processor._id),
            processor: { id: String(processor._id), name: processor.full_name, email: processor.email },
            updated_at: now
        };

        if ((targetStage === 'washing' || targetStage === 'sorting') && !order.processingStartedAt) {
            updateSet.processingStartedAt = now;
        }
        if (targetStage === 'qc_ready' && !order.qcStartedAt) {
            updateSet.qcStartedAt = now;
        }
        if (runId) {
            updateSet.currentMachineRunId = runId;
        }

        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: updateSet,
                $push: {
                    timeline_events: {
                        event: targetStage,
                        label: `Stage changed to ${updatedStatusLabel}`,
                        actor: 'processor',
                        processorName: processor.full_name,
                        timestamp: now
                    }
                } as any
            }
        );

        // Update item-level current stage
        await db.collection('order_items').updateMany(
            { orderId: order.id },
            { $set: { currentStage: targetStage, updatedAt: now } }
        );

        if (targetStage === 'washing' || targetStage === 'sorting') {
            await db.collection('users').updateOne(
                { _id: (ObjectId.isValid(processorId) ? new ObjectId(processorId) : processorId) as any },
                { $set: { availability: 'busy', last_assigned_at: now } }
            );
        }

        await AuditService.recordOrderEvent({
            orderId: order.id,
            action: 'processor_stage_update',
            actorId: String(processor._id),
            actorRole: processor.role || 'processor',
            before: { status: order.status },
            after: { status: targetStage, statusLabel: updatedStatusLabel },
            metadata: { stage: targetStage, machineRunId: runId }
        });

        return { success: true, status: targetStage, statusLabel: updatedStatusLabel, routedToQC, runId };
    }

    static async recordQualityCheck(
        processorId: string, 
        orderId: string, 
        status: string, 
        notes: string, 
        reason?: string,
        checklist?: Record<string, boolean>,
        itemChecks?: Array<{ itemId: string; passed: boolean; rewashRequired: boolean; notes?: string; reason?: string }>
    ) {
        const db = await getDb();
        const processor = await this.findProcessorUser(processorId);
        
        if (!processor || !this.isAuthorizedProcessorRole(processor.role)) {
            throw new Error('Access denied: Processor, manager, or admin account required.');
        }
        if (processor.is_active === false || processor.status === 'suspended') throw new Error('Access denied: Processor is inactive.');

        let cleanOrderId = (orderId || '').trim();
        try {
            if (cleanOrderId.startsWith('{') && cleanOrderId.endsWith('}')) {
                const parsed = JSON.parse(cleanOrderId);
                cleanOrderId = parsed.orderId || parsed.id || parsed.order_id || cleanOrderId;
            }
        } catch {}
        cleanOrderId = cleanOrderId.replace(/^["']|["']$/g, '').trim();

        const queryList: any[] = [
            { id: cleanOrderId },
            { orderCode: cleanOrderId },
            { id: new RegExp(`^${cleanOrderId}$`, 'i') }
        ];
        if (ObjectId.isValid(cleanOrderId)) {
            queryList.push({ _id: new ObjectId(cleanOrderId) });
        }
        let order: any = await db.collection('orders').findOne({ $or: queryList });
        if (!order) throw new Error('Order not found.');
        const processorPlantId = processor.plantId || processor.plant_id;
        if (order.plant_id && processorPlantId && String(order.plant_id) !== String(processorPlantId)) {
            order.plant_id = processorPlantId;
        }

        const now = new Date().toISOString();
        const targetProcessorId = order.assigned_processor_id || processorId;
        const processorUser = await this.findProcessorUser(targetProcessorId);

        let nextAvailability = 'available';
        if (processorUser && processorUser.role === 'processor') {
            const pendingOrder = await db.collection('orders').findOne({
                plant_id: processorUser.plant_id,
                status: { $in: ['received_at_facility', 'waiting_for_processor'] }
            }, { sort: { updatedAt: 1 } });

            if (pendingOrder) {
                nextAvailability = 'busy';
                const processorObj = {
                    id: String(processorUser._id),
                    name: processorUser.full_name,
                    email: processorUser.email
                };
                const timelineEvents = [...(pendingOrder.timeline_events || [])];
                timelineEvents.push({
                    event: 'processor_assigned',
                    label: `Processor Assigned (Automatic Intake): ${processorUser.full_name}`,
                    actor: 'system',
                    processorId: String(processorUser._id),
                    processorName: processorUser.full_name,
                    timestamp: now
                });

                await db.collection('orders').updateOne(
                    { id: pendingOrder.id },
                    {
                        $set: {
                            status: 'processor_assigned',
                            statusLabel: 'Processor Assigned',
                            assigned_processor_id: String(processorUser._id),
                            processor: processorObj,
                            timeline_events: timelineEvents,
                            updated_at: now
                        }
                    }
                );

                await AuditService.recordOrderEvent({
                    orderId: pendingOrder.id,
                    action: 'system_auto_processor_assigned',
                    actorId: 'system',
                    actorRole: 'system',
                    after: { assigned_processor_id: String(processorUser._id) },
                    metadata: { trigger: 'job_completed' }
                });
            }
        }

        await db.collection('users').updateOne(
            { _id: ObjectId.isValid(targetProcessorId) ? new ObjectId(targetProcessorId) : targetProcessorId },
            { $set: { availability: nextAvailability, last_assigned_at: now } }
        );

        // Item-level check processing
        if (itemChecks && itemChecks.length > 0) {
            for (const chk of itemChecks) {
                await db.collection('order_items').updateOne(
                    { id: chk.itemId },
                    {
                        $set: {
                            qcStatus: chk.passed ? 'PASSED' : 'REWASH',
                            rewashRequired: chk.rewashRequired,
                            qcNotes: chk.notes || '',
                            rewashReason: chk.reason || '',
                            updatedAt: now
                        }
                    }
                );
            }
            const anyItemFailed = itemChecks.some(c => !c.passed || c.rewashRequired);
            if (anyItemFailed) {
                status = 'rewash';
            }
        }

        if (status === 'passed') {
            const deliveryDriverRes = await this.autoAssignDeliveryDriver(db, order, now);
            const timelineEvents = [...(order.timeline_events || [])];
            timelineEvents.push({
                event: 'quality_check_passed',
                label: 'Quality Control Passed (9-Point Standard Met)',
                actor: 'processor',
                actorId: processorId,
                notes: notes || 'Passed all quality control standards',
                timestamp: now
            });
            timelineEvents.push(deliveryDriverRes.timelineEvent);

            await db.collection('orders').updateOne(
                { _id: order._id },
                {
                    $set: {
                        status: deliveryDriverRes.status,
                        statusLabel: deliveryDriverRes.statusLabel,
                        assigned_driver_id: deliveryDriverRes.assigned_driver_id,
                        driver: deliveryDriverRes.driver,
                        'qc.passed': true,
                        'qc.checkedByStaffId': processorId,
                        'qc.checkedAt': now,
                        'qc.notes': notes || '',
                        'qc.checklist': checklist || {},
                        ready_for_delivery_at: now,
                        readyForDeliveryAt: now,
                        timeline_events: timelineEvents,
                        updated_at: now
                    }
                }
            );

            // Update all order items to PASSED
            await db.collection('order_items').updateMany(
                { orderId: order.id },
                { $set: { qcStatus: 'PASSED', rewashRequired: false, currentStage: 'ready_for_delivery', updatedAt: now } }
            );

            // Immediate Notification to Assigned Delivery Driver
            if (deliveryDriverRes.assigned_driver_id) {
                await NotificationService.createNotification({
                    userId: String(deliveryDriverRes.assigned_driver_id),
                    title: '🚚 Order Ready for Delivery',
                    message: `Order #${order.id} has passed QC and is ready for delivery to postcode ${order.postcode || 'customer'}.`,
                    type: 'ready_for_delivery',
                    orderId: order.id
                });
            }

            // Also Notify Customer that items are cleaned & ready
            if (order.customer_id) {
                await NotificationService.createNotification({
                    userId: String(order.customer_id),
                    title: '✨ Laundry Cleaned & Inspected',
                    message: `Your laundry for order #${order.id} has passed Quality Check and is ready for delivery!`,
                    type: 'order_processed',
                    orderId: order.id
                });
            }

            await AuditService.recordOrderEvent({
                orderId: order.id,
                action: 'quality_check_passed',
                actorId: processorId,
                actorRole: processor.role || 'processor',
                before: { status: order.status },
                after: { status: deliveryDriverRes.status, qcPassed: true },
                reason: notes || 'Passed quality control standards',
                metadata: { driverId: deliveryDriverRes.assigned_driver_id, checklist }
            });

            return { success: true, status: deliveryDriverRes.status, reassigned: !!deliveryDriverRes.assigned_driver_id };

        } else if (status === 'rewash' || status === 'failed' || status === 'reprocess') {
            const rewashReason = reason || notes || 'QC inspection failed';
            const timelineEvents = [...(order.timeline_events || [])];
            timelineEvents.push({
                event: 'quality_check_failed',
                label: 'QC Failed: Rewash Required',
                actor: 'processor',
                actorId: processorId,
                notes: notes || rewashReason,
                reason: rewashReason,
                timestamp: now
            });

            await db.collection('orders').updateOne(
                { _id: order._id },
                {
                    $set: {
                        status: 'rewash_required',
                        statusLabel: 'Rewash Required (QC Failed)',
                        'qc.passed': false,
                        'qc.checkedByStaffId': processorId,
                        'qc.checkedAt': now,
                        'qc.notes': notes || '',
                        'qc.rewash_reason': rewashReason,
                        'qc.checklist': checklist || {},
                        timeline_events: timelineEvents,
                        updated_at: now
                    }
                }
            );

            // Create operational exception for rewash tracking
            await ExceptionService.createException({
                orderId: order.id,
                type: 'qc_rewash',
                priority: 'HIGH',
                plantId: order.plant_id,
                description: `Order #${order.id} failed QC inspection and requires rewash. Reason: ${rewashReason}`,
                evidence: {
                    reason: rewashReason,
                    checklist,
                    inspectorId: processorId,
                    notes
                }
            });

            await AuditService.recordOrderEvent({
                orderId: order.id,
                action: 'quality_check_failed',
                actorId: processorId,
                actorRole: processor.role || 'processor',
                before: { status: order.status },
                after: { status: 'rewash_required', qcPassed: false },
                reason: rewashReason,
                metadata: { notes, checklist }
            });

            return { success: true, status: 'rewash_required' };
        } else {
            throw new BadRequestError('Invalid quality check status. Must be passed, failed, rewash, or reprocess.');
        }
    }

    private static async autoAssignDeliveryDriver(db: any, order: any, now: string): Promise<any> {
        const orderPostcode = order.postcode || order.address || '';
        const rejectedIds: string[] = (order.rejected_driver_ids || []).map((id: any) => String(id));

        // Find active drivers
        const allDrivers = await db.collection('users').find({
            role: 'driver',
            status: { $ne: 'suspended' },
            availability: { $nin: ['off-duty', 'offline'] }
        }).toArray();

        // Match driver by UK postcode
        const matchingDrivers = allDrivers.filter((driver: any) => {
            if (rejectedIds.includes(String(driver._id))) return false;
            const assignedList = driver.assigned_postcodes || driver.assignedSectors || [];
            return matchesPostcode(orderPostcode, assignedList);
        });

        if (matchingDrivers.length === 0) {
            return {
                status: 'ready_for_delivery',
                statusLabel: 'Ready for Delivery (Awaiting Driver)',
                assigned_driver_id: null,
                driver: null,
                timelineEvent: {
                    event: 'ready_for_delivery',
                    label: `Ready for Delivery (Awaiting Driver for postcode: ${orderPostcode})`,
                    actor: 'system',
                    timestamp: now
                }
            };
        }

        // Sort by least recently assigned
        matchingDrivers.sort((a: any, b: any) => {
            const aTime = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
            const bTime = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
            return aTime - bTime;
        });

        const selectedDriver = matchingDrivers[0];

        await db.collection('users').updateOne(
            { _id: selectedDriver._id },
            { $set: { last_assigned_at: now } }
        );

        const driverObj = {
            id: String(selectedDriver._id),
            name: selectedDriver.full_name,
            phone: selectedDriver.phone || '+44 7700 900301',
            vehicle: selectedDriver.vehicle || 'Preston Van A',
            rating: selectedDriver.rating || 4.8,
            avatar: selectedDriver.avatarUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200'
        };

        return {
            status: 'ready_for_delivery',
            statusLabel: 'Ready for Delivery',
            assigned_driver_id: selectedDriver._id,
            driver: driverObj,
            timelineEvent: {
                event: 'delivery_driver_assigned',
                label: `Delivery Assigned to Driver: ${selectedDriver.full_name} (${orderPostcode})`,
                actor: 'system',
                driverId: String(selectedDriver._id),
                driverName: selectedDriver.full_name,
                timestamp: now
            }
        };
    }
}
