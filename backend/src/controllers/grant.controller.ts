import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';

// Get access grants for the logged-in researcher or admin
export const getAccessGrants = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { role, id: userId } = req.user || {};

    let grants;

    if (role === 'ADMIN') {
      grants = await prisma.accessGrant.findMany({
        include: {
            researcher: {
                include: {
                    organization: true,
                },
            },
            accessRequest: true,
        },
      });
    } else if (role === 'RESEARCHER') {
      const researcher = await prisma.researcher.findUnique({
        where: { userId },
      });

      if (!researcher) {
        return res.status(404).json({
          error: 'Researcher profile not found',
        });
      }

      grants = await prisma.accessGrant.findMany({
        where: {
          researcherId: researcher.id,
        },
        include: {
          accessRequest: true,
        },
      });
    } else {
      return res.status(403).json({
        error: 'Unauthorized',
      });
    }

    return res.json(grants);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
};

// Revoke an active access grant (Admin only)
export const revokeAccessGrant = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ error: 'A valid access grant ID is required' });
    }

    const grant = await prisma.accessGrant.findUnique({
      where: { id },
    });

    if (!grant) {
      return res.status(404).json({
        error: 'Access grant not found',
      });
    }

    if (grant.revokedAt) {
      return res.status(409).json({ error: 'Access grant is already revoked' });
    }

    const updatedGrant = await prisma.$transaction(async (tx) => {
      const revoke = await tx.accessGrant.updateMany({
        where: { id, revokedAt: null },
        data: {
          revokedAt: new Date(),
        },
      });
      if (revoke.count !== 1) {
        return null;
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          action: 'ACCESS_GRANT_REVOKED',
          entityType: 'AccessGrant',
          entityId: id,
        },
      });

      return tx.accessGrant.findUniqueOrThrow({ where: { id } });
    });

    if (!updatedGrant) {
      return res.status(409).json({
        error: 'Access grant changed while revocation was being processed; reload and retry',
      });
    }

    return res.json({
      message: 'Access grant successfully revoked',
      updatedGrant,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
};
