import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Search,
  UserPlus,
  AlertCircle,
} from 'lucide-react';
import {
  ALL_ROLES,
  ALL_SECTORS,
  hasPermission,
  SECTOR_LABELS,
} from '../domain/rbac';
import type {
  Member,
  PaymentStatus,
  RoleName,
  RolePermissionMap,
  SectorAssignment,
  SectorId,
  SessionUser,
} from '../domain/types';
import { formatCurrency, formatDateShort } from '../utils/format';
import { Modal } from './Modal';

interface MembersViewProps {
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  members: Member[];
  onRegisterMember: (payload: {
    fullName: string;
    email: string;
    phone: string;
    dateJoined?: string;
    contributionRequirement: number;
    initialPayment?: number;
    primaryRole: RoleName;
    sectorAssignments: SectorAssignment[];
  }) => Promise<void>;
  onRecordPayment: (
    memberId: string,
    payload: {
      amount: number;
      method: string;
      date?: string;
      reference?: string;
      note?: string;
    },
  ) => Promise<void>;
  onUpdateMember: (
    memberId: string,
    payload: {
      status?: Member['status'];
      primaryRole?: RoleName;
      sectorAssignments?: SectorAssignment[];
      contributionRequirement?: number;
    },
  ) => Promise<void>;
  registerModalOpen: boolean;
  onSetRegisterModalOpen: (open: boolean) => void;
  selectedMemberForPayment: Member | null;
  onSelectMemberForPayment: (m: Member | null) => void;
}

export function MembersView({
  currentUser,
  rolePermissions,
  members,
  onRegisterMember,
  onRecordPayment,
  onUpdateMember,
  registerModalOpen,
  onSetRegisterModalOpen,
  selectedMemberForPayment,
  onSelectMemberForPayment,
}: MembersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<'all' | SectorId>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentStatus>(
    'all',
  );

  // Register form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contributionReq, setContributionReq] = useState('450000');
  const [initialPayment, setInitialPayment] = useState('0');
  const [primaryRole, setPrimaryRole] = useState<RoleName>('General Member');
  const [selectedSectors, setSelectedSectors] = useState<
    Record<SectorId, { enabled: boolean; role: RoleName }>
  >({
    agriculture: { enabled: true, role: 'General Member' },
    piggery: { enabled: false, role: 'General Member' },
    poultry: { enabled: false, role: 'General Member' },
    vertical_farming: { enabled: false, role: 'General Member' },
  });
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Payment & profile drawer state
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Mobile Money');
  const [payRef, setPayRef] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const canCreate = hasPermission(
    currentUser,
    rolePermissions,
    'members',
    'create',
    'Organisation',
  );
  const canEdit = hasPermission(
    currentUser,
    rolePermissions,
    'members',
    'edit',
    'Organisation',
  );

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (
        sectorFilter !== 'all' &&
        !m.sectorAssignments.some((s) => s.sectorId === sectorFilter)
      ) {
        return false;
      }
      if (paymentFilter !== 'all' && m.paymentStatus !== paymentFilter) {
        return false;
      }
      if (q) {
        const hay =
          `${m.fullName} ${m.email} ${m.phone} ${m.memberCode} ${m.primaryRole}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, searchQuery, sectorFilter, paymentFilter]);

  const activeMember = selectedMemberForPayment
    ? members.find((m) => m.id === selectedMemberForPayment.id) ??
      selectedMemberForPayment
    : null;

  const totalCollected = members.reduce((s, m) => s + m.amountPaid, 0);
  const totalOutstanding = members.reduce(
    (s, m) => s + m.outstandingBalance,
    0,
  );

  const handleRegisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    const assignments: SectorAssignment[] = ALL_SECTORS.filter(
      (sid) => selectedSectors[sid].enabled,
    ).map((sid) => ({
      sectorId: sid,
      role: selectedSectors[sid].role,
    }));

    if (assignments.length === 0) {
      setRegisterError('Select at least one sector assignment.');
      return;
    }

    setSubmitting(true);
    try {
      await onRegisterMember({
        fullName,
        email,
        phone,
        contributionRequirement: Number(contributionReq),
        initialPayment: Number(initialPayment) || 0,
        primaryRole,
        sectorAssignments: assignments,
      });
      setFullName('');
      setEmail('');
      setPhone('');
      setContributionReq('450000');
      setInitialPayment('0');
      onSetRegisterModalOpen(false);
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : 'Unable to register member.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeMember) return;
    setPayError(null);
    setPaySubmitting(true);
    try {
      await onRecordPayment(activeMember.id, {
        amount: Number(payAmount),
        method: payMethod,
        reference: payRef || undefined,
        note: payNote || undefined,
      });
      setPayAmount('');
      setPayRef('');
      setPayNote('');
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : 'Failed to record payment.',
      );
    } finally {
      setPaySubmitting(false);
    }
  };

  const toggleSectorOnExistingMember = async (
    member: Member,
    sectorId: SectorId,
  ) => {
    if (!canEdit) return;
    const exists = member.sectorAssignments.some(
      (s) => s.sectorId === sectorId,
    );
    let next: SectorAssignment[];
    if (exists) {
      if (member.sectorAssignments.length <= 1) return; // keep at least 1
      next = member.sectorAssignments.filter((s) => s.sectorId !== sectorId);
    } else {
      next = [
        ...member.sectorAssignments,
        { sectorId, role: 'General Member' },
      ];
    }
    await onUpdateMember(member.id, { sectorAssignments: next });
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#141815]">
              Member Directory & Contributions
            </h1>
            <p className="mt-1 text-xs text-[#5F6660]">
              Single-profile multi-sector registry · Contribution balances and
              payment history
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => onSetRegisterModalOpen(true)}
              className="inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#272D28] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
            >
              <UserPlus className="h-3.5 w-3.5 text-[#A3E635]" />
              <span>Register Member</span>
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#ECEEE9] pt-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-[#5F6660]">Registered Members</div>
            <div className="mt-1 font-display text-xl font-semibold text-[#141815] tabular-nums">
              {members.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#5F6660]">Multi-Sector Members</div>
            <div className="mt-1 font-display text-xl font-semibold text-[#141815] tabular-nums">
              {members.filter((m) => m.sectorAssignments.length > 1).length}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#5F6660]">Total Paid</div>
            <div className="mt-1 font-display text-xl font-semibold text-[#3F6212] tabular-nums">
              {formatCurrency(totalCollected)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#5F6660]">Outstanding Dues</div>
            <div className="mt-1 font-display text-xl font-semibold text-[#B91C1C] tabular-nums">
              {formatCurrency(totalOutstanding)}
            </div>
          </div>
        </div>
      </section>

      {/* Filters & Table */}
      <section className="rounded-xl border border-[#E4E7E2] bg-white shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-3 border-b border-[#ECEEE9] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717972]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, code, email or phone..."
              aria-label="Search members"
              className="w-full rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] py-2 pl-9 pr-3 text-xs text-[#141815] placeholder:text-[#717972] focus:border-[#65A30D] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by sector"
              value={sectorFilter}
              onChange={(e) =>
                setSectorFilter(e.target.value as 'all' | SectorId)
              }
              className="rounded-lg border border-[#E4E7E2] bg-white px-3 py-1.5 text-xs font-medium text-[#141815] focus:border-[#65A30D] focus:outline-none"
            >
              <option value="all">All Sectors</option>
              {ALL_SECTORS.map((sid) => (
                <option key={sid} value={sid}>
                  {SECTOR_LABELS[sid]}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="Filter by payment status"
              className="inline-flex items-center gap-1 rounded-lg bg-[#F3F5F1] p-1"
            >
              {(['all', 'Paid', 'Partially paid', 'Unpaid'] as const).map(
                (st) => {
                  const active = paymentFilter === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPaymentFilter(st)}
                      className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-white text-[#141815] shadow-xs'
                          : 'text-[#5F6660] hover:text-[#141815]'
                      }`}
                    >
                      {st === 'all' ? 'All Statuses' : st}
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
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Assigned Sectors & Roles</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Requirement</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE9]">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-[#717972]"
                  >
                    No members match the current filters.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr
                    key={member.id}
                    className="transition-colors hover:bg-[#FAFBF9]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#141815]">
                        {member.fullName}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[#717972]">
                        {member.memberCode} · {member.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {member.sectorAssignments.map((sa) => (
                          <div
                            key={sa.sectorId}
                            className="text-[11px] text-[#4A524C]"
                          >
                            <span className="font-medium text-[#141815]">
                              {SECTOR_LABELS[sa.sectorId]}
                            </span>{' '}
                            · {sa.role}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#5F6660] tabular-nums whitespace-nowrap">
                      {formatDateShort(member.dateJoined)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#141815] tabular-nums whitespace-nowrap">
                      {formatCurrency(member.contributionRequirement)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-[#3F6212] tabular-nums whitespace-nowrap">
                      {formatCurrency(member.amountPaid)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-[#141815] tabular-nums whitespace-nowrap">
                      {formatCurrency(member.outstandingBalance)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {member.paymentStatus === 'Paid' && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#15803D]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Paid</span>
                        </span>
                      )}
                      {member.paymentStatus === 'Partially paid' && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#B45309]">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Partially paid</span>
                        </span>
                      )}
                      {member.paymentStatus === 'Unpaid' && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#B91C1C]">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>Unpaid</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectMemberForPayment(member)}
                        className="rounded-md border border-[#E4E7E2] bg-white px-2.5 py-1 text-xs font-medium text-[#141815] transition-colors hover:bg-[#ECFCCB] hover:border-[#84CC16]"
                      >
                        Profile & Dues
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Register Member Modal */}
      <Modal
        open={registerModalOpen}
        onClose={() => onSetRegisterModalOpen(false)}
        title="Register New Member"
        subtitle="Create one unified member profile and assign one or more sectors."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          {registerError && (
            <div
              role="alert"
              className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#B91C1C]"
            >
              {registerError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="reg-fullname"
                className="block text-xs font-medium text-[#141815]"
              >
                Full Name
              </label>
              <input
                id="reg-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Miriam Atieno"
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-email"
                className="block text-xs font-medium text-[#141815]"
              >
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="miriam@genzagririse.org"
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-phone"
                className="block text-xs font-medium text-[#141815]"
              >
                Phone Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 711 223 445"
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-role"
                className="block text-xs font-medium text-[#141815]"
              >
                Primary Organisational Role
              </label>
              <select
                id="reg-role"
                value={primaryRole}
                onChange={(e) => setPrimaryRole(e.target.value as RoleName)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-3 py-2 text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="reg-req"
                className="block text-xs font-medium text-[#141815]"
              >
                Contribution Requirement (UGX)
              </label>
              <input
                id="reg-req"
                type="number"
                min="0"
                step="1"
                required
                value={contributionReq}
                onChange={(e) => setContributionReq(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-init-pay"
                className="block text-xs font-medium text-[#141815]"
              >
                Initial Payment Received (UGX)
              </label>
              <input
                id="reg-init-pay"
                type="number"
                min="0"
                step="1"
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-3 py-2 font-mono text-xs text-[#141815] focus:border-[#65A30D] focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-[#ECEEE9] pt-3">
            <div className="text-xs font-semibold text-[#141815]">
              Sector Assignments & Sector-Specific Roles
            </div>
            <p className="mt-0.5 text-[11px] text-[#5F6660]">
              Members can belong to multiple sectors on one profile without
              duplication.
            </p>
            <div className="mt-2.5 space-y-2">
              {ALL_SECTORS.map((sid) => {
                const state = selectedSectors[sid];
                return (
                  <div
                    key={sid}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] px-3 py-2"
                  >
                    <label className="flex items-center gap-2 text-xs font-medium text-[#141815]">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={(e) =>
                          setSelectedSectors((prev) => ({
                            ...prev,
                            [sid]: {
                              ...prev[sid],
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-[#D4D8D0] accent-[#65A30D]"
                      />
                      <span>{SECTOR_LABELS[sid]}</span>
                    </label>
                    <select
                      aria-label={`${SECTOR_LABELS[sid]} role`}
                      disabled={!state.enabled}
                      value={state.role}
                      onChange={(e) =>
                        setSelectedSectors((prev) => ({
                          ...prev,
                          [sid]: {
                            ...prev[sid],
                            role: e.target.value as RoleName,
                          },
                        }))
                      }
                      className="rounded-md border border-[#E4E7E2] bg-white px-2 py-1 text-xs text-[#141815] disabled:opacity-40"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#ECEEE9] pt-4">
            <button
              type="button"
              onClick={() => onSetRegisterModalOpen(false)}
              className="rounded-lg border border-[#E4E7E2] bg-white px-4 py-2 text-xs font-medium text-[#141815] hover:bg-[#F6F7F5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] hover:bg-[#272D28] disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Member Profile, Payment History & Sector Update Modal */}
      <Modal
        open={Boolean(activeMember)}
        onClose={() => onSelectMemberForPayment(null)}
        title={activeMember ? activeMember.fullName : 'Member Profile'}
        subtitle={
          activeMember
            ? `${activeMember.memberCode} · ${activeMember.email} · ${activeMember.phone}`
            : ''
        }
        maxWidthClass="max-w-xl"
      >
        {activeMember && (
          <div className="space-y-5">
            {/* Contribution Summary */}
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-[#ECEEE9] bg-[#FAFBF9] p-3.5 text-xs">
              <div>
                <div className="text-[#5F6660]">Required</div>
                <div className="mt-0.5 font-mono text-base font-semibold text-[#141815] tabular-nums">
                  {formatCurrency(activeMember.contributionRequirement)}
                </div>
              </div>
              <div>
                <div className="text-[#5F6660]">Paid</div>
                <div className="mt-0.5 font-mono text-base font-semibold text-[#3F6212] tabular-nums">
                  {formatCurrency(activeMember.amountPaid)}
                </div>
              </div>
              <div>
                <div className="text-[#5F6660]">Outstanding</div>
                <div className="mt-0.5 font-mono text-base font-semibold text-[#B91C1C] tabular-nums">
                  {formatCurrency(activeMember.outstandingBalance)}
                </div>
              </div>
            </div>

            {/* Multi-Sector Membership Toggle */}
            <div>
              <div className="text-xs font-semibold text-[#141815]">
                Assigned Sectors
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_SECTORS.map((sid) => {
                  const active = activeMember.sectorAssignments.some(
                    (s) => s.sectorId === sid,
                  );
                  return (
                    <button
                      key={sid}
                      type="button"
                      disabled={!canEdit}
                      onClick={() =>
                        toggleSectorOnExistingMember(activeMember, sid)
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[#84CC16] bg-[#ECFCCB] text-[#1A2E05]'
                          : 'border-[#E4E7E2] bg-white text-[#5F6660] hover:text-[#141815]'
                      } disabled:cursor-default`}
                    >
                      {SECTOR_LABELS[sid]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Record New Payment Form */}
            {canEdit && (
              <form
                onSubmit={handlePaymentSubmit}
                className="space-y-3 rounded-lg border border-[#E4E7E2] p-4"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#141815]">
                  <CreditCard className="h-4 w-4 text-[#65A30D]" />
                  <span>Record Contribution Payment</span>
                </div>

                {payError && (
                  <div
                    role="alert"
                    className="rounded-md bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"
                  >
                    {payError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="pay-amount"
                      className="block text-[11px] font-medium text-[#5F6660]"
                    >
                      Amount (UGX)
                    </label>
                    <input
                      id="pay-amount"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={String(
                        Math.max(50000, activeMember.outstandingBalance || 150000),
                      )}
                      className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-2.5 py-1.5 font-mono text-xs focus:border-[#65A30D] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pay-method"
                      className="block text-[11px] font-medium text-[#5F6660]"
                    >
                      Method
                    </label>
                    <select
                      id="pay-method"
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#E4E7E2] bg-white px-2.5 py-1.5 text-xs focus:border-[#65A30D] focus:outline-none"
                    >
                      <option value="Mobile Money">Mobile Money</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="pay-ref"
                      className="block text-[11px] font-medium text-[#5F6660]"
                    >
                      Reference (optional)
                    </label>
                    <input
                      id="pay-ref"
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="Auto-generated"
                      className="mt-1 w-full rounded-lg border border-[#E4E7E2] px-2.5 py-1.5 font-mono text-xs focus:border-[#65A30D] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <input
                    type="text"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Payment note (optional)..."
                    aria-label="Payment note"
                    className="flex-1 rounded-lg border border-[#E4E7E2] px-2.5 py-1.5 text-xs focus:border-[#65A30D] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={paySubmitting}
                    className="whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-3.5 py-1.5 text-xs font-medium text-[#D9F99D] hover:bg-[#272D28] disabled:opacity-50"
                  >
                    {paySubmitting ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            )}

            {/* Payment History */}
            <div>
              <div className="text-xs font-semibold text-[#141815]">
                Payment History ({activeMember.paymentHistory.length})
              </div>
              {activeMember.paymentHistory.length === 0 ? (
                <p className="mt-2 text-xs text-[#717972]">
                  No contribution payments recorded yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[#ECEEE9] rounded-lg border border-[#ECEEE9]">
                  {activeMember.paymentHistory.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <div className="font-mono font-medium text-[#141815]">
                          {p.reference} · {p.method}
                        </div>
                        <div className="text-[11px] text-[#717972]">
                          {formatDateShort(p.date)} · Recorded by {p.recordedBy}
                          {p.note ? ` · ${p.note}` : ''}
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-[#3F6212] tabular-nums">
                        +{formatCurrency(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
