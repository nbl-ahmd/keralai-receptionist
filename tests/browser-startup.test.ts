import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installBrowserFrames} from '../bridge/browser-frames.mjs';
class Socket extends EventEmitter {
 readyState=1;code=0;
 close(code:number){this.code=code;this.readyState=3;this.emit('close');}
}
test('browser start survives delayed tenant setup and queued frames retain order',async()=>{
 const ws=new Socket(),frames:string[]=[];
 const ready=installBrowserFrames(ws,async(_session:any,frame:any)=>{frames.push(frame.type);},()=>assert.fail('unexpected frame failure'));
 ws.emit('message',Buffer.from('{"type":"start"}'));ws.emit('message',Buffer.from('{"type":"audio"}'));
 assert.deepEqual(frames,[]);
 ready({closed:false,geminiSession:{},close:async()=>{}});
 ws.emit('message',Buffer.from('{"type":"audio"}'));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(frames,['start','audio']);
});
test('startup queue, frame size and closed sockets fail safely',async()=>{
 const ws=new Socket();const ready=installBrowserFrames(ws,async()=>assert.fail('closed socket handled frame'),()=>{});
 for(let i=0;i<5;i++)ws.emit('message',Buffer.from('{"type":"start"}'));
 assert.equal(ws.code,1008);let closed=false;ready({closed:false,close:async()=>{closed=true;}});assert.equal(closed,true);
 const large=new Socket();installBrowserFrames(large,async()=>{},()=>{});large.emit('message',Buffer.alloc(65537));assert.equal(large.code,1009);
});
