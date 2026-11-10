import { getDb } from '@/lib/mongodb';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { derivePostcodeSector } from '@/services/PlatformService';
import { NotificationService } from '@/services/NotificationService';
import { ExceptionService } from '@/services/ExceptionService';
import { SlaService } from '@/services/SlaService';
import { AuditService } from '@/services/AuditService';
import { 
    normalizeUkPostcode, 
    parseUkPostcode, 
    matchesPostcode, 
    assertValidTransition 
} from '@/lib/workflow';
import { isPostcodeInServiceArea } from '@laundelle/utils';
import {
    generateSecureNumericPin,
    generatePinSalt,
    hashOrderPin,
    encryptOrderPin,
    decryptOrderPin
} from '@/lib/orderPin';
import {
    isScheduleValid,
    isPickupTimeSlotValid,
    isDeliveryTimeSlotValid,
    formatDateToYyyyMmDd
} from '@/lib/scheduleValidation';
import { ObjectId } from 'mongodb';
import { generateOrderId, generateOrderItemId, generatePaymentId, buildEntityLookupQuery } from '@laundelle/ids';
import { sendOrderConfirmedEmail } from '@/emails';
import { PricingChargeService } from '@/services/PricingChargeService';
import { OrderCustomerEnrichmentService } from './OrderCustomerEnrichmentService';

function generateOrderNumber(): string {
    return generateOrderId();
}

// Locate the appropriate Plant, Plant Manager, and Driver for a given postcode and address
export async function locatePlantAndDriverForOrder(db: any, rawPostcode: string, address: string, now: string) {
    const parsed = parseUkPostcode(rawPostcode || address);
    const candidatePostcode = parsed ? parsed.full : (rawPostcode || '').trim().toUpperCase();
    const normalizedPostcode = parsed ? parsed.full : normalizeUkPostcode(candidatePostcode);

    // 1. Fetch all active plants
    const activePlants = await db.collection('plants').find({ status: { $in: ['ACTIVE', 'active'] } }).toArray();
    let selectedPlant: any = null;

    // A. Match against plant.service_pincodes using exact district/service area matching
    for (const plant of activePlants) {
        const pincodes: string[] = Array.isArray(plant.service_pincodes)
            ? plant.service_pincodes
            : (plant.service_pincodes || '').split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean);

        if (pincodes.length === 0) continue;

        if (isPostcodeInServiceArea(candidatePostcode, pincodes)) {
            selectedPlant = plant;
            break;
        }
    }

    // B. Match via postcode_sectors collection if still not found
    if (!selectedPlant && parsed) {
        const sectorDigit = parsed.inward ? parsed.inward.charAt(0) : '';
        let pcDoc: any = null;

        if (sectorDigit) {
            pcDoc = await db.collection('postcode_sectors').findOne({
                district: parsed.outward,
                sector: sectorDigit,
                is_active: true
            });
        }

        if (!pcDoc) {
            pcDoc = await db.collection('postcode_sectors').findOne({
                district: parsed.outward,
                is_active: true
            });
        }

        if (pcDoc?.plant_id) {
            selectedPlant = activePlants.find((pl: any) => String(pl._id) === String(pcDoc.plant_id) || pl.id === pcDoc.plant_id);
        }
    }

    // Note: Do NOT fallback to an arbitrary plant. If unserviced, selectedPlant remains null.

    // 2. Locate the Plant Manager assigned to this Plant
    let managerId: string | null = selectedPlant?.manager_id || null;
    let managerName: string = 'Plant Manager';
    if (selectedPlant) {
        if (managerId) {
            const mgr = await db.collection('users').findOne({ _id: managerId });
            if (mgr) {
                managerName = mgr.full_name || mgr.name || managerName;
            }
        }
        if (!managerId) {
            const mgr = await db.collection('users').findOne({
                role: { $in: ['manager', 'plant_manager'] },
                $or: [
                    { plant_id: selectedPlant._id },
                    { plant_id: String(selectedPlant._id) },
                    { plantId: selectedPlant._id },
                    { plantId: String(selectedPlant._id) }
                ],
                is_active: true
            });
            if (mgr) {
                managerId = mgr._id;
                managerName = mgr.full_name || mgr.name || managerName;
            }
        }
    }

    // 3. Automatically locate Driver strictly isolated to this Plant
    let selectedDriver: any = null;
    if (selectedPlant) {
        const plantIdStr = String(selectedPlant._id);
        const managerIdStr = managerId ? String(managerId) : null;

        const plantDrivers = await db.collection('users').find({
            role: 'driver',
            status: { $ne: 'suspended' },
            availability: { $nin: ['off-duty', 'offline'] },
            $or: [
                { plant_id: plantIdStr },
                { plant_id: selectedPlant._id },
                { plantId: plantIdStr },
                { plantId: selectedPlant._id },
                ...(managerIdStr ? [{ manager_id: managerIdStr }, { manager_id: managerId }, { plantManagerId: managerIdStr }] : [])
            ]
        }).toArray();

        // Priority 1: Plant drivers specifically assigned to this postcode/district
        const coveringDrivers = plantDrivers.filter((d: any) => {
            const assigned = d.assigned_postcodes || d.assignedSectors || [];
            if (assigned.length === 0) return true; // Driver with empty postcodes covers all plant areas
            return isPostcodeInServiceArea(candidatePostcode, assigned);
        });

        const pool = coveringDrivers.length > 0 ? coveringDrivers : plantDrivers;
        if (pool.length > 0) {
            pool.sort((a: any, b: any) => {
                const aTime = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
                const bTime = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
                return aTime - bTime;
            });
            selectedDriver = pool[0];
        }
    }

    return {
        plant: selectedPlant,
        plantId: selectedPlant?._id || null,
        plantName: selectedPlant?.name || null,
        plantCode: selectedPlant?.code || null,
        managerId,
        managerName,
        driver: selectedDriver,
        driverId: selectedDriver ? String(selectedDriver._id) : null,
        normalizedPostcode: normalizedPostcode || candidatePostcode
    };
}

export class OrderService {
    
    static calculateSlaStatus(order: any, warningThresholdMinutes?: number) {
        return SlaService.calculateOrderSla(order, warningThresholdMinutes);
    }

    public static async getCustomerMatchFilter(customerIdOrSub: string) {
        const db = await getDb();
        const cleanId = (customerIdOrSub || '').trim();
        const possibleIds = new Set<string>([cleanId]);
        
        let userDoc: any = null;
        try {
            const queryConditions: any[] = [
                { _id: cleanId },
                { id: cleanId },
                { customerId: cleanId },
                { publicId: cleanId },
                { auth0UserId: cleanId },
                { auth0_sub: cleanId },
                { email: cleanId.toLowerCase() }
            ];
            if (ObjectId.isValid(cleanId) && cleanId.length === 24) {
                try {
                    queryConditions.push({ _id: new ObjectId(cleanId) });
                } catch {}
            }
            userDoc = await db.collection('users').findOne({ $or: queryConditions } as any);
        } catch {}

        if (userDoc) {
            if (userDoc._id) possibleIds.add(String(userDoc._id));
            if (userDoc.customerId) possibleIds.add(String(userDoc.customerId));
            if (userDoc.publicId) possibleIds.add(String(userDoc.publicId));
            if (userDoc.id) possibleIds.add(String(userDoc.id));
            if (userDoc.auth0UserId) possibleIds.add(String(userDoc.auth0UserId));
            if (userDoc.auth0_sub) possibleIds.add(String(userDoc.auth0_sub));
        }

        const idsArray = Array.from(possibleIds);
        const orConditions: any[] = [
            { customer_id: { $in: idsArray } },
            { customerId: { $in: idsArray } },
            { userId: { $in: idsArray } },
            { user_id: { $in: idsArray } },
            { 'customer.id': { $in: idsArray } }
        ];

        for (const id of idsArray) {
            if (ObjectId.isValid(id) && id.length === 24) {
                try {
                    orConditions.push({ customer_id: new ObjectId(id) });
                    orConditions.push({ customerId: new ObjectId(id) });
                } catch {}
            }
        }

        if (userDoc?.email) {
            orConditions.push({ customerEmail: userDoc.email });
            orConditions.push({ customer_email: userDoc.email });
        }
        return { filter: { $or: orConditions }, userDoc, possibleIds: idsArray };
    }

    static async getOrders(customerId: string) {
        const db = await getDb();
        const { filter } = await this.getCustomerMatchFilter(customerId);
        const orders = await db.collection('orders')
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        const driverIds = Array.from(new Set(
            orders
                .map(o => o.assigned_driver_id || o.driver?.id)
                .filter(Boolean)
        ));

        const driversMap = new Map<string, any>();
        if (driverIds.length > 0) {
            const drivers = await db.collection('users')
                .find({ _id: { $in: driverIds } } as any)
                .toArray();
            drivers.forEach(d => driversMap.set(String(d._id), d));
        }

        return orders.map(o => {
            const driverId = o.assigned_driver_id || o.driver?.id;
            const driverUser = driverId ? driversMap.get(String(driverId)) : null;
            if (driverUser) {
                o.driver_name = driverUser.full_name || o.driver_name || o.driver?.name;
                o.driver_phone = driverUser.phone || o.driver_phone || o.driver?.phone;
                o.driver = {
                    ...(o.driver || {}),
                    id: String(driverUser._id),
                    name: driverUser.full_name,
                    phone: driverUser.phone,
                    vehicle: driverUser.vehicle || o.driver?.vehicle
                };
            } else if (o.driver) {
                o.driver_name = o.driver.name || o.driver_name;
                o.driver_phone = o.driver.phone || o.driver_phone;
            }

            if (!o.delivery_pin && !o.delivery_otp && !o.delivery_pin_enc && !o.delivery_pin_verified_at && !['delivered', 'completed', 'cancelled'].includes(o.status)) {
                const custIdent = String(o.customer_id || o.customerId || customerId || '');
                const newDeliveryPin = generateSecureNumericPin(4);
                const newDeliverySalt = generatePinSalt();
                const newDeliveryHash = hashOrderPin(newDeliveryPin, newDeliverySalt, o.id, custIdent);
                const newDeliveryEnc = encryptOrderPin(newDeliveryPin, o.id, custIdent);

                o.delivery_pin = newDeliveryPin;
                o.delivery_otp = newDeliveryPin;
                o.delivery_pin_hash = newDeliveryHash;
                o.delivery_pin_salt = newDeliverySalt;
                o.delivery_pin_enc = newDeliveryEnc;
                o.delivery_pin_attempts = 0;
                o.delivery_pin_locked = false;

                db.collection('orders').updateOne(
                    { _id: o._id },
                    {
                        $set: {
                            delivery_pin: newDeliveryPin,
                            delivery_otp: newDeliveryPin,
                            delivery_pin_hash: newDeliveryHash,
                            delivery_pin_salt: newDeliverySalt,
                            delivery_pin_enc: newDeliveryEnc,
                            delivery_pin_attempts: 0,
                            delivery_pin_locked: false,
                        }
                    }
                ).catch((err: any) => console.error('[OrderService] Lazy delivery PIN creation error:', err));
            }

            return this.sanitizeOrderForCustomer(o);
        });
    }

    static async getCustomerOrders(customerId: string) {
        return this.getOrders(customerId);
    }

    static async getOrderById(orderId: string, customerId: string) {
        const db = await getDb();
        const orderLookup = buildEntityLookupQuery(orderId, 'order');
        const { filter: custLookup } = await this.getCustomerMatchFilter(customerId);
        const order = await db.collection('orders').findOne({ 
            $and: [orderLookup, custLookup]
        });
        if (!order) throw new NotFoundError('Order not found');

        const driverId = order.assigned_driver_id || order.driver?.id;
        if (driverId) {
            const driverUser = await db.collection('users').findOne({ _id: driverId } as any);
            if (driverUser) {
                order.driver_name = driverUser.full_name || order.driver_name;
                order.driver_phone = driverUser.phone || order.driver_phone;
                order.driver = {
                    ...(order.driver || {}),
                    id: String(driverUser._id),
                    name: driverUser.full_name,
                    phone: driverUser.phone,
                    vehicle: driverUser.vehicle || order.driver?.vehicle
                };
            }
        }

        if (!order.delivery_pin && !order.delivery_otp && !order.delivery_pin_enc && !order.delivery_pin_verified_at && !['delivered', 'completed', 'cancelled'].includes(order.status)) {
            const custIdent = String(order.customer_id || order.customerId || customerId || '');
            const newDeliveryPin = generateSecureNumericPin(4);
            const newDeliverySalt = generatePinSalt();
            const newDeliveryHash = hashOrderPin(newDeliveryPin, newDeliverySalt, order.id, custIdent);
            const newDeliveryEnc = encryptOrderPin(newDeliveryPin, order.id, custIdent);

            order.delivery_pin = newDeliveryPin;
            order.delivery_otp = newDeliveryPin;
            order.delivery_pin_hash = newDeliveryHash;
            order.delivery_pin_salt = newDeliverySalt;
            order.delivery_pin_enc = newDeliveryEnc;
            order.delivery_pin_attempts = 0;
            order.delivery_pin_locked = false;

            await db.collection('orders').updateOne(
                { _id: order._id },
                {
                    $set: {
                        delivery_pin: newDeliveryPin,
                        delivery_otp: newDeliveryPin,
                        delivery_pin_hash: newDeliveryHash,
                        delivery_pin_salt: newDeliverySalt,
                        delivery_pin_enc: newDeliveryEnc,
                        delivery_pin_attempts: 0,
                        delivery_pin_locked: false,
                    }
                }
            );
        }

        return this.sanitizeOrderForCustomer(order);
    }

    public static sanitizeOrderForCustomer(order: any) {
        if (!order) return order;
        const safeOrder = { ...order };
        const custId = String(safeOrder.customer_id || safeOrder.customerId || safeOrder.userId || '');

        // Expose in-app Collection PIN only during active pickup phases
        const pickupPhases = [
            'booking_confirmed',
            'collection_scheduled',
            'driver_assigned',
            'pickup_in_progress',
            'collection_pending',
            'waiting_for_driver',
            'pending_payment',
            'received_at_facility'
        ];
        if (pickupPhases.includes(safeOrder.status) && !safeOrder.pickup_pin_verified_at && !safeOrder.pickup_pin_locked) {
            let pin: string | undefined = undefined;
            if (safeOrder.pickup_pin) {
                pin = String(safeOrder.pickup_pin);
            }
            if (!pin && safeOrder.pickup_otp) {
                pin = String(safeOrder.pickup_otp);
            }
            if (!pin && safeOrder.pickup_pin_enc) {
                const orderIdCandidates = [safeOrder.id, safeOrder.publicId, safeOrder.orderNumber, safeOrder.orderId, String(safeOrder._id || '')].filter(Boolean);
                const custIdCandidates = [custId, safeOrder.customer_id, safeOrder.customerId, safeOrder.userId, safeOrder.user_id].filter(Boolean);
                for (const oId of orderIdCandidates) {
                    for (const cId of custIdCandidates) {
                        const decrypted = decryptOrderPin(safeOrder.pickup_pin_enc, String(oId), String(cId));
                        if (decrypted) {
                            pin = decrypted;
                            break;
                        }
                    }
                    if (pin) break;
                }
            }
            // Never generate ephemeral unpersisted random PINs during read-only response sanitization
            safeOrder.pickup_pin = pin || undefined;
            safeOrder.pickup_otp = pin || undefined; // Backwards compatibility alias
        } else {
            safeOrder.pickup_pin = null;
            safeOrder.pickup_otp = null;
        }

        // Expose in-app Delivery PIN for active orders until delivery is verified
        const isDeliveredOrCancelled = ['delivered', 'completed', 'cancelled'].includes(safeOrder.status) || Boolean(safeOrder.delivery_pin_verified_at);
        if (!isDeliveredOrCancelled && !safeOrder.delivery_pin_locked) {
            let pin: string | undefined = undefined;
            if (safeOrder.delivery_pin) {
                pin = String(safeOrder.delivery_pin);
            }
            if (!pin && safeOrder.delivery_otp) {
                pin = String(safeOrder.delivery_otp);
            }
            if (!pin && safeOrder.delivery_pin_enc) {
                const orderIdCandidates = [safeOrder.id, safeOrder.publicId, safeOrder.orderNumber, safeOrder.orderId, String(safeOrder._id || '')].filter(Boolean);
                const custIdCandidates = [custId, safeOrder.customer_id, safeOrder.customerId, safeOrder.userId, safeOrder.user_id].filter(Boolean);
                for (const oId of orderIdCandidates) {
                    for (const cId of custIdCandidates) {
                        const decrypted = decryptOrderPin(safeOrder.delivery_pin_enc, String(oId), String(cId));
                        if (decrypted) {
                            pin = decrypted;
                            break;
                        }
                    }
                    if (pin) break;
                }
            }
            // Never generate ephemeral unpersisted random PINs during read-only response sanitization
            safeOrder.delivery_pin = pin || undefined;
            safeOrder.delivery_otp = pin || undefined; // Backwards compatibility alias
        } else {
            safeOrder.delivery_pin = null;
            safeOrder.delivery_otp = null;
        }

        // Always redact sensitive cryptographic hashes, salts, and encrypted blobs
        delete safeOrder.pickup_pin_hash;
        delete safeOrder.pickup_pin_salt;
        delete safeOrder.pickup_pin_enc;
        delete safeOrder.delivery_pin_hash;
        delete safeOrder.delivery_pin_salt;
        delete safeOrder.delivery_pin_enc;

        return safeOrder;
    }

    static async createPaidOrderFromCheckout(customerId: string, checkoutData: any, stripeSession: any) {
        const db = await getDb();
        const now = new Date().toISOString();
        const orderData = checkoutData?.orderPayload || checkoutData || {};

        const stripeSessionId = stripeSession?.id || checkoutData?.stripeSessionId || '';
        const paymentIntentId = stripeSession?.payment_intent || '';
        // SECURITY: Always use Stripe's confirmed amount_total (authoritative).
        // Fall back to orderData.total ONLY if Stripe provides no total (should not happen in prod).
        const amountGBP = stripeSession?.amount_total ? stripeSession.amount_total / 100 : (orderData.total || 0);

        // Cross-check: Stripe-confirmed amount vs server-authorized amount stored at checkout creation
        const authorizedAmount = checkoutData?.authorizedAmount ?? orderData?.total;
        if (authorizedAmount && Math.abs(amountGBP - authorizedAmount) > 0.01) {
            console.warn(
                `[OrderService] SECURITY: Stripe-confirmed amount (£${amountGBP.toFixed(2)}) differs from ` +
                `server-authorized amount (£${Number(authorizedAmount).toFixed(2)}) for session ${stripeSessionId}. ` +
                `Using Stripe-confirmed amount. Investigate possible price manipulation.`
            );
        }

        // Idempotency: Check if order already exists for this stripeSessionId
        if (stripeSessionId) {
            const existingOrder = await db.collection('orders').findOne({ stripe_session_id: stripeSessionId });
            if (existingOrder) {
                return existingOrder;
            }
        }

        const requestedOrderId = orderData.id || orderData.publicId || orderData.orderNumber || checkoutData?.orderId || '';
        let orderId = (requestedOrderId && typeof requestedOrderId === 'string' && requestedOrderId.startsWith('ORD-')) ? requestedOrderId : generateOrderNumber();
        const existingOrderWithId = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (existingOrderWithId) {
            if (existingOrderWithId.stripe_session_id === stripeSessionId) {
                return existingOrderWithId;
            }
            orderId = generateOrderNumber();
        }

        // Resolve canonical customerId and internal userId from users collection
        let canonicalCustomerId = customerId;
        let internalUserId = customerId;
        const { userDoc } = await this.getCustomerMatchFilter(customerId);
        if (userDoc) {
            canonicalCustomerId = userDoc.customerId || userDoc.publicId || canonicalCustomerId;
            internalUserId = String(userDoc._id);
        }

        // 1. Postcode extraction, Plant, Plant Manager, and Driver location
        let rawPostcode = orderData.postcode || '';
        if (!rawPostcode && orderData.address) {
            const matches = orderData.address.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i);
            if (matches) rawPostcode = matches[0];
            else {
                const outwardMatch = orderData.address.match(/\b([A-Z]{1,2}[0-9][A-Z0-9]?)\b/i);
                if (outwardMatch) rawPostcode = outwardMatch[0];
            }
        }

        const routing = await locatePlantAndDriverForOrder(db, rawPostcode, orderData.address || '', now);

        const initialStatus = 'booking_confirmed';
        const initialStatusLabel = 'Booking Confirmed';

        // Secure In-App Order PINs
        const pickupPin = generateSecureNumericPin(6);
        const deliveryPin = generateSecureNumericPin(4);
        const pickupPinSalt = generatePinSalt();
        const deliveryPinSalt = generatePinSalt();
        const pickupPinHash = hashOrderPin(pickupPin, pickupPinSalt, orderId, canonicalCustomerId);
        const deliveryPinHash = hashOrderPin(deliveryPin, deliveryPinSalt, orderId, canonicalCustomerId);
        const pickupPinEnc = encryptOrderPin(pickupPin, orderId, canonicalCustomerId);
        const deliveryPinEnc = encryptOrderPin(deliveryPin, orderId, canonicalCustomerId);

        const customerName = orderData.contactDetails
            ? `${orderData.contactDetails.firstName || ''} ${orderData.contactDetails.lastName || ''}`.trim()
            : (orderData.customerName || userDoc?.full_name || userDoc?.name || '');

        const customerEmail = orderData.contactDetails?.email || orderData.customerEmail || stripeSession?.customer_email || userDoc?.email || '';
        const customerPhone = orderData.contactDetails?.phone || orderData.customerPhone || userDoc?.phone || '';

        const newOrder: any = {
            publicId: orderId,
            id: orderId,
            orderNumber: orderId,
            customerId: canonicalCustomerId,
            customer_id: canonicalCustomerId,
            userId: internalUserId,
            user_id: internalUserId,
            plantId: routing.plantId,
            plant_id: routing.plantId,
            staffId: routing.driverId,
            manager_id: routing.managerId,
            plant_name: routing.plantName,
            plant_code: routing.plantCode,
            assigned_driver_id: routing.driverId,
            driver: routing.driver ? {
                id: routing.driverId,
                name: routing.driver.full_name,
                phone: routing.driver.phone || '',
                vehicle: routing.driver.vehicle || 'Van'
            } : null,
            status: initialStatus,
            statusLabel: initialStatusLabel,
            payment_status: 'Paid',
            paymentStatus: 'Paid',
            paymentMethod: 'Pay Online (Stripe)',
            stripe_session_id: stripeSessionId,
            stripe_payment_intent_id: paymentIntentId,
            paidAt: now,
            total: amountGBP,
            address: orderData.address || 'Customer Address',
            postcode: routing.normalizedPostcode || rawPostcode,
            customerName,
            customer_name: customerName,
            customerEmail,
            customer_email: customerEmail,
            customerPhone,
            customer_phone: customerPhone,
            contactDetails: orderData.contactDetails || undefined,
            pickupDate: orderData.pickupDate,
            pickupSlot: orderData.pickupSlot,
            pickupTime: orderData.pickupTime || orderData.pickupSlot,
            deliveryDate: orderData.deliveryDate,
            deliverySlot: orderData.deliverySlot,
            deliveryTime: orderData.deliveryTime || orderData.deliverySlot,
            items: orderData.items || [],
            pickupInstructionType: orderData.pickupInstructionType || 'IN_PERSON',
            pickupInstructionNotes: orderData.pickupInstructionNotes || '',
            deliveryInstructionType: orderData.deliveryInstructionType || 'IN_PERSON',
            deliveryInstructionNotes: orderData.deliveryInstructionNotes || '',
            bookedAt: now,
            pickupDueAt: orderData.pickupDate ? `${orderData.pickupDate}T12:00:00.000Z` : null,
            deliveryDueAt: orderData.deliveryDate ? `${orderData.deliveryDate}T18:00:00.000Z` : null,
            orderItems: (orderData.items || []).map((it: any) => {
                const itemId = generateOrderItemId();
                return {
                    id: itemId,
                    publicId: itemId,
                    orderId,
                    category: it.category || 'General Laundry',
                    description: it.name || 'Garment Item',
                    serviceType: it.serviceType || 'wash_and_fold',
                    quantity: it.quantity || 1,
                    currentStage: 'received_at_facility',
                    qcStatus: 'PENDING',
                    rewashRequired: false,
                    createdAt: now,
                    updatedAt: now
                };
            }),
            createdAt: now,
            updated_at: now,
            pickup_pin: pickupPin,
            pickup_otp: pickupPin,
            pickup_pin_hash: pickupPinHash,
            pickup_pin_salt: pickupPinSalt,
            pickup_pin_enc: pickupPinEnc,
            pickup_pin_attempts: 0,
            pickup_pin_locked: false,
            delivery_pin: deliveryPin,
            delivery_otp: deliveryPin,
            delivery_pin_hash: deliveryPinHash,
            delivery_pin_salt: deliveryPinSalt,
            delivery_pin_enc: deliveryPinEnc,
            delivery_pin_attempts: 0,
            delivery_pin_locked: false,
            timeline_events: [
                {
                    event: 'booking_created',
                    label: 'Booking Created',
                    actor: 'customer',
                    actorId: customerId,
                    timestamp: now
                },
                {
                    event: 'payment_confirmed',
                    label: 'Payment Confirmed via Stripe',
                    stripeSessionId,
                    paymentIntentId: typeof paymentIntentId === 'string' ? paymentIntentId : undefined,
                    amount: amountGBP,
                    currency: stripeSession?.currency?.toUpperCase() || 'GBP',
                    timestamp: now
                },
                {
                    event: 'booking_confirmed',
                    label: 'Booking Confirmed',
                    actor: 'system',
                    timestamp: now
                }
            ]
        };

        if (routing.driverId && routing.driver) {
            newOrder.timeline_events.push({
                event: 'driver_assigned',
                label: `Driver Assigned: ${routing.driver.full_name || routing.driver.name}`,
                actor: 'system',
                driverId: routing.driverId,
                driverName: routing.driver.full_name || routing.driver.name,
                timestamp: now
            });
        }

        // Enrich customer details before persisting
        await OrderCustomerEnrichmentService.enrichOrder(newOrder, db);

        // Insert into MongoDB orders collection
        await db.collection('orders').insertOne(newOrder);

        // Redeem coupon atomically if one was attached to the order
        const couponCodeToRedeem = orderData.couponCode || orderData.coupon_code || orderData.coupon?.code;
        if (couponCodeToRedeem) {
            await PricingChargeService.redeemCoupon(
                couponCodeToRedeem,
                orderId,
                String(customerId),
                stripeSessionId
            ).catch((err) => {
                console.error(`[OrderService] Coupon redemption error for ${couponCodeToRedeem} on order ${orderId}:`, err);
            });
        }

        // Record Financial Payment
        const paymentPublicId = generatePaymentId();
        await db.collection('payments').insertOne({
            publicId: paymentPublicId,
            id: paymentPublicId,
            paymentId: paymentPublicId,
            customerId: customerId,
            customer_id: customerId,
            orderId: orderId,
            order_id: orderId,
            stripe_session_id: stripeSessionId,
            stripe_payment_intent_id: paymentIntentId,
            amount: amountGBP,
            currency: stripeSession?.currency?.toUpperCase() || 'GBP',
            status: 'succeeded',
            payment_method: 'stripe',
            paid_at: now,
            created_at: now
        });

        // Notify Driver
        if (routing.driverId) {
            await db.collection('users').updateOne(
                buildEntityLookupQuery(routing.driverId, 'user') as any,
                { $set: { last_assigned_at: now, availability: 'busy' } }
            );

            await NotificationService.createNotification({
                userId: String(routing.driverId),
                title: '🚚 New Collection Assigned',
                message: `You have been assigned order #${orderId} (${rawPostcode || 'Customer Collection'}).`,
                type: 'driver',
                orderId
            });
        }

        // Notify Plant Manager
        if (routing.managerId) {
            await NotificationService.createNotification({
                userId: String(routing.managerId),
                title: '📦 New Order Confirmed',
                message: `Order #${orderId} (${rawPostcode || ''}) confirmed and assigned to ${routing.driver?.full_name || 'driver'}.`,
                type: 'plant_order',
                orderId
            });
        }

        // Notify Customer
        if (customerId && customerId !== 'guest') {
            await NotificationService.createNotification({
                userId: customerId,
                title: '✅ Booking Confirmed',
                message: `Payment of £${amountGBP.toFixed(2)} received. Your collection for order #${orderId} is confirmed!`,
                type: 'booking',
                orderId,
            });

            await db.collection('users').updateOne(
                buildEntityLookupQuery(customerId, 'user') as any,
                {
                    $inc: { total_orders: 1, lifetime_spend: amountGBP },
                    $set: { last_order_at: now, updated_at: now }
                }
            );
        }

        // Send Order Confirmed Email (Contains order details and Pickup OTP only)
        if (customerEmail) {
            sendOrderConfirmedEmail({
                to: customerEmail,
                orderId,
                customerName: customerName || 'Valued Customer',
                pickupOtp: pickupPin,
                pickupDate: orderData.collectionDate || orderData.pickupDate || 'Tomorrow',
                pickupSlot: orderData.collectionTimeSlot || orderData.pickupSlot || '10:00 AM - 12:00 PM',
                deliveryDate: orderData.deliveryDate || 'In 2 Days',
                deliverySlot: orderData.deliveryTimeSlot || orderData.deliverySlot || '10:00 AM - 12:00 PM',
                pickupAddress: orderData.address || rawPostcode || 'Customer Address',
                items: Array.isArray(orderData.items) ? orderData.items.map((i: any) => ({
                    name: i.name || i.title || 'Garment Item',
                    quantity: i.quantity || 1,
                    price: i.price || i.unitPrice || 0,
                    unit: i.unit,
                    selectedOption: i.selectedOption || i.category
                })) : [],
                subtotal: orderData.subtotal || amountGBP,
                discount: orderData.discount || 0,
                total: amountGBP,
                paymentMethod: 'Card (Stripe Confirmed)',
            }).catch(err => console.error('[OrderService] Order confirmed email error:', err?.message || err));
        }

        // Audit Log
        await AuditService.recordOrderEvent({
            orderId,
            action: 'stripe_payment_confirmed',
            actorId: customerId || 'system',
            actorRole: customerId ? 'customer' : 'system',
            after: { payment_status: 'Paid', status: initialStatus },
            metadata: { amount: amountGBP, stripeSessionId }
        });

        return this.sanitizeOrderForCustomer(newOrder);
    }

    /**
     * Links guest orders to a registered or authenticated customer profile by email.
     */
    static async linkGuestOrdersToCustomer(email: string, canonicalCustomerId: string, internalUserId: string): Promise<number> {
        if (!email || !email.trim()) return 0;
        const db = await getDb();
        const formatted = email.toLowerCase().trim();
        const now = new Date().toISOString();

        const filter = {
            $and: [
                {
                    $or: [
                        { customerEmail: formatted },
                        { customer_email: formatted },
                        { 'contactDetails.email': formatted }
                    ]
                },
                {
                    $or: [
                        { customerId: { $in: ['guest', null, '', undefined] } },
                        { customer_id: { $in: ['guest', null, '', undefined] } },
                        { userId: { $in: ['guest', null, '', undefined] } },
                        { user_id: { $in: ['guest', null, '', undefined] } }
                    ]
                }
            ]
        };

        const result = await db.collection('orders').updateMany(filter as any, {
            $set: {
                customerId: canonicalCustomerId,
                customer_id: canonicalCustomerId,
                userId: internalUserId,
                user_id: internalUserId,
                updated_at: now
            }
        });

        if (result.matchedCount > 0) {
            const guestOrders = await db.collection('orders').find({
                customerId: canonicalCustomerId,
                $or: [{ customerEmail: formatted }, { customer_email: formatted }]
            }).project({ id: 1, publicId: 1 }).toArray();

            const orderIds = guestOrders.flatMap((o: any) => [o.id, o.publicId].filter(Boolean));
            if (orderIds.length > 0) {
                await db.collection('payments').updateMany(
                    { orderId: { $in: orderIds }, customerId: { $in: ['guest', null, ''] } },
                    { $set: { customerId: canonicalCustomerId, customer_id: canonicalCustomerId, updated_at: now } }
                );
            }

            await AuditService.recordEvent({
                entityType: 'customer',
                entityId: canonicalCustomerId,
                action: 'guest_orders_linked',
                actorId: canonicalCustomerId,
                actorRole: 'customer',
                metadata: { email: formatted, orderIds, linkedOrderCount: result.modifiedCount }
            });
        }

        return result.modifiedCount;
    }

    static async createOrder(customerId: string, orderData: any) {
        const db = await getDb();
        const now = new Date().toISOString();

        if (!orderData || !orderData.address) {
            throw new BadRequestError('Invalid order payload. Address is required.');
        }

        // Validate Schedule Server-Side (Never trust client-side validation)
        if (orderData.pickupDate || orderData.deliveryDate) {
            const scheduleCheck = isScheduleValid(
                orderData.pickupDate,
                orderData.pickupSlot || orderData.pickupTime,
                orderData.deliveryDate,
                orderData.deliverySlot || orderData.deliveryTime
            );
            if (!scheduleCheck.valid) {
                throw new BadRequestError(scheduleCheck.error || 'Invalid pickup or delivery schedule.');
            }
        }

        const orderId = (orderData.id && typeof orderData.id === 'string' && orderData.id.startsWith('ORD-')) ? orderData.id : generateOrderNumber();

        // 1. Postcode extraction, Plant, Plant Manager, and Driver location
        let rawPostcode = orderData.postcode || '';
        if (!rawPostcode && orderData.address) {
            const matches = orderData.address.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i);
            if (matches) rawPostcode = matches[0];
            else {
                const outwardMatch = orderData.address.match(/\b([A-Z]{1,2}[0-9][A-Z0-9]?)\b/i);
                if (outwardMatch) rawPostcode = outwardMatch[0];
            }
        }

        const routing = await locatePlantAndDriverForOrder(db, rawPostcode, orderData.address, now);
        if (!routing.plant) {
            throw new BadRequestError('There is no plant in the area available for orders at this time. We currently do not serve this postcode.');
        }

        // 2. Status & Payment Security Check
        const isCash = orderData.paymentMethod === 'Cash on Delivery' || orderData.paymentMethod === 'Cash';
        if (isCash) {
            throw new BadRequestError('Cash on Delivery is not supported. All orders must be placed and paid securely online via Stripe checkout.');
        }
        if (orderData.paymentStatus === 'Paid' || orderData.paymentStatus === 'paid' || orderData.isPaid) {
            throw new BadRequestError('Online orders cannot be directly created as Paid. All online payments must be verified via Stripe Checkout.');
        }

        const initialStatus = 'pending_payment';
        const initialStatusLabel = 'Pending Payment Authorization';
        const isPendingOnlinePayment = initialStatus === 'pending_payment';

        // 3. Cryptographically Secure In-App Order PINs: only generated once payment is completed
        const pickupPin = isPendingOnlinePayment ? null : generateSecureNumericPin(6);
        const deliveryPin = isPendingOnlinePayment ? null : generateSecureNumericPin(4);
        const pickupPinSalt = pickupPin ? generatePinSalt() : null;
        const deliveryPinSalt = deliveryPin ? generatePinSalt() : null;
        const pickupPinHash = pickupPin && pickupPinSalt ? hashOrderPin(pickupPin, pickupPinSalt, orderId, customerId) : null;
        const deliveryPinHash = deliveryPin && deliveryPinSalt ? hashOrderPin(deliveryPin, deliveryPinSalt, orderId, customerId) : null;
        const pickupPinEnc = pickupPin ? encryptOrderPin(pickupPin, orderId, customerId) : null;
        const deliveryPinEnc = deliveryPin ? encryptOrderPin(deliveryPin, orderId, customerId) : null;
        // PINs do not expire: orders may have extended lead times or distant schedules
        const pinExpiryTime = null;

        // 4. Whitelist Order Fields (Mass Assignment Prevention)
        const newOrder: any = {
            publicId: orderId,
            id: orderId,
            orderNumber: orderId,
            customerId: customerId,
            customer_id: customerId,
            userId: customerId,
            user_id: customerId,
            plantId: routing.plantId,
            plant_id: routing.plantId,
            staffId: routing.driverId,
            manager_id: routing.managerId,
            plant_name: routing.plantName,
            plant_code: routing.plantCode,
            assigned_driver_id: routing.driverId,
            driver: routing.driver ? {
                id: routing.driverId,
                name: routing.driver.full_name,
                phone: routing.driver.phone || '',
                vehicle: routing.driver.vehicle || 'Van'
            } : null,
            status: initialStatus,
            statusLabel: initialStatusLabel,
            payment_status: orderData.paymentStatus || 'Pending',
            paymentMethod: orderData.paymentMethod || 'Cash',
            total: orderData.total || 0,
            address: orderData.address,
            postcode: routing.normalizedPostcode,
            customerName: orderData.customerName,
            customer_name: orderData.customerName || orderData.customer_name,
            customerEmail: orderData.customerEmail,
            customer_email: orderData.customerEmail || orderData.customer_email,
            customerPhone: orderData.customerPhone,
            customer_phone: orderData.customerPhone || orderData.customer_phone,
            contactDetails: orderData.contactDetails || undefined,
            pickupDate: orderData.pickupDate,
            pickupSlot: orderData.pickupSlot,
            pickupTime: orderData.pickupTime || orderData.pickupSlot,
            deliveryDate: orderData.deliveryDate,
            deliverySlot: orderData.deliverySlot,
            deliveryTime: orderData.deliveryTime || orderData.deliverySlot,
            items: orderData.items || [],
            // Structured pickup and delivery instructions
            pickupInstructionType: orderData.pickupInstructionType || orderData.pickupInstruction || 'IN_PERSON',
            pickupInstructionNotes: orderData.pickupInstructionNotes || orderData.pickupNotes || '',
            deliveryInstructionType: orderData.deliveryInstructionType || orderData.deliveryInstruction || 'IN_PERSON',
            deliveryInstructionNotes: orderData.deliveryInstructionNotes || orderData.deliveryNotes || '',
            // SLA and lifecycle timestamps
            bookedAt: now,
            pickupDueAt: orderData.pickupDate ? `${orderData.pickupDate}T12:00:00.000Z` : null,
            deliveryDueAt: orderData.deliveryDate ? `${orderData.deliveryDate}T18:00:00.000Z` : null,
            orderItems: (orderData.items || []).map((it: any) => {
                const itemId = generateOrderItemId();
                return {
                    id: itemId,
                    publicId: itemId,
                    orderId,
                    category: it.category || 'General Laundry',
                    description: it.name || 'Garment Item',
                    serviceType: it.serviceType || 'wash_and_fold',
                    quantity: it.quantity || 1,
                    currentStage: 'received_at_facility',
                    qcStatus: 'PENDING',
                    rewashRequired: false,
                    createdAt: now,
                    updatedAt: now
                };
            }),
            createdAt: orderData.createdAt || now,
            updated_at: now,
            pickup_pin: pickupPin,
            pickup_otp: pickupPin,
            pickup_pin_hash: pickupPinHash,
            pickup_pin_salt: pickupPinSalt,
            pickup_pin_enc: pickupPinEnc,
            pickup_pin_attempts: 0,
            pickup_pin_locked: false,
            pickup_pin_expires_at: null,
            delivery_pin: deliveryPin,
            delivery_otp: deliveryPin,
            delivery_pin_hash: deliveryPinHash,
            delivery_pin_salt: deliveryPinSalt,
            delivery_pin_enc: deliveryPinEnc,
            delivery_pin_attempts: 0,
            delivery_pin_locked: false,
            delivery_pin_expires_at: null,
            timeline_events: [
                {
                    event: 'booking_created',
                    label: 'Booking Created',
                    actor: 'customer',
                    actorId: customerId,
                    timestamp: now
                },
                ...(routing.plantName ? [{
                    event: 'plant_forwarded',
                    label: `Routed to Plant: ${routing.plantName}${routing.managerName ? ` (Manager: ${routing.managerName})` : ''}`,
                    actor: 'system',
                    actorId: 'system',
                    plantId: routing.plantId,
                    managerId: routing.managerId,
                    timestamp: now
                }] : []),
                ...(routing.driver && !isPendingOnlinePayment ? [{
                    event: 'driver_assigned',
                    label: `Driver Assigned: ${routing.driver.full_name} (${routing.normalizedPostcode})`,
                    actor: 'system',
                    actorId: 'system',
                    driverId: routing.driverId,
                    timestamp: now
                }] : [])
            ]
        };

        // Compute initial SLA
        newOrder.sla = SlaService.calculateOrderSla(newOrder);

        // Enrich customer details before persisting
        await OrderCustomerEnrichmentService.enrichOrder(newOrder, db);

        // 5. Insert order
        await db.collection('orders').insertOne(newOrder);

        // Update customer stats
        if (!isPendingOnlinePayment) {
            const userQueryId = ObjectId.isValid(customerId) ? new ObjectId(customerId) : customerId;
            await db.collection('users').updateOne(
                { _id: userQueryId as any },
                {
                    $inc: { total_orders: 1, lifetime_spend: newOrder.total },
                    $set: { last_order_at: now, updated_at: now }
                }
            );
        }

        // Audit Log
        await AuditService.recordOrderEvent({
            orderId,
            action: 'order_created',
            actorId: customerId,
            actorRole: 'customer',
            after: { status: initialStatus, total: newOrder.total, address: orderData.address },
            metadata: {
                postcode: routing.normalizedPostcode,
                plantId: routing.plantId,
                managerId: routing.managerId,
                driverId: routing.driverId,
                amount: newOrder.total
            }
        });

        // Customer In-App Notification (PIN is securely accessed only in-app, never broadcast in text/SMS)
        await NotificationService.createNotification({
            userId: customerId,
            title: '🎉 Order Placed Successfully',
            message: `Your order #${orderId} is confirmed. When your driver arrives, show them your secure in-app Collection PIN located in your order details.`,
            type: 'order_created',
            orderId
        });

        // Notifications & Driver state update when order is confirmed
        if (!isPendingOnlinePayment) {
            if (routing.driver) {
                await db.collection('users').updateOne(
                    { _id: routing.driver._id },
                    { $set: { last_assigned_at: now } }
                );

                await NotificationService.createNotification({
                    userId: String(routing.driver._id),
                    title: '📦 New Pickup Assignment',
                    message: `You have been assigned order #${orderId} for collection at ${routing.normalizedPostcode || orderData.address}.`,
                    type: 'driver_assignment',
                    orderId
                });
            }

            if (routing.managerId) {
                await NotificationService.createNotification({
                    userId: String(routing.managerId),
                    title: '🏭 New Order Routed to Your Plant',
                    message: `Order #${orderId} (${routing.normalizedPostcode}) has been forwarded to your plant (${routing.plantName}).`,
                    type: 'order_created',
                    orderId
                });
            }
        }

        const sanitizedOrder = await this.getOrderById(orderId, customerId);
        return sanitizedOrder;
    }

    public static async assignOrderByPostcode(db: any, orderId: string, postcode: string, now: string) {
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) return;

        const routing = await locatePlantAndDriverForOrder(db, postcode || order.postcode, order.address, now);

        if (routing.driver) {
            await db.collection('orders').updateOne(
                { id: orderId },
                {
                    $set: { 
                        plant_id: routing.plantId || order.plant_id,
                        manager_id: routing.managerId || order.manager_id,
                        plant_name: routing.plantName || order.plant_name,
                        assigned_driver_id: routing.driver._id,
                        driver: {
                            id: routing.driverId,
                            name: routing.driver.full_name,
                            phone: routing.driver.phone || '',
                            vehicle: routing.driver.vehicle || 'Van'
                        },
                        status: 'collection_scheduled', 
                        statusLabel: 'Collection Scheduled', 
                        updated_at: now 
                    },
                    $push: {
                        timeline_events: {
                            event: 'driver_assigned',
                            label: `Driver Assigned: ${routing.driver.full_name} (${routing.normalizedPostcode})`,
                            actor: 'system',
                            actorId: 'system',
                            driverId: routing.driverId,
                            timestamp: now
                        }
                    } as any
                }
            );

            await db.collection('users').updateOne(
                { _id: routing.driver._id },
                { $set: { last_assigned_at: now } }
            );

            // Notify Driver
            await NotificationService.createNotification({
                userId: String(routing.driver._id),
                title: '📦 New Pickup Assignment',
                message: `You have been assigned order #${orderId} for collection at postcode ${routing.normalizedPostcode}.`,
                type: 'driver_assignment',
                orderId
            });

            await AuditService.recordOrderEvent({
                orderId,
                action: 'driver_assigned',
                actorId: 'system',
                actorRole: 'system',
                after: { assigned_driver_id: routing.driverId, plant_id: routing.plantId },
                metadata: {
                    driverId: routing.driverId,
                    plantId: routing.plantId,
                    managerId: routing.managerId,
                    postcode: routing.normalizedPostcode
                }
            });
        } else {
            // Unassigned driver handling - order is routed to plant manager
            await db.collection('orders').updateOne(
                { id: orderId },
                {
                    $set: {
                        plant_id: routing.plantId || order.plant_id,
                        manager_id: routing.managerId || order.manager_id,
                        plant_name: routing.plantName || order.plant_name,
                        assigned_driver_id: null,
                        driver: null,
                        status: 'waiting_for_driver',
                        statusLabel: 'Waiting for Driver (Awaiting Plant Driver)',
                        updated_at: now
                    },
                    $push: {
                        timeline_events: {
                            event: 'driver_unassigned_postcode',
                            label: `Awaiting driver assignment under plant: ${routing.plantName || 'Unassigned'}`,
                            actor: 'system',
                            actorId: 'system',
                            timestamp: now
                        }
                    } as any
                }
            );
        }
    }

    static async cancelOrder(customerId: string, orderId: string, reason: string) {
        const db = await getDb();
        const orderLookup = buildEntityLookupQuery(orderId, 'order');
        const { filter: custLookup } = await this.getCustomerMatchFilter(customerId);
        const order = await db.collection('orders').findOne({
            $and: [orderLookup, custLookup]
        });
        if (!order) throw new NotFoundError('Order not found');

        const blockStatuses = ['washing', 'drying', 'folding_steaming', 'qc_ready', 'ready_for_delivery', 'out_for_delivery', 'delivered'];
        if (blockStatuses.includes(order.status)) {
            throw new BadRequestError('Order cannot be cancelled at this stage. Please contact support.');
        }
        
        if (order.status === 'cancelled') {
            return { success: true }; // idempotent
        }

        const canonicalOrderId = order.id || order.publicId || orderId;
        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { _id: order._id } as any,
            {
                $set: { status: 'cancelled', statusLabel: 'Cancelled', cancelledAt: now, cancelReason: reason || 'Customer requested cancellation', updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'order_cancelled',
                        label: 'Order Cancelled',
                        actor: 'customer',
                        actorId: customerId,
                        reason: reason || 'Customer requested',
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId: canonicalOrderId,
            action: 'order_cancelled',
            actorId: customerId,
            actorRole: 'customer',
            before: { status: order.status },
            after: { status: 'cancelled' },
            reason: reason || 'Customer requested'
        });

        return { success: true };
    }

    static async rescheduleOrder(customerId: string, orderId: string, newDate: string, newTime: string) {
        if (!newDate || !newTime) throw new BadRequestError('New date and time are required.');
        const db = await getDb();
        const orderLookup = buildEntityLookupQuery(orderId, 'order');
        const { filter: custLookup } = await this.getCustomerMatchFilter(customerId);
        const order = await db.collection('orders').findOne({
            $and: [orderLookup, custLookup]
        });
        if (!order) throw new NotFoundError('Order not found');

        const allowedStatuses = ['booking_confirmed', 'collection_scheduled'];
        if (!allowedStatuses.includes(order.status)) {
            throw new BadRequestError('Order cannot be rescheduled at this stage.');
        }

        // Validate new collection date & slot
        let normalizedDate = newDate;
        if (newDate === 'Tomorrow') {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            normalizedDate = formatDateToYyyyMmDd(d);
        } else if (newDate === 'In 2 Days') {
            const d = new Date();
            d.setDate(d.getDate() + 2);
            normalizedDate = formatDateToYyyyMmDd(d);
        } else if (newDate === 'In 3 Days') {
            const d = new Date();
            d.setDate(d.getDate() + 3);
            normalizedDate = formatDateToYyyyMmDd(d);
        }

        const slotCheck = isPickupTimeSlotValid(normalizedDate, newTime);
        if (!slotCheck.valid) {
            throw new BadRequestError(slotCheck.error || 'Invalid new pickup slot.');
        }

        if (order.deliveryDate && (order.deliverySlot || order.deliveryTime)) {
            const deliveryCheck = isDeliveryTimeSlotValid(
                normalizedDate,
                newTime,
                order.deliveryDate,
                order.deliverySlot || order.deliveryTime
            );
            if (!deliveryCheck.valid) {
                throw new BadRequestError(`Cannot reschedule collection: ${deliveryCheck.error}`);
            }
        }

        const now = new Date().toISOString();
        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: { pickupDate: newDate, pickupSlot: newTime, pickupTime: newTime, updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'order_rescheduled',
                        label: 'Collection Rescheduled',
                        newDate, newTime,
                        actor: 'customer',
                        actorId: customerId,
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId,
            action: 'order_rescheduled',
            actorId: customerId,
            actorRole: 'customer',
            before: { pickupDate: order.pickupDate, pickupSlot: order.pickupSlot },
            after: { pickupDate: newDate, pickupSlot: newTime },
            metadata: { newDate, newTime }
        });

        return { success: true };
    }

    static async resolveAdditionalCharge(customerId: string, orderId: string, decision: 'accept' | 'reject') {
        if (!['accept', 'reject'].includes(decision)) {
            throw new BadRequestError('Invalid decision.');
        }

        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId, customer_id: customerId });
        if (!order) throw new NotFoundError('Order not found');
        
        // Idempotency check: prevent duplicate submissions
        if (order.additionalCharge?.status === 'accepted' || order.additionalCharge?.status === 'rejected') {
            return { success: true, status: order.additionalCharge.status }; 
        }

        const now = new Date().toISOString();
        const newStatus = decision === 'accept' ? 'accepted' : 'rejected';
        const updatedOrderStatus = decision === 'accept' ? 'sorting' : 'additional_charge_rejected';
        const updatedStatusLabel = decision === 'accept' 
            ? 'Sorting (Charge Accepted)' 
            : 'Additional Charge Rejected • Safe Storage';

        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    'additionalCharge.status': newStatus,
                    'additionalCharge.resolvedAt': now,
                    'additionalCharge.resolvedBy': customerId,
                    status: updatedOrderStatus,
                    statusLabel: updatedStatusLabel,
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: `additional_charge_${newStatus}`,
                        label: `Additional Charge ${decision === 'accept' ? 'Accepted' : 'Rejected'} by Customer`,
                        actor: 'customer',
                        actorId: customerId,
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId,
            action: `additional_charge_${newStatus}`,
            actorId: customerId,
            actorRole: 'customer',
            before: { status: order.status },
            after: { status: updatedOrderStatus, chargeStatus: newStatus },
            metadata: { amount: order.additionalCharge?.additionalAmount }
        });

        if (decision === 'reject') {
            // Create an operational exception for Manager resolution
            await ExceptionService.createException({
                orderId,
                type: 'additional_charge_rejected',
                priority: 'HIGH',
                plantId: order.plant_id,
                description: `Customer rejected additional overweight charge of £${order.additionalCharge?.additionalAmount || 0}. Garments must be held safely pending resolution.`,
                evidence: {
                    originalWeight: order.additionalCharge?.originalAmount,
                    additionalAmount: order.additionalCharge?.additionalAmount,
                    reason: order.additionalCharge?.reason
                }
            });

            // Notify plant manager & staff
            if (order.plant_id) {
                const manager = await db.collection('users').findOne({ plant_id: order.plant_id, role: { $in: ['manager', 'admin'] } });
                if (manager) {
                    await NotificationService.createNotification({
                        userId: String(manager._id),
                        title: '⚠️ Additional Charge Rejected',
                        message: `Order #${orderId}: Customer rejected overweight surcharge. Order is placed in Safe Storage.`,
                        type: 'urgent',
                        orderId
                    });
                }
            }

            // Notify customer
            await NotificationService.createNotification({
                userId: customerId,
                title: 'Additional Charge Rejected',
                message: `You declined the additional charge for order #${orderId}. Your items are held safely while our team reviews the options.`,
                type: 'charge',
                orderId
            });
        } else {
            // Decision is accept: order progresses to sorting
            // Notify customer
            await NotificationService.createNotification({
                userId: customerId,
                title: 'Additional Charge Confirmed',
                message: `Thank you! The surcharge for order #${orderId} was confirmed and processing has resumed.`,
                type: 'charge',
                orderId
            });
        }

        return { success: true, newOrderStatus: updatedOrderStatus };
    }

    static async respondToAdditionalCharge(orderId: string, customerId: string, decision: 'accept' | 'reject') {
        return this.resolveAdditionalCharge(customerId, orderId, decision);
    }

    /**
     * Resolve a rejected additional charge by a Manager/Admin
     */
    static async resolveRejectedAdditionalCharge(
        managerId: string,
        managerRole: string,
        orderId: string,
        resolutionAction: 'accept_original' | 'adjust_service' | 'cancel_order' | 'custom',
        notes: string,
        adjustedAmount?: number
    ) {
        const normalizedRole = (managerRole || '').toLowerCase().trim();
        if (!['manager', 'admin', 'super_admin'].includes(normalizedRole)) {
            throw new ForbiddenError('Access Denied: Manager or Admin role required.');
        }

        const db = await getDb();
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found');

        const now = new Date().toISOString();
        let targetStatus = 'sorting';
        let targetLabel = 'Sorting';

        if (resolutionAction === 'cancel_order') {
            targetStatus = 'cancelled';
            targetLabel = 'Cancelled by Manager';
        } else if (resolutionAction === 'adjust_service') {
            targetStatus = 'sorting';
            targetLabel = 'Sorting (Adjusted Service)';
        }

        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: {
                    status: targetStatus,
                    statusLabel: targetLabel,
                    'additionalCharge.resolution': {
                        action: resolutionAction,
                        notes,
                        adjustedAmount: adjustedAmount || 0,
                        resolvedBy: managerId,
                        resolvedAt: now
                    },
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: 'additional_charge_resolution',
                        label: `Additional Charge Dispute Resolved: ${resolutionAction} by ${managerRole}`,
                        actor: managerRole,
                        actorId: managerId,
                        notes,
                        timestamp: now
                    }
                } as any
            }
        );

        // Resolve open exception
        const openEx = await db.collection('exceptions').findOne({ orderId, type: 'additional_charge_rejected', status: { $ne: 'RESOLVED' } });
        if (openEx) {
            await ExceptionService.resolveException(openEx.id, managerId, managerRole, resolutionAction, notes);
        }

        await AuditService.recordOrderEvent({
            orderId,
            action: 'additional_charge_manager_resolution',
            actorId: managerId,
            actorRole: managerRole,
            before: { status: order.status },
            after: { status: targetStatus },
            reason: notes,
            metadata: { resolutionAction, adjustedAmount }
        });

        return { success: true, orderStatus: targetStatus };
    }

    // ----------------------------------------------------------------------
    // ADMIN METHODS
    // ----------------------------------------------------------------------
    static async getAdminOrders(adminRole: string, _adminId?: string, managerPlantId?: string) {
        const db = await getDb();
        
        // If manager, restrict to their plant. If admin, return all.
        let filter: any = {};
        if (adminRole === 'manager') {
            if (!managerPlantId) throw new ForbiddenError('Manager has no assigned plant.');
            filter.plant_id = managerPlantId;
        } else if (adminRole !== 'admin' && adminRole !== 'super_admin') {
            // Technically drivers/processors might need this, but legacy had them under specific queries.
            // Let's allow if needed, but restrict.
        }

        return db.collection('orders')
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(200) // safety limit
            .toArray();
    }

    static async adminUpdateOrderStatus(adminId: string, adminRole: string, managerPlantId: string | null | undefined, orderId: string, newStatus: string, reason?: string) {
        const normalizedRole = (adminRole || '').toLowerCase().trim();
        if (normalizedRole !== 'admin' && normalizedRole !== 'super_admin') {
            throw new ForbiddenError('Access Denied: Admin authorization required for direct status override');
        }

        const db = await getDb();
        
        const order = await db.collection('orders').findOne({ id: orderId });
        if (!order) throw new NotFoundError('Order not found');

        const now = new Date().toISOString();
        const statusLabel = newStatus.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

        await db.collection('orders').updateOne(
            { id: orderId },
            {
                $set: { status: newStatus, statusLabel, updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'admin_status_override',
                        label: `Status updated to: ${statusLabel}`,
                        actor: 'admin',
                        actorId: adminId,
                        reason: reason || 'Admin manual override',
                        timestamp: now
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId,
            action: 'admin_order_status_override',
            actorId: adminId,
            actorRole: adminRole,
            before: { status: order.status },
            after: { status: newStatus },
            reason: reason || 'Admin manual override'
        });

        return { success: true };
    }

    static async submitOrderRating(customerId: string, orderId: string, rating?: number | null, feedback?: string) {
        const db = await getDb();
        const orderLookup = buildEntityLookupQuery(orderId, 'order');
        const order = await db.collection('orders').findOne(orderLookup);
        if (!order) throw new NotFoundError('Order not found');

        let validRating: number | null = null;
        if (rating !== undefined && rating !== null && (rating as any) !== '') {
            const num = Number(rating);
            if (!isNaN(num) && num >= 1 && num <= 5) {
                validRating = Math.round(num);
            }
        }

        const cleanFeedback = typeof feedback === 'string' ? feedback.trim() : '';
        const now = new Date().toISOString();
        const customerName = order.contactDetails?.firstName 
            ? `${order.contactDetails.firstName} ${order.contactDetails.lastName || ''}`.trim()
            : (order.customer_name || order.customerName || 'Customer');

        const ratingData = {
            rating: validRating,
            feedback: cleanFeedback,
            createdAt: now,
            customerName
        };

        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: {
                    rating: validRating,
                    ratingFeedback: cleanFeedback,
                    ratingSubmittedAt: now,
                    customerRating: ratingData,
                    updated_at: now
                },
                $push: {
                    timeline_events: {
                        event: 'order_rated',
                        label: validRating ? `Customer submitted ${validRating}-star rating` : 'Customer submitted feedback',
                        actor: 'customer',
                        actorId: customerId,
                        timestamp: now,
                        rating: validRating,
                        feedback: cleanFeedback
                    }
                } as any
            }
        );

        await AuditService.recordOrderEvent({
            orderId: order.id || orderId,
            action: 'customer_order_rating',
            actorId: customerId,
            actorRole: 'customer',
            before: { rating: order.rating, feedback: order.ratingFeedback },
            after: { rating: validRating, feedback: cleanFeedback },
            reason: cleanFeedback || (validRating ? `Customer rated ${validRating} stars` : 'Feedback updated')
        });

        const updatedOrder = await db.collection('orders').findOne({ _id: order._id });
        return { success: true, order: updatedOrder, rating: ratingData };
    }
}
