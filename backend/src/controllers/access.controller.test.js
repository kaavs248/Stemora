const assert = require('node:assert/strict');
const { test } = require('node:test');

const prisma = require('../config/prisma').default;
const policyService = require('../services/policy.service');
const { blockchainService } = require('../services/blockchain.service');
const { approveAccessRequest } = require('./access.controller');

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const pendingRequest = {
  id: 'request-1',
  sampleId: 'sample-1',
  researcherId: 'researcher-1',
  purpose: 'Non-commercial stem cell research',
  status: 'PENDING',
};

const originals = {
  findUnique: prisma.accessRequest.findUnique,
  transaction: prisma.$transaction,
  sampleFindUnique: prisma.sample.findUnique,
  consentFindFirst: prisma.consent.findFirst,
  evaluatePolicy: policyService.evaluateAccessPolicy,
  blockchainCheck: blockchainService.checkAccess,
};

function setupMocks({
  allowed = true,
  reason,
  changedCount = 1,
  blockchainGranted = true,
} = {}) {
  const writes = { requestUpdates: 0, grants: 0, audits: 0 };

  prisma.accessRequest.findUnique = async () => ({ ...pendingRequest });
  prisma.sample.findUnique = async () => ({ sampleCode: 'SC-TEST-001' });
  prisma.consent.findFirst = async () => ({
    id: 'consent-1',
    blockchainSyncStatus: 'SYNCED',
  });

  policyService.evaluateAccessPolicy = async () => ({
    allowed,
    ...(reason ? { reason } : {}),
  });

  blockchainService.checkAccess = async () => ({
    granted: blockchainGranted,
    reason: blockchainGranted ? 'Access granted' : 'Access denied',
    transactionHash: '0x' + 'a'.repeat(64),
    blockNumber: 100,
  });

  prisma.$transaction = async (callback) =>
    callback({
      accessRequest: {
        updateMany: async () => {
          writes.requestUpdates++;
          return { count: changedCount };
        },
        findUnique: async () => ({
          ...pendingRequest,
          status: 'APPROVED',
        }),
      },
      accessGrant: {
        create: async () => {
          writes.grants++;
          return {};
        },
      },
      auditLog: {
        create: async () => {
          writes.audits++;
          return {};
        },
      },
    });

  return {
    writes,
    restore() {
      prisma.accessRequest.findUnique = originals.findUnique;
      prisma.$transaction = originals.transaction;
      prisma.sample.findUnique = originals.sampleFindUnique;
      prisma.consent.findFirst = originals.consentFindFirst;
      policyService.evaluateAccessPolicy = originals.evaluatePolicy;
      blockchainService.checkAccess = originals.blockchainCheck;
    },
  };
}

async function runApproval() {
  const res = createResponse();
  await approveAccessRequest(
    {
      params: { id: 'request-1' },
      body: {},
      user: { id: 'admin-1', role: 'ADMIN' },
    },
    res
  );
  return res;
}

test('policy denial prevents approval and creates no grant or review audit', async () => {
  const mocks = setupMocks({
    allowed: false,
    reason: 'Donor consent does not allow research use',
  });

  try {
    const res = await runApproval();
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'Donor consent does not allow research use');
    assert.deepEqual(mocks.writes, {
      requestUpdates: 0,
      grants: 0,
      audits: 0,
    });
  } finally {
    mocks.restore();
  }
});

test('approval creates a grant and audit when policy and blockchain allow access', async () => {
  const mocks = setupMocks();

  try {
    const res = await runApproval();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.accessRequest.status, 'APPROVED');
    assert.deepEqual(mocks.writes, {
      requestUpdates: 1,
      grants: 1,
      audits: 1,
    });
  } finally {
    mocks.restore();
  }
});

test('blockchain denial prevents approval and grant creation', async () => {
  const mocks = setupMocks({ blockchainGranted: false });

  try {
    const res = await runApproval();
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Blockchain access decision denied');
    assert.equal(mocks.writes.requestUpdates, 0);
    assert.equal(mocks.writes.grants, 0);
    assert.equal(mocks.writes.audits, 0);
  } finally {
    mocks.restore();
  }
});

test('a concurrent review creates no grant or audit when the pending update loses', async () => {
  const mocks = setupMocks({ changedCount: 0 });

  try {
    const res = await runApproval();
    assert.equal(res.statusCode, 409);
    assert.equal(mocks.writes.grants, 0);
    assert.equal(mocks.writes.audits, 0);
  } finally {
    mocks.restore();
  }
});
