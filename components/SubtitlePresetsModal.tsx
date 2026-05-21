import React, { useState, useEffect } from 'react';
import { Bookmark, Plus, FileText, ChevronRight, X, Trash2, Edit3 } from 'lucide-react';
import { SubtitlePreset } from '../types';

interface SubtitlePresetsModalProps {
  onSelect: (preset: SubtitlePreset) => void;
  onApplyDefault: () => void;
  onCreateNew: () => void;
  onEdit: (preset: SubtitlePreset) => void;
  onClose: () => void;
}

const SubtitlePresetsModal: React.FC<SubtitlePresetsModalProps> = ({ onSelect, onApplyDefault, onCreateNew, onEdit, onClose }) => {
  const [presets, setPresets] = useState<SubtitlePreset[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('subswap_subtitle_presets');
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        setPresets([]);
      }
    }
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    localStorage.setItem('subswap_subtitle_presets', JSON.stringify(updated));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#0D1117] border border-[#30363D] rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-6 border-b border-[#30363D] flex items-center justify-between bg-[#161B22]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#58A6FF]/10 flex items-center justify-center text-[#58A6FF]">
              <Bookmark size={20} />
            </div>
            <div>
              <h2 className="text-white font-black tracking-tight text-lg">Select Preset</h2>
              <p className="text-[#8B949E] text-[10px] font-bold uppercase tracking-widest">Saved Subtitle Configurations</p>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {presets.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 rounded-full bg-[#1F242C] flex items-center justify-center text-[#484F58] mb-4">
                <Bookmark size={32} />
              </div>
              <h3 className="text-white font-bold text-sm mb-1">No presets yet</h3>
              <p className="text-[#8B949E] text-xs leading-relaxed max-w-[200px]">
                Create a preset to save time on setting credits and logos.
              </p>
            </div>
          ) : (
            presets.map((preset) => (
              <div 
                key={preset.id}
                onClick={() => onSelect(preset)}
                className="group w-full bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF] rounded-2xl p-4 flex items-center justify-between transition-all cursor-pointer active:scale-95 shadow-sm hover:shadow-[#58A6FF]/5"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#21262D] group-hover:bg-[#58A6FF]/10 flex items-center justify-center text-[#8B949E] group-hover:text-[#58A6FF] transition-colors shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-[#58A6FF] transition-colors">
                      {preset.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono font-bold text-[#8B949E] uppercase tracking-tighter truncate max-w-[120px]">
                        {preset.teamName}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-[#30363D]"></div>
                      <span className="text-[10px] font-bold text-[#484F58] truncate max-w-[80px]">
                        {preset.encodedBy}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 transition-all">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(preset); }}
                    className="p-2.5 text-[#8B949E] hover:text-[#58A6FF] hover:bg-[#58A6FF]/10 rounded-xl transition-all border border-transparent hover:border-[#58A6FF]/20"
                    title="Edit Preset"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button 
                    onClick={(e) => handleDelete(preset.id, e)}
                    className="p-2.5 text-[#8B949E] hover:text-[#F85149] hover:bg-[#F85149]/10 rounded-xl transition-all border border-transparent hover:border-[#F85149]/20"
                    title="Delete Preset"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#30363D] bg-[#161B22]/30 space-y-3">
          <button 
            onClick={onApplyDefault}
            className="w-full bg-[#161B22] hover:bg-[#30363D] border border-[#30363D] text-[#E6EDF3] py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group"
          >
            Use Default Settings
          </button>
          <button 
            onClick={onCreateNew}
            className="w-full bg-[#1F6FEB] hover:bg-[#388BFD] text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-[#1F6FEB]/20 flex items-center justify-center gap-2 group"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
            Custom Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubtitlePresetsModal;
