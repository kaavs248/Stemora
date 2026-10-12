import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/prisma';


export const getMyDonorProfile = async (req: AuthRequest, res: Response) => {
  try {
    const donor = await prisma.donor.findUnique({
      where: { userId: req.user?.id },
      include: {
        samples: true,
        consents: true,
      },
    });

    if (!donor) {
      return res.status(404).json({ error: 'Donor profile not found' });
    }

    return res.json(donor);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

export const getAllDonors = async (req: AuthRequest, res: Response) => {
  try {
    const donors = await prisma.donor.findMany({
      include: {
        user: {
          select: {
            email: true,
            createdAt: true,
          },
        },
        samples: true,
      },
    });

    return res.json(donors);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};