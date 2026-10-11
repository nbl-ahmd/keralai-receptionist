import { domainRoute } from '@/lib/telephony/http';
import { searchNumbers } from '@/lib/telephony/service';
import { HttpError } from '@/lib/auth/context';
export const dynamic = 'force-dynamic';
export const GET = (r: Request) => domainRoute(r,id => {
 const params=new URL(r.url).searchParams;
 const search=params.get('search') ?? '',page=Number(params.get('page') ?? 1);
 if (!Number.isInteger(page) || page<1 || page>1000 || !/^[+0-9]{0,16}$/.test(search)) throw new HttpError(400,'Invalid number search');
 return searchNumbers(id,{search,page});
});
