const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateOrderTotals, overlaps, campaignIsActive } = require('../src/domain');

test('order totals include delivery below the free-delivery threshold', () => {
  assert.deepEqual(calculateOrderTotals([{ quantity: 2, unitPrice: 1200 }, { quantity: 1, unitPrice: 800 }]), { subtotal: 3200, deliveryFee: 250, total: 3450 });
});

test('order totals waive delivery at the threshold', () => {
  assert.deepEqual(calculateOrderTotals([{ quantity: 1, unitPrice: 5000 }]), { subtotal: 5000, deliveryFee: 0, total: 5000 });
});

test('order totals reject invalid quantities and empty orders', () => {
  assert.throws(() => calculateOrderTotals([]), /at least one/);
  assert.throws(() => calculateOrderTotals([{ quantity: 0, unitPrice: 10 }]), /valid quantity/);
});

test('appointment overlap detects collisions while allowing adjacent bookings', () => {
  const start = '2026-11-03T10:00:00.000Z', end = '2026-11-03T11:00:00.000Z';
  assert.equal(overlaps(start, end, '2026-11-03T10:30:00.000Z', '2026-11-03T11:30:00.000Z'), true);
  assert.equal(overlaps(start, end, '2026-11-03T11:00:00.000Z', '2026-11-03T11:30:00.000Z'), false);
});

test('campaign visibility uses both boundaries and server time', () => {
  const campaign = { active: true, startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-05T00:00:00.000Z' };
  assert.equal(campaignIsActive(campaign, '2026-11-03T12:00:00.000Z'), true);
  assert.equal(campaignIsActive(campaign, '2026-11-05T00:00:00.000Z'), false);
  assert.equal(campaignIsActive({ ...campaign, active: false }, '2026-11-03T12:00:00.000Z'), false);
});
