import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import type { FinancialSummary } from '../domain/finance';
import { ALL_SECTORS, hasPermission, SECTOR_LABELS } from '../domain/rbac';
import type {
  ApprovalStatus,
  FinancialTransaction,
  Project,
  RolePermissionMap,
  SectorId,
  SessionUser,
  TransactionType,
} from '../domain/types';
import { formatCurrency, formatDateShort } from '../utils/format';
import { Modal } from './Modal';

interface FinanceViewProps {
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  transactions: FinancialTransaction[];
  financialSummary: FinancialSummary;
  projects: Project[];
  onCreateTransaction: (payload: {
    reference: string;
    amount: number;
    type: TransactionType;
    date: string;
    description: string;
    scope: 'Organisation' | SectorId;
    projectId?: string;
  }) => Promise<void>;
  onDecideTransaction: (
    txId: string,
    decision: 'Approved' | 'Rejected',
  ) => Promise<void>;
  modalOpen: boolean;
  onSetModalOpen: (open: boolean) => void;
}

const TRANSACTION_TYPES: TransactionType[] = [
  'Membership contribution',
  'External funding',
  'Donation & grant',
  'Sector allocation',
  'Operational expenditure',
  'Project investment',
  'Revenue generated',
];

export function FinanceView({
  currentUser,
  rolePermissions,
  transactions,
  financialSummary,
  projects,
  onCreateTransaction,
  onDecideTransaction,
  modalOpen,
  onSetModalOpen,
}: FinanceViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>(
    'all',
  );
  const [scopeFilter, setScopeFilter] = useState<
    'all' | 'Organisation' | SectorId
  >('all');

  // Form state
  const [reference, setReference] = useState(
    `TXN-2026-${Math.floor(200 + Math.random() * 700)}`,
  );
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState<TransactionType>(
    'Operational expenditure',
  );
  const [date, setDate] = useState('2026-11-23');
  const [scope, setScope] = useState<'Organisation' | SectorId>('agriculture');
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canCreate = hasPermission(
    currentUser,
    rolePermissions,
    'finance',
    'create',
    'Organisation',
  );
  const canApprove = hasPermission(
    currentUser,
    rolePermissions,
    'finance',
    'approve',
    'Organisation',
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (statusFilter !== 'all' && tx.approvalStatus !== statusFilter)
        return false;
      if (scopeFilter !== 'all' && tx.scope !== scopeFilter) return false;
      if (q) {
        const hay =
          `${tx.reference} ${tx.description} ${tx.recordedBy} ${tx.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, searchQuery, typeFilter, statusFilter, scopeFilter]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onCreateTransaction({
        reference,
        amount: Number(amount),
        type: txType,
        date,
        description,
        scope,
        projectId: projectId || undefined,
      });
      setReference(`TXN-2026-${Math.floor(200 + Math.random() * 700)}`);
      setAmount('');
      setDescription('');
      setProjectId('');
      onSetModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to record transaction.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Central Financial Treasury Summary */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#5F6660]">
              <Lock className="h-3.5 w-3.5 text-[#65A30D]" />
              <span>Immutable Append-Only Ledger</span>
              <span aria-hidden="true">·</span>
              <span>Allocations tracked separately from Expenditure</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#141815]">
              Central Financial Management
            </h1>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => onSetModalOpen(true)}
              className="inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#272D28]"
            >
              <Plus className="h-3.5 w-3.5 text-[#A3E635]" />
              <span>Record Transaction</span>
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#ECEEE9] pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <div className="text-[11px] text-[#5F6660]">Available Balance</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
              {formatCurrency(financialSummary.currentAvailableBalance)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5F6660]">Contributions</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
              {formatCurrency(financialSummary.membershipContributions)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5F6660]">
              External & Grants
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
              {formatCurrency(financialSummary.totalExternalAndGrants)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5F6660]">Funds Allocated</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
              {formatCurrency(financialSummary.totalAllocated)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5F6660]">Actual Spend</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#B45309] tabular-nums">
              {formatCurrency(
                financialSummary.totalExpenditure +
                  financialSummary.totalProjectInvestment,
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5F6660]">Revenue Generated</div>
            <div className="mt-1 font-mono text-lg font-semibold text-[#3F6212] tabular-nums">
              {formatCurrency(financialSummary.totalRevenue)}
            </div>
          </div>
        </div>
      </section>

      {/* Ledger Filters & Table */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-3 border-b border-[#ECEEE9] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717972]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference or description..."
              aria-label="Search transactions"
              className="w-full rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] py-2 pl-9 pr-3 text-xs text-[#141815] focus:border-[#65A30D] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by transaction type"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as 'all' | TransactionType)
              }
              className="rounded-lg border border-[#E4E7E2] bg-white px-2.5 py-1.5 text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
            >
              <option value="all">All Types</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by scope"
              value={scopeFilter}
              onChange={(e) =>
                setScopeFilter(
                  e.target.value as 'all' | 'Organisation' | SectorId,
                )
              }
              className="rounded-lg border border-[#E4E7E2] bg-white px-2.5 py-1.5 text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
            >
              <option value="all">All Scopes</option>
              <option value="Organisation">Organisation</option>
              {ALL_SECTORS.map((sid) => (
                <option key={sid} value={sid}>
                  {SECTOR_LABELS[sid]}
                </option>
              ))}
            </select>

            <div className="inline-flex items-center gap-1 rounded-lg bg-[#F3F5F1] p-1">
              {(['all', 'Approved', 'Pending', 'Rejected'] as const).map(
                (st) => {
                  const active = statusFilter === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-white text-[#141815] shadow-xs'
                          : 'text-[#5F6660] hover:text-[#141815]'
                      }`}
                    >
                      {st === 'all' ? 'All' : st}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Description & Recorded By</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE9]">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-[#717972]"
                  >
                    No transactions match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const isOutflow =
                    tx.type === 'Operational expenditure' ||
                    tx.type === 'Project investment';
                  const isAllocation = tx.type === 'Sector allocation';

                  return (
                    <tr
                      key={tx.id}
                      className="transition-colors hover:bg-[#FAFBF9]"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-[#141815] whitespace-nowrap">
                        {tx.reference}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#5F6660] tabular-nums whitespace-nowrap">
                        {formatDateShort(tx.date)}
                      </td>
                      <td className="px-4 py-3 text-[#141815] whitespace-nowrap">
                        {tx.type}
                      </td>
                      <td className="px-4 py-3 text-[#4A524C] whitespace-nowrap">
                        {tx.scope === 'Organisation'
                          ? 'Organisation'
                          : SECTOR_LABELS[tx.scope]}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#141815]">
                          {tx.description}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#717972]">
                          Recorded by {tx.recordedBy}
                          {tx.approvedBy ? ` · Reviewed by ${tx.approvedBy}` : ''}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                          isAllocation
                            ? 'text-[#141815]'
                            : isOutflow
                              ? 'text-[#B91C1C]'
                              : 'text-[#3F6212]'
                        }`}
                      >
                        {isAllocation ? '' : isOutflow ? '-' : '+'}
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.approvalStatus === 'Approved' && (
                          <span className="inline-flex items-center gap-1 font-medium text-[#15803D]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approved</span>
                          </span>
                        )}
                        {tx.approvalStatus === 'Rejected' && (
                          <span className="inline-flex items-center gap-1 font-medium text-[#B91C1C]">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Rejected</span>
                          </span>
                        )}
                        {tx.approvalStatus === 'Pending' && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 font-medium text-[#B45309]">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Pending</span>
                            </span>
                            {canApprove && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onDecideTransaction(tx.id, 'Approved')
                                  }
                                  aria-label={`Approve ${tx.reference}`}
                                  className="rounded border border-[#84CC16] bg-[#ECFCCB] p-1 text-[#1A2E05] hover:bg-[#D9F99D]"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onDecideTransaction(tx.id, 'Rejected')
                                  }
                                  aria-label={`Reject ${tx.reference}`}
                                  className="rounded border border-[#FECACA] bg-[#FEF2F2] p-1 text-[#B91C1C] hover:bg-[#FEE2E2]"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Record Transaction Modal */}
      <Modal
        open={modalOpen}
        onClose={() => onSetModalOpen(false)}
        title="Record Financial Transaction"
        subtitle="Transactions require unique references and preserve an immutable ledger."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#B91C1C]"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="tx-ref"
                className="block text-xs font-medium text-[#141815]"
              >
                Transaction Reference
              </label>
              <input
                id="tx-ref"
                type="text"
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs uppercase focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="tx-amount"
                className="block text-xs font-medium text-[#141815]"
              >
                Amount (UGX)
              </label>
              <input
                id="tx-amount"
                type="number"
                min="1"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1500000"
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="tx-type"
                className="block text-xs font-medium text-[#141815]"
              >
                Transaction Type
              </label>
              <select
                id="tx-type"
                value={txType}
                onChange={(e) => setTxType(e.target.value as TransactionType)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs focus:border-[#65A30D] focus:outline-none"
              >
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="tx-date"
                className="block text-xs font-medium text-[#141815]"
              >
                Date
              </label>
              <input
                id="tx-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="tx-scope"
                className="block text-xs font-medium text-[#141815]"
              >
                Organisation or Sector
              </label>
              <select
                id="tx-scope"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as 'Organisation' | SectorId)
                }
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs focus:border-[#65A30D] focus:outline-none"
              >
                <option value="Organisation">Organisation (Central)</option>
                {ALL_SECTORS.map((sid) => (
                  <option key={sid} value={sid}>
                    {SECTOR_LABELS[sid]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="tx-project"
                className="block text-xs font-medium text-[#141815]"
              >
                Linked Project (optional)
              </label>
              <select
                id="tx-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs focus:border-[#65A30D] focus:outline-none"
              >
                <option value="">None</option>
                {projects
                  .filter((p) => scope === 'Organisation' || p.sectorId === scope)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="tx-desc"
              className="block text-xs font-medium text-[#141815]"
            >
              Description
            </label>
            <textarea
              id="tx-desc"
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose, vendor, or funding grant detail..."
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs focus:border-[#65A30D] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#ECEEE9] pt-4">
            <button
              type="button"
              onClick={() => onSetModalOpen(false)}
              className="rounded-lg border border-[#E4E7E2] bg-white px-4 py-2 text-xs font-medium text-[#141815] hover:bg-[#F6F7F5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] hover:bg-[#272D28] disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit to Ledger'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
