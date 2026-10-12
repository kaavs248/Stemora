import { Router } from 'express';
import {
  getAllAuditLogs,
  getAuditLogById,
} from '../controllers/audit.controller';
import {
  authenticateToken,
  requireRole,
} from '../middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  getAllAuditLogs
);

router.get(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  getAuditLogById
);

export default router;