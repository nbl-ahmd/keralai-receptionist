"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { phoneApi } from '@/lib/telephony/client-ui';

export default function ExistingVoiceLinkClientLink({ tenantId, name, disabled, reason, onLinked }:
  { tenantId: string; name: string; disabled: boolean; reason: string; onLinked: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [clientId, setClientId] = useState(''), [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function link() {
    setBusy(true); setError('');
    try {
      await phoneApi('/api/admin/telephony', { tenantId, provider: 'voicelink', action: 'link_voicelink_client', providerClientId: clientId, reference, reason });
      await onLinked(); setOpen(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to connect this client.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => { setOpen(true); setClientId(''); setReference(''); setError(''); }}>Connect existing VoiceLink client</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="Connect existing VoiceLink client"
      description={`Connect a provider client created for ${name}. This does not purchase resources or activate calls.`} size="sm"
      footer={<><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
        <Button loading={busy} disabled={!reason.trim() || !/^[1-9]\d{0,14}$/.test(clientId) || !/^[a-zA-Z0-9_-]{16,100}$/.test(reference)} onClick={() => void link()}>Connect client</Button></>}>
      <div className="space-y-4">
        <Notice tone="info">The server verifies that this client belongs to your configured reseller, matches a workspace owner’s email and is not linked elsewhere. Sync verification afterward.</Notice>
        <Field label="VoiceLink client ID">{props => <Input {...props} value={clientId} onChange={event => setClientId(event.target.value)} inputMode="numeric" maxLength={15}/>}</Field>
        <Field label="Operation reference" hint="16–100 letters, digits, underscores or hyphens. Use a unique reference for this link.">{props => <Input {...props} value={reference} onChange={event => setReference(event.target.value)} maxLength={100}/>}</Field>
        {!reason.trim() && <p className="text-sm text-muted-foreground">Enter an operator reason on the administration page first.</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Dialog>
  </>;
}
