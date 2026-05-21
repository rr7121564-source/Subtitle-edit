import React, { useState } from 'react';
import { Settings, X, Save, Users, Send, ShieldCheck, Bookmark } from 'lucide-react';
import { SubtitleConfig, SubtitlePreset } from '../types';

interface SubtitleConfigModalProps {
  onSave: (config: SubtitleConfig) => void;
  onClose: () => void;
  initialPreset?: SubtitlePreset | null;
  mode: 'EDIT' | 'CREATE';
}

const SubtitleConfigModal: React.FC<SubtitleConfigModalProps> = ({ onSave, onClose, initialPreset, mode }) => {
  const [config, setConfig] = useState<SubtitleConfig>({
    teamName: initialPreset?.teamName || '',
    telegram: initialPreset?.telegram || '',
    subbedBy: initialPreset?.subbedBy || '',
    logoText: initialPreset?.logoText || ''
  });

  const [presetName, setPresetName] = useState(initialPreset?.name || '');
  const [isSavingAsPreset, setIsSavingAsPreset] = useState(!!initialPreset);

  const handleSave = () => {
    if (isSavingAsPreset) {
      if (!presetName.trim()) {
        alert("Please enter a preset name");
        return;
      }
      
      const newPreset: SubtitlePreset = {
        ...config,
        id: initialPreset?.id || Math.random().toString(36).substr(2, 9),
        name: presetName
      };

      const saved = localStorage.getItem('subswap_subtitle_presets');
      let presets: SubtitlePreset[] = [];
      if (saved) {
        try { presets = JSON.parse(saved); } catch (e) {}
      }

      const existingIndex = presets.findIndex(p => p.id === newPreset.id);
      if (existingIndex !== -1) {
        presets[existingIndex] = newPreset;
      } else {
        presets.push(newPreset);
      }

      localStorage.setItem('subswap_subtitle_presets', JSON.stringify(presets));
    }
    onSave(config);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#0D1117] border border-[#30363D] rounded-3xl shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-[#30363D] flex items-center justify-between bg-[#161B22]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1F6FEB]/10 flex items-center justify-center text-[#1F6FEB]">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-white font-black tracking-tight text-lg">Subtitle Config</h2>
              <p className="text-[#8B949E] text-[10px] font-bold uppercase tracking-widest">Global Credits Setup</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-[#8B949E] hover:text-white hover:bg-[#30363D] rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            {/* Optional Preset Toggle */}
            {mode === 'CREATE' && (
              <div 
                onClick={() => setIsSavingAsPreset(!isSavingAsPreset)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between mb-4 ${isSavingAsPreset ? 'bg-[#1F6FEB]/10 border-[#1F6FEB]/40' : 'bg-[#161B22] border-[#30363D]'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isSavingAsPreset ? 'bg-[#1F6FEB] text-white' : 'bg-[#21262D] text-[#8B949E]'}`}>
                    <Bookmark size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Save as Preset</h4>
                    <p className="text-[10px] text-[#8B949E] font-medium leading-tight">Apply and save for future use</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${isSavingAsPreset ? 'bg-[#1F6FEB]' : 'bg-[#30363D]'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isSavingAsPreset ? 'left-6' : 'left-1'}`} />
                </div>
              </div>
            )}

            {/* Preset Name Field */}
            {(isSavingAsPreset || mode === 'EDIT') && (
              <div className="p-4 bg-[#1F6FEB]/5 rounded-2xl border border-[#1F6FEB]/20 mb-6 animate-in slide-in-from-top duration-300">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[#58A6FF] uppercase tracking-widest flex items-center gap-2">
                    <Bookmark size={12} /> Preset Name
                  </label>
                  <input 
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="e.g. My Default Setup"
                    className="w-full bg-[#0D1117] border border-[#30363D] rounded-xl px-4 py-3 text-white text-sm focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF] outline-none transition-all placeholder:text-[#30363D]"
                  />
                </div>
              </div>
            )}

            {/* Team Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest flex items-center gap-2">
                <Users size={12} className="text-[#1F6FEB]" /> Team Name
              </label>
              <input 
                type="text"
                value={config.teamName}
                onChange={(e) => setConfig({ ...config, teamName: e.target.value })}
                placeholder="e.g. Team Ipx"
                className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-4 py-3 text-white text-sm focus:border-[#1F6FEB] focus:ring-1 focus:ring-[#1F6FEB] outline-none transition-all"
              />
            </div>

            {/* Telegram */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest flex items-center gap-2">
                <Send size={12} className="text-[#1F6FEB]" /> Telegram Channel
              </label>
              <input 
                type="text"
                value={config.telegram}
                onChange={(e) => setConfig({ ...config, telegram: e.target.value })}
                placeholder="e.g. @ipxempire"
                className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-4 py-3 text-white text-sm focus:border-[#1F6FEB] focus:ring-1 focus:ring-[#1F6FEB] outline-none transition-all"
              />
            </div>

            {/* Encoded By */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={12} className="text-[#1F6FEB]" /> Subbed By
              </label>
              <input 
                type="text"
                value={config.subbedBy}
                onChange={(e) => setConfig({ ...config, subbedBy: e.target.value })}
                placeholder="e.g. RILU"
                className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-4 py-3 text-white text-sm focus:border-[#1F6FEB] focus:ring-1 focus:ring-[#1F6FEB] outline-none transition-all"
              />
            </div>

            {/* Logo Text */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={12} className="text-[#1F6FEB]" /> Logo Text
              </label>
              <input 
                type="text"
                value={config.logoText}
                onChange={(e) => setConfig({ ...config, logoText: e.target.value })}
                placeholder="e.g. Indian Project X"
                className="w-full bg-[#161B22] border border-[#30363D] rounded-xl px-4 py-3 text-white text-sm focus:border-[#1F6FEB] focus:ring-1 focus:ring-[#1F6FEB] outline-none transition-all"
              />
            </div>
          </div>

          <div className="pt-4">
            <button 
              onClick={handleSave}
              className="w-full bg-[#1F6FEB] hover:bg-[#388BFD] text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-[#1F6FEB]/20 flex items-center justify-center gap-2 group"
            >
              <Save size={18} className="group-hover:scale-110 transition-transform" />
              {isSavingAsPreset ? 'Save Preset & Apply' : 'Apply to All Subtitles'}
            </button>
            <p className="text-center text-[10px] text-[#484F58] mt-4 font-medium uppercase tracking-tighter">
              {isSavingAsPreset ? 'This will save your configuration for future use' : 'This will update credits for all currently imported files'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubtitleConfigModal;
