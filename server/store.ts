import fs from 'node:fs';
import path from 'node:path';
import type {
  AppDatabaseState,
  AuditLogEntry,
  ResourceDomain,
  SectorId,
  SessionUser,
} from '../src/domain/types';
import { createSeedDatabase } from './seedData';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'agririse-db.json');

let memoryCache: AppDatabaseState | null = null;

export function readDatabase(): AppDatabaseState {
  if (memoryCache) {
    return memoryCache;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    memoryCache = seed;
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as AppDatabaseState;
    memoryCache = parsed;
    return parsed;
  } catch {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    memoryCache = seed;
    return seed;
  }
}

export function writeDatabase(nextState: AppDatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(nextState, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
  memoryCache = nextState;
}

export function appendAuditLog(
  db: AppDatabaseState,
  actor: SessionUser,
  params: {
    action: string;
    resource: ResourceDomain;
    sectorScope: 'Organisation' | SectorId;
    targetId?: string;
    summary: string;
  },
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: params.action,
    resource: params.resource,
    sectorScope: params.sectorScope,
    targetId: params.targetId,
    summary: params.summary,
  };
  db.auditLogs.unshift(entry);
  return entry;
}
