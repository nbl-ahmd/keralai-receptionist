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
