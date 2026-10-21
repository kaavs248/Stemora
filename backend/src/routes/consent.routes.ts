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

router.get('/donor/:donorId', authenticateToken, requireRole(['DONOR', 'ADMIN']), getDonorConsents);
router.get('/sample/:sampleId/history', authenticateToken, requireRole(['DONOR', 'ADMIN']), getConsentHistory);
router.get('/sample/:sampleId', authenticateToken, requireRole(['DONOR', 'ADMIN']), getSampleConsent);

router.post(
  '/',
  authenticateToken,
  requireRole(['DONOR']),
  createConsent
);

router.patch(
  '/:id',
  authenticateToken,
  requireRole(['DONOR']),
  updateConsent
);

router.post(
  '/:id/revoke',
  authenticateToken,
  requireRole(['DONOR']),
  revokeConsent
);

export default router;
