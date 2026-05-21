import React from 'react';
import { X, Zap, ExternalLink } from 'lucide-react';

interface CreditErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreditErrorModal: React.FC<CreditErrorModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    // Generate a unique token/number for this specific credit request
    const handleGetCredits = () => {
        const randomId = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
        
        // Store it locally for verification when redirect happens
        localStorage.setItem('subswap_pending_vkey', `verified${randomId}`);
        localStorage.setItem('subswap_vtoken_time', Date.now().toString());

        const APP_URL = "https://ais-pre-me2gzwsppmi4pwnbdpldtl-45182638901.asia-southeast1.run.app";
        
        // The user wants the URL to NOT be encoded and have the random number in the parameter name
        // Example: ?verified8273=true
        const REDIRECT_URL = `${APP_URL}/?verified${randomId}=true`;
        const SHORTENER_API = "https://adrinolinks.in/st?api=2d2e518e95e41e30e249c3d7ae0b42d229902955&url=";
        const FULL_URL = `${SHORTENER_API}${REDIRECT_URL}`;

        window.open(FULL_URL, '_blank');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-[#161B22] border border-[#30363D] rounded-2xl p-6 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-[#8B949E] hover:text-white"><X size={20}/></button>
                
                <div className="flex justify-center mb-4 text-[#F1C40F]">
                    <Zap size={48} />
                </div>
                <h3 className="text-white font-bold text-lg mb-2 text-center">Insufficient Credits</h3>
                <p className="text-[#8B949E] text-sm mb-6 text-center">
                    You've run out of daily credits. Complete the shortener task to earn 4 free credits and continue!
                </p>
                
                <button 
                    onClick={handleGetCredits}
                    className="w-full bg-[#238636] hover:bg-[#2ea043] text-white py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                    Get 4 Credits <ExternalLink size={16} />
                </button>
            </div>
        </div>
    );
};

export default CreditErrorModal;
