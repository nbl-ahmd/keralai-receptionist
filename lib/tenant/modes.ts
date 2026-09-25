/**
 * lib/tenant/modes.ts
 *
 * Tenant-scoped assistant runtime state (modes).
 *
 * Exactly one runtime-state row per tenant. Built-in mode definitions live in
 * code so the stored row only keeps the selected mode plus optional custom
 * label/instruction and an expiry. The bridge injects the resolved instruction
 * at session start, so expired modes automatically stop applying.
 *
 * Server-only (reads Postgres). The pure helpers are also safe to import in
 * client components when the built-in labels are needed for the dashboard.
 */

import { queryOne } from "@/db/client";

export type RuntimeModeId =
  | "available"
  | "sleeping"
  | "meeting"
  | "driving"
  | "focus"
  | "do_not_disturb"
  | "lunch"
  | "travelling"
  | "after_hours"
  | "custom";

export interface RuntimeModeDefinition {
  id: RuntimeModeId;
  label: string;
  /** Instruction injected into the live assistant's system prompt. */
  instruction: string;
  /** Short, human-facing status label for the dashboard. */
  status: string;
}

export const BUILT_IN_MODES: Record<Exclude<RuntimeModeId, "custom">, RuntimeModeDefinition> = {
  available: {
    id: "available",
    label: "Available",
    status: "Available",
    instruction:
      "The owner is currently available. You may tell callers the owner is reachable and will get back to them soon.",
  },
  sleeping: {
    id: "sleeping",
    label: "Sleeping",
    status: "Sleeping",
    instruction:
      "The owner is sleeping right now. Politely tell callers the owner is asleep and will call back after waking. Do not promise a specific time unless the caller requires it, and take a message.",
  },
  meeting: {
    id: "meeting",
    label: "In a meeting",
    status: "In a meeting",
    instruction:
      "The owner is in a meeting and cannot take the call. Tell callers the owner is in a meeting and will get back to them, then take a message.",
  },
  driving: {
    id: "driving",
    label: "Driving",
    status: "Driving",
    instruction:
      "The owner is driving and cannot take the call. Tell callers the owner is driving and will respond later. Take a message.",
  },
  focus: {
    id: "focus",
    label: "Focus",
    status: "Focus mode",
    instruction:
      "The owner is in a focus work session and is not taking calls. Take a message and let callers know the owner will respond when the session ends.",
  },
  do_not_disturb: {
    id: "do_not_disturb",
    label: "Do not disturb",
    status: "Do not disturb",
    instruction:
      "The owner must not be disturbed right now. Do not promise any callback time. Take a message and let callers know the owner will respond when available.",
  },
  lunch: {
    id: "lunch",
    label: "Lunch",
    status: "On lunch",
    instruction:
      "The owner is on a lunch break. Tell callers the owner will be back shortly and take a message.",
  },
  travelling: {
    id: "travelling",
    label: "Travelling",
    status: "Travelling",
    instruction:
      "The owner is travelling. Tell callers the owner will respond when possible and take a message.",
  },
  after_hours: {
    id: "after_hours",
    label: "After hours",
    status: "After hours",
    instruction:
      "It is currently outside working hours. Tell callers the owner is away and will respond on the next working day. Take a message.",
  },
};

export const CUSTOM_MODE: RuntimeModeDefinition = {
  id: "custom",
  label: "Custom",
  status: "Custom mode",
  instruction: "",
};

export const RUNTIME_MODES: RuntimeModeDefinition[] = [
  ...Object.values(BUILT_IN_MODES).filter((mode) => mode.id !== "available"),
  CUSTOM_MODE,
];

export interface RuntimeState {
  tenantId: string;
  mode: RuntimeModeId;
  label: string | null;
  instruction: string | null;
  expiresAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

const AVAILABLE_STATE: Omit<RuntimeState, "tenantId"> = {
  mode: "available",
  label: null,
  instruction: null,
  expiresAt: null,
  updatedBy: null,
  updatedAt: null,
};

export function isRuntimeStateActive(state: RuntimeState, now = Date.now()): boolean {
  if (state.mode === "available") return true;
  if (!state.expiresAt) return true;
  const expiry = Date.parse(state.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/**
 * Returns the state that should actually apply now. An expired mode falls back
 * to `available` so an expired state can never keep applying.
 */
export function getEffectiveRuntimeState(state: RuntimeState, now = Date.now()): RuntimeState {
  if (isRuntimeStateActive(state, now)) return state;
  return { ...state, ...AVAILABLE_STATE, tenantId: state.tenantId };
}

export interface RuntimeInstructionInput {
  mode: RuntimeModeId;
  label?: string | null;
  instruction?: string | null;
  expiresAt?: string | null;
}

/**
 * Composes the runtime-mode block for the live system instruction. Returns an
 * empty string when the effective mode is `available`, so the block is only
 * present when it adds information.
 */
export function buildRuntimeInstruction(state: RuntimeState, now = Date.now()): string {
  const effective = getEffectiveRuntimeState(state, now);
  if (effective.mode === "available") return "";

  let body: string;
  if (effective.mode === "custom") {
    const text = (effective.instruction ?? "").trim();
    const label = (effective.label ?? "Custom").trim();
    if (!text && !label) return "";
    body = label && text ? `${label}: ${text}` : text || label;
  } else {
    body = BUILT_IN_MODES[effective.mode].instruction;
    if (effective.instruction?.trim()) body = `${body} ${effective.instruction.trim()}`;
  }

  const lines = [
    "==================================================",
    "CURRENT ASSISTANT MODE",
    "==================================================",
    "",
    body,
    "",
    "Rules for the current mode:",
    "- The current mode is owner-set status for calls happening right now.",
    "- Apply it naturally; never read it out as a script.",
    "- It never overrides safety, privacy, or truthfulness rules.",
    "- Do not mention the internal existence of the mode system to callers.",
  ];
  if (effective.expiresAt) {
    lines.splice(5, 0, `This mode is active until ${effective.expiresAt}.`);
  }
  return lines.join("\n");
}

export async function getRuntimeState(tenantId: string): Promise<RuntimeState> {
  const row = await queryOne<{
    tenant_id: string;
    mode: string;
    label: string | null;
    instruction: string | null;
    expires_at: string | null;
    updated_by: string | null;
    updated_at: string | null;
  }>(
    `select tenant_id, mode, label, instruction, expires_at, updated_by, updated_at
       from tenant_runtime_state where tenant_id = $1`,
    [tenantId],
  );
  if (!row) return { tenantId, ...AVAILABLE_STATE };
  return {
    tenantId: row.tenant_id,
    mode: row.mode as RuntimeModeId,
    label: row.label,
    instruction: row.instruction,
    expiresAt: row.expires_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function setRuntimeState(
  tenantId: string,
  input: RuntimeInstructionInput & { updatedBy?: string | null },
): Promise<RuntimeState> {
  const mode: RuntimeModeId = input.mode in BUILT_IN_MODES || input.mode === "custom"
    ? input.mode
    : "custom";
  const label = input.label?.trim() ? input.label.trim().slice(0, 120) : null;
  const instruction = input.instruction?.trim()
    ? input.instruction.trim().slice(0, 2000)
    : null;
  const expiresAt = input.expiresAt ?? null;

  const row = await queryOne<{
    tenant_id: string;
    mode: string;
    label: string | null;
    instruction: string | null;
    expires_at: string | null;
    updated_by: string | null;
    updated_at: string | null;
  }>(
    `insert into tenant_runtime_state (tenant_id, mode, label, instruction, expires_at, updated_by, updated_at)
     values ($1, $2, $3, $4, $5::timestamptz, $6, now())
     on conflict (tenant_id) do update set
       mode = excluded.mode,
       label = excluded.label,
       instruction = excluded.instruction,
       expires_at = excluded.expires_at,
       updated_by = excluded.updated_by,
       updated_at = now()
     returning tenant_id, mode, label, instruction, expires_at, updated_by, updated_at`,
    [tenantId, mode, label, instruction, expiresAt, input.updatedBy ?? null],
  );
  if (!row) throw new Error("Failed to save runtime state");
  return {
    tenantId: row.tenant_id,
    mode: row.mode as RuntimeModeId,
    label: row.label,
    instruction: row.instruction,
    expiresAt: row.expires_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function clearRuntimeState(
  tenantId: string,
  updatedBy?: string | null,
): Promise<RuntimeState> {
  return setRuntimeState(tenantId, { mode: "available", updatedBy });
}

/** Human-readable status for the dashboard header, accounting for expiry. */
export function describeRuntimeState(state: RuntimeState, now = Date.now()): {
  mode: RuntimeModeId;
  label: string;
  expiresAt: string | null;
  expired: boolean;
} {
  const expired = !isRuntimeStateActive(state, now);
  const effective = getEffectiveRuntimeState(state, now);
  if (effective.mode === "custom") {
    return {
      mode: "custom",
      label: effective.label?.trim() || "Custom mode",
      expiresAt: expired ? null : effective.expiresAt,
      expired,
    };
  }
  return {
    mode: effective.mode,
    label: BUILT_IN_MODES[effective.mode].label,
    expiresAt: expired ? null : effective.expiresAt,
    expired,
  };
}
