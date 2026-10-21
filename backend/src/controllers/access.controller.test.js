
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

const syncedConsent = (overrides = {}) => ({
  researchAllowed: true,
  commercialUseAllowed: false,
  blockchainSyncStatus: 'SYNCED',
  ...overrides,
});

const setupMocks = ({
  policyConsent,
  changedCount = 1,
  purpose = pendingRequest.purpose,
} = {}) => {
  const originals = {
    findUnique: prisma.accessRequest.findUnique,
    transaction: prisma.$transaction,
  };

  const writes = {
    requestUpdates: 0,
    grants: 0,
    audits: 0,
  };

  prisma.accessRequest.findUnique = async () => ({
    ...pendingRequest,
    purpose,
  });

  prisma.$transaction = async (callback) =>
    callback({
      sample: {
        findUnique: async () => ({
          id: 'sample-1',
          currentStatus: 'STORED',
        }),
      },
      researcher: {
        findUnique: async () => ({
          id: 'researcher-1',
          verificationStatus: 'VERIFIED',
          organization: {
            verificationStatus: 'VERIFIED',
          },
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
        findUnique: async () => ({
          ...pendingRequest,
          status: 'APPROVED',
        }),
      },
      accessGrant: {
        create: async () => {
          writes.grants += 1;
        },
      },
      auditLog: {
        create: async () => {
          writes.audits += 1;
        },
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

const approveRequest = (res) =>
  approveAccessRequest(
    {
      params: { id: 'request-1' },
      body: {},
      user: { id: 'admin-1', role: 'ADMIN' },
    },
    res
  );

test(
  'research permission denial leaves the request pending and creates no grant or review audit',
  async () => {
    const mocks = setupMocks({
      policyConsent: syncedConsent({ researchAllowed: false }),
    });

    try {
      const res = createResponse();
      await approveRequest(res);

      assert.equal(res.statusCode, 403);
      assert.equal(
        res.body.reason,
        'Donor consent does not allow research use'
      );
      assert.deepEqual(mocks.writes, {
        requestUpdates: 0,
        grants: 0,
        audits: 0,
      });
    } finally {
      mocks.restore();
    }
  }
);

test(
  'approval rechecks synchronized consent in the transaction, then creates a grant and audit',
  async () => {
    const mocks = setupMocks({
      policyConsent: syncedConsent(),
    });

    try {
      const res = createResponse();
      await approveRequest(res);

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
  }
);

test(
  'commercial purpose is denied when consent does not allow commercial use',
  async () => {
    const mocks = setupMocks({
      policyConsent: syncedConsent({
        commercialUseAllowed: false,
      }),
      purpose: 'Commercial development of a stem cell therapy',
    });

    try {
      const res = createResponse();
      await approveRequest(res);

      assert.equal(res.statusCode, 403);
      assert.equal(
        res.body.reason,
        'Donor consent does not allow commercial use'
      );
      assert.deepEqual(mocks.writes, {
        requestUpdates: 0,
        grants: 0,
        audits: 0,
      });
    } finally {
      mocks.restore();
    }
  }
);

for (const syncStatus of ['PENDING', 'FAILED', 'RECONCILIATION_REQUIRED']) {
  test(
    `consent with blockchain sync status ${syncStatus} cannot authorize approval`,
    async () => {
      const mocks = setupMocks({
        policyConsent: syncedConsent({
          blockchainSyncStatus: syncStatus,
        }),
      });

      try {
        const res = createResponse();
        await approveRequest(res);

        assert.equal(res.statusCode, 403);
        assert.equal(
          res.body.reason,
          'Donor consent has not been synchronized with the blockchain'
        );
        assert.deepEqual(mocks.writes, {
          requestUpdates: 0,
          grants: 0,
          audits: 0,
        });
      } finally {
        mocks.restore();
      }
    }
  );
}

test(
  'a concurrent review that loses the pending-only update creates no grant or audit',
  async () => {
    const mocks = setupMocks({
      policyConsent: syncedConsent(),
      changedCount: 0,
    });

    try {
      const res = createResponse();
      await approveRequest(res);

      assert.equal(res.statusCode, 409);
      assert.deepEqual(mocks.writes, {
        requestUpdates: 1,
        grants: 0,
        audits: 0,
      });
    } finally {
      mocks.restore();
    }
  }
);
