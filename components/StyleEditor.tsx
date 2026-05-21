
import React, { useState } from 'react';
import { SubtitleData } from '../types';
import { ChevronLeft, Save } from 'lucide-react';

interface StyleEditorProps {
  data: SubtitleData;
  onSave: (data: SubtitleData) => void;
}

const StyleEditor: React.FC<StyleEditorProps> = ({ data, onSave }) => {
  const [scriptInfo, setScriptInfo] = useState(data.scriptInfo);
  const [styles, setStyles] = useState(data.styles);

  return (
    <div className="h-full flex flex-col bg-[#050812] font-sans">
      <div className="h-14 bg-[#0D1117] border-b border-[#30363D] flex items-center justify-between px-4 shrink-0">
          <h2 className="text-[#E6EDF3] font-bold text-sm">Style Editor</h2>
          <button onClick={() => onSave({ ...data, scriptInfo, styles })} className="px-4 py-2 bg-[#1F6FEB] hover:bg-[#388BFD] text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2">
              <Save size={14} /> SAVE
          </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest">Script Info</label>
              <textarea 
                value={scriptInfo} 
                onChange={(e) => setScriptInfo(e.target.value)}
                className="w-full h-48 bg-[#0D1117] border border-[#30363D] rounded-xl p-4 text-xs font-mono text-[#E6EDF3] outline-none focus:border-[#58A6FF]"
              />
          </div>

          <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-widest">V4+ Styles</label>
              <textarea 
                value={styles} 
                onChange={(e) => setStyles(e.target.value)}
                className="w-full h-96 bg-[#0D1117] border border-[#30363D] rounded-xl p-4 text-xs font-mono text-[#E6EDF3] outline-none focus:border-[#58A6FF]"
              />
          </div>
      </div>
    </div>
  );
};

export default StyleEditor;
