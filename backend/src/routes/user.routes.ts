import { Router } from 'express';
import { getAllUsers, getUserById } from '../controllers/user.controller';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  getAllUsers
);

router.get(
  '/:id',
  authenticateToken,
  getUserById
);

export default router;