import { Response } from 'express';
import { SampleStatus } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { isValidTransition } from '../utils/stateMachine';
import prisma from '../config/prisma';

const isSampleStatus = (value: unknown): value is SampleStatus =>
  typeof value === 'string' &&
  Object.values(SampleStatus).includes(value as SampleStatus);

// Advance sample status (State Machine Transition API)
export const transitionSampleStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId } = req.params;

    if (typeof sampleId !== 'string' || sampleId.trim().length === 0) {
      return res.status(400).json({ error: 'A valid sample ID is required' });
    }

    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    if (Object.keys(body).some((key) => key !== 'toStatus' && key !== 'reason')) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }

    const { toStatus, reason } = body as {
      toStatus?: unknown;
      reason?: unknown;
    };
    if (!isSampleStatus(toStatus)) {
      return res.status(400).json({ error: 'A valid toStatus is required' });
    }
    if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 500)) {
      return res.status(400).json({ error: 'Reason must be a non-empty string of at most 500 characters' });
    }

    const sample = await prisma.sample.findUnique({
      where: { id: sampleId },
    });

    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    const currentStatus = sample.currentStatus;

    // 2. Validate state transition using the state machine rules
    if (!isValidTransition(currentStatus, toStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from ${currentStatus} to ${toStatus}`,
      });
    }

    // 3. Perform atomic update: update sample status, add lifecycle event, and log audit
    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.sample.updateMany({
        where: { id: sampleId, currentStatus },
        data: { currentStatus: toStatus },
      });

      if (update.count !== 1) {
        return null;
      }

      const updatedSample = await tx.sample.findUniqueOrThrow({
        where: { id: sampleId },
      });
      const lifecycleEvent = await tx.lifecycleEvent.create({
        data: {
          sampleId,
          fromStatus: currentStatus,
          toStatus,
          performedBy: req.user?.id || 'system',
          reason: typeof reason === 'string'
            ? reason.trim()
            : `Status changed from ${currentStatus} to ${toStatus}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          action: 'SAMPLE_STATUS_UPDATED',
          entityType: 'Sample',
          entityId: sampleId,
          metadata: { fromStatus: currentStatus, toStatus },
        },
      });

      return { updatedSample, lifecycleEvent };
    });

    if (!result) {
      return res.status(409).json({
        error: 'Sample status changed while this transition was being processed; reload and retry',
      });
    }

    return res.json({
      message: 'Sample status updated successfully',
      sample: result.updatedSample,
      event: result.lifecycleEvent,
    });
  } catch (error: any) {
    if (error?.code === 'P2034') {
      return res.status(409).json({
        error: 'Concurrent update detected; reload the sample and retry',
      });
    }

    return res.status(500).json({
      error: 'Unable to update sample status',
    });
  }
};

// Get complete lifecycle history for a sample
export const getSampleLifecycleHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId } = req.params;

    if (typeof sampleId !== 'string' || sampleId.trim().length === 0) {
      return res.status(400).json({ error: 'A valid sample ID is required' });
    }

    const events = await prisma.lifecycleEvent.findMany({
      where: { sampleId },
      orderBy: { timestamp: 'asc' },
    });

    return res.json(events);
  } catch (error: any) {
    return res.status(500).json({ error: 'Unable to retrieve sample lifecycle history' });
  }
};
