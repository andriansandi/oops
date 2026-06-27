import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  D1Credentials,
  NeonCredentials,
  InstanceRecord,
} from "@oops/core";

export interface OopsConfig {
  version: 1;
  license: "free" | "pro" | "enterprise";
  activeInstanceId: string | null;
  instances: InstanceRecord[];
}

export const CONFIG_DIR = join(homedir(), ".config", "oops");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const FREE_INSTANCE_LIMIT = 5;

export function emptyConfig(): OopsConfig {
  return {
    version: 1,
    license: "free",
    activeInstanceId: null,
    instances: [],
  };
}

export function ensureConfig(): OopsConfig {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(CONFIG_FILE)) {
    const fresh = emptyConfig();
    writeFileSync(CONFIG_FILE, JSON.stringify(fresh, null, 2), "utf8");
    chmodSync(CONFIG_FILE, 0o600);
    return fresh;
  }
  const raw = readFileSync(CONFIG_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as OopsConfig;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported config version: ${parsed.version}`);
    }
    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse config at ${CONFIG_FILE}: ${(err as Error).message}`,
    );
  }
}

export function saveConfig(cfg: OopsConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
  chmodSync(CONFIG_FILE, 0o600);
}

export function getActiveInstance(cfg: OopsConfig = ensureConfig()): InstanceRecord | null {
  if (!cfg.activeInstanceId) return null;
  return cfg.instances.find((i) => i.id === cfg.activeInstanceId) ?? null;
}

export function findInstanceByName(
  name: string,
  cfg: OopsConfig = ensureConfig(),
): InstanceRecord | null {
  return cfg.instances.find((i) => i.name === name) ?? null;
}

export function canAddInstance(cfg: OopsConfig = ensureConfig()): boolean {
  if (cfg.license !== "free") return true;
  return cfg.instances.length < FREE_INSTANCE_LIMIT;
}

export function addInstance(record: OopsRecord): InstanceRecord {
  const cfg = ensureConfig();
  if (!canAddInstance(cfg)) {
    throw new Error(
      `Free tier limit reached (${FREE_INSTANCE_LIMIT} instances). Run \`oops upgrade\` to unlock unlimited instances.`,
    );
  }
  if (findInstanceByName(record.name, cfg)) {
    throw new Error(`Instance "${record.name}" already exists`);
  }
  const inst: InstanceRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...record,
  };
  cfg.instances.push(inst);
  if (!cfg.activeInstanceId) cfg.activeInstanceId = inst.id;
  saveConfig(cfg);
  return inst;
}

export type OopsRecord =
  | { name: string; type: "d1"; credentials: D1Credentials }
  | { name: string; type: "neon"; credentials: NeonCredentials };

export function removeInstance(nameOrId: string): boolean {
  const cfg = ensureConfig();
  const before = cfg.instances.length;
  cfg.instances = cfg.instances.filter(
    (i) => i.id !== nameOrId && i.name !== nameOrId,
  );
  if (cfg.instances.length === before) return false;
  if (cfg.activeInstanceId && !cfg.instances.find((i) => i.id === cfg.activeInstanceId)) {
    cfg.activeInstanceId = cfg.instances[0]?.id ?? null;
  }
  saveConfig(cfg);
  return true;
}

export function setActiveInstance(nameOrId: string): InstanceRecord {
  const cfg = ensureConfig();
  const inst = cfg.instances.find(
    (i) => i.id === nameOrId || i.name === nameOrId,
  );
  if (!inst) throw new Error(`Instance "${nameOrId}" not found`);
  cfg.activeInstanceId = inst.id;
  saveConfig(cfg);
  return inst;
}

export function instanceHint(inst: InstanceRecord): string {
  if (inst.type === "d1") {
    return inst.credentials.databaseId.slice(0, 8) + "…";
  }
  try {
    const host = new URL(inst.credentials.connectionString).hostname;
    return host.length > 28 ? host.slice(0, 28) + "…" : host;
  } catch {
    return inst.credentials.connectionString.slice(0, 12) + "…";
  }
}
