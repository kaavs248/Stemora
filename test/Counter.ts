import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("SampleRegistry", function () {

  async function deployRegistry() {
    const [owner] = await ethers.getSigners();

    const accessRoles =
      await ethers.deployContract("AccessRoles");

    await accessRoles.waitForDeployment();

    const bankOperatorRole =
      await accessRoles.BANK_OPERATOR_ROLE();

    await accessRoles.grantRole(
      bankOperatorRole,
      owner.address
    );

    const registry =
      await ethers.deployContract(
        "SampleRegistry",
        [await accessRoles.getAddress()]
      );

    await registry.waitForDeployment();

    return registry;
  }

  it("Should register a new sample", async function () {

    const registry =
      await deployRegistry();

    const sampleId =
      "SMP-2026-000001";

    const donorReference =
      "DONOR-001";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-001"
        )
      );

    await registry.registerSample(
      sampleId,
      donorReference,
      metadataHash
    );

    const sample =
      await registry.getSample(sampleId);

    expect(sample[0]).to.equal(sampleId);
    expect(sample[1]).to.equal(donorReference);
    expect(sample[2]).to.equal(0n);
  });

  it("Should emit SampleRegistered event", async function () {

    const registry =
      await deployRegistry();

    const sampleId =
      "SMP-2026-000002";

    const donorReference =
      "DONOR-002";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-002"
        )
      );

    await expect(
      registry.registerSample(
        sampleId,
        donorReference,
        metadataHash
      )
    ).to.emit(
      registry,
      "SampleRegistered"
    );
  });

  it("Should reject duplicate sample IDs", async function () {

    const registry =
      await deployRegistry();

    const sampleId =
      "SMP-2026-000003";

    const donorReference =
      "DONOR-003";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-003"
        )
      );

    await registry.registerSample(
      sampleId,
      donorReference,
      metadataHash
    );

    await expect(
      registry.registerSample(
        sampleId,
        donorReference,
        metadataHash
      )
    ).to.be.revertedWith(
      "Sample already exists"
    );
  });

  it("Should allow a valid lifecycle transition", async function () {

    const registry =
      await deployRegistry();

    const sampleId =
      "SMP-2026-000004";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-004"
        )
      );

    await registry.registerSample(
      sampleId,
      "DONOR-004",
      metadataHash
    );

    await registry.updateStatus(
      sampleId,
      1
    );

    const sample =
      await registry.getSample(sampleId);

    expect(sample[2]).to.equal(1n);
  });

  it("Should reject an invalid lifecycle transition", async function () {

    const registry =
      await deployRegistry();

    const sampleId =
      "SMP-2026-000005";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-005"
        )
      );

    await registry.registerSample(
      sampleId,
      "DONOR-005",
      metadataHash
    );

    await expect(
      registry.updateStatus(
        sampleId,
        5
      )
    ).to.be.revertedWith(
      "Invalid lifecycle transition"
    );
  });

  it("Should reject unauthorized lifecycle updates", async function () {

    const registry =
      await deployRegistry();

    const sampleId =
      "SMP-2026-000006";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-006"
        )
      );

    await registry.registerSample(
      sampleId,
      "DONOR-006",
      metadataHash
    );

    const [, unauthorizedUser] =
      await ethers.getSigners();

    const unauthorizedRegistry =
      registry.connect(
        unauthorizedUser
      );

    await expect(
      unauthorizedRegistry.updateStatus(
        sampleId,
        1
      )
    ).to.be.revertedWith(
      "Not bank operator"
    );
  });

  it("Should transfer sample custody", async function () {

    const registry =
      await deployRegistry();

    const [, newCustodian] =
      await ethers.getSigners();

    const sampleId =
      "SMP-2026-000007";

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata-007"
        )
      );

    await registry.registerSample(
      sampleId,
      "DONOR-007",
      metadataHash
    );

    await registry.transferCustody(
      sampleId,
      newCustodian.address
    );

    const sample =
      await registry.getSample(sampleId);

    expect(sample[5]).to.equal(
      newCustodian.address
    );
  });
});


describe("ConsentManager", function () {

  async function deployConsentManager() {

    const consentManager =
      await ethers.deployContract(
        "ConsentManager"
      );

    await consentManager.waitForDeployment();

    return consentManager;
  }

  async function createTestConsent(
    consentManager: any
  ) {

    const validFrom = 1000;
    const validUntil = 2000;

    const restrictionsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "no-commercial-use"
        )
      );

    await consentManager.createConsent(
      "CONSENT-001",
      "SMP-2026-000001",
      "DONOR-001",
      "ResearchLab-A",
      "Cancer Research",
      "RESEARCH",
      validFrom,
      validUntil,
      restrictionsHash
    );
  }

  it("Should create a new consent", async function () {

    const consentManager =
      await deployConsentManager();

    await createTestConsent(
      consentManager
    );

    const consent =
      await consentManager.getConsent(
        "CONSENT-001"
      );

    expect(consent[0]).to.equal(
      "CONSENT-001"
    );

    expect(consent[1]).to.equal(
      "SMP-2026-000001"
    );

    expect(consent[3]).to.equal(
      "ResearchLab-A"
    );

    expect(consent[4]).to.equal(
      "Cancer Research"
    );

    expect(consent[5]).to.equal(
      "RESEARCH"
    );

    expect(consent[8]).to.equal(0n);
  });

  it("Should emit ConsentCreated event", async function () {

    const consentManager =
      await deployConsentManager();

    await expect(
      consentManager.createConsent(
        "CONSENT-002",
        "SMP-2026-000002",
        "DONOR-002",
        "ResearchLab-B",
        "Diabetes Research",
        "RESEARCH",
        1000,
        2000,
        ethers.keccak256(
          ethers.toUtf8Bytes(
            "restriction-002"
          )
        )
      )
    ).to.emit(
      consentManager,
      "ConsentCreated"
    );
  });

  it("Should reject duplicate consent IDs", async function () {

    const consentManager =
      await deployConsentManager();

    await createTestConsent(
      consentManager
    );

    await expect(
      consentManager.createConsent(
        "CONSENT-001",
        "SMP-2026-000002",
        "DONOR-002",
        "ResearchLab-B",
        "Research",
        "RESEARCH",
        1000,
        2000,
        ethers.keccak256(
          ethers.toUtf8Bytes(
            "restriction"
          )
        )
      )
    ).to.be.revertedWith(
      "Consent already exists"
    );
  });

  it("Should reject an invalid validity period", async function () {

    const consentManager =
      await deployConsentManager();

    const restrictionsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "restriction"
        )
      );

    await expect(
      consentManager.createConsent(
        "CONSENT-003",
        "SMP-2026-000003",
        "DONOR-003",
        "ResearchLab-C",
        "Research",
        "RESEARCH",
        2000,
        1000,
        restrictionsHash
      )
    ).to.be.revertedWith(
      "Invalid validity period"
    );
  });

  it("Should revoke active consent", async function () {

    const consentManager =
      await deployConsentManager();

    await createTestConsent(
      consentManager
    );

    await consentManager.revokeConsent(
      "CONSENT-001"
    );

    const consent =
      await consentManager.getConsent(
        "CONSENT-001"
      );

    expect(consent[8]).to.equal(1n);
  });

  it("Should reject revoking consent twice", async function () {

    const consentManager =
      await deployConsentManager();

    await createTestConsent(
      consentManager
    );

    await consentManager.revokeConsent(
      "CONSENT-001"
    );

    await expect(
      consentManager.revokeConsent(
        "CONSENT-001"
      )
    ).to.be.revertedWith(
      "Consent already revoked"
    );
  });

  it("Should return false for a revoked consent", async function () {

    const consentManager =
      await deployConsentManager();

    await createTestConsent(
      consentManager
    );

    await consentManager.revokeConsent(
      "CONSENT-001"
    );

    expect(
      await consentManager.isConsentActive(
        "CONSENT-001"
      )
    ).to.equal(false);
  });

  it("Should return false for a non-existent consent", async function () {

    const consentManager =
      await deployConsentManager();

    expect(
      await consentManager.isConsentActive(
        "DOES-NOT-EXIST"
      )
    ).to.equal(false);
  });
});


describe("AccessControl", function () {

  let registry: any;
  let consentManager: any;
  let accessControl: any;

  async function deployAccessSystem() {

    const [owner] =
      await ethers.getSigners();

    const accessRoles =
      await ethers.deployContract(
        "AccessRoles"
      );

    await accessRoles.waitForDeployment();

    const bankOperatorRole =
      await accessRoles.BANK_OPERATOR_ROLE();

    await accessRoles.grantRole(
      bankOperatorRole,
      owner.address
    );

    registry =
      await ethers.deployContract(
        "SampleRegistry",
        [
          await accessRoles.getAddress()
        ]
      );

    await registry.waitForDeployment();

    consentManager =
      await ethers.deployContract(
        "ConsentManager"
      );

    await consentManager.waitForDeployment();

    /*
     * AccessControl is expected to receive
     * the SampleRegistry and ConsentManager
     * addresses in its constructor.
     */
    accessControl =
  await ethers.deployContract(
    "AccessControl",
    [
      await consentManager.getAddress(),
      await registry.getAddress()
    ]
  );

    await accessControl.waitForDeployment();

    return {
      registry,
      consentManager,
      accessControl
    };
  }

  async function setupStoredSample(
    registry: any
  ) {

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "sample-metadata"
        )
      );

    await registry.registerSample(
      "SMP-ACCESS-001",
      "DONOR-ACCESS-001",
      metadataHash
    );

    await registry.updateStatus(
      "SMP-ACCESS-001",
      1
    );

    await registry.updateStatus(
      "SMP-ACCESS-001",
      2
    );

    await registry.updateStatus(
      "SMP-ACCESS-001",
      3
    );
  }

  async function setupConsent(
    consentManager: any
  ) {

    const latestBlock =
      await ethers.provider.getBlock(
        "latest"
      );

    const validFrom =
      Number(latestBlock!.timestamp) - 10;

    const validUntil =
      Number(latestBlock!.timestamp) + 3600;

    const restrictionsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "research-only"
        )
      );

    await consentManager.createConsent(
      "CONSENT-ACCESS-001",
      "SMP-ACCESS-001",
      "DONOR-ACCESS-001",
      "ResearchLab-A",
      "Cancer Research",
      "RESEARCH",
      validFrom,
      validUntil,
      restrictionsHash
    );
  }

  it("Should grant valid access", async function () {

    const {
      registry,
      consentManager,
      accessControl
    } = await deployAccessSystem();

    await setupStoredSample(
      registry
    );

    await setupConsent(
      consentManager
    );

    const result =
      await accessControl.checkAccess.staticCall(
        "REQUEST-001",
        "CONSENT-ACCESS-001",
        "SMP-ACCESS-001",
        "ResearchLab-A",
        "Cancer Research"
      );

    expect(result[0]).to.equal(true);
    expect(result[1]).to.equal(
      "Access granted"
    );
  });

  it("Should deny access when consent is revoked", async function () {

    const {
      registry,
      consentManager,
      accessControl
    } = await deployAccessSystem();

    await setupStoredSample(
      registry
    );

    await setupConsent(
      consentManager
    );

    await consentManager.revokeConsent(
      "CONSENT-ACCESS-001"
    );

    const result =
      await accessControl.checkAccess.staticCall(
        "REQUEST-002",
        "CONSENT-ACCESS-001",
        "SMP-ACCESS-001",
        "ResearchLab-A",
        "Cancer Research"
      );

    expect(result[0]).to.equal(false);

    expect(result[1]).to.equal(
      "Consent is not active"
    );
  });

  it("Should deny access for the wrong organization", async function () {

    const {
      registry,
      consentManager,
      accessControl
    } = await deployAccessSystem();

    await setupStoredSample(
      registry
    );

    await setupConsent(
      consentManager
    );

    const result =
      await accessControl.checkAccess.staticCall(
        "REQUEST-003",
        "CONSENT-ACCESS-001",
        "SMP-ACCESS-001",
        "UnauthorizedLab",
        "Cancer Research"
      );

    expect(result[0]).to.equal(false);

    expect(result[1]).to.equal(
      "Organization does not match consent"
    );
  });

  it("Should deny access for the wrong purpose", async function () {

    const {
      registry,
      consentManager,
      accessControl
    } = await deployAccessSystem();

    await setupStoredSample(
      registry
    );

    await setupConsent(
      consentManager
    );

    const result =
      await accessControl.checkAccess.staticCall(
        "REQUEST-004",
        "CONSENT-ACCESS-001",
        "SMP-ACCESS-001",
        "ResearchLab-A",
        "Commercial Research"
      );

    expect(result[0]).to.equal(false);

    expect(result[1]).to.equal(
      "Purpose does not match consent"
    );
  });

  it("Should deny access when consent belongs to another sample", async function () {

    const {
      registry,
      consentManager,
      accessControl
    } = await deployAccessSystem();

    await setupStoredSample(
      registry
    );

    await setupConsent(
      consentManager
    );

    const result =
      await accessControl.checkAccess.staticCall(
        "REQUEST-005",
        "CONSENT-ACCESS-001",
        "DIFFERENT-SAMPLE",
        "ResearchLab-A",
        "Cancer Research"
      );

    expect(result[0]).to.equal(false);

    expect(result[1]).to.equal(
      "Consent does not apply to sample"
    );
  });

  it("Should deny access when sample is not stored", async function () {

    const {
      registry,
      consentManager,
      accessControl
    } = await deployAccessSystem();

    const metadataHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "unstored-sample"
        )
      );

    await registry.registerSample(
      "SMP-ACCESS-002",
      "DONOR-ACCESS-002",
      metadataHash
    );

    const latestBlock =
      await ethers.provider.getBlock(
        "latest"
      );

    const validFrom =
      Number(latestBlock!.timestamp) - 10;

    const validUntil =
      Number(latestBlock!.timestamp) + 3600;

    await consentManager.createConsent(
      "CONSENT-ACCESS-002",
      "SMP-ACCESS-002",
      "DONOR-ACCESS-002",
      "ResearchLab-A",
      "Cancer Research",
      "RESEARCH",
      validFrom,
      validUntil,
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "research-only"
        )
      )
    );

    const result =
      await accessControl.checkAccess.staticCall(
        "REQUEST-006",
        "CONSENT-ACCESS-002",
        "SMP-ACCESS-002",
        "ResearchLab-A",
        "Cancer Research"
      );

    expect(result[0]).to.equal(false);

    expect(result[1]).to.equal(
      "Sample is not available"
    );
  });
});


describe("AuditLogger", function () {

  async function deployAuditLogger() {

    const auditLogger =
      await ethers.deployContract(
        "AuditLogger"
      );

    await auditLogger.waitForDeployment();

    return auditLogger;
  }

  it("Should record an audit entry", async function () {

    const auditLogger =
      await deployAuditLogger();

    const detailsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "access-request-details"
        )
      );

    await auditLogger.recordAudit(
      "ACCESS_GRANTED",
      "SMP-2026-000001",
      detailsHash
    );

    const entry =
      await auditLogger.getAudit(1);

    expect(entry[0]).to.equal(1n);
    expect(entry[1]).to.equal(
      "ACCESS_GRANTED"
    );

    expect(entry[2]).to.equal(
      "SMP-2026-000001"
    );

    expect(entry[4]).to.equal(
      detailsHash
    );
  });

  it("Should increment audit IDs", async function () {

    const auditLogger =
      await deployAuditLogger();

    const hash1 =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "details-1"
        )
      );

    const hash2 =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "details-2"
        )
      );

    await auditLogger.recordAudit(
      "SAMPLE_REGISTERED",
      "SMP-001",
      hash1
    );

    await auditLogger.recordAudit(
      "CONSENT_CREATED",
      "CONSENT-001",
      hash2
    );

    expect(
      await auditLogger.getAuditCount()
    ).to.equal(2n);

    const secondEntry =
      await auditLogger.getAudit(2);

    expect(secondEntry[0]).to.equal(2n);

    expect(secondEntry[1]).to.equal(
      "CONSENT_CREATED"
    );
  });

  it("Should emit AuditRecorded event", async function () {

    const auditLogger =
      await deployAuditLogger();

    const detailsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "event-details"
        )
      );

    await expect(
      auditLogger.recordAudit(
        "ACCESS_DENIED",
        "SMP-2026-000002",
        detailsHash
      )
    ).to.emit(
      auditLogger,
      "AuditRecorded"
    );
  });

  it("Should reject an empty action", async function () {

    const auditLogger =
      await deployAuditLogger();

    const detailsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "details"
        )
      );

    await expect(
      auditLogger.recordAudit(
        "",
        "SMP-2026-000003",
        detailsHash
      )
    ).to.be.revertedWith(
      "Invalid action"
    );
  });

  it("Should reject an empty subject ID", async function () {

    const auditLogger =
      await deployAuditLogger();

    const detailsHash =
      ethers.keccak256(
        ethers.toUtf8Bytes(
          "details"
        )
      );

    await expect(
      auditLogger.recordAudit(
        "ACCESS_GRANTED",
        "",
        detailsHash
      )
    ).to.be.revertedWith(
      "Invalid subject ID"
    );
  });

  it("Should reject a non-existent audit entry", async function () {

    const auditLogger =
      await deployAuditLogger();

    await expect(
      auditLogger.getAudit(999)
    ).to.be.revertedWith(
      "Audit entry does not exist"
    );
  });
});


describe("AccessRoles", function () {

  async function deployAccessRoles() {

    const accessRoles =
      await ethers.deployContract(
        "AccessRoles"
      );

    await accessRoles.waitForDeployment();

    return accessRoles;
  }

  it("Should make the deployer an admin", async function () {

    const accessRoles =
      await deployAccessRoles();

    const [admin] =
      await ethers.getSigners();

    const adminRole =
      await accessRoles.ADMIN_ROLE();

    expect(
      await accessRoles.hasRole(
        adminRole,
        admin.address
      )
    ).to.equal(true);
  });

  it("Should allow admin to grant a role", async function () {

    const accessRoles =
      await deployAccessRoles();

    const [, researcher] =
      await ethers.getSigners();

    const researcherRole =
      await accessRoles.RESEARCHER_ROLE();

    await accessRoles.grantRole(
      researcherRole,
      researcher.address
    );

    expect(
      await accessRoles.hasRole(
        researcherRole,
        researcher.address
      )
    ).to.equal(true);
  });

  it("Should allow admin to revoke a role", async function () {

    const accessRoles =
      await deployAccessRoles();

    const [, researcher] =
      await ethers.getSigners();

    const researcherRole =
      await accessRoles.RESEARCHER_ROLE();

    await accessRoles.grantRole(
      researcherRole,
      researcher.address
    );

    await accessRoles.revokeRole(
      researcherRole,
      researcher.address
    );

    expect(
      await accessRoles.hasRole(
        researcherRole,
        researcher.address
      )
    ).to.equal(false);
  });

  it("Should reject non-admin role management", async function () {

    const accessRoles =
      await deployAccessRoles();

    const [
      ,
      unauthorizedUser,
      researcher
    ] = await ethers.getSigners();

    const researcherRole =
      await accessRoles.RESEARCHER_ROLE();

    const unauthorizedAccessRoles =
      accessRoles.connect(
        unauthorizedUser
      );

    await expect(
      unauthorizedAccessRoles.grantRole(
        researcherRole,
        researcher.address
      )
    ).to.be.revertedWith(
      "Not admin"
    );
  });

  it("Should reject an invalid account", async function () {

    const accessRoles =
      await deployAccessRoles();

    const researcherRole =
      await accessRoles.RESEARCHER_ROLE();

    await expect(
      accessRoles.grantRole(
        researcherRole,
        ethers.ZeroAddress
      )
    ).to.be.revertedWith(
      "Invalid account"
    );
  });
});