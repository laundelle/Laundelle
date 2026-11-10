import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, successResponse, getAuthenticatedUserAsync, UnauthorizedError, BadRequestError, handleOptions } from '@/lib/api';
import { FileStorageService } from '@/services/FileStorageService';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export const GET = withErrorHandler(async (req: NextRequest, context: any) => {
  const params = await context.params;
  const fileId = params?.id;
  if (!fileId) throw new BadRequestError('File ID is required.');

  const { searchParams } = new URL(req.url);
  const signedToken = searchParams.get('token');
  const returnMetaOnly = searchParams.get('meta') === 'true';
  const isDownload = searchParams.get('download') === 'true';

  let requester: { id: string; role: string; plantId?: string };

  if (signedToken) {
    const verified = FileStorageService.verifySignedToken(signedToken);
    if (!verified.valid || verified.fileId !== fileId) {
      throw new UnauthorizedError('Invalid or expired signed file access token.');
    }
    requester = { id: verified.userId || 'anonymous', role: 'customer' };
  } else {
    const authUser = await getAuthenticatedUserAsync(req);
    if (!authUser) {
      throw new UnauthorizedError('Authentication or signed access token required to view file.');
    }
    requester = {
      id: authUser.sub || authUser.userId || String(authUser.publicId),
      role: authUser.role || 'customer',
      plantId: authUser.plantId || authUser.plant_id
    };
  }

  // If caller specifically requested metadata JSON
  if (returnMetaOnly) {
    const file = await FileStorageService.getFile(fileId, requester);
    return successResponse({
      fileId: file.fileId,
      publicId: file.publicId,
      orderId: file.orderId,
      entityType: file.entityType,
      entityId: file.entityId,
      fileType: file.fileType,
      mimeType: file.mimeType,
      size: file.size,
      checksum: file.checksum,
      url: file.url,
      uploadedAt: file.uploadedAt,
      retentionUntil: file.retentionUntil,
      status: file.status,
      hasBinary: Boolean((file as any).gridFsId || file.metadata?.gridFsId)
    });
  }

  // Stream raw binary file from GridFS
  const { buffer, file } = await FileStorageService.getFileBuffer(fileId, requester);
  const fileName = file.metadata?.fileName || `${file.fileType}_${file.fileId}.${file.mimeType.split('/')[1] || 'bin'}`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Content-Disposition': isDownload ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`,
      'Cache-Control': 'private, max-age=86400, no-transform',
      'ETag': `"${file.checksum}"`,
      'X-Content-Type-Options': 'nosniff'
    }
  });
});

export const DELETE = withErrorHandler(async (req: NextRequest, context: any) => {
  const params = await context.params;
  const fileId = params?.id;
  if (!fileId) throw new BadRequestError('File ID is required.');

  const authUser = await getAuthenticatedUserAsync(req);
  if (!authUser) {
    throw new UnauthorizedError('Authentication required to delete file.');
  }

  const requester = {
    id: authUser.sub || authUser.userId || String(authUser.publicId),
    role: authUser.role || 'customer',
    plantId: authUser.plantId || authUser.plant_id
  };

  const result = await FileStorageService.deleteFile(fileId, requester);
  return successResponse({
    success: result.success,
    message: 'File record and binary content successfully purged.'
  });
});
