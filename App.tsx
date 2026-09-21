import React, { useState } from 'react';
import { ViewState, KnowledgeItem, Appointment, CompanyProfile } from './types';
import KnowledgeBase from './components/KnowledgeBase';
import CalendarView from './components/CalendarView';
import LiveReceptionist from './components/LiveReceptionist';
import { LayoutDashboard, Database, PhoneCall, Calendar as CalendarIcon, Menu, LogOut, ChevronRight, User } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  
  // Company Profile State - Initialized with generic defaults
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>({
    name: 'Your Business Name',
    industry: 'General Business',
    description: 'A brief description of your business and services.',
    contactEmail: 'contact@example.com',
    contactPhone: '',
    address: 'Kerala, India'
  });

  // Knowledge Items - Empty by default
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [autoConnectLive, setAutoConnectLive] = useState(false);

  const handleBookAppointment = (apt: Appointment) => {
    setAppointments(prev => [apt, ...prev]);
  };

  const renderContent = () => {
    switch (currentView) {
      case ViewState.KNOWLEDGE_BASE:
        return <KnowledgeBase 
            companyProfile={companyProfile}
            onUpdateProfile={setCompanyProfile}
            items={knowledgeItems} 
            onAddItem={(item) => setKnowledgeItems(prev => [...prev, item])}
            onRemoveItem={(id) => setKnowledgeItems(prev => prev.filter(i => i.id !== id))}
        />;
      case ViewState.CALENDAR:
        return <CalendarView appointments={appointments} />;
      case ViewState.LIVE_RECEPTIONIST:
        return <LiveReceptionist 
            companyProfile={companyProfile}
            knowledgeItems={knowledgeItems} 
                        onBookAppointment={handleBookAppointment}
                        autoConnect={autoConnectLive}
                        onAutoConnectHandled={() => setAutoConnectLive(false)}
        />;
      case ViewState.DASHBOARD:
      default:
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Welcome back, Admin</h1>
                    <p className="text-slate-500">
                        Here's what's happening at <span className="font-semibold text-slate-700">{companyProfile.name}</span> today.
                    </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Hero Card */}
                    <div 
                        onClick={() => setCurrentView(ViewState.LIVE_RECEPTIONIST)}
                        className="md:col-span-2 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-8 text-white cursor-pointer hover:shadow-xl hover:shadow-emerald-900/20 hover:scale-[1.01] transition-all relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                                    <PhoneCall className="w-6 h-6 text-white" />
                                </div>
                                <span className="font-bold text-emerald-100 uppercase tracking-widest text-xs">Action Required</span>
                            </div>
                            <h3 className="text-3xl font-bold mb-3">Start Live Receptionist</h3>
                            <p className="text-emerald-50 mb-6 max-w-md">Activate Maya to handle incoming calls in Malayalam and English automatically using your knowledge base.</p>
                            <div className="flex flex-wrap gap-3">
                                <div className="inline-flex items-center gap-2 bg-white text-emerald-800 px-5 py-2.5 rounded-full font-bold text-sm group-hover:bg-emerald-50 transition-colors">
                                    Launch Console <ChevronRight className="w-4 h-4" />
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setAutoConnectLive(true); setCurrentView(ViewState.LIVE_RECEPTIONIST); }}
                                    className="inline-flex items-center gap-2 bg-black/20 text-white px-5 py-2.5 rounded-full font-bold text-sm border border-white/40 hover:bg-white/15 transition-colors"
                                    title="Jump into a live call from the dashboard"
                                >
                                    Start Call (Dev)
                                    <PhoneCall className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Card */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col justify-between hover:border-emerald-200 transition-colors">
                         <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-slate-50 rounded-xl">
                                    <CalendarIcon className="w-6 h-6 text-slate-600" />
                                </div>
                                <span className="text-2xl font-bold text-slate-900">{appointments.length}</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Upcoming Bookings</h3>
                            <p className="text-slate-500 text-sm mt-1">Scheduled appointments for this week.</p>
                        </div>
                        <button 
                            onClick={() => setCurrentView(ViewState.CALENDAR)}
                            className="mt-6 w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
                        >
                            View Calendar
                        </button>
                    </div>

                    {/* Knowledge Base Card */}
                    <div 
                        onClick={() => setCurrentView(ViewState.KNOWLEDGE_BASE)}
                        className="bg-white border border-slate-200 rounded-3xl p-8 cursor-pointer hover:shadow-lg hover:border-emerald-200 transition-all group"
                    >
                         <div className="mb-4 p-2 bg-blue-50 text-blue-600 rounded-xl w-fit group-hover:bg-blue-100 transition-colors">
                            <Database className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Knowledge Base</h3>
                        <p className="text-slate-500 text-sm mb-4">Manage {knowledgeItems.length} resources, menus, and business details.</p>
                        <div className="flex -space-x-2">
                            {knowledgeItems.slice(0, 3).map((_, i) => (
                                <div key={i} className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] text-slate-500">
                                    <FileIcon />
                                </div>
                            ))}
                            {knowledgeItems.length > 0 && (
                                <div className="w-8 h-8 rounded-full bg-slate-50 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                                    {knowledgeItems.length}
                                </div>
                            )}
                            {knowledgeItems.length === 0 && (
                                <div className="text-xs text-slate-400 italic pl-2">No docs yet</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
  };

  const FileIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Mobile Menu Button */}
      <button 
        className="md:hidden absolute top-4 left-4 z-50 p-2.5 bg-white rounded-xl shadow-lg shadow-slate-200/50 text-slate-600"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-40 w-72 h-full bg-white border-r border-slate-200 transition-transform duration-300 flex flex-col shadow-2xl md:shadow-none`}>
        <div className="p-8 pb-4">
            <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold font-serif text-lg">K</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 font-serif tracking-tight">KeralAI</h2>
            </div>
            <p className="text-xs text-slate-400 font-medium ml-11 uppercase tracking-wider">Business Assistant</p>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1.5">
            <SidebarItem 
                icon={<LayoutDashboard className="w-5 h-5" />} 
                label="Dashboard" 
                isActive={currentView === ViewState.DASHBOARD}
                onClick={() => { setCurrentView(ViewState.DASHBOARD); setIsSidebarOpen(window.innerWidth >= 768); }}
            />
            <SidebarItem 
                icon={<PhoneCall className="w-5 h-5" />} 
                label="Live Receptionist" 
                isActive={currentView === ViewState.LIVE_RECEPTIONIST}
                onClick={() => { setCurrentView(ViewState.LIVE_RECEPTIONIST); setIsSidebarOpen(window.innerWidth >= 768); }}
            />
            <SidebarItem 
                icon={<Database className="w-5 h-5" />} 
                label="Knowledge Base" 
                isActive={currentView === ViewState.KNOWLEDGE_BASE}
                onClick={() => { setCurrentView(ViewState.KNOWLEDGE_BASE); setIsSidebarOpen(window.innerWidth >= 768); }}
            />
            <SidebarItem 
                icon={<CalendarIcon className="w-5 h-5" />} 
                label="Appointments" 
                isActive={currentView === ViewState.CALENDAR}
                onClick={() => { setCurrentView(ViewState.CALENDAR); setIsSidebarOpen(window.innerWidth >= 768); }}
            />
        </nav>

        <div className="p-6 border-t border-slate-100">
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 border border-slate-100 hover:border-emerald-200 transition-colors cursor-pointer group">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors shadow-sm">
                    <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">Admin User</p>
                    <p className="text-xs text-slate-500 truncate">{companyProfile.name}</p>
                </div>
                <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors" />
            </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full relative">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            {renderContent()}
        </div>
      </main>
    </div>
  );
};

interface SidebarItemProps {
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, isActive, onClick }) => (
    <button 
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium text-sm ${
            isActive 
            ? 'bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-100' 
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`}
    >
        <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>{icon}</span>
        {label}
        {isActive && <ChevronRight className="w-4 h-4 ml-auto text-emerald-600" />}
    </button>
);

export default App;