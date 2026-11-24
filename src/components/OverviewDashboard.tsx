import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  FolderPlus,
  Plus,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  FinancialSummary,
  SectorFinancialComparison,
} from '../domain/finance';
import { ALL_SECTORS, hasPermission, SECTOR_LABELS } from '../domain/rbac';
import type {
  AuditLogEntry,
  FinancialTransaction,
  Member,
  Project,
  RolePermissionMap,
  SectorId,
  SessionUser,
} from '../domain/types';
import { formatCurrency, formatDateShort, formatDateTime } from '../utils/format';
import {
  AnalyticsChart,
  type ChartMode,
  type TimeRange,
} from './AnalyticsChart';
import { AnimatedNumber } from './AnimatedNumber';
import type { NavView } from './Sidebar';

interface OverviewDashboardProps {
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  financialSummary: FinancialSummary;
  sectorFinancials: SectorFinancialComparison[];
  members: Member[];
  transactions: FinancialTransaction[];
  projects: Project[];
  auditLogs: AuditLogEntry[];
  onNavigate: (view: NavView) => void;
  onOpenNewTransaction: () => void;
  onOpenRegisterMember: () => void;
  onOpenNewProject: () => void;
  onDecideTransaction: (
    txId: string,
    decision: 'Approved' | 'Rejected',
  ) => Promise<void>;
  onOpenMemberPayment: (member: Member) => void;
}

export function OverviewDashboard({
  currentUser,
  rolePermissions,
  financialSummary,
  sectorFinancials,
  members,
  transactions,
  projects,
  auditLogs,
  onNavigate,
  onOpenNewTransaction,
  onOpenRegisterMember,
  onOpenNewProject,
  onDecideTransaction,
  onOpenMemberPayment,
}: OverviewDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('6M');
  const [chartMode, setChartMode] = useState<ChartMode>('flow');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    projects[0]?.id ?? null,
  );
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const canCreateTx = hasPermission(
    currentUser,
    rolePermissions,
    'finance',
    'create',
    'Organisation',
  );
  const canApproveTx = hasPermission(
    currentUser,
    rolePermissions,
    'finance',
    'approve',
    'Organisation',
  );
  const canCreateMember = hasPermission(
    currentUser,
    rolePermissions,
    'members',
    'create',
    'Organisation',
  );
  const canEditMember = hasPermission(
    currentUser,
    rolePermissions,
    'members',
    'edit',
    'Organisation',
  );
  const canCreateProject = hasPermission(
    currentUser,
    rolePermissions,
    'projects',
    'create',
    'Organisation',
  );

  const pendingTransactions = transactions.filter(
    (t) => t.approvalStatus === 'Pending',
  );
  const outstandingMembers = members.filter(
    (m) => m.outstandingBalance > 0 && m.status === 'Active',
  );

  const sectorMemberBreakdown = ALL_SECTORS.map((sid) => ({
    sectorId: sid,
    label: SECTOR_LABELS[sid],
    count: members.filter((m) =>
      m.sectorAssignments.some((s) => s.sectorId === sid),
    ).length,
  }));

  const handleDecision = async (
    txId: string,
    decision: 'Approved' | 'Rejected',
  ) => {
    setDecidingId(txId);
    try {
      await onDecideTransaction(txId, decision);
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Header & Primary Metric Card */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#5F6660]">
              <span className="whitespace-nowrap">Gen Z AgriRise Treasury</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">4 Active Sectors</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">FY 2026</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#141815]">
              Organisational Overview
            </h1>

            <div className="mt-4 flex flex-wrap items-baseline gap-4">
              <div>
                <div className="text-xs font-medium text-[#5F6660]">
                  Current Available Balance
                </div>
                <div className="mt-0.5 font-display text-4xl font-semibold tracking-tight text-[#141815]">
                  <AnimatedNumber
                    value={financialSummary.currentAvailableBalance}
                    formatter={formatCurrency}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:border-l sm:border-[#ECEEE9] sm:pl-4 text-xs text-[#5F6660]">
                <div>
                  <span className="block text-[11px] text-[#717972]">
                    Unallocated Reserve
                  </span>
                  <span className="font-mono font-medium text-[#141815] tabular-nums">
                    {formatCurrency(financialSummary.unallocatedReserve)}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#717972]">
                    Total Inflows
                  </span>
                  <span className="font-mono font-medium text-[#3F6212] tabular-nums">
                    {formatCurrency(financialSummary.totalInflows)}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#717972]">
                    Actual Spend
                  </span>
                  <span className="font-mono font-medium text-[#141815] tabular-nums">
                    {formatCurrency(
                      financialSummary.totalExpenditure +
                        financialSummary.totalProjectInvestment,
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Time-Range Filter & Quick Actions */}
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div
              role="group"
              aria-label="Dashboard time range"
              className="inline-flex items-center gap-1 rounded-lg bg-[#F3F5F1] p-1"
            >
              {(['30D', '90D', '6M', 'ALL'] as const).map((range) => {
                const active = timeRange === range;
                return (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setTimeRange(range)}
                    className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#65A30D] ${
                      active
                        ? 'bg-white text-[#141815] shadow-xs'
                        : 'text-[#5F6660] hover:text-[#141815]'
                    }`}
                  >
                    {range}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canCreateTx && (
                <button
                  type="button"
                  onClick={onOpenNewTransaction}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#272D28] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
                >
                  <Plus className="h-3.5 w-3.5 text-[#A3E635]" />
                  <span>Record Transaction</span>
                </button>
              )}
              {canCreateMember && (
                <button
                  type="button"
                  onClick={onOpenRegisterMember}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs font-medium text-[#141815] transition-colors hover:bg-[#F6F7F5] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
                >
                  <UserPlus className="h-3.5 w-3.5 text-[#5F6660]" />
                  <span>Register Member</span>
                </button>
              )}
              {canCreateProject && (
                <button
                  type="button"
                  onClick={onOpenNewProject}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs font-medium text-[#141815] transition-colors hover:bg-[#F6F7F5] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[#5F6660]" />
                  <span>New Project</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4-Column Organisational KPI Strip */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#ECEEE9] pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => onNavigate('members')}
            className="group rounded-lg p-2 -m-2 text-left transition-colors hover:bg-[#FAFBF9] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
          >
            <div className="flex items-center justify-between text-xs text-[#5F6660]">
              <span>Total Members</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="mt-1 font-display text-2xl font-semibold text-[#141815] tabular-nums">
              {members.length}
            </div>
            <div className="mt-1.5 text-[11px] text-[#5F6660] tabular-nums">
              {sectorMemberBreakdown
                .map((s) => `${s.label.split(' ')[0]} ${s.count}`)
                .join(' · ')}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="group rounded-lg p-2 -m-2 text-left transition-colors hover:bg-[#FAFBF9] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
          >
            <div className="flex items-center justify-between text-xs text-[#5F6660]">
              <span>Contributions & External Funding</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="mt-1 font-display text-2xl font-semibold text-[#141815]">
              <AnimatedNumber
                value={
                  financialSummary.membershipContributions +
                  financialSummary.totalExternalAndGrants
                }
                formatter={formatCurrency}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-[#5F6660] tabular-nums">
              Members {formatCurrency(financialSummary.membershipContributions)}{' '}
              · Grants {formatCurrency(financialSummary.totalExternalAndGrants)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="group rounded-lg p-2 -m-2 text-left transition-colors hover:bg-[#FAFBF9] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
          >
            <div className="flex items-center justify-between text-xs text-[#5F6660]">
              <span>Allocated vs. Expenditure</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="mt-1 font-display text-2xl font-semibold text-[#141815]">
              <AnimatedNumber
                value={financialSummary.totalAllocated}
                formatter={formatCurrency}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-[#5F6660] tabular-nums">
              Spent{' '}
              {formatCurrency(
                financialSummary.totalExpenditure +
                  financialSummary.totalProjectInvestment,
              )}{' '}
              · OpEx {formatCurrency(financialSummary.totalExpenditure)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="group rounded-lg p-2 -m-2 text-left transition-colors hover:bg-[#FAFBF9] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
          >
            <div className="flex items-center justify-between text-xs text-[#5F6660]">
              <span>Total Revenue Generated</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="mt-1 font-display text-2xl font-semibold text-[#3F6212]">
              <AnimatedNumber
                value={financialSummary.totalRevenue}
                formatter={formatCurrency}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-[#5F6660] tabular-nums">
              Across {projects.length} projects · 4 sectors
            </div>
          </button>
        </div>
      </section>

      {/* Central Interactive Analytics Visualization */}
      <AnalyticsChart
        transactions={transactions}
        sectorFinancials={sectorFinancials}
        projects={projects}
        timeRange={timeRange}
        chartMode={chartMode}
        onChangeChartMode={setChartMode}
        onSelectSector={(sectorId: SectorId) =>
          onNavigate(`sector:${sectorId}` as NavView)
        }
      />

      {/* Lower Dashboard: Activity & Project Monitoring (Left) vs Needs Attention / Action Queue (Right) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Workflow, Project Performance & Recent Activity */}
        <section className="xl:col-span-7 rounded-xl border border-[#E4E7E2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
          <div className="flex items-center justify-between border-b border-[#ECEEE9] pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-[#141815]">
                Project Execution & Activity
              </h2>
              <p className="text-xs text-[#5F6660]">
                Active sector initiatives and verified administrative log
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-[#3F6212] hover:underline whitespace-nowrap"
            >
              All projects
            </button>
          </div>

          {/* Expandable Project Progress List */}
          <div className="mt-4 space-y-2.5">
            {projects.slice(0, 4).map((proj) => {
              const latest =
                proj.progressRecords[proj.progressRecords.length - 1];
              const pct = latest?.completionPercent ?? 0;
              const isOpen = expandedProjectId === proj.id;

              return (
                <div
                  key={proj.id}
                  className="rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] transition-colors hover:border-[#D4D8D0]"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setExpandedProjectId(isOpen ? null : proj.id)
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-[#141815]">
                          {proj.name}
                        </span>
                        <span className="text-xs text-[#5F6660]">
                          {SECTOR_LABELS[proj.sectorId]} · {proj.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E4E7E2]">
                          <motion.div
                            className="h-full rounded-full bg-[#84CC16]"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{
                              duration: 0.45,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          />
                        </div>
                        <span className="w-9 text-right font-mono text-xs font-medium text-[#141815] tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#717972] transition-transform duration-150 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-[#ECEEE9] px-4 py-3 text-xs text-[#4A524C] space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                        <span>Manager: {proj.managerName}</span>
                        <span>
                          Budget {formatCurrency(proj.budget)} · Spent{' '}
                          {formatCurrency(proj.expenditure)} · Revenue{' '}
                          <strong className="text-[#3F6212]">
                            {formatCurrency(proj.revenue)}
                          </strong>
                        </span>
                      </div>
                      {latest && (
                        <p className="text-[#5F6660]">
                          Latest milestone ({formatDateShort(latest.date)}):{' '}
                          {latest.note}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recent Audit Activity */}
          <div className="mt-6 border-t border-[#ECEEE9] pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#141815]">
                Recent Organisational Activity
              </h3>
              {auditLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('audit')}
                  className="text-xs font-medium text-[#5F6660] hover:text-[#141815]"
                >
                  View audit trail
                </button>
              )}
            </div>
            {auditLogs.length === 0 ? (
              <p className="mt-3 text-xs text-[#717972]">
                Audit trail visibility is restricted for your current role.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#ECEEE9]">
                {auditLogs.slice(0, 4).map((log) => (
                  <li
                    key={log.id}
                    className="flex items-start justify-between gap-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-[#141815]">{log.summary}</p>
                      <p className="mt-0.5 text-[11px] text-[#717972]">
                        {log.actorName} · {log.actorRole}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-[#717972] tabular-nums">
                      {formatDateTime(log.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Right: Needs Attention / Action Queue */}
        <section className="xl:col-span-5 rounded-xl border border-[#E4E7E2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
          <div className="flex items-center justify-between border-b border-[#ECEEE9] pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-[#141815]">
                Needs Attention
              </h2>
              <p className="text-xs text-[#5F6660]">
                Pending financial approvals & overdue member dues
              </p>
            </div>
            <span className="font-mono text-xs font-medium text-[#5F6660] tabular-nums">
              {pendingTransactions.length + outstandingMembers.length} items
            </span>
          </div>

          {/* Pending Approvals */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[#141815]">
              <span>Financial Approval Queue</span>
              <span className="font-mono text-[#B45309] tabular-nums">
                {pendingTransactions.length} pending
              </span>
            </div>

            {pendingTransactions.length === 0 ? (
              <div className="mt-2 rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] px-3.5 py-3 text-xs text-[#5F6660]">
                All submitted transactions have been reviewed.
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                {pendingTransactions.slice(0, 4).map((tx) => (
                  <div
                    key={tx.id}
                    className="rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#141815]">
                            {tx.reference}
                          </span>
                          <span className="text-[#5F6660]">
                            {tx.scope === 'Organisation'
                              ? 'Organisation'
                              : SECTOR_LABELS[tx.scope]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-[#141815]">
                          {tx.description}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#717972]">
                          {tx.type} · Recorded by {tx.recordedBy} ·{' '}
                          {formatDateShort(tx.date)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-sm font-semibold text-[#141815] tabular-nums">
                          {formatCurrency(tx.amount)}
                        </div>
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#B45309]">
                          <Clock className="h-3 w-3" />
                          <span>Pending</span>
                        </div>
                      </div>
                    </div>

                    {canApproveTx ? (
                      <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#ECEEE9] pt-2.5">
                        <button
                          type="button"
                          disabled={decidingId === tx.id}
                          onClick={() => handleDecision(tx.id, 'Rejected')}
                          aria-label={`Reject ${tx.reference}`}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E4E7E2] bg-white px-2.5 py-1 text-xs font-medium text-[#B91C1C] transition-colors hover:bg-[#FEF2F2] disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          <span>Reject</span>
                        </button>
                        <button
                          type="button"
                          disabled={decidingId === tx.id}
                          onClick={() => handleDecision(tx.id, 'Approved')}
                          aria-label={`Approve ${tx.reference}`}
                          className="inline-flex items-center gap-1 rounded-md bg-[#141815] px-2.5 py-1 text-xs font-medium text-[#D9F99D] transition-colors hover:bg-[#272D28] disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          <span>Approve</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2.5 border-t border-[#ECEEE9] pt-2 text-[11px] text-[#717972]">
                        Requires Administrator or Founder approval
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding Member Contributions */}
          <div className="mt-6 border-t border-[#ECEEE9] pt-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[#141815]">
              <span>Outstanding Member Contributions</span>
              <button
                type="button"
                onClick={() => onNavigate('members')}
                className="font-medium text-[#3F6212] hover:underline"
              >
                Manage dues
              </button>
            </div>

            {outstandingMembers.length === 0 ? (
              <p className="mt-2 text-xs text-[#5F6660]">
                All active members are paid in full.
              </p>
            ) : (
              <ul className="mt-2.5 divide-y divide-[#ECEEE9]">
                {outstandingMembers.slice(0, 4).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#141815] truncate">
                        {m.fullName}
                      </div>
                      <div className="text-[11px] text-[#5F6660]">
                        {m.paymentStatus} ·{' '}
                        {m.sectorAssignments
                          .map((s) => SECTOR_LABELS[s.sectorId])
                          .join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono font-semibold text-[#B91C1C] tabular-nums">
                        {formatCurrency(m.outstandingBalance)}
                      </span>
                      {canEditMember && (
                        <button
                          type="button"
                          onClick={() => onOpenMemberPayment(m)}
                          aria-label={`Record payment for ${m.fullName}`}
                          className="rounded-md border border-[#E4E7E2] bg-white px-2.5 py-1 text-[11px] font-medium text-[#141815] transition-colors hover:bg-[#ECFCCB] hover:border-[#84CC16]"
                        >
                          Record Payment
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
