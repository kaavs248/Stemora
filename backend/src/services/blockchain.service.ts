
import "dotenv/config";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  isAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const rpcUrl = requiredEnv("BLOCKCHAIN_RPC_URL");
const privateKey = requiredEnv("BLOCKCHAIN_PRIVATE_KEY");

const contractAddresses = {
  accessRoles: requiredEnv("ACCESS_ROLES_ADDRESS"),
  sampleRegistry: requiredEnv("SAMPLE_REGISTRY_ADDRESS"),
  consentManager: requiredEnv("CONSENT_MANAGER_ADDRESS"),
  auditLogger: requiredEnv("AUDIT_LOGGER_ADDRESS"),
  accessControl: requiredEnv("ACCESS_CONTROL_ADDRESS"),
};

for (const [name, address] of Object.entries(contractAddresses)) {
  if (!isAddress(address)) {
    throw new Error(`Invalid Ethereum address configured for ${name}`);
  }
}

const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);

// Minimal ABIs matching the Solidity contracts.
// Keep these synchronized with the actual Solidity interfaces.
const sampleRegistryAbi = [
  "function registerSample(string sampleId, string donorReference, bytes32 metadataHash)",
  "function getSample(string sampleId) view returns (string, string, uint8, uint256, uint256, address, bytes32)",
  "function updateStatus(string sampleId, uint8 newStatus)",
];

const consentManagerAbi = [
  "function createConsent(string consentId, string sampleId, string donorReference, string organization, string purpose, string usageType, uint256 validFrom, uint256 validUntil, bytes32 restrictionsHash)",
  "function revokeConsent(string consentId)",
  "function isConsentActive(string consentId) view returns (bool)",
];

const accessControlAbi = [
  "function checkAccess(string requestId, string consentId, string sampleId, string organization, string purpose) returns (bool, string)",
];

const auditLoggerAbi = [
  "function recordAudit(string action, string subjectId, string detailsHash) returns (uint256)",
];

function getContractMethod(
  contract: Contract,
  methodName: string,
): (...args: any[]) => Promise<any> {
  const method = contract.getFunction(methodName);
  return (...args: any[]) => method(...args);
}


const sampleRegistry = new Contract(
  contractAddresses.sampleRegistry,
  sampleRegistryAbi,
  wallet,
);

const consentManager = new Contract(
  contractAddresses.consentManager,
  consentManagerAbi,
  wallet,
);

const accessControl = new Contract(
  contractAddresses.accessControl,
  accessControlAbi,
  wallet,
);

const auditLogger = new Contract(
  contractAddresses.auditLogger,
  auditLoggerAbi,
  wallet,
);

async function submitTransaction(
  description: string,
  send: () => Promise<{ hash: string; wait: () => Promise<unknown> | null }>,
) {
  const tx = await send();
  const receipt = await tx.wait();

  if (!receipt || Number((receipt as { status?: number }).status) !== 1) {
    throw new Error(`${description} transaction was not confirmed successfully`);
  }

  return {
    transactionHash: tx.hash,
    blockNumber: (receipt as { blockNumber?: number }).blockNumber,
  };
}

export const blockchainService = {
  async getConnectionInfo() {
    const network = await provider.getNetwork();

    return {
      chainId: network.chainId.toString(),
      signerAddress: wallet.address,
    };
  },

  async registerSample(
    sampleId: string,
    donorReference: string,
    metadata: string,
  ) {
    const metadataHash = keccak256(toUtf8Bytes(metadata));

    return submitTransaction("Sample registration", () =>
      getContractMethod(sampleRegistry, "registerSample")(
  sampleId,
  donorReference,
  metadataHash,
),
    );
  },

  async getSample(sampleId: string) {
    const result = await getContractMethod(
      sampleRegistry,
      'getSample',
    )(sampleId);

    const statusNumber = Number(result[2]);

    const statusByNumber: Record<number, string> = {
      0: 'COLLECTED',
      1: 'PROCESSING',
      2: 'TESTING',
      3: 'STORED',
      4: 'TRANSFERRED',
      5: 'RELEASED',
      6: 'DESTROYED',
    };

    const status = statusByNumber[statusNumber];

    if (!status) {
      throw new Error(`Unknown on-chain status: ${statusNumber}`);
    }

    return {
      sampleId: String(result[0]),
      donorReference: String(result[1]),
      status,
      custodian: String(result[5]),
    };
  },

  async recordLifecycleEvent(sampleId: string, status: number) {
    if (!Number.isInteger(status) || status < 0 || status > 6) {
      throw new Error("Invalid on-chain sample status");
    }

    return submitTransaction("Lifecycle update", () =>
      getContractMethod(sampleRegistry, "updateStatus")(
  sampleId,
  status,
),
    );
  },

  async createConsent(input: {
    consentId: string;
    sampleId: string;
    donorReference: string;
    organization: string;
    purpose: string;
    usageType: string;
    validFrom: number;
    validUntil: number;
    restrictions: string;
  }) {
    const restrictionsHash = keccak256(toUtf8Bytes(input.restrictions));

    return submitTransaction("Consent creation", () =>
      getContractMethod(consentManager, "createConsent")(
        input.consentId,
        input.sampleId,
        input.donorReference,
        input.organization,
        input.purpose,
        input.usageType,
        input.validFrom,
        input.validUntil,
        restrictionsHash,
      ),
    );
  },

  async revokeConsent(consentId: string) {
    return submitTransaction("Consent revocation", () =>
      getContractMethod(consentManager, "revokeConsent")(
  consentId,
),
    );
  },

  async checkAccess(
    requestId: string,
    consentId: string,
    sampleId: string,
    organization: string,
    purpose: string,
  ) {
    // This submits a transaction and records an on-chain decision.
    // Do not treat it alone as authorization to release protected data.
    const tx = await getContractMethod(
  accessControl,
  "checkAccess",
)(
      requestId,
      consentId,
      sampleId,
      organization,
      purpose,
    );

    const receipt = await tx.wait();

    if (!receipt || Number(receipt.status) !== 1) {
      throw new Error("Access decision transaction failed");
    }

    return { transactionHash: tx.hash, blockNumber: receipt.blockNumber };
  },

  async recordAudit(action: string, subjectId: string, detailsHash: string) {
    return submitTransaction("Audit logging", () =>
      getContractMethod(auditLogger, "recordAudit")(
  action,
  subjectId,
  detailsHash,
),
    );
  },
};
