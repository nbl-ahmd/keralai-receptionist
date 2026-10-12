import { decodeALaw, encodeALaw } from './audio.mjs';

/** Documented media adapter only. Intentionally NOT mounted on the public bridge.
 * Claims must come from a future authenticated, authoritative admission path,
 * never from this provider's unverified `start` message or custom parameters.
 */
export class VoiceLinkTransport {
  constructor(ws, claims) {
    if (claims.provider !== 'voicelink' ||
        ['provider_call_id', 'provider_account_id', 'from', 'to'].some(key => typeof claims[key] !== 'string' || !claims[key])) {
      throw new Error('Authenticated VoiceLink call context required');
    }
    this.ws = ws; this.claims = claims; this.name = 'voicelink'; this.chunkBytes = 320;
    this.streamId = null; this.sequence = 0; this.lastCheckpoint = null;
    this.checkpointTimer = null; this.pendingStop = false;
  }
  normalize(frame) {
    if (!frame || typeof frame !== 'object') throw new Error('Invalid media frame');
    if (frame.event === 'connected') return { event: 'transport_ack' };
    if (frame.event === 'start') {
      const start = frame.start;
      if (this.streamId || !start || start.call_sid !== this.claims.provider_call_id ||
          start.account_sid !== this.claims.provider_account_id || start.from !== this.claims.from || start.to !== this.claims.to ||
          typeof start.stream_sid !== 'string' || !start.stream_sid || start.stream_sid.length > 128 ||
          frame.stream_sid !== start.stream_sid || start.media_format?.encoding !== 'audio/alaw' ||
          Number(start.media_format?.sample_rate) !== 8000) throw new Error('Invalid media handshake');
      this.streamId = start.stream_sid;
      return { event: 'start', start: { call_sid: `voicelink:${start.call_sid}`, stream_sid: this.streamId,
        media_format: { sample_rate: 8000 } } };
    }
    if (!this.streamId) throw new Error('Media start required');
    if (frame.stream_sid !== undefined && frame.stream_sid !== this.streamId) throw new Error('Invalid stream identity');
    if (frame.event === 'media') {
      if (frame.media?.track !== 'inbound') throw new Error('Invalid media track');
      this.validatePayload(frame.media?.payload);
      return { ...frame, stream_sid: this.streamId };
    }
    if (frame.event === 'mark') {
      if (frame.mark?.name === this.lastCheckpoint) {
        clearTimeout(this.checkpointTimer); this.checkpointTimer = null; this.lastCheckpoint = null;
        if (this.pendingStop) this.close();
      }
      return { event: 'transport_ack' };
    }
    if (frame.event === 'stop') {
      if (frame.stop?.callSid !== this.claims.provider_call_id) throw new Error('Invalid stop identity');
      return { event: 'stop', stop: { call_sid: `voicelink:${this.claims.provider_call_id}` } };
    }
    throw new Error('Unsupported VoiceLink event');
  }
  validatePayload(payload) {
    if (typeof payload !== 'string' || !payload.length || payload.length > 8192 ||
        payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) throw new Error('Invalid audio payload');
    if (Buffer.from(payload, 'base64').toString('base64') !== payload) throw new Error('Invalid audio payload');
  }
  decode(payload) { this.validatePayload(payload); return decodeALaw(Buffer.from(payload, 'base64')); }
  send(frame) {
    if (this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(frame)); return true; } catch { return false; }
  }
  media(pcm) {
    if (!this.streamId) throw new Error('Media start required');
    if (pcm.length % 2 !== 0) throw new Error('PCM16 requires complete samples');
    let sent = false;
    for (let i = 0; i < pcm.length; i += 320) {
      sent = this.send({ event: 'media', media: { payload: encodeALaw(pcm.subarray(i, i + 320)).toString('base64') } }) || sent;
    }
    return sent;
  }
  clear() {
    if (!this.streamId) throw new Error('Media start required');
    this.dispose(); this.lastCheckpoint = null;
    return this.send({ event: 'clear', stream_sid: this.streamId });
  }
  checkpoint() {
    if (!this.streamId) return;
    this.dispose(); this.lastCheckpoint = `turn-${++this.sequence}`;
    this.send({ event: 'mark', mark: { name: this.lastCheckpoint } });
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = null;
      if (this.pendingStop) this.close();
    }, 15000);
    this.checkpointTimer.unref?.();
  }
  stop() { this.pendingStop = true; if (!this.checkpointTimer) this.close(); }
  // WebSocket closure is not proof of PSTN hangup or billable duration.
  // A future live adapter must issue authenticated hangup and reconcile CDRs.
  close() { if (this.ws.readyState === 1) this.ws.close(1000, 'Assistant ended stream'); }
  dispose() { clearTimeout(this.checkpointTimer); this.checkpointTimer = null; }
}
