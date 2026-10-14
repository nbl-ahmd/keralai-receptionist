/** Provider return parameters are not authorization evidence. Drop them before rendering. */
export function GET(request:Request) {
  const origin=new URL(process.env.BETTER_AUTH_URL??request.url).origin;
  return new Response(null,{status:303,headers:{Location:`${origin}/dashboard/phone?provider=voicelink`,
    'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
