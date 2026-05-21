import React from 'react';
import { X, Check, ShieldCheck, Zap, Crown, Flame, LayoutGrid } from 'lucide-react';
import { User } from '../types';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
}

const INSTAGRAM_LINK = "https://www.instagram.com/team.1px?igsh=MWwybTV6NzhyaGZuag==";

const PLANS = [
    {
        name: 'FREE',
        price: '₹0',
        icon: <LayoutGrid className="text-[#8B949E]" size={24} />,
        features: [
            '1 File edit / daily',
            'Access to Gemini 2.5 Flash Lite',
            'No MKV Extraction',
            'Standard Quality'
        ],
        color: '#8B949E',
        btnText: 'Current Plan'
    },
    {
        name: 'SILVER',
        price: '₹29',
        icon: <Zap className="text-[#E6EDF3]" size={24} />,
        features: [
            '10 Files edit / daily', 
            'Access to Gemini 2.5 Flash (Std)', 
            'MKV Extraction Enabled',
            'Standard Speed'
        ],
        color: '#E6EDF3',
        btnText: 'Get SILVER'
    },
    {
        name: 'GOLD',
        price: '₹59',
        icon: <Flame className="text-[#FB923C]" size={24} />,
        features: [
            '30 Files edit / daily', 
            'Access to Gemini 3.0 Flash', 
            'Priority AI Processing',
            'High Speed Processing',
            'Priority Support'
        ],
        color: '#FB923C',
        popular: true,
        btnText: 'Get GOLD'
    },
    {
        name: 'PLATINUM',
        price: '₹149',
        icon: <Crown className="text-[#A371F7]" size={24} />,
        features: [
            'Unlimited Files edit / daily', 
            'Access to Gemini 3.0 Pro', 
            'Access to All Lower Models', 
            'Early Access to New Features', 
            'Maximum Speed & Quality'
        ],
        color: '#A371F7',
        btnText: 'Get PLATINUM'
    }
];

const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, user }) => {
    if (!isOpen) return null;

    const handlePlanClick = (planName: string) => {
        if (planName === 'FREE') {
            onClose();
        } else {
            window.open(INSTAGRAM_LINK, '_blank');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-[1200px] bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-[#30363D] bg-[#161B22]/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="text-[#58A6FF]" size={24} />
                        <div>
                            <h2 className="text-[#E6EDF3] font-bold text-xl tracking-tight">Pricing</h2>
                            <p className="text-[10px] text-[#8B949E] uppercase tracking-widest font-bold">Upgrade your subswap engine</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-[#8B949E] hover:text-white transition-colors"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scroll">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {PLANS.map((plan) => (
                            <div key={plan.name} className={`relative flex flex-col bg-[#161B22] border rounded-2xl p-5 transition-all hover:scale-[1.02] ${plan.popular ? 'border-[#58A6FF] shadow-[0_0_30px_rgba(88,166,255,0.1)]' : 'border-[#30363D]'}`}>
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#58A6FF] text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">Most Popular</div>
                                )}
                                <div className="mb-4 text-center border-b border-[#30363D] pb-4">
                                    <div className="mb-3 flex justify-center">{plan.icon}</div>
                                    <h3 className="text-lg font-black text-white mb-1 tracking-wider">{plan.name}</h3>
                                    <div className="flex items-baseline justify-center gap-1">
                                        <span className="text-2xl font-black text-[#E6EDF3]">{plan.price}</span>
                                        <span className="text-[10px] text-[#8B949E]">/ month</span>
                                    </div>
                                </div>
                                <ul className="flex-1 space-y-2 mb-6">
                                    {plan.features.map(f => (
                                        <li key={f} className="flex items-start gap-2 text-[11px] text-[#8B949E] leading-snug">
                                            <Check size={12} className="text-[#58A6FF] shrink-0 mt-0.5" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <button 
                                    onClick={() => handlePlanClick(plan.name)}
                                    className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${plan.popular ? 'bg-[#58A6FF] hover:bg-[#4C8ED9] text-white' : 'bg-[#0D1117] border border-[#30363D] hover:border-[#8B949E] text-[#E6EDF3]'}`}
                                >
                                    {plan.btnText}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="p-4 bg-[#161B22] border-t border-[#30363D] text-center">
                    <p className="text-[10px] text-[#8B949E]">Plans ke niche get button pe click karke Instagram pe message kare</p>
                </div>
            </div>
        </div>
    );
};

export default PricingModal;