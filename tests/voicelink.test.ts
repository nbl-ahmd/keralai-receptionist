import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeALaw, encodeALaw } from '../bridge/transports/audio.mjs';
import { VoiceLinkTransport } from '../bridge/transports/voicelink.mjs';
import { readVoiceLinkQuote, voiceLinkStatus } from '../lib/telephony/providers/voicelink/status';
import { getTelephonyProvider } from '../lib/telephony/provider';
import { authorizePhoneBridge } from '../bridge/telephony.mjs';

test('A-law known vectors and every codeword roundtrip preserve phone codec', () => {
  const decoded = decodeALaw(Buffer.from([0xd5, 0x55, 0xaa, 0x2a]));
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => decoded.readInt16LE(i * 2)), [8, -8, 32256, -32256]);
  const codes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  assert.deepEqual(encodeALaw(decodeALaw(codes)), codes);
  assert.throws(() => encodeALaw(Buffer.alloc(1)));
});

function fixture() {
  const sent: Array<Record<string, unknown>> = []; let closed = false;
  const transport = new VoiceLinkTransport({ readyState: 1, send: (data: string) => sent.push(JSON.parse(data)), close: () => { closed = true; } },
    { provider: 'voicelink', provider_call_id: 'call-A', provider_account_id: '42', from: '+919876543210', to: '+918012345678' });
  const start = { event: 'start', stream_sid: 'stream-A', start: { stream_sid: 'stream-A', call_sid: 'call-A', account_sid: '42',
    from: '+919876543210', to: '+918012345678', media_format: { encoding: 'audio/alaw', sample_rate: '8000' } } };
  return { transport, start, sent, closed: () => closed };
}
test('VoiceLink rejects forged call, account, destination and codec before audio', () => {
  for (const field of ['call_sid', 'account_sid', 'from', 'to', 'stream_sid'] as const) {
    const { transport, start } = fixture();
    assert.throws(() => transport.normalize({ ...start, start: { ...start.start, [field]: 'other' } }));
  }
  const { transport, start } = fixture();
  assert.throws(() => transport.normalize({ ...start, start: { ...start.start, media_format: { encoding: 'audio/x-mulaw', sample_rate: 8000 } } }));
  assert.throws(() => transport.normalize({ event: 'media', media: { track: 'inbound', payload: '1Q==' } }));
  assert.throws(() => new VoiceLinkTransport({}, { provider: 'vobiz' }));
});
test('VoiceLink accepts documented media and sends 20ms A-law playback and interruption clear', () => {
  const { transport, start, sent } = fixture();
  assert.equal(transport.normalize(start).start.call_sid, 'voicelink:call-A');
  assert.throws(() => transport.normalize(start));
  transport.normalize({ event: 'media', media: { track: 'inbound', payload: '1Q==' } });
  assert.equal(transport.decode('1Q==').readInt16LE(0), 8);
  for (const payload of ['1Q', '!!==', '', 'A'.repeat(8196)]) assert.throws(() => transport.decode(payload));
  assert.throws(() => transport.normalize({ event: 'media', stream_sid: 'other', media: { track: 'inbound', payload: '1Q==' } }));
  transport.media(Buffer.alloc(640)); transport.clear(); transport.checkpoint();
  assert.deepEqual(sent.map(frame => frame.event), ['media', 'media', 'clear', 'mark']);
  assert.equal(Buffer.from((sent[0].media as { payload: string }).payload, 'base64').length, 160);
  assert.equal(sent[2].stream_sid, 'stream-A');
  transport.dispose();
});
test('VoiceLink only acknowledges its own playback checkpoint and validates stop call', () => {
  const { transport, start, closed } = fixture(); transport.normalize(start); transport.checkpoint(); transport.stop();
  transport.normalize({ event: 'mark', mark: { name: 'other' } }); assert.equal(closed(), false);
  transport.normalize({ event: 'mark', mark: { name: 'turn-1' } }); assert.equal(closed(), true);
  assert.throws(() => transport.normalize({ event: 'stop', stop: { callSid: 'call-B' } }));
  assert.equal(transport.normalize({ event: 'stop', stop: { callSid: 'call-A' } }).event, 'stop'); transport.dispose();
});
test('VoiceLink quote never falls back to Vobiz prices and accepts only complete explicit quotes', () => {
  const env = { VOICELINK_QUOTE_REFERENCE: 'quote-20261012', VOICELINK_NUMBER_MONTHLY_MINOR: '20000',
    VOICELINK_CHANNEL_MONTHLY_MINOR: '10000', VOICELINK_INBOUND_MINUTE_MINOR: '38', VOICELINK_OUTBOUND_MINUTE_MINOR: '38' };
  assert.equal(readVoiceLinkQuote({ PHONE_MONTHLY_PRICE_MINOR: '60000' }), null);
  assert.equal(readVoiceLinkQuote({ ...env, VOICELINK_CHANNEL_MONTHLY_MINOR: '' }), null);
  assert.equal(readVoiceLinkQuote({ ...env, VOICELINK_INBOUND_MINUTE_MINOR: '-1' }), null);
  assert.equal(readVoiceLinkQuote({ ...env, VOICELINK_INBOUND_MINUTE_MINOR: '0.38' }), null);
  assert.equal(readVoiceLinkQuote({ ...env, VOICELINK_NUMBER_MONTHLY_MINOR: '9007199254740992' }), null);
  assert.equal(readVoiceLinkQuote(env)?.numberMonthlyMinor, 20000);
  assert.equal(readVoiceLinkQuote({ ...env, VOICELINK_INBOUND_MINUTE_MINOR: '0' })?.inboundMinuteMinor, 0);
});
test('VoiceLink stays unavailable even with flags and quotes; Vobiz remains the default', async () => {
  assert.equal(voiceLinkStatus({ VOICELINK_ENABLED: '1', VOICELINK_CALLBACK_SIGNATURES_VERIFIED: '1' }).activationReady, false);
  assert.equal(getTelephonyProvider('voicelink').name, 'voicelink');
  assert.equal(getTelephonyProvider('voicelink').activationReady, false);
  await assert.rejects(getTelephonyProvider('voicelink').purchaseNumber({ tenantId: 'A', authId: '1' }, '+918012345678'), /VoiceLink calling needs/);
  assert.equal(getTelephonyProvider().name, 'vobiz');
  assert.throws(() => getTelephonyProvider('unknown'));
  assert.equal(await authorizePhoneBridge({ provider: 'voicelink' }), null);
});
