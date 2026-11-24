import type {
  FinancialSummary,
  SectorFinancialComparison,
} from '../domain/finance';
import type {
  AuditLogEntry,
  FinancialTransaction,
  Member,
  Project,
  RoleName,
  RolePermissionMap,
  SectorAssignment,
  SectorDefinition,
  SectorId,
  SectorOperationRecord,
  SessionUser,
  TransactionType,
} from '../domain/types';

export interface BootstrapPayload {
  user: SessionUser;
  availableAccounts: SessionUser[];
  sectors: SectorDefinition[];
  rolePermissions: RolePermissionMap;
  members: Member[];
  transactions: FinancialTransaction[];
  projects: Project[];
  sectorOperations: SectorOperationRecord[];
  auditLogs: AuditLogEntry[];
  financialSummary: FinancialSummary;
  sectorFinancials: SectorFinancialComparison[];
}

export interface SessionStatusResponse {
  authenticated: boolean;
  user: SessionUser | null;
  token?: string | null;
  availableAccounts: SessionUser[];
}

const TOKEN_KEY = 'gza_session_token';
let memoryToken: string | null = null;

function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null | undefined): void {
  if (!token) return;
  memoryToken = token;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore storage restrictions
  }
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody?.error) message = errBody.error;
    } catch {
      // ignore non-json
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const api = {
  getSession: async () => {
    const res = await apiRequest<SessionStatusResponse>('/api/auth/session');
    setStoredToken(res.token);
    return res;
  },

  login: async (email: string, password: string) => {
    const res = await apiRequest<{ user: SessionUser; token?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    setStoredToken(res.token);
    return res;
  },

  switchRole: async (userId: string) => {
    const res = await apiRequest<{ user: SessionUser; token?: string }>(
      '/api/auth/switch-role',
      {
        method: 'POST',
        body: JSON.stringify({ userId }),
      },
    );
    setStoredToken(res.token);
    return res;
  },

  logout: () =>
    apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getBootstrap: () => apiRequest<BootstrapPayload>('/api/bootstrap'),

  registerMember: (payload: {
    fullName: string;
    email: string;
    phone: string;
    dateJoined?: string;
    contributionRequirement: number;
    initialPayment?: number;
    primaryRole: RoleName;
    sectorAssignments: SectorAssignment[];
  }) =>
    apiRequest<{ member: Member }>('/api/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMember: (
    memberId: string,
    payload: {
      status?: Member['status'];
      primaryRole?: RoleName;
      sectorAssignments?: SectorAssignment[];
      contributionRequirement?: number;
    },
  ) =>
    apiRequest<{ member: Member }>(`/api/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  recordMemberPayment: (
    memberId: string,
    payload: {
      amount: number;
      method: string;
      date?: string;
      reference?: string;
      note?: string;
    },
  ) =>
    apiRequest<{ member: Member }>(`/api/members/${memberId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createTransaction: (payload: {
    reference: string;
    amount: number;
    type: TransactionType;
    date: string;
    description: string;
    scope: 'Organisation' | SectorId;
    projectId?: string;
  }) =>
    apiRequest<{ transaction: FinancialTransaction }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  decideTransaction: (
    txId: string,
    decision: 'Approved' | 'Rejected',
    reason?: string,
  ) =>
    apiRequest<{ transaction: FinancialTransaction }>(
      `/api/transactions/${txId}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, reason }),
      },
    ),

  createProject: (payload: {
    name: string;
    description: string;
    sectorId: SectorId;
    managerMemberId: string;
    budget: number;
    status?: Project['status'];
  }) =>
    apiRequest<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addProjectProgress: (
    projectId: string,
    payload: {
      note: string;
      completionPercent: number;
      status?: Project['status'];
    },
  ) =>
    apiRequest<{ project: Project }>(`/api/projects/${projectId}/progress`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logSectorOperation: (
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
  ) =>
    apiRequest<{ operation: SectorOperationRecord }>(
      `/api/sectors/${sectorId}/operations`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  updateRolePermissions: (rolePermissions: RolePermissionMap) =>
    apiRequest<{ rolePermissions: RolePermissionMap }>(
      '/api/roles/permissions',
      {
        method: 'PUT',
        body: JSON.stringify({ rolePermissions }),
      },
    ),
};
