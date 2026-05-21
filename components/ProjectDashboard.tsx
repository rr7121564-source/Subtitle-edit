import React from 'react';
import { SubtitleData } from '../types';
import { ArrowLeft, FileText, Edit2, Archive, CheckCircle2, Clock, X, Upload, Bookmark, Sparkles, ClipboardPaste, Languages, Search, Plus, MoreVertical, Trash2 } from 'lucide-react';

interface ProjectDashboardProps {
    files: SubtitleData[];
    onSelectFile: (index: number) => void;
    onRenameFile: (index: number, newName: string) => void;
    onDeleteFile: (index: number) => void;
    onDownloadFile: (index: number) => void;
    onStarFile: (index: number) => void;
    onGlobalPaste: () => void;
    onExportAll: () => void;
    onAddFiles: () => void;
    onBack: () => void;
    onOpenPresets: () => void;
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ files, onSelectFile, onRenameFile, onDeleteFile, onDownloadFile, onStarFile, onGlobalPaste, onExportAll, onAddFiles, onBack, onOpenPresets }) => {
    const [renamingIndex, setRenamingIndex] = React.useState<number | null>(null);
    const [menuIndex, setMenuIndex] = React.useState<number | null>(null);
    const [newName, setNewName] = React.useState('');
    const [searchQuery, setSearchQuery] = React.useState('');
    const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

    const handleRenameClick = (e: React.MouseEvent, idx: number, currentName: string) => {
        e.stopPropagation();
        setRenamingIndex(idx);
        setNewName(currentName.replace(/\.ass$|\.srt$|\.vtt$/i, ''));
    };

    const confirmRename = () => {
        if (renamingIndex !== null && newName.trim()) {
            const ext = files[renamingIndex].originalFileName.split('.').pop() || 'ass';
            onRenameFile(renamingIndex, `${newName.trim()}.${ext}`);
            setRenamingIndex(null);
        }
    };

    const isLongPressActive = React.useRef(false);

    const startLongPress = (idx: number) => {
        isLongPressActive.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPressActive.current = true;
            setMenuIndex(idx);
            longPressTimer.current = null;
        }, 800);
    };

    const endLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleSelectWithLongPressPrevention = (idx: number) => {
        if (isLongPressActive.current) {
            isLongPressActive.current = false;
            return;
        }
        onSelectFile(idx);
    };

    const filteredFiles = files.filter(f => 
        f.originalFileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.episodeNum && f.episodeNum.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    return (
        <div className="h-full flex flex-col bg-[#010409] font-sans text-[#E6EDF3]">
            {/* Header */}
            <div className="px-4 py-3 bg-[#0D1117] border-b border-[#30363D] flex flex-col gap-3 shrink-0 z-20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="p-2 text-[#8B949E] hover:text-white rounded-lg hover:bg-[#30363D] transition-all">
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex flex-col">
                            <h2 className="text-base font-bold flex items-center gap-2">
                                <Archive className="text-[#A371F7]" size={16} />
                                Dashboard
                            </h2>
                            <div className="flex items-center gap-2 text-[10px] text-[#8B949E] font-medium uppercase tracking-wider">
                                <span>{files.length} Subtitles</span>
                                <span className="w-1 h-1 rounded-full bg-[#30363D]"></span>
                                <span className="text-[#58A6FF]">{files.filter(f => f.isModified).length} Complete</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={onOpenPresets}
                            className="p-2 text-[#8B949E] hover:text-[#58A6FF] rounded-lg hover:bg-[#30363D] border border-[#30363D] transition-all hidden sm:flex"
                            title="Format Presets"
                        >
                            <Bookmark size={18} />
                        </button>
                        <div className="h-4 w-[1px] bg-[#30363D] mx-1 hidden sm:block"></div>
                        <button 
                            onClick={onExportAll}
                            className="p-2 text-[#8B949E] hover:text-[#58A6FF] rounded-lg hover:bg-[#30363D] border border-[#30363D] transition-all"
                            title="Export All as ZIP"
                        >
                            <span className="font-black text-xs">ZIP</span>
                        </button>
                        <div className="h-4 w-[1px] bg-[#30363D] mx-1"></div>
                        <button 
                            onClick={onGlobalPaste}
                            className="flex items-center gap-2 px-4 py-2 bg-[#1F6FEB] hover:bg-[#388BFD] text-white rounded-lg font-bold text-xs transition-all shadow-lg shadow-blue-900/10"
                        >
                            <ClipboardPaste size={16} /> <span>PASTE</span>
                        </button>
                    </div>
                </div>

                {/* Sub-header with search */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] group-focus-within:text-[#58A6FF] transition-colors" size={14} />
                        <input 
                            type="text"
                            placeholder="Search subtitles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#010409] border border-[#30363D] rounded-lg pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF]/20 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scroll">
                {filteredFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
                        <div className="w-20 h-20 rounded-full bg-[#161B22] flex items-center justify-center mb-6 border-2 border-dashed border-[#30363D]">
                            <FileText size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">
                            {searchQuery ? 'No matching files' : 'No subtitles yet'}
                        </h3>
                        <p className="text-sm max-w-xs mx-auto">
                            {searchQuery ? `We couldn't find any file matching "${searchQuery}"` : 'Upload your subtitle files or paste text to get started with localized translation.'}
                        </p>
                        {!searchQuery && (
                            <button 
                                onClick={onAddFiles}
                                className="mt-8 px-8 py-3 bg-[#1F6FEB] hover:bg-[#388BFD] text-white rounded-xl font-bold transition-all"
                            >
                                Get Started
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {filteredFiles.map((file, idx) => {
                            const originalIdx = files.findIndex(f => f === file);
                            const isModified = file.isModified || false;
                            const lineCount = file.mainDialogues.length;
                            
                            return (
                                <div 
                                    key={idx} 
                                    onClick={() => handleSelectWithLongPressPrevention(originalIdx)}
                                    onMouseDown={() => startLongPress(originalIdx)}
                                    onMouseUp={endLongPress}
                                    onMouseLeave={endLongPress}
                                    onTouchStart={() => startLongPress(originalIdx)}
                                    onTouchEnd={endLongPress}
                                    className="group bg-[#0D1117] border border-[#30363D] hover:border-[#58A6FF] rounded-xl p-3 sm:p-4 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] select-none"
                                    title="Long press for menu"
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#010409] border border-[#30363D] group-hover:border-[#58A6FF]/30 flex items-center justify-center text-[#8B949E] group-hover:text-[#58A6FF] shrink-0 font-black text-xs sm:text-sm transition-all shadow-inner">
                                            {file.episodeNum && file.episodeNum !== "NA" ? file.episodeNum : <FileText size={20} />}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-sm text-[#E6EDF3] group-hover:text-white truncate pr-2 transition-colors">
                                                {file.originalFileName}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-[#8B949E] font-mono flex items-center gap-1">
                                                    <FileText size={10} /> {lineCount} lines
                                                </span>
                                                <span className="w-1 h-1 rounded-full bg-[#30363D]"></span>
                                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${isModified ? 'text-[#238636] bg-[#238636]/10' : 'text-[#8B949E] bg-[#30363D]/40'}`}>
                                                    {isModified ? 'Ready' : 'Draft'}
                                                </div>
                                                {file.isDownloaded && (
                                                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter text-[#3fb950] bg-[#3fb950]/10 border border-[#3fb950]/20 ml-1" title="Downloaded">
                                                        <CheckCircle2 size={10} />
                                                        <span>Downloaded</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 sm:gap-4 shrink-0 px-1">
                                        <div className="hidden sm:flex items-center gap-1">
                                            <button 
                                                onClick={(e) => handleRenameClick(e, originalIdx, file.originalFileName)}
                                                className="p-2 text-[#8B949E] hover:text-white hover:bg-[#30363D] rounded-lg transition-all"
                                                title="Rename"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onStarFile(originalIdx); }}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/20 hover:bg-[#58A6FF] hover:text-white rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all"
                                                title="Prepare Translation"
                                            >
                                                <Languages size={14} />
                                                <span className="hidden xs:inline">Prepare</span>
                                            </button>
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    onDownloadFile(originalIdx);
                                                }}
                                                className="w-8 h-8 flex items-center justify-center text-[#8B949E] hover:bg-[#238636]/10 hover:text-[#238636] rounded-lg transition-all bg-[#010409] border border-[#30363D]"
                                                title="Download Subtitle"
                                            >
                                                <Upload size={14} className="rotate-180" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Menu Modal (Long Press) */}
            {menuIndex !== null && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setMenuIndex(null)}>
                    <div className="w-full max-w-sm bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl p-4 overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-2">
                            <button 
                                onClick={() => { onDeleteFile(menuIndex); setMenuIndex(null); }}
                                className="w-full flex items-center gap-3 px-4 py-4 hover:bg-red-500/10 text-red-500 font-bold rounded-xl transition-all"
                            >
                                <Trash2 size={20} />
                                <div className="flex flex-col items-start">
                                    <span className="text-sm">Delete Subtitle</span>
                                    <span className="text-[10px] text-red-500/60 font-normal">Permanently remove this file</span>
                                </div>
                            </button>

                            <button 
                                onClick={() => setMenuIndex(null)}
                                className="mt-2 w-full py-3 bg-[#161B22] hover:bg-[#30363D] text-[#E6EDF3] font-bold rounded-xl border border-[#30363D] transition-all text-xs uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {renamingIndex !== null && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-[#58A6FF]">
                            <Edit2 size={20} />
                            <h3 className="text-lg font-bold text-white">Rename Subtitle</h3>
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-[#8B949E] font-bold uppercase tracking-wider">New Filename</label>
                            <input 
                                autoFocus
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                                className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#58A6FF] rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
                                placeholder="Enter new name..."
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setRenamingIndex(null)}
                                className="flex-1 py-3 bg-[#161B22] hover:bg-[#30363D] text-[#E6EDF3] font-bold rounded-xl border border-[#30363D] transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmRename}
                                className="flex-1 py-3 bg-[#58A6FF] hover:bg-[#4493f8] text-white font-bold rounded-xl shadow-lg shadow-[#58A6FF]/20 transition-all"
                            >
                                Rename
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectDashboard;
