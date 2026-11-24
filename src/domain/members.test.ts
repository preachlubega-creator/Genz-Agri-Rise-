import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMemberPaymentState,
  getMembersBySector,
  validateNewMemberInput,
} from './members';
import { DEFAULT_ROLE_PERMISSIONS, hasPermission } from './rbac';
import type { Member, SessionUser } from './types';

const existingMembers: Member[] = [
  {
    id: 'mem-1',
    memberCode: 'GZA-001',
    fullName: 'Samuel Ochieng',
    email: 'samuel.ochieng@genzagririse.org',
    phone: '+256701112233',
    dateJoined: '2026-01-15',
    status: 'Active',
    contributionRequirement: 120,
    amountPaid: 120,
    outstandingBalance: 0,
    paymentStatus: 'Paid',
    primaryRole: 'Sector Manager',
    sectorAssignments: [
      { sectorId: 'agriculture', role: 'Sector Manager' },
      { sectorId: 'vertical_farming', role: 'Team Leader' },
    ],
    paymentHistory: [
      {
        id: 'pay-1',
        reference: 'PAY-001',
        amount: 120,
        date: '2026-01-20',
        method: 'Mobile Money',
        recordedBy: 'Grace Nabwire',
      },
    ],
  },
];

test('derives Paid, Partially paid, and Unpaid statuses correctly', () => {
  assert.deepEqual(deriveMemberPaymentState(120, []), {
    amountPaid: 0,
    outstandingBalance: 120,
    paymentStatus: 'Unpaid',
  });

  assert.deepEqual(
    deriveMemberPaymentState(120, [
      {
        id: 'p1',
        reference: 'PAY-1',
        amount: 50,
        date: '2026-02-01',
        method: 'Bank',
        recordedBy: 'Admin',
      },
    ]),
    {
      amountPaid: 50,
      outstandingBalance: 70,
      paymentStatus: 'Partially paid',
    },
  );

  assert.deepEqual(
    deriveMemberPaymentState(120, [
      {
        id: 'p1',
        reference: 'PAY-1',
        amount: 50,
        date: '2026-02-01',
        method: 'Bank',
        recordedBy: 'Admin',
      },
      {
        id: 'p2',
        reference: 'PAY-2',
        amount: 70,
        date: '2026-03-01',
        method: 'Cash',
        recordedBy: 'Admin',
      },
    ]),
    {
      amountPaid: 120,
      outstandingBalance: 0,
      paymentStatus: 'Paid',
    },
  );
});

test('prevents duplicate member profiles across multiple sectors', () => {
  const dupByEmail = validateNewMemberInput(
    {
      fullName: 'Samuel Ochieng',
      email: 'SAMUEL.OCHIENG@genzagririse.org',
      phone: '+256709998877',
      contributionRequirement: 120,
      sectorAssignments: [{ sectorId: 'piggery', role: 'General Member' }],
    },
    existingMembers,
  );
  assert.equal(dupByEmail.valid, false);
  assert.match(dupByEmail.error ?? '', /already exists/i);

  const dupSector = validateNewMemberInput(
    {
      fullName: 'New Member',
      email: 'new.member@genzagririse.org',
      phone: '+256709998877',
      contributionRequirement: 120,
      sectorAssignments: [
        { sectorId: 'agriculture', role: 'General Member' },
        { sectorId: 'agriculture', role: 'Team Leader' },
      ],
    },
    existingMembers,
  );
  assert.equal(dupSector.valid, false);

  assert.equal(getMembersBySector(existingMembers, 'agriculture').length, 1);
  assert.equal(getMembersBySector(existingMembers, 'vertical_farming').length, 1);
  assert.equal(getMembersBySector(existingMembers, 'poultry').length, 0);
});

test('enforces sector-scoped RBAC permissions per user assignment', () => {
  const sectorManagerUser: SessionUser = {
    id: 'usr-sm',
    fullName: 'Samuel Ochieng',
    email: 'samuel.ochieng@genzagririse.org',
    role: 'Sector Manager',
    sectorAssignments: [
      { sectorId: 'agriculture', role: 'Sector Manager' },
      { sectorId: 'vertical_farming', role: 'Team Leader' },
    ],
  };

  assert.equal(
    hasPermission(
      sectorManagerUser,
      DEFAULT_ROLE_PERMISSIONS,
      'projects',
      'create',
      'agriculture',
    ),
    true,
  );
  // As Team Leader in vertical_farming, cannot create new projects there
  assert.equal(
    hasPermission(
      sectorManagerUser,
      DEFAULT_ROLE_PERMISSIONS,
      'projects',
      'create',
      'vertical_farming',
    ),
    false,
  );
  // Cannot approve central finance transactions
  assert.equal(
    hasPermission(
      sectorManagerUser,
      DEFAULT_ROLE_PERMISSIONS,
      'finance',
      'approve',
      'Organisation',
    ),
    false,
  );
});
