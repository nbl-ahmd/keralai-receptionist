import TelephonyReadiness from '@/components/dashboard/TelephonyReadiness';
import { Notice } from '@/components/ui/notice';
export default function ProvidersPage() {
  return <div className="max-w-4xl space-y-6"><Notice tone="info">These checks verify server configuration and deployment. Enabling a platform control does not verify provider signatures or activate calling.</Notice><TelephonyReadiness/></div>;
}
