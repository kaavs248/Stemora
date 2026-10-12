import { Router } from 'express';
import {
  uploadDocumentRecord,
  getSampleDocuments,
} from '../controllers/document.controller';
import {
  authenticateToken,
  requireRole,
} from '../middleware/auth.middleware';

const router = Router();

router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  uploadDocumentRecord
);

router.get(
  '/sample/:sampleId',
  authenticateToken,
  getSampleDocuments
);

export default router;