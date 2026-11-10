import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { NotificationChannel, NotificationRecord, NotificationStatus, NotificationTemplate } from '@laundelle/types';
import crypto from 'crypto';
import { generateNotificationId, generateExceptionId, buildEntityLookupQuery } from '@laundelle/ids';
import { sendEmail } from '@/lib/email';
import { AlertService } from './AlertService';
import { SmsService } from './SmsService';
import { PushNotificationService } from './PushNotificationService';

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  channel?: NotificationChannel;
  orderId?: string;
  metadata?: any;
  idempotencyKey?: string;
}

export interface DispatchNotificationEventParams {
  eventType: string;
  recipientId: string;
  orderId?: string;
  channels?: NotificationChannel[];
  variables?: Record<string, any>;
  customTitle?: string;
  customBody?: string;
  idempotencyKey?: string;
  metadata?: any;
}

// Mandatory transactional / security event types that can NEVER be disabled by customer preferences
export const MANDATORY_EVENT_TYPES = new Set([
  'booking_confirmed',
  'order_confirmation',
  'payment_received',
  'payment_failed',
  'additional_charge_required',
  'additional_charge_rejected',
  'pickup_failed',
  'delivery_failed',
  'delivered',
  'sla_breached',
  'security_alert',
  'incident_created'
]);

// Default built-in templates ensuring zero downtime and immediate fallback
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  booking_confirmed: {
    subject: 'Booking Confirmed — Laundelle Order #{{orderNumber}}',
    body: 'Hi {{customerName}}, your booking for {{pickupWindow}} is confirmed! Our courier will arrive on time.'
  },
  payment_received: {
    subject: 'Payment Received — Laundelle Order #{{orderNumber}}',
    body: 'Thank you {{customerName}}! We received your payment of £{{amount}} for order #{{orderNumber}}.'
  },
  payment_failed: {
    subject: 'Payment Failed — Action Required for Order #{{orderNumber}}',
    body: 'Hi {{customerName}}, payment for order #{{orderNumber}} could not be processed. Please update your payment method.'
  },
  pickup_reminder: {
    subject: 'Collection Reminder — Laundelle',
    body: 'Hi {{customerName}}, friendly reminder that our driver will collect your laundry during {{pickupWindow}}.'
  },
  driver_assigned: {
    subject: 'Driver Assigned — Laundelle Order #{{orderNumber}}',
    body: 'Driver {{driverName}} has been assigned to your collection for slot {{pickupWindow}}.'
  },
  driver_arriving: {
    subject: 'Driver Arriving Soon — Order #{{orderNumber}}',
    body: 'Your driver {{driverName}} is approximately 10 minutes away from your doorstep.'
  },
  pickup_completed: {
    subject: 'Laundry Collected — Order #{{orderNumber}}',
    body: 'Your laundry has been securely collected (Piece Count: {{pieceCount}}). In transit to facility.'
  },
  pickup_failed: {
    subject: 'Collection Attempt Unsuccessful — Order #{{orderNumber}}',
    body: 'Our driver was unable to complete your pickup: {{reason}}. Please reschedule your slot in the app.'
  },
  received_at_facility: {
    subject: 'Arrived at Facility — Order #{{orderNumber}}',
    body: 'Your laundry has safely arrived at our processing plant {{plantName}} and is entering sorting.'
  },
  additional_charge_required: {
    subject: 'Action Required: Additional Surcharge for Order #{{orderNumber}}',
    body: 'Your order weighed {{actualWeight}}kg (exceeding initial estimate). Additional charge of £{{amount}} requires your approval.'
  },
  additional_charge_approved: {
    subject: 'Additional Charge Approved — Order #{{orderNumber}}',
    body: 'Thank you for approving the surcharge. Processing is proceeding immediately.'
  },
  additional_charge_rejected: {
    subject: 'Surcharge Update — Order #{{orderNumber}}',
    body: 'We noted your surcharge rejection. Garments are securely held while our plant manager reviews options.'
  },
  processing_started: {
    subject: 'Washing Underway — Order #{{orderNumber}}',
    body: 'Your garments are currently undergoing specialized eco-wash cleaning at our facility.'
  },
  washing_completed: {
    subject: 'Wash Cycle Finished — Order #{{orderNumber}}',
    body: 'Garments have completed wash and transferred to low-heat delicate drying.'
  },
  drying_completed: {
    subject: 'Drying Completed — Order #{{orderNumber}}',
    body: 'Garments are completely dry and progressing to steam press & flat folding.'
  },
  quality_check_started: {
    subject: 'Quality Control Check — Order #{{orderNumber}}',
    body: 'Our senior garment specialist is performing 9-point quality check on your items.'
  },
  rewash_required: {
    subject: 'Quality Rewash Triggered — Order #{{orderNumber}}',
    body: 'Our inspection team flagged an item requiring re-wash to guarantee spotless standards.'
  },
  ready_for_delivery: {
    subject: 'Ready for Dispatch — Order #{{orderNumber}}',
    body: 'Your garments are cleaned, inspected, and packaged in protective film for delivery.'
  },
  delivery_driver_assigned: {
    subject: 'Delivery Courier Assigned — Order #{{orderNumber}}',
    body: 'Courier {{driverName}} has been assigned for your delivery slot {{deliveryWindow}}.'
  },
  out_for_delivery: {
    subject: 'Out for Delivery — Order #{{orderNumber}}',
    body: 'Your fresh laundry is on its way! Track your courier live in the Laundelle app.'
  },
  delivery_attempted: {
    subject: 'Delivery Attempted — Order #{{orderNumber}}',
    body: 'We attempted delivery at {{address}}. Courier noted: {{reason}}.'
  },
  delivery_failed: {
    subject: 'Delivery Failed — Order #{{orderNumber}}',
    body: 'Delivery could not be completed. Your order has safely returned to facility for rescheduling.'
  },
  delivered: {
    subject: 'Delivered Successfully — Order #{{orderNumber}}',
    body: 'Your laundry has been delivered! Thank you for choosing Laundelle.'
  },
  sla_at_risk: {
    subject: 'SLA Escalation Warning — Order #{{orderNumber}}',
    body: 'Order #{{orderNumber}} has less than 4 hours remaining before guaranteed delivery deadline.'
  },
  sla_breached: {
    subject: 'SLA Breach Alert — Order #{{orderNumber}}',
    body: 'CRITICAL: Order #{{orderNumber}} has exceeded guaranteed delivery deadline.'
  },
  incident_created: {
    subject: 'Support Incident Opened #{{incidentId}}',
    body: 'An incident report has been logged regarding order #{{orderNumber}}: {{incidentType}}.'
  },
  incident_updated: {
    subject: 'Incident Update #{{incidentId}}',
    body: 'New update on incident #{{incidentId}}: {{notes}}.'
  },
  incident_resolved: {
    subject: 'Incident Resolved #{{incidentId}}',
    body: 'Incident #{{incidentId}} has been resolved. Resolution: {{resolution}}.'
  },
  subscription_created: {
    subject: 'Welcome to Laundelle Subscription!',
    body: 'Your {{planName}} subscription is now active with {{allowanceKg}}kg monthly wash allowance.'
  },
  subscription_renewed: {
    subject: 'Subscription Renewed — Laundelle',
    body: 'Your {{planName}} monthly cycle has renewed. Your allowance has been refreshed.'
  },
  subscription_payment_failed: {
    subject: 'Subscription Payment Issue — Action Needed',
    body: 'We were unable to charge your payment method for subscription renewal. Please update billing details.'
  },
  subscription_cancelled: {
    subject: 'Subscription Cancelled — Laundelle',
    body: 'Your subscription has been cancelled. You retain active benefits until period end.'
  }
};

export class NotificationService {
  /**
   * Safely interpolates variables into a template string without code injection vulnerabilities.
   */
  static interpolateTemplate(template: string, variables: Record<string, any> = {}): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const val = variables[key];
      if (val === undefined || val === null) return '';
      // Escape HTML characters to prevent XSS/injection in client UI
      return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    });
  }

  /**
   * Computes exponential backoff delay in minutes.
   * Attempt 1 = 0 min (immediate)
   * Attempt 2 = 2 min
   * Attempt 3 = 10 min
   */
  static getBackoffDelayMinutes(attemptCount: number): number {
    if (attemptCount <= 1) return 0;
    if (attemptCount === 2) return 2;
    return 10;
  }

  /**
   * Evaluates if a customer has opted out of a notification channel,
   * strictly protecting mandatory transactional and security alerts.
   */
  static async isChannelAllowed(userId: string, channel: NotificationChannel, eventType: string): Promise<boolean> {
    if (MANDATORY_EVENT_TYPES.has(eventType)) {
      return true; // Cannot opt out of mandatory transactional notifications
    }

    const db = await getDb();
    const user = await db.collection('users').findOne(
      buildEntityLookupQuery(userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    if (!user || !user.preferences) return true;

    const prefs = user.preferences;
    // Check explicit subscribedEvents map if provided
    if (prefs.subscribedEvents && prefs.subscribedEvents[eventType] === false) {
      return false;
    }
    // Check channels map if provided
    if (prefs.channels && prefs.channels[channel] === false) {
      return false;
    }
    // Check flat keys
    if (channel === 'email' && prefs.emailReceipts === false) return false;
    if (channel === 'sms' && prefs.smsNotifications === false) return false;
    if (channel === 'whatsapp' && prefs.whatsappUpdates === false) return false;
    if (channel === 'push' && prefs.pushNotifications === false) return false;
    if (eventType.includes('marketing') || eventType.includes('promo')) {
      if (prefs.marketingEmails === false) return false;
    }

    return true;
  }

  static async saveUserPreferences(userId: string, preferences: any) {
    const db = await getDb();
    const existing = await db.collection('users').findOne(
      buildEntityLookupQuery(userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    if (existing) {
      await db.collection('users').updateOne(
        { _id: existing._id },
        { $set: { preferences, updated_at: new Date().toISOString() } }
      );
    } else {
      await db.collection('users').insertOne({
        id: userId,
        _id: (ObjectId.isValid(userId) && userId.length === 24 ? new ObjectId(userId) : userId) as any,
        preferences,
        createdAt: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    return preferences;
  }

  static async getUserPreferences(userId: string) {
    const db = await getDb();
    const user = await db.collection('users').findOne(
      buildEntityLookupQuery(userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    return user?.preferences || null;
  }

  /**
   * Creates a notification record (backward compatible with existing callers).
   */
  static async createNotification(params: CreateNotificationParams): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const db = await getDb();
      const collection = db.collection('notifications');

      // 1. Idempotency Check
      if (params.idempotencyKey) {
        const existing = await collection.findOne({ idempotencyKey: params.idempotencyKey });
        if (existing) {
          return { success: true, id: existing.id as string };
        }
      }

      const channel = params.channel || 'in_app';
      const isAllowed = await this.isChannelAllowed(params.userId, channel, params.type);
      if (!isAllowed) {
        return { success: false, error: 'User opted out of this channel' };
      }

      const notifId = generateNotificationId();
      const now = new Date().toISOString();

      let notifStatus: NotificationStatus = 'SENT';
      let sentAt: string | undefined = now;
      let failureReason: string | undefined;
      let scheduledAt: string | undefined;

      if (channel === 'in_app') {
        notifStatus = 'SENT';
        sentAt = now;
      } else if (channel === 'email') {
        try {
          const recipientUser = await db.collection('users').findOne(
            buildEntityLookupQuery(params.userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
          );
          const recipientEmail = recipientUser?.email || (params.userId.includes('@') ? params.userId : undefined);
          if (recipientEmail) {
            const emailResult = await sendEmail({
              to: recipientEmail,
              subject: params.title,
              html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #0f172a; margin-bottom: 16px;">${params.title}</h2>
                <p style="font-size: 16px; margin-bottom: 24px;">${params.message}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="font-size: 12px; color: #64748b;">Laundelle Quality Laundry Services.</p>
              </div>`
            });
            if (!emailResult || !(emailResult as any).id) {
              throw new Error('Email provider did not accept message (missing confirmation identifier).');
            }
            notifStatus = 'SENT';
            sentAt = now;
          } else {
            notifStatus = 'FAILED';
            sentAt = undefined;
            failureReason = `Recipient user ${params.userId} has no registered email.`;
          }
        } catch (err: any) {
          notifStatus = 'PENDING';
          sentAt = undefined;
          failureReason = err?.message || 'Email delivery failed';
          scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        }
      } else {
        // SMS, WhatsApp, Push: channel is unsupported or provider not configured
        return { success: false, error: `Channel "${channel}" is unsupported or provider is not configured.` };
      }

      const record: NotificationRecord = {
        id: notifId,
        publicId: notifId,
        notificationId: notifId,
        userId: params.userId,
        orderId: params.orderId,
        type: params.type,
        channel,
        title: params.title,
        body: params.message,
        status: notifStatus,
        failureReason,
        failedAt: notifStatus === 'FAILED' ? now : undefined,
        scheduledAt,
        provider: channel === 'in_app' ? 'local' : (channel === 'email' ? 'resend' : 'system'),
        attemptCount: 1,
        maxAttempts: 3,
        sentAt,
        deliveredAt: channel === 'in_app' ? now : undefined,
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata || {},
        createdAt: now,
        updatedAt: now
      };

      // Also persist legacy fields (message, read) for full UI backward compatibility
      const legacyCompatibleDoc = {
        ...record,
        message: params.message,
        read: false
      };

      await collection.insertOne(legacyCompatibleDoc as any);

      return { success: true, id: notifId };
    } catch (error: any) {
      console.error('[NotificationService] Error creating notification:', error);
      return { success: false, error: 'Failed to create notification' };
    }
  }

  /**
   * High-level event-driven notification dispatcher supporting templates, multi-channel dispatch,
   * controlled retries, and strict idempotency.
   */
  static async dispatchEvent(params: DispatchNotificationEventParams): Promise<{ success: boolean; notifications: NotificationRecord[] }> {
    const {
      eventType,
      recipientId,
      orderId,
      channels = ['in_app'],
      variables = {},
      customTitle,
      customBody,
      idempotencyKey,
      metadata = {}
    } = params;

    const db = await getDb();
    const results: NotificationRecord[] = [];

    // 1. Load template from DB or fallback to default
    let subject = customTitle;
    let bodyTemplate = customBody;

    if (!subject || !bodyTemplate) {
      const dbTemplate = await db.collection('notification_templates').findOne({ eventType, enabled: true });
      if (dbTemplate) {
        subject = subject || dbTemplate.subject;
        bodyTemplate = bodyTemplate || dbTemplate.body;
      } else if (DEFAULT_TEMPLATES[eventType]) {
        subject = subject || DEFAULT_TEMPLATES[eventType].subject;
        bodyTemplate = bodyTemplate || DEFAULT_TEMPLATES[eventType].body;
      } else {
        subject = subject || `Notification: ${eventType.replace(/_/g, ' ')}`;
        bodyTemplate = bodyTemplate || `You have a new update regarding order #${orderId || ''}.`;
      }
    }

    const compiledTitle = this.interpolateTemplate(subject || '', variables);
    const compiledBody = this.interpolateTemplate(bodyTemplate || '', variables);

    for (const channel of channels) {
      const channelIdempotency = idempotencyKey ? `${idempotencyKey}_${channel}` : undefined;

      // Idempotency check per channel
      if (channelIdempotency) {
        const existing = await db.collection('notifications').findOne({ idempotencyKey: channelIdempotency });
        if (existing) {
          results.push(existing as unknown as NotificationRecord);
          continue;
        }
      }

      const isAllowed = await this.isChannelAllowed(recipientId, channel, eventType);
      if (!isAllowed) continue;

      const notifId = generateNotificationId();
      const now = new Date().toISOString();

      let notifStatus: NotificationStatus = 'SENT';
      let sentAt: string | undefined = now;
      let failureReason: string | undefined;
      let scheduledAt: string | undefined;

      if (channel === 'in_app') {
        notifStatus = 'SENT';
        sentAt = now;
      } else if (channel === 'email') {
        try {
          const recipientUser = await db.collection('users').findOne(
            buildEntityLookupQuery(recipientId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
          );
          const recipientEmail = recipientUser?.email || (recipientId.includes('@') ? recipientId : undefined);
          if (recipientEmail) {
            await sendEmail({
              to: recipientEmail,
              subject: compiledTitle,
              html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #0f172a; margin-bottom: 16px;">${compiledTitle}</h2>
                <p style="font-size: 16px; margin-bottom: 24px;">${compiledBody}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="font-size: 12px; color: #64748b;">Laundelle Quality Laundry Services. If you did not request this, please contact support.</p>
              </div>`
            });
            notifStatus = 'SENT';
            sentAt = now;
          } else {
            failureReason = `Recipient user ${recipientId} does not have a registered email address.`;
            notifStatus = 'FAILED';
            sentAt = undefined;
          }
        } catch (err: any) {
          console.error('[NotificationService] Failed to deliver email notification:', err);
          failureReason = err?.message || 'Email delivery failure';
          notifStatus = 'PENDING';
          sentAt = undefined;
          scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        }
      } else if (channel === 'sms') {
        try {
          const recipientUser = await db.collection('users').findOne(
            buildEntityLookupQuery(recipientId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
          );
          const rawPhone = recipientUser?.phone || recipientUser?.mobile || (recipientId.startsWith('+') ? recipientId : undefined);
          if (rawPhone) {
            const smsRes = await SmsService.sendSms({
              to: rawPhone,
              body: `${compiledTitle}\n${compiledBody}`
            });

            if (smsRes.success) {
              notifStatus = 'SENT';
              sentAt = now;
            } else if (smsRes.status === 'BLOCKED') {
              notifStatus = 'FAILED';
              sentAt = undefined;
              failureReason = smsRes.error || 'Twilio SMS credentials are not configured.';
            } else {
              notifStatus = 'PENDING';
              sentAt = undefined;
              failureReason = smsRes.error;
              scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
            }
          } else {
            failureReason = `Recipient user ${recipientId} does not have a registered phone number.`;
            notifStatus = 'FAILED';
            sentAt = undefined;
          }
        } catch (err: any) {
          console.error('[NotificationService] SMS dispatch error:', err);
          failureReason = err?.message || 'SMS delivery failed';
          notifStatus = 'PENDING';
          sentAt = undefined;
          scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        }
      } else if (channel === 'push') {
        try {
          const pushRes = await PushNotificationService.sendPush({
            userId: recipientId,
            title: compiledTitle,
            body: compiledBody,
            data: { orderId, eventType }
          });

          if (pushRes.success && pushRes.status === 'SENT') {
            notifStatus = 'SENT';
            sentAt = now;
          } else if (pushRes.status === 'SKIPPED_NO_DEVICE') {
            notifStatus = 'FAILED';
            sentAt = undefined;
            failureReason = `Recipient user ${recipientId} does not have any active registered mobile devices with push tokens.`;
          } else {
            notifStatus = 'PENDING';
            sentAt = undefined;
            failureReason = pushRes.error || 'Push notification delivery error';
            scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
          }
        } catch (err: any) {
          console.error('[NotificationService] Push dispatch error:', err);
          failureReason = err?.message || 'Push notification error';
          notifStatus = 'PENDING';
          sentAt = undefined;
          scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        }
      } else {
        // WhatsApp or unconfigured custom channel
        notifStatus = 'FAILED';
        sentAt = undefined;
        failureReason = channel === 'whatsapp'
          ? 'WhatsApp Cloud API integration pending provider verification.'
          : `Channel "${channel}" is unsupported or provider is not configured.`;
      }

      const notification: NotificationRecord = {
        id: notifId,
        publicId: notifId,
        notificationId: notifId,
        userId: recipientId,
        orderId,
        type: eventType,
        channel,
        title: compiledTitle,
        body: compiledBody,
        status: notifStatus,
        failureReason,
        failedAt: notifStatus === 'FAILED' ? now : undefined,
        scheduledAt,
        provider: channel === 'in_app' ? 'local' : (channel === 'email' ? 'resend' : 'system'),
        providerMessageId: `msg_${crypto.randomBytes(6).toString('hex')}`,
        attemptCount: 1,
        maxAttempts: 3,
        sentAt: notifStatus === 'SENT' ? now : undefined,
        deliveredAt: channel === 'in_app' ? now : undefined,
        idempotencyKey: channelIdempotency,
        metadata,
        createdAt: now,
        updatedAt: now
      };

      const doc = {
        ...notification,
        message: compiledBody,
        read: false
      };

      await db.collection('notifications').insertOne(doc as any);
      results.push(notification);
    }

    return { success: true, notifications: results };
  }

  /**
   * Processes the notification retry queue with atomic claiming, real provider dispatch,
   * bounded retries, and exponential backoff with jitter.
   */
  static async processRetries(): Promise<{ retriedCount: number; failedPermanentlyCount: number }> {
    const db = await getDb();
    const now = new Date().toISOString();

    // 0. Recover abandoned SENDING notifications (e.g. from crashed background workers) older than 5 minutes
    const staleSendingThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await db.collection('notifications').updateMany(
      {
        status: 'SENDING',
        updatedAt: { $lte: staleSendingThreshold }
      },
      {
        $set: {
          status: 'PENDING',
          updatedAt: now
        }
      }
    );

    const pending = await db.collection('notifications')
      .find({
        status: 'PENDING',
        scheduledAt: { $lte: now }
      })
      .limit(50)
      .toArray();

    let retriedCount = 0;
    let failedPermanentlyCount = 0;

    for (const notif of pending) {
      // 1. Atomic claim to prevent concurrent workers from processing the same notification
      const claimed = await db.collection('notifications').findOneAndUpdate(
        { _id: notif._id, status: 'PENDING' },
        { $set: { status: 'SENDING', updatedAt: now } } as any,
        { returnDocument: 'after' }
      );

      if (!claimed) {
        continue; // Already claimed by another worker
      }

      const currentAttempts = notif.attemptCount || 1;
      const maxAttempts = notif.maxAttempts || 3;

      if (notif.channel === 'email') {
        try {
          const recipientUser = await db.collection('users').findOne(
            buildEntityLookupQuery(notif.userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
          );
          const recipientEmail = recipientUser?.email || (notif.userId?.includes('@') ? notif.userId : undefined);
          if (!recipientEmail) {
            throw new Error(`Recipient user ${notif.userId} has no registered email.`);
          }

          const emailResult = await sendEmail({
            to: recipientEmail,
            subject: notif.title,
            html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #0f172a; margin-bottom: 16px;">${notif.title}</h2>
              <p style="font-size: 16px; margin-bottom: 24px;">${notif.body || notif.message}</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b;">Laundelle Quality Laundry Services.</p>
            </div>`
          });
          if (!emailResult || !(emailResult as any).id) {
            throw new Error('Email provider did not accept message (missing confirmation identifier).');
          }

          await db.collection('notifications').updateOne(
            { _id: notif._id },
            {
              $set: {
                status: 'SENT',
                sentAt: new Date().toISOString(),
                providerMessageId: (emailResult as any)?.id || `msg_${crypto.randomBytes(6).toString('hex')}`,
                updatedAt: new Date().toISOString()
              }
            }
          );
          retriedCount++;
        } catch (err: any) {
          const nextAttempt = currentAttempts + 1;
          if (nextAttempt > maxAttempts) {
            // Mark permanently failed (Dead-Letter queue)
            await db.collection('notifications').updateOne(
              { _id: notif._id },
              {
                $set: {
                  status: 'FAILED',
                  failedAt: new Date().toISOString(),
                  failureReason: `Exceeded maximum allowable attempts (${maxAttempts}): ${err?.message || 'Delivery error'}`,
                  updatedAt: new Date().toISOString()
                }
              }
            );

            // Operational alert & exception log
            await AlertService.createAlert({
              type: 'NOTIFICATION_DEAD_LETTER',
              severity: 'CRITICAL',
              title: `Notification Dead-Letter: ${notif.id}`,
              message: `Dead-Letter Queue: Notification ${notif.id} failed permanently after ${maxAttempts} attempts across channel ${notif.channel}: ${err?.message}`,
              entityId: notif.id,
              entityType: 'NOTIFICATION'
            });

            const deadLetterExcId = generateExceptionId();
            await db.collection('exceptions').insertOne({
              id: deadLetterExcId,
              publicId: deadLetterExcId,
              orderId: notif.orderId || 'system',
              type: 'notification_delivery_failed',
              priority: 'medium',
              status: 'OPEN',
              description: `Dead-Letter Queue: Notification ${notif.id} failed permanently after ${maxAttempts} attempts across channel ${notif.channel}: ${err?.message}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            failedPermanentlyCount++;
          } else {
            // Exponential backoff with jitter
            const baseMinutes = Math.pow(2, currentAttempts);
            const jitterSeconds = Math.floor(Math.random() * 30);
            const delayMs = (baseMinutes * 60 + jitterSeconds) * 1000;
            const nextSchedule = new Date(Date.now() + delayMs).toISOString();

            await db.collection('notifications').updateOne(
              { _id: notif._id },
              {
                $set: {
                  attemptCount: nextAttempt,
                  scheduledAt: nextSchedule,
                  status: 'PENDING',
                  failureReason: err?.message || 'Email delivery failed',
                  updatedAt: new Date().toISOString()
                }
              }
            );
            retriedCount++;
          }
        }
      } else if (notif.channel === 'sms') {
        try {
          const recipientUser = await db.collection('users').findOne(
            buildEntityLookupQuery(notif.userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
          );
          const rawPhone = recipientUser?.phone || recipientUser?.mobile || (notif.userId?.startsWith('+') ? notif.userId : undefined);
          if (!rawPhone) {
            throw new Error(`Recipient user ${notif.userId} has no registered phone number.`);
          }

          const smsResult = await SmsService.sendSms({
            to: rawPhone,
            body: `${notif.title}\n${notif.body || notif.message}`
          });

          if (!smsResult.success) {
            throw new Error(smsResult.error || 'Twilio SMS retry dispatch failed');
          }

          await db.collection('notifications').updateOne(
            { _id: notif._id },
            {
              $set: {
                status: 'SENT',
                sentAt: new Date().toISOString(),
                providerMessageId: smsResult.messageId || `msg_${crypto.randomBytes(6).toString('hex')}`,
                updatedAt: new Date().toISOString()
              }
            }
          );
          retriedCount++;
        } catch (err: any) {
          const nextAttempt = currentAttempts + 1;
          if (nextAttempt > maxAttempts) {
            await db.collection('notifications').updateOne(
              { _id: notif._id },
              {
                $set: {
                  status: 'FAILED',
                  failedAt: new Date().toISOString(),
                  failureReason: `Exceeded maximum allowable attempts (${maxAttempts}): ${err?.message || 'Delivery error'}`,
                  updatedAt: new Date().toISOString()
                }
              }
            );
            failedPermanentlyCount++;
          } else {
            const baseMinutes = Math.pow(2, currentAttempts);
            const delayMs = (baseMinutes * 60 + Math.floor(Math.random() * 30)) * 1000;
            const nextSchedule = new Date(Date.now() + delayMs).toISOString();

            await db.collection('notifications').updateOne(
              { _id: notif._id },
              {
                $set: {
                  attemptCount: nextAttempt,
                  scheduledAt: nextSchedule,
                  status: 'PENDING',
                  failureReason: err?.message || 'SMS delivery failed',
                  updatedAt: new Date().toISOString()
                }
              }
            );
            retriedCount++;
          }
        }
      } else if (notif.channel === 'push') {
        try {
          const pushResult = await PushNotificationService.sendPush({
            userId: notif.userId,
            title: notif.title,
            body: notif.body || notif.message,
            data: { orderId: notif.orderId, notificationId: notif.id }
          });

          if (!pushResult.success && pushResult.status !== 'SKIPPED_NO_DEVICE') {
            throw new Error(pushResult.error || 'Push retry dispatch failed');
          }

          await db.collection('notifications').updateOne(
            { _id: notif._id },
            {
              $set: {
                status: 'SENT',
                sentAt: new Date().toISOString(),
                providerMessageId: pushResult.messageIds[0] || `push_${Date.now()}`,
                updatedAt: new Date().toISOString()
              }
            }
          );
          retriedCount++;
        } catch (err: any) {
          const nextAttempt = currentAttempts + 1;
          if (nextAttempt > maxAttempts) {
            await db.collection('notifications').updateOne(
              { _id: notif._id },
              {
                $set: {
                  status: 'FAILED',
                  failedAt: new Date().toISOString(),
                  failureReason: `Exceeded maximum allowable attempts (${maxAttempts}): ${err?.message || 'Push error'}`,
                  updatedAt: new Date().toISOString()
                }
              }
            );
            failedPermanentlyCount++;
          } else {
            const baseMinutes = Math.pow(2, currentAttempts);
            const delayMs = (baseMinutes * 60) * 1000;
            const nextSchedule = new Date(Date.now() + delayMs).toISOString();

            await db.collection('notifications').updateOne(
              { _id: notif._id },
              {
                $set: {
                  attemptCount: nextAttempt,
                  scheduledAt: nextSchedule,
                  status: 'PENDING',
                  failureReason: err?.message || 'Push delivery failed',
                  updatedAt: new Date().toISOString()
                }
              }
            );
            retriedCount++;
          }
        }
      } else {
        // Unsupported channel
        await db.collection('notifications').updateOne(
          { _id: notif._id },
          {
            $set: {
              status: 'FAILED',
              failedAt: new Date().toISOString(),
              failureReason: `Channel "${notif.channel}" is unsupported or provider is not configured.`,
              updatedAt: new Date().toISOString()
            }
          }
        );
        failedPermanentlyCount++;
      }
    }

    return { retriedCount, failedPermanentlyCount };
  }

  /**
   * Get paginated notifications for a specific user.
   */
  static async getUserNotifications(userId: string, page: number = 1, limit: number = 50) {
    const db = await getDb();
    const collection = db.collection('notifications');

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * safeLimit;

    // Resolve possible IDs for user
    const cleanId = (userId || '').trim();
    const possibleIds = new Set<string>([cleanId]);
    try {
      const orQueries: any[] = [
        { _id: cleanId as any },
        { id: cleanId },
        { customerId: cleanId },
        { publicId: cleanId },
        { auth0_sub: cleanId },
        { auth0UserId: cleanId },
        { email: cleanId.toLowerCase() }
      ];
      if (typeof cleanId === 'string' && ObjectId.isValid(cleanId) && cleanId.length === 24) {
        try {
          orQueries.push({ _id: new ObjectId(cleanId) as any });
        } catch {}
      }
      const userDoc = await db.collection('users').findOne({ $or: orQueries });
      if (userDoc) {
        if (userDoc._id) possibleIds.add(String(userDoc._id));
        if (userDoc.customerId) possibleIds.add(String(userDoc.customerId));
        if (userDoc.publicId) possibleIds.add(String(userDoc.publicId));
        if (userDoc.id) possibleIds.add(String(userDoc.id));
        if (userDoc.auth0_sub) possibleIds.add(String(userDoc.auth0_sub));
        if (userDoc.auth0UserId) possibleIds.add(String(userDoc.auth0UserId));
      }
    } catch {}

    const filter = { userId: { $in: Array.from(possibleIds) } };

    const total = await collection.countDocuments(filter as any);
    const notifications = await collection
      .find(filter as any)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .toArray();

    return {
      items: notifications,
      pagination: {
        page,
        limit: safeLimit,
        total,
        hasNextPage: skip + notifications.length < total
      }
    };
  }

  /**
   * Get the count of unread notifications for a specific user.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const db = await getDb();
    return await db.collection('notifications').countDocuments({ userId, read: false } as any);
  }

  /**
   * Mark a single notification as read, validating ownership.
   */
  static async markAsRead(userId: string, notificationId: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    const result = await db.collection('notifications').updateOne(
      { id: notificationId, userId } as any,
      { $set: { read: true, readAt: new Date().toISOString() } } as any
    );

    if (result.matchedCount === 0) {
      return { success: false, error: 'Notification not found or access denied.' };
    }
    return { success: true };
  }

  /**
   * Mark all notifications as read for a specific user.
   */
  static async markAllAsRead(userId: string): Promise<{ success: boolean; modifiedCount?: number }> {
    const db = await getDb();
    const result = await db.collection('notifications').updateMany(
      { userId, read: false } as any,
      { $set: { read: true, readAt: new Date().toISOString() } } as any
    );

    return { success: true, modifiedCount: result.modifiedCount };
  }
}
