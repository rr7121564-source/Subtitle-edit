import React, { useRef, useState, useEffect } from 'react';
import { Upload, User as UserIcon, ShieldCheck, Clock, Activity, Languages, CheckCircle, Bookmark, PlayCircle } from 'lucide-react';
import { SubtitleData, User } from '../types';
import { parseSubtitleContent } from '../services/parser';
import { extractSubtitleFromMkv, getMkvSubtitleTracks, MkvTrack } from '../services/mkvExtractor';
import CreditErrorModal from './CreditErrorModal';

interface FileUploadProps {
  onFilesLoaded: (data: SubtitleData[]) => void;
  setVideoSrc: (src: string | null) => void;
  user: User | null;
  projectFiles?: SubtitleData[];
  onBackToProject?: () => void;
  onOpenProfile: () => void;
  onOpenPricing: () => void;
  onOpenPresets: () => void;
}

const PLAN_LIMITS: Record<string, number> = {
    'FREE': 0,
    'MEMBER': 9999
};

const FileUpload: React.FC<FileUploadProps> = ({ onFilesLoaded, setVideoSrc, user, projectFiles = [], onBackToProject, onOpenProfile, onOpenPricing, onOpenPresets }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [isProcessing, setIsProcessing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // MKV Multi-track selection
  const [mkvTracks, setMkvTracks] = useState<MkvTrack[]>([]);
  const [selectedMkvFile, setSelectedMkvFile] = useState<File | null>(null);
  const [showMkvSelector, setShowMkvSelector] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  
  // Usage Calc
  const planName = 'MEMBER';
  const limit = 9999;
  const used = user?.dailyUsage?.count || 0;
  const credits = 9999;
  
  let percentage = 100;
  let isLimitReached = false;

  // Timer for elapsed time
  useEffect(() => {
      let interval: any;
      if (isProcessing) {
          interval = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
      }
      return () => { clearInterval(interval); setElapsedTime(0); };
  }, [isProcessing]);

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s}s`;
  };

  const checkLimit = (count = 1) => {
      return true;
  };

  const processFiles = async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;
      
      // Check for ZIP files (Explicitly forbidden per user request)
      const hasZip = fileArray.some(f => f.name.toLowerCase().endsWith('.zip'));
      if (hasZip) {
          alert("ZIP files are not supported for Subtitle import. Please select individual subtitle files.");
          return;
      }
      
      // Check if any MKV is present in a multi-selection
      const hasMkv = fileArray.some(f => f.name.toLowerCase().endsWith('.mkv'));
      
      if (hasMkv && fileArray.length > 1) {
          alert("Multiple files including MKV are not supported. Please select either multiple subtitle files (.ass, .srt, etc.) or a single MKV file.");
          return;
      }

      // If it's a single MKV, process it separately
      if (fileArray.length === 1 && hasMkv) {
          setIsProcessing(true);
          await handleMkvProcess(fileArray[0]);
          setIsProcessing(false);
          return;
      }

      // Process standard subtitle files
      if (!checkLimit(fileArray.length)) return;

      setIsProcessing(true);
      const loadedData: SubtitleData[] = [];

      for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];
          const ext = file.name.split('.').pop()?.toLowerCase();
          
          // Skip MKV if somehow reached here in mixed mode
          if (ext === 'mkv') continue;

          try {
              const buffer = await file.arrayBuffer();
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(buffer);
              loadedData.push({
                  ...parseSubtitleContent(text, file.name),
                  sourceType: 'file'
              });
          } catch (err) {
              console.error(`Error reading file ${file.name}:`, err);
          }
      }
      
      if (loadedData.length > 0) {
          onFilesLoaded(loadedData);
      } else {
          alert("No valid subtitle files were found in your selection.");
      }
      
      setIsProcessing(false);
  };

  const handleMkvProcess = async (file: File) => {
      if (!checkLimit(1)) return;
      
      setIsProcessing(true);
      try {
        const tracks = await getMkvSubtitleTracks(file);
        setIsProcessing(false);

        if (tracks.length === 0) {
            alert("No internal subtitles found in this MKV.");
            return;
        }

        if (tracks.length === 1) {
            // Only one track, auto-extract
            await extractSelectedTrack(file, tracks[0].number);
        } else {
            // Multiple tracks, show selector
            setSelectedMkvFile(file);
            setMkvTracks(tracks);
            setShowMkvSelector(true);
        }
      } catch(e) {
          setIsProcessing(false);
          alert("Error analyzing MKV file.");
      }
  };

  const extractSelectedTrack = async (file: File, trackNumber: number) => {
      setIsProcessing(true);
      setShowMkvSelector(false);
      
      try {
          const videoTitle = file.name.replace(/\.[^/.]+$/, "");
          const extracted = await extractSubtitleFromMkv(file, videoTitle, trackNumber);
          
          if (extracted) {
              onFilesLoaded([{
                  ...parseSubtitleContent(extracted, file.name.replace(/\.[^/.]+$/, ".ass")),
                  sourceType: 'mkv'
              }]);
              setVideoSrc(URL.createObjectURL(file));
          } else {
              alert("Failed to extract the selected track.");
          }
      } catch (e) {
          alert("Error extracting subtitle from MKV.");
      } finally {
          setIsProcessing(false);
          setMkvTracks([]);
          setSelectedMkvFile(null);
      }
  };

  const handleSubtitleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(e.target.files);
      e.target.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await processFiles(e.dataTransfer.files);
      }
  };

  return (
    <div 
        className="flex flex-col h-full bg-[#050812] relative overflow-hidden font-sans select-none"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
    >
        {/* Background Ambient Glow */}
        <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-[#58A6FF]/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] bg-[#A371F7]/5 rounded-full blur-[120px] pointer-events-none"></div>

        {/* Drag Overlay */}
        {isDragging && (
            <div className="absolute inset-0 z-50 bg-[#050812]/90 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-[#58A6FF] m-4 rounded-3xl">
                <div className="text-center animate-bounce">
                    <Upload size={64} className="text-[#58A6FF] mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white">Drop Files Here</h2>
                    <p className="text-[#8B949E]">Release to import subtitles</p>
                </div>
            </div>
        )}

        {/* TOP BAR */}
        <div className="absolute top-6 left-0 right-0 px-6 flex justify-between z-20">
             {/* Left: Branding & Tutorial */}
             <div className="flex items-center gap-4">
                 <div className="hidden md:block">
                     <h1 className="text-lg font-black tracking-tight text-white">SUB<span className="text-[#58A6FF]">SWAP</span></h1>
                 </div>
                 
                 <button 
                    onClick={() => window.open('https://youtu.be/r_X52kZy6Rs?si=HcJyDRjRRrD3egym', '_blank')}
                    className="bg-[#0D1117]/80 backdrop-blur-md border border-[#30363D] hover:border-[#58A6FF] rounded-full pl-3 pr-4 py-1.5 flex items-center gap-2 transition-all shadow-lg group"
                 >
                    <div className="w-5 h-5 rounded-full bg-[#58A6FF]/10 flex items-center justify-center group-hover:bg-[#58A6FF] transition-colors">
                        <PlayCircle size={12} className="text-[#58A6FF] group-hover:text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-[#8B949E] group-hover:text-white uppercase tracking-widest">Tutorial</span>
                 </button>
             </div>

             <div className="flex items-center gap-3">
                <button 
                  onClick={onOpenPresets}
                  className="bg-[#0D1117]/80 backdrop-blur-md border border-[#30363D] hover:border-[#58A6FF] rounded-full p-2 text-[#8B949E] hover:text-[#58A6FF] transition-all shadow-lg hidden sm:flex items-center justify-center"
                >
                    <Bookmark size={18} />
                </button>

                {projectFiles.length > 0 && onBackToProject && (
                    <button onClick={onBackToProject} className="bg-[#1F6FEB] hover:bg-[#388BFD] text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg flex items-center gap-2">
                        <Languages size={12} /> Back to Project
                    </button>
                )}

                <button onClick={onOpenProfile} className="group bg-[#0D1117]/80 backdrop-blur-md border border-[#30363D] hover:border-[#A371F7] rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-3 transition-all shadow-lg">
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-[10px] font-bold text-[#A371F7] uppercase">{user?.username}</span>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-[#A371F7]/10 border border-[#A371F7]/30 flex items-center justify-center text-[#A371F7] group-hover:bg-[#A371F7] group-hover:text-white transition-colors">
                        <UserIcon size={12} />
                    </div>
                </button>
             </div>
        </div>

        {/* CENTER CONTENT */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8 z-10 w-full max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-500">
            
            {/* Branding Center */}
            <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-gradient-to-br from-[#161B22] to-[#0D1117] border border-[#30363D] rounded-3xl mx-auto flex items-center justify-center shadow-2xl mb-4 relative group cursor-default">
                    <div className="absolute inset-0 bg-[#58A6FF] rounded-3xl opacity-0 group-hover:opacity-10 blur-xl transition-opacity"></div>
                    <Languages size={32} className="text-[#E6EDF3] group-hover:scale-110 transition-transform duration-500" />
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter">
                    SUB<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#58A6FF] to-[#A371F7]">SWAP</span>
                </h1>
                <p className="text-[#8B949E] text-xs font-bold tracking-[0.4em] uppercase opacity-80">
                    SRT,VTT - ASS (AUTOMATIC)
                </p>
            </div>

            {/* MAIN ACTIONS */}
            <div className="w-full max-w-sm mx-auto">
                {/* 1. Import Subtitle */}
                <button 
                    onClick={() => { if(checkLimit()) fileInputRef.current?.click(); }}
                    className="w-full group relative overflow-hidden bg-[#0D1117] hover:bg-[#161B22] border border-[#30363D] hover:border-[#58A6FF]/50 rounded-[24px] p-1 transition-all duration-300 shadow-xl hover:shadow-[#58A6FF]/10 hover:-translate-y-1"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#58A6FF]/5 to-[#A371F7]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative flex items-center gap-6 p-6">
                        <div className="w-14 h-14 rounded-2xl bg-[#1F242C] border border-[#30363D] flex items-center justify-center shadow-inner group-hover:border-[#58A6FF]/30 transition-colors">
                            <Languages size={24} className="text-[#E6EDF3] group-hover:text-[#58A6FF] transition-colors" />
                        </div>
                        <div className="text-left flex-1">
                            <h3 className="text-lg font-bold text-white group-hover:text-[#58A6FF] transition-colors">Import Subtitle</h3>
                            <p className="text-xs text-[#8B949E]">Supports .ASS, .SRT, .VTT, .MKV</p>
                        </div>
                        <div className="w-8 h-8 rounded-full border border-[#30363D] flex items-center justify-center text-[#8B949E] group-hover:bg-[#58A6FF] group-hover:text-white group-hover:border-[#58A6FF] transition-all">
                           <Languages size={14} />
                        </div>
                    </div>
                </button>
            </div>

            {/* QUOTA BAR */}
            <div className="w-full">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider">Unlimited Access Enabled</span>
                    <span className="text-[10px] font-bold font-mono text-[#58A6FF]">
                        ∞ Credits
                    </span>
                </div>
                <div className="h-1.5 w-full bg-[#161B22] rounded-full overflow-hidden border border-[#30363D]/50">
                    <div 
                        className="h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r from-[#58A6FF] to-[#A371F7]"
                        style={{ width: "100%" }}
                    ></div>
                </div>
            </div>
        </div>

        {/* BOTTOM FOOTER */}
        <div className="absolute bottom-6 w-full text-center pointer-events-none">
             <p className="text-[9px] text-[#484F58] font-mono">V2.5.0 • PRODUCTION BUILD POWERED BY : TEAM IPX</p>
        </div>

        {/* HIDDEN INPUTS */}
        <input ref={fileInputRef} type="file" accept=".ass,.srt,.vtt,.ssa,.txt,.mkv" multiple className="hidden" onChange={handleSubtitleImport} />
        
        {/* MKV TRACK SELECTOR MODAL */}
        {showMkvSelector && selectedMkvFile && (
            <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
                <div className="w-full max-w-md bg-[#0D1117] border border-[#30363D] rounded-[32px] overflow-hidden shadow-2xl flex flex-col">
                    <div className="p-8 border-b border-[#30363D] bg-gradient-to-br from-[#161B22] to-[#0D1117]">
                        <h2 className="text-2xl font-black text-white mb-2">Select Subtitle Track</h2>
                        <p className="text-[#8B949E] text-xs font-bold uppercase tracking-widest">
                            Found {mkvTracks.length} tracks in <span className="text-[#58A6FF] italic">{selectedMkvFile.name}</span>
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 max-h-[60vh] space-y-2 custom-scrollbar">
                        {mkvTracks.map((track) => (
                            <button
                                key={track.number}
                                onClick={() => extractSelectedTrack(selectedMkvFile, track.number)}
                                className="w-full text-left p-4 rounded-2xl border border-[#30363D] hover:border-[#58A6FF] bg-[#161B22]/50 hover:bg-[#1F6FEB]/10 transition-all flex items-center gap-4 group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-[#0D1117] border border-[#30363D] flex flex-col items-center justify-center group-hover:border-[#58A6FF]/50 transition-colors">
                                    <span className="text-[10px] font-black text-[#8B949E] group-hover:text-[#58A6FF]">{track.number}</span>
                                    <Languages size={14} className="text-[#58A6FF]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-white truncate group-hover:text-[#58A6FF] transition-colors">
                                        {track.name}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono font-bold text-[#8B949E] uppercase tracking-tighter">{track.codecId} {track.language}</span>
                                    </div>
                                </div>
                                <div className="text-[#8B949E] group-hover:text-[#58A6FF] group-hover:translate-x-1 transition-all">
                                    <CheckCircle size={18} />
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="p-4 bg-[#161B22]/50 text-center">
                        <button 
                            onClick={() => { setShowMkvSelector(false); setSelectedMkvFile(null); setMkvTracks([]); }}
                            className="w-full py-3 rounded-xl border border-[#30363D] text-red-500 hover:text-white hover:bg-red-500/10 hover:border-red-500/50 transition-all text-xs font-bold uppercase tracking-widest"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        <CreditErrorModal isOpen={showCreditModal} onClose={() => setShowCreditModal(false)} />

        {/* PROCESS WINDOW */}
        {isProcessing && (
            <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
                 <div className="w-full max-w-sm bg-[#0D1117] border border-[#30363D] rounded-3xl p-8 flex flex-col items-center shadow-2xl relative overflow-hidden ring-1 ring-white/5">
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#58A6FF] via-[#A371F7] to-[#58A6FF] animate-gradient-x"></div>
                     
                     <div className="mb-6 relative">
                        <div className="w-20 h-20 rounded-full border-4 border-[#30363D] border-t-[#58A6FF] animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Activity size={24} className="text-[#58A6FF] animate-pulse" />
                        </div>
                     </div>
                     
                     <h2 className="text-xl font-black text-white mb-1 uppercase tracking-tight">Processing File</h2>
                     <p className="text-[#8B949E] text-[10px] mb-8 font-bold uppercase tracking-widest opacity-80">Extraction & Localizing Tags</p>
                     
                     <div className="w-full space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-mono font-bold tracking-tighter">
                                <span className="text-[#8B949E]">PROGRESS</span>
                                <span className="text-white">{Math.min(100, Math.floor((elapsedTime / 15) * 100))}%</span>
                            </div>
                            <div className="h-2 w-full bg-[#161B22] rounded-full overflow-hidden border border-[#30363D]">
                                <div 
                                    className="h-full bg-gradient-to-r from-[#58A6FF] to-[#A371F7] transition-all duration-500 ease-out"
                                    style={{ width: `${Math.min(100, (elapsedTime / 15) * 100)}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#161B22]/50 border border-[#30363D] rounded-xl p-3">
                                <span className="block text-[9px] font-bold text-[#8B949E] uppercase mb-1">ELAPSED</span>
                                <span className="text-xs font-mono font-bold text-white">{formatTime(elapsedTime)}</span>
                            </div>
                            <div className="bg-[#161B22]/50 border border-[#30363D] rounded-xl p-3">
                                <span className="block text-[9px] font-bold text-[#8B949E] uppercase mb-1">ESTIMATED</span>
                                <span className="text-xs font-mono font-bold text-white">{formatTime(Math.max(0, 15 - elapsedTime))}</span>
                            </div>
                        </div>
                     </div>

                     <button 
                        onClick={() => {
                            setIsProcessing(false);
                            setElapsedTime(0);
                            // In a real app we would abort the fetch or worker
                        }}
                        className="mt-8 w-full py-4 bg-[#F85149]/10 hover:bg-[#F85149] text-[#F85149] hover:text-white border border-[#F85149]/20 font-bold rounded-2xl transition-all shadow-lg text-sm"
                     >
                        Cancel Process
                     </button>
                 </div>
            </div>
        )}
    </div>
  );
};

export default FileUpload;