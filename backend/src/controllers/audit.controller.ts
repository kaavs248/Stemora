import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';

// Get all audit logs (Admin only)
export const getAllAuditLogs = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { entityType, actorId } = req.query;

    const whereClause: any = {};

    if (entityType) {
      whereClause.entityType = String(entityType);
    }

    if (actorId) {
      whereClause.actorId = String(actorId);
    }

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
    });

    return res.json(logs);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
};

// Get a single audit log by ID
export const getAuditLogById = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Audit log ID is required',
      });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id },
    });

    if (!log) {
      return res.status(404).json({
        error: 'Audit log entry not found',
      });
    }

    return res.json(log);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
};