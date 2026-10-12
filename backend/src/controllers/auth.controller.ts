import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const generateToken = (id: string, role: string) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'development-secret-key',
    { expiresIn: '1d' }
  );
};

// Register a new user
export const register = async (req: AuthRequest, res: Response) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    if (Object.keys(req.body).some((key) => !['email', 'password', 'role'].includes(key))) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }

    const { email, password, role } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    const passwordBytes = typeof password === 'string' ? Buffer.byteLength(password, 'utf8') : 0;
    if (typeof password !== 'string' || passwordBytes < 8 || passwordBytes > 72) {
      return res.status(400).json({ error: 'Password must be between 8 and 72 bytes' });
    }
    if (role !== undefined && role !== Role.DONOR && role !== Role.RESEARCHER) {
      return res.status(400).json({ error: 'Public registration is limited to donor and researcher accounts' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
      });
    }

    const userRole = role ?? Role.DONOR;

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: userRole,
      },
    });

    const token = generateToken(user.id, user.role);

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'User already exists' });
    }
    return res.status(500).json({
      error: 'Unable to register user',
    });
  }
};

// Login
export const login = async (req: AuthRequest, res: Response) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }
    if (Object.keys(req.body).some((key) => key !== 'email' && key !== 'password')) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }
    const { email, password } = req.body;
    if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Valid email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const token = generateToken(user.id, user.role);

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch {
    return res.status(500).json({
      error: 'Unable to log in',
    });
  }
};

// Get currently authenticated user
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        donor: true,
        researcher: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    return res.json(user);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
};
