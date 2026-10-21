
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { blockchainService } from '../services/blockchain.service';

const CONSENT_VALIDITY_SECONDS = 365 * 24 * 60 * 60;
const CONSORTIUM_ORGANIZATION = 'STEMORA_CONSORTIUM';

const consentFields = [
  'researchAllowed',
  'clinicalUseAllowed',
  'commercialUseAllowed',
  'dataSharingAllowed',
] as const;

type ConsentPermissions = {
  researchAllowed: boolean;
  clinicalUseAllowed: boolean;
  commercialUseAllowed: boolean;
  dataSharingAllowed: boolean;
};

const validateConsentBody = (
  body: unknown,
): body is Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const data = body as Record<string, unknown>;
  const allowed = new Set<string>([
    ...consentFields,
    'donorId',
    'sampleId',
  ]);

  return (
    Object.keys(data).every((key) => allowed.has(key)) &&
    consentFields.every(
      (key) => data[key] === undefined || typeof data[key] === 'boolean',
    )
  );
};

const getPermissions = (body: Record<string, unknown>): ConsentPermissions => ({
  researchAllowed: body.researchAllowed === true,
  clinicalUseAllowed: body.clinicalUseAllowed === true,
  commercialUseAllowed: body.commercialUseAllowed === true,
  dataSharingAllowed: body.dataSharingAllowed === true,
});

const isDonor = (req: AuthRequest): boolean =>
  req.user?.role === 'DONOR';

const getDonorForRequest = async (req: AuthRequest) => {
  if (!req.user) return null;

  return prisma.donor.findUnique({
    where: { userId: req.user.id },
    select: { id: true, donorCode: true },
  });
};

const createBlockchainConsent = async (input: {
  consentId: string;
  sampleCode: string;
  donorCode: string;
  permissions: ConsentPermissions;
}) => {
  const validFrom = Math.floor(Date.now() / 1000);

  return blockchainService.createConsent({
    consentId: input.consentId,
    sampleId: input.sampleCode,
    donorReference: input.donorCode,
    organization: CONSORTIUM_ORGANIZATION,
    purpose: 'RESEARCH',
    usageType: 'CONSORTIUM_WIDE',
    validFrom,
    validUntil: validFrom + CONSENT_VALIDITY_SECONDS,
    restrictions: JSON.stringify(input.permissions),
  });
};

const markConsentForReconciliation = async (
  consentId: string,
  actorId: string,
  action: string,
) => {
  await prisma.$transaction(async (tx) => {
    await tx.consent.update({
      where: { id: consentId },
      data: { blockchainSyncStatus: 'RECONCILIATION_REQUIRED' },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'Consent',
        entityId: consentId,
        metadata: {
          blockchainSyncStatus: 'RECONCILIATION_REQUIRED',
        },
      },
    });
  });
};

// Get the active consent for a sample.
export const getSampleConsent = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { sampleId } = req.params;

    if (!sampleId) {
      return res.status(400).json({ error: 'Sample ID is required' });
    }

    const consent = await prisma.consent.findFirst({
      where: { sampleId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    if (!consent) {
      return res.status(404).json({
        error: 'No active consent found for this sample',
      });
    }

    return res.json(consent);
  } catch (error) {
    console.error('Unable to retrieve sample consent', error);
    return res.status(500).json({
      error: 'Unable to retrieve consent',
    });
  }
};

// Get all consent versions for a donor.
// Donors may retrieve only their own records.
export const getDonorConsents = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { donorId } = req.params;

    if (!donorId) {
      return res.status(400).json({ error: 'Donor ID is required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (isDonor(req)) {
      const donor = await getDonorForRequest(req);

      if (!donor || donor.id !== donorId) {
        return res.status(403).json({
          error: 'You may only view your own consent records',
        });
      }
    }

    const consents = await prisma.consent.findMany({
      where: { donorId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    return res.json(consents);
  } catch (error) {
    console.error('Unable to retrieve donor consents', error);
    return res.status(500).json({
      error: 'Unable to retrieve donor consents',
    });
  }
};

// Create initial consent and synchronize it with the blockchain.
export const createConsent = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isDonor(req)) {
      return res.status(403).json({
        error: 'Only donors can create consent',
      });
    }

    if (!validateConsentBody(req.body)) {
      return res.status(400).json({
        error: 'Invalid consent request body',
      });
    }

    const { donorId, sampleId } = req.body;

    if (
      typeof donorId !== 'string' ||
      !donorId ||
      typeof sampleId !== 'string' ||
      !sampleId
    ) {
      return res.status(400).json({
        error: 'Valid donorId and sampleId are required',
      });
    }

    const donor = await getDonorForRequest(req);

    if (!donor || donor.id !== donorId) {
      return res.status(404).json({
        error: 'Donor profile not found',
      });
    }

    const sample = await prisma.sample.findFirst({
      where: { id: sampleId, donorId: donor.id },
      select: { id: true, sampleCode: true },
    });

    if (!sample) {
      return res.status(404).json({
        error: 'Sample not found or not owned by this donor',
      });
    }

    const existingConsent = await prisma.consent.findFirst({
      where: { sampleId: sample.id, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    if (existingConsent) {
      return res.status(409).json({
        error: 'An active consent already exists; update it instead',
      });
    }

    const permissions = getPermissions(req.body);

    const consent = await prisma.$transaction(async (tx) => {
      const latest = await tx.consent.findFirst({
        where: { sampleId: sample.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const created = await tx.consent.create({
        data: {
          donorId: donor.id,
          sampleId: sample.id,
          ...permissions,
          status: 'ACTIVE',
          version: (latest?.version ?? 0) + 1,
          blockchainSyncStatus: 'PENDING',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'CONSENT_CREATED',
          entityType: 'Consent',
          entityId: created.id,
          metadata: {
            blockchainSyncStatus: 'PENDING',
            permissions,
          },
        },
      });

      return created;
    });

    try {
      const transaction = await createBlockchainConsent({
        consentId: consent.id,
        sampleCode: sample.sampleCode,
        donorCode: donor.donorCode,
        permissions,
      });

      const syncedConsent = await prisma.$transaction(async (tx) => {
        const updated = await tx.consent.update({
          where: { id: consent.id },
          data: {
            blockchainTxHash: transaction.transactionHash,
            blockchainSyncStatus: 'SYNCED',
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: 'CONSENT_BLOCKCHAIN_SYNCED',
            entityType: 'Consent',
            entityId: consent.id,
            blockchainTxHash: transaction.transactionHash,
            metadata: {
              blockNumber: transaction.blockNumber,
            },
          },
        });

        return updated;
      });

      return res.status(201).json({
        message: 'Consent created and synchronized with the blockchain',
        consent: syncedConsent,
        blockchain: transaction,
      });
    } catch (error) {
      console.error('Consent synchronization requires reconciliation', {
        consentId: consent.id,
        error,
      });

      try {
        await markConsentForReconciliation(
          consent.id,
          req.user.id,
          'CONSENT_BLOCKCHAIN_SYNC_FAILED',
        );
      } catch (databaseError) {
        console.error(
          'CRITICAL: could not persist reconciliation status',
          { consentId: consent.id, databaseError },
        );
      }

      return res.status(202).json({
        message:
          'Consent was recorded, but blockchain synchronization requires reconciliation. Do not treat it as verified.',
        consentId: consent.id,
        reconciliationRequired: true,
      });
    }
  } catch (error) {
    console.error('Unable to create consent', error);
    return res.status(500).json({
      error: 'Unable to create consent',
    });
  }
};

// Update consent by creating a new version.
// The old on-chain consent is revoked before the new version is synchronized.
export const updateConsent = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isDonor(req)) {
      return res.status(403).json({
        error: 'Only donors can update consent',
      });
    }

    if (!validateConsentBody(req.body)) {
      return res.status(400).json({
        error: 'Invalid consent request body',
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Consent ID is required' });
    }

    const donor = await getDonorForRequest(req);

    if (!donor) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    const current = await prisma.consent.findFirst({
      where: {
        id,
        donorId: donor.id,
        status: 'ACTIVE',
      },
      include: {
        sample: {
          select: { id: true, sampleCode: true },
        },
      },
    });

    if (!current) {
      return res.status(404).json({
        error: 'Active consent record not found',
      });
    }

    if (current.blockchainSyncStatus !== 'SYNCED') {
      return res.status(409).json({
        error:
          'The current consent is not synchronized. Reconciliation is required before updating it.',
      });
    }

    const permissions = getPermissions(req.body);

    // Create the next version as PENDING. It is not usable until synced.
    const nextConsent = await prisma.$transaction(async (tx) => {
      const latest = await tx.consent.findFirst({
        where: { sampleId: current.sampleId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const created = await tx.consent.create({
        data: {
          donorId: donor.id,
          sampleId: current.sampleId,
          ...permissions,
          status: 'ACTIVE',
          version: (latest?.version ?? current.version) + 1,
          blockchainSyncStatus: 'PENDING',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'CONSENT_VERSION_CREATED',
          entityType: 'Consent',
          entityId: created.id,
          metadata: {
            previousConsentId: current.id,
            blockchainSyncStatus: 'PENDING',
            permissions,
          },
        },
      });

      return created;
    });

    try {
      const revokeTransaction =
        await blockchainService.revokeConsent(current.id);

      await prisma.$transaction(async (tx) => {
        await tx.consent.update({
          where: { id: current.id },
          data: {
            status: 'REVOKED',
            blockchainRevocationTxHash:
              revokeTransaction.transactionHash,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: 'CONSENT_REVOKED_FOR_UPDATE',
            entityType: 'Consent',
            entityId: current.id,
            blockchainTxHash: revokeTransaction.transactionHash,
            metadata: {
              replacementConsentId: nextConsent.id,
              blockNumber: revokeTransaction.blockNumber,
            },
          },
        });
      });

      const createTransaction = await createBlockchainConsent({
        consentId: nextConsent.id,
        sampleCode: current.sample.sampleCode,
        donorCode: donor.donorCode,
        permissions,
      });

      const syncedConsent = await prisma.$transaction(async (tx) => {
        const updated = await tx.consent.update({
          where: { id: nextConsent.id },
          data: {
            blockchainTxHash: createTransaction.transactionHash,
            blockchainSyncStatus: 'SYNCED',
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: 'CONSENT_BLOCKCHAIN_SYNCED',
            entityType: 'Consent',
            entityId: nextConsent.id,
            blockchainTxHash: createTransaction.transactionHash,
            metadata: {
              blockNumber: createTransaction.blockNumber,
              previousConsentId: current.id,
            },
          },
        });

        return updated;
      });

      return res.json({
        message: 'Consent updated and synchronized with the blockchain',
        previousConsentId: current.id,
        consent: syncedConsent,
        blockchain: createTransaction,
        revocation: revokeTransaction,
      });
    } catch (error) {
      console.error('Consent update requires reconciliation', {
        previousConsentId: current.id,
        nextConsentId: nextConsent.id,
        error,
      });

      // Fail closed: neither version should be considered verified until
      // an administrator reconciles the actual chain state.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.consent.updateMany({
            where: {
              id: { in: [current.id, nextConsent.id] },
            },
            data: {
              blockchainSyncStatus: 'RECONCILIATION_REQUIRED',
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: req.user!.id,
              action: 'CONSENT_UPDATE_RECONCILIATION_REQUIRED',
              entityType: 'Consent',
              entityId: nextConsent.id,
              metadata: {
                previousConsentId: current.id,
              },
            },
          });
        });
      } catch (databaseError) {
        console.error(
          'CRITICAL: could not persist consent update reconciliation status',
          { previousConsentId: current.id, nextConsentId: nextConsent.id, databaseError },
        );
      }

      return res.status(202).json({
        message:
          'Consent update is incomplete or uncertain. Administrative blockchain reconciliation is required.',
        previousConsentId: current.id,
        consentId: nextConsent.id,
        reconciliationRequired: true,
      });
    }
  } catch (error) {
    console.error('Unable to update consent', error);
    return res.status(500).json({
      error: 'Unable to update consent',
    });
  }
};

// Explicitly revoke consent on-chain before updating the database.
export const revokeConsent = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isDonor(req)) {
      return res.status(403).json({
        error: 'Only donors can revoke consent',
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Consent ID is required' });
    }

    const donor = await getDonorForRequest(req);

    if (!donor) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    const consent = await prisma.consent.findFirst({
      where: {
        id,
        donorId: donor.id,
        status: 'ACTIVE',
      },
    });

    if (!consent) {
      return res.status(404).json({
        error: 'Active consent record not found',
      });
    }

    if (consent.blockchainSyncStatus !== 'SYNCED') {
      return res.status(409).json({
        error:
          'Consent is not synchronized. Reconciliation is required before revocation can be confirmed.',
      });
    }

    let transaction: {
  transactionHash: string;
  blockNumber: number | undefined;
};

    try {
      transaction = await blockchainService.revokeConsent(consent.id);
    } catch (error) {
      console.error('Blockchain consent revocation failed', {
        consentId: consent.id,
        error,
      });

      return res.status(502).json({
        error:
          'Blockchain revocation could not be confirmed. The consent was not marked revoked in the database.',
      });
    }

    try {
      const revokedConsent = await prisma.$transaction(async (tx) => {
        const result = await tx.consent.updateMany({
          where: { id: consent.id, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            blockchainRevocationTxHash: transaction.transactionHash,
          },
        });

        if (result.count !== 1) {
          throw new Error(
            'Consent database state changed during blockchain revocation',
          );
        }

        const updated = await tx.consent.findUniqueOrThrow({
          where: { id: consent.id },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            action: 'CONSENT_REVOKED',
            entityType: 'Consent',
            entityId: consent.id,
            blockchainTxHash: transaction.transactionHash,
            metadata: {
              blockNumber: transaction.blockNumber,
            },
          },
        });

        return updated;
      });

      return res.json({
        message: 'Consent revoked on the blockchain and in the database',
        consent: revokedConsent,
        blockchain: transaction,
      });
    } catch (databaseError) {
      console.error(
        'Blockchain revocation succeeded but database update failed',
        { consentId: consent.id, databaseError },
      );

      try {
        await markConsentForReconciliation(
          consent.id,
          req.user.id,
          'CONSENT_REVOCATION_RECONCILIATION_REQUIRED',
        );
      } catch (reconciliationError) {
        console.error(
          'CRITICAL: failed to mark revocation for reconciliation',
          { consentId: consent.id, reconciliationError },
        );
      }

      return res.status(202).json({
        message:
          'Blockchain revocation was submitted, but the database could not confirm it. Administrative reconciliation is required.',
        consentId: consent.id,
        blockchain: transaction,
        reconciliationRequired: true,
      });
    }
  } catch (error) {
    console.error('Unable to revoke consent', error);
    return res.status(500).json({
      error: 'Unable to revoke consent',
    });
  }
};

// Get the complete consent history for a sample.
// Donors may view history only for samples they own.
export const getConsentHistory = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { sampleId } = req.params;

    if (!sampleId) {
      return res.status(400).json({ error: 'Sample ID is required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (isDonor(req)) {
      const donor = await getDonorForRequest(req);

      const sample = donor
        ? await prisma.sample.findFirst({
            where: { id: sampleId, donorId: donor.id },
            select: { id: true },
          })
        : null;

      if (!sample) {
        return res.status(403).json({
          error: 'You may only view consent history for your own samples',
        });
      }
    }

    const history = await prisma.consent.findMany({
      where: { sampleId },
      orderBy: { version: 'desc' },
    });

    return res.json(history);
  } catch (error) {
    console.error('Unable to retrieve consent history', error);
    return res.status(500).json({
      error: 'Unable to retrieve consent history',
    });
  }
};
