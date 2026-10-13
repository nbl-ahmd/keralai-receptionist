/** Customer-safe explanations; no provider identities, raw errors or credentials. */
export function checkoutRecoveryMessage(row: { state: string; provider_order_id: string | null; expires_at: string | null; recovery_code?: string | null }) {
  if (row.state === 'assigned') return 'Your number is assigned. Calls remain unavailable until authenticated routing and carrier controls pass acceptance.';
  if (row.state === 'quoted' && row.expires_at && Date.parse(row.expires_at) > Date.now()) return null;
  if (['creating','draft_unknown'].includes(row.state)) return row.provider_order_id
    ? 'Your saved provider order can be checked without creating another reservation. Refresh after operator reconciliation.'
    : 'The reservation outcome is unknown. Your operator must locate the original draft with VoiceLink support; requesting another quote is blocked.';
  if (['confirming','purchase_unknown','purchased','assignment_unknown'].includes(row.state)) return 'Your operator is checking client-owned inventory. Payment and assignment will not be repeated. Any app balance reservation remains held until the outcome is confirmed.';
  return 'This quote has expired. Your operator must confirm the provider draft has ended before another reservation can be requested.';
}
