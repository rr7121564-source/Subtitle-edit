import React, { useState, useEffect } from 'react';
import { X, Search, Shield, Check, User as UserIcon, Mail, Crown, Zap, Flame, LayoutGrid, Star, Rocket, RefreshCw, Users, Lock, Copy, CheckCircle2, FileText, Wifi, WifiOff, CloudCog, AlertTriangle, Settings, Save, Activity, Clock } from 'lucide-react';
import { User, PlanTier } from '../types';
import { db, isFirebaseEnabled, syncUserToCloud } from '../services/firebase';
import { collection, onSnapshot, getDocs } from "firebase/firestore";

interface AdminPanelModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User | null;
    onUpdateUser: (user: User) => void;
}

const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose, currentUser, onUpdateUser }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'ONLINE' | 'OFFLINE' | 'ERROR'>('CONNECTING');
    const [errorMessage, setErrorMessage] = useState('');
    
    // Config Modal State
    const [showConfig, setShowConfig] = useState(false);
    const [configInput, setConfigInput] = useState('');

    // --- DATA LOADING LOGIC (Cloud First, Local Backup) ---
    useEffect(() => {
        if (!isOpen) return;

        let unsubscribe: any;

        const initData = async () => {
            setIsRefreshing(true);
            setErrorMessage('');
            
            // 1. Try Firebase Connection First (For Multi-Device Support)
            if (isFirebaseEnabled && db) {
                try {
                    const usersRef = collection(db, 'users');
                    
                    // Real-time Listener
                    unsubscribe = onSnapshot(usersRef, (snapshot) => {
                        const onlineUsers: User[] = [];
                        snapshot.forEach((doc) => {
                            if (doc.exists()) {
                                onlineUsers.push(doc.data() as User);
                            }
                        });
                        
                        setUsers(onlineUsers.reverse()); // Show newest first
                        setConnectionStatus('ONLINE');
                        setIsRefreshing(false);
                        
                        // Sync Cloud Data to Local Storage (Backup)
                        try {
                            localStorage.setItem('subswap_all_users', JSON.stringify(onlineUsers, getCircularReplacer()));
                        } catch(e) {
                            console.warn("Failed to backup users locally (Quota or Circular)", e);
                        }
                    }, (error) => {
                        console.error("Firebase Sync Error:", error);
                        setConnectionStatus('ERROR');
                        if (error.code === 'permission-denied') {
                            setErrorMessage('Permission Denied. Project ID mismatch.');
                        } else if ((error.code as any) === 'project-not-found' || error.message.includes('project')) {
                            setErrorMessage('Invalid Project ID in Config.');
                        } else {
                            setErrorMessage(error.message);
                        }
                        loadFromLocal(); // Fallback
                        setIsRefreshing(false);
                    });

                } catch (e: any) {
                    console.error("Firebase Init Failed:", e);
                    setConnectionStatus('ERROR');
                    setErrorMessage(e.message || 'Connection Failed');
                    loadFromLocal();
                    setIsRefreshing(false);
                }
            } else {
                setConnectionStatus('OFFLINE');
                loadFromLocal();
                setIsRefreshing(false);
            }
        };

        initData();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [isOpen]);

    const loadFromLocal = () => {
        const storedUsers = localStorage.getItem('subswap_all_users');
        if (storedUsers) {
            try {
                const parsed = JSON.parse(storedUsers);
                if (Array.isArray(parsed)) setUsers(parsed.reverse());
            } catch (e) { setUsers([]); }
        }
    };

    const handleUpdatePlan = async (username: string, newPlan: PlanTier) => {
        const now = new Date();
        let expiresAt = 0;

        if (newPlan === 'FREE' || newPlan === 'MEMBER') {
            expiresAt = 0;
        } else if (newPlan === 'BETA_TESTER') {
            // Exactly 24 Hours from NOW
            // Preserves the exact time (e.g. if activated at 2:30 PM, expires 2:30 PM tomorrow)
            expiresAt = now.getTime() + (24 * 60 * 60 * 1000);
        } else {
             // Exactly 30 Days from NOW
             // Preserves exact time
             expiresAt = now.getTime() + (30 * 24 * 60 * 60 * 1000);
        }

        // RESET DAILY USAGE TO 0 ON PLAN CHANGE
        const today = new Date().toISOString().split('T')[0];
        const resetDailyUsage = { date: today, count: 0 };

        const targetUserIndex = users.findIndex(u => u.username === username);
        if (targetUserIndex === -1) return;

        const updatedUser = { 
            ...users[targetUserIndex], 
            plan: newPlan, 
            planExpires: expiresAt,
            dailyUsage: resetDailyUsage
        };

        // 1. Update State Optimistically
        const newUsersList = [...users];
        newUsersList[targetUserIndex] = updatedUser;
        setUsers(newUsersList);
        setSelectedUser(null);

        // 2. Sync to Cloud (CRUCIAL for this change to appear on user's device)
        await syncUserToCloud(updatedUser);

        // 3. Sync to Local
        try {
            localStorage.setItem('subswap_all_users', JSON.stringify(newUsersList, getCircularReplacer()));
        } catch(e) { console.error("Local save error", e); }

        // 4. Update Self if needed
        if (currentUser && currentUser.username === username) {
            onUpdateUser(updatedUser);
        }
    };

    const handleCopyAll = () => {
        const adminUsernames = ['rilu844', 'admin'];
        if (currentUser) adminUsernames.push(currentUser.username.toLowerCase());
        const usersToCopy = users.filter(u => !adminUsernames.includes(u.username.toLowerCase()));

        if (usersToCopy.length === 0) { alert("No regular users found."); return; }

        const formattedText = usersToCopy.map((u, index) => `${index + 1}.\nUsername : ${u.username}\nEmail : ${u.email}\nPassword : ${u.password || 'N/A'}`).join('\n\n');
        navigator.clipboard.writeText(formattedText).then(() => { setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); });
    };

    const handleSaveConfig = () => {
        alert("Configuration is now managed automatically by AI Studio.");
        setShowConfig(false);
    };

    const formatLastActive = (ts?: number) => {
        if (!ts) return 'Never';
        const date = new Date(ts);
        // If today, show time, else show date
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        return isToday ? `Today ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : date.toLocaleDateString();
    };

    const formatExpiry = (ts?: number) => {
        if (!ts) return null;
        return new Date(ts).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const filteredUsers = users.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalFilesExported = users.reduce((acc, curr) => acc + (curr.totalUsage || 0), 0);
    const totalUsers = users.length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-6xl bg-[#0D1117] border border-[#30363D] rounded-3xl shadow-2xl flex flex-col h-[90vh] overflow-hidden relative">
                
                {/* 1. TOP BAR */}
                <div className="px-6 py-4 border-b border-[#30363D] bg-[#161B22] flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A371F7] to-[#79c0ff] flex items-center justify-center shadow-lg shadow-[#A371F7]/20">
                            <Shield className="text-white" size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-[#E6EDF3] font-bold text-lg leading-none">Admin Console</h2>
                                {connectionStatus === 'ONLINE' ? 
                                    <span className="text-[9px] bg-[#238636]/20 text-[#3fb950] border border-[#238636]/30 px-1.5 rounded flex items-center gap-1"><Wifi size={8}/> LIVE DATA</span> :
                                    connectionStatus === 'ERROR' ?
                                    <span className="text-[9px] bg-[#F85149]/20 text-[#F85149] border border-[#F85149]/30 px-1.5 rounded flex items-center gap-1 cursor-pointer hover:bg-[#F85149]/30" onClick={() => setShowConfig(true)}><AlertTriangle size={8}/> CONNECT ERROR</span> :
                                    <span className="text-[9px] bg-[#FB923C]/20 text-[#FB923C] border border-[#FB923C]/30 px-1.5 rounded flex items-center gap-1"><WifiOff size={8}/> OFFLINE</span>
                                }
                            </div>
                            <p className="text-[10px] text-[#8B949E] uppercase tracking-widest font-bold mt-1">
                                {connectionStatus === 'ONLINE' ? 'Synced with Cloud Database' : 
                                 connectionStatus === 'ERROR' ? 'Failed to sync. Showing local data.' : 
                                 'Showing data from this device only'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                         <button onClick={() => setShowConfig(true)} className="p-2 text-[#8B949E] hover:text-[#58A6FF] bg-[#0D1117] hover:bg-[#30363D] rounded-full transition-all border border-[#30363D]" title="Database Settings">
                            <Settings size={20} />
                        </button>
                        <button onClick={onClose} className="p-2 text-[#8B949E] hover:text-white bg-[#0D1117] hover:bg-[#30363D] rounded-full transition-all border border-[#30363D]">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 2. STATS DASHBOARD */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 bg-[#0D1117]">
                    <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><FileText size={80} /></div>
                        <div className="w-12 h-12 rounded-xl bg-[#238636]/20 flex items-center justify-center text-[#3fb950] border border-[#238636]/30"><FileText size={24} /></div>
                        <div><p className="text-[#8B949E] text-[10px] font-bold uppercase tracking-widest">Total Exports</p><p className="text-2xl font-black text-[#E6EDF3]">{totalFilesExported}</p></div>
                    </div>
                    <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Users size={80} /></div>
                        <div className="w-12 h-12 rounded-xl bg-[#A371F7]/20 flex items-center justify-center text-[#A371F7] border border-[#A371F7]/30"><Users size={24} /></div>
                        <div><p className="text-[#8B949E] text-[10px] font-bold uppercase tracking-widest">Total Users</p><p className="text-2xl font-black text-[#E6EDF3]">{totalUsers}</p></div>
                    </div>
                </div>

                {/* 3. TOOLBAR */}
                <div className="px-6 pb-4 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484F58]" size={16} />
                        <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-[#161B22] border border-[#30363D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#E6EDF3] focus:border-[#58A6FF] outline-none transition-all" />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button onClick={handleCopyAll} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border rounded-xl transition-all shadow-lg ${isCopied ? 'bg-[#238636] border-[#238636] text-white' : 'bg-[#1F6FEB] border-[#1F6FEB] hover:bg-[#388BFD] text-white'}`}>
                           {isCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />} <span className="text-xs font-bold uppercase">{isCopied ? 'Copied' : 'Copy Data'}</span>
                        </button>
                    </div>
                </div>

                {/* 4. MAIN CONTENT */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row border-t border-[#30363D] relative min-h-0">
                    <div className="flex-1 flex flex-col min-w-0 bg-[#0D1117] min-h-0">
                        <div className="flex items-center px-4 py-3 bg-[#161B22] border-b border-[#30363D] text-[10px] font-bold text-[#8B949E] uppercase tracking-wider sticky top-0 z-10 shrink-0">
                            <div className="w-10 text-center shrink-0">#</div>
                            <div className="flex-1 px-2">User Details</div>
                            <div className="w-24 text-center shrink-0 hidden sm:block">Activity</div>
                            <div className="w-24 text-center shrink-0">Plan</div>
                            <div className="w-16 text-center shrink-0">Edit</div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scroll p-2 space-y-1">
                            {filteredUsers.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-[#8B949E] opacity-50">
                                    {connectionStatus === 'ERROR' ? (
                                        <div className="flex flex-col items-center animate-in fade-in">
                                            <AlertTriangle size={32} className="mb-2 text-[#F85149]" />
                                            <span className="text-xs font-bold text-[#F85149] mb-1">Database Error</span>
                                            <span className="text-[10px] max-w-[200px] text-center text-[#F85149]/70 mb-3">{errorMessage || "Project ID mismatch or permissions."}</span>
                                            <button onClick={() => setShowConfig(true)} className="px-4 py-2 bg-[#F85149]/10 hover:bg-[#F85149]/20 text-[#F85149] text-xs font-bold rounded-lg border border-[#F85149]/30 transition-all flex items-center gap-2">
                                                <Settings size={12} /> Fix Configuration
                                            </button>
                                        </div>
                                    ) : connectionStatus === 'OFFLINE' ? (
                                        <>
                                            <CloudCog size={32} className="mb-2 text-[#F85149]" />
                                            <span className="text-xs font-bold text-[#F85149] mb-1">Database Disconnected</span>
                                            <span className="text-[10px] max-w-[200px] text-center">Config missing or offline.</span>
                                        </>
                                    ) : (
                                        <>
                                            <UserIcon size={32} className="mb-2" />
                                            <span className="text-xs">No users found</span>
                                        </>
                                    )}
                                </div>
                            ) : (
                                filteredUsers.map((user, idx) => (
                                    <div key={user.uid || `${user.username}-${idx}`} onClick={() => setSelectedUser(user)} className={`flex items-center p-2 rounded-xl border cursor-pointer transition-all ${selectedUser?.username === user.username ? 'bg-[#1F6FEB]/10 border-[#58A6FF]' : 'bg-[#161B22]/50 border-[#30363D] hover:border-[#8B949E] hover:bg-[#161B22]'}`}>
                                        <div className="w-10 text-center font-mono text-[#8B949E] text-xs shrink-0">{idx + 1}</div>
                                        <div className="flex-1 min-w-0 px-2 overflow-hidden flex flex-col justify-center">
                                            <div className="flex items-center gap-2"><span className="text-xs font-bold text-[#E6EDF3] truncate">{user.username}</span>{user.username === 'Rilu844' && <Crown size={12} className="text-[#A371F7]" />}</div>
                                            <div className="text-[10px] text-[#8B949E] truncate flex items-center gap-1"><Mail size={10} /> {user.email}</div>
                                            <div className="text-[10px] text-[#8B949E] truncate flex items-center gap-1"><Lock size={10} /> {user.password || 'N/A'}</div>
                                            
                                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                                <div className="text-[9px] text-[#8B949E] flex items-center gap-1">
                                                    <Activity size={8} /> <span className="font-bold text-[#E6EDF3]">Exp: {user.totalUsage || 0}</span>
                                                </div>
                                                <div className="text-[9px] text-[#8B949E] flex items-center gap-1" title="Last Active">
                                                    <Wifi size={8} className={user.lastActive && (Date.now() - user.lastActive < 300000) ? "text-[#3fb950]" : "text-[#8B949E]"}/> 
                                                    <span>{formatLastActive(user.lastActive)}</span>
                                                </div>
                                                {user.plan !== 'FREE' && user.planExpires && (
                                                     <div className="text-[9px] text-[#FB923C] flex items-center gap-1 font-mono tracking-tight" title="Plan Expiry">
                                                        <Clock size={8} />
                                                        <span>End: {formatExpiry(user.planExpires)}</span>
                                                     </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="w-24 hidden sm:flex flex-col gap-1 shrink-0 items-center justify-center">
                                            <div className="flex items-center gap-2 text-[10px] font-mono"><span className="text-[#58A6FF] font-bold">{user.dailyUsage?.count || 0}</span><span className="text-[#30363D]">/</span><span className="text-[#8B949E]">{user.totalUsage || 0}</span></div>
                                        </div>
                                        <div className="w-24 flex justify-center shrink-0">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border truncate w-full text-center ${user.plan === 'PLATINUM' ? 'bg-[#A371F7]/10 text-[#A371F7] border-[#A371F7]/30' : user.plan === 'GOLD' ? 'bg-[#FB923C]/10 text-[#FB923C] border-[#FB923C]/30' : user.plan === 'SILVER' ? 'bg-[#8B949E]/10 text-[#E6EDF3] border-[#8B949E]/30' : user.plan === 'MEMBER' ? 'bg-[#238636]/10 text-[#238636] border-[#238636]/30' : user.plan === 'BETA_TESTER' ? 'bg-[#1F6FEB]/10 text-[#1F6FEB] border-[#1F6FEB]/30' : 'bg-[#30363D]/30 text-[#8B949E] border-[#30363D]'}`}>{user.plan || 'FREE'}</span>
                                        </div>
                                        <div className="w-16 flex justify-center shrink-0 text-[#8B949E]"><Shield size={14} /></div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {selectedUser ? (
                        <div className="w-full md:w-80 bg-[#161B22] p-6 flex flex-col gap-4 animate-in slide-in-from-right-10 duration-200 border-l border-[#30363D] shrink-0 h-full overflow-hidden z-20 absolute md:static inset-0 md:inset-auto min-h-0 shadow-2xl">
                            <div className="flex items-center justify-between pb-4 border-b border-[#30363D] shrink-0">
                                <div><h3 className="text-[#E6EDF3] font-bold text-lg">Edit User</h3><p className="text-xs text-[#58A6FF] font-mono">{selectedUser.username}</p></div>
                                <button onClick={() => setSelectedUser(null)} className="p-2 bg-[#0D1117] rounded-full text-[#8B949E] hover:text-white"><X size={18}/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scroll space-y-3">
                                <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest mb-2">Select New Plan</div>
                                {[
                                    { id: 'FREE', name: 'Free Tier', icon: <LayoutGrid size={16}/>, color: 'text-[#8B949E]' },
                                    { id: 'MEMBER', name: 'Member (VIP)', icon: <Star size={16}/>, color: 'text-[#238636]' }
                                ].map((plan) => (
                                    <button key={plan.id} onClick={() => handleUpdatePlan(selectedUser.username, plan.id as PlanTier)} className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selectedUser.plan === plan.id ? 'bg-[#1F6FEB]/20 border-[#58A6FF] shadow-lg shadow-[#58A6FF]/10' : 'bg-[#0D1117] border-[#30363D] hover:border-[#8B949E]'}`}>
                                        <div className="flex items-center gap-3"><div className={`${plan.color}`}>{plan.icon}</div><span className={`text-sm font-bold ${selectedUser.plan === plan.id ? 'text-white' : 'text-[#8B949E]'}`}>{plan.name}</span></div>
                                        {selectedUser.plan === plan.id && <CheckCircle2 size={16} className="text-[#58A6FF]" />}
                                    </button>
                                ))}
                                <div className="mt-6 p-4 bg-[#0D1117] border border-[#30363D] rounded-xl space-y-2">
                                    <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest">User Credentials</div>
                                    <div className="flex items-center gap-2 text-xs text-[#E6EDF3] bg-[#161B22] p-2 rounded border border-[#30363D] font-mono"><Lock size={12} className="text-[#8B949E]"/> {selectedUser.password}</div>
                                    <div className="flex items-center gap-2 text-xs text-[#E6EDF3] bg-[#161B22] p-2 rounded border border-[#30363D] font-mono"><Mail size={12} className="text-[#8B949E]"/> {selectedUser.email}</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="hidden md:flex w-80 items-center justify-center bg-[#0D1117] text-[#30363D] border-l border-[#30363D] shrink-0"><div className="text-center"><UserIcon size={48} className="mx-auto mb-4 opacity-20" /><p className="text-xs font-bold uppercase tracking-widest opacity-40">Select a user to manage</p></div></div>
                    )}
                </div>

                {/* CONFIGURATION OVERLAY */}
                {showConfig && (
                    <div className="absolute inset-0 bg-[#0D1117]/95 z-50 flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95">
                        <div className="w-full max-w-lg space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[#E6EDF3] font-bold text-xl flex items-center gap-2"><CloudCog className="text-[#58A6FF]"/> Firebase Configuration</h3>
                                <button onClick={() => setShowConfig(false)} className="text-[#8B949E] hover:text-white"><X size={24}/></button>
                            </div>
                            <div className="p-4 bg-[#161B22] border border-[#30363D] rounded-xl text-sm text-[#8B949E] leading-relaxed">
                                <p className="mb-2"><strong>Why this error?</strong> Your Firebase API Key is valid, but the Project ID <code>subswap-app</code> doesn't match the one in your Google Cloud Console.</p>
                                <p>Go to <strong className="text-white">Firebase Console {'>'} Project Settings {'>'} General {'>'} Your Apps {'>'} Config</strong> and copy the whole JSON object.</p>
                            </div>
                            <textarea 
                                value={configInput}
                                onChange={(e) => setConfigInput(e.target.value)}
                                placeholder={'{\n  "apiKey": "AIza...",\n  "authDomain": "...",\n  "projectId": "...",\n  ...\n}'}
                                className="w-full h-48 bg-[#050812] border border-[#30363D] rounded-xl p-4 font-mono text-xs text-[#E6EDF3] focus:border-[#58A6FF] outline-none resize-none"
                            />
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setShowConfig(false)} className="px-4 py-2 text-[#8B949E] hover:text-white font-bold text-sm">Cancel</button>
                                <button onClick={handleSaveConfig} className="px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white font-bold rounded-lg shadow-lg flex items-center gap-2">
                                    <Save size={16} /> Save & Restart
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPanelModal;