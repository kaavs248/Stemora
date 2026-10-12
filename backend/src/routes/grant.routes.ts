import { Router } from 'express';
import {
  getAccessGrants,
  revokeAccessGrant,
} from '../controllers/grant.controller';
import {
  authenticateToken,
  requireRole,
} from '../middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  authenticateToken,
  getAccessGrants
);

router.patch(
  '/:id/revoke',
  authenticateToken,
  requireRole(['ADMIN']),
  revokeAccessGrant
);

export default router;