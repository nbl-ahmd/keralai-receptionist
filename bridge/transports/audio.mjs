// G.711 mu-law, raw mono PCM16 LE. No WAV headers on the media path.
export function decodeMuLaw(input) {
  const out=Buffer.alloc(input.length*2);
  for(let i=0;i<input.length;i++) {
    const u=(~input[i])&255;
    const sample=(((u&15)<<3)+132)<<((u&112)>>4);
    out.writeInt16LE((u&128) ? 132-sample : sample-132,i*2);
  }
  return out;
}
export function encodeMuLaw(input) {
  const out=Buffer.alloc(Math.floor(input.length/2));
  for(let i=0;i<out.length;i++) {
    let sample=input.readInt16LE(i*2),sign=0;
    if(sample<0) {sign=128;sample=-sample;}
    sample=Math.min(32635,sample)+132;
    let exponent=7;
    for(let mask=0x4000;exponent>0 && !(sample&mask);mask>>=1) exponent--;
    out[i]=(~(sign | (exponent<<4) | ((sample>>(exponent+3))&15)))&255;
  }
  return out;
}

// G.711 A-law used by VoiceLink's documented 8 kHz WebSocket events.
export function decodeALaw(input) {
  const out = Buffer.alloc(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const value = input[i] ^ 0x55;
    const segment = (value & 0x70) >> 4;
    let sample = (value & 0x0f) << 4;
    sample = segment === 0 ? sample + 8 : (sample + 0x108) << (segment - 1);
    out.writeInt16LE(value & 0x80 ? sample : -sample, i * 2);
  }
  return out;
}
export function encodeALaw(input) {
  if (input.length % 2 !== 0) throw new Error('PCM16 requires complete samples');
  const out = Buffer.alloc(input.length / 2);
  for (let i = 0; i < out.length; i++) {
    let sample = input.readInt16LE(i * 2);
    const mask = sample >= 0 ? 0xd5 : 0x55;
    if (sample < 0) sample = -sample - 1;
    let segment = 0;
    for (let limit = 0xff; sample > limit && segment < 7; limit = (limit << 1) | 1) segment++;
    const quantized = (sample >> (segment < 2 ? 4 : segment + 3)) & 0x0f;
    out[i] = ((segment << 4) | quantized) ^ mask;
  }
  return out;
}
