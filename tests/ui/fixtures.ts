import {test as base,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
// Each isolated test represents a different client. Keep real auth rate limits
// enabled rather than letting rapid UI fixtures exhaust one shared IP's budget.
export const test=base.extend({
 extraHTTPHeaders:async ({},use,testInfo)=>{
  const digest=createHash('sha256').update(testInfo.testId).digest();
  await use({'x-forwarded-for':`198.18.${digest[0]}.${digest[1]}`});
 },
});
export {expect};
