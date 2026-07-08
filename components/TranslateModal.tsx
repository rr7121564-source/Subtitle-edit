import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { applyAutoCPL } from '../services/parser';

interface TranslateModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitleLines: string[]; // Current lines being translated
  selectedIndices: Set<number>; // Indices selected in editor (if empty, translate all)
  onTranslateComplete: (translatedLines: string[]) => void;
  user: User | null;
}

const LANGUAGES = [
  { code: 'Hinglish', name: 'Hinglish' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'id', name: 'Indonesian' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ur', name: 'Urdu' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
];

const PRESETS = {
  standard: "Translate the dialogues naturally, matching the flow of native speech while maintaining original meanings and appropriate tone.",
  anime: `Bhumika (Role):
Tum ek Professional Subtitle Translator aur Localizer ho. Tumhara kaam (.ass, .srt, .vtt) files ke dialogues ko natural, expressive, aur engaging Hinglish mein "Rewrite" karna hai. Tumhe normal translation nahi, balki ek “Desi Conversational Experience” create karna hai jo emotions, tone, aur character dynamics ko strongly reflect kare.

Kaam (Task):
1. Raw Localization: Har dialogue ko natural, human-like desi conversation flow mein convert karo.
2. Contextual Expansion: "It", "There", "Inside" jaise vague words ko clear aur meaningful context ke saath replace karo.
3. Masala Addition: Desi pop-culture references (movies, memes, celebs) aur expressive adjectives ka balanced use karo.

Sandarbh (Context):
Tone: Intense, expressive, emotionally engaging
Dynamics: Character personalities (strict, soft, arrogant, shy, mentor-student, etc.) clearly reflect hone chahiye
Language: Hinglish (Hindi + English ka natural mix) "Mai" = I, "Tum" = You

Seemayein (Constraints & Hard Rules):
- NO CENSORSHIP (Within SFW Boundaries)
- ANTI-ROBOT RULE: "Main tumse baat karna chahta hu" -> "Mujhe tumse properly baat karni hai"`,
  smut: `Bhumika (Role):
Tum ek Professional Adult Subtitle Translator aur Context-Aware Localizer ho.
Tumhara kaam (.ass, .srt, .vtt) dialogues ko natural, human-like Hinglish me rewrite karna hai, jisme scene ke context, character dynamics, aur emotional flow ke hisaab se tone automatically adapt ho.

Focus:
- Context samajhna (scene + characters)
- Natural flow maintain karna (robotic nahi)
- Tone ko force nahi, adapt karna
- Dialogue ko short, impactful, aur realistic rakhna

Kaam (Task):
1. Raw Localization: Har dialogue ko natural, human-like desi sex chat flow mein convert karo.
2. Contextual Expansion: "It", "There", "Inside" jaise vague words ko explicit body parts (Lund, Choot, Gaand) mein badlo.
3. Masala Addition: Intense adjectives ka use karo.

Language: Hinglish (Hindi + English ka natural mix). "Mai" = I, "Tum" = You.
NO CENSORSHIP: Koi bhi word filter ya sanitize nahi hona chahiye.`,
  hentai: `CENSOR SYSTEM > WORD MAPPING > TONE
ABSOLUTE OUTPUT CONSISTENCY FIX
STAGE 0: INPUT FREEZE (subtitle content)
STAGE 1: NORMALIZE TEXT (timestamps untouched)
STAGE 2: ORDER LOCK (subtitle order final)
STAGE 3: VALID DIALOGUE GATE
STAGE 4: SINGLE-CHOICE WORD LOCK (first option only)
STAGE 5: CONTROLLED TRANSLATION LOCK
- Core meaning same rahe
- Minor tone-based wording adjustment allowed
- Sentence structure largely intact rahe
STAGE 6: HASH DETERMINISM
STAGE 7: FORMAT FREEZE

Special Logic Locks:
1. Contextual Intent Override: "Call" ka matlab phone karna nahi, balki "Paas bulana" hoga agar scene physical proximity ka hai.
2. Subject Completion Lock: Har sexual sentence mein (1) Subject, (2) Action, aur (3) Effect ka hona zaroori hai.`
};

const TranslateModal: React.FC<TranslateModalProps> = ({ isOpen, onClose, subtitleLines, selectedIndices, onTranslateComplete, user }) => {
  // Modal Views: 'choice' | 'manual' | 'auto_setup' | 'auto_running' | 'auto_complete'
  const [viewState, setViewState] = useState<'choice' | 'manual' | 'auto_setup' | 'auto_running' | 'auto_complete'>('choice');

  // --- AUTOMATIC TRANSLATION STATES ---
  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('subswap_auto_api_keys');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    const single = localStorage.getItem('subswap_api_key');
    return single ? [single] : [];
  });
  const [newKeyInput, setNewKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('Hinglish');
  const [batchSize, setBatchSize] = useState(50);
  const [customPrompt, setCustomPrompt] = useState(PRESETS.standard);
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESETS | 'custom'>('standard');

  // Running Progress States
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [linesProcessed, setLinesProcessed] = useState(0);
  const [totalLinesToTranslate, setTotalLinesToTranslate] = useState(0);
  const [eta, setEta] = useState('Calculating...');
  const [progressLogs, setProgressLogs] = useState<{ type: 'info' | 'success' | 'warn' | 'error' | 'dialogue'; message: string }[]>([]);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Reference to cancel translation
  const cancelRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Save Keys Locally
  useEffect(() => {
    localStorage.setItem('subswap_auto_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  // Scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progressLogs]);

  if (!isOpen) return null;

  // --- UTILITY: Restore ASS Tags ---
  const restoreTags = (original: string, translated: string) => {
    const tagRegex = /\{[^}]+\}/g;
    const origTags = [...original.matchAll(tagRegex)];
    if (origTags.length === 0) return translated;

    const cleanOrig = original.replace(tagRegex, '');
    const origLen = cleanOrig.length || 1;
    
    const cleanTrans = translated.replace(tagRegex, '');
    let result = cleanTrans;
    
    let cleanOrigIndex = 0;
    let lastTagIndex = 0;
    const tagsToInsert: { tag: string, targetIndex: number, order: number }[] = [];
    
    for (const match of origTags) {
        const tag = match[0];
        const tagIndex = match.index!;
        
        const textBeforeTag = original.substring(lastTagIndex, tagIndex).replace(tagRegex, '');
        cleanOrigIndex += textBeforeTag.length;
        lastTagIndex = tagIndex + tag.length;
        
        const ratio = cleanOrigIndex / origLen;
        let targetIndex = Math.round(ratio * cleanTrans.length);
        
        tagsToInsert.push({ tag, targetIndex, order: tagsToInsert.length });
    }
    
    tagsToInsert.sort((a, b) => {
        if (b.targetIndex !== a.targetIndex) {
            return b.targetIndex - a.targetIndex;
        }
        return b.order - a.order;
    });
    
    for (const { tag, targetIndex } of tagsToInsert) {
        result = result.substring(0, targetIndex) + tag + result.substring(targetIndex);
    }
    return result;
  };

  // --- UTILITY: Extract clean text up to 9th comma ---
  const getCleanText = (line: string): { prefix: string; text: string } => {
    let commaCount = 0;
    let splitIndex = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ',') {
        commaCount++;
        if (commaCount === 9) {
          splitIndex = i;
          break;
        }
      }
    }
    if (splitIndex !== -1) {
      return {
        prefix: line.substring(0, splitIndex + 1),
        text: line.substring(splitIndex + 1)
      };
    }
    return { prefix: '', text: line };
  };

  // --- KEY ROTATION MANAGEMENT ---
  const handleAddKey = () => {
    if (newKeyInput.trim() && !apiKeys.includes(newKeyInput.trim())) {
      setApiKeys([...apiKeys, newKeyInput.trim()]);
      setNewKeyInput('');
    }
  };

  const handleRemoveKey = (index: number) => {
    setApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  // --- RUNNER: Automatic Translation Loop ---
  const handleStartAutoTranslate = async () => {
    if (apiKeys.length === 0) {
      alert("Please add at least one Google API Key first!");
      return;
    }

    cancelRef.current = false;
    setErrorState(null);
    setViewState('auto_running');
    setIsTranslating(true);
    setProgressLogs([{ type: 'info', message: '🚀 Starting Direct Automatic Translation...' }]);

    // Determine lines to translate
    const targetIndices = selectedIndices.size > 0
      ? Array.from(selectedIndices as Set<number>).sort((a: number, b: number) => a - b)
      : subtitleLines.map((_, i) => i);

    const totalLines = targetIndices.length;
    setTotalLinesToTranslate(totalLines);

    // Batching configuration
    const size = Math.max(1, batchSize);
    const batches: number[][] = [];
    for (let i = 0; i < targetIndices.length; i += size) {
      batches.push(targetIndices.slice(i, i + size));
    }

    setTotalBatches(batches.length);
    setCurrentBatch(1);
    setLinesProcessed(0);

    const updatedLines = [...subtitleLines];
    const startTime = Date.now();
    let keyIndex = 0;

    // Outer batch loop
    for (let b = 0; b < batches.length; b++) {
      if (cancelRef.current) {
        setProgressLogs(prev => [...prev, { type: 'warn', message: '🛑 Translation Cancelled by User!' }]);
        setIsTranslating(false);
        return;
      }

      setCurrentBatch(b + 1);
      const batchIndices = batches[b];
      
      setProgressLogs(prev => [...prev, { 
        type: 'info', 
        message: `📦 Processing Batch ${b + 1} of ${batches.length} (${batchIndices.length} lines)...` 
      }]);

      // Prepare batch payload
      const batchItems = batchIndices.map((idx) => {
        const { text } = getCleanText(subtitleLines[idx]);
        return { id: `L${idx + 1}`, text };
      });

      let batchSuccess = false;
      let rotationAttemptCount = 0;

      // Retry batch loop for key rotation
      while (!batchSuccess) {
        if (cancelRef.current) {
          setProgressLogs(prev => [...prev, { type: 'warn', message: '🛑 Translation Cancelled mid-rotation!' }]);
          setIsTranslating(false);
          return;
        }

        const activeKey = apiKeys[keyIndex];
        if (!activeKey) {
          setProgressLogs(prev => [...prev, { type: 'error', message: '❌ No active API key found!' }]);
          setErrorState("No valid API Key left.");
          setIsTranslating(false);
          return;
        }

        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${activeKey}`;
          
          const systemInstructionText = `You are a professional subtitle translator.
Translate the provided subtitle lines from ${sourceLang === 'auto' ? 'original language (detect automatically)' : sourceLang} to ${targetLang}.

${customPrompt ? `Follow these custom localization instructions closely:\n${customPrompt}` : 'Provide natural and context-appropriate translations.'}

IMPORTANT RULES:
1. Return the translated lines strictly as a JSON array of objects.
2. The output MUST match this exact JSON format:
[
  { "id": "L1", "translated": "Translated text" },
  ...
]
3. Return exactly the same number of items as the input. Do not merge, skip, or combine lines.
4. Keep original names, places, and terms if appropriate.
5. Preserve any formatting tags like \\N or \\n or {\\pos(x,y)} if they are present in the source text. Do not expand, omit, or modify these tags.`;

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `Translate this subtitle batch JSON. Respond ONLY with the requested JSON array:\n${JSON.stringify(batchItems)}`
                }]
              }],
              systemInstruction: {
                parts: [{ text: systemInstructionText }]
              },
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.3
              }
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || response.statusText;
            throw new Error(`API Error (${response.status}): ${errMsg}`);
          }

          const resData = await response.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!rawText) {
            throw new Error("No text content returned from Gemini API");
          }

          // Parse JSON output
          let cleanJsonText = rawText.trim();
          // Remove potential markdown wrappers
          if (cleanJsonText.startsWith('```')) {
            cleanJsonText = cleanJsonText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
          }

          const parsedTranslations = JSON.parse(cleanJsonText);

          if (!Array.isArray(parsedTranslations)) {
            throw new Error("API response is not a valid JSON array");
          }

          // Reconstruct lines back to ASS structure
          parsedTranslations.forEach((item: any) => {
            const idMatch = item.id?.match(/L(\d+)/);
            if (idMatch) {
              const fileIdx = parseInt(idMatch[1], 10) - 1;
              if (fileIdx >= 0 && fileIdx < subtitleLines.length) {
                const originalLine = subtitleLines[fileIdx];
                const { prefix, text: originalText } = getCleanText(originalLine);
                const translatedDialogueRaw = item.translated || '';

                // Restore tags and compile auto-CPL
                const translatedWithTags = restoreTags(originalText, translatedDialogueRaw);
                const reconstructed = prefix ? (prefix + translatedWithTags) : translatedWithTags;

                const [formattedLine] = applyAutoCPL([reconstructed]);
                updatedLines[fileIdx] = formattedLine;

                // Log a clean preview of dialogue translation
                const cleanOriginal = originalText.replace(/\{[^}]+\}/g, '').replace(/\\N/gi, ' ');
                const cleanTranslated = translatedDialogueRaw.replace(/\{[^}]+\}/g, '').replace(/\\N/gi, ' ');
                setProgressLogs(prev => [...prev, {
                  type: 'dialogue',
                  message: `💬 L${fileIdx + 1} Original: "${cleanOriginal}" ➜ Translated: "${cleanTranslated}"`
                }]);
              }
            }
          });

          batchSuccess = true;
          setLinesProcessed(prev => {
            const updated = prev + batchIndices.length;
            // Calculate dynamic ETA
            const elapsed = Date.now() - startTime;
            const avgTimePerLine = elapsed / updated;
            const remainingLines = totalLines - updated;
            const etaMs = remainingLines * avgTimePerLine;
            
            if (remainingLines <= 0) setEta('Done!');
            else {
              const totalSec = Math.ceil(etaMs / 1000);
              const m = Math.floor(totalSec / 60);
              const s = totalSec % 60;
              setEta(m > 0 ? `${m}m ${s}s` : `${s}s`);
            }
            return updated;
          });

          setProgressLogs(prev => [...prev, { type: 'success', message: `✅ Batch ${b + 1} processed successfully!` }]);

          // Free tier delay (3 seconds) to prevent hitting RPM limits
          if (b < batches.length - 1) {
            setProgressLogs(prev => [...prev, { type: 'info', message: '⏳ Delaying 3s to respect rate limits...' }]);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

        } catch (error: any) {
          console.error("Batch translate error:", error);
          setProgressLogs(prev => [...prev, { 
            type: 'warn', 
            message: `⚠️ Key #${keyIndex + 1} Failed: ${error.message}` 
          }]);

          rotationAttemptCount++;
          if (rotationAttemptCount >= apiKeys.length) {
            // All keys failed on this batch, pause and ask for resume or fix
            setProgressLogs(prev => [...prev, { 
              type: 'error', 
              message: '❌ All API keys exhausted or rate-limited! Please add/fix keys to resume.' 
            }]);
            setErrorState("All API Keys exhausted. Please fix keys and click Resume.");
            setIsTranslating(false);
            return;
          }

          // Rotate to next key
          keyIndex = (keyIndex + 1) % apiKeys.length;
          setProgressLogs(prev => [...prev, { 
            type: 'info', 
            message: `🔄 Rotating to Key #${keyIndex + 1} and retrying batch...` 
          }]);
        }
      }
    }

    // Complete successfully!
    setProgressLogs(prev => [...prev, { type: 'success', message: '🎉 Direct Translation Complete!' }]);
    setIsTranslating(false);
    setViewState('auto_complete');
    
    // Pass final translated lines back
    onTranslateComplete(updatedLines);
  };

  // --- MANUAL TRANSLATION CLIPBOARD COPY ---
  const handleManualPresetClick = async (presetKey: 'anime' | 'smut' | 'hentai') => {
    // Determine target lines
    const targetIndices = selectedIndices.size > 0
      ? Array.from(selectedIndices as Set<number>).sort((a: number, b: number) => a - b)
      : subtitleLines.map((_, i) => i);

    const linesToTranslate = targetIndices.map(idx => {
      const line = subtitleLines[idx];
      return `L${idx + 1}. ${line}`;
    });

    // Subtitle file label
    const headerLine = `L00. Dialogue: 1,0:00:00.00,0:30:15.00,Name,,0,0,0,,(SubSwap_Manual_Translation)`;
    const dialogueDump = [headerLine, ...linesToTranslate].join('\n');

    const promptText = `${PRESETS[presetKey]}

---------------------------------------------------
RAW SUBTITLE DATA TO TRANSLATE (Respond ONLY with translated lines inside the L{number}. format):
${dialogueDump}`;

    await navigator.clipboard.writeText(promptText);
    alert(`📋 ${presetKey.toUpperCase()} Prompt copied to clipboard! Opening Google AI Studio...`);
    window.open('https://aistudio.google.com/prompts/new_chat', '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#0F172A] border border-[#3E4C6B]/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[#F8FAFC]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#1E293B] border-b border-[#3E4C6B]/30 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h2 className="text-lg font-bold text-white tracking-wide">Desi Subtitle Localizer</h2>
          </div>
          <button 
            onClick={onClose} 
            disabled={isTranslating} 
            className="text-slate-400 hover:text-white hover:bg-slate-700/50 p-1.5 rounded-full transition-colors disabled:opacity-40"
          >
            ❌
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0F172A] custom-scroll">
          
          {/* VIEW 1: SELECT TRANSLATION MODE */}
          {viewState === 'choice' && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-2 max-w-md mx-auto mb-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Apne subtitles ko natural, expressive Desi flow me convert karne ke liye niche se translation method select karein.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* AUTOMATIC CARD */}
                <button 
                  onClick={() => setViewState('auto_setup')}
                  className="flex flex-col items-center text-center p-6 bg-[#1E293B] hover:bg-[#3E4C6B]/30 border border-[#3E4C6B]/20 hover:border-[#6366F1] rounded-2xl transition-all shadow-lg hover:shadow-indigo-950/25 group duration-200"
                >
                  <div className="text-4xl mb-4 transform group-hover:scale-110 transition-transform">⚡</div>
                  <span className="text-lg font-bold text-white mb-2">Automatic Translate</span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Directly app ke andar Gemini API se full automation ke sath lines translate karein. Key limits rotate and handle auto-delay internally.
                  </p>
                </button>

                {/* MANUAL CARD */}
                <button 
                  onClick={() => setViewState('manual')}
                  className="flex flex-col items-center text-center p-6 bg-[#1E293B] hover:bg-[#3E4C6B]/30 border border-[#3E4C6B]/20 hover:border-[#8B5CF6] rounded-2xl transition-all shadow-lg hover:shadow-purple-950/25 group duration-200"
                >
                  <div className="text-4xl mb-4 transform group-hover:scale-110 transition-transform">📋</div>
                  <span className="text-lg font-bold text-white mb-2">Manual Translate</span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    God-Level custom desi prompts clipboard par copy karein aur manually free limits ke sath Google AI Studio web interface par translate karein.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 2: MANUAL MODE CHANNELS */}
          {viewState === 'manual' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-2">
                <button onClick={() => setViewState('choice')} className="text-indigo-400 text-xs font-bold hover:underline">⬅️ Back to Modes</button>
                <span className="text-xs text-slate-500">/</span>
                <span className="text-xs text-slate-300 font-bold">Manual Desi Prompts</span>
              </div>

              <div className="text-center max-w-md mx-auto space-y-1">
                <p className="text-sm font-bold text-indigo-400">Desi Prompts Ready! 📋</p>
                <p className="text-xs text-slate-400">
                  Select a category to copy prompt with subtitle lines automatically to your clipboard, and click to open Google AI Studio chat:
                </p>
              </div>

              <div className="flex flex-col gap-3 max-w-md mx-auto py-2">
                <button 
                  onClick={() => handleManualPresetClick('anime')}
                  className="w-full bg-[#1e293b] hover:bg-[#238636]/20 border border-slate-800 hover:border-[#238636] text-white py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between"
                >
                  <span>🌸 Desi Anime Localizer Prompt</span>
                  <span>➜</span>
                </button>

                <button 
                  onClick={() => handleManualPresetClick('smut')}
                  className="w-full bg-[#1e293b] hover:bg-[#8B5CF6]/20 border border-slate-800 hover:border-[#8B5CF6] text-white py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between"
                >
                  <span>🔥 Desi Smut Localizer Prompt</span>
                  <span>➜</span>
                </button>

                <button 
                  onClick={() => handleManualPresetClick('hentai')}
                  className="w-full bg-[#1e293b] hover:bg-[#D12938]/20 border border-slate-800 hover:border-[#D12938] text-white py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between"
                >
                  <span>🔞 Desi Hentai Localizer Prompt</span>
                  <span>➜</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: AUTOMATIC SETUP */}
          {viewState === 'auto_setup' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-1">
                <button onClick={() => setViewState('choice')} className="text-indigo-400 text-xs font-bold hover:underline">⬅️ Back to Modes</button>
                <span className="text-xs text-slate-500">/</span>
                <span className="text-xs text-slate-300 font-bold">Auto Translate Config</span>
              </div>

              {/* API Keys Configuration */}
              <div className="bg-[#1E293B] border border-[#3E4C6B]/20 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    🔑 Gemini API Keys (Rotate Multiple Keys)
                  </label>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1">
                    Get Free Keys 🔗
                  </a>
                </div>

                <div className="flex gap-2">
                  <input 
                    type="password" 
                    placeholder="Paste Gemini API Key here" 
                    value={newKeyInput} 
                    onChange={e => setNewKeyInput(e.target.value)}
                    className="flex-1 bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono" 
                  />
                  <button 
                    onClick={handleAddKey}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors shrink-0"
                  >
                    ➕ Add Key
                  </button>
                </div>

                {/* Keys List */}
                {apiKeys.length > 0 ? (
                  <div className="space-y-1.5 pt-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Keys Pool ({apiKeys.length}):</p>
                    <div className="max-h-24 overflow-y-auto space-y-1 custom-scroll pr-1">
                      {apiKeys.map((k, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-[#0F172A] px-3 py-1.5 rounded border border-slate-800 text-xs">
                          <span className="font-mono text-slate-400 text-[11px]">Key #{idx + 1}: ****{k.substring(Math.max(0, k.length - 6))}</span>
                          <button onClick={() => handleRemoveKey(idx)} className="text-rose-400 hover:text-rose-300 font-bold text-[11px] hover:bg-rose-950/20 px-1.5 py-0.5 rounded">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-400 leading-relaxed font-bold">⚠️ Rate limit bypass karne ke liye kam se kam 1-2 free keys add kijiye.</p>
                )}
              </div>

              {/* Model Select */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select AI Model</label>
                  <select 
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full bg-[#1E293B] border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                    <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                    <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                  </select>
                </div>

                {/* Batch Size Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Batch Size (Lines)</label>
                  <input 
                    type="number"
                    value={batchSize}
                    onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 50))}
                    className="w-full bg-[#1E293B] border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Language Selection */}
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Source Language</label>
                  <select 
                    value={sourceLang}
                    onChange={e => setSourceLang(e.target.value)}
                    className="w-full bg-[#1E293B] border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="auto">Auto Detect</option>
                    {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
                  </select>
                </div>

                <div className="text-slate-500 font-bold text-sm pt-4">➜</div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Language</label>
                  <select 
                    value={targetLang}
                    onChange={e => setTargetLang(e.target.value)}
                    className="w-full bg-[#1E293B] border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Prompt Presets / System Instructions */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prompt Style Instruction</label>
                  <div className="flex gap-1">
                    {(['standard', 'anime', 'smut', 'hentai'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => {
                          setSelectedPreset(p);
                          setCustomPrompt(PRESETS[p]);
                        }}
                        className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase transition-colors ${selectedPreset === p ? 'bg-indigo-600 text-white' : 'bg-[#1E293B] text-slate-400 hover:text-white'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea 
                  value={customPrompt}
                  onChange={e => {
                    setCustomPrompt(e.target.value);
                    setSelectedPreset('custom');
                  }}
                  className="w-full h-28 bg-[#1E293B] border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-200 outline-none focus:border-indigo-500 resize-none custom-scroll"
                  placeholder="Paste or write your custom translation engine prompt..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button 
                  onClick={() => setViewState('choice')} 
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleStartAutoTranslate}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-900/30"
                >
                  🚀 Start Auto Translate
                </button>
              </div>
            </div>
          )}

          {/* VIEW 4: AUTO RUNNING RUNNER */}
          {viewState === 'auto_running' && (
            <div className="space-y-5 py-2">
              {/* Status Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin text-xl">⏳</div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Translating Subtitles...</h3>
                    <p className="text-[10px] text-slate-400">Model: <span className="font-mono text-indigo-400">{selectedModel}</span></p>
                  </div>
                </div>
                {errorState ? (
                  <span className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">PAUSED</span>
                ) : (
                  <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-bold animate-pulse">PROCESSING</span>
                )}
              </div>

              {/* Progress Counters */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#1E293B] p-3 rounded-xl border border-slate-800 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Batch Progress</p>
                  <p className="text-sm font-black text-white mt-1">{currentBatch} / {totalBatches}</p>
                </div>
                <div className="bg-[#1E293B] p-3 rounded-xl border border-slate-800 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Lines Processed</p>
                  <p className="text-sm font-black text-white mt-1">{linesProcessed} / {totalLinesToTranslate}</p>
                </div>
                <div className="bg-[#1E293B] p-3 rounded-xl border border-slate-800 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Estimated Time</p>
                  <p className="text-sm font-black text-amber-400 mt-1">{eta}</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Translation Progress</span>
                  <span>{Math.round((linesProcessed / (totalLinesToTranslate || 1)) * 100)}%</span>
                </div>
                <div className="w-full bg-[#1E293B] h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(linesProcessed / (totalLinesToTranslate || 1)) * 100}%` }}
                  />
                </div>
              </div>

              {/* Dialogue & Logs Stream Console */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Live Processing Logs:</p>
                <div className="bg-[#090D16] border border-slate-800/80 rounded-xl p-3 h-48 overflow-y-auto font-mono text-[11px] space-y-1.5 custom-scroll">
                  {progressLogs.map((log, idx) => {
                    let textClass = 'text-slate-300';
                    if (log.type === 'success') textClass = 'text-green-400 font-bold';
                    else if (log.type === 'warn') textClass = 'text-amber-400';
                    else if (log.type === 'error') textClass = 'text-rose-400 font-bold';
                    else if (log.type === 'dialogue') textClass = 'text-indigo-300 text-[10px]';

                    return (
                      <div key={idx} className={`${textClass} break-words`}>
                        {log.message}
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Error UI if paused */}
              {errorState && (
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex flex-col gap-2">
                  <p className="font-bold">⚠️ Translation Paused: {errorState}</p>
                  <p className="text-[10px]">Apne keys pool ko checks karein, standard status code checks rate limits hit ho gaya hai.</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => {
                    cancelRef.current = true;
                    setIsTranslating(false);
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  🛑 Cancel
                </button>
                {errorState && (
                  <button 
                    onClick={handleStartAutoTranslate}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    🔄 Resume Translation
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW 5: COMPLETE */}
          {viewState === 'auto_complete' && (
            <div className="text-center py-6 space-y-5">
              <div className="text-5xl animate-bounce">🎉</div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-white">Direct Translation Complete!</h3>
                <p className="text-xs text-slate-400">
                  Total <span className="font-bold text-indigo-400">{linesProcessed}</span> lines processed and localized securely.
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <button 
                  onClick={onClose}
                  className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
                >
                  Close & View Subtitles
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default TranslateModal;
