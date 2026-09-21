import React from 'react';
import { Appointment } from '../types';
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, Search } from 'lucide-react';

interface CalendarViewProps {
  appointments: Appointment[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ appointments }) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Appointments</h2>
          <p className="text-slate-500 mt-1">Track and manage AI-scheduled bookings.</p>
        </div>
        <div className="flex items-center gap-4 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
             <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Search bookings..." 
                    className="pl-9 pr-4 py-2 text-sm bg-transparent outline-none w-48 sm:w-64"
                />
             </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {appointments.length > 0 ? (
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {appointments.map((apt) => (
                            <tr key={apt.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                                            {apt.customerName.charAt(0)}
                                        </div>
                                        <span className="font-semibold text-slate-900">{apt.customerName}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col text-sm text-slate-600">
                                        <span className="flex items-center gap-1.5 font-medium text-slate-900">
                                            <Calendar className="w-4 h-4 text-slate-400" /> {apt.date}
                                        </span>
                                        <span className="flex items-center gap-1.5 mt-1">
                                            <Clock className="w-4 h-4 text-slate-400" /> {apt.time}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {apt.reason ? (
                                        <span className="inline-block px-2.5 py-1 bg-slate-100 rounded-md text-slate-600 text-xs font-medium border border-slate-200 max-w-[200px] truncate">
                                            {apt.reason}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 text-sm italic">No notes</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {apt.status === 'confirmed' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                                            <CheckCircle className="w-3.5 h-3.5" /> Confirmed
                                        </span>
                                    )}
                                    {apt.status === 'pending' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                                            <AlertCircle className="w-3.5 h-3.5" /> Pending
                                        </span>
                                    )}
                                    {apt.status === 'cancelled' && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold border border-red-100">
                                            <XCircle className="w-3.5 h-3.5" /> Cancelled
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="p-20 text-center">
                 <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calendar className="w-10 h-10 text-slate-300" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-2">No Appointments Yet</h3>
                 <p className="text-slate-500 max-w-sm mx-auto">When the AI receptionist books a client, they will appear here automatically.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default CalendarView;