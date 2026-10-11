export class ExotelTransport {
  constructor(ws) { this.ws=ws; this.name='exotel'; }
  normalize(frame) { return frame; }
  decode(payload) { return Buffer.from(payload,'base64'); }
  send(frame) {
    if(this.ws.readyState!==1) return false;
    try {this.ws.send(JSON.stringify(frame));return true;}catch{return false;}
  }
  media(pcm,streamId,streamKey) {
    return this.send({event:'media',[streamKey]:streamId,media:{payload:pcm.toString('base64')}});
  }
  clear(streamId,streamKey) { return this.send({event:'clear',[streamKey]:streamId}); }
  checkpoint() {}
  stop() { if(this.ws.readyState===1) this.ws.close(1000,'Assistant ended call'); }
  dispose() {}
}
