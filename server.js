// server.ts
import http from "node:http";
import path2 from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";

// server/api.ts
import { Router } from "express";

// src/domain/rbac.ts
var ALL_SECTORS = [
  "agriculture",
  "piggery",
  "poultry",
  "vertical_farming"
];
var SECTOR_LABELS = {
  agriculture: "Agriculture",
  piggery: "Piggery",
  poultry: "Poultry",
  vertical_farming: "Vertical Farming"
};
var DEFAULT_ROLE_PERMISSIONS = {
  "Founder / Super Administrator": {
    organisation: ["view", "create", "edit", "approve", "delete"],
    members: ["view", "create", "edit", "approve", "delete"],
    finance: ["view", "create", "edit", "approve"],
    projects: ["view", "create", "edit", "approve", "delete"],
    sector_operations: ["view", "create", "edit", "approve", "delete"],
    roles: ["view", "edit"],
    reports: ["view", "create"],
    audit_logs: ["view"]
  },
  Administrator: {
    organisation: ["view", "create", "edit"],
    members: ["view", "create", "edit", "approve"],
    finance: ["view", "create", "approve"],
    projects: ["view", "create", "edit", "approve"],
    sector_operations: ["view", "create", "edit", "approve"],
    roles: ["view"],
    reports: ["view", "create"],
    audit_logs: ["view"]
  },
  "Sector Manager": {
    organisation: ["view"],
    members: ["view", "create", "edit"],
    finance: ["view", "create"],
    projects: ["view", "create", "edit"],
    sector_operations: ["view", "create", "edit", "approve"],
    roles: ["view"],
    reports: ["view"],
    audit_logs: ["view"]
  },
  "Team Leader": {
    organisation: ["view"],
    members: ["view"],
    finance: ["view"],
    projects: ["view", "edit"],
    sector_operations: ["view", "create", "edit"],
    roles: ["view"],
    reports: ["view"],
    audit_logs: []
  },
  "General Member": {
    organisation: ["view"],
    members: ["view"],
    finance: [],
    projects: ["view"],
    sector_operations: ["view"],
    roles: [],
    reports: [],
    audit_logs: []
  }
};
function getEffectiveRoleForScope(user, scope) {
  if (user.role === "Founder / Super Administrator" || user.role === "Administrator") {
    return user.role;
  }
  if (scope === "Organisation") {
    return user.role;
  }
  const assignment = user.sectorAssignments.find((s) => s.sectorId === scope);
  if (assignment) {
    return assignment.role;
  }
  return "General Member";
}
function hasPermission(user, rolePermissions, resource, action, scope = "Organisation") {
  const effectiveRole = getEffectiveRoleForScope(user, scope);
  const allowedActions = rolePermissions[effectiveRole]?.[resource] ?? [];
  return allowedActions.includes(action);
}

// src/domain/finance.ts
function requiresApproval(type) {
  return type === "Operational expenditure" || type === "Sector allocation" || type === "Project investment";
}
function calculateFinancialSummary(transactions) {
  let membershipContributions = 0;
  let externalFunding = 0;
  let donationsAndGrants = 0;
  let totalAllocated = 0;
  let totalExpenditure = 0;
  let totalProjectInvestment = 0;
  let totalRevenue = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const tx of transactions) {
    if (tx.approvalStatus === "Pending") {
      pendingCount += 1;
      pendingAmount += tx.amount;
      continue;
    }
    if (tx.approvalStatus !== "Approved") {
      continue;
    }
    switch (tx.type) {
      case "Membership contribution":
        membershipContributions += tx.amount;
        break;
      case "External funding":
        externalFunding += tx.amount;
        break;
      case "Donation & grant":
        donationsAndGrants += tx.amount;
        break;
      case "Sector allocation":
        totalAllocated += tx.amount;
        break;
      case "Operational expenditure":
        totalExpenditure += tx.amount;
        break;
      case "Project investment":
        totalProjectInvestment += tx.amount;
        break;
      case "Revenue generated":
        totalRevenue += tx.amount;
        break;
    }
  }
  const totalExternalAndGrants = externalFunding + donationsAndGrants;
  const totalInflows = membershipContributions + totalExternalAndGrants + totalRevenue;
  const actualCashSpent = totalExpenditure + totalProjectInvestment;
  const currentAvailableBalance = totalInflows - actualCashSpent;
  const unspentAllocations = Math.max(0, totalAllocated - actualCashSpent);
  const unallocatedReserve = currentAvailableBalance - unspentAllocations;
  return {
    membershipContributions,
    externalFunding,
    donationsAndGrants,
    totalExternalAndGrants,
    totalAllocated,
    totalExpenditure,
    totalProjectInvestment,
    totalRevenue,
    totalInflows,
    currentAvailableBalance,
    unallocatedReserve,
    pendingCount,
    pendingAmount
  };
}
function calculateSectorFinancials(transactions, sectorIds) {
  return sectorIds.map((sectorId) => {
    let allocated = 0;
    let expenditure = 0;
    let projectInvestment = 0;
    let revenue = 0;
    let contributionsAttributed = 0;
    for (const tx of transactions) {
      if (tx.approvalStatus !== "Approved" || tx.scope !== sectorId) {
        continue;
      }
      if (tx.type === "Sector allocation") allocated += tx.amount;
      if (tx.type === "Operational expenditure") expenditure += tx.amount;
      if (tx.type === "Project investment") projectInvestment += tx.amount;
      if (tx.type === "Revenue generated") revenue += tx.amount;
      if (tx.type === "Membership contribution") contributionsAttributed += tx.amount;
    }
    const totalSpent = expenditure + projectInvestment;
    const remainingAllocation = allocated - totalSpent;
    const netPosition = allocated + revenue + contributionsAttributed - totalSpent;
    return {
      sectorId,
      allocated,
      expenditure,
      projectInvestment,
      revenue,
      contributionsAttributed,
      remainingAllocation,
      netPosition
    };
  });
}
function validateNewTransaction(input, existingTransactions) {
  const ref = input.reference.trim().toUpperCase();
  if (!ref || ref.length < 4) {
    return {
      valid: false,
      error: "Transaction reference must be at least 4 characters."
    };
  }
  const duplicate = existingTransactions.some(
    (tx) => tx.reference.trim().toUpperCase() === ref
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Duplicate transaction reference "${ref}". Financial ledger forbids duplicate references.`
    };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      valid: false,
      error: "Transaction amount must be greater than zero."
    };
  }
  if (!input.description || input.description.trim().length < 5) {
    return {
      valid: false,
      error: "Please enter a clear transaction description (at least 5 characters)."
    };
  }
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return {
      valid: false,
      error: "Transaction date must be in YYYY-MM-DD format."
    };
  }
  return { valid: true };
}

// src/domain/members.ts
function deriveMemberPaymentState(contributionRequirement, paymentHistory) {
  const requirement = Math.max(0, Number(contributionRequirement) || 0);
  const amountPaid = paymentHistory.reduce(
    (sum, rec) => sum + Math.max(0, Number(rec.amount) || 0),
    0
  );
  const outstandingBalance = Math.max(0, requirement - amountPaid);
  let paymentStatus = "Unpaid";
  if (requirement === 0 || amountPaid >= requirement) {
    paymentStatus = "Paid";
  } else if (amountPaid > 0) {
    paymentStatus = "Partially paid";
  }
  return {
    amountPaid: Number(amountPaid.toFixed(2)),
    outstandingBalance: Number(outstandingBalance.toFixed(2)),
    paymentStatus
  };
}
function validateNewMemberInput(input, existingMembers) {
  if (!input.fullName || input.fullName.trim().length < 3) {
    return { valid: false, error: "Full name must be at least 3 characters." };
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { valid: false, error: "A valid email address is required." };
  }
  const normalizedPhone = input.phone.replace(/\s+/g, "");
  if (!normalizedPhone || normalizedPhone.length < 7) {
    return { valid: false, error: "A valid contact phone number is required." };
  }
  const duplicateEmail = existingMembers.find(
    (m) => m.email.trim().toLowerCase() === normalizedEmail
  );
  if (duplicateEmail) {
    return {
      valid: false,
      error: `Member profile already exists for ${duplicateEmail.fullName} (${duplicateEmail.memberCode}). Assign multiple sectors to the existing profile instead of creating a duplicate.`
    };
  }
  const duplicatePhone = existingMembers.find(
    (m) => m.phone.replace(/\s+/g, "") === normalizedPhone
  );
  if (duplicatePhone) {
    return {
      valid: false,
      error: `Phone number already belongs to ${duplicatePhone.fullName} (${duplicatePhone.memberCode}). Assign multiple sectors on their existing profile.`
    };
  }
  if (!Number.isFinite(input.contributionRequirement) || input.contributionRequirement < 0) {
    return {
      valid: false,
      error: "Contribution requirement cannot be negative."
    };
  }
  if (!input.sectorAssignments || input.sectorAssignments.length === 0) {
    return {
      valid: false,
      error: "Assign the member to at least one operational sector."
    };
  }
  const uniqueSectors = new Set(input.sectorAssignments.map((s) => s.sectorId));
  if (uniqueSectors.size !== input.sectorAssignments.length) {
    return {
      valid: false,
      error: "Duplicate sector assignment detected on the same member profile."
    };
  }
  return { valid: true };
}

// server/auth.ts
import crypto from "node:crypto";

// server/store.ts
import fs from "node:fs";
import path from "node:path";

// server/seedData.ts
function createSeedDatabase() {
  return {
    sectors: [
      {
        id: "agriculture",
        name: "Agriculture",
        shortName: "Crop Farming",
        description: "Open-field regenerative crop cultivation, soil inputs, irrigation cycles, and harvest yield tracking.",
        leadTitle: "Agronomy & Field Lead",
        focusArea: "Maize, Soybeans, High-Value Horticulture"
      },
      {
        id: "piggery",
        name: "Piggery",
        shortName: "Swine Operations",
        description: "Breeding stock management, ration feeding logs, herd health, and commercial porker sales.",
        leadTitle: "Livestock & Breeding Lead",
        focusArea: "Farrow-to-Finish Swine & Feed Formulation"
      },
      {
        id: "poultry",
        name: "Poultry",
        shortName: "Layer & Broiler",
        description: "Flock housing, daily egg tray collection, feed conversion ratios, and poultry sales.",
        leadTitle: "Avian Operations Lead",
        focusArea: "Commercial Layers & Broiler Cycles"
      },
      {
        id: "vertical_farming",
        name: "Vertical Farming",
        shortName: "Hydroponics",
        description: "Controlled-environment hydroponic towers, nutrient dosing, rapid leafy-green cycles, and urban supply.",
        leadTitle: "CEA Systems Lead",
        focusArea: "Hydroponic Towers & Precision Greens"
      }
    ],
    rolePermissions: structuredClone(DEFAULT_ROLE_PERMISSIONS),
    users: [
      {
        id: "usr-founder",
        memberId: "mem-1",
        fullName: "Grace Nabwire",
        email: "grace.nabwire@genzagririse.org",
        password: "demo-founder-password",
        role: "Founder / Super Administrator",
        sectorAssignments: [
          { sectorId: "agriculture", role: "Founder / Super Administrator" },
          { sectorId: "piggery", role: "Founder / Super Administrator" },
          { sectorId: "poultry", role: "Founder / Super Administrator" },
          { sectorId: "vertical_farming", role: "Founder / Super Administrator" }
        ]
      },
      {
        id: "usr-admin",
        memberId: "mem-2",
        fullName: "Kevin Mutiso",
        email: "kevin.mutiso@genzagririse.org",
        password: "demo-admin-password",
        role: "Administrator",
        sectorAssignments: [
          { sectorId: "agriculture", role: "Administrator" },
          { sectorId: "poultry", role: "Administrator" }
        ]
      },
      {
        id: "usr-sm-agri",
        memberId: "mem-3",
        fullName: "Samuel Ochieng",
        email: "samuel.ochieng@genzagririse.org",
        password: "demo-manager-password",
        role: "Sector Manager",
        sectorAssignments: [
          { sectorId: "agriculture", role: "Sector Manager" },
          { sectorId: "vertical_farming", role: "Team Leader" }
        ]
      },
      {
        id: "usr-tl-poultry",
        memberId: "mem-4",
        fullName: "Amina Hassan",
        email: "amina.hassan@genzagririse.org",
        password: "demo-leader-password",
        role: "Team Leader",
        sectorAssignments: [
          { sectorId: "poultry", role: "Team Leader" },
          { sectorId: "piggery", role: "General Member" }
        ]
      },
      {
        id: "usr-member",
        memberId: "mem-5",
        fullName: "Daniel Okello",
        email: "daniel.okello@genzagririse.org",
        password: "demo-member-password",
        role: "General Member",
        sectorAssignments: [{ sectorId: "piggery", role: "General Member" }]
      }
    ],
    members: [
      {
        id: "mem-1",
        memberCode: "GZA-001",
        fullName: "Grace Nabwire",
        email: "grace.nabwire@genzagririse.org",
        phone: "+256 701 440 112",
        dateJoined: "2026-01-10",
        status: "Active",
        contributionRequirement: 75e4,
        amountPaid: 75e4,
        outstandingBalance: 0,
        paymentStatus: "Paid",
        primaryRole: "Founder / Super Administrator",
        sectorAssignments: [
          { sectorId: "agriculture", role: "Founder / Super Administrator" },
          { sectorId: "piggery", role: "Founder / Super Administrator" },
          { sectorId: "poultry", role: "Founder / Super Administrator" },
          { sectorId: "vertical_farming", role: "Founder / Super Administrator" }
        ],
        paymentHistory: [
          {
            id: "pay-001",
            reference: "PAY-2026-001",
            amount: 75e4,
            date: "2026-01-12",
            method: "Bank Transfer",
            recordedBy: "Grace Nabwire",
            note: "Founding annual equity contribution"
          }
        ]
      },
      {
        id: "mem-2",
        memberCode: "GZA-002",
        fullName: "Kevin Mutiso",
        email: "kevin.mutiso@genzagririse.org",
        phone: "+254 712 889 340",
        dateJoined: "2026-01-18",
        status: "Active",
        contributionRequirement: 65e4,
        amountPaid: 65e4,
        outstandingBalance: 0,
        paymentStatus: "Paid",
        primaryRole: "Administrator",
        sectorAssignments: [
          { sectorId: "agriculture", role: "Administrator" },
          { sectorId: "poultry", role: "Administrator" }
        ],
        paymentHistory: [
          {
            id: "pay-002",
            reference: "PAY-2026-002",
            amount: 65e4,
            date: "2026-01-22",
            method: "Bank Transfer",
            recordedBy: "Grace Nabwire",
            note: "Full annual contribution settled"
          }
        ]
      },
      {
        id: "mem-3",
        memberCode: "GZA-003",
        fullName: "Samuel Ochieng",
        email: "samuel.ochieng@genzagririse.org",
        phone: "+254 722 503 819",
        dateJoined: "2026-02-04",
        status: "Active",
        contributionRequirement: 55e4,
        amountPaid: 55e4,
        outstandingBalance: 0,
        paymentStatus: "Paid",
        primaryRole: "Sector Manager",
        sectorAssignments: [
          { sectorId: "agriculture", role: "Sector Manager" },
          { sectorId: "vertical_farming", role: "Team Leader" }
        ],
        paymentHistory: [
          {
            id: "pay-003",
            reference: "PAY-2026-003",
            amount: 35e4,
            date: "2026-02-06",
            method: "Mobile Money",
            recordedBy: "Kevin Mutiso",
            note: "Initial tranche"
          },
          {
            id: "pay-004",
            reference: "PAY-2026-014",
            amount: 2e5,
            date: "2026-05-14",
            method: "Mobile Money",
            recordedBy: "Kevin Mutiso",
            note: "Balance cleared"
          }
        ]
      },
      {
        id: "mem-4",
        memberCode: "GZA-004",
        fullName: "Amina Hassan",
        email: "amina.hassan@genzagririse.org",
        phone: "+255 754 319 042",
        dateJoined: "2026-02-19",
        status: "Active",
        contributionRequirement: 55e4,
        amountPaid: 35e4,
        outstandingBalance: 2e5,
        paymentStatus: "Partially paid",
        primaryRole: "Team Leader",
        sectorAssignments: [
          { sectorId: "poultry", role: "Team Leader" },
          { sectorId: "piggery", role: "General Member" }
        ],
        paymentHistory: [
          {
            id: "pay-005",
            reference: "PAY-2026-009",
            amount: 35e4,
            date: "2026-03-01",
            method: "Mobile Money",
            recordedBy: "Kevin Mutiso",
            note: "First installment"
          }
        ]
      },
      {
        id: "mem-5",
        memberCode: "GZA-005",
        fullName: "Daniel Okello",
        email: "daniel.okello@genzagririse.org",
        phone: "+256 772 618 405",
        dateJoined: "2026-03-08",
        status: "Active",
        contributionRequirement: 45e4,
        amountPaid: 25e4,
        outstandingBalance: 2e5,
        paymentStatus: "Partially paid",
        primaryRole: "General Member",
        sectorAssignments: [{ sectorId: "piggery", role: "General Member" }],
        paymentHistory: [
          {
            id: "pay-006",
            reference: "PAY-2026-011",
            amount: 25e4,
            date: "2026-03-15",
            method: "Cash",
            recordedBy: "Grace Nabwire",
            note: "Partial cohort contribution"
          }
        ]
      },
      {
        id: "mem-6",
        memberCode: "GZA-006",
        fullName: "Brian Kato",
        email: "brian.kato@genzagririse.org",
        phone: "+256 783 920 118",
        dateJoined: "2026-03-22",
        status: "Active",
        contributionRequirement: 55e4,
        amountPaid: 55e4,
        outstandingBalance: 0,
        paymentStatus: "Paid",
        primaryRole: "Sector Manager",
        sectorAssignments: [
          { sectorId: "vertical_farming", role: "Sector Manager" },
          { sectorId: "agriculture", role: "General Member" }
        ],
        paymentHistory: [
          {
            id: "pay-007",
            reference: "PAY-2026-012",
            amount: 55e4,
            date: "2026-03-28",
            method: "Bank Transfer",
            recordedBy: "Kevin Mutiso"
          }
        ]
      },
      {
        id: "mem-7",
        memberCode: "GZA-007",
        fullName: "Esther Wanjiku",
        email: "esther.wanjiku@genzagririse.org",
        phone: "+254 733 411 908",
        dateJoined: "2026-04-11",
        status: "Active",
        contributionRequirement: 55e4,
        amountPaid: 55e4,
        outstandingBalance: 0,
        paymentStatus: "Paid",
        primaryRole: "Sector Manager",
        sectorAssignments: [
          { sectorId: "piggery", role: "Sector Manager" },
          { sectorId: "poultry", role: "Team Leader" }
        ],
        paymentHistory: [
          {
            id: "pay-008",
            reference: "PAY-2026-016",
            amount: 55e4,
            date: "2026-04-15",
            method: "Mobile Money",
            recordedBy: "Grace Nabwire"
          }
        ]
      },
      {
        id: "mem-8",
        memberCode: "GZA-008",
        fullName: "Faith Namukasa",
        email: "faith.namukasa@genzagririse.org",
        phone: "+256 704 221 774",
        dateJoined: "2026-06-05",
        status: "Active",
        contributionRequirement: 45e4,
        amountPaid: 0,
        outstandingBalance: 45e4,
        paymentStatus: "Unpaid",
        primaryRole: "General Member",
        sectorAssignments: [
          { sectorId: "poultry", role: "General Member" },
          { sectorId: "vertical_farming", role: "General Member" }
        ],
        paymentHistory: []
      },
      {
        id: "mem-9",
        memberCode: "GZA-009",
        fullName: "Josephine Mbabazi",
        email: "josephine.mbabazi@genzagririse.org",
        phone: "+256 751 893 220",
        dateJoined: "2026-07-14",
        status: "Active",
        contributionRequirement: 45e4,
        amountPaid: 3e5,
        outstandingBalance: 15e4,
        paymentStatus: "Partially paid",
        primaryRole: "Team Leader",
        sectorAssignments: [{ sectorId: "agriculture", role: "Team Leader" }],
        paymentHistory: [
          {
            id: "pay-009",
            reference: "PAY-2026-021",
            amount: 3e5,
            date: "2026-07-20",
            method: "Mobile Money",
            recordedBy: "Kevin Mutiso"
          }
        ]
      },
      {
        id: "mem-10",
        memberCode: "GZA-010",
        fullName: "Peter Njoroge",
        email: "peter.njoroge@genzagririse.org",
        phone: "+254 790 612 501",
        dateJoined: "2026-09-02",
        status: "Active",
        contributionRequirement: 45e4,
        amountPaid: 0,
        outstandingBalance: 45e4,
        paymentStatus: "Unpaid",
        primaryRole: "General Member",
        sectorAssignments: [
          { sectorId: "vertical_farming", role: "General Member" }
        ],
        paymentHistory: []
      }
    ],
    transactions: [
      {
        id: "tx-101",
        reference: "TXN-2026-101",
        amount: 4625e4,
        type: "External funding",
        date: "2026-06-05",
        description: "East Africa Youth Agri-Enterprise Seed Facility",
        scope: "Organisation",
        recordedBy: "Grace Nabwire",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-06-05T09:30:00Z",
        immutable: true
      },
      {
        id: "tx-102",
        reference: "TXN-2026-102",
        amount: 155e5,
        type: "Donation & grant",
        date: "2026-06-18",
        description: "Green Future Youth Climate Resilience Grant",
        scope: "Organisation",
        recordedBy: "Kevin Mutiso",
        recordedByUserId: "usr-admin",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-06-18T14:15:00Z",
        immutable: true
      },
      {
        id: "tx-103",
        reference: "TXN-2026-103",
        amount: 395e4,
        type: "Membership contribution",
        date: "2026-07-20",
        description: "Aggregated Cohort 1 & 2 Member Equity Contributions",
        scope: "Organisation",
        recordedBy: "Kevin Mutiso",
        recordedByUserId: "usr-admin",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-07-20T16:00:00Z",
        immutable: true
      },
      {
        id: "tx-104",
        reference: "TXN-2026-104",
        amount: 148e5,
        type: "Sector allocation",
        date: "2026-07-25",
        description: "Q3/Q4 Crop Production & Irrigation Capital Allocation",
        scope: "agriculture",
        recordedBy: "Grace Nabwire",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-07-25T10:00:00Z",
        immutable: true
      },
      {
        id: "tx-105",
        reference: "TXN-2026-105",
        amount: 133e5,
        type: "Sector allocation",
        date: "2026-07-26",
        description: "Swine Breeding Stock & Pen Upgrade Allocation",
        scope: "piggery",
        recordedBy: "Grace Nabwire",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-07-26T10:30:00Z",
        immutable: true
      },
      {
        id: "tx-106",
        reference: "TXN-2026-106",
        amount: 118e5,
        type: "Sector allocation",
        date: "2026-08-02",
        description: "Layer House & Day-Old Chicks Allocation",
        scope: "poultry",
        recordedBy: "Grace Nabwire",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-08-02T11:10:00Z",
        immutable: true
      },
      {
        id: "tx-107",
        reference: "TXN-2026-107",
        amount: 126e5,
        type: "Sector allocation",
        date: "2026-08-04",
        description: "Hydroponic Tower & Nutrient Loop Allocation",
        scope: "vertical_farming",
        recordedBy: "Grace Nabwire",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-08-04T09:20:00Z",
        immutable: true
      },
      {
        id: "tx-108",
        reference: "TXN-2026-108",
        amount: 795e4,
        type: "Project investment",
        date: "2026-08-14",
        description: "Drip Irrigation Expansion Kit \u2014 Block B Maize & Peppers",
        scope: "agriculture",
        projectId: "prj-1",
        recordedBy: "Samuel Ochieng",
        recordedByUserId: "usr-sm-agri",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-08-14T15:40:00Z",
        immutable: true
      },
      {
        id: "tx-109",
        reference: "TXN-2026-109",
        amount: 535e4,
        type: "Operational expenditure",
        date: "2026-08-29",
        description: "Grower & Finisher Swine Feed Concentrate (2.5 Tonnes)",
        scope: "piggery",
        projectId: "prj-2",
        recordedBy: "Esther Wanjiku",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Kevin Mutiso",
        approvedAt: "2026-08-30T08:15:00Z",
        immutable: true
      },
      {
        id: "tx-110",
        reference: "TXN-2026-110",
        amount: 685e4,
        type: "Project investment",
        date: "2026-09-09",
        description: "Vertical NFT Tower Array & LED Spectrum Rack",
        scope: "vertical_farming",
        projectId: "prj-4",
        recordedBy: "Brian Kato",
        recordedByUserId: "usr-admin",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-09-10T10:05:00Z",
        immutable: true
      },
      {
        id: "tx-111",
        reference: "TXN-2026-111",
        amount: 6e6,
        type: "Operational expenditure",
        date: "2026-09-19",
        description: "Layer Mash Feed & Vaccination Batch #4",
        scope: "poultry",
        projectId: "prj-3",
        recordedBy: "Amina Hassan",
        recordedByUserId: "usr-tl-poultry",
        approvalStatus: "Approved",
        approvedBy: "Kevin Mutiso",
        approvedAt: "2026-09-20T09:00:00Z",
        immutable: true
      },
      {
        id: "tx-112",
        reference: "TXN-2026-112",
        amount: 918e4,
        type: "Revenue generated",
        date: "2026-10-06",
        description: "Commercial Egg Trays & Dressed Broiler Wholesale",
        scope: "poultry",
        projectId: "prj-3",
        recordedBy: "Amina Hassan",
        recordedByUserId: "usr-tl-poultry",
        approvalStatus: "Approved",
        approvedBy: "Kevin Mutiso",
        approvedAt: "2026-10-06T17:10:00Z",
        immutable: true
      },
      {
        id: "tx-113",
        reference: "TXN-2026-113",
        amount: 1155e4,
        type: "Revenue generated",
        date: "2026-10-21",
        description: "Dry Maize & Sweet Bell Pepper Cooperative Offtake",
        scope: "agriculture",
        projectId: "prj-1",
        recordedBy: "Samuel Ochieng",
        recordedByUserId: "usr-sm-agri",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-10-21T16:45:00Z",
        immutable: true
      },
      {
        id: "tx-114",
        reference: "TXN-2026-114",
        amount: 718e4,
        type: "Revenue generated",
        date: "2026-11-04",
        description: "Urban Supermarket Hydroponic Lettuce & Basil Contract",
        scope: "vertical_farming",
        projectId: "prj-4",
        recordedBy: "Brian Kato",
        recordedByUserId: "usr-admin",
        approvalStatus: "Approved",
        approvedBy: "Grace Nabwire",
        approvedAt: "2026-11-04T12:30:00Z",
        immutable: true
      },
      {
        id: "tx-115",
        reference: "TXN-2026-115",
        amount: 98e5,
        type: "Revenue generated",
        date: "2026-11-12",
        description: "Finished Porker Sale \u2014 14 Live Hogs (Lot #B2)",
        scope: "piggery",
        projectId: "prj-2",
        recordedBy: "Esther Wanjiku",
        recordedByUserId: "usr-founder",
        approvalStatus: "Approved",
        approvedBy: "Kevin Mutiso",
        approvedAt: "2026-11-12T15:20:00Z",
        immutable: true
      },
      {
        id: "tx-116",
        reference: "TXN-2026-116",
        amount: 252e4,
        type: "Operational expenditure",
        date: "2026-11-19",
        description: "Organic NPK Foliar Inputs & Seedling Trays (Pending)",
        scope: "agriculture",
        projectId: "prj-5",
        recordedBy: "Samuel Ochieng",
        recordedByUserId: "usr-sm-agri",
        approvalStatus: "Pending",
        immutable: true
      },
      {
        id: "tx-117",
        reference: "TXN-2026-117",
        amount: 2e6,
        type: "Project investment",
        date: "2026-11-21",
        description: "Automated EC/pH Sensor Kit for Tower Bank B (Pending)",
        scope: "vertical_farming",
        projectId: "prj-4",
        recordedBy: "Samuel Ochieng",
        recordedByUserId: "usr-sm-agri",
        approvalStatus: "Pending",
        immutable: true
      },
      {
        id: "tx-118",
        reference: "TXN-2026-118",
        amount: 155e4,
        type: "Operational expenditure",
        date: "2026-11-22",
        description: "Poultry Solar Brooder Backup Battery Replacement (Pending)",
        scope: "poultry",
        projectId: "prj-3",
        recordedBy: "Amina Hassan",
        recordedByUserId: "usr-tl-poultry",
        approvalStatus: "Pending",
        immutable: true
      }
    ],
    projects: [
      {
        id: "prj-1",
        name: "Solar Drip Horticulture & Maize Block",
        description: "3.5-acre irrigated field combining drought-tolerant maize with high-margin bell peppers for regional youth markets.",
        sectorId: "agriculture",
        managerMemberId: "mem-3",
        managerName: "Samuel Ochieng",
        budget: 13e6,
        investmentReceived: 1035e4,
        expenditure: 795e4,
        revenue: 1155e4,
        status: "Active",
        startDate: "2026-07-01",
        progressRecords: [
          {
            id: "prg-1",
            date: "2026-08-14",
            note: "Installed mainline drip manifolds across 3.5 acres.",
            completionPercent: 45,
            recordedBy: "Samuel Ochieng"
          },
          {
            id: "prg-2",
            date: "2026-10-21",
            note: "Completed first bell pepper and maize offtake harvest.",
            completionPercent: 78,
            recordedBy: "Samuel Ochieng"
          }
        ]
      },
      {
        id: "prj-2",
        name: "Farrow-to-Finish Swine Breeding Hub",
        description: "Modern concrete-slatted pens housing 28 grower/finisher swine and 6 breeding sows with biosecurity protocols.",
        sectorId: "piggery",
        managerMemberId: "mem-7",
        managerName: "Esther Wanjiku",
        budget: 118e5,
        investmentReceived: 96e5,
        expenditure: 535e4,
        revenue: 98e5,
        status: "Active",
        startDate: "2026-07-15",
        progressRecords: [
          {
            id: "prg-3",
            date: "2026-08-29",
            note: "Stocked 2.5 tonnes formulated grower concentrate.",
            completionPercent: 52,
            recordedBy: "Esther Wanjiku"
          },
          {
            id: "prg-4",
            date: "2026-11-12",
            note: "Sold Lot #B2 (14 finished hogs at avg 94kg live weight).",
            completionPercent: 84,
            recordedBy: "Esther Wanjiku"
          }
        ]
      },
      {
        id: "prj-3",
        name: "Deep-Litter Layer Expansion (1,200 Birds)",
        description: "High-yield ISA Brown layer unit supplying daily fresh egg trays to local schools and retail grocers.",
        sectorId: "poultry",
        managerMemberId: "mem-4",
        managerName: "Amina Hassan",
        budget: 107e5,
        investmentReceived: 888e4,
        expenditure: 6e6,
        revenue: 918e4,
        status: "Active",
        startDate: "2026-08-01",
        progressRecords: [
          {
            id: "prg-5",
            date: "2026-09-19",
            note: "Completed Newcastle & Gumboro booster vaccination.",
            completionPercent: 60,
            recordedBy: "Amina Hassan"
          },
          {
            id: "prg-6",
            date: "2026-10-06",
            note: "Reached 86% daily laying rate across House A & B.",
            completionPercent: 80,
            recordedBy: "Amina Hassan"
          }
        ]
      },
      {
        id: "prj-4",
        name: "Urban Hydroponic Tower Array",
        description: "16-tower closed-loop NFT & vertical aeroponic unit producing pesticide-free butterhead lettuce and sweet basil.",
        sectorId: "vertical_farming",
        managerMemberId: "mem-6",
        managerName: "Brian Kato",
        budget: 125e5,
        investmentReceived: 1e7,
        expenditure: 685e4,
        revenue: 718e4,
        status: "Active",
        startDate: "2026-08-10",
        progressRecords: [
          {
            id: "prg-7",
            date: "2026-09-10",
            note: "Commissioned 16 vertical towers with automated dosing pumps.",
            completionPercent: 55,
            recordedBy: "Brian Kato"
          },
          {
            id: "prg-8",
            date: "2026-11-04",
            note: "Delivered Cycle 3 (420 kg crisp lettuce) to urban supermarkets.",
            completionPercent: 74,
            recordedBy: "Brian Kato"
          }
        ]
      },
      {
        id: "prj-5",
        name: "Youth Seedlings & Nursery Propagation",
        description: "Central greenhouse nursery supplying grafted tomato and pepper seedlings to member youth outgrowers.",
        sectorId: "agriculture",
        managerMemberId: "mem-9",
        managerName: "Josephine Mbabazi",
        budget: 52e5,
        investmentReceived: 333e4,
        expenditure: 14e5,
        revenue: 155e4,
        status: "Planning",
        startDate: "2026-10-15",
        progressRecords: [
          {
            id: "prg-9",
            date: "2026-11-08",
            note: "Bench framing completed; waiting on foliar nutrient approval.",
            completionPercent: 28,
            recordedBy: "Josephine Mbabazi"
          }
        ]
      }
    ],
    sectorOperations: [
      // Agriculture
      {
        id: "op-ag-1",
        sectorId: "agriculture",
        date: "2026-11-18",
        category: "Harvest",
        title: "Block B Bell Pepper Harvest \u2014 Grade A",
        unitLabel: "kg harvested",
        primaryQuantity: 640,
        secondaryLabel: "Acres",
        secondaryQuantity: 1.5,
        operatingCost: 52e4,
        revenueGenerated: 355e4,
        notes: "Sorted and crated for metropolitan fresh-produce buyers.",
        recordedBy: "Samuel Ochieng"
      },
      {
        id: "op-ag-2",
        sectorId: "agriculture",
        date: "2026-11-10",
        category: "Input Application",
        title: "Drip Fertigation & Compost Top-Dressing",
        unitLabel: "kg compost",
        primaryQuantity: 850,
        secondaryLabel: "Acres",
        secondaryQuantity: 3.5,
        operatingCost: 815e3,
        revenueGenerated: 0,
        notes: "Applied bio-enriched compost across maize & pepper blocks.",
        recordedBy: "Josephine Mbabazi"
      },
      {
        id: "op-ag-3",
        sectorId: "agriculture",
        date: "2026-10-21",
        category: "Harvest",
        title: "Dry Maize Cooperative Shelling Batch",
        unitLabel: "kg shelled",
        primaryQuantity: 2800,
        secondaryLabel: "Moisture %",
        secondaryQuantity: 13.2,
        operatingCost: 115e4,
        revenueGenerated: 8e6,
        notes: "Moisture tested below 13.5% before silo bagging.",
        recordedBy: "Samuel Ochieng"
      },
      {
        id: "op-ag-4",
        sectorId: "agriculture",
        date: "2026-10-04",
        category: "Planting",
        title: "Soybean Nitrogen-Fixation Rotation Plot",
        unitLabel: "kg seed",
        primaryQuantity: 110,
        secondaryLabel: "Acres",
        secondaryQuantity: 2,
        operatingCost: 72e4,
        revenueGenerated: 0,
        notes: "Inoculated seed drilled on East Ridge Plot.",
        recordedBy: "Josephine Mbabazi"
      },
      // Piggery
      {
        id: "op-pg-1",
        sectorId: "piggery",
        date: "2026-11-19",
        category: "Feeding Log",
        title: "Weekly Finisher & Sow Ration Dispatch",
        unitLabel: "kg feed",
        primaryQuantity: 620,
        secondaryLabel: "Active herd",
        secondaryQuantity: 34,
        operatingCost: 126e4,
        revenueGenerated: 0,
        notes: "Balanced maize-bran, soy meal, and mineral premix.",
        recordedBy: "Daniel Okello"
      },
      {
        id: "op-pg-2",
        sectorId: "piggery",
        date: "2026-11-12",
        category: "Livestock Sale",
        title: "Lot #B2 Finished Porker Dispatch",
        unitLabel: "hogs sold",
        primaryQuantity: 14,
        secondaryLabel: "Avg kg",
        secondaryQuantity: 94,
        operatingCost: 41e4,
        revenueGenerated: 98e5,
        notes: "Sold to regional abattoir contract partner.",
        recordedBy: "Esther Wanjiku"
      },
      {
        id: "op-pg-3",
        sectorId: "piggery",
        date: "2026-10-28",
        category: "Breeding Cycle",
        title: "Sow #S-04 Farrowing \u2014 Healthy Litter",
        unitLabel: "piglets",
        primaryQuantity: 11,
        secondaryLabel: "Wean target",
        secondaryQuantity: 11,
        operatingCost: 315e3,
        revenueGenerated: 0,
        notes: "Iron supplementation administered on day 3.",
        recordedBy: "Esther Wanjiku"
      },
      {
        id: "op-pg-4",
        sectorId: "piggery",
        date: "2026-10-08",
        category: "Stock Purchase",
        title: "Landrace Weaner Replacement Gilts",
        unitLabel: "gilts",
        primaryQuantity: 6,
        secondaryLabel: "Avg kg",
        secondaryQuantity: 28,
        operatingCost: 2e6,
        revenueGenerated: 0,
        notes: "Quarantined for 14 days prior to main pen integration.",
        recordedBy: "Esther Wanjiku"
      },
      // Poultry
      {
        id: "op-pl-1",
        sectorId: "poultry",
        date: "2026-11-21",
        category: "Egg Collection",
        title: "Daily Layer Collection \u2014 Houses A & B",
        unitLabel: "eggs collected",
        primaryQuantity: 1032,
        secondaryLabel: "Trays",
        secondaryQuantity: 34.4,
        operatingCost: 24e4,
        revenueGenerated: 115e4,
        notes: "86.0% laying rate across 1,200 active layers.",
        recordedBy: "Amina Hassan"
      },
      {
        id: "op-pl-2",
        sectorId: "poultry",
        date: "2026-11-14",
        category: "Feeding Log",
        title: "Calcium-Enriched Layer Mash Batch",
        unitLabel: "kg feed",
        primaryQuantity: 900,
        secondaryLabel: "Flock size",
        secondaryQuantity: 1200,
        operatingCost: 178e4,
        revenueGenerated: 0,
        notes: "Oyster shell grit ratio adjusted for shell strength.",
        recordedBy: "Amina Hassan"
      },
      {
        id: "op-pl-3",
        sectorId: "poultry",
        date: "2026-10-25",
        category: "Bird & Egg Sale",
        title: "School Feeding & Grocers Egg Contract",
        unitLabel: "trays sold",
        primaryQuantity: 210,
        secondaryLabel: "UGX/tray",
        secondaryQuantity: 35e3,
        operatingCost: 165e3,
        revenueGenerated: 735e4,
        notes: "Zero breakage on crate return delivery.",
        recordedBy: "Amina Hassan"
      },
      {
        id: "op-pl-4",
        sectorId: "poultry",
        date: "2026-09-29",
        category: "Health & Ops",
        title: "Cold-Chain Newcastle Booster & Litter Change",
        unitLabel: "birds vaccinated",
        primaryQuantity: 1200,
        secondaryLabel: "Mortality %",
        secondaryQuantity: 0.4,
        operatingCost: 7e5,
        revenueGenerated: 0,
        notes: "All biosecurity footbaths refreshed.",
        recordedBy: "Amina Hassan"
      },
      // Vertical Farming
      {
        id: "op-vf-1",
        sectorId: "vertical_farming",
        date: "2026-11-20",
        category: "Harvest Yield",
        title: "Tower Bank A \u2014 Butterhead Lettuce Cycle #4",
        unitLabel: "kg harvested",
        primaryQuantity: 215,
        secondaryLabel: "Active towers",
        secondaryQuantity: 16,
        operatingCost: 35e4,
        revenueGenerated: 3625e3,
        notes: "28-day cycle harvested with 98% germination uniformity.",
        recordedBy: "Brian Kato"
      },
      {
        id: "op-vf-2",
        sectorId: "vertical_farming",
        date: "2026-11-11",
        category: "Nutrient Dosing",
        title: "Hydroponic A+B Macro/Micro Solution Rebalance",
        unitLabel: "liters dosed",
        primaryQuantity: 140,
        secondaryLabel: "Target EC",
        secondaryQuantity: 1.8,
        operatingCost: 46e4,
        revenueGenerated: 0,
        notes: "pH stabilized at 5.9 across reservoir tanks 1 & 2.",
        recordedBy: "Brian Kato"
      },
      {
        id: "op-vf-3",
        sectorId: "vertical_farming",
        date: "2026-10-30",
        category: "Harvest Yield",
        title: "Sweet Basil & Mint Culinary Pack Delivery",
        unitLabel: "kg harvested",
        primaryQuantity: 118,
        secondaryLabel: "Towers",
        secondaryQuantity: 6,
        operatingCost: 26e4,
        revenueGenerated: 3555e3,
        notes: "Supplied 8 hospitality kitchens in central district.",
        recordedBy: "Samuel Ochieng"
      },
      {
        id: "op-vf-4",
        sectorId: "vertical_farming",
        date: "2026-10-12",
        category: "Planting Cycle",
        title: "Cycle #5 Rockwool Plug Seeding (Kale & Lettuce)",
        unitLabel: "plugs seeded",
        primaryQuantity: 1920,
        secondaryLabel: "LED hrs/day",
        secondaryQuantity: 14,
        operatingCost: 41e4,
        revenueGenerated: 0,
        notes: "Nursery dome humidity maintained at 78%.",
        recordedBy: "Brian Kato"
      }
    ],
    auditLogs: [
      {
        id: "aud-1",
        timestamp: "2026-11-22T09:14:00Z",
        actorId: "usr-tl-poultry",
        actorName: "Amina Hassan",
        actorRole: "Team Leader",
        action: "TRANSACTION_SUBMITTED",
        resource: "finance",
        sectorScope: "poultry",
        targetId: "tx-118",
        summary: "Submitted Operational expenditure TXN-2026-118 (UGX 1,550,000) for approval."
      },
      {
        id: "aud-2",
        timestamp: "2026-11-21T16:40:00Z",
        actorId: "usr-sm-agri",
        actorName: "Samuel Ochieng",
        actorRole: "Sector Manager",
        action: "TRANSACTION_SUBMITTED",
        resource: "finance",
        sectorScope: "vertical_farming",
        targetId: "tx-117",
        summary: "Submitted Project investment TXN-2026-117 (UGX 2,000,000) for approval."
      },
      {
        id: "aud-3",
        timestamp: "2026-11-19T11:25:00Z",
        actorId: "usr-sm-agri",
        actorName: "Samuel Ochieng",
        actorRole: "Sector Manager",
        action: "TRANSACTION_SUBMITTED",
        resource: "finance",
        sectorScope: "agriculture",
        targetId: "tx-116",
        summary: "Submitted Operational expenditure TXN-2026-116 (UGX 2,520,000) for approval."
      },
      {
        id: "aud-4",
        timestamp: "2026-11-12T15:20:00Z",
        actorId: "usr-admin",
        actorName: "Kevin Mutiso",
        actorRole: "Administrator",
        action: "TRANSACTION_APPROVED",
        resource: "finance",
        sectorScope: "piggery",
        targetId: "tx-115",
        summary: "Approved Revenue generated TXN-2026-115 (UGX 9,800,000) for Piggery Lot #B2."
      },
      {
        id: "aud-5",
        timestamp: "2026-11-04T12:30:00Z",
        actorId: "usr-founder",
        actorName: "Grace Nabwire",
        actorRole: "Founder / Super Administrator",
        action: "TRANSACTION_APPROVED",
        resource: "finance",
        sectorScope: "vertical_farming",
        targetId: "tx-114",
        summary: "Approved Revenue generated TXN-2026-114 (UGX 7,180,000) for Vertical Farming."
      }
    ]
  };
}

// server/store.ts
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "agririse-db.json");
var memoryCache = null;
function readDatabase() {
  if (memoryCache) {
    return memoryCache;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
    memoryCache = seed;
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    memoryCache = parsed;
    return parsed;
  } catch {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
    memoryCache = seed;
    return seed;
  }
}
function writeDatabase(nextState) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), "utf8");
  fs.renameSync(tmpFile, DB_FILE);
  memoryCache = nextState;
}
function appendAuditLog(db, actor, params) {
  const entry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: params.action,
    resource: params.resource,
    sectorScope: params.sectorScope,
    targetId: params.targetId,
    summary: params.summary
  };
  db.auditLogs.unshift(entry);
  return entry;
}

// server/auth.ts
var SESSION_COOKIE = "gza_session";
var SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const result = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}
function signToken(payload) {
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return payload;
}
function sanitizeUser(account) {
  return {
    id: account.id,
    memberId: account.memberId,
    fullName: account.fullName,
    email: account.email,
    role: account.role,
    sectorAssignments: account.sectorAssignments
  };
}
function createSessionToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({ userId, iat: Date.now() }),
    "utf8"
  ).toString("base64url");
  return signToken(payload);
}
function setSessionCookie(res, userId) {
  const token = createSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 1e3 * 60 * 60 * 24 * 7
  });
  return token;
}
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
function decodeUserFromToken(token, users) {
  const payloadStr = verifyToken(token);
  if (!payloadStr) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf8")
    );
    const user = users.find((u) => u.id === parsed.userId);
    return user ? sanitizeUser(user) : null;
  } catch {
    return null;
  }
}
function resolveSessionUser(req, res, _allowDefaultBootstrap = true) {
  const db = readDatabase();
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    const user = decodeUserFromToken(bearerToken, db.users);
    if (user) return user;
  }
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) {
    const user = decodeUserFromToken(cookies[SESSION_COOKIE], db.users);
    if (user) return user;
  }
  const defaultUser = db.users[0];
  if (defaultUser) {
    setSessionCookie(res, defaultUser.id);
    return sanitizeUser(defaultUser);
  }
  return null;
}
function requireAuth(req, res, next) {
  const user = resolveSessionUser(req, res, true);
  if (!user) {
    res.status(500).json({ error: "No workspace account configured." });
    return;
  }
  req.sessionUser = user;
  next();
}

// server/api.ts
function createApiRouter() {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  router.get("/auth/session", (req, res) => {
    const user = resolveSessionUser(req, res, true);
    const db = readDatabase();
    res.json({
      authenticated: Boolean(user),
      user,
      token: user ? setSessionCookie(res, user.id) : null,
      availableAccounts: db.users.map(sanitizeUser)
    });
  });
  router.post("/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    const db = readDatabase();
    const account = db.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    );
    if (!account) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }
    const sessionUser = sanitizeUser(account);
    const token = setSessionCookie(res, account.id);
    appendAuditLog(db, sessionUser, {
      action: "USER_SIGNED_IN",
      resource: "organisation",
      sectorScope: "Organisation",
      targetId: account.id,
      summary: `${sessionUser.fullName} signed in as ${sessionUser.role}.`
    });
    writeDatabase(db);
    res.json({ user: sessionUser, token });
  });
  router.post("/auth/switch-role", (req, res) => {
    const { userId } = req.body;
    const db = readDatabase();
    const account = db.users.find((u) => u.id === userId);
    if (!account) {
      res.status(404).json({ error: "Selected account was not found." });
      return;
    }
    const sessionUser = sanitizeUser(account);
    const token = setSessionCookie(res, account.id);
    appendAuditLog(db, sessionUser, {
      action: "SESSION_ROLE_SWITCHED",
      resource: "roles",
      sectorScope: "Organisation",
      targetId: account.id,
      summary: `Switched active workspace persona to ${sessionUser.fullName} (${sessionUser.role}).`
    });
    writeDatabase(db);
    res.json({ user: sessionUser, token });
  });
  router.post("/auth/logout", (req, res) => {
    const current = resolveSessionUser(req, res, false);
    if (current) {
      const db = readDatabase();
      appendAuditLog(db, current, {
        action: "USER_SIGNED_OUT",
        resource: "organisation",
        sectorScope: "Organisation",
        targetId: current.id,
        summary: `${current.fullName} signed out.`
      });
      writeDatabase(db);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  router.get("/bootstrap", requireAuth, (req, res) => {
    const user = req.sessionUser;
    const db = readDatabase();
    const canViewFinance = hasPermission(
      user,
      db.rolePermissions,
      "finance",
      "view",
      "Organisation"
    );
    const canViewAudit = hasPermission(
      user,
      db.rolePermissions,
      "audit_logs",
      "view",
      "Organisation"
    );
    const visibleTransactions = canViewFinance ? db.transactions : db.transactions.filter(
      (tx) => tx.scope !== "Organisation" && hasPermission(user, db.rolePermissions, "finance", "view", tx.scope)
    );
    const financialSummary = calculateFinancialSummary(db.transactions);
    const sectorFinancials = calculateSectorFinancials(
      db.transactions,
      ALL_SECTORS
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
      sectorFinancials
    });
  });
  router.post("/members", requireAuth, (req, res) => {
    const user = req.sessionUser;
    const db = readDatabase();
    const body = req.body;
    const targetScope = body.sectorAssignments?.[0]?.sectorId ?? "Organisation";
    const allowed = hasPermission(user, db.rolePermissions, "members", "create", "Organisation") || hasPermission(user, db.rolePermissions, "members", "create", targetScope);
    if (!allowed) {
      res.status(403).json({
        error: `Permission denied: ${user.role} cannot register new members.`
      });
      return;
    }
    const validation = validateNewMemberInput(
      {
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        contributionRequirement: Number(body.contributionRequirement),
        sectorAssignments: body.sectorAssignments
      },
      db.members
    );
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const nextNum = db.members.length + 1;
    const memberCode = `GZA-${String(nextNum).padStart(3, "0")}`;
    const joinedDate = body.dateJoined && /^\d{4}-\d{2}-\d{2}$/.test(body.dateJoined) ? body.dateJoined : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const paymentHistory = [];
    const initialPay = Number(body.initialPayment ?? 0);
    if (Number.isFinite(initialPay) && initialPay > 0) {
      const payRef = `PAY-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(
        Date.now()
      ).slice(-4)}`;
      paymentHistory.push({
        id: `pay-${Date.now()}`,
        reference: payRef,
        amount: initialPay,
        date: joinedDate,
        method: "Bank Transfer",
        recordedBy: user.fullName,
        note: "Initial registration contribution"
      });
      const txRef = `TXN-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(
        db.transactions.length + 101
      )}`;
      db.transactions.unshift({
        id: `tx-${Date.now()}`,
        reference: txRef,
        amount: initialPay,
        type: "Membership contribution",
        date: joinedDate,
        description: `Initial membership contribution \u2014 ${body.fullName.trim()} (${memberCode})`,
        scope: "Organisation",
        recordedBy: user.fullName,
        recordedByUserId: user.id,
        approvalStatus: "Approved",
        approvedBy: user.fullName,
        approvedAt: (/* @__PURE__ */ new Date()).toISOString(),
        immutable: true
      });
    }
    const paymentState = deriveMemberPaymentState(
      Number(body.contributionRequirement),
      paymentHistory
    );
    const newMember = {
      id: `mem-${Date.now()}`,
      memberCode,
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone.trim(),
      dateJoined: joinedDate,
      status: body.status ?? "Active",
      contributionRequirement: Number(body.contributionRequirement),
      ...paymentState,
      primaryRole: body.primaryRole || "General Member",
      sectorAssignments: body.sectorAssignments,
      paymentHistory
    };
    db.members.unshift(newMember);
    appendAuditLog(db, user, {
      action: "MEMBER_REGISTERED",
      resource: "members",
      sectorScope: "Organisation",
      targetId: newMember.id,
      summary: `Registered member ${newMember.fullName} (${newMember.memberCode}) across ${newMember.sectorAssignments.map((s) => SECTOR_LABELS[s.sectorId]).join(", ")}.`
    });
    writeDatabase(db);
    res.status(201).json({ member: newMember });
  });
  router.patch("/members/:id", requireAuth, (req, res) => {
    const user = req.sessionUser;
    const db = readDatabase();
    const member = db.members.find((m) => m.id === req.params.id);
    if (!member) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    const allowed = hasPermission(
      user,
      db.rolePermissions,
      "members",
      "edit",
      "Organisation"
    );
    if (!allowed) {
      res.status(403).json({
        error: `Permission denied: ${user.role} cannot edit member profiles.`
      });
      return;
    }
    const { status, primaryRole, sectorAssignments, contributionRequirement } = req.body;
    if (sectorAssignments && sectorAssignments.length > 0) {
      const unique = new Set(sectorAssignments.map((s) => s.sectorId));
      if (unique.size !== sectorAssignments.length) {
        res.status(400).json({ error: "Duplicate sector assignment rejected." });
        return;
      }
      member.sectorAssignments = sectorAssignments;
    }
    if (status) member.status = status;
    if (primaryRole) member.primaryRole = primaryRole;
    if (contributionRequirement !== void 0 && Number.isFinite(Number(contributionRequirement)) && Number(contributionRequirement) >= 0) {
      member.contributionRequirement = Number(contributionRequirement);
      const state = deriveMemberPaymentState(
        member.contributionRequirement,
        member.paymentHistory
      );
      member.amountPaid = state.amountPaid;
      member.outstandingBalance = state.outstandingBalance;
      member.paymentStatus = state.paymentStatus;
    }
    appendAuditLog(db, user, {
      action: "MEMBER_UPDATED",
      resource: "members",
      sectorScope: "Organisation",
      targetId: member.id,
      summary: `Updated profile & sector assignments for ${member.fullName} (${member.memberCode}).`
    });
    writeDatabase(db);
    res.json({ member });
  });
  router.post(
    "/members/:id/payments",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      const member = db.members.find((m) => m.id === req.params.id);
      if (!member) {
        res.status(404).json({ error: "Member not found." });
        return;
      }
      if (!hasPermission(
        user,
        db.rolePermissions,
        "members",
        "edit",
        "Organisation"
      )) {
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot record member payments.`
        });
        return;
      }
      const { amount, method, date, reference, note } = req.body;
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        res.status(400).json({ error: "Payment amount must be greater than zero." });
        return;
      }
      const payDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const payRef = reference?.trim().toUpperCase() || `PAY-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(Date.now()).slice(-4)}`;
      const duplicatePayRef = db.members.some(
        (m) => m.paymentHistory.some(
          (p) => p.reference.toUpperCase() === payRef
        )
      );
      if (duplicatePayRef) {
        res.status(400).json({
          error: `Duplicate payment reference "${payRef}" is not allowed.`
        });
        return;
      }
      const paymentRecord = {
        id: `pay-${Date.now()}`,
        reference: payRef,
        amount: numericAmount,
        date: payDate,
        method: method || "Mobile Money",
        recordedBy: user.fullName,
        note: note?.trim()
      };
      member.paymentHistory.unshift(paymentRecord);
      const paymentState = deriveMemberPaymentState(
        member.contributionRequirement,
        member.paymentHistory
      );
      member.amountPaid = paymentState.amountPaid;
      member.outstandingBalance = paymentState.outstandingBalance;
      member.paymentStatus = paymentState.paymentStatus;
      const txRef = `TXN-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(
        db.transactions.length + 101
      )}-${String(Date.now()).slice(-2)}`;
      db.transactions.unshift({
        id: `tx-${Date.now()}`,
        reference: txRef,
        amount: numericAmount,
        type: "Membership contribution",
        date: payDate,
        description: `Membership contribution payment (${payRef}) \u2014 ${member.fullName} (${member.memberCode})`,
        scope: "Organisation",
        recordedBy: user.fullName,
        recordedByUserId: user.id,
        approvalStatus: "Approved",
        approvedBy: user.fullName,
        approvedAt: (/* @__PURE__ */ new Date()).toISOString(),
        immutable: true
      });
      appendAuditLog(db, user, {
        action: "MEMBER_PAYMENT_RECORDED",
        resource: "members",
        sectorScope: "Organisation",
        targetId: member.id,
        summary: `Recorded UGX ${Math.round(numericAmount).toLocaleString("en-US")} contribution payment (${payRef}) for ${member.fullName}. New status: ${member.paymentStatus}.`
      });
      writeDatabase(db);
      res.status(201).json({ member });
    }
  );
  router.post(
    "/transactions",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      const body = req.body;
      if (!hasPermission(user, db.rolePermissions, "finance", "create", body.scope)) {
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot record financial transactions for ${body.scope}.`
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
          scope: body.scope
        },
        db.transactions
      );
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const needsApproval = requiresApproval(body.type);
      const canAutoApprove = !needsApproval || user.role === "Founder / Super Administrator" && !needsApproval;
      const newTx = {
        id: `tx-${Date.now()}`,
        reference: body.reference.trim().toUpperCase(),
        amount: Number(body.amount),
        type: body.type,
        date: body.date,
        description: body.description.trim(),
        scope: body.scope,
        projectId: body.projectId || void 0,
        recordedBy: user.fullName,
        recordedByUserId: user.id,
        approvalStatus: canAutoApprove ? "Approved" : "Pending",
        approvedBy: canAutoApprove ? user.fullName : void 0,
        approvedAt: canAutoApprove ? (/* @__PURE__ */ new Date()).toISOString() : void 0,
        immutable: true
      };
      db.transactions.unshift(newTx);
      if (newTx.approvalStatus === "Approved" && newTx.projectId) {
        const proj = db.projects.find((p) => p.id === newTx.projectId);
        if (proj) {
          if (newTx.type === "Project investment") {
            proj.investmentReceived += newTx.amount;
          } else if (newTx.type === "Operational expenditure") {
            proj.expenditure += newTx.amount;
          } else if (newTx.type === "Revenue generated") {
            proj.revenue += newTx.amount;
          }
        }
      }
      appendAuditLog(db, user, {
        action: newTx.approvalStatus === "Pending" ? "TRANSACTION_SUBMITTED" : "TRANSACTION_RECORDED",
        resource: "finance",
        sectorScope: newTx.scope,
        targetId: newTx.id,
        summary: `Recorded ${newTx.type} ${newTx.reference} (UGX ${Math.round(newTx.amount).toLocaleString("en-US")}) in ${newTx.scope === "Organisation" ? "Organisation" : SECTOR_LABELS[newTx.scope]} [${newTx.approvalStatus}].`
      });
      writeDatabase(db);
      res.status(201).json({ transaction: newTx });
    }
  );
  router.post(
    "/transactions/:id/decision",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      const tx = db.transactions.find((t) => t.id === req.params.id);
      if (!tx) {
        res.status(404).json({ error: "Transaction not found." });
        return;
      }
      if (!hasPermission(
        user,
        db.rolePermissions,
        "finance",
        "approve",
        "Organisation"
      )) {
        appendAuditLog(db, user, {
          action: "UNAUTHORIZED_APPROVAL_ATTEMPT",
          resource: "finance",
          sectorScope: tx.scope,
          targetId: tx.id,
          summary: `${user.fullName} (${user.role}) attempted unauthorized approval on ${tx.reference}.`
        });
        writeDatabase(db);
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot approve or reject financial transactions.`
        });
        return;
      }
      if (tx.approvalStatus !== "Pending") {
        res.status(400).json({
          error: `Transaction ${tx.reference} is already ${tx.approvalStatus} and cannot be altered.`
        });
        return;
      }
      const { decision, reason } = req.body;
      if (decision !== "Approved" && decision !== "Rejected") {
        res.status(400).json({ error: "Decision must be Approved or Rejected." });
        return;
      }
      tx.approvalStatus = decision;
      tx.approvedBy = user.fullName;
      tx.approvedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (decision === "Rejected" && reason) {
        tx.rejectionReason = reason.trim();
      }
      if (decision === "Approved" && tx.projectId) {
        const proj = db.projects.find((p) => p.id === tx.projectId);
        if (proj) {
          if (tx.type === "Project investment") {
            proj.investmentReceived += tx.amount;
          } else if (tx.type === "Operational expenditure") {
            proj.expenditure += tx.amount;
          } else if (tx.type === "Revenue generated") {
            proj.revenue += tx.amount;
          }
        }
      }
      appendAuditLog(db, user, {
        action: decision === "Approved" ? "TRANSACTION_APPROVED" : "TRANSACTION_REJECTED",
        resource: "finance",
        sectorScope: tx.scope,
        targetId: tx.id,
        summary: `${decision} ${tx.type} ${tx.reference} (UGX ${Math.round(tx.amount).toLocaleString("en-US")}).`
      });
      writeDatabase(db);
      res.json({ transaction: tx });
    }
  );
  router.post("/projects", requireAuth, (req, res) => {
    const user = req.sessionUser;
    const db = readDatabase();
    const body = req.body;
    if (!hasPermission(
      user,
      db.rolePermissions,
      "projects",
      "create",
      body.sectorId
    )) {
      res.status(403).json({
        error: `Permission denied: ${user.role} cannot create projects in ${SECTOR_LABELS[body.sectorId]}.`
      });
      return;
    }
    if (!body.name || body.name.trim().length < 3) {
      res.status(400).json({ error: "Project name must be at least 3 characters." });
      return;
    }
    if (!Number.isFinite(Number(body.budget)) || Number(body.budget) <= 0) {
      res.status(400).json({ error: "Project budget must be greater than zero." });
      return;
    }
    const manager = db.members.find((m) => m.id === body.managerMemberId);
    const project = {
      id: `prj-${Date.now()}`,
      name: body.name.trim(),
      description: body.description?.trim() || "Sector operational initiative.",
      sectorId: body.sectorId,
      managerMemberId: manager?.id || user.memberId || "mem-1",
      managerName: manager?.fullName || user.fullName,
      budget: Number(body.budget),
      investmentReceived: 0,
      expenditure: 0,
      revenue: 0,
      status: body.status || "Planning",
      startDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      progressRecords: [
        {
          id: `prg-${Date.now()}`,
          date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          note: "Project charter created and assigned to sector workspace.",
          completionPercent: 10,
          recordedBy: user.fullName
        }
      ]
    };
    db.projects.unshift(project);
    appendAuditLog(db, user, {
      action: "PROJECT_CREATED",
      resource: "projects",
      sectorScope: project.sectorId,
      targetId: project.id,
      summary: `Created project "${project.name}" under ${SECTOR_LABELS[project.sectorId]} with UGX ${Math.round(project.budget).toLocaleString("en-US")} budget.`
    });
    writeDatabase(db);
    res.status(201).json({ project });
  });
  router.post(
    "/projects/:id/progress",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      const project = db.projects.find((p) => p.id === req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found." });
        return;
      }
      if (!hasPermission(
        user,
        db.rolePermissions,
        "projects",
        "edit",
        project.sectorId
      )) {
        res.status(403).json({
          error: `Permission denied: cannot update progress for ${SECTOR_LABELS[project.sectorId]}.`
        });
        return;
      }
      const { note, completionPercent, status } = req.body;
      if (!note || note.trim().length < 4) {
        res.status(400).json({ error: "Progress update note is required." });
        return;
      }
      const pct = Math.min(100, Math.max(0, Number(completionPercent) || 0));
      project.progressRecords.push({
        id: `prg-${Date.now()}`,
        date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        note: note.trim(),
        completionPercent: pct,
        recordedBy: user.fullName
      });
      if (status) {
        project.status = status;
      } else if (pct === 100) {
        project.status = "Completed";
      }
      appendAuditLog(db, user, {
        action: "PROJECT_PROGRESS_LOGGED",
        resource: "projects",
        sectorScope: project.sectorId,
        targetId: project.id,
        summary: `Updated "${project.name}" progress to ${pct}% (${project.status}).`
      });
      writeDatabase(db);
      res.json({ project });
    }
  );
  router.post(
    "/sectors/:sectorId/operations",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      const sectorId = req.params.sectorId;
      if (!ALL_SECTORS.includes(sectorId)) {
        res.status(400).json({ error: "Invalid sector identifier." });
        return;
      }
      if (!hasPermission(
        user,
        db.rolePermissions,
        "sector_operations",
        "create",
        sectorId
      )) {
        res.status(403).json({
          error: `Permission denied: ${user.role} cannot log operational entries in ${SECTOR_LABELS[sectorId]}.`
        });
        return;
      }
      const body = req.body;
      if (!body.title || body.title.trim().length < 3) {
        res.status(400).json({ error: "Activity title is required." });
        return;
      }
      const record = {
        id: `op-${Date.now()}`,
        sectorId,
        date: body.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        category: body.category || "Operations",
        title: body.title.trim(),
        unitLabel: body.unitLabel || "units",
        primaryQuantity: Number(body.primaryQuantity) || 0,
        secondaryLabel: body.secondaryLabel || void 0,
        secondaryQuantity: body.secondaryQuantity !== void 0 ? Number(body.secondaryQuantity) : void 0,
        operatingCost: Math.max(0, Number(body.operatingCost) || 0),
        revenueGenerated: Math.max(0, Number(body.revenueGenerated) || 0),
        notes: body.notes?.trim() || "",
        recordedBy: user.fullName
      };
      db.sectorOperations.unshift(record);
      appendAuditLog(db, user, {
        action: "SECTOR_OPERATION_LOGGED",
        resource: "sector_operations",
        sectorScope: sectorId,
        targetId: record.id,
        summary: `Logged ${SECTOR_LABELS[sectorId]} ${record.category}: "${record.title}" (${record.primaryQuantity} ${record.unitLabel}).`
      });
      writeDatabase(db);
      res.status(201).json({ operation: record });
    }
  );
  router.put(
    "/roles/permissions",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      if (!hasPermission(
        user,
        db.rolePermissions,
        "roles",
        "edit",
        "Organisation"
      )) {
        res.status(403).json({
          error: `Permission denied: Only Founder / Super Administrator can modify role permissions.`
        });
        return;
      }
      const { rolePermissions } = req.body;
      if (!rolePermissions || !rolePermissions["Founder / Super Administrator"]) {
        res.status(400).json({ error: "Invalid role permission configuration." });
        return;
      }
      if (!rolePermissions["Founder / Super Administrator"].roles.includes("edit")) {
        rolePermissions["Founder / Super Administrator"].roles.push("edit");
      }
      db.rolePermissions = rolePermissions;
      appendAuditLog(db, user, {
        action: "RBAC_PERMISSIONS_UPDATED",
        resource: "roles",
        sectorScope: "Organisation",
        summary: `Updated organisation-wide role permission matrix.`
      });
      writeDatabase(db);
      res.json({ rolePermissions: db.rolePermissions });
    }
  );
  router.get(
    "/reports/export",
    requireAuth,
    (req, res) => {
      const user = req.sessionUser;
      const db = readDatabase();
      if (!hasPermission(user, db.rolePermissions, "reports", "view", "Organisation")) {
        res.status(403).json({
          error: "Permission denied: your role cannot export organisation reports."
        });
        return;
      }
      const reportType = String(req.query.type || "overview");
      let csv = "";
      const escapeCsv = (val) => {
        const s = String(val ?? "");
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replaceAll('"', '""')}"`;
        }
        return s;
      };
      if (reportType === "membership" || reportType === "contributions") {
        csv = [
          "Member Code,Full Name,Email,Phone,Date Joined,Status,Primary Role,Sectors,Requirement (UGX),Amount Paid (UGX),Outstanding (UGX),Payment Status",
          ...db.members.map(
            (m) => [
              m.memberCode,
              m.fullName,
              m.email,
              m.phone,
              m.dateJoined,
              m.status,
              m.primaryRole,
              m.sectorAssignments.map((s) => `${SECTOR_LABELS[s.sectorId]} (${s.role})`).join(" | "),
              Math.round(m.contributionRequirement),
              Math.round(m.amountPaid),
              Math.round(m.outstandingBalance),
              m.paymentStatus
            ].map(escapeCsv).join(",")
          )
        ].join("\n");
      } else if (reportType === "sector_finances" || reportType === "funding") {
        const rows = calculateSectorFinancials(db.transactions, ALL_SECTORS);
        csv = [
          "Sector,Allocated Funds (UGX),Operational Expenditure (UGX),Project Investment (UGX),Remaining Allocation (UGX),Revenue Generated (UGX),Net Position (UGX)",
          ...rows.map(
            (r) => [
              SECTOR_LABELS[r.sectorId],
              Math.round(r.allocated),
              Math.round(r.expenditure),
              Math.round(r.projectInvestment),
              Math.round(r.remainingAllocation),
              Math.round(r.revenue),
              Math.round(r.netPosition)
            ].map(escapeCsv).join(",")
          )
        ].join("\n");
      } else if (reportType === "projects") {
        csv = [
          "Project Name,Sector,Manager,Status,Budget (UGX),Investment Received (UGX),Expenditure (UGX),Revenue (UGX),Latest Progress %",
          ...db.projects.map((p) => {
            const latest = p.progressRecords[p.progressRecords.length - 1]?.completionPercent ?? 0;
            return [
              p.name,
              SECTOR_LABELS[p.sectorId],
              p.managerName,
              p.status,
              Math.round(p.budget),
              Math.round(p.investmentReceived),
              Math.round(p.expenditure),
              Math.round(p.revenue),
              `${latest}%`
            ].map(escapeCsv).join(",");
          })
        ].join("\n");
      } else if (reportType === "production") {
        csv = [
          "Date,Sector,Category,Activity Title,Quantity,Unit,Operating Cost (UGX),Revenue Generated (UGX),Recorded By",
          ...db.sectorOperations.map(
            (op) => [
              op.date,
              SECTOR_LABELS[op.sectorId],
              op.category,
              op.title,
              op.primaryQuantity,
              op.unitLabel,
              Math.round(op.operatingCost),
              Math.round(op.revenueGenerated),
              op.recordedBy
            ].map(escapeCsv).join(",")
          )
        ].join("\n");
      } else {
        csv = [
          "Reference,Date,Type,Scope,Amount (UGX),Approval Status,Recorded By,Description",
          ...db.transactions.map(
            (t) => [
              t.reference,
              t.date,
              t.type,
              t.scope === "Organisation" ? "Organisation" : SECTOR_LABELS[t.scope],
              Math.round(t.amount),
              t.approvalStatus,
              t.recordedBy,
              t.description
            ].map(escapeCsv).join(",")
          )
        ].join("\n");
      }
      appendAuditLog(db, user, {
        action: "REPORT_EXPORTED",
        resource: "reports",
        sectorScope: "Organisation",
        summary: `Exported ${reportType} report CSV.`
      });
      writeDatabase(db);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="genz-agririse-${reportType}-report.csv"`
      );
      res.send(csv);
    }
  );
  return router;
}

// server.ts
async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3e3;
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createApiRouter());
  if (process.env.NODE_ENV === "production") {
    const distPath = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  } else {
    const disableHmr = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : void 0
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Gen Z AgriRise server listening on http://localhost:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
