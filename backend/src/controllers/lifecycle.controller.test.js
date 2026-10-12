const assert = require('node:assert/strict');
const { test } = require('node:test');
const prisma = require('../config/prisma').default;
const { transitionSampleStatus } = require('./lifecycle.controller');

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

test('rejects a status outside the Prisma SampleStatus enum before querying', async () => {
  const originalFindUnique = prisma.sample.findUnique;
  let queryCount = 0;
  prisma.sample.findUnique = async () => {
    queryCount += 1;
    return null;
  };

  try {
    const res = createResponse();
    await transitionSampleStatus(
      { params: { sampleId: 'sample-1' }, body: { toStatus: 'NOT_A_STATUS' } },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(queryCount, 0);
    assert.equal(res.body.error, 'A valid toStatus is required');
  } finally {
    prisma.sample.findUnique = originalFindUnique;
  }
});

test('returns 409 and writes no history when a concurrent transition wins', async () => {
  const originalFindUnique = prisma.sample.findUnique;
  const originalTransaction = prisma.$transaction;
  let conditionalWhere;
  let historyWrites = 0;
  let auditWrites = 0;

  prisma.sample.findUnique = async () => ({
    id: 'sample-1',
    currentStatus: 'COLLECTED',
  });
  prisma.$transaction = async (callback) => callback({
    sample: {
      updateMany: async (args) => {
        conditionalWhere = args.where;
        return { count: 0 };
      },
      findUniqueOrThrow: async () => {
        throw new Error('Must not read after a lost race');
      },
    },
    lifecycleEvent: {
      create: async () => {
        historyWrites += 1;
      },
    },
    auditLog: {
      create: async () => {
        auditWrites += 1;
      },
    },
  });

  try {
    const res = createResponse();
    await transitionSampleStatus(
      { params: { sampleId: 'sample-1' }, body: { toStatus: 'PROCESSING' } },
      res
    );

    assert.equal(res.statusCode, 409);
    assert.deepEqual(conditionalWhere, { id: 'sample-1', currentStatus: 'COLLECTED' });
    assert.equal(historyWrites, 0);
    assert.equal(auditWrites, 0);
  } finally {
    prisma.sample.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }
});
