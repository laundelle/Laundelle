import { NotificationService } from '@/services/NotificationService';
import { getDb } from '@/lib/mongodb';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { AuditService } from '@/services/AuditService';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { OrderService, locatePlantAndDriverForOrder } from '@/services/OrderService';
import { generatePaymentId, buildEntityLookupQuery } from '@laundelle/ids';
import {
  generateSecureNumericPin,
  generatePinSalt,
  hashOrderPin,
  encryptOrderPin,
} from '@/lib/orderPin';
import { PricingChargeService } from '@/services/PricingChargeService';
import { sendOrderConfirmedEmail } from '@/emails';

export class PaymentService {
    private static getStripe(): Stripe {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
        return new Stripe(key, { apiVersion: (process.env.STRIPE_API_VERSION || '2025-06-30.basil') as any });
    }

    /**
     * READ-ONLY verification for the Stripe redirect fallback (confirm-session endpoint).
     *
     * SECURITY DESIGN:
     * - Verifies payment status with Stripe API.
     * - ONLY looks up an order already created by the webhook (checkout.session.completed).
     * - NEVER creates orders. Order creation is EXCLUSIVE to the webhook handler.
     * - If the webhook has not yet processed the event, returns { status: 'pending' }.
     *
     * This ensures that if the webhook is not running, no order is ever confirmed.
     */
    static async verifySessionPayment(sessionId: string, authenticatedUserId?: string, authUser?: any): Promise<{
        status: 'paid' | 'pending' | 'unpaid' | 'error';
        order?: any;
        message?: string;
    }> {
        if (!sessionId) return { status: 'error', message: 'No session ID provided.' };

        // STRIPE_WEBHOOK_SECRET must be set - this proves the server is configured for webhooks
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret || webhookSecret.trim() === '' || webhookSecret === 'whsec_YOUR_STRIPE_WEBHOOK_SIGNING_SECRET') {
            console.error('[PaymentService] STRIPE_WEBHOOK_SECRET is not configured.');
            return { status: 'error', message: 'Payment system is not configured. Please contact support.' };
        }

        try {
            const stripe = this.getStripe();
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (!session || session.payment_status !== 'paid') {
                return { status: session?.payment_status === 'unpaid' ? 'unpaid' : 'unpaid', message: 'Payment has not been completed.' };
            }

            // Checkout sessions are private payment credentials. Bind the redirect
            // verification to the same authenticated customer that created it.
            const sessionUserId = session.metadata?.userId;
            const validUserIds = [
                authenticatedUserId,
                authUser?.sub,
                authUser?.userId,
                authUser?.id,
                authUser?.publicId,
                authUser?.auth0UserId,
            ].filter(Boolean).map(String);

            const customerEmail = session.customer_details?.email || session.customer_email;
            const userEmail = authUser?.email;
            const emailMatches = Boolean(customerEmail && userEmail && customerEmail.toLowerCase() === userEmail.toLowerCase());

            if (sessionUserId && validUserIds.length > 0 && !validUserIds.includes(String(sessionUserId)) && !emailMatches) {
                return { status: 'error', message: 'This checkout session does not belong to the signed-in customer.' };
            }

            const now = new Date().toISOString();
            const db = await getDb();
            const targetOrderId = session.metadata?.orderId;

            // 1. Look up existing order in orders collection
            let existingOrder = await db.collection('orders').findOne({
                $or: [
                    { stripe_session_id: sessionId },
                    { stripeSessionId: sessionId },
                    ...(targetOrderId ? [{ id: targetOrderId }, { publicId: targetOrderId }] : []),
                ]
            });

            if (existingOrder) {
                let orderToReturn = existingOrder;
                const isAlreadyPaid = existingOrder.payment_status === 'Paid' || existingOrder.paymentStatus === 'Paid' || existingOrder.isPaid;

                if (!isAlreadyPaid) {
                    console.log(`[PaymentService] verifySessionPayment: Stripe confirms session ${sessionId} is paid. Updating existing order ${existingOrder.id} to Paid.`);
                    orderToReturn = await this.updateExistingOrderToPaid(db, existingOrder, session, now);
                    const checkoutId = session.metadata?.checkoutId;
                    if (checkoutId) {
                        await db.collection('pending_checkouts').deleteOne({ _id: checkoutId as any }).catch(() => {});
                    }
                    await db.collection('pending_checkouts').deleteMany({ stripeSessionId: sessionId }).catch(() => {});
                }

                if (!orderToReturn.pickup_pin && !orderToReturn.pickup_otp && !orderToReturn.pickup_pin_enc) {
                    const custIdent = String(orderToReturn.customer_id || orderToReturn.customerId || authenticatedUserId || sessionUserId || '');
                    const newPickupPin = generateSecureNumericPin(6);
                    const newSalt = generatePinSalt();
                    const newHash = hashOrderPin(newPickupPin, newSalt, orderToReturn.id, custIdent);
                    const newEnc = encryptOrderPin(newPickupPin, orderToReturn.id, custIdent);

                    await db.collection('orders').updateOne(
                        { _id: orderToReturn._id },
                        {
                            $set: {
                                pickup_pin_hash: newHash,
                                pickup_pin_salt: newSalt,
                                pickup_pin_enc: newEnc,
                                pickup_pin_attempts: 0,
                                pickup_pin_locked: false,
                            }
                        }
                    );
                    orderToReturn = await db.collection('orders').findOne({ _id: orderToReturn._id });
                }

                if (!orderToReturn.delivery_pin && !orderToReturn.delivery_otp && !orderToReturn.delivery_pin_enc) {
                    const custIdent = String(orderToReturn.customer_id || orderToReturn.customerId || authenticatedUserId || sessionUserId || '');
                    const newDeliveryPin = generateSecureNumericPin(4);
                    const newDeliverySalt = generatePinSalt();
                    const newDeliveryHash = hashOrderPin(newDeliveryPin, newDeliverySalt, orderToReturn.id, custIdent);
                    const newDeliveryEnc = encryptOrderPin(newDeliveryPin, orderToReturn.id, custIdent);

                    await db.collection('orders').updateOne(
                        { _id: orderToReturn._id },
                        {
                            $set: {
                                delivery_pin_hash: newDeliveryHash,
                                delivery_pin_salt: newDeliverySalt,
                                delivery_pin_enc: newDeliveryEnc,
                                delivery_pin_attempts: 0,
                                delivery_pin_locked: false,
                            }
                        }
                    );
                    orderToReturn = await db.collection('orders').findOne({ _id: orderToReturn._id });
                }

                return { status: 'paid', order: OrderService.sanitizeOrderForCustomer(orderToReturn) };
            }

            // 2. Check pending_checkouts collection
            const checkoutId = session.metadata?.checkoutId;
            let pendingCheckout = null;
            if (checkoutId) {
                pendingCheckout = await db.collection('pending_checkouts').findOne({ _id: checkoutId as any });
            }
            if (!pendingCheckout) {
                pendingCheckout = await db.collection('pending_checkouts').findOne({ stripeSessionId: sessionId });
            }

            if (pendingCheckout) {
                // Webhook is the authoritative path for order creation (amount reconciliation happens there).
                // Do NOT create the order here — return pending so the client polls until the webhook fires.
                console.log(`[PaymentService] verifySessionPayment: Paid session ${sessionId} has a pending checkout. Awaiting webhook to create order authoritatively.`);
                return {
                    status: 'pending',
                    message: 'Payment received. Your order confirmation is being processed — please wait a moment and refresh.'
                };
            }

            console.warn(`[PaymentService] verifySessionPayment: Stripe reports paid for ${sessionId} but no order found in DB.`);
            return {
                status: 'pending',
                message: 'Payment received by Stripe, but your order confirmation is still being processed. Please wait a moment.'
            };
        } catch (e: any) {
            console.error('[PaymentService] verifySessionPayment error:', e);
            return { status: 'error', message: e.message || 'Failed to verify payment status.' };
        }
    }

    /**
     * Asserts that the Stripe webhook infrastructure is operational before creating a checkout session.
     * Guarantees STRIPE_WEBHOOK_SECRET is set and valid without blocking on webhookEndpoints.list
     * (which breaks local CLI development and restricted API keys).
     */
    static async assertWebhookOperational(): Promise<void> {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret || webhookSecret.trim() === '' || webhookSecret === 'whsec_YOUR_STRIPE_WEBHOOK_SIGNING_SECRET') {
            throw new BadRequestError('Payment system configuration error: STRIPE_WEBHOOK_SECRET is not configured on the server. Checkout cannot proceed without webhook security.');
        }

        try {
            const stripe = this.getStripe();
            if (!stripe) {
                throw new BadRequestError('Stripe API client is not initialized.');
            }
        } catch (e: any) {
            if (e instanceof BadRequestError) throw e;
            console.error('[PaymentService] Unable to verify Stripe configuration:', e.message);
            throw new BadRequestError('Payment rejected: Unable to verify Stripe payment gateway configuration.');
        }
    }

    /**
     * Creates a Stripe Checkout Session purely based on the server-side authoritative Order total.
     */
    static async createCheckoutSession(userId: string, orderId: string, origin: string) {
        if (!orderId) throw new BadRequestError('Missing required parameter: orderId');

        await this.assertWebhookOperational();

        const db = await getDb();
        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));

        if (!order) throw new NotFoundError('Order not found');
        if (order.customer_id !== userId && order.customerId !== userId) throw new ForbiddenError('Access denied: You do not own this order');
        if (order.payment_status === 'Paid') throw new BadRequestError('Order is already paid');

        // Authoritative amount calculation
        // For Laundelle, the order.total is computed at creation.
        // Even if we wanted to recount from order.items, the db document is the source of truth, not the frontend request.
        const amount = order.total || 0;
        if (amount <= 0) throw new BadRequestError('Invalid order total for payment');

        const canonicalOrderId = order.publicId || order.orderNumber || order.id || orderId;

        const line_items = [{
            price_data: {
                currency: 'gbp',
                product_data: {
                    name: `Laundelle Order #${canonicalOrderId}`,
                },
                unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
        }];

        const stripe = this.getStripe();
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: `${origin}/orders?payment=verify&orderId=${canonicalOrderId}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/orders?payment=cancel&orderId=${canonicalOrderId}`,
            customer_email: order.customerEmail || undefined,
            metadata: {
                orderId: canonicalOrderId,
                internalOrderId: order.id || String(order._id),
                userId,
            },
        });

        // Audit the checkout session initiation
        await AuditService.recordOrderEvent({
            orderId,
            action: 'stripe_checkout_initiated',
            actorId: userId,
            actorRole: 'customer',
            metadata: { amount, stripeSessionId: session.id }
        });

        return { sessionId: session.id, url: session.url };
    }

    /**
     * Handles the Stripe Webhook, verifies signatures, and applies idempotent state updates.
     */
    static async handleStripeWebhook(rawBody: string, signature: string | null) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        // Security requirement: STRIPE_WEBHOOK_SECRET is mandatory in ALL environments (dev & prod)
        if (!webhookSecret || webhookSecret.trim() === '' || webhookSecret === 'whsec_YOUR_STRIPE_WEBHOOK_SIGNING_SECRET') {
            console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured. Webhook rejected for security.');
            throw new BadRequestError('STRIPE_WEBHOOK_SECRET is not configured. Webhook rejected for security.');
        }

        if (!signature) {
            throw new BadRequestError('Missing stripe-signature header');
        }

        let event: Stripe.Event;
        try {
            const stripe = this.getStripe();
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: any) {
            console.error('[Stripe Webhook] Signature verification failed:', err.message);
            throw new BadRequestError(`Webhook signature verification failed: ${err.message}`);
        }

        const db = await getDb();
        const now = new Date().toISOString();

        // Persist lifecycle state, not merely receipt. Recording an event before its
        // side effects finish used to make a transient database error permanent: the
        // next Stripe retry saw the event and skipped order creation.
        try {
            await db.collection('stripe_events').insertOne({
                _id: event.id as any,
                type: event.type,
                status: 'processing',
                receivedAt: now,
                attempts: 1
            });
        } catch (e: any) {
            if (e.code === 11000) {
                const previousEvent = await db.collection('stripe_events').findOne({ _id: event.id as any });
                if (previousEvent?.status === 'completed') {
                    console.log(`[Stripe Webhook] Event ${event.id} already processed. Idempotency triggered.`);
                    return { received: true, idempotent: true };
                }

                // A previous delivery failed partway through. The order/payment writes
                // below are themselves keyed by Stripe IDs, so replaying is safe.
                await db.collection('stripe_events').updateOne(
                    { _id: event.id as any },
                    { $set: { status: 'processing', retryStartedAt: now }, $inc: { attempts: 1 } }
                );
            } else {
                throw e;
            }
        }

        console.log(`[Stripe Webhook] Processing verified new event: ${event.type}`);

        try {
            if (event.type === 'checkout.session.completed') {
                await this.processCheckoutCompleted(db, event.data.object as Stripe.Checkout.Session, now);
            } else if (event.type === 'payment_intent.payment_failed') {
                await this.processPaymentFailed(db, event.data.object as Stripe.PaymentIntent, now);
            }
            await db.collection('stripe_events').updateOne(
                { _id: event.id as any },
                { $set: { status: 'completed', processedAt: new Date().toISOString() } }
            );
        } catch (error: any) {
            await db.collection('stripe_events').updateOne(
                { _id: event.id as any },
                { $set: { status: 'failed', failedAt: new Date().toISOString(), error: error.message || 'Unknown processing error' } }
            ).catch(() => {});
            throw error;
        }

        return { received: true };
    }

    private static async processCheckoutCompleted(db: any, session: Stripe.Checkout.Session, now: string) {
        // A signed Checkout event is not by itself proof that money was collected.
        // In particular, delayed payment methods can emit checkout.session.completed
        // while the session remains unpaid. No order may be created until Stripe marks
        // this session paid.
        if (session.payment_status !== 'paid') {
            console.warn(`[Stripe Webhook] Ignoring unpaid Checkout Session ${session.id}.`);
            return null;
        }

        const checkoutId = session.metadata?.checkoutId;
        const orderId = session.metadata?.orderId;
        const userId = session.metadata?.userId || 'guest';
        const stripeSessionId = session.id;

        // 1. Idempotency Check: if order already exists for this stripeSessionId and is paid, return existing
        const existingOrder = await db.collection('orders').findOne({ stripe_session_id: stripeSessionId });
        if (existingOrder) {
            if (existingOrder.payment_status === 'Paid' || existingOrder.paymentStatus === 'Paid' || existingOrder.isPaid) {
                return existingOrder;
            }
            const updated = await this.updateExistingOrderToPaid(db, existingOrder, session, now);
            if (checkoutId) {
                await db.collection('pending_checkouts').deleteOne({ _id: checkoutId }).catch(() => {});
            }
            await db.collection('pending_checkouts').deleteMany({ stripeSessionId: stripeSessionId }).catch(() => {});
            return updated;
        }

        // 2. Check pending_checkouts collection
        let pendingCheckout = null;
        if (checkoutId) {
            pendingCheckout = await db.collection('pending_checkouts').findOne({ _id: checkoutId });
        }
        if (!pendingCheckout) {
            pendingCheckout = await db.collection('pending_checkouts').findOne({ stripeSessionId: stripeSessionId });
        }

        if (pendingCheckout) {
            if (pendingCheckout.status !== 'pending') {
                console.warn(`[Stripe Webhook] Checkout ${checkoutId || stripeSessionId} is not pending; refusing order creation.`);
                return null;
            }

            if (pendingCheckout.stripeSessionId && pendingCheckout.stripeSessionId !== stripeSessionId) {
                console.error(`[Stripe Webhook] Checkout/session mismatch for ${checkoutId}.`);
                return null;
            }

            if (pendingCheckout.expiresAt && new Date(pendingCheckout.expiresAt).getTime() < Date.now()) {
                await db.collection('pending_checkouts').updateOne(
                    { _id: pendingCheckout._id },
                    { $set: { status: 'expired', updatedAt: now } }
                );
                console.warn(`[Stripe Webhook] Checkout ${checkoutId || stripeSessionId} expired before payment confirmation.`);
                return null;
            }

            const authorizedAmount = Number(pendingCheckout.authorizedAmount);
            const paidAmount = Number(session.amount_total || 0) / 100;
            if (!Number.isFinite(authorizedAmount) || Math.abs(authorizedAmount - paidAmount) > 0.01) {
                await db.collection('pending_checkouts').updateOne(
                    { _id: pendingCheckout._id },
                    { $set: { status: 'amount_mismatch', updatedAt: now } }
                );
                console.error(`[Stripe Webhook] Amount mismatch for session ${stripeSessionId}; refusing order creation.`);
                return null;
            }

            // Check if this checkout belongs to an existing order in the database
            const targetOrderId = pendingCheckout.orderPayload?.id || pendingCheckout.orderPayload?._id || orderId;
            let existingDbOrder = null;
            if (targetOrderId) {
                existingDbOrder = await db.collection('orders').findOne(buildEntityLookupQuery(targetOrderId, 'order'));
            }

            if (existingDbOrder) {
                await db.collection('pending_checkouts').deleteOne({ _id: pendingCheckout._id });
                return await this.updateExistingOrderToPaid(db, existingDbOrder, session, now);
            }

            const createdOrder = await OrderService.createPaidOrderFromCheckout(
                pendingCheckout.userId || userId,
                pendingCheckout,
                session
            );
            await db.collection('pending_checkouts').deleteOne({ _id: pendingCheckout._id });
            return createdOrder;
        }

        // 3. Fallback for existing order matching orderId
        if (orderId) {
            const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
            if (!order) {
                console.error(`[Stripe Webhook] Neither pending checkout (${checkoutId}) nor order (${orderId}) found in database.`);
                return null;
            }
            return await this.updateExistingOrderToPaid(db, order, session, now);
        }
    }


    private static async updateExistingOrderToPaid(db: any, order: any, session: Stripe.Checkout.Session, now: string) {
        const orderId = order.id || String(order._id);
        const stripeSessionId = session.id;
        const paymentIntentId = session.payment_intent;
        const amountGBP = session.amount_total ? session.amount_total / 100 : (order.total || 0);
        const userId = session.metadata?.userId || order.customer_id || order.userId || order.user_id || 'guest';

        let assignedDriverId = order.assigned_driver_id || order.driver?.id || null;
        let assignedDriver = order.driver || null;
        let plantId = order.plant_id || null;
        let managerId = order.manager_id || null;
        let plantName = order.plant_name || null;
        let plantCode = order.plant_code || null;

        // If plant or driver wasn't assigned at order creation, locate now based on postcode/address
        if (!plantId || !assignedDriverId) {
            const rawPostcode = order.postcode || order.address?.postcode || '';
            const rawAddress = typeof order.address === 'string' ? order.address : `${order.address?.line1 || ''} ${order.address?.city || ''} ${order.address?.postcode || ''}`;
            const routing = await locatePlantAndDriverForOrder(db, rawPostcode, rawAddress, now);
            if (!plantId && routing.plantId) {
                plantId = routing.plantId;
                plantName = routing.plantName;
                plantCode = routing.plantCode;
                managerId = routing.managerId;
            }
            if (!assignedDriverId && routing.driverId && routing.driver) {
                assignedDriverId = routing.driverId;
                assignedDriver = {
                    id: routing.driverId,
                    name: routing.driver.full_name,
                    phone: routing.driver.phone || '+44 7700 900123',
                    vehicle: routing.driver.vehicle || 'Logistics Van',
                    rating: routing.driver.rating || 4.9,
                    avatar: routing.driver.avatar_url,
                    estimatedArrival: 'Tomorrow'
                };
            }
        }

        const status = 'booking_confirmed';
        const statusLabel = 'Booking Confirmed';

        let pickupPin = order.pickup_pin || order.pickup_otp;
        let deliveryPin = order.delivery_pin || order.delivery_otp;
        const customerIdentifier = String(order.customer_id || order.customerId || userId || '');

        const updateOps: any = {
            $set: {
                payment_status: 'Paid',
                paymentStatus: 'Paid',
                isPaid: true,
                stripe_session_id: stripeSessionId,
                stripe_payment_intent_id: paymentIntentId,
                paidAt: now,
                status: status,
                statusLabel: statusLabel,
                updated_at: now
            },
            $push: {
                timeline_events: {
                    event: 'booking_confirmed',
                    label: 'Booking Confirmed',
                    actor: 'system',
                    timestamp: now
                }
            }
        };

        if (!pickupPin) {
            pickupPin = generateSecureNumericPin(6);
            const pickupPinSalt = generatePinSalt();
            const pickupPinHash = hashOrderPin(pickupPin, pickupPinSalt, orderId, customerIdentifier);
            const pickupPinEnc = encryptOrderPin(pickupPin, orderId, customerIdentifier);

            updateOps.$set.pickup_pin_hash = pickupPinHash;
            updateOps.$set.pickup_pin_salt = pickupPinSalt;
            updateOps.$set.pickup_pin_enc = pickupPinEnc;
            updateOps.$set.pickup_pin_attempts = 0;
            updateOps.$set.pickup_pin_locked = false;
        }

        if (!deliveryPin) {
            deliveryPin = generateSecureNumericPin(4);
            const deliveryPinSalt = generatePinSalt();
            const deliveryPinHash = hashOrderPin(deliveryPin, deliveryPinSalt, orderId, customerIdentifier);
            const deliveryPinEnc = encryptOrderPin(deliveryPin, orderId, customerIdentifier);

            updateOps.$set.delivery_pin_hash = deliveryPinHash;
            updateOps.$set.delivery_pin_salt = deliveryPinSalt;
            updateOps.$set.delivery_pin_enc = deliveryPinEnc;
            updateOps.$set.delivery_pin_attempts = 0;
            updateOps.$set.delivery_pin_locked = false;
        }

        updateOps.$push = {

            timeline_events: {
                $each: [
                    {
                        event: 'payment_confirmed',
                        label: 'Payment Confirmed via Stripe',
                        stripeSessionId,
                        paymentIntentId: typeof paymentIntentId === 'string' ? paymentIntentId : undefined,
                        amount: amountGBP,
                        currency: session.currency?.toUpperCase() || 'GBP',
                        timestamp: now
                    }
                ]
            }
        };


        if (plantId && plantId !== order.plant_id) {
            updateOps.$set.plant_id = plantId;
            updateOps.$set.plant_name = plantName;
            updateOps.$set.plant_code = plantCode;
            updateOps.$set.manager_id = managerId;
            updateOps.$push.timeline_events.$each.push({
                event: 'plant_forwarded',
                label: `Routed to Plant: ${plantName || plantId}`,
                actor: 'system',
                plantId,
                managerId,
                timestamp: now
            });
        }

        if (assignedDriverId && assignedDriver) {
            updateOps.$set.assigned_driver_id = assignedDriverId;
            updateOps.$set.driver = assignedDriver;
            const alreadyHasDriverEvent = (order.timeline_events || []).some((e: any) => e.event === 'driver_assigned');
            if (!alreadyHasDriverEvent) {
                updateOps.$push.timeline_events.$each.push({
                    event: 'driver_assigned',
                    label: `Driver Assigned: ${assignedDriver.name}`,
                    actor: 'system',
                    driverId: assignedDriverId,
                    driverName: assignedDriver.name,
                    timestamp: now
                });
            }
        }

        // 1. Update Order Status in Database
        await db.collection('orders').updateOne(
            { _id: order._id },
            updateOps
        );

        // Notify assigned driver and manager
        if (assignedDriverId) {
            await db.collection('users').updateOne(
                buildEntityLookupQuery(assignedDriverId, 'user') as any,
                { $set: { last_assigned_at: now, availability: 'busy' } }
            );

            await NotificationService.createNotification({
                userId: String(assignedDriverId),
                title: '🚚 New Collection Assigned',
                message: `You have been assigned order #${orderId} (${order.postcode || 'Customer Collection'}).`,
                type: 'driver',
                orderId
            });
        }

        if (managerId) {
            await NotificationService.createNotification({
                userId: String(managerId),
                title: '📦 New Order Confirmed',
                message: `Order #${orderId} (${order.postcode || ''}) confirmed and assigned to ${assignedDriver?.name || 'driver'}.`,
                type: 'plant_order',
                orderId
            });
        }

        // 2. Record Financial Payment
        const paymentPublicId = generatePaymentId();
        await db.collection('payments').insertOne({
            publicId: paymentPublicId,
            id: paymentPublicId,
            paymentId: paymentPublicId,
            customerId: userId,
            customer_id: userId,
            orderId: orderId,
            order_id: orderId,
            stripe_session_id: stripeSessionId,
            stripe_payment_intent_id: paymentIntentId,
            amount: amountGBP,
            currency: session.currency?.toUpperCase() || 'GBP',
            status: 'succeeded',
            payment_method: 'stripe',
            paid_at: now,
            created_at: now
        });

        // 2b. Redeem coupon atomically if one was attached to the order
        const couponCodeToRedeem = order.couponCode || order.coupon_code || order.coupon?.code;
        if (couponCodeToRedeem) {
            await PricingChargeService.redeemCoupon(
                couponCodeToRedeem,
                orderId,
                String(userId),
                stripeSessionId
            ).catch((err) => {
                console.error(`[PaymentService] Coupon redemption error for ${couponCodeToRedeem} on order ${orderId}:`, err);
            });
        }

        // 3. Notify Customer
        if (userId && userId !== 'guest') {
            await NotificationService.createNotification({
                userId,
                title: '✅ Booking Confirmed',
                message: `Payment of £${amountGBP.toFixed(2)} received. Your collection for order #${orderId} is confirmed!`,
                type: 'booking',
                orderId,
            });
        }

        // Send Order Confirmed Email (with Pickup OTP ONLY)
        (async () => {
            try {
                let customerEmail = order.customer_email || order.contactDetails?.email || session?.customer_email || (session?.customer_details as any)?.email || order.email;
                let customerName = order.customer_name || order.customerName || (order.contactDetails ? `${order.contactDetails.firstName || ''} ${order.contactDetails.lastName || ''}`.trim() : '');
                if (!customerEmail && userId && userId !== 'guest') {
                    const custUser = await db.collection('users').findOne(buildEntityLookupQuery(userId, 'user') as any);
                    if (custUser) {
                        customerEmail = custUser.email;
                        customerName = customerName || custUser.full_name || custUser.name;
                    }
                }

                if (customerEmail && !order.confirmation_email_sent) {
                    await sendOrderConfirmedEmail({
                        to: customerEmail,
                        orderId,
                        customerName: customerName || 'Valued Customer',
                        pickupOtp: pickupPin,
                        pickupDate: order.collectionDate || order.pickupDate || 'Tomorrow',
                        pickupSlot: order.collectionTimeSlot || order.pickupSlot || '10:00 AM - 12:00 PM',
                        deliveryDate: order.deliveryDate || 'In 2 Days',
                        deliverySlot: order.deliveryTimeSlot || order.deliverySlot || '10:00 AM - 12:00 PM',
                        pickupAddress: order.address || order.postcode || 'Customer Address',
                        items: Array.isArray(order.items) ? order.items.map((i: any) => ({
                            name: i.name || i.title || 'Garment Item',
                            quantity: i.quantity || 1,
                            price: i.price || i.unitPrice || 0,
                            unit: i.unit,
                            selectedOption: i.selectedOption || i.category,
                        })) : [],
                        subtotal: order.subtotal || amountGBP,
                        discount: order.discount || 0,
                        total: amountGBP,
                        paymentMethod: 'Card (Stripe Confirmed)',
                    });

                    await db.collection('orders').updateOne(
                        { _id: order._id },
                        { $set: { confirmation_email_sent: true } }
                    );
                }
            } catch (emailErr: any) {
                console.error('[PaymentService] Error sending Order Confirmed email:', emailErr?.message || emailErr);
            }
        })();

        // 4. Audit Log
        await AuditService.recordOrderEvent({
            orderId,
            action: 'stripe_payment_confirmed',
            actorId: userId || 'system',
            actorRole: userId !== 'guest' ? 'customer' : 'system',
            before: { payment_status: order.payment_status, status: order.status },
            after: { payment_status: 'Paid', status: status },
            metadata: { amount: amountGBP, stripeSessionId }
        });

        // 5. Update user stats
        if (userId && userId !== 'guest') {
            await db.collection('users').updateOne(
                buildEntityLookupQuery(userId, 'user') as any,
                {
                    $inc: { total_orders: 1, lifetime_spend: order.total || amountGBP },
                    $set: { last_order_at: now, updated_at: now }
                }
            );
        }

        // 6. Clean up any remaining pending checkout records associated with this session or order
        await db.collection('pending_checkouts').deleteMany({
            $or: [
                { stripeSessionId },
                { 'orderPayload.id': orderId },
                { 'orderPayload._id': orderId },
                { 'orderPayload.publicId': orderId },
                ...(session.metadata?.checkoutId ? [{ _id: session.metadata.checkoutId }] : [])
            ]
        }).catch(() => {});

        const finalDoc = await db.collection('orders').findOne({ _id: order._id });
        return OrderService.sanitizeOrderForCustomer(finalDoc);
    }

    private static async processPaymentFailed(db: any, intent: Stripe.PaymentIntent, now: string) {
        const orderId = intent.metadata?.orderId;
        const userId = intent.metadata?.userId;

        // Payment Element failures occur before an official order exists. Preserve
        // the pending checkout and error detail so the customer can safely enter a
        // different card or cancel, without losing the cart.
        if (intent.metadata?.checkoutId) {
            await db.collection('pending_checkouts').updateOne(
                { stripePaymentIntentId: intent.id, status: 'pending' },
                {
                    $set: {
                        lastPaymentError: intent.last_payment_error?.message || 'Payment could not be completed.',
                        lastPaymentErrorCode: intent.last_payment_error?.decline_code || intent.last_payment_error?.code || 'payment_failed',
                        lastPaymentFailedAt: now,
                        updatedAt: now,
                    }
                }
            );
        }

        if (!orderId) return;

        // The Payment Element creates no order until a later succeeded webhook.
        // Do not emit a failed-order notification/audit entry for a declined card
        // when the only record is the recoverable pending checkout.
        const existingOrder = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!existingOrder) return;

        await db.collection('orders').updateOne(
            { _id: existingOrder._id },
            {
                $set: {
                    payment_status: 'Failed',
                    paymentStatus: 'Failed',
                    status: 'payment_failed',
                    statusLabel: 'Payment Failed',
                    updated_at: now
                }
            }
        );

        if (userId) {
            await NotificationService.createNotification({
                userId,
                title: '❌ Payment Failed',
                message: `Your payment for order #${orderId} failed. Please update your payment method and try again.`,
                type: 'billing',
                orderId,
            });
        }

        await AuditService.recordOrderEvent({
            orderId,
            action: 'stripe_payment_failed',
            actorId: userId || 'system',
            actorRole: userId ? 'customer' : 'system',
            after: { payment_status: 'Failed', status: 'payment_failed' },
            metadata: { stripeIntentId: intent.id }
        });
    }
}
