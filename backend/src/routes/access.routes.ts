import { Router } from 'express';
import {
  createAccessRequest,
  getAccessRequests,
  getAccessRequestById,
  approveAccessRequest,
  rejectAccessRequest,
  revokeAccessRequest,
} from '../controllers/access.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, requireRole(['RESEARCHER']), createAccessRequest);
router.get('/', authenticateToken, getAccessRequests);
router.get('/:id', authenticateToken, getAccessRequestById);

router.patch('/:id/approve', authenticateToken, requireRole(['ADMIN']), approveAccessRequest);
router.patch('/:id/reject', authenticateToken, requireRole(['ADMIN']), rejectAccessRequest);
router.patch('/:id/revoke', authenticateToken, requireRole(['ADMIN']), revokeAccessRequest);

export default router;