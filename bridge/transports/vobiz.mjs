import { decodeMuLaw,encodeMuLaw } from './audio.mjs';

export class VobizTransport {
  constructor(ws,claims) {
    this.ws=ws;this.claims=claims;this.name='vobiz';this.chunkBytes=320;
    this.sequence=0;this.streamId=null;this.checkpointTimer=null;this.pendingStop=false;this.lastCheckpoint=null;
  }
  normalize(frame) {
    if(frame.event==='start') {
      const start=frame.start;
      if(this.streamId) throw new Error('Duplicate media start');
      if(!start || start.callId!==this.claims.provider_call_id || typeof start.streamId!=='string' ||
        start.mediaFormat?.encoding!=='audio/x-mulaw' || Number(start.mediaFormat?.sampleRate)!==8000) throw new Error('Invalid media handshake');
      this.streamId=start.streamId;
      return {event:'start',start:{call_sid:`vobiz:${start.callId}`,stream_sid:start.streamId,
        media_format:{sample_rate:8000}}};
    }
    if(frame.event==='playedStream') {
      if(frame.name===this.lastCheckpoint) {
        clearTimeout(this.checkpointTimer);this.checkpointTimer=null;
        if(this.pendingStop) this._stopNow();
      }
      return {event:'transport_ack'};
    }
    if(frame.event==='clearedAudio') return {event:'transport_ack'};
    if(frame.event==='media') {
      if(!this.streamId || frame.streamId!==this.streamId || frame.media?.track!=='inbound' ||
        typeof frame.media?.payload!=='string' || frame.media.payload.length>8192) throw new Error('Invalid media frame');
      return frame;
    }
    return {event:'transport_ack'};
  }
  decode(payload) { return decodeMuLaw(Buffer.from(payload,'base64')); }
  send(frame) {
    if(this.ws.readyState!==1) return false;
    try { this.ws.send(JSON.stringify(frame)); return true; }catch{return false;}
  }
  media(pcm) {
    // Keep provider playback chunks at 20 ms for responsive clearAudio.
    let sent=false;
    for(let i=0;i<pcm.length;i+=320) {
      sent=this.send({event:'playAudio',streamId:this.streamId,media:{contentType:'audio/x-mulaw',sampleRate:8000,
        payload:encodeMuLaw(pcm.subarray(i,i+320)).toString('base64')}})||sent;
    }
    return sent;
  }
  clear() {
    clearTimeout(this.checkpointTimer);this.checkpointTimer=null;this.lastCheckpoint=null;
    return this.send({event:'clearAudio',streamId:this.streamId});
  }
  checkpoint() {
    if(!this.streamId) return;
    clearTimeout(this.checkpointTimer);
    this.lastCheckpoint=`turn-${++this.sequence}`;
    this.send({event:'checkpoint',streamId:this.streamId,name:this.lastCheckpoint});
    this.checkpointTimer=setTimeout(()=>{this.checkpointTimer=null;if(this.pendingStop)this._stopNow();},15000);
    this.checkpointTimer.unref?.();
  }
  stop() {
    this.pendingStop=true;
    if(!this.checkpointTimer) this._stopNow();
  }
  _stopNow() {
    this.send({event:'stop',streamId:this.streamId});
    if(this.ws.readyState===1) this.ws.close(1000,'Assistant ended call');
  }
  dispose() { clearTimeout(this.checkpointTimer); }
}
