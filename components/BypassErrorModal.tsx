import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BypassErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    message?: string;
}

const BypassErrorModal: React.FC<BypassErrorModalProps> = ({ isOpen, onClose, message }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            >
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-[#0D1117] border border-[#F85149]/30 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative"
                >
                    {/* Header with Danger Pattern */}
                    <div className="h-2 bg-gradient-to-r from-[#F85149] via-[#FF7B72] to-[#F85149]"></div>
                    
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 text-[#8B949E] hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>

                    <div className="p-8 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-[#F85149]/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <AlertTriangle size={32} className="text-[#F85149]" />
                        </div>
                        
                        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                            Bypass Detected!
                        </h2>
                        
                        <p className="text-[#8B949E] text-sm leading-relaxed mb-8">
                            {message || "We detected an attempt to bypass the link shortener. Please complete the process naturally to support the application and earn credits."}
                        </p>

                        <div className="w-full space-y-3">
                            <button 
                                onClick={onClose}
                                className="w-full bg-[#F85149] hover:bg-[#da3633] text-white py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
                            >
                                I Understand
                            </button>
                        </div>
                        
                        <div className="mt-6 flex items-center gap-2 text-[10px] text-[#F85149]/60 font-mono uppercase tracking-[0.2em]">
                            <span className="w-1 h-1 bg-[#F85149]/60 rounded-full"></span>
                            Security Guard Active
                            <span className="w-1 h-1 bg-[#F85149]/60 rounded-full"></span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default BypassErrorModal;
