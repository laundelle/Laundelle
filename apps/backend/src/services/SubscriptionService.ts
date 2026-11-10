import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { SubscriptionPlan, SubscriptionPlanId, SubscriptionStatus, UserSubscription } from '@laundelle/types';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { NotificationService } from './NotificationService';
import { AuditService } from './AuditService';
import crypto from 'crypto';
import { generateSubscriptionId, generateOrderId, generateOrderItemId, buildEntityLookupQuery } from '@laundelle/ids';
import { generateSecureNumericPin } from '@/lib/orderPin';

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  bronze_starter: {
    id: 'bronze_starter',
    name: 'Bronze Starter',
    priceMonthly: 39,
    allowanceKgPerMonth: 10,
    allowanceBagsPerMonth: 2,
    overageRatePerKg: 2.00,
    turnaroundHours: 24,
    features: [
      '2 collection bags per month',
      'Up to 10kg clean load capacity',
      'Standard organic eco-wash & press',
      'Next-day doorstep delivery',
      'Basic priority support ticket access'
    ]
  },
  silver_essential: {
    id: 'silver_essential',
    name: 'Silver Essential',
    priceMonthly: 69,
    allowanceKgPerMonth: 20,
    allowanceBagsPerMonth: 4,
    overageRatePerKg: 2.00,
    turnaroundHours: 24,
    features: [
      '4 collection bags per month (weekly)',
      'Up to 20kg clean load capacity',
      'Premium organic enzymes & conditioners',
      'Next-day doorstep delivery',
      'Free button tightening & delicate care',
      'Priority VIP customer support'
    ]
  },
  gold_premium: {
    id: 'gold_premium',
    name: 'Gold Premium',
    priceMonthly: 119,
    allowanceKgPerMonth: 40,
    allowanceBagsPerMonth: 8,
    overageRatePerKg: 2.00,
    turnaroundHours: 24,
    features: [
      '8 collection bags per month (bi-weekly)',
      'Up to 40kg total wash capacity',
      'Free steam press & hanger packaging',
      'Express Same-Day delivery upgrade',
      'Complimentary dry cleaning voucher (2 items)',
      'Dedicated Account Manager'
    ]
  }
};

export class SubscriptionService {
  /**
   * Retrieves all subscription plans.
   */
  static getPlans(): SubscriptionPlan[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  /**
   * Retrieves the active subscription for a customer.
   */
  static async getCustomerSubscription(customerId: string): Promise<UserSubscription | null> {
    const db = await getDb();
    const userDoc = await db.collection('users').findOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    const possibleCustomerIds = [
      customerId,
      userDoc?.publicId,
      userDoc?.customerId,
      userDoc?.id,
      userDoc ? String(userDoc._id) : null
    ].filter(Boolean);

    const sub = await db.collection('subscriptions').findOne({
      $or: [
        { customerId: { $in: possibleCustomerIds } },
        { customer_id: { $in: possibleCustomerIds } },
        { userId: { $in: possibleCustomerIds } }
      ],
      status: { $in: ['ACTIVE', 'PAUSED', 'TRIAL', 'PAST_DUE'] }
    });
    return sub as unknown as UserSubscription | null;
  }

  /**
   * Subscribes a customer to a monthly plan.
   */
  static async createSubscription(params: {
    customerId: string;
    customerEmail?: string;
    planId: SubscriptionPlanId;
    pickupDayOfWeek?: string;
    pickupSlot?: string;
    pickupAddressId?: string;
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
  }): Promise<UserSubscription> {
    const { customerId, customerEmail, planId, pickupDayOfWeek = 'Monday', pickupSlot = '10:00 AM - 12:00 PM', pickupAddressId, stripeSubscriptionId, stripeCustomerId } = params;
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) throw new BadRequestError(`Invalid plan '${planId}'.`);

    const db = await getDb();

    const userDoc = await db.collection('users').findOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    const possibleCustomerIds = [
      customerId,
      userDoc?.publicId,
      userDoc?.customerId,
      userDoc?.id,
      userDoc ? String(userDoc._id) : null
    ].filter(Boolean);

    // Check if customer already has an active subscription
    const existing = await db.collection('subscriptions').findOne({
      $or: [
        { customerId: { $in: possibleCustomerIds } },
        { customer_id: { $in: possibleCustomerIds } },
        { userId: { $in: possibleCustomerIds } }
      ],
      status: { $in: ['ACTIVE', 'PAUSED'] }
    });
    if (existing) {
      throw new BadRequestError('Customer already has an active or paused subscription. Please update existing plan.');
    }

    const subId = generateSubscriptionId();
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subscription: UserSubscription = {
      id: subId,
      publicId: subId,
      customerId,
      customerEmail,
      planId,
      planName: plan.name,
      status: 'ACTIVE',
      billingCycle: 'monthly',
      priceMonthly: plan.priceMonthly,
      allowanceKgPerMonth: plan.allowanceKgPerMonth,
      allowanceBagsPerMonth: plan.allowanceBagsPerMonth,
      usedKgCurrentPeriod: 0,
      usedBagsCurrentPeriod: 0,
      overageRatePerKg: plan.overageRatePerKg,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      nextBillingAt: periodEnd.toISOString(),
      pickupDayOfWeek,
      pickupSlot,
      pickupAddressId,
      stripeSubscriptionId,
      stripeCustomerId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await db.collection('subscriptions').insertOne(subscription as any);

    // Update user profile active subscription
    await db.collection('users').updateOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any,
      {
        $set: {
          activeSubscription: {
            id: subId,
            planName: plan.name,
            pricePerMonth: plan.priceMonthly,
            status: 'active',
            nextPickup: pickupDayOfWeek
          },
          updated_at: now.toISOString()
        }
      }
    );

    // Send confirmation notification
    await NotificationService.dispatchEvent({
      eventType: 'subscription_created',
      recipientId: customerId,
      variables: {
        planName: plan.name,
        allowanceKg: plan.allowanceKgPerMonth
      }
    });

    await AuditService.recordEvent({
      actorId: customerId,
      actorRole: 'customer',
      action: 'subscription_created',
      entityType: 'subscription',
      entityId: subId,
      metadata: { planId, priceMonthly: plan.priceMonthly }
    });

    return subscription;
  }

  /**
   * Pauses an active subscription (e.g. for customer holiday).
   */
  static async pauseSubscription(subscriptionId: string, customerId: string): Promise<UserSubscription> {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({
      $or: [{ id: subscriptionId }, { publicId: subscriptionId }, { subscriptionId }]
    });
    if (!sub) throw new NotFoundError('Subscription not found.');

    const userDoc = await db.collection('users').findOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    const possibleCustomerIds = [
      customerId,
      userDoc?.publicId,
      userDoc?.customerId,
      userDoc?.id,
      userDoc ? String(userDoc._id) : null
    ].filter(Boolean);

    if (!possibleCustomerIds.includes(sub.customerId) && !possibleCustomerIds.includes(sub.userId)) {
      throw new ForbiddenError('Access denied: You do not own this subscription.');
    }

    const now = new Date().toISOString();
    await db.collection('subscriptions').updateOne(
      { _id: sub._id },
      { $set: { status: 'PAUSED', pausedAt: now, updatedAt: now } }
    );

    await db.collection('users').updateOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any,
      { $set: { 'activeSubscription.status': 'paused', updated_at: now } }
    );

    await AuditService.recordEvent({
      actorId: customerId,
      actorRole: 'customer',
      action: 'subscription_paused',
      entityType: 'subscription',
      entityId: subscriptionId
    });

    return { ...(sub as unknown as UserSubscription), status: 'PAUSED', pausedAt: now };
  }

  /**
   * Resumes a paused subscription.
   */
  static async resumeSubscription(subscriptionId: string, customerId: string): Promise<UserSubscription> {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({
      $or: [{ id: subscriptionId }, { publicId: subscriptionId }, { subscriptionId }]
    });
    if (!sub) throw new NotFoundError('Subscription not found.');

    const userDoc = await db.collection('users').findOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    const possibleCustomerIds = [
      customerId,
      userDoc?.publicId,
      userDoc?.customerId,
      userDoc?.id,
      userDoc ? String(userDoc._id) : null
    ].filter(Boolean);

    if (!possibleCustomerIds.includes(sub.customerId) && !possibleCustomerIds.includes(sub.userId)) {
      throw new ForbiddenError('Access denied: You do not own this subscription.');
    }

    const now = new Date().toISOString();
    await db.collection('subscriptions').updateOne(
      { _id: sub._id },
      { $set: { status: 'ACTIVE', resumedAt: now, updatedAt: now } }
    );

    await db.collection('users').updateOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any,
      { $set: { 'activeSubscription.status': 'active', updated_at: now } }
    );

    await AuditService.recordEvent({
      actorId: customerId,
      actorRole: 'customer',
      action: 'subscription_resumed',
      entityType: 'subscription',
      entityId: subscriptionId
    });

    return { ...(sub as unknown as UserSubscription), status: 'ACTIVE', resumedAt: now };
  }

  /**
   * Cancels a subscription.
   */
  static async cancelSubscription(subscriptionId: string, customerId: string): Promise<UserSubscription> {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({
      $or: [{ id: subscriptionId }, { publicId: subscriptionId }, { subscriptionId }]
    });
    if (!sub) throw new NotFoundError('Subscription not found.');

    const userDoc = await db.collection('users').findOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    const possibleCustomerIds = [
      customerId,
      userDoc?.publicId,
      userDoc?.customerId,
      userDoc?.id,
      userDoc ? String(userDoc._id) : null
    ].filter(Boolean);

    if (!possibleCustomerIds.includes(sub.customerId) && !possibleCustomerIds.includes(sub.userId)) {
      throw new ForbiddenError('Access denied: You do not own this subscription.');
    }

    const now = new Date().toISOString();
    await db.collection('subscriptions').updateOne(
      { _id: sub._id },
      { $set: { status: 'CANCELLED', cancelledAt: now, updatedAt: now } }
    );

    await db.collection('users').updateOne(
      buildEntityLookupQuery(customerId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any,
      { $set: { 'activeSubscription.status': 'cancelled', updated_at: now } }
    );

    await NotificationService.dispatchEvent({
      eventType: 'subscription_cancelled',
      recipientId: customerId,
      variables: {}
    });

    await AuditService.recordEvent({
      actorId: customerId,
      actorRole: 'customer',
      action: 'subscription_cancelled',
      entityType: 'subscription',
      entityId: subscriptionId
    });

    return { ...(sub as unknown as UserSubscription), status: 'CANCELLED', cancelledAt: now };
  }

  /**
   * Records usage against monthly allowance and calculates overage if applicable.
   */
  static async recordUsage(subscriptionId: string, weightKg: number, bagsCount = 1): Promise<{
    usedKg: number;
    allowanceKg: number;
    overageKg: number;
    overageAmount: number;
  }> {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({
      $or: [{ id: subscriptionId }, { publicId: subscriptionId }, { subscriptionId }]
    });
    if (!sub) throw new NotFoundError('Subscription not found.');

    const newUsedKg = (sub.usedKgCurrentPeriod || 0) + weightKg;
    const newUsedBags = (sub.usedBagsCurrentPeriod || 0) + bagsCount;

    const overageKg = Math.max(0, newUsedKg - sub.allowanceKgPerMonth);
    const overageAmount = Number((overageKg * (sub.overageRatePerKg || 2.00)).toFixed(2));

    await db.collection('subscriptions').updateOne(
      { _id: sub._id },
      {
        $set: {
          usedKgCurrentPeriod: newUsedKg,
          usedBagsCurrentPeriod: newUsedBags,
          updatedAt: new Date().toISOString()
        }
      }
    );

    return {
      usedKg: newUsedKg,
      allowanceKg: sub.allowanceKgPerMonth,
      overageKg,
      overageAmount
    };
  }

  /**
   * Generates a discrete, individually traceable order for a subscription's scheduled recurring pickup.
   */
  static async generateRecurringOrder(subscriptionId: string): Promise<any> {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({ id: subscriptionId, status: 'ACTIVE' });
    if (!sub) throw new BadRequestError('Cannot generate order: subscription is not active.');

    const user = await db.collection('users').findOne({ $or: [{ id: sub.customerId }, { _id: sub.customerId }] } as any);

    const address = (user?.addresses && user.addresses.length > 0)
      ? (user.addresses.find((a: any) => a.id === sub.pickupAddressId) || user.addresses[0])
      : { line1: 'Subscriber Address', city: 'London', postcode: 'SW1A 1AA' };

    const orderId = generateOrderId();
    const now = new Date();
    const pickupDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const deliveryDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const orderDoc = {
      id: orderId,
      publicId: orderId,
      orderNumber: orderId,
      customerId: sub.customerId,
      customer_id: sub.customerId,
      customerName: user?.full_name || user?.fullName || 'Subscriber',
      customerEmail: user?.email || sub.customerEmail || 'subscriber@laundelle.co.uk',
      customerPhone: user?.phone || '+44 7700 900123',
      address,
      serviceType: 'subscription_wash',
      orderType: 'recurring',
      isRecurring: true,
      turnaround: 'Standard 48h',
      status: 'booking_confirmed',
      statusLabel: 'Booking Confirmed',
      payment_status: 'Paid', // Covered by monthly subscription billing
      paymentMethod: 'Subscription Allowance',
      total: 0, // Incurred under monthly billing
      subtotal: 0,
      subscriptionId: sub.id,
      subscriptionPlan: sub.planName,
      pickupDate,
      pickupSlot: sub.pickupSlot || '10:00 AM - 12:00 PM',
      deliveryDate,
      deliverySlot: sub.pickupSlot || '10:00 AM - 12:00 PM',
      pickupPin: generateSecureNumericPin(6),
      deliveryPin: generateSecureNumericPin(6),
      weightKg: 5, // Initial nominal allowance
      items: [
        {
          orderItemId: generateOrderItemId(),
          name: `${sub.planName} Weekly Bag`,
          quantity: 1,
          price: 0
        }
      ],
      timeline_events: [
        {
          event: 'booking_confirmed',
          label: `Recurring Subscription Pickup Scheduled (${sub.planName})`,
          actor: 'system',
          timestamp: now.toISOString()
        }
      ],
      createdAt: now.toISOString(),
      updated_at: now.toISOString()
    };

    await db.collection('orders').insertOne(orderDoc as any);

    await AuditService.recordOrderEvent({
      orderId,
      action: 'subscription_order_created',
      actorId: sub.customerId,
      actorRole: 'customer',
      after: { status: 'booking_confirmed', planName: sub.planName },
      reason: `Automated recurring pickup scheduled under subscription ${sub.planName}`,
      metadata: { subscriptionId: sub.id, pickupDate, pickupSlot: sub.pickupSlot }
    });

    // Record usage
    await this.recordUsage(sub.id, 5, 1);

    await NotificationService.dispatchEvent({
      eventType: 'booking_confirmed',
      recipientId: sub.customerId,
      orderId,
      variables: {
        customerName: user?.full_name || user?.fullName || 'Subscriber',
        orderNumber: orderId,
        pickupWindow: `${pickupDate} (${sub.pickupSlot})`
      }
    });

    return orderDoc;
  }
}
