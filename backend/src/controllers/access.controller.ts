import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { evaluateAccessPolicy } from '../services/policy.service';

export const createAccessRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { sampleId, purpose } = req.body;
    const userId = req.user?.id;

    if (!userId || typeof sampleId !== 'string' || !sampleId.trim() ||
        typeof purpose !== 'string' || !purpose.trim() || purpose.length > 2000) {
      return res.status(400).json({ error: 'Valid sampleId and purpose are required' });
    }

    const researcher = await prisma.researcher.findUnique({ where: { userId } });
    if (!researcher || researcher.verificationStatus !== 'VERIFIED') {
      return res.status(403).json({
        error: 'Only verified researchers can request sample access',
      });
    }

    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    if (!sample) return res.status(404).json({ error: 'Sample not found' });

    const consent = await prisma.consent.findFirst({
      where: { sampleId, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    if (!consent) {
      return res.status(403).json({ error: 'Active donor consent is required' });
    }

    const accessRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.accessRequest.create({
        data: { sampleId, researcherId: researcher.id, purpose: purpose.trim(), status: 'PENDING' },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'ACCESS_REQUEST_CREATED',
          entityType: 'AccessRequest',
          entityId: created.id,
        },
      });

      return created;
    });

    return res.status(201).json({
      message: 'Access request created successfully',
      accessRequest,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to create access request' });
  }
};

export const getAccessRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { role, id: userId } = req.user || {};

    if (role === 'ADMIN') {
      const requests = await prisma.accessRequest.findMany({
        include: {
          sample: true,
          researcher: {
            include: { organization: true, user: { select: { email: true } } },
          },
        },
        orderBy: { reviewedAt: 'desc' },
      });
      return res.json(requests);
    }

    if (role === 'RESEARCHER' && userId) {
      const researcher = await prisma.researcher.findUnique({ where: { userId } });
      if (!researcher) return res.status(404).json({ error: 'Researcher profile not found' });

      const requests = await prisma.accessRequest.findMany({
        where: { researcherId: researcher.id },
        include: { sample: true },
        orderBy: { reviewedAt: 'desc' },
      });
      return res.json(requests);
    }

    return res.status(403).json({ error: 'Insufficient permissions' });
  } catch {
    return res.status(500).json({ error: 'Unable to retrieve access requests' });
  }
};

export const getAccessRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Access request ID is required' });

    const request = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        sample: true,
        researcher: { include: { organization: true, user: { select: { email: true } } } },
      },
    });

    if (!request) return res.status(404).json({ error: 'Access request not found' });

    if (req.user?.role === 'RESEARCHER') {
      const researcher = await prisma.researcher.findUnique({
        where: { userId: req.user.id },
      });
      if (!researcher || researcher.id !== request.researcherId) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    } else if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return res.json(request);
  } catch {
    return res.status(500).json({ error: 'Unable to retrieve access request' });
  }
};

const reviewRequest = async (
  req: AuthRequest,
  res: Response,
  decision: 'APPROVED' | 'REJECTED'
) => {
  try {
    const { id } = req.params;
    const { decisionReason } = req.body ?? {};

    if (!id) return res.status(400).json({ error: 'Access request ID is required' });
    if (decisionReason !== undefined &&
        (typeof decisionReason !== 'string' || decisionReason.length > 1000)) {
      return res.status(400).json({ error: 'decisionReason must be a string of at most 1000 characters' });
    }

    const request = await prisma.accessRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: 'Access request not found' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ error: 'Only pending requests can be reviewed' });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (decision === 'APPROVED') {
        const policy = await evaluateAccessPolicy(
          request.sampleId,
          request.researcherId,
          request.purpose,
          tx
        );

        if (!policy.allowed) {
          return { kind: 'policy-denied' as const, reason: policy.reason };
        }
      }

      const changed = await tx.accessRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: decision,
          reviewedBy: req.user?.id,
          reviewedAt: new Date(),
          decisionReason: typeof decisionReason === 'string' && decisionReason.trim()
            ? decisionReason.trim()
            : decision === 'APPROVED' ? 'Approved by admin' : 'Rejected by admin',
        },
      });

      if (changed.count !== 1) return { kind: 'already-reviewed' as const };

      if (decision === 'APPROVED') {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 3);

        await tx.accessGrant.create({
          data: {
            accessRequestId: id,
            sampleId: request.sampleId,
            researcherId: request.researcherId,
            expiresAt,
            permissions: ['READ_METADATA', 'ANALYZE_SAMPLE'],
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          action: decision === 'APPROVED' ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED',
          entityType: 'AccessRequest',
          entityId: id,
        },
      });

      return {
        kind: 'success' as const,
        accessRequest: await tx.accessRequest.findUnique({ where: { id } }),
      };
    });

    if (result.kind === 'policy-denied') {
      return res.status(403).json({ error: 'Access policy denied', reason: result.reason });
    }

    if (result.kind === 'already-reviewed') {
      return res.status(409).json({ error: 'Request was already reviewed; reload and retry' });
    }

    return res.json({
      message: decision === 'APPROVED' ? 'Access request approved successfully' : 'Access request rejected successfully',
      accessRequest: result.accessRequest,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to review access request' });
  }
};

export const approveAccessRequest = (req: AuthRequest, res: Response) =>
  reviewRequest(req, res, 'APPROVED');

export const rejectAccessRequest = (req: AuthRequest, res: Response) =>
  reviewRequest(req, res, 'REJECTED');

export const reviewAccessRequest = approveAccessRequest;

export const revokeAccessRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Access request ID is required' });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.accessRequest.findUnique({ where: { id } });
      if (!request) return { kind: 'missing' as const };
      if (request.status !== 'APPROVED') return { kind: 'not-approved' as const };

      await tx.accessGrant.updateMany({
        where: { accessRequestId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const updated = await tx.accessRequest.update({
        where: { id },
        data: { status: 'REVOKED' },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user?.id || 'system',
          action: 'ACCESS_REQUEST_REVOKED',
          entityType: 'AccessRequest',
          entityId: id,
        },
      });

      return { kind: 'success' as const, updated };
    });

    if (result.kind === 'missing') {
      return res.status(404).json({ error: 'Access request not found' });
    }
    if (result.kind === 'not-approved') {
      return res.status(409).json({ error: 'Only approved requests can be revoked' });
    }

    return res.json({
      message: 'Access request successfully revoked',
      accessRequest: result.updated,
    });
  } catch {
    return res.status(500).json({ error: 'Unable to revoke access request' });
  }
};
