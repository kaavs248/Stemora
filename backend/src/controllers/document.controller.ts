import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import crypto from 'crypto';
import prisma from '../config/prisma';

// Upload document metadata and compute file hash
export const uploadDocumentRecord = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    if (Object.keys(body).some((key) => !['sampleId', 'documentType', 'filePath'].includes(key))) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }
    const { sampleId, documentType, filePath } = body as Record<string, unknown>;
    if (typeof sampleId !== 'string' || sampleId.trim().length === 0) {
      return res.status(400).json({ error: 'A valid sample ID is required' });
    }
    if (typeof documentType !== 'string' || documentType.trim().length === 0 || documentType.trim().length > 100) {
      return res.status(400).json({ error: 'Document type must be a non-empty string of at most 100 characters' });
    }
    if (typeof filePath !== 'string' || filePath.trim().length === 0 || filePath.trim().length > 2048) {
      return res.status(400).json({ error: 'File path must be a non-empty string of at most 2048 characters' });
    }
    const userId = req.user?.id || 'system';

    // Verify sample exists
    const sample = await prisma.sample.findUnique({
      where: { id: sampleId.trim() },
    });

    if (!sample) {
      return res.status(404).json({
        error: 'Sample not found',
      });
    }

    // Generate SHA-256 provenance hash
    const fileHash = crypto
      .createHash('sha256')
      .update(filePath.trim())
      .digest('hex');

    const document = await prisma.$transaction(async (tx) => {
      const record = await tx.document.create({
        data: {
          sampleId: sampleId.trim(),
          documentType: documentType.trim(),
          filePath: filePath.trim(),
          fileHash,
          uploadedBy: userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'DOCUMENT_UPLOADED',
          entityType: 'Document',
          entityId: record.id,
          metadata: {
            documentType: documentType.trim(),
            fileHash,
          },
        },
      });
      return record;
    });

    return res.status(201).json({
      message: 'Document registered successfully',
      document,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to register document' });
  }
};

// Get all documents for a specific sample
export const getSampleDocuments = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { sampleId } = req.params;
    if (typeof sampleId !== 'string' || sampleId.trim().length === 0) {
      return res.status(400).json({ error: 'A valid sample ID is required' });
    }

    const documents = await prisma.document.findMany({
      where: { sampleId: sampleId.trim() },
      orderBy: { uploadedAt: 'desc' },
    });

    return res.json(documents);
  } catch {
    return res.status(500).json({ error: 'Unable to retrieve sample documents' });
  }
};
