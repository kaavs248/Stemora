import { Router } from 'express';
import {
  getSampleConsent,
  getDonorConsents,
  createConsent,
  updateConsent,
  revokeConsent,
  getConsentHistory,
} from '../controllers/consent.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/donor/:donorId', authenticateToken, getDonorConsents);
router.get('/sample/:sampleId/history', authenticateToken, getConsentHistory);
router.get('/sample/:sampleId', authenticateToken, getSampleConsent);

router.post(
  '/',
  authenticateToken,
  requireRole(['DONOR', 'ADMIN']),
  createConsent
);

router.patch(
  '/:id',
  authenticateToken,
  requireRole(['DONOR', 'ADMIN']),
  updateConsent
);

router.post(
  '/:id/revoke',
  authenticateToken,
  requireRole(['DONOR', 'ADMIN']),
  revokeConsent
);

export default router;