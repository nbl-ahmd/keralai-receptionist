// Public deployment identity only; no environment values or secret fingerprints.
/** @param {Record<string,string|undefined>} env */
export function releaseInfo(env=process.env) {
 const value=env.VERCEL_GIT_COMMIT_SHA??env.RENDER_GIT_COMMIT;
 return {commit:typeof value==='string'&&/^[a-f0-9]{7,40}$/i.test(value)?value:null,phoneSetupVersion:1};
}
