import { Response } from 'express';
import { VerificationStatus } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';


export const getAllResearchers = async (req: AuthRequest, res: Response) => {
  try {
    const researchers = await prisma.researcher.findMany({
      include: {
        user: {
          select: {
            email: true,
          },
        },
        organization: true,
      },
    });

    return res.json(researchers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateVerificationStatus = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ error: 'A valid researcher ID is required' });
    }
    const body: unknown = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(body, 'verificationStatus')
    ) {
      return res.status(400).json({ error: 'Provide only a verificationStatus field' });
    }
    const { verificationStatus } = body as { verificationStatus?: unknown };
    if (
      typeof verificationStatus !== 'string' ||
      !Object.values(VerificationStatus).includes(verificationStatus as VerificationStatus)
    ) {
      return res.status(400).json({ error: 'A valid verification status is required' });
    }

    const current = await prisma.researcher.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Researcher not found' });
    }
    const update = await prisma.researcher.updateMany({
      where: { id, verificationStatus: current.verificationStatus },
      data: { verificationStatus: verificationStatus as VerificationStatus },
    });
    if (update.count !== 1) {
      return res.status(409).json({
        error: 'Researcher verification status changed during this update; reload and retry',
      });
    }
    const updated = await prisma.researcher.findUniqueOrThrow({ where: { id } });

    return res.json({
      message: 'Researcher status updated',
      updated,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to update researcher verification status' });
  }
};
