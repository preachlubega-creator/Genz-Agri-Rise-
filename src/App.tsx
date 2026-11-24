import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Menu, Plus } from 'lucide-react';
import { api, type BootstrapPayload } from './api/client';
import { AuditLogsView } from './components/AuditLogsView';
import { FinanceView } from './components/FinanceView';
import { MembersView } from './components/MembersView';
import { OverviewDashboard } from './components/OverviewDashboard';
import { ProjectsView } from './components/ProjectsView';
import { ReportsView } from './components/ReportsView';
import { RolesView } from './components/RolesView';
import { SectorWorkspaceView } from './components/SectorWorkspaceView';
import { Sidebar, type NavView } from './components/Sidebar';
import { ALL_SECTORS, hasPermission, SECTOR_LABELS } from './domain/rbac';
import type {
  Member,
  ProjectStatus,
  RoleName,
  RolePermissionMap,
  SectorAssignment,
  SectorId,
  TransactionType,
} from './domain/types';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<NavView>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Shared modal states so Overview quick-actions open smoothly
  const [registerMemberOpen, setRegisterMemberOpen] = useState(false);
  const [selectedMemberForPayment, setSelectedMemberForPayment] =
    useState<Member | null>(null);
  const [newTxModalOpen, setNewTxModalOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3600);
  }, []);

  const loadAppData = useCallback(async () => {
    try {
      setErrorBanner(null);
      const data = await api.getBootstrap();
      setBootstrap(data);
    } catch (err) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Failed to load organisational data.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppData();
  }, [loadAppData]);

  const sectorMemberCounts = useMemo(() => {
    const counts: Record<SectorId, number> = {
      agriculture: 0,
      piggery: 0,
      poultry: 0,
      vertical_farming: 0,
    };
    if (!bootstrap) return counts;
    for (const sid of ALL_SECTORS) {
      counts[sid] = bootstrap.members.filter((m) =>
        m.sectorAssignments.some((s) => s.sectorId === sid),
      ).length;
    }
    return counts;
  }, [bootstrap]);

  const pendingApprovalsCount = useMemo(() => {
    if (!bootstrap) return 0;
    return bootstrap.transactions.filter((t) => t.approvalStatus === 'Pending')
      .length;
  }, [bootstrap]);

  const handleSwitchAccount = async (userId: string) => {
    try {
      const res = await api.switchRole(userId);
      await loadAppData();
      showToast(`Switched workspace role to ${res.user.role}.`);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to switch role.',
      );
    }
  };

  // Domain action handlers
  const handleRegisterMember = async (payload: {
    fullName: string;
    email: string;
    phone: string;
    dateJoined?: string;
    contributionRequirement: number;
    initialPayment?: number;
    primaryRole: RoleName;
    sectorAssignments: SectorAssignment[];
  }) => {
    const res = await api.registerMember(payload);
    await loadAppData();
    showToast(`Registered ${res.member.fullName} (${res.member.memberCode}).`);
  };

  const handleRecordPayment = async (
    memberId: string,
    payload: {
      amount: number;
      method: string;
      date?: string;
      reference?: string;
      note?: string;
    },
  ) => {
    const res = await api.recordMemberPayment(memberId, payload);
    await loadAppData();
    setSelectedMemberForPayment(res.member);
    showToast(
      `Recorded payment for ${res.member.fullName}. Status: ${res.member.paymentStatus}.`,
    );
  };

  const handleUpdateMember = async (
    memberId: string,
    payload: {
      status?: Member['status'];
      primaryRole?: RoleName;
      sectorAssignments?: SectorAssignment[];
      contributionRequirement?: number;
    },
  ) => {
    const res = await api.updateMember(memberId, payload);
    await loadAppData();
    setSelectedMemberForPayment(res.member);
    showToast(`Updated profile for ${res.member.fullName}.`);
  };

  const handleCreateTransaction = async (payload: {
    reference: string;
    amount: number;
    type: TransactionType;
    date: string;
    description: string;
    scope: 'Organisation' | SectorId;
    projectId?: string;
  }) => {
    const res = await api.createTransaction(payload);
    await loadAppData();
    showToast(
      `Recorded ${res.transaction.reference} (${res.transaction.approvalStatus}).`,
    );
  };

  const handleDecideTransaction = async (
    txId: string,
    decision: 'Approved' | 'Rejected',
  ) => {
    try {
      const res = await api.decideTransaction(txId, decision);
      await loadAppData();
      showToast(`${res.transaction.reference} ${decision.toLowerCase()}.`);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to process approval.',
      );
    }
  };

  const handleCreateProject = async (payload: {
    name: string;
    description: string;
    sectorId: SectorId;
    managerMemberId: string;
    budget: number;
    status?: ProjectStatus;
  }) => {
    const res = await api.createProject(payload);
    await loadAppData();
    showToast(`Created project "${res.project.name}".`);
  };

  const handleAddProgress = async (
    projectId: string,
    payload: {
      note: string;
      completionPercent: number;
      status?: ProjectStatus;
    },
  ) => {
    const res = await api.addProjectProgress(projectId, payload);
    await loadAppData();
    showToast(`Updated milestone for "${res.project.name}".`);
  };

  const handleLogOperation = async (
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
  ) => {
    const res = await api.logSectorOperation(sectorId, payload);
    await loadAppData();
    showToast(`Logged ${SECTOR_LABELS[sectorId]} activity: ${res.operation.title}.`);
  };

  const handleSavePermissions = async (next: RolePermissionMap) => {
    await api.updateRolePermissions(next);
    await loadAppData();
    showToast('Saved RBAC permission policy.');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#F6F7F5]">
        <div className="hidden w-[252px] border-r border-[#E4E7E2] bg-white lg:block" />
        <div className="flex-1 p-6 space-y-6">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-[#E4E7E2]" />
          <div className="h-44 animate-pulse rounded-xl bg-white border border-[#E4E7E2]" />
          <div className="h-72 animate-pulse rounded-xl bg-white border border-[#E4E7E2]" />
        </div>
      </div>
    );
  }

  if (!bootstrap?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F5] p-6">
        <div className="max-w-sm rounded-xl border border-[#E4E7E2] bg-white p-6 text-center shadow-xs">
          <p className="text-sm font-medium text-[#141815]">
            {errorBanner || 'Unable to connect to Gen Z AgriRise backend.'}
          </p>
          <button
            type="button"
            onClick={() => void loadAppData()}
            className="mt-4 rounded-lg bg-[#141815] px-4 py-2 text-xs font-medium text-[#D9F99D]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { user } = bootstrap;

  const breadcrumbLabel = (() => {
    if (activeView === 'overview') return 'Overview';
    if (activeView === 'members') return 'Members & Dues';
    if (activeView === 'finance') return 'Finance Ledger';
    if (activeView === 'projects') return 'Projects';
    if (activeView === 'roles') return 'Roles & Permissions';
    if (activeView === 'reports') return 'Reports & Exports';
    if (activeView === 'audit') return 'Audit Logs';
    if (activeView.startsWith('sector:')) {
      const sid = activeView.replace('sector:', '') as SectorId;
      return `Sectors / ${SECTOR_LABELS[sid]}`;
    }
    return 'Workspace';
  })();

  const canCreateTx = hasPermission(
    user,
    bootstrap.rolePermissions,
    'finance',
    'create',
    'Organisation',
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-screen overflow-hidden bg-[#F6F7F5] text-[#141815]">
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          currentUser={user}
          availableAccounts={bootstrap.availableAccounts}
          onSwitchAccount={handleSwitchAccount}
          sectorMemberCounts={sectorMemberCounts}
          pendingApprovalsCount={pendingApprovalsCount}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top Header Bar */}
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#E4E7E2] bg-white px-4 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E4E7E2] text-[#141815] hover:bg-[#F3F5F1] lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-xs font-medium text-[#5F6660] truncate"
              >
                <button
                  type="button"
                  onClick={() => setActiveView('overview')}
                  className="hover:text-[#141815] whitespace-nowrap"
                >
                  Gen Z AgriRise
                </button>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-[#141815] truncate">
                  {breadcrumbLabel}
                </span>
              </nav>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {canCreateTx && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('finance');
                    setNewTxModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#141815] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#272D28] focus-visible:outline-2 focus-visible:outline-[#65A30D]"
                >
                  <Plus className="h-3.5 w-3.5 text-[#A3E635]" />
                  <span>New Entry</span>
                </button>
              )}
            </div>
          </header>

          {/* Main Scrollable Viewport */}
          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1280px] space-y-4">
              {errorBanner && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs text-[#B91C1C]"
                >
                  <span>{errorBanner}</span>
                  <button
                    type="button"
                    onClick={() => setErrorBanner(null)}
                    className="font-semibold hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {toastMessage && (
                <div
                  role="status"
                  className="fixed bottom-4 right-4 z-40 flex max-w-sm items-center justify-between gap-3 rounded-lg border border-[#BEF264] bg-[#ECFCCB] px-4 py-2.5 text-xs font-medium text-[#1A2E05] shadow-md"
                >
                  <span>{toastMessage}</span>
                  <button
                    type="button"
                    onClick={() => setToastMessage(null)}
                    className="shrink-0 text-[11px] underline"
                  >
                    Close
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  {activeView === 'overview' && (
                    <OverviewDashboard
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      financialSummary={bootstrap.financialSummary}
                      sectorFinancials={bootstrap.sectorFinancials}
                      members={bootstrap.members}
                      transactions={bootstrap.transactions}
                      projects={bootstrap.projects}
                      auditLogs={bootstrap.auditLogs}
                      onNavigate={setActiveView}
                      onOpenNewTransaction={() => {
                        setActiveView('finance');
                        setNewTxModalOpen(true);
                      }}
                      onOpenRegisterMember={() => {
                        setActiveView('members');
                        setRegisterMemberOpen(true);
                      }}
                      onOpenNewProject={() => {
                        setActiveView('projects');
                        setNewProjectModalOpen(true);
                      }}
                      onDecideTransaction={handleDecideTransaction}
                      onOpenMemberPayment={(member) => {
                        setActiveView('members');
                        setSelectedMemberForPayment(member);
                      }}
                    />
                  )}

                  {activeView === 'members' && (
                    <MembersView
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      members={bootstrap.members}
                      onRegisterMember={handleRegisterMember}
                      onRecordPayment={handleRecordPayment}
                      onUpdateMember={handleUpdateMember}
                      registerModalOpen={registerMemberOpen}
                      onSetRegisterModalOpen={setRegisterMemberOpen}
                      selectedMemberForPayment={selectedMemberForPayment}
                      onSelectMemberForPayment={setSelectedMemberForPayment}
                    />
                  )}

                  {activeView === 'finance' && (
                    <FinanceView
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      transactions={bootstrap.transactions}
                      financialSummary={bootstrap.financialSummary}
                      projects={bootstrap.projects}
                      onCreateTransaction={handleCreateTransaction}
                      onDecideTransaction={handleDecideTransaction}
                      modalOpen={newTxModalOpen}
                      onSetModalOpen={setNewTxModalOpen}
                    />
                  )}

                  {activeView === 'projects' && (
                    <ProjectsView
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      projects={bootstrap.projects}
                      members={bootstrap.members}
                      onCreateProject={handleCreateProject}
                      onAddProgress={handleAddProgress}
                      newProjectModalOpen={newProjectModalOpen}
                      onSetNewProjectModalOpen={setNewProjectModalOpen}
                    />
                  )}

                  {activeView.startsWith('sector:') && (
                    <SectorWorkspaceView
                      sectorId={
                        activeView.replace('sector:', '') as SectorId
                      }
                      onSelectSector={(sid) =>
                        setActiveView(`sector:${sid}` as NavView)
                      }
                      sectors={bootstrap.sectors}
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      sectorFinancial={
                        bootstrap.sectorFinancials.find(
                          (sf) =>
                            sf.sectorId ===
                            (activeView.replace('sector:', '') as SectorId),
                        )!
                      }
                      members={bootstrap.members}
                      projects={bootstrap.projects}
                      operations={bootstrap.sectorOperations}
                      onLogOperation={handleLogOperation}
                    />
                  )}

                  {activeView === 'roles' && (
                    <RolesView
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      onSavePermissions={handleSavePermissions}
                    />
                  )}

                  {activeView === 'reports' && (
                    <ReportsView
                      financialSummary={bootstrap.financialSummary}
                      sectorFinancials={bootstrap.sectorFinancials}
                      members={bootstrap.members}
                      transactions={bootstrap.transactions}
                      projects={bootstrap.projects}
                      operations={bootstrap.sectorOperations}
                    />
                  )}

                  {activeView === 'audit' && (
                    <AuditLogsView
                      currentUser={user}
                      rolePermissions={bootstrap.rolePermissions}
                      auditLogs={bootstrap.auditLogs}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
