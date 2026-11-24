import type {
  FinancialTransaction,
  SectorId,
  TransactionType,
} from './types';

export interface FinancialSummary {
  membershipContributions: number;
  externalFunding: number;
  donationsAndGrants: number;
  totalExternalAndGrants: number;
  totalAllocated: number;
  totalExpenditure: number;
  totalProjectInvestment: number;
  totalRevenue: number;
  totalInflows: number;
  currentAvailableBalance: number;
  unallocatedReserve: number;
  pendingCount: number;
  pendingAmount: number;
}

export interface SectorFinancialComparison {
  sectorId: SectorId;
  allocated: number;
  expenditure: number;
  projectInvestment: number;
  revenue: number;
  contributionsAttributed: number;
  remainingAllocation: number;
  netPosition: number;
}

export const INFLOW_TYPES: TransactionType[] = [
  'Membership contribution',
  'External funding',
  'Donation & grant',
  'Revenue generated',
];

export const OUTFLOW_TYPES: TransactionType[] = [
  'Operational expenditure',
  'Project investment',
];

export function requiresApproval(type: TransactionType): boolean {
  return (
    type === 'Operational expenditure' ||
    type === 'Sector allocation' ||
    type === 'Project investment'
  );
}

export function calculateFinancialSummary(
  transactions: FinancialTransaction[],
): FinancialSummary {
  let membershipContributions = 0;
  let externalFunding = 0;
  let donationsAndGrants = 0;
  let totalAllocated = 0;
  let totalExpenditure = 0;
  let totalProjectInvestment = 0;
  let totalRevenue = 0;
  let pendingCount = 0;
  let pendingAmount = 0;

  for (const tx of transactions) {
    if (tx.approvalStatus === 'Pending') {
      pendingCount += 1;
      pendingAmount += tx.amount;
      continue;
    }
    if (tx.approvalStatus !== 'Approved') {
      continue;
    }

    switch (tx.type) {
      case 'Membership contribution':
        membershipContributions += tx.amount;
        break;
      case 'External funding':
        externalFunding += tx.amount;
        break;
      case 'Donation & grant':
        donationsAndGrants += tx.amount;
        break;
      case 'Sector allocation':
        totalAllocated += tx.amount;
        break;
      case 'Operational expenditure':
        totalExpenditure += tx.amount;
        break;
      case 'Project investment':
        totalProjectInvestment += tx.amount;
        break;
      case 'Revenue generated':
        totalRevenue += tx.amount;
        break;
    }
  }

  const totalExternalAndGrants = externalFunding + donationsAndGrants;
  const totalInflows =
    membershipContributions + totalExternalAndGrants + totalRevenue;
  // Actual outflows are operational expenditure + project investment (allocations earmark funds, distinct from actual expenditure)
  const actualCashSpent = totalExpenditure + totalProjectInvestment;
  const currentAvailableBalance = totalInflows - actualCashSpent;
  const unspentAllocations = Math.max(0, totalAllocated - actualCashSpent);
  const unallocatedReserve = currentAvailableBalance - unspentAllocations;

  return {
    membershipContributions,
    externalFunding,
    donationsAndGrants,
    totalExternalAndGrants,
    totalAllocated,
    totalExpenditure,
    totalProjectInvestment,
    totalRevenue,
    totalInflows,
    currentAvailableBalance,
    unallocatedReserve,
    pendingCount,
    pendingAmount,
  };
}

export function calculateSectorFinancials(
  transactions: FinancialTransaction[],
  sectorIds: SectorId[],
): SectorFinancialComparison[] {
  return sectorIds.map((sectorId) => {
    let allocated = 0;
    let expenditure = 0;
    let projectInvestment = 0;
    let revenue = 0;
    let contributionsAttributed = 0;

    for (const tx of transactions) {
      if (tx.approvalStatus !== 'Approved' || tx.scope !== sectorId) {
        continue;
      }
      if (tx.type === 'Sector allocation') allocated += tx.amount;
      if (tx.type === 'Operational expenditure') expenditure += tx.amount;
      if (tx.type === 'Project investment') projectInvestment += tx.amount;
      if (tx.type === 'Revenue generated') revenue += tx.amount;
      if (tx.type === 'Membership contribution') contributionsAttributed += tx.amount;
    }

    const totalSpent = expenditure + projectInvestment;
    const remainingAllocation = allocated - totalSpent;
    const netPosition = allocated + revenue + contributionsAttributed - totalSpent;

    return {
      sectorId,
      allocated,
      expenditure,
      projectInvestment,
      revenue,
      contributionsAttributed,
      remainingAllocation,
      netPosition,
    };
  });
}

export interface TransactionValidationResult {
  valid: boolean;
  error?: string;
}

export function validateNewTransaction(
  input: {
    reference: string;
    amount: number;
    type: TransactionType;
    date: string;
    description: string;
    scope: 'Organisation' | SectorId;
  },
  existingTransactions: FinancialTransaction[],
): TransactionValidationResult {
  const ref = input.reference.trim().toUpperCase();
  if (!ref || ref.length < 4) {
    return {
      valid: false,
      error: 'Transaction reference must be at least 4 characters.',
    };
  }

  const duplicate = existingTransactions.some(
    (tx) => tx.reference.trim().toUpperCase() === ref,
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Duplicate transaction reference "${ref}". Financial ledger forbids duplicate references.`,
    };
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      valid: false,
      error: 'Transaction amount must be greater than zero.',
    };
  }

  if (!input.description || input.description.trim().length < 5) {
    return {
      valid: false,
      error: 'Please enter a clear transaction description (at least 5 characters).',
    };
  }

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return {
      valid: false,
      error: 'Transaction date must be in YYYY-MM-DD format.',
    };
  }

  return { valid: true };
}
