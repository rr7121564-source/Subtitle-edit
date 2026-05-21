import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, ChevronDown, ArrowRight, Sparkles, Plus, Trash2, KeyRound, ExternalLink, Globe, FileText, Check, Lock, Hash, Upload, Download } from 'lucide-react';
import { User } from '../types';
import { GoogleGenAI } from "@google/genai";

interface GlossaryItem {
    original: string;
    translated: string;
}

interface TranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTranslate: (config: { apiKey: string; model: string; prompt: string; sourceLang: string; targetLang: string; glossary: GlossaryItem[]; batchSize: number; useLessEnglish: boolean }) => void;
  user: User | null;
}

// UPDATED MODEL LIST
const MODELS = [
  // --- PLATINUM TIER ---
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro', badge: 'PLATINUM' },

  // --- GOLD TIER ---
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash', badge: 'GOLD' },

  // --- SILVER TIER ---
  { id: 'gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', badge: 'SILVER' },

  // --- FREE TIER ---
  { id: 'gemini-2.5-flash-lite-preview-02-05', name: 'Gemini 2.5 Flash Lite', badge: 'FREE' },
];

const LANGUAGES = [
    { code: 'auto', name: 'Auto Detect' },
    { code: 'Hinglish', name: 'Hinglish' },
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh-CN', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'id', name: 'Indonesian' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'tr', name: 'Turkish' }
];

const TranslateModal: React.FC<TranslateModalProps> = ({ isOpen, onClose, onStartTranslate, user }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'glossary'>('general');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('subswap_api_key') || '');
  const [model, setModel] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  
  // Settings
  const [batchSize, setBatchSize] = useState(25);
  const [useLessEnglish, setUseLessEnglish] = useState(false);
  const [enableCustomPrompt, setEnableCustomPrompt] = useState(false);
  const [promptContent, setPromptContent] = useState(''); 
  
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('Hinglish');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
  const [tempGlossary, setTempGlossary] = useState<GlossaryItem>({ original: '', translated: '' });
  const [glossarySearch, setGlossarySearch] = useState('');

  const glossaryFileRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // --- STRICT ACCESS CONTROL LOGIC ---
  const getRequiredPlan = (modelId: string): string => {
      // Free Models (2.5 Flash Lite)
      if (modelId.includes('lite')) return 'FREE';

      // Platinum Models (3.0 Pro)
      if (modelId.includes('gemini-3-pro')) return 'PLATINUM';

      // Gold Models (3.0 Flash)
      if (modelId.includes('gemini-3-flash')) return 'GOLD';

      // Silver Models (2.5 Flash Standard)
      if (modelId.includes('gemini-2.5-flash')) return 'SILVER';

      // Fallback
      return 'SILVER';
  };

  const isModelLocked = (modelId: string) => {
      const required = getRequiredPlan(modelId);
      const userPlan = user?.plan || 'FREE';
      
      if (required === 'FREE') return false;
      
      const levels: Record<string, number> = { 
          'FREE': 0, 
          'SILVER': 1, 
          'GOLD': 2, 
          'PLATINUM': 3, 
          'MEMBER': 4, // Owner/VIP
          'BETA_TESTER': 4 
      };
      
      const userLevel = levels[userPlan] || 0;
      const reqLevel = levels[required] || 0;
      
      return userLevel < reqLevel;
  };

  // Set default model on load
  useEffect(() => {
      if (isOpen) {
          // Default to Gemini 2.5 Flash Lite (New Free Standard)
          let bestAvailable = 'gemini-2.5-flash-lite-preview-02-05';

          // Try to upgrade default if user has higher plan
          if (!isModelLocked('gemini-3-pro-preview')) bestAvailable = 'gemini-3-pro-preview';
          else if (!isModelLocked('gemini-3-flash-preview')) bestAvailable = 'gemini-3-flash-preview';
          else if (!isModelLocked('gemini-2.5-flash-preview')) bestAvailable = 'gemini-2.5-flash-preview';
          
          if (!model) {
              setModel(bestAvailable);
          } else if (isModelLocked(model)) {
              setModel(bestAvailable);
          }
      }
  }, [isOpen, user]);

  useEffect(() => {
      const savedGlossary = localStorage.getItem('subswap_glossary');
      if (savedGlossary) {
          try { setGlossary(JSON.parse(savedGlossary)); } catch (e) {}
      }
  }, [isOpen]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
              setShowModelDropdown(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setApiKey(e.target.value);
      localStorage.setItem('subswap_api_key', e.target.value);
  };

  const handleEnhancePrompt = async () => {
      if (!apiKey) { alert("Please enter API Key first."); return; }
      if (!promptContent.trim()) { alert("Please type a basic instruction first."); return; }
      setIsEnhancing(true);
      try {
          const ai = new GoogleGenAI({ apiKey: apiKey });
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-lite-preview-02-05', 
              contents: [{
                  role: 'user',
                  parts: [{ 
                      text: `You are an expert prompt engineer. Rewrite this system instruction to be extremely precise and effective for subtitle translation: "${promptContent}". Output ONLY the enhanced prompt.` 
                  }]
              }]
          });
          if (response.text) {
              setPromptContent(response.text.trim());
          }
      } catch (e) {
          alert("Failed to enhance prompt. Check API Key.");
          console.error(e);
      } finally {
          setIsEnhancing(false);
      }
  };

  // --- GLOSSARY IMPORT / EXPORT LOGIC ---

  const handleImportGlossary = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          if (!text) return;

          const lines = text.split(/\r\n|\n/);
          const newItems: GlossaryItem[] = [];

          lines.forEach(line => {
              const separatorIndex = line.indexOf(' - ');
              if (separatorIndex !== -1) {
                  const original = line.substring(0, separatorIndex).trim();
                  const translated = line.substring(separatorIndex + 3).trim();
                  
                  if (original && translated) {
                      newItems.push({ original, translated });
                  }
              }
          });

          if (newItems.length > 0) {
              const updated = [...glossary, ...newItems];
              setGlossary(updated);
              localStorage.setItem('subswap_glossary', JSON.stringify(updated));
              alert(`Imported ${newItems.length} glossary items.`);
          } else {
              alert("No valid items found. Format must be 'Original - Translated' per line.");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleExportGlossary = () => {
      if (glossary.length === 0) { alert("Glossary is empty."); return; }
      
      const content = glossary.map(g => `${g.original} - ${g.translated}`).join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'glossary_export.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleClearGlossary = () => {
      setGlossary([]);
      localStorage.removeItem('subswap_glossary');
  };

  const handleAddGlossary = () => {
      if (!tempGlossary.original.trim() || !tempGlossary.translated.trim()) return;
      const updated = [...glossary, { ...tempGlossary }];
      setGlossary(updated);
      localStorage.setItem('subswap_glossary', JSON.stringify(updated));
      setTempGlossary({ original: '', translated: '' });
  };

  const handleRemoveGlossary = (index: number) => {
      const updated = glossary.filter((_, i) => i !== index);
      setGlossary(updated);
      localStorage.setItem('subswap_glossary', JSON.stringify(updated));
  };

  const filteredGlossary = glossary.filter(g => 
      g.original.toLowerCase().includes(glossarySearch.toLowerCase()) || 
      g.translated.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  const handleSubmit = () => {
    if (!apiKey.trim()) { alert("API Key is required."); return; }
    if (!model) { alert("Please select a valid model."); return; }
    if (isModelLocked(model)) { alert("You do not have access to this model."); return; }
    
    onStartTranslate({ 
        apiKey, 
        model, 
        prompt: enableCustomPrompt ? promptContent : '', 
        sourceLang, 
        targetLang, 
        glossary,
        batchSize,
        useLessEnglish
    });
    onClose();
  };

  const selectedModelName = MODELS.find(m => m.id === model)?.name || model;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-2xl bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[#30363D] bg-[#0D1117] flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <Bot className="text-[#58A6FF]" size={20} />
                    <h2 className="text-[#E6EDF3] font-bold">Translator Setup</h2>
                </div>
                <button onClick={onClose} className="text-[#8B949E] hover:text-[#E6EDF3] p-1 rounded-full"><X size={20} /></button>
            </div>

            <div className="flex border-b border-[#30363D] bg-[#0D1117] shrink-0">
                <button onClick={() => setActiveTab('general')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 ${activeTab === 'general' ? 'border-[#58A6FF] text-[#E6EDF3] bg-[#161B22]' : 'border-transparent text-[#8B949E] hover:bg-[#161B22]'}`}>Config</button>
                <button onClick={() => setActiveTab('glossary')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 ${activeTab === 'glossary' ? 'border-[#58A6FF] text-[#E6EDF3] bg-[#161B22]' : 'border-transparent text-[#8B949E] hover:bg-[#161B22]'}`}>Glossary</button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#161B22] p-6 custom-scroll">
                {activeTab === 'general' && (
                    <div className="space-y-6">
                        
                        {/* API KEY */}
                        <div className="bg-[#0D1117] border border-[#30363D] p-4 rounded-xl space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-[#E6EDF3] uppercase flex items-center gap-2">
                                    <KeyRound size={14} className="text-[#A371F7]" /> Google API Key <span className="text-[#F85149]">*</span>
                                </label>
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-[#58A6FF] hover:underline flex items-center gap-1">
                                    Get Key <ExternalLink size={10} />
                                </a>
                            </div>
                            <input type="password" placeholder="Paste your Gemini API Key here" value={apiKey} onChange={handleApiKeyChange} className="w-full bg-[#161B22] border border-[#30363D] rounded-lg p-3 text-sm text-[#E6EDF3] outline-none focus:border-[#A371F7] transition-colors font-mono" />
                        </div>

                        {/* MODEL SELECT */}
                        <div className="space-y-2" ref={modelDropdownRef}>
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-[#8B949E] uppercase">Select Model</label>
                                <span className="text-[9px] font-bold text-[#A371F7] uppercase tracking-widest">{user?.plan || 'FREE'} PLAN</span>
                            </div>
                            <div className="relative">
                                <button onClick={() => setShowModelDropdown(!showModelDropdown)} className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-3 flex items-center justify-between text-sm text-[#E6EDF3] hover:border-[#58A6FF] transition-colors">
                                    <span className="truncate">{selectedModelName}</span>
                                    <ChevronDown className={`text-[#8B949E] transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} size={16} />
                                </button>
                                {showModelDropdown && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-[#0D1117] border border-[#30363D] rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto custom-scroll p-1 animate-in fade-in zoom-in-95 duration-100">
                                        {MODELS.map(m => {
                                            const locked = isModelLocked(m.id);
                                            const reqPlan = getRequiredPlan(m.id);
                                            
                                            let planColor = "text-[#8B949E]";
                                            if (reqPlan === 'PLATINUM') planColor = "text-[#A371F7]";
                                            else if (reqPlan === 'GOLD') planColor = "text-[#FB923C]";
                                            else if (reqPlan === 'SILVER') planColor = "text-[#E6EDF3]";

                                            return (
                                                <button 
                                                    key={m.id} 
                                                    onClick={() => { if (!locked) { setModel(m.id); setShowModelDropdown(false); } else { alert(`Upgrade to ${reqPlan} to access this model.`); } }} 
                                                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between group ${!locked ? (model === m.id ? 'bg-[#1F6FEB]/20 text-[#58A6FF]' : 'text-[#E6EDF3] hover:bg-[#161B22]') : 'bg-[#161B22]/30 text-[#8B949E] cursor-not-allowed opacity-60'}`}
                                                >
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <span className="truncate">{m.name}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#30363D] ${!locked && m.id === model ? 'text-[#58A6FF]' : 'text-[#8B949E]'}`}>
                                                            {m.badge}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {!locked && model === m.id && <Check size={14} />}
                                                        {locked && (
                                                            <div className="flex items-center gap-1">
                                                                <span className={`text-[9px] font-bold uppercase ${planColor}`}>{reqPlan}</span>
                                                                <Lock size={12} className="text-[#F85149]" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* LANGUAGE */}
                        <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-end">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-[#8B949E] uppercase flex items-center gap-2"><Globe size={12}/> Source</label>
                                <div className="relative">
                                    <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-3 text-sm text-[#E6EDF3] outline-none focus:border-[#58A6FF] appearance-none cursor-pointer">
                                        <option value="auto">Auto Detect</option>
                                        {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={`src-${l.code}`} value={l.name}>{l.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none" size={16} />
                                </div>
                            </div>
                            <div className="pb-3 text-[#8B949E]"><ArrowRight size={20} /></div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-[#8B949E] uppercase flex items-center gap-2"><Globe size={12}/> Target</label>
                                <div className="relative">
                                    <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-3 text-sm text-[#E6EDF3] outline-none focus:border-[#58A6FF] appearance-none cursor-pointer">
                                        {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={`tgt-${l.code}`} value={l.name}>{l.name}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none" size={16} />
                                </div>
                            </div>
                        </div>

                        {/* ADVANCED SETTINGS ROW */}
                        <div className="space-y-4 pt-2 border-t border-[#30363D]">
                             {/* Batch Size Input */}
                             <div className="space-y-2">
                                 <label className="text-xs font-bold text-[#8B949E] uppercase flex items-center gap-2">
                                    <Hash size={12} /> Batch Size (Lines)
                                 </label>
                                 <input 
                                     type="number" 
                                     value={batchSize} 
                                     onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 25))} 
                                     className="w-full bg-[#0D1117] border border-[#30363D] rounded-lg p-3 text-sm text-[#E6EDF3] outline-none focus:border-[#58A6FF]"
                                     placeholder="e.g. 25"
                                 />
                                 <p className="text-[10px] text-[#8B949E]">Recommended: 25 for Free Tier keys to avoid Token Errors.</p>
                             </div>

                             {/* Toggles */}
                             <div className="flex flex-col gap-3">
                                 {/* Less English Toggle */}
                                 <label className="flex items-center gap-3 bg-[#0D1117] p-3 rounded-lg border border-[#30363D] cursor-pointer hover:border-[#58A6FF] transition-colors">
                                     <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${useLessEnglish ? 'bg-[#238636] border-[#238636]' : 'border-[#30363D]'}`}>
                                         {useLessEnglish && <Check size={14} className="text-white" />}
                                     </div>
                                     <input type="checkbox" className="hidden" checked={useLessEnglish} onChange={() => setUseLessEnglish(!useLessEnglish)} />
                                     <div className="flex-1">
                                         <span className="text-sm font-bold text-[#E6EDF3]">Use Less English Words</span>
                                         <p className="text-[10px] text-[#8B949E]">Translate EVERYTHING except common words (e.g. Ok, Car, Game).</p>
                                     </div>
                                 </label>

                                 {/* Custom Prompt Toggle */}
                                 <label className="flex items-center gap-3 bg-[#0D1117] p-3 rounded-lg border border-[#30363D] cursor-pointer hover:border-[#58A6FF] transition-colors">
                                     <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${enableCustomPrompt ? 'bg-[#A371F7] border-[#A371F7]' : 'border-[#30363D]'}`}>
                                         {enableCustomPrompt && <Check size={14} className="text-white" />}
                                     </div>
                                     <input type="checkbox" className="hidden" checked={enableCustomPrompt} onChange={() => setEnableCustomPrompt(!enableCustomPrompt)} />
                                     <div className="flex-1">
                                         <span className="text-sm font-bold text-[#E6EDF3]">Enable Custom Prompt</span>
                                         <p className="text-[10px] text-[#8B949E]">Write your own system instructions.</p>
                                     </div>
                                 </label>
                             </div>
                        </div>

                        {/* CUSTOM PROMPT AREA (Conditional) */}
                        {enableCustomPrompt && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-[#8B949E] uppercase">System Instruction</label>
                                    <button onClick={handleEnhancePrompt} disabled={isEnhancing} className="flex items-center gap-1 text-[#A371F7] text-[10px] font-bold uppercase hover:text-white transition-colors">
                                        <Sparkles size={12} /> {isEnhancing ? 'Optimizing...' : 'Enhance Prompt'}
                                    </button>
                                </div>
                                <textarea 
                                    value={promptContent} 
                                    onChange={(e) => setPromptContent(e.target.value)} 
                                    className="w-full h-32 bg-[#0D1117] border border-[#30363D] rounded-lg p-3 text-xs font-mono text-[#E6EDF3] resize-none focus:border-[#58A6FF] outline-none"
                                    placeholder="Enter your custom instructions here..."
                                />
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'glossary' && (
                    <div className="flex flex-col h-full gap-3">
                         
                         {/* ACTION BAR (Import/Export/Clear) */}
                         <div className="grid grid-cols-3 gap-2">
                             <input type="file" ref={glossaryFileRef} className="hidden" accept=".txt" onChange={handleImportGlossary} />
                             
                             <button onClick={() => glossaryFileRef.current?.click()} className="flex items-center justify-center gap-2 bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF] hover:text-[#58A6FF] rounded-lg py-2 text-xs font-bold transition-all text-[#8B949E]">
                                 <Upload size={14} /> Import
                             </button>

                             <button onClick={handleExportGlossary} className="flex items-center justify-center gap-2 bg-[#161B22] border border-[#30363D] hover:border-[#238636] hover:text-[#238636] rounded-lg py-2 text-xs font-bold transition-all text-[#8B949E]">
                                 <Download size={14} /> Export
                             </button>

                             <button onClick={handleClearGlossary} className="flex items-center justify-center gap-2 bg-[#161B22] border border-[#30363D] hover:border-[#F85149] hover:text-[#F85149] rounded-lg py-2 text-xs font-bold transition-all text-[#8B949E]">
                                 <Trash2 size={14} /> Clear
                             </button>
                         </div>

                         {/* MANUAL ENTRY */}
                         <div className="bg-[#0D1117] p-3 rounded-xl border border-[#30363D]">
                            <div className="flex gap-2">
                                <input type="text" placeholder="Original Word" value={tempGlossary.original} onChange={(e) => setTempGlossary({...tempGlossary, original: e.target.value})} className="flex-1 min-w-0 bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-[#E6EDF3] outline-none focus:border-[#58A6FF] placeholder-[#484F58]" />
                                <input type="text" placeholder="Translated Meaning" value={tempGlossary.translated} onChange={(e) => setTempGlossary({...tempGlossary, translated: e.target.value})} className="flex-1 min-w-0 bg-[#161B22] border border-[#30363D] rounded-lg px-3 py-2 text-xs text-[#E6EDF3] outline-none focus:border-[#58A6FF] placeholder-[#484F58]" />
                                <button onClick={handleAddGlossary} className="shrink-0 bg-[#238636] hover:bg-[#2ea043] text-white px-3 rounded-lg transition-colors flex items-center justify-center shadow-lg"><Plus size={16} /></button>
                            </div>
                        </div>

                        {/* SEARCH & LIST */}
                        <div className="flex-1 overflow-y-auto space-y-1 bg-[#0D1117] border border-[#30363D] rounded-xl p-2 custom-scroll flex flex-col">
                            {glossary.length > 0 && (
                                <input 
                                   type="text" 
                                   placeholder="Search glossary..." 
                                   value={glossarySearch} 
                                   onChange={e => setGlossarySearch(e.target.value)} 
                                   className="w-full bg-[#161B22] border border-[#30363D] rounded-lg p-2 text-xs text-[#E6EDF3] outline-none mb-2 focus:border-[#A371F7] shrink-0" 
                                />
                            )}
                            
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scroll">
                                {filteredGlossary.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-[#484F58] opacity-50">
                                        <FileText size={24} className="mb-2"/>
                                        <span className="text-xs">Empty Glossary</span>
                                    </div>
                                ) : (
                                    filteredGlossary.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-[#161B22] p-2 rounded-lg text-xs border border-transparent hover:border-[#30363D] group">
                                            <div className="flex items-center gap-2 overflow-hidden flex-1">
                                                <span className="text-[#E6EDF3] font-medium truncate w-[45%] text-right">{item.original}</span>
                                                <ArrowRight size={10} className="text-[#8B949E] shrink-0" />
                                                <span className="text-[#58A6FF] truncate w-[45%] text-left">{item.translated}</span>
                                            </div>
                                            <button onClick={() => handleRemoveGlossary(idx)} className="text-[#F85149] hover:bg-[#30363D] p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all ml-2"><Trash2 size={12} /></button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-[#30363D] bg-[#0D1117] flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-[#8B949E] hover:text-[#E6EDF3]">Cancel</button>
                <button onClick={handleSubmit} className="px-6 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-bold flex items-center gap-2 shadow-lg transition-all transform active:scale-95">
                    <Sparkles size={16} /> Start Translating
                </button>
            </div>
        </div>
    </div>
  );
};

export default TranslateModal;