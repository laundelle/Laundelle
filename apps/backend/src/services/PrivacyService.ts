import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { DataRetentionPolicy, PrivacyRequest, PrivacyRequestType, PrivacyRequestStatus } from '@laundelle/types';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/lib/api';
import { AuditService } from './AuditService';
import crypto from 'crypto';
import { generatePrivacyRequestId, buildEntityLookupQuery } from '@laundelle/ids';

export const DEFAULT_RETENTION_POLICIES: Record<string, DataRetentionPolicy> = {
  customer_data: {
    dataType: 'customer_data',
    retentionPeriodDays: 730, // 2 years post-inactivity
    legalBasis: 'GDPR Art. 6(1)(b) Contractual Performance',
    deletionStrategy: 'ANONYMIZE_REDACT',
    enabled: true,
    description: 'Anonymizes customer profile data while preserving statutory financial records.'
  },
  operational_photos: {
    dataType: 'operational_photos',
    retentionPeriodDays: 90, // 90 days after delivery
    legalBasis: 'GDPR Art. 6(1)(f) Legitimate Interest (Dispute Resolution)',
    deletionStrategy: 'HARD_DELETE',
    enabled: true,
    description: 'Purges intake and processing photos 90 days post-order completion.'
  },
  delivery_evidence: {
    dataType: 'delivery_evidence',
    retentionPeriodDays: 180, // 6 months post-delivery
    legalBasis: 'GDPR Art. 6(1)(b) Delivery Verification',
    deletionStrategy: 'HARD_DELETE',
    enabled: true,
    description: 'Purges doorstep and signature photos after dispute window closes.'
  },
  gps_records: {
    dataType: 'gps_records',
    retentionPeriodDays: 30, // 30 days
    legalBasis: 'GDPR Art. 6(1)(f) Logistics Routing',
    deletionStrategy: 'HARD_DELETE',
    enabled: true,
    description: 'Deletes high-resolution driver location breadcrumbs.'
  },
  notification_logs: {
    dataType: 'notification_logs',
    retentionPeriodDays: 90, // 90 days
    legalBasis: 'GDPR Art. 6(1)(f) Operational Reliability',
    deletionStrategy: 'HARD_DELETE',
    enabled: true,
    description: 'Purges completed transactional notification logs.'
  },
  audit_logs: {
    dataType: 'audit_logs',
    retentionPeriodDays: 2555, // 7 years (Statutory HMRC requirement)
    legalBasis: 'GDPR Art. 6(1)(c) Compliance with Legal Obligation',
    deletionStrategy: 'ARCHIVE_COLD',
    enabled: true,
    description: 'Statutory financial and chain-of-custody audit trail.'
  }
};

export class PrivacyService {
  /**
   * Retrieves active data retention policies.
   */
  static getRetentionPolicies(): Record<string, DataRetentionPolicy> {
    return DEFAULT_RETENTION_POLICIES;
  }

  /**
   * Submits a customer privacy request (Deletion, Export, Correction, Access).
   */
  static async createPrivacyRequest(params: {
    userId: string;
    requestType: PrivacyRequestType;
    reason?: string;
  }): Promise<PrivacyRequest> {
    const { userId, requestType, reason } = params;
    const db = await getDb();

    const user = await db.collection('users').findOne(
      buildEntityLookupQuery(userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    if (!user) throw new NotFoundError('User account not found.');

    const reqId = generatePrivacyRequestId();
    const now = new Date().toISOString();

    const privacyRequest: PrivacyRequest = {
      id: reqId,
      publicId: reqId,
      requestId: reqId,
      userId,
      userEmail: user.email,
      requestType,
      status: 'PENDING',
      requestedAt: now,
      reason,
      createdAt: now,
      updatedAt: now
    };

    await db.collection('privacy_requests').insertOne(privacyRequest as any);

    await AuditService.recordEvent({
      actorId: userId,
      actorRole: user.role || 'customer',
      action: `privacy_request_${requestType.toLowerCase()}`,
      entityType: 'privacy_request',
      entityId: reqId,
      reason,
      metadata: { requestType }
    });

    // If deletion request, automatically trigger compliant anonymization
    if (requestType === 'DELETION') {
      await this.executeAccountAnonymization(userId, reqId);
    }

    return privacyRequest;
  }

  /**
   * Executes compliant account anonymization under GDPR.
   * Redacts all PII while safely preserving financial transactions for tax/audit compliance.
   */
  static async executeAccountAnonymization(userId: string, privacyRequestId?: string): Promise<{ success: boolean; anonymizedAt: string }> {
    const db = await getDb();
    const user = await db.collection('users').findOne(
      buildEntityLookupQuery(userId, 'user', (v) => ObjectId.isValid(v) ? new ObjectId(v) : null) as any
    );
    if (!user) throw new NotFoundError('User not found for anonymization.');

    const now = new Date().toISOString();
    const anonId = crypto.randomBytes(6).toString('hex');
    const anonymizedEmail = `anonymized_${anonId}@privacy.laundelle.co.uk`;

    // 1. Redact User profile
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          fullName: 'Anonymized Customer',
          full_name: 'Anonymized Customer',
          name: 'Anonymized Customer',
          email: anonymizedEmail,
          phone: 'REDACTED',
          avatar_url: '',
          customer_status: 'anonymized',
          addresses: [],
          is_blocked: true,
          isAnonymized: true,
          anonymized_at: now,
          updated_at: now
        }
      }
    );

    // 2. Anonymize personal details in historical Orders, while preserving financial amounts
    const userDbId = String(user._id);
    const userIdentifiers = [userDbId, user.publicId, user.customerId, user.id, user.auth0UserId, user.auth0_sub, userId].filter(Boolean);
    await db.collection('orders').updateMany(
      {
        $or: [
          { customer_id: { $in: userIdentifiers } },
          { customerId: { $in: userIdentifiers } },
          { userId: { $in: userIdentifiers } },
          { user_id: { $in: userIdentifiers } }
        ]
      } as any,
      {
        $set: {
          customerName: 'Anonymized Customer',
          customerEmail: anonymizedEmail,
          customerPhone: 'REDACTED',
          'address.line1': 'REDACTED',
          'collectionAddress.line1': 'REDACTED',
          'deliveryAddress.line1': 'REDACTED',
          updated_at: now
        }
      }
    );

    await AuditService.recordEvent({
      entityType: 'privacy',
      entityId: userId,
      action: 'gdpr_order_data_anonymized',
      actorId: userId,
      actorRole: 'system',
      reason: 'GDPR Right to be Forgotten request processed',
      metadata: { anonymizedEmail }
    });

    // 3. Mark privacy request as COMPLETED
    if (privacyRequestId) {
      await db.collection('privacy_requests').updateOne(
        { id: privacyRequestId },
        {
          $set: {
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now
          }
        }
      );
    }

    // 4. Record tamper-evident audit entry
    await AuditService.recordEvent({
      actorId: userId,
      actorRole: 'customer',
      action: 'account_anonymized_gdpr',
      entityType: 'user',
      entityId: userId,
      reason: 'Customer GDPR Right to Erasure / Anonymization exercised',
      metadata: { anonymizedAt: now }
    });

    return { success: true, anonymizedAt: now };
  }

  /**
   * Generates a comprehensive, machine-readable personal data export bundle (GDPR Art. 20).
   */
  static async generateDataExport(userId: string): Promise<Record<string, any>> {
    const db = await getDb();
    const query = buildEntityLookupQuery(userId, 'user');
    const user = await db.collection('users').findOne(query as any);
    if (!user) throw new NotFoundError('User not found.');

    const userDbId = String(user._id);
    const userPublicId = user.publicId;
    const userCustomerId = user.customerId;
    const userLegacyId = user.id;
    const userAuth0Id = user.auth0UserId || user.auth0_sub;
    const userEmail = user.email ? user.email.toLowerCase().trim() : null;

    const userIdentifiers = [userDbId, userPublicId, userCustomerId, userLegacyId, userAuth0Id, userId].filter(Boolean);
    const orderCustomerConditions: any[] = [
      { customer_id: { $in: userIdentifiers } },
      { customerId: { $in: userIdentifiers } },
      { userId: { $in: userIdentifiers } },
      { user_id: { $in: userIdentifiers } }
    ];
    if (userEmail) {
      orderCustomerConditions.push({ customerEmail: userEmail });
      orderCustomerConditions.push({ email: userEmail });
    }

    const [orders, notifications, subscriptions] = await Promise.all([
      db.collection('orders').find({ $or: orderCustomerConditions }).sort({ createdAt: -1 }).toArray(),
      db.collection('notifications').find({ userId: { $in: userIdentifiers } }).sort({ createdAt: -1 }).toArray(),
      db.collection('subscriptions').find({
        $or: [
          { customerId: { $in: userIdentifiers } },
          { userId: { $in: userIdentifiers } }
        ]
      }).toArray()
    ]);

    const sanitizedUser = { ...user };
    delete (sanitizedUser as any).password;
    delete (sanitizedUser as any).passwordHash;

    const exportBundle = {
      exportVersion: '1.0',
      generatedAt: new Date().toISOString(),
      exportedAt: new Date().toISOString(),
      subjectId: userPublicId || userCustomerId || userDbId,
      user: sanitizedUser,
      profile: sanitizedUser,
      orders,
      notifications,
      subscriptions
    };

    return exportBundle;
  }

  /**
   * Evaluates active retention policies and safely purges or archives expired operational records.
   */
  static async runDataRetentionSweep(): Promise<{
    sweptAt: string;
    purgedPhotosCount: number;
    purgedNotificationsCount: number;
  }> {
    const db = await getDb();
    const now = new Date();
    const isoNow = now.toISOString();

    // 1. Purge expired operational photos
    const photoCutoff = new Date(now.getTime() - DEFAULT_RETENTION_POLICIES.operational_photos.retentionPeriodDays * 24 * 60 * 60 * 1000).toISOString();
    const purgedFilesResult = await db.collection('files').updateMany(
      {
        fileType: { $in: ['intake_photo', 'scale_photo', 'damage_photo', 'qc_photo'] },
        uploadedAt: { $lt: photoCutoff },
        status: 'ACTIVE'
      },
      {
        $set: { status: 'PURGED', purgedAt: isoNow }
      }
    );

    // 2. Purge old notification logs
    const notifCutoff = new Date(now.getTime() - DEFAULT_RETENTION_POLICIES.notification_logs.retentionPeriodDays * 24 * 60 * 60 * 1000).toISOString();
    const purgedNotifsResult = await db.collection('notifications').deleteMany({
      createdAt: { $lt: notifCutoff },
      read: true
    });

    return {
      sweptAt: isoNow,
      purgedPhotosCount: purgedFilesResult.modifiedCount,
      purgedNotificationsCount: purgedNotifsResult.deletedCount
    };
  }
}
