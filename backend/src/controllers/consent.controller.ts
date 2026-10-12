import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const consentFields = [
  'researchAllowed',
  'clinicalUseAllowed',
  'commercialUseAllowed',
  'dataSharingAllowed',
] as const;

const validateConsentBody = (body: unknown): body is Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;

  const data = body as Record<string, unknown>;
  const allowed = new Set([...consentFields, 'donorId', 'sampleId']);

  return (
    Object.keys(data).every((key) => allowed.has(key)) &&
    consentFields.every(
      (key) => data[key] === undefined || typeof data[key] === 'boolean'
    )
  );
};

// Get the active consent for a sample
export const getSampleConsent = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId } = req.params;
    if (!sampleId) return res.status(400).json({ error: 'Sample ID is required' });

    const consent = await prisma.consent.findFirst({
      where: { sampleId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    if (!consent) {
      return res.status(404).json({ error: 'No active consent found for this sample' });
    }

    return res.json(consent);
  } catch {
    return res.status(500).json({ error: 'Unable to retrieve consent' });
  }
};

// Get all consents for a donor
export const getDonorConsents = async (req: AuthRequest, res: Response) => {
  try {
    const { donorId } = req.params;
    if (!donorId) return res.status(400).json({ error: 'Donor ID is required' });

    const consents = await prisma.consent.findMany({
      where: { donorId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    return res.json(consents);
  } catch {
    return res.status(500).json({ error: 'Unable to retrieve donor consents' });
  }
};

// Create initial consent
export const createConsent = async (req: AuthRequest, res: Response) => {
  try {
    if (!validateConsentBody(req.body)) {
      return res.status(400).json({ error: 'Invalid consent request body' });
    }

    const { donorId, sampleId } = req.body;
    if (typeof donorId !== 'string' || !donorId || typeof sampleId !== 'string' || !sampleId) {
      return res.status(400).json({ error: 'Valid donorId and sampleId are required' });
    }

    const sample = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { donorId: true },
    });

    if (!sample) return res.status(404).json({ error: 'Sample not found' });
    if (sample.donorId !== donorId) {
      return res.status(400).json({ error: 'Sample does not belong to the specified donor' });
    }

    // A sample's initial consent is created during sample registration.
    const existing = await prisma.consent.findFirst({
      where: { sampleId, status: 'ACTIVE' },
    });

    if (existing) {
      return res.status(409).json({
        error: 'An active consent already exists for this sample; update it instead',
      });
    }

    const consent = await prisma.consent.create({
      data: {
        donorId,
        sampleId,
        researchAllowed: (req.body.researchAllowed as boolean | undefined) ?? true,
        clinicalUseAllowed: (req.body.clinicalUseAllowed as boolean | undefined) ?? true,
        commercialUseAllowed: (req.body.commercialUseAllowed as boolean | undefined) ?? false,
        dataSharingAllowed: (req.body.dataSharingAllowed as boolean | undefined) ?? false,
        status: 'ACTIVE',
        version: 1,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user?.id || 'system',
        action: 'CONSENT_CREATED',
        entityType: 'Consent',
        entityId: consent.id,
      },
    });

    return res.status(201).json({ message: 'Consent created successfully', consent });
  } catch {
    return res.status(500).json({ error: 'Unable to create consent' });
  }
};

// Update consent by revoking the old version and creating a new version
export const updateConsent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Consent ID is required' });

    if (!validateConsentBody(req.body)) {
      return res.status(400).json({ error: 'Invalid consent request body' });
    }

    const hasUpdate = consentFields.some(
      (key) => req.body[key] !== undefined
    );

    if (!hasUpdate) {
      return res.status(400).json({ error: 'Provide at least one consent field to update' });
    }

    const current = await prisma.consent.findUnique({ where: { id } });
    if (!current || current.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'Active consent record not found' });
    }

    const updatedConsent = await prisma.$transaction(async (tx) => {
      const revoked = await tx.consent.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });

      if (revoked.count !== 1) {
        throw new Error('CONSENT_CONCURRENT_UPDATE');
      }

      const next = await tx.consent.create({
        data: {
          donorId: current.donorId,
          sampleId: current.sampleId,
          researchAllowed: (req.body.researchAllowed as boolean | undefined) ?? current.researchAllowed,
          clinicalUseAllowed: (req.body.clinicalUseAllowed as boolean | undefined) ?? current.clinicalUseAllowed,
          commercialUseAllowed: (req.body.commercialUseAllowed as boolean | undefined) ?? current.commercialUseAllowed,
          dataSharingAllowed: (req.body.dataSharingAllowed as boolean | undefined) ?? current.dataSharingAllowed,
          status: 'ACTIVE',
          version: current.version + 1,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          action: 'CONSENT_UPDATED',
          entityType: 'Consent',
          entityId: next.id,
          metadata: { previousVersion: current.version, newVersion: next.version },
        },
      });

      return next;
    });

    return res.json({ message: 'Consent successfully updated', updatedConsent });
  } catch (error: any) {
    if (error?.message === 'CONSENT_CONCURRENT_UPDATE') {
      return res.status(409).json({ error: 'Consent changed concurrently; reload and retry' });
    }
    return res.status(500).json({ error: 'Unable to update consent' });
  }
};

// Explicitly revoke consent
export const revokeConsent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Consent ID is required' });

    const revokedConsent = await prisma.$transaction(async (tx) => {
      const result = await tx.consent.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });

      if (result.count !== 1) return null;

      await tx.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          action: 'CONSENT_REVOKED',
          entityType: 'Consent',
          entityId: id,
        },
      });

      return tx.consent.findUnique({ where: { id } });
    });

    if (!revokedConsent) {
      return res.status(404).json({ error: 'Active consent record not found' });
    }

    return res.json({ message: 'Consent successfully revoked', revokedConsent });
  } catch {
    return res.status(500).json({ error: 'Unable to revoke consent' });
  }
};

// Get consent history for a sample
export const getConsentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId } = req.params;
    if (!sampleId) return res.status(400).json({ error: 'Sample ID is required' });

    const history = await prisma.consent.findMany({
      where: { sampleId },
      orderBy: { version: 'desc' },
    });

    return res.json(history);
  } catch {
    return res.status(500).json({ error: 'Unable to retrieve consent history' });
  }
};