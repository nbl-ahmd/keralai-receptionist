function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]!));
}
export const unavailableXml = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup reason="busy"/></Response>';
export function streamXml(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'wss:') throw new Error('Secure bridge required');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Stream bidirectional="true" audioTrack="inbound" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" streamTimeout="3600" maxRetries="0">${escapeXml(url)}</Stream><Hangup/></Response>`;
}
