const assert = require('node:assert/strict');
const { test } = require('node:test');
const prisma = require('../config/prisma').default;
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

const setupMocks = ({ policyConsent, changedCount = 1, purpose = pendingRequest.purpose }) => {
  const originals = {
    findUnique: prisma.accessRequest.findUnique,
    transaction: prisma.$transaction,
  };
  const writes = { requestUpdates: 0, grants: 0, audits: 0 };

  prisma.accessRequest.findUnique = async () => ({ ...pendingRequest, purpose });
  prisma.$transaction = async (callback) => callback({
    sample: {
      findUnique: async () => ({ id: 'sample-1', currentStatus: 'STORED' }),
    },
    researcher: {
      findUnique: async () => ({
        id: 'researcher-1',
        verificationStatus: 'VERIFIED',
        organization: { verificationStatus: 'VERIFIED' },
      }),
    },
    consent: {
      findFirst: async () => policyConsent,
    },
    accessRequest: {
      updateMany: async () => {
        writes.requestUpdates += 1;
        return { count: changedCount };
      },
      findUnique: async () => ({ ...pendingRequest, status: 'APPROVED' }),
    },
    accessGrant: {
      create: async () => { writes.grants += 1; },
    },
    auditLog: {
      create: async () => { writes.audits += 1; },
    },
  });

  return {
    writes,
    restore() {
      prisma.accessRequest.findUnique = originals.findUnique;
      prisma.$transaction = originals.transaction;
    },
  };
};

test('policy denial leaves an access request pending and creates no grant or review audit', async () => {
  const mocks = setupMocks({ policyConsent: { researchAllowed: false, commercialUseAllowed: false } });

  try {
    const res = createResponse();
    await approveAccessRequest({ params: { id: 'request-1' }, body: {}, user: { id: 'admin-1' } }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'Donor consent does not allow research use');
    assert.deepEqual(mocks.writes, { requestUpdates: 0, grants: 0, audits: 0 });
  } finally {
    mocks.restore();
  }
});

test('approval rechecks policy in the transaction, then creates a grant and audit entry', async () => {
  const mocks = setupMocks({ policyConsent: { researchAllowed: true, commercialUseAllowed: false } });

  try {
    const res = createResponse();
    await approveAccessRequest({ params: { id: 'request-1' }, body: {}, user: { id: 'admin-1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.accessRequest.status, 'APPROVED');
    assert.deepEqual(mocks.writes, { requestUpdates: 1, grants: 1, audits: 1 });
  } finally {
    mocks.restore();
  }
});

test('commercial purpose is denied when consent does not allow commercial use', async () => {
  const mocks = setupMocks({
    policyConsent: { researchAllowed: true, commercialUseAllowed: false },
    purpose: 'Commercial development of a stem cell therapy',
  });

  try {
    const res = createResponse();
    await approveAccessRequest({ params: { id: 'request-1' }, body: {}, user: { id: 'admin-1' } }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'Donor consent does not allow commercial use');
    assert.deepEqual(mocks.writes, { requestUpdates: 0, grants: 0, audits: 0 });
  } finally {
    mocks.restore();
  }
});

test('a concurrent review that loses the pending-only update creates no grant or audit', async () => {
  const mocks = setupMocks({ policyConsent: { researchAllowed: true, commercialUseAllowed: false }, changedCount: 0 });

  try {
    const res = createResponse();
    await approveAccessRequest({ params: { id: 'request-1' }, body: {}, user: { id: 'admin-1' } }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(mocks.writes, { requestUpdates: 1, grants: 0, audits: 0 });
  } finally {
    mocks.restore();
  }
});
