import { getDb } from '@/lib/mongodb';
import { FileRecord, FileType } from '@laundelle/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api';
import crypto from 'crypto';
import { generateEvidenceId } from '@laundelle/ids';
import { GridFSBucket, ObjectId } from 'mongodb';
import { Readable } from 'stream';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf'
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const SIGNED_TOKEN_SECRET = (() => {
  const secret = process.env.FILE_SIGNING_SECRET || (process.env.NODE_ENV !== 'production' ? process.env.JWT_SECRET : undefined);
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: FILE_SIGNING_SECRET environment variable is required in production.');
    }
    return 'dev_laundelle_file_signing_secret_2026';
  }
  return secret;
})();
export const EVIDENCE_BUCKET_NAME = 'evidence_files';

export interface StoreFileParams {
  orderId?: string;
  entityType?: 'order' | 'incident' | 'machine' | 'user' | string;
  entityId?: string;
  fileType: FileType;
  mimeType: string;
  size?: number;
  bufferOrBase64?: Buffer | string;
  storageKey?: string;
  url?: string;
  uploadedBy: string;
  uploadedByRole?: string;
  metadata?: any;
}

export class FileStorageService {
  /**
   * Returns the MongoDB GridFSBucket for binary evidence persistence.
   */
  static async getGridFSBucket(): Promise<GridFSBucket> {
    const db = await getDb();
    return new GridFSBucket(db, { bucketName: EVIDENCE_BUCKET_NAME });
  }

  /**
   * Inspects magic bytes of raw file buffer to verify true content type
   * and prevent spoofed MIME extensions / executable file uploads.
   */
  static detectMimeTypeFromBuffer(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
      return 'image/png';
    }
    // PDF: %PDF (25 50 44 46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'application/pdf';
    }
    // WEBP: RIFF....WEBP
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp';
    }

    return null;
  }

  /**
   * Normalizes incoming buffer or base64 string into a clean Buffer.
   */
  static normalizeBuffer(bufferOrBase64: Buffer | string): Buffer {
    if (Buffer.isBuffer(bufferOrBase64)) {
      return bufferOrBase64;
    }
    if (typeof bufferOrBase64 === 'string') {
      const cleanBase64 = bufferOrBase64.replace(/^data:[^;]+;base64,/, '').trim();
      return Buffer.from(cleanBase64, 'base64');
    }
    throw new BadRequestError('Invalid file payload: Expected Buffer or base64 string.');
  }

  /**
   * Computes SHA-256 checksum of raw file buffer.
   */
  static computeChecksum(bufferOrBase64: Buffer | string): string {
    const buf = this.normalizeBuffer(bufferOrBase64);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Validates file checksum against expected hash.
   */
  static verifyFileChecksum(bufferOrBase64: Buffer | string, expectedChecksum: string): boolean {
    const computed = this.computeChecksum(bufferOrBase64);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(expectedChecksum, 'hex');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Generates a safe, randomized storage key preventing directory traversal or path injection.
   */
  static generateStorageKey(fileType: FileType, entityId: string, mimeType: string): string {
    const ext = mimeType.split('/')[1]?.toLowerCase() || 'bin';
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '');
    const randomHex = crypto.randomBytes(8).toString('hex');
    const datePrefix = new Date().toISOString().split('T')[0];
    return `${fileType}/${datePrefix}/${(entityId || 'general').replace(/[^a-zA-Z0-9_-]/g, '')}_${randomHex}.${safeExt}`;
  }

  /**
   * Stores file binary data in MongoDB GridFS and records metadata in `files` collection.
   * Validates MIME type, size limit (5MB), and computes cryptographic checksum.
   */
  static async registerFile(params: StoreFileParams): Promise<FileRecord> {
    const {
      orderId,
      entityType = 'order',
      entityId,
      fileType,
      mimeType,
      bufferOrBase64,
      uploadedBy,
      uploadedByRole = 'user',
      metadata = {}
    } = params;

    // 1. Validate MIME format string
    const normalizedMime = (mimeType || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
      throw new BadRequestError(
        `Invalid file format '${mimeType}'. Allowed formats: JPEG, PNG, WebP, PDF.`
      );
    }

    // 2. Validate Buffer & Size & True Binary Signature (Magic Bytes)
    let fileBuffer: Buffer | null = null;
    let actualSize = params.size || 0;
    let effectiveMime = normalizedMime;

    if (bufferOrBase64) {
      fileBuffer = this.normalizeBuffer(bufferOrBase64);
      actualSize = fileBuffer.length;

      // Validate magic bytes against allowed binary signatures (M-7)
      const detectedMime = this.detectMimeTypeFromBuffer(fileBuffer);
      if (!detectedMime) {
        throw new BadRequestError(
          'File signature validation failed. Uploaded content does not match allowed binary formats (JPEG, PNG, WebP, PDF).'
        );
      }
      effectiveMime = detectedMime;
    }

    if (actualSize > MAX_FILE_SIZE) {
      throw new BadRequestError(
        `File exceeds maximum permissible size of 5MB (Provided: ${(actualSize / 1024 / 1024).toFixed(2)}MB).`
      );
    }

    // 3. Compute Checksum
    const checksum = fileBuffer
      ? this.computeChecksum(fileBuffer)
      : crypto.createHash('sha256').update(`${orderId}_${fileType}_${Date.now()}`).digest('hex');

    const db = await getDb();

    // 4. Duplicate Check (prevent uploading identical file for the same entity)
    const existing = await db.collection('files').findOne({
      checksum,
      entityId: entityId || orderId,
      status: 'ACTIVE'
    });
    if (existing) {
      return existing as unknown as FileRecord;
    }

    // 5. Generate secure identifiers
    const fileId = generateEvidenceId();
    const storageKey = params.storageKey || this.generateStorageKey(fileType, entityId || orderId || 'anon', effectiveMime);
    const now = new Date().toISOString();

    // Default retention: 180 days for operational files, configurable
    const retentionUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    // 6. Persist original binary into MongoDB GridFS
    let gridFsFileId: string | undefined = undefined;

    if (fileBuffer) {
      const bucket = await this.getGridFSBucket();
      try {
        const uploadStream = bucket.openUploadStream(storageKey, {
          metadata: {
            fileId,
            orderId,
            entityId: entityId || orderId,
            entityType,
            fileType,
            mimeType: effectiveMime,
            checksum,
            uploadedBy,
            uploadedAt: now
          }
        });

        await new Promise<void>((resolve, reject) => {
          uploadStream.on('error', (err) => reject(err));
          uploadStream.on('finish', () => resolve());
          uploadStream.end(fileBuffer);
        });

        gridFsFileId = String(uploadStream.id);
      } catch (gridErr: any) {
        console.error('[FileStorageService] GridFS binary upload failed:', gridErr.message);
        throw new BadRequestError(`Failed to persist file binary: ${gridErr.message}`);
      }
    }

    const record: FileRecord & { gridFsId?: string } = {
      id: fileId,
      publicId: fileId,
      evidenceId: fileId,
      fileId,
      orderId,
      entityType,
      entityId: entityId || orderId,
      fileType,
      storageKey,
      url: params.url || `/api/v1/files/${fileId}`,
      mimeType: effectiveMime,
      size: actualSize,
      checksum,
      checksumSha256: checksum,
      uploadedBy,
      uploadedByRole,
      uploadedAt: now,
      retentionUntil,
      status: 'ACTIVE',
      metadata: {
        ...metadata,
        gridFsId: gridFsFileId
      }
    };

    if (gridFsFileId) {
      record.gridFsId = gridFsFileId;
    }

    await db.collection('files').insertOne(record as any);

    return record;
  }

  /**
   * Convenience helper for uploading/saving files with flexible parameter signatures.
   */
  static async saveFile(params: {
    fileName?: string;
    mimeType: string;
    sizeBytes?: number;
    size?: number;
    buffer?: Buffer;
    bufferOrBase64?: Buffer | string;
    uploadedByUserId?: string;
    uploadedBy?: string;
    uploadedByRole?: string;
    orderId?: string;
    entityId?: string;
    entityType?: string;
    fileType?: FileType;
    accessControl?: string;
    metadata?: any;
  }): Promise<FileRecord> {
    return this.registerFile({
      fileType: params.fileType || 'customer_attachment',
      mimeType: params.mimeType,
      size: params.sizeBytes ?? params.size,
      bufferOrBase64: params.buffer ?? params.bufferOrBase64,
      uploadedBy: params.uploadedByUserId ?? params.uploadedBy ?? 'system',
      uploadedByRole: params.uploadedByRole || 'customer',
      orderId: params.orderId,
      entityId: params.entityId,
      entityType: params.entityType,
      metadata: { ...params.metadata, accessControl: params.accessControl, fileName: params.fileName }
    });
  }

  /**
   * Generates a short-lived signed access token for secure, authenticated file downloads.
   */
  static generateSignedToken(fileId: string, userIdOrTtl: string | number = 'anonymous', ttlSeconds = 300): string {
    let userId = 'anonymous';
    let ttl = ttlSeconds;
    if (typeof userIdOrTtl === 'number') {
      ttl = userIdOrTtl;
    } else {
      userId = userIdOrTtl;
    }
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const payload = `${fileId}:${userId}:${expiresAt}`;
    const signature = crypto.createHmac('sha256', SIGNED_TOKEN_SECRET).update(payload).digest('hex');
    return `${Buffer.from(payload).toString('base64url')}.${signature}`;
  }

  /**
   * Verifies a short-lived signed access token.
   */
  static verifySignedToken(fileIdOrToken: string, tokenArg?: string): { valid: boolean; fileId?: string; userId?: string } {
    const token = tokenArg || fileIdOrToken;
    const expectedFileId = tokenArg ? fileIdOrToken : undefined;
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return { valid: false };

      const [encodedPayload, signature] = parts;
      const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
      const expectedSig = crypto.createHmac('sha256', SIGNED_TOKEN_SECRET).update(payload).digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return { valid: false };
      }

      const [fileId, userId, expiresAtStr] = payload.split(':');
      if (expectedFileId && fileId !== expectedFileId) {
        return { valid: false };
      }
      const expiresAt = parseInt(expiresAtStr, 10);
      if (Math.floor(Date.now() / 1000) > expiresAt) {
        return { valid: false }; // Expired
      }

      return { valid: true, fileId, userId };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Retrieves a file record with strict RBAC & IDOR validation.
   */
  static async getFile(
    fileId: string,
    requester: { id: string; role: string; plantId?: string }
  ): Promise<FileRecord & { gridFsId?: string }> {
    const db = await getDb();
    const cleanId = (fileId || '').trim();
    const file = await db.collection('files').findOne({
      $or: [{ publicId: cleanId }, { fileId: cleanId }, { id: cleanId }]
    });

    if (!file || file.status === 'PURGED') {
      throw new NotFoundError('File not found or has been purged.');
    }

    const role = (requester.role || 'customer').toLowerCase();

    // 1. Admin & Super Admin have global access
    if (['admin', 'super_admin'].includes(role)) {
      return file as unknown as FileRecord & { gridFsId?: string };
    }

    // 2. Customer: check order ownership or uploader
    if (role === 'customer') {
      if (file.orderId) {
        const order = await db.collection('orders').findOne({
          $or: [{ id: file.orderId }, { publicId: file.orderId }]
        });
        const orderCustomer = order?.customer_id || order?.customerId || order?.userId;
        if (order) {
          if (String(orderCustomer) !== String(requester.id) && file.uploadedBy !== requester.id) {
            throw new ForbiddenError('Access Denied: You do not own this order evidence.');
          }
        } else {
          // If order record is not found in database, requester must be the original uploader
          if (file.uploadedBy !== requester.id) {
            throw new ForbiddenError('Access Denied: You do not own this order evidence.');
          }
        }
      } else if (file.uploadedBy !== requester.id) {
        throw new ForbiddenError('Access Denied: Unauthorized file access.');
      }
    }

    // 3. Driver: check order assignment
    if (role === 'driver') {
      if (file.orderId) {
        const order = await db.collection('orders').findOne({
          $or: [{ id: file.orderId }, { publicId: file.orderId }]
        });
        const driverId = order?.assigned_driver_id || order?.delivery_driver_id;
        if (order && driverId && String(driverId) !== String(requester.id)) {
          throw new ForbiddenError('Access Denied: You are not assigned to this job.');
        }
      }
    }

    // 4. Plant Manager: check plant boundary
    if (role === 'manager' || role === 'plant_manager') {
      if (file.orderId && requester.plantId) {
        const order = await db.collection('orders').findOne({
          $or: [{ id: file.orderId }, { publicId: file.orderId }]
        });
        const orderPlant = order?.plant_id || order?.plantId;
        if (order && orderPlant && String(orderPlant) !== String(requester.plantId)) {
          throw new ForbiddenError('Access Denied: Order belongs to a different facility.');
        }
      }
    }

    return file as unknown as FileRecord & { gridFsId?: string };
  }

  /**
   * Retrieves original binary stream from MongoDB GridFS with RBAC authorization.
   */
  static async getFileStream(
    fileId: string,
    requester: { id: string; role: string; plantId?: string }
  ): Promise<{ stream: NodeJS.ReadableStream; file: FileRecord }> {
    const file = await this.getFile(fileId, requester);
    const bucket = await this.getGridFSBucket();

    // 1. Try download by GridFS ObjectId
    const gridFsId = (file as any).gridFsId || file.metadata?.gridFsId;
    if (gridFsId && ObjectId.isValid(gridFsId)) {
      try {
        const stream = bucket.openDownloadStream(new ObjectId(gridFsId));
        return { stream, file };
      } catch (err: any) {
        console.warn(`[FileStorageService] GridFS download by ObjectId failed (${gridFsId}), falling back to filename:`, err.message);
      }
    }

    // 2. Fallback: Try download by storageKey filename
    if (file.storageKey) {
      try {
        const stream = bucket.openDownloadStreamByName(file.storageKey);
        return { stream, file };
      } catch (err: any) {
        console.warn(`[FileStorageService] GridFS download by filename failed (${file.storageKey}):`, err.message);
      }
    }

    throw new NotFoundError('Binary file contents not found in persistent object storage.');
  }

  /**
   * Retrieves original binary buffer from MongoDB GridFS with RBAC authorization.
   */
  static async getFileBuffer(
    fileId: string,
    requester: { id: string; role: string; plantId?: string }
  ): Promise<{ buffer: Buffer; file: FileRecord }> {
    const { stream, file } = await this.getFileStream(fileId, requester);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    return { buffer: Buffer.concat(chunks), file };
  }

  /**
   * Deletes a file and purges its binary data from MongoDB GridFS.
   */
  static async deleteFile(
    fileId: string,
    requester: { id: string; role: string; plantId?: string }
  ): Promise<{ success: boolean }> {
    const file = await this.getFile(fileId, requester);
    const db = await getDb();
    const bucket = await this.getGridFSBucket();

    // 1. Delete GridFS binary files and chunks
    const gridFsId = (file as any).gridFsId || file.metadata?.gridFsId;
    if (gridFsId && ObjectId.isValid(gridFsId)) {
      try {
        await bucket.delete(new ObjectId(gridFsId));
      } catch (err: any) {
        console.warn('[FileStorageService] GridFS binary delete error:', err.message);
      }
    } else if (file.storageKey) {
      try {
        const matchingFiles = await bucket.find({ filename: file.storageKey }).toArray();
        for (const gf of matchingFiles) {
          await bucket.delete(gf._id).catch(() => {});
        }
      } catch (err: any) {
        console.warn('[FileStorageService] GridFS files cleanup error:', err.message);
      }
    }

    // 2. Mark record as PURGED in files collection
    await db.collection('files').updateOne(
      { fileId: file.fileId },
      {
        $set: {
          status: 'PURGED',
          purgedAt: new Date().toISOString(),
          purgedBy: requester.id
        }
      }
    );

    return { success: true };
  }
}
