import React, { useState } from 'react';
import { X, LogOut, Trash2, User as UserIcon, Calendar, Shield, Activity, LayoutDashboard, History, Download, FileText, ChevronLeft, Mail, Fingerprint, FileArchive } from 'lucide-react';
import { User, ExportRecord } from '../types';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onClearAll: () => void;
    onOpenAdminPanel?: () => void;
    onOpenHistoryItem: (record: ExportRecord) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user, onClearAll, onOpenAdminPanel, onOpenHistoryItem }) => {
    const [view, setView] = useState<'PROFILE' | 'HISTORY'>('PROFILE');

    if (!isOpen || !user) return null;

    // Format: DD/MM/YYYY, HH:MM AM/PM
    const formatDate = (ts?: number) => {
        if (!ts) return 'Lifetime / N/A';
        return new Date(ts).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const isAdmin = user.username === 'Rilu844' || user.email === 'rr7121564@gmail.com';

    // Sort History descending, safely handle undefined history
    const history = user.exportHistory ? [...user.exportHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];

    const handleDownloadHistory = (record: ExportRecord) => {
        let url;
        let filename = record.filename;
        
        // Handle ZIP vs Text
        if (record.type === 'zip') {
            // For ZIP, content is Base64 Data URL (data:application/zip;base64,...)
            url = record.content;
        } else {
            // Default to Text/ASS
            filename = filename.replace(/\.[^/.]+$/, "");
            if (!filename.toLowerCase().endsWith('.ass')) {
                filename += '.ass';
            }
            const blob = new Blob([record.content], { type: 'application/octet-stream' });
            url = URL.createObjectURL(blob);
        }

        const a = document.createElement('a'); 
        a.href = url; 
        a.download = filename; 
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a); 
        
        if (record.type !== 'zip') {
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="p-6 bg-[#161B22]/50 border-b border-[#30363D] flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {view === 'HISTORY' ? (
                            <button onClick={() => setView('PROFILE')} className="p-1 -ml-2 text-[#8B949E] hover:text-white rounded-full hover:bg-[#30363D]">
                                <ChevronLeft size={20} />
                            </button>
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-[#58A6FF]/10 flex items-center justify-center">
                                <UserIcon className="text-[#58A6FF]" size={20} />
                            </div>
                        )}
                        <div>
                            <h2 className="text-[#E6EDF3] font-bold">{view === 'HISTORY' ? 'Export History' : 'Profile Settings'}</h2>
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] text-[#8B949E] uppercase tracking-widest font-bold">{user.plan} MEMBER</p>
                                {isAdmin && <span className="bg-[#A371F7] text-white text-[9px] font-bold px-1.5 rounded uppercase">Owner</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-[#8B949E] hover:text-white transition-colors"><X size={20} /></button>
                </div>

                {view === 'PROFILE' && (
                    <div className="p-6 space-y-6 overflow-y-auto custom-scroll">
                        {/* USER DETAILS CARD */}
                        <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#0D1117] rounded-lg border border-[#30363D]">
                                    <Fingerprint size={16} className="text-[#E6EDF3]"/>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-[#8B949E] font-bold uppercase">Username</p>
                                    <p className="text-sm font-bold text-white truncate">{user.username}</p>
                                </div>
                            </div>
                            <div className="w-full h-px bg-[#30363D]"></div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#0D1117] rounded-lg border border-[#30363D]">
                                    <Mail size={16} className="text-[#E6EDF3]"/>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-[#8B949E] font-bold uppercase">Email Address</p>
                                    <p className="text-sm font-bold text-white truncate">{user.email}</p>
                                </div>
                            </div>
                        </div>

                        {/* ADMIN BUTTON */}
                        {isAdmin && onOpenAdminPanel && (
                            <button 
                                onClick={() => { onClose(); onOpenAdminPanel(); }}
                                className="w-full py-3 bg-gradient-to-r from-[#58A6FF] to-[#A371F7] text-white font-bold rounded-xl shadow-lg shadow-[#A371F7]/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                            >
                                <LayoutDashboard size={18} /> OPEN ADMIN PANEL
                            </button>
                        )}

                        {/* STATS */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#161B22] border border-[#30363D] p-4 rounded-xl space-y-1">
                                <div className="flex items-center gap-2 text-[#8B949E]">
                                    <Activity size={12} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Usage</span>
                                </div>
                                <p className="text-xl font-black text-white">{user.totalUsage || 0}</p>
                            </div>
                            <div className="bg-[#161B22] border border-[#30363D] p-4 rounded-xl space-y-1">
                                <div className="flex items-center gap-2 text-[#58A6FF]">
                                    <Shield size={12} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Plan Status</span>
                                </div>
                                <p className="text-xl font-black text-white">{user.plan || 'FREE'}</p>
                            </div>
                        </div>

                        {/* INFO & ACTIONS */}
                        <div className="space-y-4">
                            {/* HISTORY BUTTON */}
                            <button 
                                onClick={() => setView('HISTORY')}
                                className="w-full flex items-center justify-between p-3 bg-[#161B22]/30 hover:bg-[#161B22] border border-[#30363D] rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <History size={16} className="text-[#8B949E] group-hover:text-[#E6EDF3]" />
                                    <span className="text-xs text-[#E6EDF3]">Export History</span>
                                </div>
                                <div className="bg-[#30363D] text-white text-[9px] px-1.5 rounded font-bold">{history.length}</div>
                            </button>
                        </div>

                        <button 
                            onClick={() => { onClearAll(); onClose(); }}
                            className="w-full py-3 bg-[#F85149]/10 hover:bg-[#F85149] border border-[#F85149]/30 text-[#F85149] hover:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            <Trash2 size={18} /> Clear Active Project
                        </button>
                    </div>
                )}

                {view === 'HISTORY' && (
                    <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-2">
                        {history.length === 0 ? (
                            <div className="h-40 flex flex-col items-center justify-center text-[#484F58]">
                                <History size={32} className="mb-2 opacity-50" />
                                <p className="text-xs">No export history available.</p>
                            </div>
                        ) : (
                            history.map(record => (
                                <div key={record.id} className="flex items-center justify-between bg-[#161B22] border border-[#30363D] p-3 rounded-xl hover:border-[#58A6FF] transition-colors group">
                                    <div 
                                        className="min-w-0 flex-1 cursor-pointer"
                                        onClick={() => {
                                            if (record.type !== 'zip') {
                                                onOpenHistoryItem(record);
                                                onClose();
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-2 text-[#E6EDF3] font-bold text-xs mb-1 group-hover:text-[#58A6FF]">
                                            {record.type === 'zip' ? <FileArchive size={12} className="text-[#A371F7]" /> : <FileText size={12} className="text-[#58A6FF]" />}
                                            <span className="truncate">{record.filename}</span>
                                        </div>
                                        <p className="text-[10px] text-[#8B949E] font-mono">
                                            {(() => {
                                                const d = new Date(record.date);
                                                const dd = String(d.getDate()).padStart(2, '0');
                                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                                const yy = String(d.getFullYear()).slice(-2);
                                                const time = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                                return `${dd}/${mm}/${yy}, ${time}`;
                                            })()}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => handleDownloadHistory(record)} 
                                        className="p-2 bg-[#0D1117] hover:bg-[#58A6FF] text-[#8B949E] hover:text-white rounded-lg transition-colors shadow-sm"
                                        title="Download Again"
                                    >
                                        <Download size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileModal;