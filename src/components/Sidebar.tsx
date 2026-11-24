import { useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  ChevronDown,
  Egg,
  FolderKanban,
  Layers,
  PiggyBank,
  ShieldCheck,
  Sprout,
  Users,
  Wallet,
  Wheat,
  X,
} from 'lucide-react';
import type { SectorId, SessionUser } from '../domain/types';

export type NavView =
  | 'overview'
  | 'members'
  | 'finance'
  | 'projects'
  | 'sector:agriculture'
  | 'sector:piggery'
  | 'sector:poultry'
  | 'sector:vertical_farming'
  | 'roles'
  | 'reports'
  | 'audit';

interface SidebarProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  currentUser: SessionUser;
  availableAccounts: SessionUser[];
  onSwitchAccount: (userId: string) => void;
  sectorMemberCounts: Record<SectorId, number>;
  pendingApprovalsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeView,
  onNavigate,
  currentUser,
  availableAccounts,
  onSwitchAccount,
  sectorMemberCounts,
  pendingApprovalsCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const navGroups: Array<{
    label: string;
    items: Array<{
      id: NavView;
      label: string;
      icon: typeof BarChart3;
      count?: number;
    }>;
  }> = [
    {
      label: 'Organisation',
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'members', label: 'Members', icon: Users },
        {
          id: 'finance',
          label: 'Finance Ledger',
          icon: Wallet,
          count: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
        },
        { id: 'projects', label: 'Projects', icon: FolderKanban },
      ],
    },
    {
      label: 'Sectors',
      items: [
        {
          id: 'sector:agriculture',
          label: 'Agriculture',
          icon: Wheat,
          count: sectorMemberCounts.agriculture,
        },
        {
          id: 'sector:piggery',
          label: 'Piggery',
          icon: PiggyBank,
          count: sectorMemberCounts.piggery,
        },
        {
          id: 'sector:poultry',
          label: 'Poultry',
          icon: Egg,
          count: sectorMemberCounts.poultry,
        },
        {
          id: 'sector:vertical_farming',
          label: 'Vertical Farming',
          icon: Sprout,
          count: sectorMemberCounts.vertical_farming,
        },
      ],
    },
    {
      label: 'Administration',
      items: [
        { id: 'roles', label: 'Roles & Access', icon: ShieldCheck },
        { id: 'reports', label: 'Reports', icon: Layers },
        { id: 'audit', label: 'Audit Logs', icon: Activity },
      ],
    },
  ];

  const handleSelect = (view: NavView) => {
    onNavigate(view);
    onCloseMobile();
  };

  const initials = currentUser.fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const content = (
    <aside
      aria-label="Primary navigation"
      className="flex h-full w-[252px] shrink-0 flex-col border-r border-[#E4E7E2] bg-white"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-[#ECEEE9] px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#141815] text-[#A3E635]">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <span className="block font-display text-sm font-semibold text-[#141815] whitespace-nowrap">
              Gen Z AgriRise
            </span>
            <span className="block text-[11px] text-[#717972] whitespace-nowrap">
              Internal Admin
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5F6660] hover:bg-[#F3F5F1] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-[#717972]">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#65A30D] ${
                        isActive
                          ? 'bg-[#ECFCCB] text-[#1A2E05]'
                          : 'text-[#4A524C] hover:bg-[#F3F5F1] hover:text-[#141815]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive
                              ? 'text-[#4D7C0F]'
                              : 'text-[#717972] group-hover:text-[#141815]'
                          }`}
                        />
                        <span className="truncate whitespace-nowrap">
                          {item.label}
                        </span>
                      </span>
                      {item.count !== undefined && (
                        <span
                          className={`ml-2 text-xs tabular-nums ${
                            isActive
                              ? 'font-semibold text-[#3F6212]'
                              : 'text-[#717972]'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account & Role Switcher */}
      <div className="border-t border-[#ECEEE9] p-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            aria-expanded={switcherOpen}
            aria-label="Switch user role or account"
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] px-2.5 py-2 text-left transition-colors hover:bg-[#F3F5F1] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#141815] text-xs font-semibold text-[#D9F99D]">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[#141815]">
                  {currentUser.fullName}
                </div>
                <div className="truncate text-[11px] text-[#5F6660]">
                  {currentUser.role}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[#717972] transition-transform duration-150 ${
                switcherOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {switcherOpen && (
            <div className="absolute bottom-full left-0 right-0 z-30 mb-1.5 rounded-lg border border-[#E4E7E2] bg-white p-1.5 shadow-lg">
              <div className="px-2 py-1 text-[11px] font-medium text-[#717972]">
                Switch Active Role
              </div>
              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {availableAccounts.map((acc) => {
                  const selected = acc.id === currentUser.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setSwitcherOpen(false);
                        if (!selected) onSwitchAccount(acc.id);
                      }}
                      className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors ${
                        selected
                          ? 'bg-[#ECFCCB] text-[#1A2E05]'
                          : 'hover:bg-[#F3F5F1] text-[#141815]'
                      }`}
                    >
                      <span className="text-xs font-medium truncate">
                        {acc.fullName}
                      </span>
                      <span className="text-[11px] text-[#5F6660] truncate">
                        {acc.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block h-full">{content}</div>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#141815]/35"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
