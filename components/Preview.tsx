import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { SubtitleData, User, ExportRecord } from '../types';
import { 
  Play, Pause, Undo2, Redo2, 
  SkipBack, SkipForward, RefreshCw,
  Type, Home, Trash2, Pencil, Download, FileVideo,
  Bold, Italic, Copy, X, Check,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus, Plus, Trash, RotateCcw, Search, MoreVertical, Languages, Monitor,
  ChevronDown, Upload, Palette,
  PaintBucket, Sparkles, FileText, Loader2, Globe, AlertTriangle, Clock, Maximize, Minimize
} from 'lucide-react';
import { rebuildSubtitleContent } from '../services/parser';
import { translateSubtitlesBatch, TranslationStats } from '../services/geminiService';
import TranslateModal from './TranslateModal';

interface PreviewProps {
  data: SubtitleData;
  projectFiles?: SubtitleData[];
  onSwitchFile?: (index: number) => void;
  onBack: () => void;
  onOpenTextEditor: () => void;
  onUpdate: (newData: SubtitleData) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  videoSrc: string | null;
  setVideoSrc: (src: string | null) => void;
  user: User | null;
  onUsageIncrement: () => void;
}

interface ParsedStyle {
    name: string;
    fontName: string;
    fontSize: number;
    primaryColor: string;
    secondaryColor: string;
    outlineColor: string;
    backColor: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikeOut: boolean;
    scaleX: number;
    scaleY: number;
    spacing: number;
    angle: number;
    borderStyle: number;
    outline: number;
    shadow: number;
    alignment: number;
    marginL: number;
    marginR: number;
    marginV: number;
    encoding: number;
}

const DEFAULT_FONTS = [
  { name: 'Helvetica Rounded', family: "'HelveticaRoundedLTStd-BdCn', sans-serif" },
  { name: 'Boogaloo', family: "'Boogaloo', cursive" },
  { name: 'Roboto Condensed', family: "'Roboto Condensed', sans-serif" },
  { name: 'Playfair Display SC', family: "'Playfair Display SC', serif" },
  { name: 'Creepster', family: "'Creepster', system-ui" },
  { name: 'Titan One', family: "'Titan One', sans-serif" },
  { name: 'Teko', family: "'Teko', sans-serif" },
  { name: 'Fjalla One', family: "'Fjalla One', sans-serif" },
  { name: 'Bebas Neue', family: "'Bebas Neue', sans-serif" },
  { name: 'Protest Revolution', family: "'Protest Revolution', sans-serif" },
  { name: 'Kolker Brush', family: "'Kolker Brush', cursive" },
  { name: 'Nanum Brush Script', family: "'Nanum Brush Script', cursive" },
  { name: 'Caveat Brush', family: "'Caveat Brush', cursive" },
];

const PLAN_LIMITS: Record<string, number> = {
    'FREE': 0,
    'MEMBER': 9999
};

// Helper to prevent Circular JSON errors
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

const parseAssTime = (t: string) => { 
    if(!t) return 0;
    const p = t.trim().split(':'); 
    return p.length===3 ? (parseInt(p[0])*3600)+(parseInt(p[1])*60)+parseFloat(p[2]) : 0; 
};

interface TextEditModalProps {
    isOpen: boolean;
    initialText: string;
    onSave: (newText: string) => void;
    onClose: () => void;
}

const TextEditModal: React.FC<TextEditModalProps> = ({ isOpen, initialText, onSave, onClose }) => {
    const [text, setText] = useState(initialText);
    
    useEffect(() => {
        setText(initialText);
    }, [initialText, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-[#30363D] bg-[#161B22]">
                    <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <Pencil size={16} className="text-[#58A6FF]" />
                        Edit Subtitle Text
                    </h3>
                    <button onClick={onClose} className="text-[#8B949E] hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-4">
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full h-32 bg-[#010409] border border-[#30363D] rounded-xl p-3 text-white text-sm focus:border-[#58A6FF] focus:ring-1 focus:ring-[#58A6FF] outline-none resize-none"
                        placeholder="Enter subtitle text..."
                        autoFocus
                    />
                </div>
                <div className="flex items-center justify-end gap-3 p-4 border-t border-[#30363D] bg-[#161B22]">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-[#8B949E] hover:text-white transition-colors">Cancel</button>
                    <button onClick={() => onSave(text)} className="px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-bold rounded-lg shadow-lg flex items-center gap-2 transition-colors">
                        <Check size={16} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper to convert seconds back to ASS time format (H:MM:SS.cc)
const secondsToAssTime = (s: number) => {
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = Math.floor(s % 60);
    const centiseconds = Math.floor((s % 1) * 100);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
};

const formatSrtTime = (s: number) => { 
    const ms = Math.floor((s % 1) * 1000); 
    const d = new Date(s * 1000); 
    const h = Math.floor(s / 3600);
    const m = d.getUTCMinutes().toString().padStart(2, '0'); 
    const sc = d.getUTCSeconds().toString().padStart(2, '0'); 
    return `${h.toString().padStart(2, '0')}:${m}:${sc},${ms.toString().padStart(3, '0')}`; 
};

const formatCurrentTime = (s: number) => { 
    if (isNaN(s)) return "00:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = Math.floor(s % 60);
    
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`; 
};

const assColorToCss = (ass: string, overrideAlpha?: number) => {
    const clean = ass.replace(/&H|&/g, '');
    let a = 255, b = 0, g = 0, r = 0;
    if (clean.length === 8) {
        const alphaHex = clean.substring(0, 2);
        a = 255 - parseInt(alphaHex, 16);
        b = parseInt(clean.substring(2, 4), 16);
        g = parseInt(clean.substring(4, 6), 16);
        r = parseInt(clean.substring(6, 8), 16);
    } else if (clean.length === 6) {
        b = parseInt(clean.substring(0, 2), 16);
        g = parseInt(clean.substring(2, 4), 16);
        r = parseInt(clean.substring(4, 6), 16);
    } else { return 'rgba(255, 255, 255, 1)'; }

    const finalAlpha = overrideAlpha !== undefined ? overrideAlpha : (a / 255);
    return `rgba(${r}, ${g}, ${b}, ${finalAlpha.toFixed(2)})`;
};

const hexToAss = (hex: string) => {
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    return `&H${b}${g}${r}&`;
};

const assToHex = (ass: string) => {
    let clean = ass.replace(/&H|&/g, '');
    if(clean.length === 8) clean = clean.substring(2);
    if(clean.length === 6) {
        const b = clean.substring(0, 2);
        const g = clean.substring(2, 4);
        const r = clean.substring(4, 6);
        return `#${r}${g}${b}`;
    }
    return '#FFFFFF';
};

const parseStylesFromData = (styleBlock: string): Record<string, ParsedStyle> => {
    const map: Record<string, ParsedStyle> = {};
    const lines = styleBlock.split(/\r\n|\n/);
    let indices: Record<string, number> = { name: 0, fontname: 1, fontsize: 2, primarycolour: 3, secondarycolour: 4, outlinecolour: 5, backcolour: 6, bold: 7, italic: 8, underline: 9, strikeout: 10, scalex: 11, scaley: 12, spacing: 13, angle: 14, borderstyle: 15, outline: 16, shadow: 17, alignment: 18, marginl: 19, marginr: 20, marginv: 21, encoding: 22 };

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Format:')) {
            const formatParts = trimmed.substring(7).split(',').map(s => s.trim().toLowerCase());
            const newIndices: any = {};
            formatParts.forEach((part, idx) => { newIndices[part] = idx; });
            indices = newIndices;
        } 
        else if (trimmed.startsWith('Style:')) {
            const content = trimmed.substring(6).trim();
            const parts = content.split(',').map(s => s.trim());
            if (parts.length < 10) continue;
            const name = parts[indices['name']];
            map[name] = {
                name: name,
                fontName: parts[indices['fontname']] || 'Arial',
                fontSize: parseInt(parts[indices['fontsize']]) || 20,
                primaryColor: assColorToCss(parts[indices['primarycolour']] || '&H00FFFFFF'),
                secondaryColor: assColorToCss(parts[indices['secondarycolour']] || '&H000000FF'),
                outlineColor: assColorToCss(parts[indices['outlinecolour']] || '&H00000000'),
                backColor: assColorToCss(parts[indices['backcolour']] || '&H00000000'),
                bold: parts[indices['bold']] === '-1' || parts[indices['bold']] === '1',
                italic: parts[indices['italic']] === '-1' || parts[indices['italic']] === '1',
                underline: parts[indices['underline']] === '-1' || parts[indices['underline']] === '1',
                strikeOut: parts[indices['strikeout']] === '-1' || parts[indices['strikeout']] === '1',
                scaleX: parseFloat(parts[indices['scalex']]) || 100,
                scaleY: parseFloat(parts[indices['scaley']]) || 100,
                spacing: parseFloat(parts[indices['spacing']]) || 0,
                angle: parseFloat(parts[indices['angle']]) || 0,
                borderStyle: parseInt(parts[indices['borderstyle']]) || 1,
                outline: parseFloat(parts[indices['outline']]) || 0,
                shadow: parseFloat(parts[indices['shadow']]) || 0,
                alignment: parseInt(parts[indices['alignment']]) || 2,
                marginL: parseInt(parts[indices['marginl']]) || 10,
                marginR: parseInt(parts[indices['marginr']]) || 10,
                marginV: parseInt(parts[indices['marginv']]) || 10,
                encoding: parseInt(parts[indices['encoding']]) || 1
            };
        }
    }
    if (!map['Default']) {
        map['Default'] = {
            name: 'Default', fontName: 'Boogaloo', fontSize: 78, 
            primaryColor: 'rgba(255,255,255,1)', secondaryColor: 'rgba(0,0,255,1)', 
            outlineColor: 'rgba(0,0,0,1)', backColor: 'rgba(0,0,0,0.37)',
            bold: true, italic: false, underline: false, strikeOut: false,
            scaleX: 100, scaleY: 100, spacing: 0, angle: 0, borderStyle: 1,
            outline: 3, shadow: 2, alignment: 2, marginL: 200, marginR: 200, marginV: 65, encoding: 1
        };
    }
    return map;
};

const getMappedFontFamily = (fontName: string) => {
    const lowerFont = fontName.toLowerCase();
    if (lowerFont.includes('helveticarounded') || lowerFont.includes('helvetica rounded')) {
        return "'HelveticaRoundedLTStd-BdCn', sans-serif";
    }
    if (lowerFont.includes('playfair display sc')) return "'Playfair Display SC', serif";
    if (lowerFont.includes('creepster')) return "'Creepster', system-ui";
    if (lowerFont.includes('titan one')) return "'Titan One', sans-serif";
    if (lowerFont.includes('teko')) return "'Teko', sans-serif";
    if (lowerFont.includes('fjalla one')) return "'Fjalla One', sans-serif";
    if (lowerFont.includes('bebas neue')) return "'Bebas Neue', sans-serif";
    if (lowerFont.includes('protest revolution')) return "'Protest Revolution', sans-serif";
    if (lowerFont.includes('kolker brush')) return "'Kolker Brush', cursive";
    if (lowerFont.includes('nanum brush script')) return "'Nanum Brush Script', cursive";
    if (lowerFont.includes('caveat brush')) return "'Caveat Brush', cursive";
    if (lowerFont.includes('roboto condensed')) return "'Roboto Condensed', sans-serif";
    return "'Boogaloo', cursive";
};

/**
 * Renders subtitle text with support for inline ASS tags like colors, transparency, bold, italic.
 */
const renderRichSubtitleText = (text: string, style: ParsedStyle, scaleFactor: number) => {
    const segments: React.ReactNode[] = [];
    
    // Split by tags {...} and preserve them
    const parts = text.split(/({[^}]+})/);
    
    let curColor = style.primaryColor;
    let curOColor = style.outlineColor;
    let curSColor = style.backColor;
    let curFontSize = style.fontSize * scaleFactor;
    let curFontName = getMappedFontFamily(style.fontName);
    let curBold = style.bold;
    let curItalic = style.italic;
    let curUnderline = style.underline;
    let curStrikeOut = style.strikeOut;
    let curBord = style.outline * scaleFactor;
    let curShad = style.shadow * scaleFactor;
    let curBlur = 0;
    let curAlpha: number | undefined = undefined; // 1.0 = opaque, 0.0 = transparent

    parts.forEach((part, idx) => {
        if (part.startsWith('{') && part.endsWith('}')) {
            const tags = part.slice(1, -1);
            
            // Alpha global \alpha&H...&
            const aMatch = tags.match(/\\alpha&H([0-9A-Fa-f]{2})&?/);
            if (aMatch) {
                const val = parseInt(aMatch[1], 16);
                curAlpha = 1 - (val / 255);
            }

            // Colors
            const cMatch = tags.match(/\\(c|1c)(&H[0-9A-Fa-f]+&?)/);
            if (cMatch) curColor = assColorToCss(cMatch[2], curAlpha);
            
            const oMatch = tags.match(/\\3c(&H[0-9A-Fa-f]+&?)/);
            if (oMatch) curOColor = assColorToCss(oMatch[1], curAlpha);
            
            const sMatch = tags.match(/\\4c(&H[0-9A-Fa-f]+&?)/);
            if (sMatch) curSColor = assColorToCss(sMatch[1], curAlpha);
            
            // Font size & Font name
            const fsMatch = tags.match(/\\fs([\d.]+)/);
            if (fsMatch) curFontSize = parseFloat(fsMatch[1]) * scaleFactor;
            
            const fnMatch = tags.match(/\\fn([^\\}]+)/);
            if (fnMatch) curFontName = getMappedFontFamily(fnMatch[1].trim());

            // Outline, Shadow, Blur
            const bordMatch = tags.match(/\\bord([\d.]+)/);
            if (bordMatch) curBord = parseFloat(bordMatch[1]) * scaleFactor;
            
            const shadMatch = tags.match(/\\shad([\d.]+)/);
            if (shadMatch) curShad = parseFloat(shadMatch[1]) * scaleFactor;
            
            const blurMatch = tags.match(/\\blur([\d.]+)/) || tags.match(/\\be([\d.]+)/);
            if (blurMatch) curBlur = parseFloat(blurMatch[1]) * scaleFactor;

            // Styles
            if (tags.includes('\\b1')) curBold = true;
            if (tags.includes('\\b0')) curBold = false;
            if (tags.includes('\\i1')) curItalic = true;
            if (tags.includes('\\i0')) curItalic = false;
            if (tags.includes('\\u1')) curUnderline = true;
            if (tags.includes('\\u0')) curUnderline = false;
            if (tags.includes('\\s1')) curStrikeOut = true;
            if (tags.includes('\\s0')) curStrikeOut = false;
            
        } else if (part) {
            // Apply text-shadow logic per segment
            const shadows: string[] = [];
            const b = curBlur > 0 ? `${curBlur}px ` : '0 ';
            if (curBord > 0) {
                const o = curBord;
                const c = curAlpha !== undefined ? curOColor.replace(/[\d.]+\)$/, `${curAlpha.toFixed(2)})`) : curOColor;
                shadows.push(`${o}px 0 ${b}${c}`, `-${o}px 0 ${b}${c}`, `0 ${o}px ${b}${c}`, `0 -${o}px ${b}${c}`);
                shadows.push(`${o}px ${o}px ${b}${c}`, `-${o}px ${o}px ${b}${c}`, `${o}px -${o}px ${b}${c}`, `-${o}px -${o}px ${b}${c}`);
            }
            if (curShad > 0) {
                const s = curShad;
                const c = curAlpha !== undefined ? curSColor.replace(/[\d.]+\)$/, `${curAlpha.toFixed(2)})`) : curSColor;
                shadows.push(`${s}px ${s}px ${b}${c}`);
            }
            const textShadow = shadows.join(', ') || 'none';

            let textDeco = 'none';
            if (curUnderline && curStrikeOut) textDeco = 'underline line-through';
            else if (curUnderline) textDeco = 'underline';
            else if (curStrikeOut) textDeco = 'line-through';

            // Make sure primary color gets alpha
            const finalColor = curAlpha !== undefined && curColor.startsWith('rgba') 
                ? curColor.replace(/[\d.]+\)$/, `${curAlpha.toFixed(2)})`) 
                : curColor;

            const lines = part.split(/\\N/gi);
            lines.forEach((line, lIdx) => {
                if (line) {
                    segments.push(
                        <span key={`${idx}-${lIdx}`} style={{
                            fontFamily: curFontName,
                            color: finalColor,
                            fontSize: `${curFontSize}px`,
                            fontWeight: curBold ? 700 : 400,
                            fontStyle: curItalic ? 'italic' : 'normal',
                            textDecoration: textDeco,
                            textShadow: textShadow,
                            transition: 'color 0.2s, font-size 0.2s'
                        }}>
                            {line}
                        </span>
                    );
                }
                if (lIdx < lines.length - 1) {
                    segments.push(<br key={`br-${idx}-${lIdx}`} />);
                }
            });
        }
    });
    
    return segments;
};

const generateCssFromStyle = (
    text: string, 
    styleName: string, 
    styleMap: Record<string, ParsedStyle>, 
    containerW: number, 
    containerH: number,
    refRes: { width: number, height: number }
): React.CSSProperties => {
    const style = styleMap[styleName] || styleMap['Default'];
    const posMatch = text.match(/\\pos\((-?[\d.]+)\s*,\s*(-?[\d.]+)\)/);
    const anMatch = text.match(/\\an(\d)/);
    const align = anMatch ? parseInt(anMatch[1]) : style.alignment;
    
    // Dynamic Resolution from Script Info
    const REF_H = refRes.height;
    const REF_W = refRes.width;

    const css: React.CSSProperties = {
        position: 'absolute', 
        lineHeight: 1.2, 
        whiteSpace: 'pre-wrap', 
        pointerEvents: 'none', 
        zIndex: 10, 
        boxSizing: 'border-box'
    };

    // Calculate scale factor relative to container size
    const scaleX = containerW / REF_W;
    const scaleY = containerH / REF_H;

    if (posMatch) {
        const x = parseFloat(posMatch[1]);
        const y = parseFloat(posMatch[2]);
        css.left = `${x * scaleX}px`;
        css.top = `${y * scaleY}px`;
        let tx = '-50%', ty = '-50%';
        if ([1, 4, 7].includes(align)) tx = '0%';
        if ([3, 6, 9].includes(align)) tx = '-100%';
        if ([7, 8, 9].includes(align)) ty = '0%';
        if ([1, 2, 3].includes(align)) ty = '-100%';
        css.transform = `translate(${tx}, ${ty})`;
        css.textAlign = [1, 4, 7].includes(align) ? 'left' : [3, 6, 9].includes(align) ? 'right' : 'center';
    } else {
        const ml = style.marginL * scaleX;
        const mr = style.marginR * scaleX;
        const mv = style.marginV * scaleY;
        css.left = `${ml}px`;
        css.width = `${containerW - ml - mr}px`;
        if ([7, 8, 9].includes(align)) { css.top = `${mv}px`; css.textAlign = [7].includes(align) ? 'left' : [9].includes(align) ? 'right' : 'center'; }
        else if ([4, 5, 6].includes(align)) { css.top = '50%'; css.transform = 'translateY(-50%)'; css.textAlign = [4].includes(align) ? 'left' : [6].includes(align) ? 'right' : 'center'; }
        else { css.bottom = `${mv}px`; css.textAlign = [1].includes(align) ? 'left' : [3].includes(align) ? 'right' : 'center'; }
    }
    return css;
};

interface PreviewTranslationStats {
    processed: number;
    total: number;
    batchCurrent: number;
    batchTotal: number;
    lastText: string;
    currentBatchLines: string[];
    startTime: number;
    progress: number;
}

const Preview: React.FC<PreviewProps> = ({ data, projectFiles, onSwitchFile, onBack, onOpenTextEditor, onUpdate, undo, redo, canUndo, canRedo, videoSrc, setVideoSrc, user, onUsageIncrement }) => {
  const previewData = useMemo(() => {
    const allEvents: any[] = [];
    data.mainDialogues.forEach((line, idx) => allEvents.push({ line, idx, source: 'main' as const }));
    data.signDialogues.forEach((line, idx) => allEvents.push({ line, idx, source: 'sign' as const }));
    return allEvents.map((item, flatIdx) => {
      const parts = item.line.split(','); 
      if (parts.length < 10) return null;
      const start = parseAssTime(parts[1]); 
      const end = parseAssTime(parts[2]);
      const style = parts[3].trim(); 
      const textRaw = parts.slice(9).join(','); 
      return { id: flatIdx, source: item.source, originalIndex: item.idx, start, end, style, rawText: textRaw, fullLine: item.line };
    }).filter((e): e is NonNullable<typeof e> => e !== null).sort((a, b) => a.start - b.start);
  }, [data]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranslateModalOpen, setIsTranslateModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssRotated, setIsCssRotated] = useState(false);
  const [showFsControls, setShowFsControls] = useState(false);
  const [isDraggingFs, setIsDraggingFs] = useState(false);
  
  // TRANSLATION STATE
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationStats, setTranslationStats] = useState<PreviewTranslationStats>({
      processed: 0,
      total: 0,
      batchCurrent: 0,
      batchTotal: 0,
      lastText: '',
      currentBatchLines: [],
      startTime: 0,
      progress: 0
  });
  const [translationError, setTranslationError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const [customFonts, setCustomFonts] = useState<{name: string, family: string}[]>([]);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const fontFileRef = useRef<HTMLInputElement>(null);
  const [showTranslateOptions, setShowTranslateOptions] = useState(false);
  const translateButtonRef = useRef<HTMLDivElement>(null);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  const findCount = useMemo(() => {
    if (!findText.trim()) return 0;
    let count = 0;
    const search = findText.toLowerCase();
    previewData.forEach(evt => {
        const clean = evt.rawText.replace(/{[^}]+}/g, '').toLowerCase();
        if (clean.includes(search)) {
            // Count all matches in one line
            const searchEscaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = clean.match(new RegExp(searchEscaped, 'g'));
            if (matches) count += matches.length;
        }
    });
    return count;
  }, [findText, previewData]);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempText, setTempText] = useState('');
  const [textEditModalData, setTextEditModalData] = useState<{ id: number, text: string } | null>(null);
  const [posStep, setPosStep] = useState(10);
  
  // PREVIEW SIZE STATE
  const [previewResolution, setPreviewResolution] = useState<{width: number, height: number}>({ width: 1920, height: 1080 });
  
  // TIME ADJUSTER STATE
  const [activeTimeAdjust, setActiveTimeAdjust] = useState<{ id: number, type: 'start' | 'end' } | null>(null);

  // VIDEO RESOLUTION STATE
  const [videoResolution, setVideoResolution] = useState<{width: number, height: number} | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | void>();
  const activeRowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{x: number, y: number, time: number} | null>(null);

  const parsedStyles = useMemo(() => parseStylesFromData(data.styles), [data.styles]);
  const allFonts = useMemo(() => [...DEFAULT_FONTS, ...customFonts], [customFonts]);

  const displayFileName = useMemo(() => {
      let name = data.originalFileName || "Subtitle File";
      let baseName = name.replace(/\.(ass|srt|vtt|txt)$/i, '');
      // Match series name (group 1) followed by optional hyphen/space and episode number (group 2)
      const match = baseName.match(/^(.*?)[\s-]*0*(\d+)\s*$/);
      if (match) {
          // Remove potential trailing hyphen or space from the captured series name
          return match[1].replace(/[\s-]+$/, '').trim();
      }
      return baseName.trim();
  }, [data.originalFileName]);

  const episodeNumber = useMemo(() => {
      const name = data.originalFileName || "";
      let baseName = name.replace(/\.(ass|srt|vtt|txt)$/i, '');
      // Consistent regex with displayFileName
      const match = baseName.match(/^(.*?)[\s-]*0*(\d+)\s*$/);
      if (match) {
          return `Episode ${match[2]}`;
      }
      return null;
  }, [data.originalFileName]);

  const relatedEpisodes = useMemo(() => {
      if (!projectFiles) return [];
      
      const related = projectFiles.map((file, index) => {
          let name = file.originalFileName || "Subtitle File";
          let baseName = name.replace(/\.(ass|srt|vtt|txt)$/i, '');
          // Consistent regex with displayFileName
          const match = baseName.match(/^(.*?)[\s-]*0*(\d+)\s*$/);
          
          let cleanName = baseName.trim();
          let epStr = null;
          let num = 0;
          
          if (match) {
              // Same cleaning logic as displayFileName
              cleanName = match[1].replace(/[\s-]+$/, '').trim();
              num = parseInt(match[2], 10);
              epStr = `Episode ${match[2]}`;
          }

          const displayString = epStr || name;
          return {
              index,
              cleanName,
              displayString,
              epNum: num
          };
      }).filter(f => f.cleanName === displayFileName);

      // Sort by episode number
      return related.sort((a,b) => a.epNum - b.epNum);
  }, [projectFiles, displayFileName]);

  const [isEpisodeMenuOpen, setIsEpisodeMenuOpen] = useState(false);

  // Extract PlayRes from script info
  const scriptResolution = useMemo(() => {
      const info = data.scriptInfo || "";
      const xMatch = info.match(/PlayResX:\s*(\d+)/i);
      const yMatch = info.match(/PlayResY:\s*(\d+)/i);
      return {
          width: xMatch ? parseInt(xMatch[1]) : 1920,
          height: yMatch ? parseInt(yMatch[1]) : 1080
      };
  }, [data.scriptInfo]);

  // Reset video resolution when videoSrc changes
  useEffect(() => {
      if (!videoSrc) {
          setVideoResolution(null);
          setIsPlaying(false);
          setCurrentTime(0);
      }
  }, [videoSrc]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (translateButtonRef.current && !translateButtonRef.current.contains(event.target as Node)) {
            setShowTranslateOptions(false);
        }
        // Close time adjuster if clicked outside
        const target = event.target as HTMLElement;
        if (!target.closest('.time-adjust-popover') && !target.closest('.time-adjust-trigger')) {
            setActiveTimeAdjust(null);
        }
        if (!target.closest('.episode-menu-container')) {
            setIsEpisodeMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const fsControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showControls = useCallback(() => {
      setShowFsControls(true);
      if (fsControlsTimeoutRef.current) clearTimeout(fsControlsTimeoutRef.current);
      fsControlsTimeoutRef.current = setTimeout(() => {
          setShowFsControls(false);
      }, 2500);
  }, []);

  useEffect(() => {
      if (isFullscreen) showControls();
  }, [isFullscreen, showControls]);

  useEffect(() => {
      const handleFullscreenChange = () => {
          const isFS = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
          setIsFullscreen(isFS);
          if (!isFS) {
              setIsCssRotated(false);
              if (window.screen && window.screen.orientation && (window.screen.orientation as any).unlock) {
                  try { (window.screen.orientation as any).unlock(); } catch(e){}
              }
          }
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      return () => {
          document.removeEventListener('fullscreenchange', handleFullscreenChange);
          document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      };
  }, []);

  const virtualDuration = useMemo(() => {
      if (previewData.length === 0) return 60; // Default 1 min if no subtitles
      return previewData[previewData.length - 1].end + 5; // Last subtitle + 5s buffer
  }, [previewData]);

  const jumpSubtitle = (direction: 'prev' | 'next') => {
    if (previewData.length === 0) return;
    if (direction === 'next') {
      const next = previewData.find(s => s.start > currentTime + 0.05);
      if (next) seekTo(next.start);
    } else {
      const prev = [...previewData].reverse().find(s => s.start < currentTime - 0.5);
      if (prev) seekTo(prev.start);
    }
  };

  const safePlay = () => {
      if (videoSrc && videoRef.current) {
          playPromiseRef.current = videoRef.current.play();
          if (playPromiseRef.current !== undefined) {
              playPromiseRef.current.catch(err => {
                  if (err.name !== 'AbortError') console.error("Play error:", err);
              });
          }
      }
      setIsPlaying(true);
  };

  const safePause = () => {
      if (videoSrc && videoRef.current) {
          if (playPromiseRef.current !== undefined) {
              playPromiseRef.current.then(() => {
                  videoRef.current?.pause();
              }).catch(() => {});
              playPromiseRef.current = undefined;
          } else {
              videoRef.current.pause();
          }
      }
      setIsPlaying(false);
  };

  const togglePlay = () => { 
    if (videoSrc && videoRef.current) { 
        if (videoRef.current.paused) { 
            safePlay(); 
        } else { 
            safePause(); 
        } 
    } else {
        setIsPlaying(prev => !prev);
    }
  };
  
  const seekTo = (time: number) => { 
      const newTime = Math.max(0, Math.min(time, duration || virtualDuration));
      setCurrentTime(newTime); 
      if (videoSrc && videoRef.current) { 
          videoRef.current.currentTime = newTime; 
      } 
  };

  const handleVideoClick = () => { 
      if (dragStartRef.current && (dragStartRef.current as any).moved) { 
          dragStartRef.current = null; 
          return; 
      } 
      if (isFullscreen) {
          if (showFsControls) {
              setShowFsControls(false);
              if (fsControlsTimeoutRef.current) clearTimeout(fsControlsTimeoutRef.current);
          } else {
              showControls();
          }
      } else {
          togglePlay(); 
      }
  };
  
  const toggleFullscreen = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const targetElement = fullscreenWrapperRef.current;
      if (!targetElement) return;
      
      const isFS = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      
      if (!isFS) {
          try {
              if (targetElement.requestFullscreen) {
                  await targetElement.requestFullscreen();
              } else if ((targetElement as any).webkitRequestFullscreen) {
                  await (targetElement as any).webkitRequestFullscreen();
              }
              
              const doCssRotate = () => {
                 if (window.innerHeight > window.innerWidth) {
                     setIsCssRotated(true);
                 }
              };

              if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
                  try {
                      await (window.screen.orientation as any).lock('landscape');
                  } catch (e) {
                      doCssRotate();
                  }
              } else {
                  doCssRotate();
              }
          } catch (err) {
              console.error("Error attempting to enable fullscreen:", err);
          }
      } else {
          if (document.exitFullscreen) {
              await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
              await (document as any).webkitExitFullscreen();
          }
      }
  };

  const handlePointerDown = (e: React.PointerEvent) => { dragStartRef.current = { x: e.clientX, y: e.clientY, time: currentTime, moved: false } as any; };
  const handlePointerMove = (e: React.PointerEvent) => { 
      if (!dragStartRef.current || !containerRef.current) return; 
      
      let deltaX = e.clientX - dragStartRef.current.x; 
      let width = containerRef.current.clientWidth; 
      
      if (isFullscreen && isCssRotated) {
          deltaX = e.clientY - dragStartRef.current.y;
          width = containerRef.current.clientHeight;
      }
      
      if (Math.abs(deltaX) > 5) {
          (dragStartRef.current as any).moved = true;
          if (isFullscreen) {
              setIsDraggingFs(true);
              setShowFsControls(false); // hide play/pause while dragging
          }
      }
      
      const seekDelta = (deltaX / width) * 60; 
      const maxTime = duration || virtualDuration;
      const newTime = Math.max(0, Math.min(maxTime, dragStartRef.current.time + seekDelta)); 
      if (videoSrc && videoRef.current) videoRef.current.currentTime = newTime; 
      setCurrentTime(newTime); 
  };
  const handlePointerUp = () => { 
      if (isDraggingFs) setIsDraggingFs(false);
      setTimeout(() => { dragStartRef.current = null; }, 50); 
  };

  // --- PLAYBACK LOOP ---
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = () => { 
        const now = performance.now();
        const delta = (now - lastTime) / 1000; // seconds
        lastTime = now;

        if (videoSrc && videoRef.current) { 
            // Video Mode
            if (!videoRef.current.paused) {
                setCurrentTime(videoRef.current.currentTime);
                // Also sync isPlaying if video pauses itself (buffering/end)
                if(!isPlaying) setIsPlaying(true);
            } else if (isPlaying) {
                // If state says playing but video paused, sync state
                setIsPlaying(false);
            }
            if (videoRef.current.duration) setDuration(videoRef.current.duration); 
        } else {
            // Virtual Mode (Black Screen)
            setDuration(virtualDuration);
            if (isPlaying) {
                setCurrentTime(prev => {
                    const next = prev + delta;
                    if (next >= virtualDuration) {
                        setIsPlaying(false);
                        return virtualDuration;
                    }
                    return next;
                });
            }
        }
        animId = requestAnimationFrame(loop); 
    };
    
    animId = requestAnimationFrame(loop); 
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, videoSrc, virtualDuration]);

  useEffect(() => { if (activeRowRef.current && !editingId) { activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, [currentTime, editingId]);
  const activeSubtitles = useMemo(() => { return previewData.filter(evt => currentTime >= evt.start && currentTime < evt.end); }, [previewData, currentTime]);
  const handleEditStart = (id: number, currentText: string, start: number) => { setEditingId(id); setTempText(currentText); seekTo(start); safePause(); };
  const handleEditSave = (id: number) => { const item = previewData.find(p => p.id === id); if (!item) return; updateLine(item, tempText); setEditingId(null); };
  
  const handleTextEditStart = (id: number, currentText: string, start: number) => {
      setTextEditModalData({ id, text: currentText });
      seekTo(start);
      safePause();
  };

  const handleTextEditSave = (newText: string) => {
      if (!textEditModalData) return;
      const item = previewData.find(p => p.id === textEditModalData.id);
      if (item) {
          updateLine(item, newText);
      }
      setTextEditModalData(null);
  };

  const updateLine = (item: any, newText: string) => { const parts = item.fullLine.split(','); const meta = parts.slice(0, 9).join(','); const newLine = `${meta},${newText}`; const newData = { ...data }; if (item.source === 'main') { newData.mainDialogues = [...newData.mainDialogues]; newData.mainDialogues[item.originalIndex] = newLine; } else { newData.signDialogues = [...newData.signDialogues]; newData.signDialogues[item.originalIndex] = newLine; } onUpdate(newData); };
  
  const updateTime = (item: any, newStart: number, newEnd: number) => {
        const s = Math.max(0, newStart);
        const e = Math.max(s, newEnd);
        
        const parts = item.fullLine.split(',');
        parts[1] = secondsToAssTime(s);
        parts[2] = secondsToAssTime(e);
        const newLine = parts.join(',');
        
        const newData = { ...data };
        if (item.source === 'main') {
            newData.mainDialogues = [...newData.mainDialogues];
            newData.mainDialogues[item.originalIndex] = newLine;
        } else {
            newData.signDialogues = [...newData.signDialogues];
            newData.signDialogues[item.originalIndex] = newLine;
        }
        onUpdate(newData);
  };

  const handleDelete = (id: number) => { 
      const itemIndex = previewData.findIndex(p => p.id === id);
      const item = previewData[itemIndex];
      
      if (!item) return; 
      
      const newData = { 
          ...data,
          mainDialogues: [...data.mainDialogues],
          signDialogues: [...data.signDialogues]
      }; 

      if (item.source === 'main') { 
          newData.mainDialogues.splice(item.originalIndex, 1);
      } else { 
          newData.signDialogues.splice(item.originalIndex, 1);
      } 
      
      onUpdate(newData); 
      if (editingId === id) setEditingId(null); 

      // Seek to Previous Item logic to maintain scroll context
      if (itemIndex > 0) {
          const prevItem = previewData[itemIndex - 1];
          // Seek slightly after start to ensure it is active
          seekTo(prevItem.start + 0.05);
      }
  };

  const toggleTag = (tagRegex: RegExp, enableTag: string) => { if (tagRegex.test(tempText)) setTempText(tempText.replace(tagRegex, '')); else setTempText(enableTag + tempText); };
  const changeFontSize = (delta: number) => { const fsMatch = tempText.match(/\\fs(\d+)/); let currentSize = fsMatch ? parseInt(fsMatch[1]) : 70; let newSize = Math.max(10, currentSize + delta); if (fsMatch) setTempText(tempText.replace(/\\fs\d+/, `\\fs${newSize}`)); else setTempText(`{\\fs${newSize}}${tempText}`); };
  const setAlignment = (an: number) => { const clean = tempText.replace(/\\an\d/g, ''); if (clean.startsWith('{')) setTempText(clean.replace('{', `{\\an${an}`)); else setTempText(`{\\an${an}}${clean}`); };
  const movePosition = (dx: number, dy: number) => { 
      // Update logic to account for PlayRes coordinates if necessary, but manual steps are usually pixels relative to whatever the current resolution is.
      // Assuming dx/dy are raw values added to \pos(x,y).
      const posMatch = tempText.match(/\\pos\((-?[\d.]+)\s*,\s*(-?[\d.]+)\)/); 
      let x = scriptResolution.width / 2; // Default to center
      let y = scriptResolution.height / 2; 
      
      if (posMatch) { x = parseFloat(posMatch[1]); y = parseFloat(posMatch[2]); } 
      const newX = Math.round(x + dx); 
      const newY = Math.round(y + dy); 
      if (posMatch) setTempText(tempText.replace(/\\pos\([^)]+\)/, `\\pos(${newX},${newY})`)); 
      else if (tempText.startsWith('{')) setTempText(tempText.replace('{', `{\\pos(${newX},${newY})`)); 
      else setTempText(`{\\pos(${newX},${newY})}${tempText}`); 
  };
  const changeFont = (fontName: string) => { let newText = tempText; if (newText.match(/\\fn([^\\}]+)/)) { newText = newText.replace(/\\fn[^\\}]+/, `\\fn${fontName}`); } else { if (newText.startsWith('{')) { newText = newText.replace('{', `{\\fn${fontName}`); } else { newText = `{\\fn${fontName}}${newText}`; } } setTempText(newText); setShowFontDropdown(false); };
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>, isOutline: boolean) => { const hex = e.target.value; const assColor = hexToAss(hex); const tag = isOutline ? `\\3c${assColor}` : `\\c${assColor}`; const regex = isOutline ? /\\3c&H[0-9A-Fa-f]+&?/ : /\\c&H[0-9A-Fa-f]+&?/; if (regex.test(tempText)) { setTempText(tempText.replace(regex, tag)); } else { if (tempText.startsWith('{')) { setTempText(tempText.replace('{', `{${tag}`)); } else { setTempText(`{${tag}}${tempText}`); } } };
  const handleFontImport = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const result = event.target?.result as string; const fontName = file.name.replace(/\.[^/.]+$/, ""); const fontFace = new FontFace(fontName, `url(${result})`); fontFace.load().then((loadedFace) => { document.fonts.add(loadedFace); setCustomFonts(prev => [...prev, { name: fontName, family: fontName }]); changeFont(fontName); }).catch(err => { console.error("Font load failed:", err); alert("Failed to load font. Ensure it's a valid TTF/OTF/WOFF file."); }); }; reader.readAsDataURL(file); e.target.value = ''; };
  const handleFindReplace = () => { if (!findText) return; const regex = new RegExp(findText, 'gi'); const replaceInArray = (arr: string[]) => { return arr.map(line => { const parts = line.split(','); if (parts.length < 10) return line; const meta = parts.slice(0, 9).join(','); let text = parts.slice(9).join(','); if (text.match(regex)) text = text.replace(regex, replaceText); return `${meta},${text}`; }); }; const newData = { ...data }; newData.mainDialogues = replaceInArray(newData.mainDialogues); newData.signDialogues = replaceInArray(newData.signDialogues); onUpdate(newData); setReplaceText(''); setFindText(''); };

  // EXPORT HANDLER
  const handleExportClick = () => {
      // Export using the current filename (which can now be renamed in Dashboard)
      performExport(data.originalFileName);
  };

  const performExport = (filenameBase: string) => {
      const content = rebuildSubtitleContent(data);
      
      let filename = filenameBase.replace(/\.[^/.]+$/, "");
      if (!filename.toLowerCase().endsWith('.ass')) {
          filename += '.ass';
      }

      const blob = new Blob([content], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      
      // Update Usage Count & History
      onUsageIncrement();
      onUpdate({ ...data, isDownloaded: true });
      
      if (user) {
          const newRecord: ExportRecord = {
              id: Math.random().toString(36).substr(2, 9),
              filename: filename,
              date: new Date().toISOString(),
              content: content,
              type: 'text' // ADDED TYPE
          };
          
          const storedUsers = localStorage.getItem('subswap_all_users');
          if (storedUsers) {
              const allUsers: User[] = JSON.parse(storedUsers);
              const idx = allUsers.findIndex(u => u.username === user.username);
              if (idx !== -1) {
                  const currentUserData = allUsers[idx];
                  const currentHistory = currentUserData.exportHistory || [];
                  
                  // APPEND HISTORY WITH PRUNING (KEEP LAST 5)
                  const updatedHistory = [newRecord, ...currentHistory].slice(0, 5);
                  
                  // Update
                  currentUserData.exportHistory = updatedHistory;
                  allUsers[idx] = currentUserData;
                  localStorage.setItem('subswap_all_users', JSON.stringify(allUsers, getCircularReplacer()));
                  
                  // Update Session too
                  localStorage.setItem('subswap_user_session', JSON.stringify(currentUserData, getCircularReplacer()));
              }
          }
      }
  };

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFindReplaceModalOpen, setIsFindReplaceModalOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
        if (isMenuOpen && !(e.target as Element).closest('.preview-menu-container')) {
            setIsMenuOpen(false);
        }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [isMenuOpen]);

  const skip = (seconds: number) => { 
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration || virtualDuration));
      setCurrentTime(newTime);
      if(videoSrc && videoRef.current) videoRef.current.currentTime = newTime; 
  };
  const progressPercent = (duration || virtualDuration) > 0 ? (currentTime / (duration || virtualDuration)) * 100 : 0;
  const currentFontName = tempText.match(/\\fn([^\\}]+)/)?.[1] || 'Default';
  const currentColorMatch = tempText.match(/\\c(&H[0-9A-Fa-f]+&?)/);
  const currentOutlineMatch = tempText.match(/\\3c(&H[0-9A-Fa-f]+&?)/);
  const currentHexColor = currentColorMatch ? assToHex(currentColorMatch[1]) : '#FFFFFF';
  const currentHexOutline = currentOutlineMatch ? assToHex(currentOutlineMatch[1]) : '#000000';
  const displayData = useMemo(() => { const lowerSearch = findText.toLowerCase(); return previewData.filter(e => { if (!findText) return true; return e.rawText.toLowerCase().includes(lowerSearch); }); }, [previewData, findText]);
  
  // --- HANDLE ACTUAL AI TRANSLATION ---
  const handleStartTranslate = async (config: any) => {
      setIsTranslateModalOpen(false);
      setIsTranslating(true);
      setTranslationError(null);
      
      // Init Stats
      setTranslationStats({
        processed: 0,
        total: 0,
        batchCurrent: 0,
        batchTotal: 0,
        lastText: '',
        currentBatchLines: [],
        startTime: Date.now(),
        progress: 0
      });
      
      // Init Controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 1. Prepare Data: Extract Text from Main Dialogues (Ignoring metadata)
      const rawLines = data.mainDialogues.map(line => {
          const parts = line.split(',');
          return parts.length > 9 ? parts.slice(9).join(',') : '';
      });

      // 2. Call Service
      try {
          const translatedTexts = await translateSubtitlesBatch(
              rawLines, 
              config, 
              (stats) => {
                  setTranslationStats(prev => ({
                      ...prev,
                      processed: stats.processed,
                      total: stats.total,
                      batchCurrent: stats.batchIdx,
                      batchTotal: stats.totalBatches,
                      lastText: stats.lastText,
                      currentBatchLines: stats.currentBatchLines,
                      progress: stats.progress
                  }));
              },
              controller.signal
          );
          
          // 3. Reconstruct ASS Lines
          const newMainDialogues = data.mainDialogues.map((line, idx) => {
              const parts = line.split(',');
              if (parts.length > 9) {
                  const meta = parts.slice(0, 9).join(',');
                  const translatedText = translatedTexts[idx] || parts.slice(9).join(','); // Fallback
                  return `${meta},${translatedText}`;
              }
              return line;
          });

          // 4. Update State
          onUpdate({ ...data, mainDialogues: newMainDialogues });
          setIsTranslating(false); // Close ONLY on success
          alert("Translation Complete!");
      } catch (e: any) {
          if (e.name === 'AbortError') {
              setIsTranslating(false);
              // alert("Translation Cancelled"); // Optional
          } else {
              console.error(e);
              setTranslationError(e.message || "An unexpected error occurred during translation.");
              // Do NOT set setIsTranslating(false) here, so user can see error
          }
      } finally {
          abortControllerRef.current = null;
      }
  };

  const handleCancelTranslation = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
      setIsTranslating(false);
      setTranslationError(null);
  };

  const calculateEta = () => {
      if (translationStats.processed === 0) return "--:--";
      const elapsed = Date.now() - translationStats.startTime;
      const msPerLine = elapsed / translationStats.processed;
      const remainingLines = translationStats.total - translationStats.processed;
      const etaMs = remainingLines * msPerLine;
      
      if (etaMs < 0) return "00:00";
      
      const m = Math.floor(etaMs / 60000);
      const s = Math.floor((etaMs % 60000) / 1000);
      return `${m}m ${s}s`;
  };

  // Helper to calculate serial numbers based on batch
  const getSerialStart = () => {
      // If we processed X lines, and the current batch had Y lines, the start index is X - Y + 1
      const count = translationStats.currentBatchLines.length;
      return Math.max(1, translationStats.processed - count + 1);
  };

  return (
    <div className="flex flex-col h-full bg-[#050812] font-sans overflow-hidden text-[#C9D1D9]">
      {/* 1. HEADER */}
      <div className="h-14 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between px-4 shrink-0 z-40">
          <div className="flex items-center gap-2 max-w-[60%] flex-1">
              <button onClick={onBack} className="text-[#8B949E] hover:text-[#E6EDF3] p-1 transition-colors shrink-0"><Home size={20} /></button>
              <div className="h-4 w-[1px] bg-[#30363D] mx-1 shrink-0"></div>
              
              <div className="flex-1 min-w-0 overflow-hidden relative group">
                <div className="inline-block whitespace-nowrap animate-marquee group-hover:pause">
                  <h1 className="text-sm font-bold text-[#E6EDF3] px-2">
                    {displayFileName}
                  </h1>
                </div>
              </div>
          </div>

          <div className="flex items-center gap-2 relative preview-menu-container shrink-0">
               {episodeNumber && (
                   <div className="relative episode-menu-container">
                       <button
                           onClick={() => setIsEpisodeMenuOpen(!isEpisodeMenuOpen)}
                           className="flex items-center gap-1 text-xs font-bold font-mono text-[#58A6FF] bg-[#58A6FF]/10 hover:bg-[#58A6FF]/20 px-2 py-1 rounded-md border border-[#58A6FF]/20 transition-all cursor-pointer"
                       >
                           {episodeNumber}
                           <ChevronDown size={14} className={`transition-transform ${isEpisodeMenuOpen ? 'rotate-180' : ''}`} />
                       </button>

                       {isEpisodeMenuOpen && relatedEpisodes.length > 0 && (
                           <div className="absolute top-full right-0 mt-2 w-48 bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[100]">
                               <div className="p-1.5 flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                   {relatedEpisodes.map(ep => (
                                       <button 
                                          key={ep.index}
                                          onClick={() => {
                                              setIsEpisodeMenuOpen(false);
                                              if (onSwitchFile) onSwitchFile(ep.index);
                                          }}
                                          className={`w-full text-left px-3 py-2 rounded-lg transition-all text-xs font-mono font-medium ${ep.displayString === episodeNumber ? 'bg-[#58A6FF]/10 text-[#58A6FF]' : 'text-[#8B949E] hover:text-white hover:bg-[#30363D]'}`}
                                       >
                                          {ep.displayString}
                                       </button>
                                   ))}
                               </div>
                           </div>
                       )}
                   </div>
               )}
               <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="w-8 h-8 flex items-center justify-center text-[#8B949E] hover:text-white hover:bg-[#30363D] rounded-lg transition-all"
               >
                  <MoreVertical size={20} />
               </button>

               <input 
                 id="vid-load" 
                 type="file" 
                 accept="video/*" 
                 className="hidden" 
                 onChange={(e) => { 
                   if(e.target.files?.[0]) {
                     const url = URL.createObjectURL(e.target.files[0]);
                     setVideoSrc(url);
                   }
                 }} 
               />

               {isMenuOpen && (
                 <div className="absolute top-full right-0 mt-2 w-48 bg-[#161B22] border border-[#30363D] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[100]">
                    <div className="p-1.5 flex flex-col gap-0.5">
                        <button 
                          onClick={() => { document.getElementById('vid-load')?.click(); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded-lg transition-all text-xs font-medium"
                        >
                          <FileVideo size={16} className="text-[#58A6FF]" /> Load Video
                        </button>

                        <button 
                          onClick={() => { onOpenTextEditor(); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded-lg transition-all text-xs font-medium"
                        >
                          <Languages size={16} className="text-[#A371F7]" /> Translate
                        </button>

                        <button 
                          onClick={() => { setIsFindReplaceModalOpen(true); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded-lg transition-all text-xs font-medium"
                        >
                          <Search size={16} /> Find & Replace
                        </button>

                        <button 
                          onClick={() => {
                            setPreviewResolution(prev => prev.width === 1920 ? { width: 1444, height: 1080 } : { width: 1920, height: 1080 });
                            setIsMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded-lg transition-all text-xs font-medium"
                        >
                          <Monitor size={16} className="text-[#3fb950]" /> 
                          {previewResolution.width === 1920 ? "1920x1080" : "1444x1080"}
                        </button>

                        <div className="h-[1px] bg-[#30363D] my-1"></div>

                        <button 
                          onClick={() => { handleExportClick(); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 bg-[#238636]/10 hover:bg-[#238636] text-[#3fb950] hover:text-white rounded-lg transition-all text-xs font-bold"
                        >
                          <Download size={16} /> Download
                        </button>
                    </div>
                 </div>
               )}
          </div>
      </div>

      {/* 2. VIDEO PLAYER AREA */}
      <div 
         ref={fullscreenWrapperRef} 
         className={`w-full relative bg-black flex items-center justify-center ${isFullscreen && !isCssRotated ? 'fixed inset-0 z-[9998] h-screen w-screen' : ''}`}
      >
        <div 
          ref={containerRef} 
          className={`flex-shrink-0 bg-black relative group border-[#30363D] overflow-hidden select-none mx-auto ${!isFullscreen ? 'w-full min-h-[200px]' : ''}`} 
          style={isFullscreen && isCssRotated ? {
              height: '100vw',
              width: 'auto',
              maxWidth: '100vh',
              aspectRatio: videoResolution ? `${videoResolution.width} / ${videoResolution.height}` : `${previewResolution.width} / ${previewResolution.height}`,
              transform: 'translate(-50%, -50%) rotate(90deg)',
              transformOrigin: '50% 50%',
              position: 'fixed',
              top: '50%',
              left: '50%',
              zIndex: 9999,
              touchAction: 'none'
          } : isFullscreen ? {
              height: '100vh',
              width: 'auto',
              maxWidth: '100vw',
              aspectRatio: videoResolution ? `${videoResolution.width} / ${videoResolution.height}` : `${previewResolution.width} / ${previewResolution.height}`,
              touchAction: 'none',
              containerType: 'inline-size',
              margin: 'auto'
          } : { 
              containerType: 'inline-size',
              borderBottomWidth: 1,
              aspectRatio: videoResolution ? `${videoResolution.width} / ${videoResolution.height}` : `${previewResolution.width} / ${previewResolution.height}`,
              maxHeight: '400px',
              height: 'auto',
              width: '100%',
              touchAction: 'auto'
          }}
          onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleVideoClick}
      >
          {videoSrc ? (
              <video 
                  key={videoSrc}
                  ref={videoRef} 
                  src={videoSrc}
                  className="w-full h-full object-contain block bg-black relative z-10"
                  playsInline 
                  preload="auto"
                  onLoadedMetadata={(e)=>{
                      console.log("Video metadata loaded:", e.currentTarget.videoWidth, "x", e.currentTarget.videoHeight);
                      setDuration(e.currentTarget.duration);
                      setVideoResolution({
                          width: e.currentTarget.videoWidth,
                          height: e.currentTarget.videoHeight
                      });
                  }} 
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={(e) => console.error("Video Error:", e)}
              />
          ) : (
              <div className="w-full h-full bg-[#0D1117] relative overflow-hidden flex items-center justify-center">
                   <img 
                       src="https://i.ibb.co/XkxGWvz2/x.jpg" 
                       alt="No Video" 
                       className="w-full h-full object-cover pointer-events-none"
                       referrerPolicy="no-referrer"
                   />
              </div>
          )}

          {/* VIDEO OVERLAY (Live Styles) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
              {activeSubtitles.map(evt => {
                  const displayText = (editingId === evt.id) ? tempText : evt.rawText;
                  const cssStyle = generateCssFromStyle(
                    displayText, 
                    evt.style, 
                    parsedStyles, 
                    containerSize.width, 
                    containerSize.height,
                    scriptResolution
                  );
                  
                  const scaleFactor = containerSize.height / scriptResolution.height;
                  const richText = renderRichSubtitleText(displayText, parsedStyles[evt.style] || parsedStyles['Default'], scaleFactor);

                  return (
                      <div key={evt.id} style={cssStyle}>
                        {richText}
                      </div>
                  );
              })}
          </div>

          {/* Fullscreen Overlay Controls */}
          {isFullscreen && (
              <div className={`absolute inset-0 z-40 flex items-center justify-center transition-opacity duration-300 pointer-events-none ${showFsControls && !isDraggingFs ? 'opacity-100' : 'opacity-0'}`}>
                  <button 
                      onClick={(e) => { e.stopPropagation(); togglePlay(); showControls(); }}
                      className="pointer-events-auto bg-black/60 text-white rounded-full p-6 backdrop-blur-md hover:bg-black/80 hover:scale-110 transition-all border border-white/10 flex items-center justify-center"
                  >
                      {isPlaying ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
                  </button>
              </div>
          )}

          <button 
              className={`absolute bottom-4 right-4 bg-black/10 hover:bg-black/60 backdrop-blur-sm opacity-50 hover:opacity-100 text-white/50 hover:text-white p-2 rounded-xl z-[100] transition-all duration-300 pointer-events-auto border border-transparent hover:border-white/10 ${isFullscreen && (!showFsControls && !isDraggingFs) ? 'opacity-0' : 'opacity-100'}`}
              onClick={toggleFullscreen}
              onPointerDown={(e) => e.stopPropagation()}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
              {isFullscreen ? <Minimize size={20} strokeWidth={1.5} /> : <Maximize size={20} strokeWidth={1.5} />}
          </button>

          <div className={isFullscreen 
              ? `absolute bottom-4 left-4 bg-black/10 backdrop-blur-sm opacity-50 text-white/50 px-3 py-2 rounded-xl z-[100] transition-all duration-300 pointer-events-none select-none font-mono text-sm border border-transparent ${(!showFsControls && !isDraggingFs) ? 'opacity-0' : 'opacity-100'}`
              : "absolute bottom-1 left-1 bg-black/20 backdrop-blur-[1px] px-1.5 py-0.5 rounded text-white/50 text-[9px] font-mono font-medium border border-white/5 pointer-events-none select-none hidden"}
          >
              {formatCurrentTime(currentTime)} / {formatCurrentTime(duration || virtualDuration)}
          </div>
        </div>
      </div>

      {/* 3. PROGRESS BAR */}
      <div className="h-4 bg-[#0D1117] flex items-center px-4 shrink-0 relative group">
           <input 
               type="range"
               min={0}
               max={(duration || virtualDuration) || 1}
               step={0.1}
               value={currentTime}
               onChange={(e) => seekTo(parseFloat(e.target.value))}
               style={{
                   background: `linear-gradient(to right, #58A6FF ${progressPercent}%, #30363D ${progressPercent}%)`
               }}
               className="w-full h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#58A6FF] [&::-webkit-slider-thumb]:hover:scale-125 transition-all"
           />
      </div>

      {/* 4. TOOLBAR (Professional Layout) */}
      <div className="bg-[#161B22] border-b border-[#30363D] h-11 flex items-center px-4 relative shrink-0 z-30 select-none overflow-hidden">
          
          {/* LEFT: TIME DISPLAY */}
          <div className="flex-1 flex justify-start">
              <div className="flex items-center justify-center bg-[#0D1117] border border-[#30363D] rounded-lg h-8 w-[90px] shadow-inner">
                 <div className="text-[9px] font-mono font-bold text-[#E6EDF3] tracking-tighter">
                    <span className="text-[#58A6FF]">{formatCurrentTime(currentTime)}</span>
                    <span className="text-[#484F58] mx-0.5">/</span>
                    <span className="text-[#8B949E]">{formatCurrentTime(duration || virtualDuration)}</span>
                 </div>
              </div>
          </div>

          {/* CENTER: PLAY CONTROLS (Absolute Center) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
              <div className="flex items-center bg-[#0D1117] border border-[#30363D] rounded-lg h-8 p-1 gap-1 shadow-inner w-[120px] justify-center">
                   <button onClick={() => jumpSubtitle('prev')} className="w-8 h-full flex items-center justify-center rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] transition-all" title="Prev Subtitle"><SkipBack size={14} /></button>
                   <button onClick={togglePlay} className="w-10 h-full flex items-center justify-center rounded text-white bg-[#1F6FEB] hover:bg-[#388BFD] shadow-lg transition-all">
                       {isPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor" className="ml-0.5"/>}
                   </button>
                   <button onClick={() => jumpSubtitle('next')} className="w-8 h-full flex items-center justify-center rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] transition-all" title="Next Subtitle"><SkipForward size={14} /></button>
              </div>
          </div>

          {/* RIGHT: UNDO/REDO */}
          <div className="flex-1 flex justify-end">
            <div className="flex items-center bg-[#0D1117] border border-[#30363D] rounded-lg h-8 p-1 gap-1 shadow-inner w-[90px] justify-center">
                <button onClick={undo} disabled={!canUndo} className="w-8 h-full flex items-center justify-center rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] disabled:opacity-20 transition-all" title="Undo"><Undo2 size={13}/></button>
                <div className="w-px h-3 bg-[#30363D] mx-0.5"></div>
                <button onClick={redo} disabled={!canRedo} className="w-8 h-full flex items-center justify-center rounded text-[#8B949E] hover:text-white hover:bg-[#30363D] disabled:opacity-20 transition-all" title="Redo"><Redo2 size={13}/></button>
            </div>
          </div>
      </div>

      {/* FIND & REPLACE MODAL */}
      {isFindReplaceModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="w-full max-w-sm bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b border-[#30363D] bg-[#161B22]">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2">
                          <Search size={16} className="text-[#58A6FF]" />
                          Find & Replace
                      </h3>
                      <button onClick={() => setIsFindReplaceModalOpen(false)} className="text-[#8B949E] hover:text-white transition-colors">
                          <X size={18} />
                      </button>
                  </div>
                  <div className="p-4 space-y-4">
                      <div className="space-y-1.5">
                          <div className="flex justify-between items-end">
                              <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider">Find</label>
                              {findText && (
                                  <span className="text-[10px] font-mono font-bold text-[#58A6FF] bg-[#58A6FF]/10 px-2 py-0.5 rounded-full">
                                      {findCount} matches
                                  </span>
                              )}
                          </div>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484F58]" size={14} />
                            <input 
                                value={findText}
                                onChange={(e) => setFindText(e.target.value)}
                                className="w-full bg-[#010409] border border-[#30363D] rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:border-[#58A6FF] outline-none"
                                placeholder="Text to find..."
                            />
                          </div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider">Replace With</label>
                          <div className="relative">
                            <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484F58]" size={14} />
                            <input 
                                value={replaceText}
                                onChange={(e) => setReplaceText(e.target.value)}
                                className="w-full bg-[#010409] border border-[#30363D] rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:border-[#58A6FF] outline-none"
                                placeholder="New text..."
                            />
                          </div>
                      </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 p-4 border-t border-[#30363D] bg-[#161B22]">
                      <button onClick={() => setIsFindReplaceModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#8B949E] hover:text-white transition-colors">Cancel</button>
                      <button 
                        onClick={() => { handleFindReplace(); setIsFindReplaceModalOpen(false); }} 
                        className="px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-bold rounded-xl shadow-lg flex items-center gap-2 transition-colors"
                      >
                          <RefreshCw size={16} /> Replace All
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* 5. SUBTITLE LIST */}
      <div className="flex-1 overflow-y-auto bg-[#050812] custom-scroll p-3 space-y-3">
          {displayData.map((evt, renderIdx) => {
              const isActive = currentTime >= evt.start && currentTime < evt.end;
              const isEditing = editingId === evt.id;
              
              let badgeColor = "bg-[#21262D] text-[#E6EDF3] border-[#30363D]"; 
              if (evt.style.toLowerCase().includes('sign')) badgeColor = "bg-[#238636]/20 text-[#3fb950] border-[#238636]/30";
              else if (evt.style.toLowerCase().includes('logo')) badgeColor = "bg-[#1F6FEB]/20 text-[#58A6FF] border-[#1F6FEB]/30";

              return (
                  <div 
                      key={evt.id} 
                      ref={isActive ? activeRowRef : null}
                      onClick={() => !isEditing && seekTo(evt.start)}
                      onDoubleClick={(e) => { e.stopPropagation(); handleTextEditStart(evt.id, evt.rawText, evt.start); }}
                      className={`rounded-xl border transition-all overflow-hidden ${isActive ? 'bg-[#161B22] border-[#58A6FF]' : 'bg-[#0D1117] border-[#30363D]'} ${isEditing ? 'ring-1 ring-[#58A6FF] bg-[#0D1117]' : 'cursor-pointer'}`}
                  >
                      {!isEditing ? (
                        /* READ ONLY VIEW */
                        <div className="p-3">
                            <div className="flex items-center justify-between mb-2 h-6">
                                <div className="flex items-center gap-3">
                                    <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${isActive ? 'bg-[#58A6FF] text-white' : 'bg-[#30363D] text-[#8B949E]'}`}>
                                        {renderIdx + 1}
                                    </div>
                                    <div className="text-[10px] font-mono text-[#8B949E] whitespace-nowrap">
                                        {formatSrtTime(evt.start)} <span className="text-[#30363D]">➜</span> {formatSrtTime(evt.end)}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${badgeColor}`}>
                                        {evt.style || 'Def'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(evt.id); }} className="p-1.5 text-[#8B949E] hover:text-[#F85149] hover:bg-[#30363D] rounded transition-colors"><Trash2 size={12} /></button>
                                </div>
                            </div>
                            <div className="bg-[#010409] border border-[#30363D]/50 rounded-lg p-2">
                                <p 
                                    className="text-sm text-[#E6EDF3] leading-snug line-clamp-2 break-words" 
                                    style={{ fontFamily: "'Roboto Condensed', sans-serif" }}
                                >
                                    {evt.rawText.replace(/{[^}]+}/g, '').replace(/\\N/gi, ' ')}
                                </p>
                            </div>
                        </div>
                      ) : (
                        /* EDITOR VIEW */
                        <div className="flex flex-col animate-in fade-in zoom-in-95 duration-200">
                             <div className="flex items-center justify-between bg-[#161B22] border-b border-[#30363D] px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-[#58A6FF] text-white flex items-center justify-center text-[10px] font-bold">{renderIdx + 1}</div>
                                    
                                    {/* TIME EDITOR CONTROLS */}
                                    <div className="flex items-center gap-2 text-[10px] font-mono text-[#58A6FF] font-bold tracking-wide relative">
                                        
                                        {/* Start Time Trigger */}
                                        <div className="relative">
                                            <button 
                                                className="time-adjust-trigger hover:text-white hover:underline transition-all"
                                                onClick={() => setActiveTimeAdjust(activeTimeAdjust?.id === evt.id && activeTimeAdjust.type === 'start' ? null : { id: evt.id, type: 'start' })}
                                            >
                                                {formatSrtTime(evt.start)}
                                            </button>
                                            {activeTimeAdjust?.id === evt.id && activeTimeAdjust.type === 'start' && (
                                                <div className="time-adjust-popover absolute top-full left-0 mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg shadow-xl p-1 z-50 flex gap-0.5 animate-in fade-in zoom-in-95">
                                                    <button onClick={() => updateTime(evt, evt.start - 1, evt.end)} className="px-2 py-1 bg-[#161B22] hover:bg-[#F85149] hover:text-white text-[#8B949E] rounded text-[9px]">-1s</button>
                                                    <button onClick={() => updateTime(evt, evt.start - 0.1, evt.end)} className="px-2 py-1 bg-[#161B22] hover:bg-[#F85149] hover:text-white text-[#8B949E] rounded text-[9px]">-0.1</button>
                                                    <button onClick={() => updateTime(evt, evt.start + 0.1, evt.end)} className="px-2 py-1 bg-[#161B22] hover:bg-[#238636] hover:text-white text-[#8B949E] rounded text-[9px]">+0.1</button>
                                                    <button onClick={() => updateTime(evt, evt.start + 1, evt.end)} className="px-2 py-1 bg-[#161B22] hover:bg-[#238636] hover:text-white text-[#8B949E] rounded text-[9px]">+1s</button>
                                                </div>
                                            )}
                                        </div>

                                        <span className="text-[#8B949E]">➜</span> 

                                        {/* End Time Trigger */}
                                        <div className="relative">
                                            <button 
                                                className="time-adjust-trigger hover:text-white hover:underline transition-all"
                                                onClick={() => setActiveTimeAdjust(activeTimeAdjust?.id === evt.id && activeTimeAdjust.type === 'end' ? null : { id: evt.id, type: 'end' })}
                                            >
                                                {formatSrtTime(evt.end)}
                                            </button>
                                            {activeTimeAdjust?.id === evt.id && activeTimeAdjust.type === 'end' && (
                                                <div className="time-adjust-popover absolute top-full right-0 mt-1 bg-[#0D1117] border border-[#30363D] rounded-lg shadow-xl p-1 z-50 flex gap-0.5 animate-in fade-in zoom-in-95">
                                                    <button onClick={() => updateTime(evt, evt.start, evt.end - 1)} className="px-2 py-1 bg-[#161B22] hover:bg-[#F85149] hover:text-white text-[#8B949E] rounded text-[9px]">-1s</button>
                                                    <button onClick={() => updateTime(evt, evt.start, evt.end - 0.1)} className="px-2 py-1 bg-[#161B22] hover:bg-[#F85149] hover:text-white text-[#8B949E] rounded text-[9px]">-0.1</button>
                                                    <button onClick={() => updateTime(evt, evt.start, evt.end + 0.1)} className="px-2 py-1 bg-[#161B22] hover:bg-[#238636] hover:text-white text-[#8B949E] rounded text-[9px]">+0.1</button>
                                                    <button onClick={() => updateTime(evt, evt.start, evt.end + 1)} className="px-2 py-1 bg-[#161B22] hover:bg-[#238636] hover:text-white text-[#8B949E] rounded text-[9px]">+1s</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                                <button onClick={() => setEditingId(null)} className="text-[#8B949E] hover:text-white"><X size={16}/></button>
                             </div>
                             
                             {/* TOOLBAR */}
                             <div className="flex items-center gap-2 p-2 border-b border-[#30363D] bg-[#0D1117] flex-wrap relative">
                                 {/* CUSTOM FONT DROPDOWN */}
                                 <div className="relative flex-1 min-w-[140px]">
                                     <button 
                                        onClick={() => setShowFontDropdown(!showFontDropdown)} 
                                        className="w-full flex items-center justify-between bg-[#161B22] border border-[#30363D] rounded-lg px-2 py-1.5 text-xs text-white hover:bg-[#1C2128]"
                                     >
                                         <div className="flex items-center gap-2">
                                             <Type size={12} className="text-[#58A6FF]" />
                                             <span className="truncate">{currentFontName}</span>
                                         </div>
                                         <ChevronDown size={12} className="text-[#8B949E]"/>
                                     </button>
                                     
                                     {showFontDropdown && (
                                         <div className="absolute top-full left-0 w-full mt-1 bg-[#161B22] border border-[#30363D] rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                             <div className="p-1">
                                                 <div 
                                                    onClick={() => changeFont('Default')} 
                                                    className="px-2 py-1.5 text-xs text-[#8B949E] hover:text-white hover:bg-[#30363D] rounded cursor-pointer"
                                                 >
                                                     Default Font
                                                 </div>
                                                 {allFonts.map(f => (
                                                     <div 
                                                        key={f.name} 
                                                        onClick={() => changeFont(f.name)}
                                                        className="px-2 py-1.5 text-xs text-white hover:bg-[#30363D] rounded cursor-pointer truncate"
                                                        style={{ fontFamily: f.family, fontSize: '14px' }}
                                                     >
                                                         {f.name}
                                                     </div>
                                                 ))}
                                                 <div className="h-px bg-[#30363D] my-1"></div>
                                                 <label className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold text-[#58A6FF] hover:bg-[#30363D] rounded cursor-pointer uppercase tracking-wide">
                                                     <Upload size={12} /> Import Font
                                                     <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontImport} />
                                                 </label>
                                             </div>
                                         </div>
                                     )}
                                     {showFontDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowFontDropdown(false)}></div>}
                                 </div>
                                 
                                 {/* COLOR PICKERS (TEXT & STROKE) */}
                                 <div className="flex items-center gap-1 bg-[#161B22] border border-[#30363D] rounded-lg p-0.5">
                                      <div className="relative w-7 h-7 flex items-center justify-center hover:bg-[#30363D] rounded cursor-pointer group" title="Text Color">
                                          <Palette size={14} style={{ color: currentHexColor }} />
                                          <input type="color" value={currentHexColor} onChange={(e) => handleColorChange(e, false)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                      </div>
                                      <div className="w-px h-4 bg-[#30363D]"></div>
                                      <div className="relative w-7 h-7 flex items-center justify-center hover:bg-[#30363D] rounded cursor-pointer group" title="Stroke Color">
                                          <PaintBucket size={14} style={{ color: currentHexOutline }} />
                                          <input type="color" value={currentHexOutline} onChange={(e) => handleColorChange(e, true)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                      </div>
                                 </div>

                                 <div className="flex items-center bg-[#161B22] border border-[#30363D] rounded-lg overflow-hidden">
                                     <button onClick={() => changeFontSize(-2)} className="p-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white"><Minus size={12}/></button>
                                     <div className="w-8 text-center text-xs font-mono font-bold text-[#E6EDF3]">{tempText.match(/\\fs(\d+)/)?.[1] || 78}</div>
                                     <button onClick={() => changeFontSize(2)} className="p-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white"><Plus size={12}/></button>
                                 </div>
                                 <div className="flex bg-[#161B22] border border-[#30363D] rounded-lg overflow-hidden">
                                     <button onClick={() => toggleTag(/\\b1/, '{\\b1}')} className="p-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white font-bold"><Bold size={12}/></button>
                                     <div className="w-px bg-[#30363D]"></div>
                                     <button onClick={() => toggleTag(/\\i1/, '{\\i1}')} className="p-2 hover:bg-[#30363D] text-[#8B949E] hover:text-white italic"><Italic size={12}/></button>
                                 </div>
                             </div>

                             <div className="flex items-start justify-between p-2 border-b border-[#30363D] bg-[#0D1117] gap-2">
                                 <div className="space-y-1">
                                    <div className="text-[8px] font-bold text-[#8B949E] uppercase tracking-wider text-center">Anchor</div>
                                    <div className="grid grid-cols-3 gap-0.5 w-16 bg-[#161B22] p-1 rounded border border-[#30363D]">
                                        {[7,8,9,4,5,6,1,2,3].map(n => (
                                            <button key={n} onClick={() => setAlignment(n)} className={`h-4 text-[8px] rounded hover:bg-[#58A6FF] hover:text-white ${tempText.includes(`\\an${n}`) ? 'bg-[#58A6FF] text-white' : 'bg-[#0D1117] text-[#8B949E]'}`}>{n}</button>
                                        ))}
                                    </div>
                                 </div>
                                 <div className="space-y-1 flex-1 flex flex-col items-center">
                                      <div className="text-[8px] font-bold text-[#8B949E] uppercase tracking-wider">Actions</div>
                                      <div className="flex bg-[#161B22] border border-[#30363D] rounded-lg overflow-hidden p-0.5">
                                          <button onClick={() => navigator.clipboard.writeText(tempText)} className="p-1.5 hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded" title="Copy"><Copy size={14}/></button>
                                          <div className="w-px bg-[#30363D] my-1"></div>
                                          <button onClick={() => setTempText(evt.rawText)} className="p-1.5 hover:bg-[#30363D] text-[#8B949E] hover:text-white rounded" title="Reset"><RotateCcw size={14}/></button>
                                          <div className="w-px bg-[#30363D] my-1"></div>
                                          <button onClick={() => setTempText('')} className="p-1.5 hover:bg-[#30363D] text-[#8B949E] hover:text-[#F85149] rounded" title="Clear"><Trash size={14}/></button>
                                      </div>
                                 </div>
                                 <div className="space-y-1">
                                     <div className="text-[8px] font-bold text-[#8B949E] uppercase tracking-wider text-center">Position</div>
                                     <div className="flex items-center gap-1">
                                         <div className="grid grid-cols-3 gap-0.5 w-20">
                                            <div/>
                                            <button onClick={() => movePosition(0, -posStep)} className="h-6 bg-[#161B22] border border-[#30363D] rounded flex items-center justify-center hover:bg-[#30363D] text-[#8B949E] hover:text-white"><ArrowUp size={10}/></button>
                                            <div/>
                                            <button onClick={() => movePosition(-posStep, 0)} className="h-6 bg-[#161B22] border border-[#30363D] rounded flex items-center justify-center hover:bg-[#30363D] text-[#8B949E] hover:text-white"><ArrowLeft size={10}/></button>
                                            <input type="number" value={posStep} onChange={(e) => setPosStep(Math.max(1, parseInt(e.target.value) || 1))} className="h-6 w-full bg-[#050812] rounded text-[9px] font-mono text-[#58A6FF] text-center outline-none focus:ring-1 focus:ring-[#58A6FF] appearance-none" />
                                            <button onClick={() => movePosition(posStep, 0)} className="h-6 bg-[#161B22] border border-[#30363D] rounded flex items-center justify-center hover:bg-[#30363D] text-[#8B949E] hover:text-white"><ArrowRight size={10}/></button>
                                            <div/>
                                            <button onClick={() => movePosition(0, posStep)} className="h-6 bg-[#161B22] border border-[#30363D] rounded flex items-center justify-center hover:bg-[#30363D] text-[#8B949E] hover:text-white"><ArrowDown size={10}/></button>
                                            <div/>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                             <div className="p-2 relative bg-[#0D1117]">
                                <div className="text-[8px] font-bold text-[#8B949E] uppercase mb-1">Dialogue Text</div>
                                <textarea value={tempText} onChange={(e) => setTempText(e.target.value)} className="w-full h-24 bg-[#050812] border border-[#30363D] rounded p-3 text-xs font-mono text-[#E6EDF3] leading-relaxed resize-none focus:border-[#58A6FF] outline-none" />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => handleEditSave(evt.id)} className="px-6 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-bold rounded flex items-center gap-2 shadow-lg"><Check size={14} /> SAVE LINE</button>
                                </div>
                             </div>
                        </div>
                      )}
                  </div>
              );
          })}
      </div>

      <TranslateModal isOpen={isTranslateModalOpen} onClose={() => setIsTranslateModalOpen(false)} onStartTranslate={handleStartTranslate} user={user} />
      
      {/* PROCESSING OVERLAY (NEW UI) */}
      {isTranslating && (
        <div className="fixed inset-0 z-[100] bg-[#050812] flex flex-col items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md w-full space-y-6 animate-in fade-in zoom-in-95 duration-200">
                
                {/* Error Banner */}
                {translationError && (
                    <div className="bg-[#F85149]/10 border border-[#F85149]/30 rounded-2xl p-4 flex items-start gap-4 shadow-lg animate-in slide-in-from-top-4">
                        <div className="bg-[#F85149]/20 p-2 rounded-lg">
                            <AlertTriangle className="text-[#F85149]" size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-white font-bold text-sm mb-1">Translation Failed</h3>
                            <p className="text-xs text-[#F85149] leading-relaxed">{translationError}</p>
                            <p className="text-[10px] text-[#8B949E] mt-2">Check your API Key, Model Access, or Internet.</p>
                        </div>
                    </div>
                )}

                {/* Top Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Estimated Time */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Estimated time</span>
                        <div className="bg-[#161B22] border border-[#30363D] rounded-2xl h-24 flex items-center justify-center shadow-lg relative overflow-hidden">
                             <div className="absolute top-0 right-0 p-3 opacity-10">
                                <Clock size={40} />
                             </div>
                             <span className="text-2xl font-black text-[#58A6FF] tracking-tight">{calculateEta()}</span>
                        </div>
                    </div>
                     {/* Total Lines */}
                     <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Total lines</span>
                        <div className="bg-[#161B22] border border-[#30363D] rounded-2xl h-24 flex items-center justify-center shadow-lg relative overflow-hidden">
                             <div className="absolute top-0 right-0 p-3 opacity-10">
                                <FileText size={40} />
                             </div>
                             <span className="text-2xl font-black text-white tracking-tight">{translationStats.processed}/{translationStats.total}</span>
                        </div>
                    </div>
                </div>

                {/* Translated Subtitle Preview */}
                <div className="flex flex-col gap-2">
                     <span className="text-xs font-bold text-white uppercase tracking-wider">Translated subtitle</span>
                     {/* UPDATED: Scrollable list with serial numbers */}
                     <div className="bg-[#161B22] border border-[#30363D] rounded-2xl h-64 overflow-y-auto custom-scroll relative shadow-xl flex flex-col">
                         <div className="sticky top-0 left-0 w-full h-1 bg-gradient-to-r from-[#58A6FF] via-[#A371F7] to-[#58A6FF] animate-gradient-x z-10 shrink-0"></div>
                         
                         <div className="p-4 space-y-1">
                             {translationStats.currentBatchLines.length === 0 ? (
                                <p className="text-sm text-[#8B949E] font-mono animate-pulse">
                                    {translationError ? "Process stopped." : "Waiting for translated lines..."}
                                </p>
                             ) : (
                                 translationStats.currentBatchLines.map((line, idx) => {
                                     const startIdx = getSerialStart();
                                     return (
                                        <div key={idx} className="flex gap-3 text-xs font-mono leading-relaxed border-b border-[#30363D]/30 pb-1 mb-1 last:border-0">
                                            <span className="text-[#58A6FF] font-bold select-none w-8 text-right shrink-0">{startIdx + idx}.</span>
                                            <span className="text-[#E6EDF3] whitespace-pre-wrap break-words">{line}</span>
                                        </div>
                                     );
                                 })
                             )}
                         </div>
                     </div>
                </div>

                {/* Progress Section */}
                {!translationError && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-white uppercase tracking-wider">
                            <span>{translationStats.progress}%</span>
                            <span>Batch {translationStats.batchCurrent}/{translationStats.batchTotal}</span>
                        </div>
                        <div className="w-full h-3 bg-[#0D1117] rounded-full overflow-hidden border border-[#30363D]">
                            <div className="h-full bg-[#58A6FF] transition-all duration-300 shadow-[0_0_10px_#58A6FF]" style={{ width: `${translationStats.progress}%` }}></div>
                        </div>
                    </div>
                )}

                {/* Cancel / Close Button */}
                <button 
                    onClick={handleCancelTranslation}
                    className={`w-full py-4 border rounded-2xl transition-colors uppercase tracking-widest text-xs shadow-lg font-bold ${translationError ? 'bg-[#161B22] border-[#30363D] text-white hover:bg-[#30363D]' : 'bg-[#211515] hover:bg-[#3E1B1B] border-[#F85149]/30 text-[#F85149]'}`}
                >
                    {translationError ? 'Close' : 'Cancel'}
                </button>
            </div>
        </div>
      )}

      <TextEditModal 
          isOpen={!!textEditModalData}
          initialText={textEditModalData?.text || ''}
          onSave={handleTextEditSave}
          onClose={() => setTextEditModalData(null)}
      />

    </div>
  );
};

export default Preview;