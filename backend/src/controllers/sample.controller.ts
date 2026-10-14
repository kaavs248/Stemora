import { Response } from 'express';
import { SampleType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';
import { blockchainService } from '../services/blockchain.service';
import crypto from 'node:crypto';
// Create a new sample (Admin only)

// Create a new sample (Admin only)
export const createSample = async (req: AuthRequest, res: Response) => {
  try {
    const body: unknown = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }

    if (
      Object.keys(body).some(
        (key) => !['donorId', 'sampleType', 'storageLocation'].includes(key),
      )
    ) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }

    const { donorId, sampleType, storageLocation } = body as Record<string, unknown>;

    if (typeof donorId !== 'string' || donorId.trim().length === 0) {
      return res.status(400).json({ error: 'A valid donor ID is required' });
    }

    if (
      typeof sampleType !== 'string' ||
      !Object.values(SampleType).includes(sampleType as SampleType)
    ) {
      return res.status(400).json({ error: 'A valid sample type is required' });
    }

    if (
      typeof storageLocation !== 'string' ||
      storageLocation.trim().length === 0 ||
      storageLocation.trim().length > 255
    ) {
      return res.status(400).json({
        error: 'Storage location must be a non-empty string of at most 255 characters',
      });
    }

    // Verify the donor before creating the sample.
    const donor = await prisma.donor.findUnique({
      where: { id: donorId.trim() },
      select: { id: true, donorCode: true },
    });

    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    // Generate a pseudonymous sample code and retry on collision.
    // The database unique constraint remains the final safeguard.
    let sampleCode = '';
    let sampleCreated = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      sampleCode = `SC-${new Date().getFullYear()}-${crypto.randomUUID()
        .replace(/-/g, '')
        .slice(0, 12)
        .toUpperCase()}`;

      try {
        const sample = await prisma.$transaction(async (tx) => {
          const newSample = await tx.sample.create({
            data: {
              sampleCode,
              donorId: donor.id,
              sampleType: sampleType as SampleType,
              storageLocation: storageLocation.trim(),
              currentStatus: 'COLLECTED',
            },
          });

          await tx.lifecycleEvent.create({
            data: {
              sampleId: newSample.id,
              fromStatus: 'COLLECTED',
              toStatus: 'COLLECTED',
              performedBy: req.user?.id || 'system',
              reason: 'Initial sample collection and registration',
            },
          });

          // Intentionally do not create consent here.
          return newSample;
        });

        // Save the sample after the database transaction commits.
        const result = await blockchainService.registerSample(
          sample.sampleCode,
          donor.donorCode,
          JSON.stringify({
            sampleCode: sample.sampleCode,
            sampleType: sample.sampleType,
            initialStatus: sample.currentStatus,
          }),
        );

        // Attach the confirmed blockchain transaction to the initial event.
        const lifecycleEvent = await prisma.lifecycleEvent.findFirst({
          where: { sampleId: sample.id },
          orderBy: { timestamp: 'asc' },
        });

        if (!lifecycleEvent) {
          console.error(
            `Blockchain registration succeeded for ${sample.sampleCode}, but its initial lifecycle event was not found. Tx: ${result.transactionHash}`,
          );

          return res.status(202).json({
            message:
              'Sample exists in the database and blockchain, but transaction tracking needs reconciliation.',
            sample,
            blockchain: {
              transactionHash: result.transactionHash,
              blockNumber: result.blockNumber,
            },
            reconciliationRequired: true,
          });
        }

        await prisma.lifecycleEvent.update({
          where: { id: lifecycleEvent.id },
          data: { blockchainTxHash: result.transactionHash },
        });

        return res.status(201).json({
          message: 'Sample registered in the database and blockchain',
          sample,
          blockchain: {
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber,
          },
        });
      } catch (error) {
        // Do not retry arbitrary failures: the blockchain may already have
        // accepted the transaction. A duplicate code also needs a fresh ID.
        const message = error instanceof Error ? error.message : String(error);

        if (
          message.toLowerCase().includes('unique constraint') &&
          attempt < 4
        ) {
          continue;
        }

        console.error(
          `Sample registration needs reconciliation for ${sampleCode}:`,
          message,
        );

        return res.status(202).json({
          message:
            'Sample creation may have succeeded in the database, but blockchain registration or transaction tracking failed. Reconciliation is required.',
          sampleCode,
          reconciliationRequired: true,
        });
      }
    }

    return res.status(500).json({
      error: 'Unable to generate a unique sample code',
    });
  } catch (error) {
    console.error('Sample registration failed:', error);

    return res.status(500).json({
      error: 'Unable to register sample',
    });
  }
};


// Get all samples
export const getAllSamples = async (req: AuthRequest, res: Response) => {
  try {
    const samples = await prisma.sample.findMany({
      include: {
        donor: { select: { donorCode: true } },
        lifecycleEvents: true,
        consents: true,
      },
    });

    return res.json(samples);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Get single sample by ID with complete history
export const getSampleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const sample = await prisma.sample.findUnique({
      where: { id },
      include: {
        donor: true,
        lifecycleEvents: {
          orderBy: { timestamp: 'desc' },
        },
        consents: true,
        documents: true,
      },
    });

    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    return res.json(sample);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// Update sample metadata (Admin only)
export const updateSample = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ error: 'A valid sample ID is required' });
    }

    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    if (Object.keys(body).some((key) => !['storageLocation', 'sampleType'].includes(key))) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }
    const { storageLocation, sampleType } = body as Record<string, unknown>;

    if (storageLocation === undefined && sampleType === undefined) {
      return res.status(400).json({
        error: 'Provide storageLocation or sampleType to update',
      });
    }
    if (storageLocation !== undefined && (
      typeof storageLocation !== 'string' ||
      storageLocation.trim().length === 0 ||
      storageLocation.trim().length > 255
    )) {
      return res.status(400).json({ error: 'Storage location must be a non-empty string of at most 255 characters' });
    }
    if (sampleType !== undefined && (
      typeof sampleType !== 'string' ||
      !Object.values(SampleType).includes(sampleType as SampleType)
    )) {
      return res.status(400).json({ error: 'A valid sample type is required' });
    }

    const updatedSample = await prisma.sample.update({
      where: { id },
      data: {
        ...(storageLocation !== undefined && { storageLocation: (storageLocation as string).trim() }),
        ...(sampleType !== undefined && { sampleType: sampleType as SampleType }),
      },
    });

    return res.json({
      message: 'Sample updated successfully',
      updatedSample,
    });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Sample not found',
      });
    }

    return res.status(500).json({
      error: 'Unable to update sample',
    });
  }
};
