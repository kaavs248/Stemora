
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../config/prisma';

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
}

type PolicyDatabase = PrismaClient | Prisma.TransactionClient;

const isCommercialPurpose = (purpose: string): boolean => {
  const withoutNegatedCommercialTerms = purpose
    .replace(/\bnon[- ]commercial\b/gi, '')
    .replace(/\bnot\s+(?:for\s+)?commercial(?:\s+use)?\b/gi, '')
    .replace(/\bnon[- ]profit\b/gi, '')
    .replace(/\bnot\s+for\s+profit\b/gi, '');

  return /\bcommercial(?:ly|ization|isation)?\b|\bfor[- ]profit\b|\bprofit[- ](?:making|generating)\b|\bprofit(?:able)?\s+(?:use|purpose|activity|venture)\b/i
    .test(withoutNegatedCommercialTerms);
};

export const evaluateAccessPolicy = async (
  sampleId: string,
  researcherId: string,
  requestedPurpose: string,
  database: PolicyDatabase = prisma
): Promise<PolicyCheckResult> => {
  // 1. Verify the sample exists and is in an accessible state.
  const sample = await database.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      currentStatus: true,
    },
  });

  if (!sample) {
    return {
      allowed: false,
      reason: 'Sample does not exist',
    };
  }

  if (
    sample.currentStatus === 'DESTROYED' ||
    sample.currentStatus === 'QUARANTINED'
  ) {
    return {
      allowed: false,
      reason: `Sample is currently in ${sample.currentStatus} status and cannot be accessed`,
    };
  }

  // 2. Verify the researcher and their organization.
  const researcher = await database.researcher.findUnique({
    where: { id: researcherId },
    select: {
      id: true,
      verificationStatus: true,
      organization: {
        select: {
          verificationStatus: true,
        },
      },
    },
  });

  if (!researcher || researcher.verificationStatus !== 'VERIFIED') {
    return {
      allowed: false,
      reason: 'Researcher profile is not verified or does not exist',
    };
  }

  if (
    !researcher.organization ||
    researcher.organization.verificationStatus !== 'VERIFIED'
  ) {
    return {
      allowed: false,
      reason: 'Researcher organization is not verified or does not exist',
    };
  }

  // 3. Find the latest active consent for this sample.
  const activeConsent = await database.consent.findFirst({
    where: {
      sampleId,
      status: 'ACTIVE',
    },
    orderBy: {
      version: 'desc',
    },
    select: {
      id: true,
      researchAllowed: true,
      commercialUseAllowed: true,
      blockchainSyncStatus: true,
    },
  });

  if (!activeConsent) {
    return {
      allowed: false,
      reason: 'Active donor consent is required',
    };
  }

  // 4. Consent must be synchronized before it can authorize access.
  if (activeConsent.blockchainSyncStatus !== 'SYNCED') {
    return {
      allowed: false,
      reason:
        'Donor consent has not been synchronized with the blockchain',
    };
  }

  // 5. Check the donor's research permission.
  if (!activeConsent.researchAllowed) {
    return {
      allowed: false,
      reason: 'Donor consent does not allow research use',
    };
  }

  // 6. Check commercial permission when applicable.
  if (
    isCommercialPurpose(requestedPurpose) &&
    !activeConsent.commercialUseAllowed
  ) {
    return {
      allowed: false,
      reason: 'Donor consent does not allow commercial use',
    };
  }

  return { allowed: true };
};
