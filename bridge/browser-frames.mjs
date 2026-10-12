// Install before asynchronous tenant setup so the first start frame is retained.
// A bounded queue prevents callers from buffering unbounded data during setup.
export function installBrowserFrames(ws, handle, failed) {
  let session = null, pending = [], chain = Promise.resolve();
  function dispatch(frame) {
    chain = chain.then(async () => {
      if (ws.readyState !== 1 || session.closed) return;
      await handle(session, frame);
    }).catch(failed);
  }
  ws.on('message', raw => {
    if (Buffer.byteLength(raw) > 65536) { ws.close(1009, 'Frame too large'); return; }
    let frame;
    try { frame = JSON.parse(raw.toString()); } catch { ws.close(1003, 'JSON frames required'); return; }
    if (!frame || !['start','audio','stop'].includes(frame.type)) { ws.close(1003, 'Unsupported frame'); return; }
    if(frame.type==='audio' && !session?.geminiSession)return;
    if (!session) {
      if (pending.length >= 4) { pending = []; ws.close(1008, 'Setup queue exceeded'); return; }
      pending.push(frame);
    } else dispatch(frame);
  });
  ws.on('close', () => { pending = []; });
  return value => {
    session = value;
    if (ws.readyState !== 1) { pending = []; void session.close().catch(failed); return; }
    for (const frame of pending) dispatch(frame);
    pending = [];
  };
}
