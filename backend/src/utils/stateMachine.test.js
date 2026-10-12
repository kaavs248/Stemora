const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SampleStatus } = require('@prisma/client');
const { isValidTransition } = require('./stateMachine');

test('allows the configured forward lifecycle transitions', () => {
  assert.equal(isValidTransition(SampleStatus.COLLECTED, SampleStatus.PROCESSING), true);
  assert.equal(isValidTransition(SampleStatus.TESTING, SampleStatus.STORED), true);
  assert.equal(isValidTransition(SampleStatus.QUARANTINED, SampleStatus.STORED), true);
});

test('rejects skipped, repeated, and terminal lifecycle transitions', () => {
  assert.equal(isValidTransition(SampleStatus.COLLECTED, SampleStatus.RELEASED), false);
  assert.equal(isValidTransition(SampleStatus.STORED, SampleStatus.STORED), false);
  assert.equal(isValidTransition(SampleStatus.DESTROYED, SampleStatus.COLLECTED), false);
  assert.equal(isValidTransition('toString', SampleStatus.COLLECTED), false);
});
