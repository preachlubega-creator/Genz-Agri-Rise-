import { Router } from 'express';
import {
  ALL_SECTORS,
  hasPermission,
  SECTOR_LABELS,
} from '../src/domain/rbac';
import {
  calculateFinancialSummary,
  calculateSectorFinancials,
  requiresApproval,
  validateNewTransaction,
} from '../src/domain/finance';
import {
  deriveMemberPaymentState,
  validateNewMemberInput,
} from '../src/domain/members';
import type {
  FinancialTransaction,
  Member,
  MemberPaymentRecord,
  Project,
  RoleName,
  RolePermissionMap,
  SectorAssignment,
  SectorId,
  SectorOperationRecord,
  TransactionType,
} from '../src/domain/types';
import {
  clearSessionCookie,
  requireAuth,
  resolveSessionUser,
  sanitizeUser,
  setSessionCookie,
  type AuthenticatedRequest,
} from './auth';
import { appendAuditLog, readDatabase, writeDatabase } from './store';

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/auth/session', (req, res) => {
    const user = resolveSessionUser(req, res, true);
    const db = readDatabase();
    res.json({
      authenticated: Boolean(user),
      user,
      token: user ? setSessionCookie(res, user.id) : null,
      availableAccounts: db.users.map(sanitizeUser),
    });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const db = readDatabase();
    const account = db.users.find(
      (u) =>
        u.email.toLowerCase() === email.trim().toLowerCase() &&
        u.password === password,
    );
    if (!account) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    const sessionUser = sanitizeUser(account);
    const token = setSessionCookie(res, account.id);
    appendAuditLog(db, sessionUser, {
      action: 'USER_SIGNED_IN',
      resource: 'organisation',
      sectorScope: 'Organisation',
      targetId: account.id,
      summary: `${sessionUser.fullName} signed in as ${sessionUser.role}.`,
    });
    writeDatabase(db);
    res.json({ user: sessionUser, token });
  });

  router.post('/auth/switch-role', (req, res) => {
    const { userId } = req.body as { userId?: string };
    const db = readDatabase();
    const account = db.users.find((u) => u.id === userId);
    if (!account) {
      res.status(404).json({ error: 'Selected account was not found.' });
      return;
    }
    const sessionUser = sanitizeUser(account);
    const token = setSessionCookie(res, account.id);
    appendAuditLog(db, sessionUser, {
      action: 'SESSION_ROLE_SWITCHED',
      resource: 'roles',
      sectorScope: 'Organisation',
      targetId: account.id,
      summary: `Switched active workspace persona to ${sessionUser.fullName} (${sessionUser.role}).`,
    });
    writeDatabase(db);
    res.json({ user: sessionUser, token });
  });

  router.post('/auth/logout', (req, res) => {
    const current = resolveSessionUser(req, res, false);
    if (current) {
      const db = readDatabase();
      appendAuditLog(db, current, {
        action: 'USER_SIGNED_OUT',
        resource: 'organisation',
        sectorScope: 'Organisation',
        targetId: current.id,
        summary: `${current.fullName} signed out.`,
      });
      writeDatabase(db);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Bootstrap full state respecting RBAC visibility
  router.get('/bootstrap', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.sessionUser!;
    const db = readDatabase();

    const canViewFinance = hasPermission(
      user,
      db.rolePermissions,
      'finance',
      'view',
      'Organisation',
    );
    const canViewAudit = hasPermission(
      user,
      db.rolePermissions,
      'audit_logs',
      'view',
      'Organisation',
    );

    const visibleTransactions = canViewFinance
      ? db.transactions
      : db.transactions.filter((tx) =>
          tx.scope !== 'Organisation' &&
          hasPermission(user, db.rolePermissions, 'finance', 'view', tx.scope),
        );

    const financialSummary = calculateFinancialSummary(db.transactions);
    const sectorFinancials = calculateSectorFinancials(
      db.transactions,
      ALL_SECTORS,
    );

    res.json({
      user,
      availableAccounts: db.users.map(sanitizeUser),
      sectors: db.sectors,
      rolePermissions: db.rolePermissions,
      members: db.members,
      transactions: visibleTransactions,
      projects: db.projects,
      sectorOperations: db.sectorOperations,
      auditLogs: canViewAudit ? db.auditLogs : [],
      financialSummary,
      sectorFinancials,
    });
  });

  // Members
  router.post('/members', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.sessionUser!;
    const db = readDatabase();

    const body = req.body as {
      fullName: string;
      email: string;
      phone: string;
      dateJoined?: string;
      status?: 'Active' | 'Inactive' | 'Suspended';
      contributionRequirement: number;
      initialPayment?: number;
      primaryRole: RoleName;
      sectorAssignments: SectorAssignment[];
    };

    const targetScope =
      body.sectorAssignments?.[0]?.sectorId ?? 'Organisation';
    const allowed =
      hasPermission(user, db.rolePermissions, 'members', 'create', 'Organisation') ||
      hasPermission(user, db.rolePermissions, 'members', 'create', targetScope);

    if (!allowed) {
      res.status(403).json({
        error: `Permission denied: ${user.role} cannot register new members.`,
      });
      return;
    }

    const validation = validateNewMemberInput(
      {
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        contributionRequirement: Number(body.contributionRequirement),
        sectorAssignments: body.sectorAssignments,
      },
      db.members,
    );

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const nextNum = db.members.length + 1;
    const memberCode = `GZA-${String(nextNum).padStart(3, '0')}`;
    const joinedDate =
      body.dateJoined && /^\d{4}-\d{2}-\d{2}$/.test(body.dateJoined)
        ? body.dateJoined
        : new Date().toISOString().slice(0, 10);

    const paymentHistory: MemberPaymentRecord[] = [];
    const initialPay = Number(body.initialPayment ?? 0);
    if (Number.isFinite(initialPay) && initialPay > 0) {
      const payRef = `PAY-${new Date().getFullYear()}-${String(
        Date.now(),
      ).slice(-4)}`;
      paymentHistory.push({
        id: `pay-${Date.now()}`,
        reference: payRef,
        amount: initialPay,
        date: joinedDate,
        method: 'Bank Transfer',
        recordedBy: user.fullName,
        note: 'Initial registration contribution',
      });

      const txRef = `TXN-${new Date().getFullYear()}-${String(
        db.transactions.length + 101,
      )}`;
      db.transactions.unshift({
        id: `tx-${Date.now()}`,
        reference: txRef,
        amount: initialPay,
        type: 'Membership contribution',
        date: joinedDate,
        description: `Initial membership contribution — ${body.fullName.trim()} (${memberCode})`,
        scope: 'Organisation',
        recordedBy: user.fullName,
        recordedByUserId: user.id,
        approvalStatus: 'Approved',
        approvedBy: user.fullName,
        approvedAt: new Date().toISOString(),
        immutable: true,
      });
    }

    const paymentState = deriveMemberPaymentState(
      Number(body.contributionRequirement),
      paymentHistory,
    );

    const newMember: Member = {
      id: `mem-${Date.now()}`,
      memberCode,
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone.trim(),
      dateJoined: joinedDate,
      status: body.status ?? 'Active',
      contributionRequirement: Number(body.contributionRequirement),
      ...paymentState,
      primaryRole: body.primaryRole || 'General Member',
      sectorAssignments: body.sectorAssignments,
      paymentHistory,
    };

    db.members.unshift(newMember);
    appendAuditLog(db, user, {
      action: 'MEMBER_REGISTERED',
      resource: 'members',
      sectorScope: 'Organisation',
      targetId: newMember.id,
      summary: `Registered member ${newMember.fullName} (${newMember.memberCode}) across ${newMember.sectorAssignments.map((s) => SECTOR_LABELS[s.sectorId]).join(', ')}.`,
    });
    writeDatabase(db);
    res.status(201).json({ member: newMember });
  });

  router.patch('/members/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.sessionUser!;
    const db = readDatabase();
    const member = db.members.find((m) => m.id === req.params.id);
    if (!member) {
      res.status(404).json({ error: 'Member not found.' });
      return;
    }

    const allowed = hasPermission(
      user,
      db.rolePermissions,
      'members',
      'edit',
      'Organisation',
    );
    if (!allowed) {
      res.status(403).json({
        error: `Permission denied: ${user.role} cannot edit member profiles.`,
      });
      return;
    }

    const { status, primaryRole, sectorAssignments, contributionRequirement } =
      req.body as {
        status?: Member['status'];
        primaryRole?: RoleName;
        sectorAssignments?: SectorAssignment[];
        contributionRequirement?: number;
      };

    if (sectorAssignments && sectorAssignments.length > 0) {
      const unique = new Set(sectorAssignments.map((s) => s.sectorId));
      if (unique.size !== sectorAssignments.length) {
        res.status(400).json({ error: 'Duplicate sector assignment rejected.' });
        return;
      }
      member.sectorAssignments = sectorAssignments;
    }
    if (status) member.status = status;
    if (primaryRole) member.primaryRole = primaryRole;
    if (
      contributionRequirement !== undefined &&
      Number.isFinite(Number(contributionRequirement)) &&
      Number(contributionRequirement) >= 0
    ) {
      member.contributionRequirement = Number(contributionRequirement);
      const state = deriveMemberPaymentState(
        member.contributionRequirement,
        member.paymentHistory,
      );
      member.amountPaid = state.amountPaid;
      member.outstandingBalance = state.outstandingBalance;
      member.paymentStatus = state.paymentStatus;
    }

    appendAuditLog(db, user, {
      action: 'MEMBER_UPDATED',
      resource: 'members',
      sectorScope: 'Organisation',
      targetId: member.id,
      summary: `Updated profile & sector assignments for ${member.fullName} (${member.memberCode}).`,
    });
    writeDatabase(db);
    res.json({ member });
  });

  router.post(
    '/members/:id/payments',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();
      const member = db.members.find((m) => m.id === req.params.id);
      if (!member) {
        res.status(404).json({ error: 'Member not found.' });
        return;
      }

      if (
        !hasPermission(
          user,
          db.rolePermissions,
          'members',
          'edit',
          'Organisation',
        )
      ) {
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot record member payments.`,
        });
        return;
      }

      const { amount, method, date, reference, note } = req.body as {
        amount: number;
        method: string;
        date?: string;
        reference?: string;
        note?: string;
      };

      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        res.status(400).json({ error: 'Payment amount must be greater than zero.' });
        return;
      }

      const payDate =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Date().toISOString().slice(0, 10);
      const payRef =
        reference?.trim().toUpperCase() ||
        `PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

      const duplicatePayRef = db.members.some((m) =>
        m.paymentHistory.some(
          (p) => p.reference.toUpperCase() === payRef,
        ),
      );
      if (duplicatePayRef) {
        res.status(400).json({
          error: `Duplicate payment reference "${payRef}" is not allowed.`,
        });
        return;
      }

      const paymentRecord: MemberPaymentRecord = {
        id: `pay-${Date.now()}`,
        reference: payRef,
        amount: numericAmount,
        date: payDate,
        method: method || 'Mobile Money',
        recordedBy: user.fullName,
        note: note?.trim(),
      };

      member.paymentHistory.unshift(paymentRecord);
      const paymentState = deriveMemberPaymentState(
        member.contributionRequirement,
        member.paymentHistory,
      );
      member.amountPaid = paymentState.amountPaid;
      member.outstandingBalance = paymentState.outstandingBalance;
      member.paymentStatus = paymentState.paymentStatus;

      // Also append immutable contribution transaction to central ledger
      const txRef = `TXN-${new Date().getFullYear()}-${String(
        db.transactions.length + 101,
      )}-${String(Date.now()).slice(-2)}`;

      db.transactions.unshift({
        id: `tx-${Date.now()}`,
        reference: txRef,
        amount: numericAmount,
        type: 'Membership contribution',
        date: payDate,
        description: `Membership contribution payment (${payRef}) — ${member.fullName} (${member.memberCode})`,
        scope: 'Organisation',
        recordedBy: user.fullName,
        recordedByUserId: user.id,
        approvalStatus: 'Approved',
        approvedBy: user.fullName,
        approvedAt: new Date().toISOString(),
        immutable: true,
      });

      appendAuditLog(db, user, {
        action: 'MEMBER_PAYMENT_RECORDED',
        resource: 'members',
        sectorScope: 'Organisation',
        targetId: member.id,
        summary: `Recorded UGX ${Math.round(numericAmount).toLocaleString('en-US')} contribution payment (${payRef}) for ${member.fullName}. New status: ${member.paymentStatus}.`,
      });

      writeDatabase(db);
      res.status(201).json({ member });
    },
  );

  // Finance Ledger
  router.post(
    '/transactions',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();

      const body = req.body as {
        reference: string;
        amount: number;
        type: TransactionType;
        date: string;
        description: string;
        scope: 'Organisation' | SectorId;
        projectId?: string;
      };

      if (
        !hasPermission(user, db.rolePermissions, 'finance', 'create', body.scope)
      ) {
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot record financial transactions for ${body.scope}.`,
        });
        return;
      }

      const validation = validateNewTransaction(
        {
          reference: body.reference,
          amount: Number(body.amount),
          type: body.type,
          date: body.date,
          description: body.description,
          scope: body.scope,
        },
        db.transactions,
      );

      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const needsApproval = requiresApproval(body.type);
      const canAutoApprove =
        !needsApproval ||
        (user.role === 'Founder / Super Administrator' && !needsApproval);

      const newTx: FinancialTransaction = {
        id: `tx-${Date.now()}`,
        reference: body.reference.trim().toUpperCase(),
        amount: Number(body.amount),
        type: body.type,
        date: body.date,
        description: body.description.trim(),
        scope: body.scope,
        projectId: body.projectId || undefined,
        recordedBy: user.fullName,
        recordedByUserId: user.id,
        approvalStatus: canAutoApprove ? 'Approved' : 'Pending',
        approvedBy: canAutoApprove ? user.fullName : undefined,
        approvedAt: canAutoApprove ? new Date().toISOString() : undefined,
        immutable: true,
      };

      db.transactions.unshift(newTx);

      // Update linked project financials immediately if auto-approved
      if (newTx.approvalStatus === 'Approved' && newTx.projectId) {
        const proj = db.projects.find((p) => p.id === newTx.projectId);
        if (proj) {
          if (newTx.type === 'Project investment') {
            proj.investmentReceived += newTx.amount;
          } else if (newTx.type === 'Operational expenditure') {
            proj.expenditure += newTx.amount;
          } else if (newTx.type === 'Revenue generated') {
            proj.revenue += newTx.amount;
          }
        }
      }

      appendAuditLog(db, user, {
        action:
          newTx.approvalStatus === 'Pending'
            ? 'TRANSACTION_SUBMITTED'
            : 'TRANSACTION_RECORDED',
        resource: 'finance',
        sectorScope: newTx.scope,
        targetId: newTx.id,
        summary: `Recorded ${newTx.type} ${newTx.reference} (UGX ${Math.round(newTx.amount).toLocaleString('en-US')}) in ${newTx.scope === 'Organisation' ? 'Organisation' : SECTOR_LABELS[newTx.scope]} [${newTx.approvalStatus}].`,
      });

      writeDatabase(db);
      res.status(201).json({ transaction: newTx });
    },
  );

  router.post(
    '/transactions/:id/decision',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) {
        res.status(404).json({ error: 'Transaction not found.' });
        return;
      }

      if (
        !hasPermission(
          user,
          db.rolePermissions,
          'finance',
          'approve',
          'Organisation',
        )
      ) {
        appendAuditLog(db, user, {
          action: 'UNAUTHORIZED_APPROVAL_ATTEMPT',
          resource: 'finance',
          sectorScope: tx.scope,
          targetId: tx.id,
          summary: `${user.fullName} (${user.role}) attempted unauthorized approval on ${tx.reference}.`,
        });
        writeDatabase(db);
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot approve or reject financial transactions.`,
        });
        return;
      }

      if (tx.approvalStatus !== 'Pending') {
        res.status(400).json({
          error: `Transaction ${tx.reference} is already ${tx.approvalStatus} and cannot be altered.`,
        });
        return;
      }

      const { decision, reason } = req.body as {
        decision: 'Approved' | 'Rejected';
        reason?: string;
      };
      if (decision !== 'Approved' && decision !== 'Rejected') {
        res.status(400).json({ error: 'Decision must be Approved or Rejected.' });
        return;
      }

      tx.approvalStatus = decision;
      tx.approvedBy = user.fullName;
      tx.approvedAt = new Date().toISOString();
      if (decision === 'Rejected' && reason) {
        tx.rejectionReason = reason.trim();
      }

      if (decision === 'Approved' && tx.projectId) {
        const proj = db.projects.find((p) => p.id === tx.projectId);
        if (proj) {
          if (tx.type === 'Project investment') {
            proj.investmentReceived += tx.amount;
          } else if (tx.type === 'Operational expenditure') {
            proj.expenditure += tx.amount;
          } else if (tx.type === 'Revenue generated') {
            proj.revenue += tx.amount;
          }
        }
      }

      appendAuditLog(db, user, {
        action:
          decision === 'Approved'
            ? 'TRANSACTION_APPROVED'
            : 'TRANSACTION_REJECTED',
        resource: 'finance',
        sectorScope: tx.scope,
        targetId: tx.id,
        summary: `${decision} ${tx.type} ${tx.reference} (UGX ${Math.round(tx.amount).toLocaleString('en-US')}).`,
      });

      writeDatabase(db);
      res.json({ transaction: tx });
    },
  );

  // Projects
  router.post('/projects', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.sessionUser!;
    const db = readDatabase();
    const body = req.body as {
      name: string;
      description: string;
      sectorId: SectorId;
      managerMemberId: string;
      budget: number;
      status?: Project['status'];
    };

    if (
      !hasPermission(
        user,
        db.rolePermissions,
        'projects',
        'create',
        body.sectorId,
      )
    ) {
      res.status(403).json({
        error: `Permission denied: ${user.role} cannot create projects in ${SECTOR_LABELS[body.sectorId]}.`,
      });
      return;
    }

    if (!body.name || body.name.trim().length < 3) {
      res.status(400).json({ error: 'Project name must be at least 3 characters.' });
      return;
    }
    if (!Number.isFinite(Number(body.budget)) || Number(body.budget) <= 0) {
      res.status(400).json({ error: 'Project budget must be greater than zero.' });
      return;
    }

    const manager = db.members.find((m) => m.id === body.managerMemberId);
    const project: Project = {
      id: `prj-${Date.now()}`,
      name: body.name.trim(),
      description: body.description?.trim() || 'Sector operational initiative.',
      sectorId: body.sectorId,
      managerMemberId: manager?.id || user.memberId || 'mem-1',
      managerName: manager?.fullName || user.fullName,
      budget: Number(body.budget),
      investmentReceived: 0,
      expenditure: 0,
      revenue: 0,
      status: body.status || 'Planning',
      startDate: new Date().toISOString().slice(0, 10),
      progressRecords: [
        {
          id: `prg-${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          note: 'Project charter created and assigned to sector workspace.',
          completionPercent: 10,
          recordedBy: user.fullName,
        },
      ],
    };

    db.projects.unshift(project);
    appendAuditLog(db, user, {
      action: 'PROJECT_CREATED',
      resource: 'projects',
      sectorScope: project.sectorId,
      targetId: project.id,
      summary: `Created project "${project.name}" under ${SECTOR_LABELS[project.sectorId]} with UGX ${Math.round(project.budget).toLocaleString('en-US')} budget.`,
    });
    writeDatabase(db);
    res.status(201).json({ project });
  });

  router.post(
    '/projects/:id/progress',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();
      const project = db.projects.find((p) => p.id === req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      if (
        !hasPermission(
          user,
          db.rolePermissions,
          'projects',
          'edit',
          project.sectorId,
        )
      ) {
        res.status(403).json({
          error: `Permission denied: cannot update progress for ${SECTOR_LABELS[project.sectorId]}.`,
        });
        return;
      }

      const { note, completionPercent, status } = req.body as {
        note: string;
        completionPercent: number;
        status?: Project['status'];
      };

      if (!note || note.trim().length < 4) {
        res.status(400).json({ error: 'Progress update note is required.' });
        return;
      }

      const pct = Math.min(100, Math.max(0, Number(completionPercent) || 0));
      project.progressRecords.push({
        id: `prg-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        note: note.trim(),
        completionPercent: pct,
        recordedBy: user.fullName,
      });
      if (status) {
        project.status = status;
      } else if (pct === 100) {
        project.status = 'Completed';
      }

      appendAuditLog(db, user, {
        action: 'PROJECT_PROGRESS_LOGGED',
        resource: 'projects',
        sectorScope: project.sectorId,
        targetId: project.id,
        summary: `Updated "${project.name}" progress to ${pct}% (${project.status}).`,
      });
      writeDatabase(db);
      res.json({ project });
    },
  );

  // Sector-specific operational logs
  router.post(
    '/sectors/:sectorId/operations',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();
      const sectorId = req.params.sectorId as SectorId;

      if (!ALL_SECTORS.includes(sectorId)) {
        res.status(400).json({ error: 'Invalid sector identifier.' });
        return;
      }

      if (
        !hasPermission(
          user,
          db.rolePermissions,
          'sector_operations',
          'create',
          sectorId,
        )
      ) {
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot log operational entries in ${SECTOR_LABELS[sectorId]}.`,
        });
        return;
      }

      const body = req.body as {
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
      };

      if (!body.title || body.title.trim().length < 3) {
        res.status(400).json({ error: 'Activity title is required.' });
        return;
      }

      const record: SectorOperationRecord = {
        id: `op-${Date.now()}`,
        sectorId,
        date: body.date || new Date().toISOString().slice(0, 10),
        category: body.category || 'Operations',
        title: body.title.trim(),
        unitLabel: body.unitLabel || 'units',
        primaryQuantity: Number(body.primaryQuantity) || 0,
        secondaryLabel: body.secondaryLabel || undefined,
        secondaryQuantity:
          body.secondaryQuantity !== undefined
            ? Number(body.secondaryQuantity)
            : undefined,
        operatingCost: Math.max(0, Number(body.operatingCost) || 0),
        revenueGenerated: Math.max(0, Number(body.revenueGenerated) || 0),
        notes: body.notes?.trim() || '',
        recordedBy: user.fullName,
      };

      db.sectorOperations.unshift(record);
      appendAuditLog(db, user, {
        action: 'SECTOR_OPERATION_LOGGED',
        resource: 'sector_operations',
        sectorScope: sectorId,
        targetId: record.id,
        summary: `Logged ${SECTOR_LABELS[sectorId]} ${record.category}: "${record.title}" (${record.primaryQuantity} ${record.unitLabel}).`,
      });
      writeDatabase(db);
      res.status(201).json({ operation: record });
    },
  );

  // Configurable RBAC Matrix
  router.put(
    '/roles/permissions',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();

      if (
        !hasPermission(
          user,
          db.rolePermissions,
          'roles',
          'edit',
          'Organisation',
        )
      ) {
        res.status(403).json({
          error: `Permission denied: Only Founder / Super Administrator can modify role permissions.`,
        });
        return;
      }

      const { rolePermissions } = req.body as {
        rolePermissions: RolePermissionMap;
      };
      if (!rolePermissions || !rolePermissions['Founder / Super Administrator']) {
        res.status(400).json({ error: 'Invalid role permission configuration.' });
        return;
      }

      // Ensure Founder retains roles:edit so system never locks out super-admin
      if (!rolePermissions['Founder / Super Administrator'].roles.includes('edit')) {
        rolePermissions['Founder / Super Administrator'].roles.push('edit');
      }

      db.rolePermissions = rolePermissions;
      appendAuditLog(db, user, {
        action: 'RBAC_PERMISSIONS_UPDATED',
        resource: 'roles',
        sectorScope: 'Organisation',
        summary: `Updated organisation-wide role permission matrix.`,
      });
      writeDatabase(db);
      res.json({ rolePermissions: db.rolePermissions });
    },
  );

  // Report CSV Export
  router.get(
    '/reports/export',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const user = req.sessionUser!;
      const db = readDatabase();
      if (
        !hasPermission(user, db.rolePermissions, 'reports', 'view', 'Organisation')
      ) {
        res.status(403).json({
          error: 'Permission denied: your role cannot export organisation reports.',
        });
        return;
      }

      const reportType = String(req.query.type || 'overview');
      let csv = '';

      const escapeCsv = (val: unknown) => {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replaceAll('"', '""')}"`;
        }
        return s;
      };

      if (reportType === 'membership' || reportType === 'contributions') {
        csv = [
          'Member Code,Full Name,Email,Phone,Date Joined,Status,Primary Role,Sectors,Requirement (UGX),Amount Paid (UGX),Outstanding (UGX),Payment Status',
          ...db.members.map((m) =>
            [
              m.memberCode,
              m.fullName,
              m.email,
              m.phone,
              m.dateJoined,
              m.status,
              m.primaryRole,
              m.sectorAssignments
                .map((s) => `${SECTOR_LABELS[s.sectorId]} (${s.role})`)
                .join(' | '),
              Math.round(m.contributionRequirement),
              Math.round(m.amountPaid),
              Math.round(m.outstandingBalance),
              m.paymentStatus,
            ]
              .map(escapeCsv)
              .join(','),
          ),
        ].join('\n');
      } else if (reportType === 'sector_finances' || reportType === 'funding') {
        const rows = calculateSectorFinancials(db.transactions, ALL_SECTORS);
        csv = [
          'Sector,Allocated Funds (UGX),Operational Expenditure (UGX),Project Investment (UGX),Remaining Allocation (UGX),Revenue Generated (UGX),Net Position (UGX)',
          ...rows.map((r) =>
            [
              SECTOR_LABELS[r.sectorId],
              Math.round(r.allocated),
              Math.round(r.expenditure),
              Math.round(r.projectInvestment),
              Math.round(r.remainingAllocation),
              Math.round(r.revenue),
              Math.round(r.netPosition),
            ]
              .map(escapeCsv)
              .join(','),
          ),
        ].join('\n');
      } else if (reportType === 'projects') {
        csv = [
          'Project Name,Sector,Manager,Status,Budget (UGX),Investment Received (UGX),Expenditure (UGX),Revenue (UGX),Latest Progress %',
          ...db.projects.map((p) => {
            const latest =
              p.progressRecords[p.progressRecords.length - 1]
                ?.completionPercent ?? 0;
            return [
              p.name,
              SECTOR_LABELS[p.sectorId],
              p.managerName,
              p.status,
              Math.round(p.budget),
              Math.round(p.investmentReceived),
              Math.round(p.expenditure),
              Math.round(p.revenue),
              `${latest}%`,
            ]
              .map(escapeCsv)
              .join(',');
          }),
        ].join('\n');
      } else if (reportType === 'production') {
        csv = [
          'Date,Sector,Category,Activity Title,Quantity,Unit,Operating Cost (UGX),Revenue Generated (UGX),Recorded By',
          ...db.sectorOperations.map((op) =>
            [
              op.date,
              SECTOR_LABELS[op.sectorId],
              op.category,
              op.title,
              op.primaryQuantity,
              op.unitLabel,
              Math.round(op.operatingCost),
              Math.round(op.revenueGenerated),
              op.recordedBy,
            ]
              .map(escapeCsv)
              .join(','),
          ),
        ].join('\n');
      } else {
        csv = [
          'Reference,Date,Type,Scope,Amount (UGX),Approval Status,Recorded By,Description',
          ...db.transactions.map((t) =>
            [
              t.reference,
              t.date,
              t.type,
              t.scope === 'Organisation'
                ? 'Organisation'
                : SECTOR_LABELS[t.scope],
              Math.round(t.amount),
              t.approvalStatus,
              t.recordedBy,
              t.description,
            ]
              .map(escapeCsv)
              .join(','),
          ),
        ].join('\n');
      }

      appendAuditLog(db, user, {
        action: 'REPORT_EXPORTED',
        resource: 'reports',
        sectorScope: 'Organisation',
        summary: `Exported ${reportType} report CSV.`,
      });
      writeDatabase(db);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="genz-agririse-${reportType}-report.csv"`,
      );
      res.send(csv);
    },
  );

  return router;
}
