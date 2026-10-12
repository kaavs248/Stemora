import { Router } from 'express';
import { getAllResearchers, updateVerificationStatus } from '../controllers/researcher.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, requireRole(['ADMIN']), getAllResearchers);
router.patch('/:id/status', authenticateToken, requireRole(['ADMIN']), updateVerificationStatus);

export default router;