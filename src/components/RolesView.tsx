import { useEffect, useState } from 'react';
import { Check, Lock, ShieldCheck } from 'lucide-react';
import { ALL_ROLES, hasPermission } from '../domain/rbac';
import type {
  PermissionAction,
  ResourceDomain,
  RoleName,
  RolePermissionMap,
  SessionUser,
} from '../domain/types';

interface RolesViewProps {
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  onSavePermissions: (next: RolePermissionMap) => Promise<void>;
}

const RESOURCES: Array<{ id: ResourceDomain; label: string }> = [
  { id: 'organisation', label: 'Organisation' },
  { id: 'members', label: 'Members & Dues' },
  { id: 'finance', label: 'Finance Ledger' },
  { id: 'projects', label: 'Projects' },
  { id: 'sector_operations', label: 'Sector Operations' },
  { id: 'roles', label: 'Roles & RBAC' },
  { id: 'reports', label: 'Reports & Export' },
  { id: 'audit_logs', label: 'Audit Logs' },
];

const ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'approve',
  'delete',
];

export function RolesView({
  currentUser,
  rolePermissions,
  onSavePermissions,
}: RolesViewProps) {
  const [selectedRole, setSelectedRole] = useState<RoleName>('Administrator');
  const [draft, setDraft] = useState<RolePermissionMap>(() =>
    structuredClone(rolePermissions),
  );
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    setDraft(structuredClone(rolePermissions));
  }, [rolePermissions]);

  const canEditRoles = hasPermission(
    currentUser,
    rolePermissions,
    'roles',
    'edit',
    'Organisation',
  );

  const isLockedRole = selectedRole === 'Founder / Super Administrator';

  const toggleAction = (res: ResourceDomain, act: PermissionAction) => {
    if (!canEditRoles || isLockedRole) return;
    setSavedBanner(false);
    setDraft((prev) => {
      const next = structuredClone(prev);
      const currentList = next[selectedRole][res] ?? [];
      if (currentList.includes(act)) {
        next[selectedRole][res] = currentList.filter((a) => a !== act);
      } else {
        next[selectedRole][res] = [...currentList, act];
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSavePermissions(draft);
      setSavedBanner(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#5F6660]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#65A30D]" />
              <span>Backend-Enforced RBAC Policy</span>
              <span aria-hidden="true">·</span>
              <span>Sector-Scoped Overrides Supported</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold text-[#141815]">
              Roles & Permissions Matrix
            </h1>
          </div>

          {canEditRoles ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D] hover:bg-[#272D28] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving Policy...' : 'Save Permission Policy'}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#5F6660]">
              <Lock className="h-3.5 w-3.5" />
              <span>Read-only for {currentUser.role}</span>
            </span>
          )}
        </div>

        {savedBanner && (
          <div className="mt-4 rounded-lg border border-[#BEF264] bg-[#ECFCCB] px-3.5 py-2 text-xs font-medium text-[#1A2E05]">
            Role permission policy saved and enforced across backend endpoints.
          </div>
        )}

        {/* Role Selector Tabs */}
        <div
          role="tablist"
          aria-label="Select role to configure"
          className="mt-5 flex flex-wrap gap-1.5 border-t border-[#ECEEE9] pt-4"
        >
          {ALL_ROLES.map((role) => {
            const active = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedRole(role)}
                className={`whitespace-nowrap shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-[#84CC16] bg-[#ECFCCB] text-[#1A2E05]'
                    : 'border-[#E4E7E2] bg-white text-[#5F6660] hover:text-[#141815]'
                }`}
              >
                {role}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[#E4E7E2] bg-white shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="border-b border-[#ECEEE9] px-5 py-3.5">
          <div className="text-sm font-semibold text-[#141815]">
            {selectedRole}
          </div>
          <div className="text-xs text-[#5F6660]">
            {isLockedRole
              ? 'Super Administrator permissions remain locked to prevent administrative lockout.'
              : 'Configure view, create, edit, approve, and delete access per module.'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                <th className="px-5 py-3">Module / Resource</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-4 py-3 text-center capitalize">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE9]">
              {RESOURCES.map((res) => {
                const granted = draft[selectedRole]?.[res.id] ?? [];
                return (
                  <tr key={res.id} className="hover:bg-[#FAFBF9]">
                    <td className="px-5 py-3 font-medium text-[#141815]">
                      {res.label}
                    </td>
                    {ACTIONS.map((act) => {
                      const checked = granted.includes(act);
                      return (
                        <td key={act} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${selectedRole} ${res.label} ${act}`}
                            checked={checked}
                            disabled={!canEditRoles || isLockedRole}
                            onChange={() => toggleAction(res.id, act)}
                            className="h-4 w-4 rounded border-[#D4D8D0] accent-[#65A30D] disabled:opacity-60"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
