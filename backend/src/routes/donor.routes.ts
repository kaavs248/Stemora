import { Router } from 'express';
import {
  getMyDonorProfile,
  getAllDonors,
} from '../controllers/donor.controller';
import {
  authenticateToken,
  requireRole,
} from '../middleware/auth.middleware';

const router = Router();

router.get(
  '/me',
  authenticateToken,
  requireRole(['DONOR']),
  getMyDonorProfile
);

router.get(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  getAllDonors
);

export default router;