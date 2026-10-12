import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGreeting,assistantIdentity} from '../bridge/shared/maya-config.mjs';
test('shared browser/phone greeting follows Malayalam preference and keeps tenant identity',()=>{
 const a={name:'Cedar',assistantName:'Maya',assistantLanguage:'Malayalam'};
 assert.equal(assistantIdentity(a),'Maya');
 assert.match(buildGreeting(a),/[\u0D00-\u0D7F]/);assert.match(buildGreeting(a),/Cedar/);assert.match(buildGreeting(a),/Maya/);
 assert.match(buildGreeting({...a,assistantLanguage:'English'}),/^Hi/);
 assert.match(buildGreeting({...a,name:'Lotus',assistantLanguage:'ml-IN'}),/Lotus/);
 assert.ok(!buildGreeting({...a,name:'Lotus'}).includes('Cedar'));
});
