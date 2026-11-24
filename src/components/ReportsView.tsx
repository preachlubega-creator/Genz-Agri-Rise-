import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type {
  FinancialSummary,
  SectorFinancialComparison,
} from '../domain/finance';
import { SECTOR_LABELS } from '../domain/rbac';
import type {
  FinancialTransaction,
  Member,
  Project,
  SectorOperationRecord,
} from '../domain/types';
import { formatCurrency, formatDateShort, formatNumber } from '../utils/format';

type ReportType =
  | 'overview'
  | 'membership'
  | 'contributions'
  | 'sector_finances'
  | 'projects'
  | 'funding'
  | 'production';

interface ReportsViewProps {
  financialSummary: FinancialSummary;
  sectorFinancials: SectorFinancialComparison[];
  members: Member[];
  transactions: FinancialTransaction[];
  projects: Project[];
  operations: SectorOperationRecord[];
}

const REPORT_OPTIONS: Array<{
  id: ReportType;
  label: string;
  description: string;
}> = [
  {
    id: 'overview',
    label: 'Organisational Performance',
    description: 'Executive summary of treasury balance, sectors, and ledger.',
  },
  {
    id: 'membership',
    label: 'Membership Roster',
    description: 'Active members, assigned sectors, and multi-sector roles.',
  },
  {
    id: 'contributions',
    label: 'Contributions & Dues',
    description: 'Required contributions, amount paid, and outstanding dues.',
  },
  {
    id: 'sector_finances',
    label: 'Sector Finances',
    description: 'Allocations, actual spend, revenue, and remaining balances.',
  },
  {
    id: 'projects',
    label: 'Project Expenditure',
    description: 'Budget utilization, investments, revenue, and completion %.',
  },
  {
    id: 'funding',
    label: 'Funding Allocation',
    description: 'External grants vs. sector capital earmarks and spend.',
  },
  {
    id: 'production',
    label: 'Agricultural Production',
    description: 'Harvest yields, eggs, livestock sales, and hydroponic output.',
  },
];

export function ReportsView({
  financialSummary,
  sectorFinancials,
  members,
  transactions,
  projects,
  operations,
}: ReportsViewProps) {
  const [selectedReport, setSelectedReport] = useState<ReportType>('overview');

  const handleExportCsv = () => {
    window.location.href = `/api/reports/export?type=${selectedReport}`;
  };

  const activeMeta = REPORT_OPTIONS.find((r) => r.id === selectedReport)!;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#141815]">
              Organisational Reports & Exports
            </h1>
            <p className="mt-1 text-xs text-[#5F6660]">
              Generate structured, exportable reports across membership,
              finances, allocations, and production
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#E4E7E2] bg-white px-3.5 py-2 text-xs font-medium text-[#141815] hover:bg-[#F6F7F5]"
            >
              <Printer className="h-3.5 w-3.5 text-[#5F6660]" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] hover:bg-[#272D28]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Report Template Tabs */}
        <div className="mt-5 flex flex-wrap gap-1.5 border-t border-[#ECEEE9] pt-4 print:hidden">
          {REPORT_OPTIONS.map((opt) => {
            const active = selectedReport === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedReport(opt.id)}
                className={`whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-[#84CC16] bg-[#ECFCCB] text-[#1A2E05]'
                    : 'border-[#E4E7E2] bg-white text-[#5F6660] hover:text-[#141815]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Report Preview Canvas */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="border-b border-[#ECEEE9] pb-4">
          <div className="text-xs text-[#5F6660]">
            Gen Z AgriRise · Verified Internal Report
          </div>
          <h2 className="mt-1 font-display text-lg font-semibold text-[#141815]">
            {activeMeta.label}
          </h2>
          <p className="text-xs text-[#5F6660]">{activeMeta.description}</p>
        </div>

        {(selectedReport === 'overview' || selectedReport === 'funding') && (
          <div className="mt-5 space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] p-3.5">
                <div className="text-[11px] text-[#5F6660]">
                  Available Balance
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
                  {formatCurrency(financialSummary.currentAvailableBalance)}
                </div>
              </div>
              <div className="rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] p-3.5">
                <div className="text-[11px] text-[#5F6660]">
                  External Funding & Grants
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
                  {formatCurrency(financialSummary.totalExternalAndGrants)}
                </div>
              </div>
              <div className="rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] p-3.5">
                <div className="text-[11px] text-[#5F6660]">Total Allocated</div>
                <div className="mt-1 font-mono text-lg font-semibold text-[#141815] tabular-nums">
                  {formatCurrency(financialSummary.totalAllocated)}
                </div>
              </div>
              <div className="rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] p-3.5">
                <div className="text-[11px] text-[#5F6660]">
                  Total Actual Spend
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-[#B45309] tabular-nums">
                  {formatCurrency(
                    financialSummary.totalExpenditure +
                      financialSummary.totalProjectInvestment,
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                    <th className="px-3 py-2.5">Reference</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Scope</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEEE9]">
                  {transactions.slice(0, 12).map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2.5 font-mono font-medium">
                        {t.reference}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[#5F6660] tabular-nums">
                        {formatDateShort(t.date)}
                      </td>
                      <td className="px-3 py-2.5">{t.type}</td>
                      <td className="px-3 py-2.5">
                        {t.scope === 'Organisation'
                          ? 'Organisation'
                          : SECTOR_LABELS[t.scope]}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium tabular-nums">
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="px-3 py-2.5">{t.approvalStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(selectedReport === 'membership' ||
          selectedReport === 'contributions') && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Full Name</th>
                  <th className="px-3 py-2.5">Sectors</th>
                  <th className="px-3 py-2.5 text-right">Required</th>
                  <th className="px-3 py-2.5 text-right">Paid</th>
                  <th className="px-3 py-2.5 text-right">Outstanding</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEE9]">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2.5 font-mono">{m.memberCode}</td>
                    <td className="px-3 py-2.5 font-medium">{m.fullName}</td>
                    <td className="px-3 py-2.5 text-[#5F6660]">
                      {m.sectorAssignments
                        .map((s) => SECTOR_LABELS[s.sectorId])
                        .join(', ')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(m.contributionRequirement)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#3F6212] tabular-nums">
                      {formatCurrency(m.amountPaid)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#B91C1C] tabular-nums">
                      {formatCurrency(m.outstandingBalance)}
                    </td>
                    <td className="px-3 py-2.5">{m.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedReport === 'sector_finances' && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                  <th className="px-3 py-2.5">Sector</th>
                  <th className="px-3 py-2.5 text-right">Allocated</th>
                  <th className="px-3 py-2.5 text-right">OpEx</th>
                  <th className="px-3 py-2.5 text-right">Project Inv.</th>
                  <th className="px-3 py-2.5 text-right">Remaining Alloc.</th>
                  <th className="px-3 py-2.5 text-right">Revenue</th>
                  <th className="px-3 py-2.5 text-right">Net Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEE9]">
                {sectorFinancials.map((sf) => (
                  <tr key={sf.sectorId}>
                    <td className="px-3 py-2.5 font-medium">
                      {SECTOR_LABELS[sf.sectorId]}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(sf.allocated)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(sf.expenditure)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(sf.projectInvestment)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(sf.remainingAllocation)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium text-[#3F6212] tabular-nums">
                      {formatCurrency(sf.revenue)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {formatCurrency(sf.netPosition)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedReport === 'projects' && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Sector</th>
                  <th className="px-3 py-2.5">Manager</th>
                  <th className="px-3 py-2.5 text-right">Budget</th>
                  <th className="px-3 py-2.5 text-right">Expenditure</th>
                  <th className="px-3 py-2.5 text-right">Revenue</th>
                  <th className="px-3 py-2.5 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEE9]">
                {projects.map((p) => {
                  const pct =
                    p.progressRecords[p.progressRecords.length - 1]
                      ?.completionPercent ?? 0;
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2.5 font-medium">{p.name}</td>
                      <td className="px-3 py-2.5">
                        {SECTOR_LABELS[p.sectorId]}
                      </td>
                      <td className="px-3 py-2.5">{p.managerName}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrency(p.budget)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrency(p.expenditure)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#3F6212] tabular-nums">
                        {formatCurrency(p.revenue)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedReport === 'production' && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Sector</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Activity</th>
                  <th className="px-3 py-2.5 text-right">Output</th>
                  <th className="px-3 py-2.5 text-right">Cost</th>
                  <th className="px-3 py-2.5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEE9]">
                {operations.map((op) => (
                  <tr key={op.id}>
                    <td className="px-3 py-2.5 font-mono text-[#5F6660] tabular-nums">
                      {formatDateShort(op.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      {SECTOR_LABELS[op.sectorId]}
                    </td>
                    <td className="px-3 py-2.5">{op.category}</td>
                    <td className="px-3 py-2.5 font-medium">{op.title}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatNumber(op.primaryQuantity)} {op.unitLabel}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatCurrency(op.operatingCost)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#3F6212] tabular-nums">
                      {formatCurrency(op.revenueGenerated)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
