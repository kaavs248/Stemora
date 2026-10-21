-- CreateEnum
CREATE TYPE "BlockchainSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'RECONCILIATION_REQUIRED');

-- AlterTable
ALTER TABLE "Consent" ADD COLUMN     "blockchainSyncStatus" "BlockchainSyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "blockchainTxHash" TEXT;
