import {randomBytes,createHash} from 'node:crypto';
import {Pool} from 'pg';
export async function fixtureInvite(email?:string,options:{expired?:boolean;consumed?:boolean}={}) {
 const schema=process.env.TEST_SCHEMA;
 if(!schema||!/^keralai_test_[a-f0-9]{16}$/.test(schema))throw new Error('UI fixtures require an isolated schema');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,query_timeout:15000});
 try{
  const active=await pool.query('select current_schema() as schema');if(active.rows[0].schema!==schema)throw new Error('Refuse public UI fixtures');
  const token=randomBytes(32).toString('base64url');
  await pool.query(`insert into alpha_invites(code_hash,email,created_by,expires_at,status,uses)
   values($1,$2,'ui-fixture',now()+$3*interval '1 day',$4,$5)`,[createHash('sha256').update(token).digest('hex'),email??null,options.expired?-1:7,options.consumed?'consumed':'active',options.consumed?1:0]);
  return token;
 }finally{await pool.end();}
}

export async function loginOperator(page: import('@playwright/test').Page) {
 const response=await page.request.post('/api/auth/sign-in/email',{headers:{Origin:'http://localhost:3210'},data:{email:'platform-operator@example.test',password:'fixture-operator-password-123'}});
 if(!response.ok())throw new Error('Operator fixture login failed');
}
