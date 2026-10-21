import { network } from "hardhat";
import fs from "node:fs";

async function main() {
  const { ethers } = await network.connect();

  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with:", deployer.address);

  // 1. AccessRoles
  const accessRoles =
    await ethers.deployContract("AccessRoles");

  await accessRoles.waitForDeployment();

  const accessRolesAddress =
    await accessRoles.getAddress();

  console.log(
    "AccessRoles:",
    accessRolesAddress
  );

  // 2. Grant BANK_OPERATOR_ROLE
  const bankOperatorRole =
    await accessRoles.BANK_OPERATOR_ROLE();

  const roleTx =
    await accessRoles.grantRole(
      bankOperatorRole,
      deployer.address
    );

  await roleTx.wait();

  console.log(
    "BANK_OPERATOR_ROLE granted to deployer"
  );

  // 3. SampleRegistry
  const sampleRegistry =
    await ethers.deployContract(
      "SampleRegistry",
      [accessRolesAddress]
    );

  await sampleRegistry.waitForDeployment();

  const sampleRegistryAddress =
    await sampleRegistry.getAddress();

  console.log(
    "SampleRegistry:",
    sampleRegistryAddress
  );

// 4. ConsentManager
const consentManager =
  await ethers.deployContract(
    "ConsentManager",
    [accessRolesAddress]
  );

  await consentManager.waitForDeployment();

  const consentManagerAddress =
    await consentManager.getAddress();

  console.log(
    "ConsentManager:",
    consentManagerAddress
  );

  // 5. AuditLogger
  const auditLogger =
    await ethers.deployContract(
      "AuditLogger"
    );

  await auditLogger.waitForDeployment();

  const auditLoggerAddress =
    await auditLogger.getAddress();

  console.log(
    "AuditLogger:",
    auditLoggerAddress
  );

  // 6. AccessControl
  const accessControl =
    await ethers.deployContract(
      "AccessControl",
      [
        consentManagerAddress,
        sampleRegistryAddress
      ]
    );

  await accessControl.waitForDeployment();

  const accessControlAddress =
    await accessControl.getAddress();

  console.log(
    "AccessControl:",
    accessControlAddress
  );

  // 7. Save addresses
  const deployment = {
    network: "localhost",
    deployer: deployer.address,
    AccessRoles: accessRolesAddress,
    SampleRegistry: sampleRegistryAddress,
    ConsentManager: consentManagerAddress,
    AuditLogger: auditLoggerAddress,
    AccessControl: accessControlAddress
  };

  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(
      deployment,
      null,
      2
    )
  );

  console.log(
    "\nDeployment addresses saved to deployment.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});