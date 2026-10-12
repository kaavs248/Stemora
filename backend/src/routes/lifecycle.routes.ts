import { Router } from 'express';
import { transitionSampleStatus, getSampleLifecycleHistory } from '../controllers/lifecycle.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/:sampleId/lifecycle', authenticateToken, requireRole(['ADMIN']), transitionSampleStatus);
router.get('/:sampleId', authenticateToken, getSampleLifecycleHistory);

export default router;
