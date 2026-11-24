export type SectorId = 'agriculture' | 'piggery' | 'poultry' | 'vertical_farming';

export type RoleName =
  | 'Founder / Super Administrator'
  | 'Administrator'
  | 'Sector Manager'
  | 'Team Leader'
  | 'General Member';

export type PermissionAction = 'view' | 'create' | 'edit' | 'approve' | 'delete';

export type ResourceDomain =
  | 'organisation'
  | 'members'
  | 'finance'
  | 'projects'
  | 'sector_operations'
  | 'roles'
  | 'reports'
  | 'audit_logs';

export type RolePermissionMap = Record<RoleName, Record<ResourceDomain, PermissionAction[]>>;

export interface SectorDefinition {
  id: SectorId;
  name: string;
  shortName: string;
  description: string;
  leadTitle: string;
  focusArea: string;
}

export interface SectorAssignment {
  sectorId: SectorId;
  role: RoleName;
}

export type MembershipStatus = 'Active' | 'Inactive' | 'Suspended';
export type PaymentStatus = 'Paid' | 'Partially paid' | 'Unpaid';

export interface MemberPaymentRecord {
  id: string;
  reference: string;
  amount: number;
  date: string;
  method: string;
  recordedBy: string;
  note?: string;
}

export interface Member {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string;
  dateJoined: string;
  status: MembershipStatus;
  contributionRequirement: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
  primaryRole: RoleName;
  sectorAssignments: SectorAssignment[];
  paymentHistory: MemberPaymentRecord[];
}

export type TransactionType =
  | 'Membership contribution'
  | 'External funding'
  | 'Donation & grant'
  | 'Sector allocation'
  | 'Operational expenditure'
  | 'Project investment'
  | 'Revenue generated';

export type ApprovalStatus = 'Approved' | 'Pending' | 'Rejected';

export interface FinancialTransaction {
  id: string;
  reference: string;
  amount: number;
  type: TransactionType;
  date: string;
  description: string;
  scope: 'Organisation' | SectorId;
  projectId?: string;
  recordedBy: string;
  recordedByUserId: string;
  approvalStatus: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  immutable: true;
}

export type ProjectStatus = 'Planning' | 'Active' | 'On Hold' | 'Completed';

export interface ProjectProgressRecord {
  id: string;
  date: string;
  note: string;
  completionPercent: number;
  recordedBy: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  sectorId: SectorId;
  managerMemberId: string;
  managerName: string;
  budget: number;
  investmentReceived: number;
  expenditure: number;
  revenue: number;
  status: ProjectStatus;
  startDate: string;
  progressRecords: ProjectProgressRecord[];
}

export interface SectorOperationRecord {
  id: string;
  sectorId: SectorId;
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
  recordedBy: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
  action: string;
  resource: ResourceDomain;
  sectorScope: 'Organisation' | SectorId;
  targetId?: string;
  summary: string;
}

export interface UserAccount {
  id: string;
  memberId?: string;
  fullName: string;
  email: string;
  password?: string;
  role: RoleName;
  sectorAssignments: SectorAssignment[];
}

export interface SessionUser {
  id: string;
  memberId?: string;
  fullName: string;
  email: string;
  role: RoleName;
  sectorAssignments: SectorAssignment[];
}

export interface AppDatabaseState {
  sectors: SectorDefinition[];
  rolePermissions: RolePermissionMap;
  users: UserAccount[];
  members: Member[];
  transactions: FinancialTransaction[];
  projects: Project[];
  sectorOperations: SectorOperationRecord[];
  auditLogs: AuditLogEntry[];
}
