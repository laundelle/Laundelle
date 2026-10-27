import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

let stripeInstance: Stripe | null = null;
function getStripe(): Stripe {
    if (!stripeInstance) {
        stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            apiVersion: (process.env.STRIPE_API_VERSION || '2025-06-30.basil') as any,
        });
    }
    return stripeInstance;
}

import { getAuthenticatedUserAsync } from '@/lib/api';
import { getDb } from '@/lib/mongodb';
import { PaymentService } from '@/services/PaymentService';
import { PlatformService } from '@/services/PlatformService';
import { PricingChargeService } from '@/services/PricingChargeService';
import { generateOrderId } from '@laundelle/ids';
import { isOriginAllowed } from '@/lib/cors';
import { generateSecureNumericPin, generatePinSalt, hashOrderPin, encryptOrderPin } from '@/lib/orderPin';

const MAX_ORDER_AMOUNT_GBP = 9999;
const MIN_ORDER_AMOUNT_GBP = 0.50;

export async function POST(req: NextRequest) {
    try {
        const authUser = await getAuthenticatedUserAsync(req);
        const body = await req.json();
        const { orderId, customerEmail, items, orderPayload } = body;
        const clientAmount = Number(body.amount || 0);

        const effectiveUserId = authUser?.sub || authUser?.userId || authUser?.id;
        if (!effectiveUserId) {
            return NextResponse.json({ error: 'Authentication required. You must be logged in to place an order.' }, { status: 401 });
        }

        const candidateCouponCode = String(
            body.couponCode ||
            (orderPayload as any)?.couponCode ||
            (orderPayload as any)?.coupon_code ||
            (orderPayload as any)?.coupon?.code ||
            ''
        ).trim().toUpperCase();

        let serverDiscount = 0;

        const db = await getDb();

        let calculatedItemsGross = 0;
        if (items && Array.isArray(items) && items.length > 0) {
            const dbServices = await db.collection('services').find({}).toArray();
            const servicePriceMap = new Map<string, number>();
            dbServices.forEach((s: any) => {
                const p = Number(s.basePrice ?? s.price ?? 0);
                if (s.id) servicePriceMap.set(String(s.id), p);
                if (s._id) servicePriceMap.set(String(s._id), p);
                if (s.serviceId) servicePriceMap.set(String(s.serviceId), p);
                if (s.name) servicePriceMap.set(String(s.name).toLowerCase().trim(), p);
            });
            calculatedItemsGross = items.reduce((sum: number, it: any) => {
                const sId = String(it.serviceId || it.id || '');
                const sName = String(it.name || '').toLowerCase().trim();
                const authoritativePrice = servicePriceMap.get(sId) ?? (servicePriceMap.get(sName) ?? (Number(it.price) || 0));
                const qty = Number(it.quantity) || 1;
                return sum + authoritativePrice * qty;
            }, 0);
        }

        if (candidateCouponCode) {
            const rawSubtotal = Number((orderPayload as any)?.subtotal) || calculatedItemsGross || clientAmount;
            const validation = await PricingChargeService.validateCoupon(candidateCouponCode, rawSubtotal);
            if (!validation.valid) {
                return NextResponse.json({ error: validation.message || 'Invalid or ineligible coupon code.' }, { status: 400 });
            }
            serverDiscount = validation.discountAmount || 0;
        }

        const authoritativeTotal = calculatedItemsGross > 0
            ? Math.max(0, Math.round((calculatedItemsGross - serverDiscount) * 100) / 100)
            : Number((orderPayload as any)?.total ?? clientAmount);

        const serverAmount = authoritativeTotal;

        if (!serverAmount || isNaN(serverAmount) || serverAmount < MIN_ORDER_AMOUNT_GBP) {
            return NextResponse.json({ error: `Invalid order total. Minimum order amount is GBP${MIN_ORDER_AMOUNT_GBP.toFixed(2)}.` }, { status: 400 });
        }
        if (serverAmount > MAX_ORDER_AMOUNT_GBP) {
            return NextResponse.json({ error: `Order total GBP${serverAmount.toFixed(2)} exceeds the maximum allowed amount of GBP${MAX_ORDER_AMOUNT_GBP}.` }, { status: 400 });
        }
        if (clientAmount && Math.abs(clientAmount - serverAmount) > 0.05) {
            return NextResponse.json({ error: 'Checkout total does not match the authoritative order total. Please refresh your cart and try again.' }, { status: 400 });
        }

        await PaymentService.assertWebhookOperational();

        // Enforce Server-Side Postcode Service Area Verification (Never rely on frontend as source of truth)
        const candidatePostcode = String(
            (orderPayload as any)?.postcode ||
            (orderPayload as any)?.address?.postcode ||
            (orderPayload as any)?.pincode ||
            ''
        ).trim();
        const candidateAddress = typeof (orderPayload as any)?.address === 'string'
            ? (orderPayload as any)?.address
            : `${(orderPayload as any)?.address?.street || ''} ${(orderPayload as any)?.address?.city || ''} ${candidatePostcode}`;

        const coverageCheck = await PlatformService.checkPostcode(candidatePostcode || candidateAddress);
        if (!coverageCheck.isServiceable || !coverageCheck.plantId) {
            return NextResponse.json(
                { error: 'There is no plant in the area available for orders at this time. Checkout cannot proceed.' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();

        // Server-authoritative Order ID creation with ownership and duplicate verification
        let targetOrderId: string;
        const rawCandidateId = (orderId || (orderPayload as any)?.id || (orderPayload as any)?.publicId || '').toString().trim();

        if (rawCandidateId && rawCandidateId.startsWith('ORD-')) {
            const existingOrder = await db.collection('orders').findOne({
                $or: [{ id: rawCandidateId }, { publicId: rawCandidateId }]
            });
            if (existingOrder) {
                // Verify ownership: customer can only reuse their own unpaid pending_payment order
                const isOwner = (existingOrder.userId === effectiveUserId ||
                                 existingOrder.user_id === effectiveUserId ||
                                 existingOrder.customerId === effectiveUserId ||
                                 existingOrder.customer_id === effectiveUserId);
                const isUnpaid = existingOrder.status === 'pending_payment' && !existingOrder.isPaid;
                if (isOwner && isUnpaid) {
                    targetOrderId = rawCandidateId;
                } else {
                    // Refuse hijacking or overwriting paid/other user's order; generate fresh authoritative ID
                    targetOrderId = generateOrderId();
                }
            } else {
                targetOrderId = rawCandidateId;
            }
        } else {
            targetOrderId = generateOrderId();
        }

        const checkoutId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        await db.collection('pending_checkouts').insertOne({
            _id: checkoutId as any,
            userId: effectiveUserId,
            orderPayload: {
                ...(orderPayload || { amount: serverAmount, items, customerEmail }),
                id: targetOrderId,
                publicId: targetOrderId,
                userId: effectiveUserId,
                user_id: effectiveUserId,
            },
            authorizedAmount: serverAmount,
            status: 'pending',
            createdAt: now,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

        // Register initial order in orders collection as pending_payment.
        // If the customer leaves mid-way or closes the gateway, the order is safely visible in their orders page.
        if (orderPayload) {
            const initialOrderDoc = {
                ...orderPayload,
                id: targetOrderId,
                publicId: targetOrderId,
                userId: effectiveUserId,
                user_id: effectiveUserId,
                total: serverAmount,
                amount: serverAmount,
                status: 'pending_payment',
                statusLabel: 'Pending Payment Authorization',
                paymentStatus: 'Pending',
                payment_status: 'Pending',
                isPaid: false,
                pickup_pin: null,
                pickup_otp: null,
                pickup_pin_hash: null,
                pickup_pin_salt: null,
                pickup_pin_enc: null,
                pickup_pin_attempts: 0,
                pickup_pin_locked: false,
                delivery_pin: null,
                delivery_otp: null,
                delivery_pin_hash: null,
                delivery_pin_salt: null,
                delivery_pin_enc: null,
                delivery_pin_attempts: 0,
                delivery_pin_locked: false,
                created_at: now,
                updated_at: now,
                timeline_events: [
                    { status: 'booking_created', label: 'Order Created', completed: true, current: true, time: 'Just now' },
                    { status: 'pending_payment', label: 'Payment Pending', completed: false, current: false, time: 'Pending' }
                ]
            };
            await db.collection('orders').updateOne(
                { $or: [{ id: targetOrderId }, { publicId: targetOrderId }] } as any,
                { $setOnInsert: initialOrderDoc },
                { upsert: true }
            );
        }

        // Strict return URL origin validation preventing open redirect vulnerabilities
        let origin = '';
        const clientReturnUrl = (body.returnUrl || body.return_url || body.origin || '').toString().trim();
        if (clientReturnUrl) {
            let parsedOrigin: string | null = null;
            try {
                parsedOrigin = new URL(clientReturnUrl).origin;
            } catch {
                return NextResponse.json({ error: 'Malformed return URL' }, { status: 400 });
            }
            if (!isOriginAllowed(parsedOrigin)) {
                return NextResponse.json({ error: 'Untrusted return URL origin' }, { status: 400 });
            }
            origin = parsedOrigin;
        } else {
            const reqOrigin = req.headers.get('origin');
            if (reqOrigin && isOriginAllowed(reqOrigin)) {
                origin = reqOrigin;
            } else {
                origin = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://customer.laundelle.co.uk').trim();
            }
        }
        origin = origin.replace(/\/+$/, '');

        const stripe = getStripe();

        let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
        if (serverDiscount > 0) {
            const promoDesc = candidateCouponCode ? ` (Promo: ${candidateCouponCode} - Saved £${serverDiscount.toFixed(2)})` : ` (Saved £${serverDiscount.toFixed(2)})`;
            lineItems = [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: `Laundelle Laundry Service${promoDesc}`,
                            description: `${items?.length || 1} line item(s) reconciled`
                        },
                        unit_amount: Math.round(serverAmount * 100),
                    },
                    quantity: 1,
                }
            ];
        } else if (items && Array.isArray(items) && items.length > 0) {
            lineItems = items.map((item: any) => ({
                price_data: {
                    currency: 'gbp',
                    product_data: { name: item.name || 'Laundelle Service' },
                    unit_amount: Math.round(Number(item.price) * 100),
                },
                quantity: Number(item.quantity) || 1,
            }));
        } else {
            lineItems = [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Laundelle Laundry Service' },
                    unit_amount: Math.round(serverAmount * 100),
                },
                quantity: 1,
            }];
        }

        // Create a Stripe-hosted Checkout Session.
        // Card entry happens on Stripe's own HTTPS domain (checkout.stripe.com),
        // eliminating all browser insecure-connection warnings.
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            customer_email: customerEmail || undefined,
            success_url: `${origin}/?payment=verify&session_id={CHECKOUT_SESSION_ID}&orderId=${encodeURIComponent(targetOrderId)}`,
            cancel_url: `${origin}/?payment=cancel&session_id={CHECKOUT_SESSION_ID}&orderId=${encodeURIComponent(targetOrderId)}&checkoutId=${encodeURIComponent(checkoutId)}`,
            metadata: {
                checkoutId,
                orderId: targetOrderId,
                userId: effectiveUserId,
                couponCode: candidateCouponCode || '',
                discount: String(serverDiscount),
            },
        });

        await db.collection('pending_checkouts').updateOne(
            { _id: checkoutId as any },
            { $set: { stripeSessionId: session.id } }
        );

        await db.collection('orders').updateOne(
            { $or: [{ id: targetOrderId }, { publicId: targetOrderId }] } as any,
            { $set: { stripe_session_id: session.id, stripeSessionId: session.id } }
        );

        console.log(`[create-checkout-session] Session ${session.id} created for user ${effectiveUserId}, amount GBP${serverAmount.toFixed(2)}`);
        return NextResponse.json({ url: session.url, sessionId: session.id, checkoutId, orderId: targetOrderId });
    } catch (error: any) {
        console.error('[create-checkout-session] Failed:', error);
        return NextResponse.json({ error: error.message || 'Stripe Session Creation Failed' }, { status: 500 });
    }
}
