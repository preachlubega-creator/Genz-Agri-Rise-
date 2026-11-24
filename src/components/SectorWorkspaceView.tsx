import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { SectorFinancialComparison } from '../domain/finance';
import {
  ALL_SECTORS,
  getEffectiveRoleForScope,
  hasPermission,
  SECTOR_LABELS,
} from '../domain/rbac';
import type {
  Member,
  Project,
  RolePermissionMap,
  SectorDefinition,
  SectorId,
  SectorOperationRecord,
  SessionUser,
} from '../domain/types';
import { formatCurrency, formatDateShort, formatNumber } from '../utils/format';
import { Modal } from './Modal';

interface SectorWorkspaceViewProps {
  sectorId: SectorId;
  onSelectSector: (sectorId: SectorId) => void;
  sectors: SectorDefinition[];
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  sectorFinancial: SectorFinancialComparison;
  members: Member[];
  projects: Project[];
  operations: SectorOperationRecord[];
  onLogOperation: (
    sectorId: SectorId,
    payload: {
      date: string;
      category: string;
      title: string;
      unitLabel: string;
      primaryQuantity: number;
      secondaryLabel?: string;
      secondaryQuantity?: number;
      operatingCost: number;
      revenueGenerated: number;
      notes: string;
    },
  ) => Promise<void>;
}

const SECTOR_CONFIG: Record<
  SectorId,
  {
    categories: string[];
    defaultUnit: string;
    defaultSecondary: string;
  }
> = {
  agriculture: {
    categories: ['Planting', 'Input Application', 'Field Maintenance', 'Harvest'],
    defaultUnit: 'kg harvested',
    defaultSecondary: 'Acres',
  },
  piggery: {
    categories: [
      'Stock Purchase',
      'Feeding Log',
      'Breeding Cycle',
      'Livestock Sale',
      'Veterinary & Ops',
    ],
    defaultUnit: 'kg feed',
    defaultSecondary: 'Active herd',
  },
  poultry: {
    categories: [
      'Flock Intake',
      'Egg Collection',
      'Feeding Log',
      'Bird & Egg Sale',
      'Health & Ops',
    ],
    defaultUnit: 'eggs collected',
    defaultSecondary: 'Trays',
  },
  vertical_farming: {
    categories: [
      'System Calibration',
      'Planting Cycle',
      'Nutrient Dosing',
      'Harvest Yield',
      'Maintenance & Ops',
    ],
    defaultUnit: 'kg harvested',
    defaultSecondary: 'Active towers',
  },
};

export function SectorWorkspaceView({
  sectorId,
  onSelectSector,
  sectors,
  currentUser,
  rolePermissions,
  sectorFinancial,
  members,
  projects,
  operations,
  onLogOperation,
}: SectorWorkspaceViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const config = SECTOR_CONFIG[sectorId];
  const [date, setDate] = useState('2026-11-23');
  const [category, setCategory] = useState(config.categories[0]);
  const [title, setTitle] = useState('');
  const [unitLabel, setUnitLabel] = useState(config.defaultUnit);
  const [primaryQty, setPrimaryQty] = useState('');
  const [secondaryLabel, setSecondaryLabel] = useState(config.defaultSecondary);
  const [secondaryQty, setSecondaryQty] = useState('');
  const [opCost, setOpCost] = useState('0');
  const [revGen, setRevGen] = useState('0');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sectorDef = sectors.find((s) => s.id === sectorId)!;
  const effectiveRole = getEffectiveRoleForScope(currentUser, sectorId);
  const canCreateOp = hasPermission(
    currentUser,
    rolePermissions,
    'sector_operations',
    'create',
    sectorId,
  );

  const sectorMembers = members.filter((m) =>
    m.sectorAssignments.some((s) => s.sectorId === sectorId),
  );
  const sectorProjects = projects.filter((p) => p.sectorId === sectorId);
  const sectorOps = operations.filter((o) => o.sectorId === sectorId);

  const filteredOps = useMemo(() => {
    if (categoryFilter === 'all') return sectorOps;
    return sectorOps.filter((o) => o.category === categoryFilter);
  }, [sectorOps, categoryFilter]);

  // Sector-tailored KPI metrics
  const sectorKpis = useMemo(() => {
    if (sectorId === 'agriculture') {
      const harvestedKg = sectorOps
        .filter((o) => o.category === 'Harvest')
        .reduce((s, o) => s + o.primaryQuantity, 0);
      const inputsKg = sectorOps
        .filter(
          (o) =>
            o.category === 'Input Application' || o.category === 'Planting',
        )
        .reduce((s, o) => s + o.primaryQuantity, 0);
      return [
        {
          label: 'Total Harvest Yield',
          value: `${formatNumber(harvestedKg)} kg`,
          sub: 'Maize & Horticulture output',
        },
        {
          label: 'Inputs & Seed Applied',
          value: `${formatNumber(inputsKg)} kg`,
          sub: 'Compost & certified seed',
        },
        {
          label: 'Remaining Allocation',
          value: formatCurrency(sectorFinancial.remainingAllocation),
          sub: `of ${formatCurrency(sectorFinancial.allocated)} allocated`,
        },
        {
          label: 'Sector Revenue',
          value: formatCurrency(sectorFinancial.revenue),
          sub: `${sectorMembers.length} active members`,
        },
      ];
    }

    if (sectorId === 'piggery') {
      const feedKg = sectorOps
        .filter((o) => o.category === 'Feeding Log')
        .reduce((s, o) => s + o.primaryQuantity, 0);
      const hogsSold = sectorOps
        .filter((o) => o.category === 'Livestock Sale')
        .reduce((s, o) => s + o.primaryQuantity, 0);
      const pigletsAdded = sectorOps
        .filter(
          (o) =>
            o.category === 'Breeding Cycle' || o.category === 'Stock Purchase',
        )
        .reduce((s, o) => s + o.primaryQuantity, 0);
      return [
        {
          label: 'Breeding & Stock Additions',
          value: `${formatNumber(pigletsAdded)} head`,
          sub: 'Litters & replacement gilts',
        },
        {
          label: 'Feed Ration Dispatched',
          value: `${formatNumber(feedKg)} kg`,
          sub: 'Grower & finisher concentrate',
        },
        {
          label: 'Finished Hogs Sold',
          value: `${formatNumber(hogsSold)} hogs`,
          sub: 'Commercial offtake',
        },
        {
          label: 'Sector Revenue',
          value: formatCurrency(sectorFinancial.revenue),
          sub: `Remaining alloc ${formatCurrency(sectorFinancial.remainingAllocation)}`,
        },
      ];
    }

    if (sectorId === 'poultry') {
      const eggsCollected = sectorOps
        .filter((o) => o.category === 'Egg Collection')
        .reduce((s, o) => s + o.primaryQuantity, 0);
      const traysSold = sectorOps
        .filter((o) => o.category === 'Bird & Egg Sale')
        .reduce((s, o) => s + o.primaryQuantity, 0);
      const feedKg = sectorOps
        .filter((o) => o.category === 'Feeding Log')
        .reduce((s, o) => s + o.primaryQuantity, 0);
      return [
        {
          label: 'Eggs Collected (Logged)',
          value: formatNumber(eggsCollected),
          sub: `${formatNumber(eggsCollected / 30)} trays equivalent`,
        },
        {
          label: 'Trays Sold',
          value: `${formatNumber(traysSold)} trays`,
          sub: 'Retail & school supply',
        },
        {
          label: 'Layer Feed Dispatched',
          value: `${formatNumber(feedKg)} kg`,
          sub: '1,200 active layers',
        },
        {
          label: 'Sector Revenue',
          value: formatCurrency(sectorFinancial.revenue),
          sub: `Remaining alloc ${formatCurrency(sectorFinancial.remainingAllocation)}`,
        },
      ];
    }

    // vertical_farming
    const harvestKg = sectorOps
      .filter((o) => o.category === 'Harvest Yield')
      .reduce((s, o) => s + o.primaryQuantity, 0);
    const nutrientL = sectorOps
      .filter((o) => o.category === 'Nutrient Dosing')
      .reduce((s, o) => s + o.primaryQuantity, 0);
    const plugs = sectorOps
      .filter((o) => o.category === 'Planting Cycle')
      .reduce((s, o) => s + o.primaryQuantity, 0);
    return [
      {
        label: 'Hydroponic Yield',
        value: `${formatNumber(harvestKg)} kg`,
        sub: 'Lettuce, basil & leafy greens',
      },
      {
        label: 'Plugs Seeded',
        value: formatNumber(plugs),
        sub: 'Rockwool propagation cycles',
      },
      {
        label: 'Nutrient Solution Dosed',
        value: `${formatNumber(nutrientL)} L`,
        sub: 'Closed-loop NFT reservoirs',
      },
      {
        label: 'Sector Revenue',
        value: formatCurrency(sectorFinancial.revenue),
        sub: `Remaining alloc ${formatCurrency(sectorFinancial.remainingAllocation)}`,
      },
    ];
  }, [sectorId, sectorOps, sectorFinancial, sectorMembers.length]);

  const openLogModal = () => {
    setCategory(config.categories[0]);
    setUnitLabel(config.defaultUnit);
    setSecondaryLabel(config.defaultSecondary);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onLogOperation(sectorId, {
        date,
        category,
        title,
        unitLabel,
        primaryQuantity: Number(primaryQty),
        secondaryLabel: secondaryLabel || undefined,
        secondaryQuantity: secondaryQty ? Number(secondaryQty) : undefined,
        operatingCost: Number(opCost) || 0,
        revenueGenerated: Number(revGen) || 0,
        notes,
      });
      setTitle('');
      setPrimaryQty('');
      setSecondaryQty('');
      setOpCost('0');
      setRevGen('0');
      setNotes('');
      setModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to log sector activity.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sector Switcher & Header */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECEEE9] pb-4">
          <div
            role="tablist"
            aria-label="Switch sector workspace"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[#F3F5F1] p-1"
          >
            {ALL_SECTORS.map((sid) => {
              const active = sid === sectorId;
              return (
                <button
                  key={sid}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setCategoryFilter('all');
                    onSelectSector(sid);
                  }}
                  className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-white text-[#141815] shadow-xs'
                      : 'text-[#5F6660] hover:text-[#141815]'
                  }`}
                >
                  {SECTOR_LABELS[sid]}
                </button>
              );
            })}
          </div>

          <span className="text-xs text-[#5F6660]">
            Your access in {sectorDef.name}:{' '}
            <strong className="font-medium text-[#141815]">
              {effectiveRole}
            </strong>
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs text-[#5F6660]">
              {sectorDef.shortName} · {sectorDef.focusArea}
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#141815]">
              {sectorDef.name} Workspace
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-[#5F6660]">
              {sectorDef.description}
            </p>
          </div>

          {canCreateOp && (
            <button
              type="button"
              onClick={openLogModal}
              className="inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#272D28]"
            >
              <Plus className="h-3.5 w-3.5 text-[#A3E635]" />
              <span>Log {sectorDef.name} Activity</span>
            </button>
          )}
        </div>

        {/* Sector-Specific KPI Strip */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-[#ECEEE9] pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {sectorKpis.map((kpi) => (
            <div key={kpi.label}>
              <div className="text-xs text-[#5F6660]">{kpi.label}</div>
              <div className="mt-1 font-display text-2xl font-semibold text-[#141815] tabular-nums">
                {kpi.value}
              </div>
              <div className="mt-0.5 text-[11px] text-[#717972]">{kpi.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Operational Records Table */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-3 border-b border-[#ECEEE9] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#141815]">
              Operational Activity Log
            </h2>
            <p className="text-xs text-[#5F6660]">
              {sectorDef.name}-specific production, inputs, and sales records
            </p>
          </div>

          <select
            aria-label="Filter operations by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-[#E4E7E2] bg-white px-3 py-1.5 text-xs font-medium text-[#141815]"
          >
            <option value="all">All Categories</option>
            {config.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Activity & Notes</th>
                <th className="px-4 py-3 text-right">Output / Volume</th>
                <th className="px-4 py-3 text-right">Operating Cost</th>
                <th className="px-4 py-3 text-right">Sales Revenue</th>
                <th className="px-4 py-3">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE9]">
              {filteredOps.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-[#717972]"
                  >
                    No operational records logged for this filter yet.
                  </td>
                </tr>
              ) : (
                filteredOps.map((op) => (
                  <tr
                    key={op.id}
                    className="transition-colors hover:bg-[#FAFBF9]"
                  >
                    <td className="px-4 py-3 font-mono text-[#5F6660] tabular-nums whitespace-nowrap">
                      {formatDateShort(op.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#141815] whitespace-nowrap">
                      {op.category}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#141815]">
                        {op.title}
                      </div>
                      {op.notes && (
                        <div className="mt-0.5 text-[11px] text-[#717972]">
                          {op.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#141815] tabular-nums whitespace-nowrap">
                      {formatNumber(op.primaryQuantity)} {op.unitLabel}
                      {op.secondaryQuantity !== undefined &&
                        op.secondaryLabel && (
                          <span className="block text-[11px] text-[#717972]">
                            {formatNumber(op.secondaryQuantity)}{' '}
                            {op.secondaryLabel}
                          </span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#B91C1C] tabular-nums whitespace-nowrap">
                      {op.operatingCost > 0
                        ? formatCurrency(op.operatingCost)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-[#3F6212] tabular-nums whitespace-nowrap">
                      {op.revenueGenerated > 0
                        ? formatCurrency(op.revenueGenerated)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#4A524C] whitespace-nowrap">
                      {op.recordedBy}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sector Projects & Assigned Members Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[#E4E7E2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
          <h2 className="text-sm font-semibold text-[#141815]">
            {sectorDef.name} Projects ({sectorProjects.length})
          </h2>
          <div className="mt-3 space-y-3">
            {sectorProjects.length === 0 ? (
              <p className="text-xs text-[#717972]">
                No projects assigned to this sector yet.
              </p>
            ) : (
              sectorProjects.map((prj) => {
                const pct =
                  prj.progressRecords[prj.progressRecords.length - 1]
                    ?.completionPercent ?? 0;
                return (
                  <div
                    key={prj.id}
                    className="rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#141815]">
                        {prj.name}
                      </span>
                      <span className="font-mono text-[#3F6212] tabular-nums">
                        {pct}% · {prj.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[#5F6660]">{prj.description}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#4A524C] tabular-nums">
                      <span>Lead: {prj.managerName}</span>
                      <span>Budget: {formatCurrency(prj.budget)}</span>
                      <span>Spent: {formatCurrency(prj.expenditure)}</span>
                      <span>Revenue: {formatCurrency(prj.revenue)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[#E4E7E2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
          <h2 className="text-sm font-semibold text-[#141815]">
            Assigned Team Members ({sectorMembers.length})
          </h2>
          <ul className="mt-3 divide-y divide-[#ECEEE9]">
            {sectorMembers.map((m) => {
              const roleInSector =
                m.sectorAssignments.find((s) => s.sectorId === sectorId)
                  ?.role ?? m.primaryRole;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <div>
                    <div className="font-medium text-[#141815]">
                      {m.fullName}
                    </div>
                    <div className="text-[11px] text-[#717972]">
                      {m.memberCode} · {m.email}
                    </div>
                  </div>
                  <span className="text-right font-medium text-[#4A524C]">
                    {roleInSector}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Log Sector Activity Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Log ${sectorDef.name} Activity`}
        subtitle="Record production, inputs, livestock/flock logs, or sector sales."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="op-category"
                className="block text-xs font-medium text-[#141815]"
              >
                Category
              </label>
              <select
                id="op-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs"
              >
                {config.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="op-date"
                className="block text-xs font-medium text-[#141815]"
              >
                Date
              </label>
              <input
                id="op-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="op-title"
              className="block text-xs font-medium text-[#141815]"
            >
              Activity Title
            </label>
            <input
              id="op-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. House A Morning Egg Collection"
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="op-qty"
                className="block text-xs font-medium text-[#141815]"
              >
                Primary Quantity
              </label>
              <input
                id="op-qty"
                type="number"
                min="0"
                step="0.1"
                required
                value={primaryQty}
                onChange={(e) => setPrimaryQty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="op-unit"
                className="block text-xs font-medium text-[#141815]"
              >
                Unit Label
              </label>
              <input
                id="op-unit"
                type="text"
                required
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="op-cost"
                className="block text-xs font-medium text-[#141815]"
              >
                Operating Cost (UGX)
              </label>
              <input
                id="op-cost"
                type="number"
                min="0"
                step="1"
                value={opCost}
                onChange={(e) => setOpCost(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="op-rev"
                className="block text-xs font-medium text-[#141815]"
              >
                Sales Revenue (UGX)
              </label>
              <input
                id="op-rev"
                type="number"
                min="0"
                step="1"
                value={revGen}
                onChange={(e) => setRevGen(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="op-notes"
              className="block text-xs font-medium text-[#141815]"
            >
              Notes
            </label>
            <textarea
              id="op-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Field observations, feed conversion, or quality notes..."
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#ECEEE9] pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-[#E4E7E2] bg-white px-4 py-2 text-xs font-medium text-[#141815]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Activity'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
