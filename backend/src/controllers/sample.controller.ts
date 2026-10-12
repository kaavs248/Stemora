import { Response } from 'express';
import { SampleType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';

// Create a new sample (Admin only)
export const createSample = async (req: AuthRequest, res: Response) => {
  try {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    if (Object.keys(body).some((key) => !['donorId', 'sampleType', 'storageLocation'].includes(key))) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }
    const { donorId, sampleType, storageLocation } = body as Record<string, unknown>;
    if (typeof donorId !== 'string' || donorId.trim().length === 0) {
      return res.status(400).json({ error: 'A valid donor ID is required' });
    }
    if (typeof sampleType !== 'string' || !Object.values(SampleType).includes(sampleType as SampleType)) {
      return res.status(400).json({ error: 'A valid sample type is required' });
    }
    if (typeof storageLocation !== 'string' || storageLocation.trim().length === 0 || storageLocation.trim().length > 255) {
      return res.status(400).json({ error: 'Storage location must be a non-empty string of at most 255 characters' });
    }

    // Generate a unique pseudonymous sample code
    const sampleCode = `SC-${new Date().getFullYear()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const sample = await prisma.$transaction(async (tx) => {
      const donor = await tx.donor.findUnique({ where: { id: donorId } });
      if (!donor) {
        return null;
      }
      const newSample = await tx.sample.create({
        data: {
          sampleCode,
          donorId: donorId.trim(),
          sampleType: sampleType as SampleType,
          storageLocation: storageLocation.trim(),
          currentStatus: 'COLLECTED',
        },
      });

      // Record initial collection lifecycle event
      await tx.lifecycleEvent.create({
        data: {
          sampleId: newSample.id,
          fromStatus: 'COLLECTED',
          toStatus: 'COLLECTED',
          performedBy: req.user?.id || 'system',
          reason: 'Initial sample collection and registration',
        },
      });

      // Create an initial active consent record for the sample
      await tx.consent.create({
        data: {
          donorId: donorId.trim(),
          sampleId: newSample.id,
          researchAllowed: true,
          clinicalUseAllowed: true,
          commercialUseAllowed: false,
          dataSharingAllowed: false,
          status: 'ACTIVE',
          version: 1,
        },
      });

      return newSample;
    });

    if (!sample) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    return res.status(201).json({
      message: 'Sample registered successfully',
      sample,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to register sample' });
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
