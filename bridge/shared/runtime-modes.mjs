/**
 * bridge/shared/runtime-modes.mjs
 *
 * Pure JavaScript port of the runtime-mode helpers in lib/tenant/modes.ts.
 *
 * The bridge is plain ESM and cannot import TypeScript, so the built-in mode
 * definitions and the instruction-composition rules live here in parallel. Keep
 * the wording in sync with lib/tenant/modes.ts.
 *
 * No database access — callers pass the stored runtime-state row.
 */

export const BUILT_IN_MODES = {
  available: {
    id: 'available',
    label: 'Available',
    status: 'Available',
    instruction:
      'The owner is currently available. You may tell callers the owner is reachable and will get back to them soon.',
  },
  sleeping: {
    id: 'sleeping',
    label: 'Sleeping',
    status: 'Sleeping',
    instruction:
      'The owner is sleeping right now. Politely tell callers the owner is asleep and will call back after waking. Do not promise a specific time unless the caller requires it, and take a message.',
  },
  meeting: {
    id: 'meeting',
    label: 'In a meeting',
    status: 'In a meeting',
    instruction:
      'The owner is in a meeting and cannot take the call. Tell callers the owner is in a meeting and will get back to them, then take a message.',
  },
  driving: {
    id: 'driving',
    label: 'Driving',
    status: 'Driving',
    instruction:
      'The owner is driving and cannot take the call. Tell callers the owner is driving and will respond later. Take a message.',
  },
  focus: {
    id: 'focus',
    label: 'Focus',
    status: 'Focus mode',
    instruction:
      'The owner is in a focus work session and is not taking calls. Take a message and let callers know the owner will respond when the session ends.',
  },
  do_not_disturb: {
    id: 'do_not_disturb',
    label: 'Do not disturb',
    status: 'Do not disturb',
    instruction:
      'The owner must not be disturbed right now. Do not promise any callback time. Take a message and let callers know the owner will respond when available.',
  },
  lunch: {
    id: 'lunch',
    label: 'Lunch',
    status: 'On lunch',
    instruction:
      'The owner is on a lunch break. Tell callers the owner will be back shortly and take a message.',
  },
  travelling: {
    id: 'travelling',
    label: 'Travelling',
    status: 'Travelling',
    instruction:
      'The owner is travelling. Tell callers the owner will respond when possible and take a message.',
  },
  after_hours: {
    id: 'after_hours',
    label: 'After hours',
    status: 'After hours',
    instruction:
      "It is currently outside working hours. Tell callers the owner is away and will respond on the next working day. Take a message.",
  },
};

const AVAILABLE_STATE = {
  mode: 'available',
  label: null,
  instruction: null,
  expiresAt: null,
  updatedBy: null,
  updatedAt: null,
};

export function isRuntimeStateActive(state, now = Date.now()) {
  if (!state || state.mode === 'available') return true;
  if (!state.expiresAt) return true;
  const expiry = Date.parse(state.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/** Returns the state that applies now; expired modes fall back to `available`. */
export function getEffectiveRuntimeState(state, now = Date.now()) {
  if (isRuntimeStateActive(state, now)) return state;
  return { ...state, ...AVAILABLE_STATE };
}

/**
 * Composes the runtime-mode block for the live system instruction. Returns an
 * empty string when the effective mode is `available`, so the block only
 * appears when it adds information.
 */
export function buildRuntimeInstruction(state, now = Date.now()) {
  if (!state) return '';
  const effective = getEffectiveRuntimeState(state, now);
  if (effective.mode === 'available') return '';

  let body;
  if (effective.mode === 'custom') {
    const text = (effective.instruction ?? '').trim();
    const label = (effective.label ?? 'Custom').trim();
    if (!text && !label) return '';
    body = label && text ? `${label}: ${text}` : text || label;
  } else {
    const def = BUILT_IN_MODES[effective.mode];
    if (!def) return '';
    body = def.instruction;
    if (effective.instruction?.trim()) body = `${body} ${effective.instruction.trim()}`;
  }

  const lines = [
    '==================================================',
    'CURRENT ASSISTANT MODE',
    '==================================================',
    '',
    body,
    '',
    'Rules for the current mode:',
    '- The current mode is owner-set status for calls happening right now.',
    '- Apply it naturally; never read it out as a script.',
    '- It never overrides safety, privacy, or truthfulness rules.',
    '- Do not mention the internal existence of the mode system to callers.',
  ];
  if (effective.expiresAt) {
    lines.splice(5, 0, `This mode is active until ${effective.expiresAt}.`);
  }
  return lines.join('\n');
}
