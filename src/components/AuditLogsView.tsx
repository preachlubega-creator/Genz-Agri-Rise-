import { useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { hasPermission, SECTOR_LABELS } from '../domain/rbac';
import type {
  AuditLogEntry,
  ResourceDomain,
  RolePermissionMap,
  SessionUser,
} from '../domain/types';
import { formatDateTime } from '../utils/format';

interface AuditLogsViewProps {
  currentUser: SessionUser;
  rolePermissions: RolePermissionMap;
  auditLogs: AuditLogEntry[];
}

export function AuditLogsView({
  currentUser,
  rolePermissions,
  auditLogs,
}: AuditLogsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [resourceFilter, setResourceFilter] = useState<'all' | ResourceDomain>(
    'all',
  );

  const canView = hasPermission(
    currentUser,
    rolePermissions,
    'audit_logs',
    'view',
    'Organisation',
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (resourceFilter !== 'all' && entry.resource !== resourceFilter) {
        return false;
      }
      if (q) {
        const hay =
          `${entry.actorName} ${entry.action} ${entry.summary} ${entry.actorRole}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, searchQuery, resourceFilter]);

  if (!canView) {
    return (
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-10 text-center shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <Lock className="mx-auto h-6 w-6 text-[#717972]" />
        <h1 className="mt-3 font-display text-lg font-semibold text-[#141815]">
          Audit Log Access Restricted
        </h1>
        <p className="mt-1 text-xs text-[#5F6660]">
          Your current role ({currentUser.role}) does not include audit trail
          inspection permissions.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E4E7E2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <h1 className="font-display text-2xl font-semibold text-[#141815]">
          Accountability & Audit Logs
        </h1>
        <p className="mt-1 text-xs text-[#5F6660]">
          Immutable record of administrative actions, approvals, member
          registrations, and security events
        </p>

        <div className="mt-4 flex flex-col gap-3 border-t border-[#ECEEE9] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717972]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actor, action or summary..."
              aria-label="Search audit logs"
              className="w-full rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] py-2 pl-9 pr-3 text-xs focus:border-[#65A30D] focus:bg-white focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter audit logs by module"
            value={resourceFilter}
            onChange={(e) =>
              setResourceFilter(e.target.value as 'all' | ResourceDomain)
            }
            className="rounded-lg border border-[#E4E7E2] bg-white px-3 py-1.5 text-xs font-medium text-[#141815]"
          >
            <option value="all">All Modules</option>
            <option value="finance">Finance</option>
            <option value="members">Members</option>
            <option value="projects">Projects</option>
            <option value="sector_operations">Sector Operations</option>
            <option value="roles">Roles & RBAC</option>
            <option value="reports">Reports</option>
            <option value="organisation">Authentication</option>
          </select>
        </div>
      </section>

      <section className="rounded-xl border border-[#E4E7E2] bg-white shadow-[0_1px_2px_rgba(16,24,18,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#ECEEE9] bg-[#FAFBF9] text-[11px] font-semibold text-[#5F6660]">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor & Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEE9]">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-[#FAFBF9]">
                  <td className="px-4 py-3 font-mono text-[11px] text-[#5F6660] tabular-nums whitespace-nowrap">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-[#141815]">
                      {log.actorName}
                    </div>
                    <div className="text-[11px] text-[#717972]">
                      {log.actorRole}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] font-medium text-[#141815] whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 text-[#4A524C] whitespace-nowrap">
                    {log.sectorScope === 'Organisation'
                      ? 'Organisation'
                      : SECTOR_LABELS[log.sectorScope]}
                  </td>
                  <td className="px-4 py-3 text-[#141815]">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
