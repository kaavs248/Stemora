import { Router } from 'express';
import {
  createSample,
  getAllSamples,
  getSampleById,
  updateSample,
} from '../controllers/sample.controller';
import {
  authenticateToken,
  requireRole,
} from '../middleware/auth.middleware';

const router = Router();

router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  createSample
);

router.get(
  '/',
  authenticateToken,
  getAllSamples
);

router.get(
  '/:id',
  authenticateToken,
  getSampleById
);

router.patch(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  updateSample
);

export default router;