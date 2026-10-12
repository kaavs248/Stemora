import { network } from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await network.connect();

  console.log("\n=== STEMORA BLOCKCHAIN E2E TEST ===\n");

  // --------------------------------------------------
  // 1. Load deployment addresses
  // --------------------------------------------------

  const deployment = JSON.parse(
    fs.readFileSync("deployment.json", "utf-8")
  );

  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);

  // --------------------------------------------------
  // 2. Load deployed contracts
  // --------------------------------------------------

  const accessRoles = await ethers.getContractAt(
    "AccessRoles",
    deployment.AccessRoles
  );

  const sampleRegistry = await ethers.getContractAt(
    "SampleRegistry",
    deployment.SampleRegistry
  );

  const consentManager = await ethers.getContractAt(
    "ConsentManager",
    deployment.ConsentManager
  );

  const accessControl = await ethers.getContractAt(
    "AccessControl",
    deployment.AccessControl
  );

  const auditLogger = await ethers.getContractAt(
    "AuditLogger",
    deployment.AuditLogger
  );

  console.log("✓ Contracts loaded");

  // --------------------------------------------------
  // 3. Verify BANK_OPERATOR_ROLE
  // --------------------------------------------------

  const bankOperatorRole =
    await accessRoles.BANK_OPERATOR_ROLE();

  const isOperator =
    await accessRoles.hasRole(
      bankOperatorRole,
      deployer.address
    );

  if (!isOperator) {
    throw new Error(
      "Deployer does not have BANK_OPERATOR_ROLE"
    );
  }

  console.log("✓ Deployer is bank operator");

  // --------------------------------------------------
  // 4. Register sample
  // --------------------------------------------------

  const sampleId =
    "SMP-E2E-001";

  const donorReference =
    "DONOR-E2E-001";

  const metadataHash =
    ethers.keccak256(
      ethers.toUtf8Bytes(
        "stemora-e2e-sample"
      )
    );

  const registerTx =
    await sampleRegistry.registerSample(
      sampleId,
      donorReference,
      metadataHash
    );

  await registerTx.wait();

  console.log(
    "✓ Sample registered:",
    sampleId
  );

  // --------------------------------------------------
  // 5. Verify initial sample state
  // --------------------------------------------------

  let sample =
    await sampleRegistry.getSample(
      sampleId
    );

  console.log(
    "  Initial status:",
    sample[2].toString()
  );

  if (sample[2] !== 0n) {
    throw new Error(
      "Sample should initially be COLLECTED"
    );
  }

  // --------------------------------------------------
  // 6. COLLECTED → PROCESSING
  // --------------------------------------------------

  let tx =
    await sampleRegistry.updateStatus(
      sampleId,
      1
    );

  await tx.wait();

  console.log(
    "✓ Sample moved to PROCESSING"
  );

  // --------------------------------------------------
  // 7. PROCESSING → TESTING
  // --------------------------------------------------

  tx =
    await sampleRegistry.updateStatus(
      sampleId,
      2
    );

  await tx.wait();

  console.log(
    "✓ Sample moved to TESTING"
  );

  // --------------------------------------------------
  // 8. TESTING → STORED
  // --------------------------------------------------

  tx =
    await sampleRegistry.updateStatus(
      sampleId,
      3
    );

  await tx.wait();

  console.log(
    "✓ Sample moved to STORED"
  );

  // --------------------------------------------------
  // 9. Verify STORED status
  // --------------------------------------------------

  sample =
    await sampleRegistry.getSample(
      sampleId
    );

  if (sample[2] !== 3n) {
    throw new Error(
      "Sample should be STORED"
    );
  }

  console.log(
    "✓ Sample lifecycle verified"
  );

  // --------------------------------------------------
  // 10. Create consent
  // --------------------------------------------------

  const consentId =
    "CON-E2E-001";

  const organization =
    "Stemora Research Institute";

  const purpose =
    "Stem cell research";

  const usageType =
    "Research";

  const now =
    Math.floor(Date.now() / 1000);

  const validFrom =
    BigInt(now - 60);

  const validUntil =
    BigInt(now + 86400);

  const restrictionsHash =
    ethers.keccak256(
      ethers.toUtf8Bytes(
        "research-only"
      )
    );

  tx =
    await consentManager.createConsent(
      consentId,
      sampleId,
      donorReference,
      organization,
      purpose,
      usageType,
      validFrom,
      validUntil,
      restrictionsHash
    );

  await tx.wait();

  console.log(
    "✓ Consent created:",
    consentId
  );

  // --------------------------------------------------
  // 11. Verify consent is active
  // --------------------------------------------------

  const consentActive =
    await consentManager.isConsentActive(
      consentId
    );

  if (!consentActive) {
    throw new Error(
      "Consent should be active"
    );
  }

  console.log(
    "✓ Consent is active"
  );

  // --------------------------------------------------
  // 12. Check access
  // --------------------------------------------------

  const requestId =
    "REQ-E2E-001";

  /*
   * First simulate the transaction so we
   * can read the returned (bool, reason).
   */
  const accessResult =
    await accessControl.checkAccess.staticCall(
      requestId,
      consentId,
      sampleId,
      organization,
      purpose
    );

  console.log(
    "  Access result:",
    accessResult[0],
    "-",
    accessResult[1]
  );

  if (
    accessResult[0] !== true ||
    accessResult[1] !== "Access granted"
  ) {
    throw new Error(
      "Access should have been granted"
    );
  }

  /*
   * Now send the actual transaction so
   * AccessDecision is recorded on-chain.
   */
  tx =
    await accessControl.checkAccess(
      requestId,
      consentId,
      sampleId,
      organization,
      purpose
    );

  await tx.wait();

  console.log(
    "✓ Access granted"
  );

  // --------------------------------------------------
  // 13. Record audit entry
  // --------------------------------------------------

  const action =
    "SAMPLE_ACCESS_GRANTED";

  const detailsHash =
    ethers.keccak256(
      ethers.toUtf8Bytes(
        "E2E access request approved"
      )
    );

  tx =
    await auditLogger.recordAudit(
      action,
      sampleId,
      detailsHash
    );

  const receipt =
    await tx.wait();

  console.log(
    "✓ Audit entry recorded"
  );

  // --------------------------------------------------
  // 14. Verify audit count
  // --------------------------------------------------

  const auditCount =
    await auditLogger.getAuditCount();

  if (auditCount < 1n) {
    throw new Error(
      "Audit entry was not recorded"
    );
  }

  console.log(
    "✓ Audit count:",
    auditCount.toString()
  );

  // --------------------------------------------------
  // 15. Read audit entry
  // --------------------------------------------------

  const audit =
    await auditLogger.getAudit(
      auditCount
    );

  console.log(
    "  Audit ID:",
    audit[0].toString()
  );

  console.log(
    "  Action:",
    audit[1]
  );

  console.log(
    "  Subject:",
    audit[2]
  );

  console.log(
    "  Actor:",
    audit[3]
  );

  console.log(
    "  Details hash:",
    audit[4]
  );

  // --------------------------------------------------
  // FINAL
  // --------------------------------------------------

  console.log(
    "\n========================================"
  );

  console.log(
    " STEMORA BLOCKCHAIN E2E TEST PASSED"
  );

  console.log(
    "========================================\n"
  );
}

main().catch((error) => {
  console.error("\nE2E TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});