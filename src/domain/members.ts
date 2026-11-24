import type {
  Member,
  MemberPaymentRecord,
  PaymentStatus,
  SectorAssignment,
} from './types';

export function deriveMemberPaymentState(
  contributionRequirement: number,
  paymentHistory: MemberPaymentRecord[],
): {
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
} {
  const requirement = Math.max(0, Number(contributionRequirement) || 0);
  const amountPaid = paymentHistory.reduce(
    (sum, rec) => sum + Math.max(0, Number(rec.amount) || 0),
    0,
  );
  const outstandingBalance = Math.max(0, requirement - amountPaid);

  let paymentStatus: PaymentStatus = 'Unpaid';
  if (requirement === 0 || amountPaid >= requirement) {
    paymentStatus = 'Paid';
  } else if (amountPaid > 0) {
    paymentStatus = 'Partially paid';
  }

  return {
    amountPaid: Number(amountPaid.toFixed(2)),
    outstandingBalance: Number(outstandingBalance.toFixed(2)),
    paymentStatus,
  };
}

export function validateNewMemberInput(
  input: {
    fullName: string;
    email: string;
    phone: string;
    contributionRequirement: number;
    sectorAssignments: SectorAssignment[];
  },
  existingMembers: Member[],
): { valid: boolean; error?: string } {
  if (!input.fullName || input.fullName.trim().length < 3) {
    return { valid: false, error: 'Full name must be at least 3 characters.' };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { valid: false, error: 'A valid email address is required.' };
  }

  const normalizedPhone = input.phone.replace(/\s+/g, '');
  if (!normalizedPhone || normalizedPhone.length < 7) {
    return { valid: false, error: 'A valid contact phone number is required.' };
  }

  const duplicateEmail = existingMembers.find(
    (m) => m.email.trim().toLowerCase() === normalizedEmail,
  );
  if (duplicateEmail) {
    return {
      valid: false,
      error: `Member profile already exists for ${duplicateEmail.fullName} (${duplicateEmail.memberCode}). Assign multiple sectors to the existing profile instead of creating a duplicate.`,
    };
  }

  const duplicatePhone = existingMembers.find(
    (m) => m.phone.replace(/\s+/g, '') === normalizedPhone,
  );
  if (duplicatePhone) {
    return {
      valid: false,
      error: `Phone number already belongs to ${duplicatePhone.fullName} (${duplicatePhone.memberCode}). Assign multiple sectors on their existing profile.`,
    };
  }

  if (
    !Number.isFinite(input.contributionRequirement) ||
    input.contributionRequirement < 0
  ) {
    return {
      valid: false,
      error: 'Contribution requirement cannot be negative.',
    };
  }

  if (!input.sectorAssignments || input.sectorAssignments.length === 0) {
    return {
      valid: false,
      error: 'Assign the member to at least one operational sector.',
    };
  }

  // Deduplicate sector assignments by sectorId
  const uniqueSectors = new Set(input.sectorAssignments.map((s) => s.sectorId));
  if (uniqueSectors.size !== input.sectorAssignments.length) {
    return {
      valid: false,
      error: 'Duplicate sector assignment detected on the same member profile.',
    };
  }

  return { valid: true };
}

export function getMembersBySector(
  members: Member[],
  sectorId: SectorAssignment['sectorId'],
): Member[] {
  return members.filter((m) =>
    m.sectorAssignments.some((assignment) => assignment.sectorId === sectorId),
  );
}
