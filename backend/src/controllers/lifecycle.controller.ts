import { Response } from 'express';
import { SampleStatus } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { isValidTransition } from '../utils/stateMachine';
import prisma from '../config/prisma';
import { blockchainService } from '../services/blockchain.service';

const isSampleStatus = (value: unknown): value is SampleStatus =>
  typeof value === 'string' &&
  Object.values(SampleStatus).includes(value as SampleStatus);

const ON_CHAIN_STATUS: Partial<Record<SampleStatus, number>> = {
  COLLECTED: 0,
  PROCESSING: 1,
  TESTING: 2,
  STORED: 3,
  TRANSFERRED: 4,
  RELEASED: 5,
  DESTROYED: 6,
};
// Advance sample status (State Machine Transition API)


export const transitionSampleStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId } = req.params;

    if (typeof sampleId !== 'string' || !sampleId.trim()) {
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

    if (
      reason !== undefined &&
      (typeof reason !== 'string' || !reason.trim() || reason.length > 500)
    ) {
      return res.status(400).json({
        error: 'Reason must be a non-empty string of at most 500 characters',
      });
    }

    const sample = await prisma.sample.findUnique({
      where: { id: sampleId },
    });

    if (!sample) {
      return res.status(404).json({ error: 'Sample not found' });
    }

    const currentStatus = sample.currentStatus;

    if (!isValidTransition(currentStatus, toStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from ${currentStatus} to ${toStatus}`,
      });
    }

    const onChainStatus = ON_CHAIN_STATUS[toStatus];

    if (onChainStatus === undefined) {
      return res.status(400).json({
        error: `Status ${toStatus} is not supported on the blockchain`,
      });
    }

    // Check that the database and blockchain agree before changing either.
    const onChainSample = await blockchainService.getSample(sample.sampleCode);

    if (!onChainSample) {
      return res.status(409).json({
        error: 'Sample is missing on-chain; reconciliation is required',
      });
    }

    if (onChainSample.status !== currentStatus) {
      return res.status(409).json({
        error: 'Database and blockchain statuses differ; reconciliation is required',
        databaseStatus: currentStatus,
        blockchainStatus: onChainSample.status,
      });
    }

    // Submit the blockchain transaction before persisting its result in PostgreSQL.
    const blockchain = await blockchainService.recordLifecycleEvent(
      sample.sampleCode,
      onChainStatus,
    );

    try {
      const result = await prisma.$transaction(async (tx) => {
        const update = await tx.sample.updateMany({
          where: { id: sampleId, currentStatus },
          data: { currentStatus: toStatus },
        });

        if (update.count !== 1) {
          throw new Error('SAMPLE_STATUS_CONFLICT');
        }

        const lifecycleEvent = await tx.lifecycleEvent.create({
          data: {
            sampleId,
            fromStatus: currentStatus,
            toStatus,
            performedBy: req.user?.id || 'system',
            reason:
              typeof reason === 'string'
                ? reason.trim()
                : `Status changed from ${currentStatus} to ${toStatus}`,
            blockchainTxHash: blockchain.transactionHash,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user?.id || 'system',
            action: 'SAMPLE_STATUS_UPDATED',
            entityType: 'Sample',
            entityId: sampleId,
            blockchainTxHash: blockchain.transactionHash,
            metadata: {
              fromStatus: currentStatus,
              toStatus,
              blockNumber: blockchain.blockNumber,
            },
          },
        });

        const updatedSample = await tx.sample.findUniqueOrThrow({
          where: { id: sampleId },
        });

        return { updatedSample, lifecycleEvent };
      });

      return res.json({
        message: 'Sample status updated in the database and blockchain',
        sample: result.updatedSample,
        event: result.lifecycleEvent,
        blockchain,
      });
    } catch (dbError) {
      // The blockchain transaction is already mined and cannot be rolled back.
      console.error('Database persistence failed after blockchain transaction', {
        sampleId,
        transactionHash: blockchain.transactionHash,
        error: dbError,
      });

      if (
  dbError instanceof Error &&
  dbError.message === 'SAMPLE_STATUS_CONFLICT'
) {
  return res.status(409).json({
    error: 'Concurrent update detected; reconciliation is required',
    reconciliationRequired: true,
    transactionHash: blockchain.transactionHash,
  });
}

if (
  dbError instanceof Error &&
  dbError.message === 'SAMPLE_STATUS_CONFLICT'
) {
  return res.status(409).json({
    error: 'Concurrent update detected; reconciliation is required',
    reconciliationRequired: true,
    transactionHash: blockchain.transactionHash,
  });
}

return res.status(500).json({
  error: 'Blockchain update succeeded, but database persistence failed',
  reconciliationRequired: true,
  transactionHash: blockchain.transactionHash,
});
    }
  } catch (error: any) {
    if (error?.code === 'P2034' || error?.message === 'SAMPLE_STATUS_CONFLICT') {
      return res.status(409).json({
        error: 'Concurrent update detected; reconciliation may be required',
      });
    }

    console.error('Lifecycle transition failed:', error);

    return res.status(500).json({
      error: 'Unable to complete lifecycle transition',
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
