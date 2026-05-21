import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { LogIn, WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { getDeviceFingerprint } from '../services/deviceService';
import { getUserFromCloud, syncUserToCloud, isFirebaseEnabled, auth } from '../services/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface AuthProps {
    onLogin: (user: User) => void;
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

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [error, setError] = useState('');
    const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initDevice = async () => {
            const deviceId = await getDeviceFingerprint();
            setCurrentDeviceId(deviceId);

            const storedSession = localStorage.getItem('subswap_user_account');
            let localUser: User | null = null;
            try {
                localUser = storedSession ? JSON.parse(storedSession) : null;
            } catch (e) {
                localStorage.removeItem('subswap_user_account');
            }

            if (localUser && !isFirebaseEnabled) {
                // Offline fallback
                onLogin(localUser);
            }
            
            setLoading(false);
        };
        initDevice();
    }, [onLogin]);

    const handleGoogleLogin = async () => {
        setError('');
        if (!isFirebaseEnabled || !auth) {
            setError("Firebase is not enabled or configured correctly.");
            return;
        }

        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const firebaseUser = result.user;

            let user: User | null = await getUserFromCloud(firebaseUser.uid);

            if (!user) {
                // Create new user
                user = {
                    uid: firebaseUser.uid,
                    username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    email: firebaseUser.email || '',
                    deviceId: currentDeviceId,
                    plan: 'FREE',
                    totalUsage: 0,
                    dailyUsage: { date: new Date().toISOString().split('T')[0], count: 0 },
                    exportHistory: [],
                    lastActive: Date.now()
                };
            } else {
                // Update existing user
                user.deviceId = currentDeviceId;
                user.lastActive = Date.now();
            }

            // Sync to cloud
            await syncUserToCloud(user);

            // Save to local session
            localStorage.setItem('subswap_user_account', JSON.stringify(user, getCircularReplacer()));
            
            onLogin(user);
        } catch (e: any) {
            console.error("Login Error:", e);
            setError(e.message || "Failed to authenticate with Google.");
        }
    };

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center bg-[#050812]"><div className="w-8 h-8 border-2 border-[#58A6FF] border-t-transparent rounded-full animate-spin"></div></div>;
    }

    return (
        <div className="flex flex-col h-[100dvh] w-full items-center justify-center bg-[#050812] relative overflow-hidden font-sans p-6 select-none">
            <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-[#58A6FF]/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="relative z-10 w-full max-w-sm bg-[#0D1117] border border-[#30363D] rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
                <div className="p-8 text-center bg-[#161B22] border-b border-[#30363D] relative">
                    <div className="absolute top-4 right-4">
                        {isFirebaseEnabled ? 
                            <Wifi size={14} className="text-[#238636]" title="Online Sync Active" /> : 
                            <WifiOff size={14} className="text-[#F85149]" title="Offline Mode" />
                        }
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight mb-1">
                        AUTHENTICATE
                    </h1>
                    <p className="text-[#8B949E] text-[10px] font-bold uppercase tracking-widest">
                        SubSwap Studio ID
                    </p>
                </div>

                <div className="p-8 space-y-4">
                    <button 
                        onClick={handleGoogleLogin}
                        className="w-full bg-white hover:bg-gray-100 text-black font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all mt-4 text-xs uppercase tracking-wider"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                        Sign in with Google
                    </button>

                    {error && (
                        <div className="flex items-start gap-2 bg-[#F85149]/10 border border-[#F85149]/20 p-3 rounded-lg animate-pulse">
                            <AlertTriangle size={16} className="text-[#F85149] shrink-0 mt-0.5" />
                            <div className="text-[#F85149] text-xs font-bold">{error}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Auth;