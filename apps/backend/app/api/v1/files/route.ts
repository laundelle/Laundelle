import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, getAuthenticatedUserAsync, UnauthorizedError, BadRequestError, handleOptions } from '@/lib/api';
import { FileStorageService } from '@/services/FileStorageService';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const authUser = await getAuthenticatedUserAsync(req);
  if (!authUser) {
    throw new UnauthorizedError('Authentication required to upload files.');
  }

  const contentType = req.headers.get('content-type') || '';
  let fileBuffer: Buffer;
  let mimeType: string;
  let fileName: string | undefined;
  let fileType: any = 'customer_attachment';
  let orderId: string | undefined;
  let entityId: string | undefined;
  let entityType: string = 'order';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const fileEntry = formData.get('file') as File | null;
    if (!fileEntry) {
      throw new BadRequestError('Multipart form-data must contain a "file" field.');
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
    mimeType = fileEntry.type || 'application/octet-stream';
    fileName = fileEntry.name;

    fileType = (formData.get('fileType') as string) || fileType;
    orderId = (formData.get('orderId') as string) || undefined;
    entityId = (formData.get('entityId') as string) || undefined;
    entityType = (formData.get('entityType') as string) || entityType;
  } else {
    const body = await req.json().catch(() => ({}));
    if (!body.buffer && !body.base64 && !body.file) {
      throw new BadRequestError('Request body must contain base64 string or buffer.');
    }
    const rawData = body.buffer || body.base64 || body.file;
    fileBuffer = FileStorageService.normalizeBuffer(rawData);
    mimeType = body.mimeType || 'image/jpeg';
    fileName = body.fileName;
    fileType = body.fileType || fileType;
    orderId = body.orderId;
    entityId = body.entityId;
    entityType = body.entityType || entityType;
  }

  const uploadedBy = authUser.sub || authUser.userId || String(authUser.publicId);
  const uploadedByRole = authUser.role || 'customer';

  const record = await FileStorageService.registerFile({
    orderId,
    entityId: entityId || orderId,
    entityType,
    fileType,
    mimeType,
    bufferOrBase64: fileBuffer,
    uploadedBy,
    uploadedByRole,
    metadata: { fileName }
  });

  return successResponse({
    fileId: record.fileId,
    publicId: record.publicId,
    url: record.url,
    size: record.size,
    mimeType: record.mimeType,
    checksum: record.checksum,
    uploadedAt: record.uploadedAt
  }, 201);
});

