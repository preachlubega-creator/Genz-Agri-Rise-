import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFinancialSummary,
  calculateSectorFinancials,
  validateNewTransaction,
} from './finance';
import type { FinancialTransaction } from './types';

const sampleTransactions: FinancialTransaction[] = [
  {
    id: 'tx-1',
    reference: 'TXN-2026-001',
    amount: 5000,
    type: 'External funding',
    date: '2026-09-01',
    description: 'Youth Agri Innovation Grant',
    scope: 'Organisation',
    recordedBy: 'Grace Nabwire',
    recordedByUserId: 'usr-1',
    approvalStatus: 'Approved',
    approvedBy: 'Grace Nabwire',
    approvedAt: '2026-09-01T10:00:00Z',
    immutable: true,
  },
  {
    id: 'tx-2',
    reference: 'TXN-2026-002',
    amount: 600,
    type: 'Membership contribution',
    date: '2026-09-04',
    description: 'Cohort 1 Member Contributions',
    scope: 'Organisation',
    recordedBy: 'Grace Nabwire',
    recordedByUserId: 'usr-1',
    approvalStatus: 'Approved',
    immutable: true,
  },
  {
    id: 'tx-3',
    reference: 'TXN-2026-003',
    amount: 2000,
    type: 'Sector allocation',
    date: '2026-09-05',
    description: 'Q3 Piggery Feed & Housing Allocation',
    scope: 'piggery',
    recordedBy: 'Grace Nabwire',
    recordedByUserId: 'usr-1',
    approvalStatus: 'Approved',
    immutable: true,
  },
  {
    id: 'tx-4',
    reference: 'TXN-2026-004',
    amount: 950,
    type: 'Operational expenditure',
    date: '2026-09-10',
    description: 'Starter Piglet Feed & Supplements',
    scope: 'piggery',
    recordedBy: 'Daniel Okello',
    recordedByUserId: 'usr-3',
    approvalStatus: 'Approved',
    approvedBy: 'Grace Nabwire',
    approvedAt: '2026-09-10T14:00:00Z',
    immutable: true,
  },
  {
    id: 'tx-5',
    reference: 'TXN-2026-005',
    amount: 1200,
    type: 'Revenue generated',
    date: '2026-09-18',
    description: 'Poultry Layer Egg Tray Sales',
    scope: 'poultry',
    recordedBy: 'Amina Hassan',
    recordedByUserId: 'usr-4',
    approvalStatus: 'Approved',
    immutable: true,
  },
  {
    id: 'tx-6',
    reference: 'TXN-2026-006',
    amount: 400,
    type: 'Operational expenditure',
    date: '2026-09-20',
    description: 'Pending Vertical Farming Nutrient Solution',
    scope: 'vertical_farming',
    recordedBy: 'Brian Kato',
    recordedByUserId: 'usr-5',
    approvalStatus: 'Pending',
    immutable: true,
  },
];

test('distinguishes allocated funds from actual expenditure in available balance', () => {
  const summary = calculateFinancialSummary(sampleTransactions);

  assert.equal(summary.externalFunding, 5000);
  assert.equal(summary.membershipContributions, 600);
  assert.equal(summary.totalRevenue, 1200);
  assert.equal(summary.totalInflows, 6800);
  assert.equal(summary.totalAllocated, 2000);
  assert.equal(summary.totalExpenditure, 950);
  // Available balance = 6800 inflows - 950 actual expenditure (allocation does not subtract cash!)
  assert.equal(summary.currentAvailableBalance, 5850);
  // Unallocated reserve = 5850 - (2000 allocated - 950 spent) = 4800
  assert.equal(summary.unallocatedReserve, 4800);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.pendingAmount, 400);
});

test('computes sector-level financial comparisons accurately', () => {
  const sectors = calculateSectorFinancials(sampleTransactions, [
    'agriculture',
    'piggery',
    'poultry',
    'vertical_farming',
  ]);
  const piggery = sectors.find((s) => s.sectorId === 'piggery')!;
  const poultry = sectors.find((s) => s.sectorId === 'poultry')!;
  const vf = sectors.find((s) => s.sectorId === 'vertical_farming')!;

  assert.equal(piggery.allocated, 2000);
  assert.equal(piggery.expenditure, 950);
  assert.equal(piggery.remainingAllocation, 1050);
  assert.equal(poultry.revenue, 1200);
  // Pending transaction is excluded from approved sector expenditure
  assert.equal(vf.expenditure, 0);
});

test('prevents duplicate transaction references case-insensitively', () => {
  const duplicateResult = validateNewTransaction(
    {
      reference: 'txn-2026-004',
      amount: 150,
      type: 'Operational expenditure',
      date: '2026-09-21',
      description: 'Duplicate check test',
      scope: 'piggery',
    },
    sampleTransactions,
  );
  assert.equal(duplicateResult.valid, false);
  assert.match(duplicateResult.error ?? '', /Duplicate transaction reference/i);

  const uniqueResult = validateNewTransaction(
    {
      reference: 'TXN-2026-099',
      amount: 150,
      type: 'Operational expenditure',
      date: '2026-09-21',
      description: 'Valid unique entry',
      scope: 'agriculture',
    },
    sampleTransactions,
  );
  assert.equal(uniqueResult.valid, true);
});
