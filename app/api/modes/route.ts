import { NextResponse } from 'next/server';
import {
  BUILT_IN_MODES,
  CUSTOM_MODE,
  buildRuntimeInstruction,
  describeRuntimeState,
  getEffectiveRuntimeState,
  getRuntimeState,
  isRuntimeStateActive,
  RUNTIME_MODES,
  setRuntimeState,
  type RuntimeModeId,
} from '@/lib/tenant/modes';
import { handleApiError, resolveTenantContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

const VALID_MODE_IDS = new Set<string>([
  ...Object.keys(BUILT_IN_MODES),
  CUSTOM_MODE.id,
]);

/** Current assistant mode plus the available mode definitions. */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const state = await getRuntimeState(tenantId);
    return NextResponse.json({
      state,
      effective: getEffectiveRuntimeState(state),
      status: describeRuntimeState(state),
      active: isRuntimeStateActive(state),
      modes: RUNTIME_MODES,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load assistant mode');
  }
}

/**
 * Activates a runtime mode. Body: { mode, label?, instruction?, expiresAt? }.
 * `expiresAt` may be null (no expiry). Expired modes fall back to `available`.
 */
export async function POST(request: Request) {
  try {
    const { tenantId, userId } = await resolveTenantContext(request);
    const body = (await request.json()) as {
      mode?: string;
      label?: string | null;
      instruction?: string | null;
      expiresAt?: string | null;
    };

    const mode = (body?.mode ?? '').trim();
    if (!VALID_MODE_IDS.has(mode)) {
      return NextResponse.json({ error: 'Unsupported mode' }, { status: 400 });
    }
    if (mode === CUSTOM_MODE.id && !(body.instruction ?? '').trim() && !(body.label ?? '').trim()) {
      return NextResponse.json({ error: 'A custom mode needs a label or instruction' }, { status: 400 });
    }

    let expiresAt: string | null = null;
    if (body.expiresAt) {
      const parsed = Date.parse(body.expiresAt);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: 'expiresAt must be a valid date' }, { status: 400 });
      }
      expiresAt = new Date(parsed).toISOString();
    }

    const state = await setRuntimeState(tenantId, {
      mode: mode as RuntimeModeId,
      label: body.label ?? null,
      instruction: body.instruction ?? null,
      expiresAt,
      updatedBy: userId,
    });

    return NextResponse.json({
      success: true,
      state,
      status: describeRuntimeState(state),
      instruction: buildRuntimeInstruction(state),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to set assistant mode');
  }
}

/** Clears the mode and returns the assistant to `available`. */
export async function DELETE(request: Request) {
  try {
    const { tenantId, userId } = await resolveTenantContext(request);
    const state = await setRuntimeState(tenantId, { mode: 'available', updatedBy: userId });
    return NextResponse.json({ success: true, state, status: describeRuntimeState(state) });
  } catch (error) {
    return handleApiError(error, 'Failed to clear assistant mode');
  }
}
