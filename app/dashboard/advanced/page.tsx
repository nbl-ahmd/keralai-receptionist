import AppShell from '@/components/app/AppShell';
import ProviderSettings from '@/components/dashboard/ProviderSettings';
export default function AdvancedPage(){return <AppShell title="Integrations & advanced" description="Configure your AI and CRM connections. Legacy telephony is kept for existing installations." activeRoute="settings" routeMode contentWidth="narrow"><ProviderSettings/></AppShell>;}
