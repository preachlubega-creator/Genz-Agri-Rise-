import { useMemo, useState, type FormEvent } from 'react';
import { FolderPlus, Plus } from 'lucide-react';
import { ALL_SECTORS, hasPermission, SECTOR_LABELS } from '../domain/rbac';
import type {
  Member,
  Project,
  ProjectStatus,
  RolePermissionMap,
  SectorId,
  SessionUser,
} from '../domain/types';
import { formatCurrency, formatDateShort } from '../utils/format';
import { Modal } from './Modal';

interface ProjectsViewProps {
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  projects: Project[];
  members: Member[];
  onCreateProject: (payload: {
    name: string;
    description: string;
    sectorId: SectorId;
    managerMemberId: string;
    budget: number;
    status?: ProjectStatus;
  }) => Promise<void>;
  onAddProgress: (
    projectId: string,
    payload: {
      note: string;
      completionPercent: number;
      status?: ProjectStatus;
    },
  ) => Promise<void>;
  newProjectModalOpen: boolean;
  onSetNewProjectModalOpen: (open: boolean) => void;
}

export function ProjectsView({
  currentUser,
  rolePermissions,
  projects,
  members,
  onCreateProject,
  onAddProgress,
  newProjectModalOpen,
  onSetNewProjectModalOpen,
}: ProjectsViewProps) {
  const [sectorFilter, setSectorFilter] = useState<'all' | SectorId>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>(
    'all',
  );

  // Create form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sectorId, setSectorId] = useState<SectorId>('agriculture');
  const [managerId, setManagerId] = useState(members[0]?.id ?? '');
  const [budget, setBudget] = useState('9500000');
  const [status, setStatus] = useState<ProjectStatus>('Planning');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Progress modal
  const [progressTarget, setProgressTarget] = useState<Project | null>(null);
  const [progressNote, setProgressNote] = useState('');
  const [progressPct, setProgressPct] = useState('50');
  const [progressStatus, setProgressStatus] = useState<ProjectStatus>('Active');
  const [progressError, setProgressError] = useState<string | null>(null);

  const canCreateAny =
    hasPermission(
      currentUser,
      rolePermissions,
      'projects',
      'create',
      'Organisation',
    ) ||
    ALL_SECTORS.some((sid) =>
      hasPermission(currentUser, rolePermissions, 'projects', 'create', sid),
    );

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (sectorFilter !== 'all' && p.sectorId !== sectorFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
  }, [projects, sectorFilter, statusFilter]);

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onCreateProject({
        name,
        description,
        sectorId,
        managerMemberId: managerId || members[0]?.id || 'mem-1',
        budget: Number(budget),
        status,
      });
      setName('');
      setDescription('');
      setBudget('9500000');
      onSetNewProjectModalOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to create project.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleProgressSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!progressTarget) return;
    setProgressError(null);
    setSubmitting(true);
    try {
      await onAddProgress(progressTarget.id, {
        note: progressNote,
        completionPercent: Number(progressPct),
        status: progressStatus,
      });
      setProgressNote('');
      setProgressTarget(null);
    } catch (err) {
      setProgressError(
        err instanceof Error ? err.message : 'Unable to update progress.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#141815]">
              Organisational Projects
            </h1>
            <p className="mt-1 text-xs text-[#5F6660]">
              Sector-assigned initiatives with budget, investment, expenditure,
              revenue, and milestone records
            </p>
          </div>

          {canCreateAny && (
            <button
              type="button"
              onClick={() => onSetNewProjectModalOpen(true)}
              className="inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-white hover:bg-[#272D28]"
            >
              <FolderPlus className="h-3.5 w-3.5 text-[#A3E635]" />
              <span>New Project</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#ECEEE9] pt-4">
          <select
            aria-label="Filter projects by sector"
            value={sectorFilter}
            onChange={(e) =>
              setSectorFilter(e.target.value as 'all' | SectorId)
            }
            className="rounded-lg border border-[#E4E7E2] bg-white px-3 py-1.5 text-xs font-medium text-[#141815]"
          >
            <option value="all">All Sectors</option>
            {ALL_SECTORS.map((sid) => (
              <option key={sid} value={sid}>
                {SECTOR_LABELS[sid]}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1 rounded-lg bg-[#F3F5F1] p-1">
            {(['all', 'Planning', 'Active', 'On Hold', 'Completed'] as const).map(
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
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {filtered.map((prj) => {
          const latest = prj.progressRecords[prj.progressRecords.length - 1];
          const pct = latest?.completionPercent ?? 0;
          const canEdit = hasPermission(
            currentUser,
            rolePermissions,
            'projects',
            'edit',
            prj.sectorId,
          );

          return (
            <article
              key={prj.id}
              className="flex flex-col justify-between rounded-xl border border-[#E4E7E2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,18,0.04)]"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#5F6660]">
                      {SECTOR_LABELS[prj.sectorId]} · Lead: {prj.managerName}
                    </div>
                    <h2 className="mt-1 font-display text-base font-semibold text-[#141815]">
                      {prj.name}
                    </h2>
                  </div>
                  <span className="shrink-0 rounded-md bg-[#F3F5F1] px-2.5 py-1 text-xs font-medium text-[#141815]">
                    {prj.status}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-[#4A524C]">
                  {prj.description}
                </p>

                {/* Metrics Grid */}
                <div className="mt-4 grid grid-cols-4 gap-2 border-y border-[#ECEEE9] py-3 text-xs tabular-nums">
                  <div>
                    <div className="text-[11px] text-[#717972]">Budget</div>
                    <div className="mt-0.5 font-mono font-semibold text-[#141815]">
                      {formatCurrency(prj.budget)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#717972]">Invested</div>
                    <div className="mt-0.5 font-mono font-semibold text-[#141815]">
                      {formatCurrency(prj.investmentReceived)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#717972]">Spent</div>
                    <div className="mt-0.5 font-mono font-semibold text-[#B45309]">
                      {formatCurrency(prj.expenditure)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#717972]">Revenue</div>
                    <div className="mt-0.5 font-mono font-semibold text-[#3F6212]">
                      {formatCurrency(prj.revenue)}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#5F6660]">Completion</span>
                    <span className="font-mono font-semibold text-[#141815] tabular-nums">
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#ECEEE9]">
                    <div
                      className="h-full rounded-full bg-[#84CC16] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Progress History */}
                <ul className="mt-3 space-y-1.5 text-xs">
                  {prj.progressRecords.slice(-2).map((rec) => (
                    <li key={rec.id} className="text-[#5F6660]">
                      <span className="font-mono text-[11px] text-[#717972]">
                        {formatDateShort(rec.date)}
                      </span>{' '}
                      · {rec.note}
                    </li>
                  ))}
                </ul>
              </div>

              {canEdit && (
                <div className="mt-4 flex justify-end border-t border-[#ECEEE9] pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProgressTarget(prj);
                      setProgressPct(String(pct));
                      setProgressStatus(prj.status);
                      setProgressError(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E4E7E2] bg-white px-3 py-1.5 text-xs font-medium text-[#141815] hover:bg-[#ECFCCB] hover:border-[#84CC16]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Log Progress</span>
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Create Project Modal */}
      <Modal
        open={newProjectModalOpen}
        onClose={() => onSetNewProjectModalOpen(false)}
        title="Create Sector Project"
        subtitle="Assign a project to one of Gen Z AgriRise's four operational sectors."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"
            >
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor="prj-name"
              className="block text-xs font-medium text-[#141815]"
            >
              Project Name
            </label>
            <input
              id="prj-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Automated Broiler Cooling Shed"
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="prj-sector"
                className="block text-xs font-medium text-[#141815]"
              >
                Assigned Sector
              </label>
              <select
                id="prj-sector"
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value as SectorId)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs"
              >
                {ALL_SECTORS.map((sid) => (
                  <option key={sid} value={sid}>
                    {SECTOR_LABELS[sid]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="prj-manager"
                className="block text-xs font-medium text-[#141815]"
              >
                Responsible Manager
              </label>
              <select
                id="prj-manager"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.primaryRole})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="prj-budget"
                className="block text-xs font-medium text-[#141815]"
              >
                Budget (UGX)
              </label>
              <input
                id="prj-budget"
                type="number"
                min="1"
                required
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="prj-status"
                className="block text-xs font-medium text-[#141815]"
              >
                Initial Status
              </label>
              <select
                id="prj-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs"
              >
                <option value="Planning">Planning</option>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="prj-desc"
              className="block text-xs font-medium text-[#141815]"
            >
              Description
            </label>
            <textarea
              id="prj-desc"
              rows={2}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, expected agricultural output, and youth roles..."
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#ECEEE9] pt-4">
            <button
              type="button"
              onClick={() => onSetNewProjectModalOpen(false)}
              className="rounded-lg border border-[#E4E7E2] bg-white px-4 py-2 text-xs font-medium text-[#141815]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Progress Update Modal */}
      <Modal
        open={Boolean(progressTarget)}
        onClose={() => setProgressTarget(null)}
        title={
          progressTarget
            ? `Update Progress — ${progressTarget.name}`
            : 'Log Progress'
        }
      >
        <form onSubmit={handleProgressSubmit} className="space-y-4">
          {progressError && (
            <div
              role="alert"
              className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"
            >
              {progressError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="prog-pct"
                className="block text-xs font-medium text-[#141815]"
              >
                Completion (%)
              </label>
              <input
                id="prog-pct"
                type="number"
                min="0"
                max="100"
                required
                value={progressPct}
                onChange={(e) => setProgressPct(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="prog-status"
                className="block text-xs font-medium text-[#141815]"
              >
                Project Status
              </label>
              <select
                id="prog-status"
                value={progressStatus}
                onChange={(e) =>
                  setProgressStatus(e.target.value as ProjectStatus)
                }
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs"
              >
                <option value="Planning">Planning</option>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor="prog-note"
              className="block text-xs font-medium text-[#141815]"
            >
              Milestone Note
            </label>
            <textarea
              id="prog-note"
              rows={2}
              required
              value={progressNote}
              onChange={(e) => setProgressNote(e.target.value)}
              placeholder="Describe completed milestone or operational status..."
              className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs"
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#ECEEE9] pt-4">
            <button
              type="button"
              onClick={() => setProgressTarget(null)}
              className="rounded-lg border border-[#E4E7E2] bg-white px-4 py-2 text-xs font-medium text-[#141815]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] disabled:opacity-50"
            >
              Save Milestone
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
