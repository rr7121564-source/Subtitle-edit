import { SubtitleData, ParsedLine } from '../types';

// Helper to generate the standard Script Info block dynamically
const generateScriptInfo = (playResX: string, playResY: string, title: string) => `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${playResX}
PlayResY: ${playResY}
YCbCr Matrix: TV.601`;

// --- STYLE GENERATORS WITH DYNAMIC SCALING ---

const EXPORT_MAIN_FONT = "HelveticaRoundedLTStd-BdCn";

// Reference 1080p values: Font 78, Outline 3, Shadow 2, MarginL/R 200, MarginV 65
const generateStyleBody = (scale: number, isItalic: boolean, fontName: string): string => {
  const fontSize = Math.round(78 * scale);
  const outline = Number((3 * scale).toFixed(2));
  const shadow = Number((2 * scale).toFixed(2));
  const marginL = Math.round(200 * scale);
  const marginR = Math.round(200 * scale);
  const marginV = Math.round(65 * scale);
  const italicVal = isItalic ? -1 : 0;

  // Uses specific requested font for ASS Export
  return `${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H60000000,0,${italicVal},0,0,100,100,0,0,1,${outline},${shadow},2,${marginL},${marginR},${marginV},1`;
};

// Logo Reference 1080p: Hermes, 120, Outline 0, Shadow 4, MarginL 15, MarginR 30, MarginV 15 (Alignment 9)
// Style: Logo,Hermes,120,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,0,4,9,15,30,15,1
const generateLogoStyle = (scale: number): string => {
    const fontSize = Math.round(120 * scale);
    const shadow = Number((4 * scale).toFixed(2));
    const marginL = Math.round(15 * scale);
    const marginR = Math.round(30 * scale);
    const marginV = Math.round(15 * scale);
  
    // Changed Font from Hermes to EXPORT_MAIN_FONT
    return `${EXPORT_MAIN_FONT},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,0,${shadow},9,${marginL},${marginR},${marginV},1`;
};

// Credits Reference 1080p: Hermes, 38, Outline 2, Shadow 2, MarginL 5, MarginR 30, MarginV 0 (Alignment 9)
const generateCreditStyle = (scale: number): string => {
    const fontSize = Math.round(38 * scale);
    const outline = Number((2 * scale).toFixed(2));
    const shadow = Number((2 * scale).toFixed(2));
    const marginL = Math.round(5 * scale);
    const marginR = Math.round(30 * scale);
    // MarginV is 0 in reference, but if needed we scale it. Here it is 0.
  
    // Changed Font from Hermes to EXPORT_MAIN_FONT
    return `${EXPORT_MAIN_FONT},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,${outline},${shadow},9,${marginL},${marginR},0,1`;
};

// Default values if not found (1080p)
const REF_RES_X = 1920;
const REF_RES_Y = 1080;

const DEFAULT_FORMAT_LINE = 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

// --- TEXT NORMALIZATION HELPER ---
export const normalizeText = (text: string): string => {
    if (!text) return text;
    
    let normalized = text;
    
    // 1. Remove Zero-Width Characters and other invisibles
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // 2. Normalize Unicode Homoglyphs (Confusables)
    // Common Cyrillic lookalikes as specified in the prompt/layers
    const homoglyphMap: Record<string, string> = {
        'а': 'a', 'е': 'e', 'о': 'o', 'с': 'c', 'р': 'p', 'х': 'x', 'у': 'y', 'і': 'i',
        'А': 'A', 'Е': 'E', 'О': 'O', 'С': 'C', 'Р': 'P', 'Х': 'X', 'У': 'Y', 'І': 'I'
    };
    normalized = normalized.split('').map(char => homoglyphMap[char] || char).join('');
    
    // 3. Normalize Mathematical Alphanumeric Symbols (Fancy fonts) & Composition
    normalized = normalized.normalize('NFKC');

    return normalized;
};

// Helper to convert SRT/VTT time to ASS time (0:00:00.00)
const toAssTime = (timeStr: string): string => {
  if (!timeStr) return '0:00:00.00';
  
  // Normalize separators: change all , to . then split by : and .
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(/[:.]/);
  
  let h = 0, m = 0, s = 0, ms = 0;

  if (parts.length === 4) {
    // HH:MM:SS.mmm
    h = parseInt(parts[0]) || 0;
    m = parseInt(parts[1]) || 0;
    s = parseInt(parts[2]) || 0;
    ms = parseInt(parts[3]) || 0;
  } else if (parts.length === 3) {
    // MM:SS.mmm
    m = parseInt(parts[0]) || 0;
    s = parseInt(parts[1]) || 0;
    ms = parseInt(parts[2]) || 0;
  } else if (parts.length === 2) {
    // SS.mmm
    s = parseInt(parts[0]) || 0;
    ms = parseInt(parts[1]) || 0;
  }

  // Convert ms to centiseconds (ASS uses 2 digits)
  let csStr = "00";
  const rawMsStr = parts[parts.length - 1] || "000";
  if (rawMsStr.length >= 3) {
      csStr = Math.floor(parseInt(rawMsStr.substring(0, 3)) / 10).toString().padStart(2, '0');
  } else {
      csStr = rawMsStr.substring(0, 2).padEnd(2, '0');
  }

  const hh = h.toString();
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  
  return `${hh}:${mm}:${ss}.${csStr}`;
};

// Helper to convert ASS time string to total centiseconds for comparison
const assTimeToCs = (timeStr: string): number => {
    const parts = timeStr.trim().split(':');
    if (parts.length !== 3) return 0;
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const sParts = parts[2].split('.');
    const s = parseInt(sParts[0]);
    const cs = parseInt(sParts[1] || '0');
    return (h * 360000) + (m * 6000) + (s * 100) + cs;
};

// --- AUTOMATION DETECTION HELPER ---
const isAutomationLine = (line: string): boolean => {
    const parts = line.split(',');
    if (parts.length < 10) return false;

    const style = parts[3].trim().toLowerCase();
    
    // Explicitly check for non-dialogue styles
    if (style.includes('image') || style.includes('drawing') || style.includes('fx') || style.includes('karaoke')) return true;

    // Check for vector drawings {\p1}, {\p2} etc. which indicates drawing mode (not text)
    if (/\{\\p[1-9]\}/.test(line)) return true;

    // Check for specific automation tags typically used in Aegisub karaoke/templater {=23}
    if (/\{=\d+\}/.test(line)) return true;

    // Default ASS Structure: Dialogue: Layer, Start, End, Style...
    // Start is index 1, End is index 2
    const startCs = assTimeToCs(parts[1]);
    const endCs = assTimeToCs(parts[2]);
    const durationCs = endCs - startCs;

    // Threshold: 12cs (0.12 seconds). 
    // Animation frames are usually 0.04s (4cs).
    if (durationCs < 12 && line.includes('{')) {
        return true;
    }

    return false;
};

// --- SMART AUTO CPL HELPER ---
const breakTextAtCPL = (text: string, limit: number = 45): string => {
    // 1. Basic Constraints
    if (!text || text.length <= limit) return text;
    // If text already has manual breaks, respect them and don't touch
    if (text.includes('\\N') || text.includes('\\n')) return text; 

    const words = text.trim().split(/\s+/);
    if (words.length <= 1) return text; // Can't split a single long word nicely

    let bestSplitIndex = -1;
    let bestScore = Infinity; 

    let currentLength = 0;
    
    // We iterate through all possible split points (spaces between words)
    for (let i = 0; i < words.length - 1; i++) {
        const word = words[i];
        currentLength += word.length;
        
        // Reconstruct proposed lines
        const line1 = words.slice(0, i + 1).join(' ');
        const line2 = words.slice(i + 1).join(' ');

        // CONSTRAINT 1: Line 1 shouldn't exceed limit if possible
        if (line1.length > limit) {
             break; // Stop looking, previous splits were better
        }

        const len1 = line1.length;
        const len2 = line2.length;
        const diff = len1 - len2;

        // SCORING LOGIC (Lower is better)
        // Base score is absolute difference -> We want BALANCED lines (e.g. 25 chars and 25 chars)
        let score = Math.abs(diff);

        // CONSTRAINT 2: Prefer Top Heavy (Line 1 >= Line 2)
        // If Bottom is heavier (diff < 0), add penalty
        // This ensures "Like father, like son" style splits where possible
        if (diff < 0) {
            score += 20; // Heavy penalty if bottom line is longer than top
        }

        // CONSTRAINT 3: Avoid Orphans (Line 2 too short)
        // If Line 2 is significantly shorter than Line 1 (e.g., < 40% of Line 1), penalty
        // This prevents splitting "Hello world this is a test" into "Hello world this is a" \N "test"
        if (len2 < len1 * 0.4) {
             score += 15; // Penalty for unbalanced orphans
        }

        if (score < bestScore) {
            bestScore = score;
            bestSplitIndex = i;
        }

        currentLength += 1; // Account for space for next word loop
    }

    if (bestSplitIndex !== -1) {
        const part1 = words.slice(0, bestSplitIndex + 1).join(' ');
        const part2 = words.slice(bestSplitIndex + 1).join(' ');

        // Recursive Check: If part2 is STILL massive (e.g. text was 150 chars), break it again
        if (part2.length > limit) {
            return `${part1}\\N${breakTextAtCPL(part2, limit)}`;
        }
        
        return `${part1}\\N${part2}`;
    }

    // Fallback
    return text;
};

export const applyAutoCPL = (lines: string[]): string[] => {
    return lines.map(line => {
      // Find the 9th comma which separates the header from the text in standard ASS Dialogue
      let commaCount = 0;
      let splitIndex = -1;
      for(let i = 0; i < line.length; i++) {
          if(line[i] === ',') {
              commaCount++;
              if(commaCount === 9) {
                  splitIndex = i;
                  break;
              }
          }
      }

      if(splitIndex === -1) return line;

      const prefix = line.substring(0, splitIndex + 1); // Includes the comma
      const rawText = line.substring(splitIndex + 1);
      
      let tagPrefix = '';
      let cleanText = rawText;

      // Basic check: does it start with { ... }?
      const match = rawText.match(/^({[^}]+})/);
      if (match) {
          tagPrefix = match[1];
          cleanText = rawText.substring(match[0].length);
      }
      
      // Clean up multiple spaces
      cleanText = cleanText.replace(/\s+/g, ' ').trim();
      
      // Apply Smart Balanced Logic
      const processedText = breakTextAtCPL(cleanText, 45);
      
      return `${prefix}${tagPrefix}${processedText}`;
    });
};

// --- OVERLAP RESOLVER ---
const resolveOverlaps = (lines: string[]): string[] => {
    // Convert to objects for easier manipulation
    const parsed = lines.map(line => {
        const parts = line.split(',');
        if (parts.length < 10) return { original: line, isValid: false, start: 0, end: 0, parts: [], text: '' };
        
        const start = assTimeToCs(parts[1]);
        const end = assTimeToCs(parts[2]);
        const text = parts.slice(9).join(',');
        
        return { original: line, isValid: true, start, end, parts: parts.slice(0, 9), text };
    });

    for (let i = 1; i < parsed.length; i++) {
        const prev = parsed[i - 1];
        const curr = parsed[i];

        if (prev.isValid && curr.isValid) {
            // Check for overlap: Current starts before Previous ends
            if (curr.start < prev.end) {
                // Check if already has positioning tags
                const hasPos = /\\(pos|an|move)/.test(curr.text);
                if (!hasPos) {
                    curr.text = `{\\an8}${curr.text}`;
                }
            }
        }
    }

    // Reconstruct
    return parsed.map(p => {
        if (!p.isValid) return p.original;
        return `${p.parts.join(',')},${p.text}`;
    });
};

const isSignLine = (line: string): boolean => {
  const lower = line.toLowerCase();
  if (lower.includes('{\\pos') || lower.includes('{\\clip') || lower.includes('{\\move')) return true;
  
  const parts = line.split(',');
  if (parts.length > 3) {
    const style = parts[3].trim().toLowerCase();
    if (style.includes('sign') || style.includes('title') || style.includes('op') || style.includes('ed') || style.includes('logo') || style.includes('credit')) {
      return true;
    }
  }
  return false;
};

// --- DETECT MAIN STYLE FROM EVENTS ---
const detectMainStyleFromEvents = (lines: string[]): string => {
    const styleCounts: Record<string, number> = {};
    let eventSectionFound = false;

    for (const line of lines) {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();

        if (trimmed.startsWith('[')) {
            if (lower.includes('events')) {
                eventSectionFound = true;
                continue;
            } else if (eventSectionFound) {
                // If we hit another section after events, stop
                break;
            }
        }

        if (!eventSectionFound) continue;

        if (lower.startsWith('dialogue:')) {
            // Check if it's a sign
            if (isSignLine(trimmed)) continue;

            const parts = line.split(',');
            if (parts.length > 3) {
                const styleName = parts[3].trim();
                const lowerStyle = styleName.toLowerCase();
                
                // Exclude obvious non-dialogue styles if named clearly
                if (lowerStyle.includes('sign') || lowerStyle.includes('credit') || lowerStyle.includes('op') || lowerStyle.includes('ed')) continue;

                styleCounts[styleName] = (styleCounts[styleName] || 0) + 1;
            }
        }
    }

    // Find the style with max count
    let maxCount = 0;
    let mainStyle = "Default";

    for (const [name, count] of Object.entries(styleCounts)) {
        if (count > maxCount) {
            maxCount = count;
            mainStyle = name;
        }
    }

    // Fallback logic: if no events, default to 'Default'
    return mainStyle;
};

const extractEpisodeNumber = (fileName: string): string => {
    const fullFileName = fileName.replace(/\.[^/.]+$/, "");
    // First try to match a number at the very end of the string, optionally preceded by a hyphen or "ep"
    const endMatch = fullFileName.match(/(?:-\s*|ep?\s*|episode\s*|^)(\d+)\s*$/i);
    if (endMatch) {
        return endMatch[1];
    }
    // Fallback to older regex
    const epMatch = fullFileName.match(/(?:ep?|episode)[ ._-]*(\d+)/i) || fullFileName.match(/[ ._-](\d+)(?:[ ._-]|$)/);
    return epMatch ? epMatch[1] : "NA";
};

const cleanSRT = (raw: string): string => {
  const removeTags = (text: string) => {
    return text
      .replace(/<[^>]+>/g, '')        // remove HTML tags
      .replace(/\{[^}]+\}/g, '');     // remove ASS tags
  };

  const normalizeText = (text: string) => {
    return text
      .replace(/\\N/g, '\n')          // ASS line breaks → normal
      .replace(/\r/g, '')
      .replace(/\n+/g, '\n')
      .trim();
  };

  const fixTime = (t: string) => {
    // User provided . but meant \. for 00:00:00.000 -> 00:00:00,000
    return t.replace(/\./g, ',');
  };

  const normalizedRaw = raw.replace(/\r/g, '');
  // Split by double newline, but handle potential variations
  let blocks = normalizedRaw.split(/\n\s*\n/);

  let cleaned = blocks.map(block => {
    let lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length < 2) return null;

    // Find time line
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx === -1) return null;

    let time = fixTime(lines[timeIdx]);
    let text = lines.slice(timeIdx + 1).join('\n');
    text = removeTags(text);
    text = normalizeText(text);

    if (!text.trim()) return null;

    return { time, text };
  }).filter(Boolean) as { time: string, text: string }[];

  // reindex
  return cleaned.map((s, i) => 
    `${i + 1}\n${s.time}\n${s.text}`
  ).join("\n\n");
};

export const parseSubtitleContent = (content: string, fileName: string, config?: { teamName: string, telegram: string, subbedBy: string, logoText: string }): SubtitleData => {
  const isAss = fileName.toLowerCase().endsWith('.ass');
  const lines = content.split(/\r\n|\n|\r/);

  // Default Config with individual field fallbacks
  const finalConfig = {
    teamName: config?.teamName || 'Team Ipx',
    telegram: config?.telegram || '@ipxempire',
    subbedBy: config?.subbedBy || 'RILU',
    logoText: config?.logoText || 'Indian Project X'
  };

  // 1. Determine Resolution & Scale Factor
  let playResX = REF_RES_X.toString();
  let playResY = REF_RES_Y.toString();
  let scale = 1;
  let existingTitle = "";

  if (isAss) {
      // Find Resolution to calculate scale
      const resYMatch = content.match(/PlayResY:\s*(\d+)/i);
      const resXMatch = content.match(/PlayResX:\s*(\d+)/i);
      const titleMatch = content.match(/Title:\s*(.*)/i);

      if (resYMatch) {
          playResY = resYMatch[1];
          scale = parseInt(playResY) / REF_RES_Y;
      }
      if (resXMatch) {
          playResX = resXMatch[1];
      }
      if (titleMatch) {
          existingTitle = titleMatch[1].trim();
      }
  }

  // ... existing title match ...
  const finalTitle = existingTitle || fileName.replace(/\.[^/.]+$/, "");
  const episodeNum = extractEpisodeNumber(fileName);

  // Generate Scaled Style Bodies with HELVETICA ROUNDED
  const scaledMainStyle = generateStyleBody(scale, false, EXPORT_MAIN_FONT);
  const scaledItalicStyle = generateStyleBody(scale, true, EXPORT_MAIN_FONT);
  
  // Logos and Credits
  const scaledCreditsStyle = generateCreditStyle(scale);
  const scaledLogoStyle = generateLogoStyle(scale);

  // --- DETECT MAIN STYLE FROM EVENTS FIRST ---
  const detectedMainStyleName = isAss ? detectMainStyleFromEvents(lines) : "Default";

  // TRACK MAX DURATION
  let maxEndTimeStr = "0:00:00.00";
  let maxEndTimeCs = 0;

  if (isAss) {
    // Determine Max Time for ASS files if config is present and we're injecting
    const events = content.split(/\[Events\]/i)[1];
    if (events) {
        const dialogueLines = events.split(/\r\n|\n/).filter(l => l.trim().startsWith('Dialogue:'));
        for (const line of dialogueLines) {
            const parts = line.split(',');
            if (parts.length >= 3) {
                const end = parts[2].trim();
                const cs = assTimeToCs(end);
                if (cs > maxEndTimeCs) {
                    maxEndTimeCs = cs;
                    maxEndTimeStr = end;
                }
            }
        }
    }
  }

  // === INJECTION LOGIC (RUNS FOR ALL IF CONFIG PROVIDED) ===
  const logoFontSize = Math.round(67.5 * scale); // 18 at 288p
  const thanksFontSize = Math.round(82.5 * scale); // 22 at 288p
  
  const getInjectionLines = (mainDl: string[], endStr: string, mainStyle: string = "Default") => {
    let thanksStart = endStr;
    let thanksEnd = endStr;
    if (mainDl.length >= 2) {
        const lastLine = mainDl[mainDl.length - 1];
        const prevLine = mainDl[mainDl.length - 2];
        const lastParts = lastLine.split(',');
        const prevParts = prevLine.split(',');
        if (lastParts.length >= 10 && prevParts.length >= 10) {
            thanksStart = prevParts[1];
            thanksEnd = lastParts[2];
        }
    }

    return [
       `Dialogue: 1,0:00:00.00,${endStr},Credits,,0,0,0,,{\\an1}SUBBED BY : {\\c&H00D7FF&}${finalConfig.subbedBy}`, 
       `Dialogue: 0,0:00:00.00,0:00:05.00,${mainStyle},,0,0,0,,{\\an5}Hindi Subtitles by\\N{\\b1}${finalConfig.teamName.toUpperCase()}{\\b0}`,
       `Dialogue: 0,0:00:05.00,0:00:10.00,${mainStyle},,0,0,0,,{\\an5}Join for more updates:\\N{\\c&H00D7FF&}${finalConfig.telegram}`,
       `Dialogue: 0,0:00:00.00,${endStr},Logo,,0,0,0,,{\\an9\\fs${logoFontSize}\\bord1\\shad0\\alpha&H80&}{\\c&HFFFFFF&}${finalConfig.logoText}`,
       `Dialogue: 0,0:10:00.00,0:10:10.00,${mainStyle},,0,0,0,,{\\an5}This is a fan-subbed release.\\NWe do not own this content.\\NSupport the original creators.`,
       `Dialogue: 0,0:10:10.00,0:10:16.00,${mainStyle},,0,0,0,,{\\an5}Do not re-upload without permission.\\NUnauthorized uploads = theft.`,
       `Dialogue: 0,${thanksStart},${thanksEnd},${mainStyle},,0,0,0,,{\\an5\\fs${thanksFontSize}}Thanks for watching!\\N{\\c&H00D7FF&}${finalConfig.teamName.toUpperCase()}`
    ];
  };

  if (!isAss) {
    // === CONVERSION LOGIC FOR SRT/VTT/TXT ===
    const mainDialogues: string[] = [];
    const isSrtOrVtt = /-->/.test(content);
    
    if (isSrtOrVtt) {
      // Apply requested cleanSRT logic first
      const cleanedSrt = cleanSRT(content);
      
      // Split cleaned SRT into blocks
      const blocks = cleanedSrt.split('\n\n');

      for (const block of blocks) {
        const blockLines = block.split('\n');
        if (blockLines.length >= 3) {
          const startTimeMatch = blockLines[1].match(/(\d+[:\d+]*[,.]\d+)\s*-->\s*(\d+[:\d+]*[,.]\d+)/);
          if (startTimeMatch) {
            const startTime = startTimeMatch[1];
            const endTime = startTimeMatch[2];
            const text = blockLines.slice(2).join('\\N');
            
            const assStart = toAssTime(startTime);
            const assEnd = toAssTime(endTime);
            mainDialogues.push(`Dialogue: 0,${assStart},${assEnd},${detectedMainStyleName},,0,0,0,,${text}`);
            
            // Track Max Time
            const currentEndCs = assTimeToCs(assEnd);
            if (currentEndCs > maxEndTimeCs) {
                maxEndTimeCs = currentEndCs;
                maxEndTimeStr = assEnd;
            }
          }
        }
      }

      // Final fallback
      if (mainDialogues.length === 0) {
          for (const line of lines) {
              if (!line.trim() || line.includes('-->') || /^\d+$/.test(line.trim())) continue;
              const clean = line.replace(/<[^>]+>/g, '').trim();
              if (clean) {
                  mainDialogues.push(`Dialogue: 0,0:00:00.00,0:00:05.00,${detectedMainStyleName},,0,0,0,,${clean}`);
              }
          }
      }
    } else {
      let currentTime = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const start = `0:00:${String(currentTime % 60).padStart(2, '0')}.00`;
        const end = `0:00:${String((currentTime + 5) % 60).padStart(2, '0')}.00`;
        mainDialogues.push(`Dialogue: 0,${start},${end},${detectedMainStyleName},,0,0,0,,${line.trim()}`);
        maxEndTimeStr = end;
        currentTime += 5;
      }
    }
    
    const finalSigns = getInjectionLines(mainDialogues, maxEndTimeStr, detectedMainStyleName);

    const defaultStyles = `[V4+ Styles]
${DEFAULT_FORMAT_LINE}
Style: Default,${scaledMainStyle}
Style: Alternate,${scaledItalicStyle}
Style: Overlap,${scaledMainStyle}
Style: Credits,${scaledCreditsStyle}
Style: Logo,${scaledLogoStyle}`;

    let finalMainDialogues = applyAutoCPL(mainDialogues.length > 0 ? mainDialogues : ['Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,No dialogue found']);
    finalMainDialogues = resolveOverlaps(finalMainDialogues);

    return {
      originalFileName: fileName.replace(/\.(srt|vtt|txt)$/i, '.ass'),
      raw: content,
      scriptInfo: generateScriptInfo(playResX, playResY, finalTitle),
      styles: defaultStyles,
      formatLine: 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      eventComments: [],
      mainDialogues: finalMainDialogues,
      signDialogues: finalSigns,
      hiddenEvents: [],
      episodeNum
    };
  }

  // === EXISTING ASS PARSING LOGIC ===
  let section = '';
  const styleLines: string[] = [];
  let formatLine = '';
  const eventComments: string[] = [];
  const mainDialogues: string[] = [];
  const signDialogues: string[] = [];
  const hiddenEvents: string[] = []; // Store spam lines

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    
    if (trimmed.startsWith('[')) {
      if (lower.includes('script info')) section = 'script';
      else if (lower.includes('styles')) section = 'styles';
      else if (lower.includes('events')) section = 'events';
      else section = 'unknown';
      
      if (section === 'styles') styleLines.push(line);
      continue;
    }

    if (section === 'script') {
       // Ignore, we regenerate Script Info but now we extract title from it above
    }
    else if (section === 'styles') {
       if (lower.startsWith('style:')) {
           const firstComma = line.indexOf(',');
           if (firstComma !== -1) {
               const prefix = line.substring(0, firstComma); // "Style: Name"
               const styleName = prefix.substring(6).trim(); // "Name"
               const styleNameLower = styleName.toLowerCase();
               
               // Filter out Logo and Credits - we will add new ones later
               if (styleNameLower === 'logo' || styleNameLower === 'credits' || styleNameLower === 'credit') {
                   continue; 
               }

               const styleParts = line.split(',');
               const isItalicInDef = styleParts.length > 8 && (styleParts[8].trim() === '-1' || styleParts[8].trim() === '1');
               const isAlt = ['alternate', 'alt', 'alternative', 'thought', 'thoughts', 'italic', 'italics', 'internal', 'thinking', 'overlap'].includes(styleNameLower) || isItalicInDef;

               // APPLY STYLES BASED ON DETECTED MAIN STYLE
               // If this style matches the Detected Main Style Name, FORCE it to be our Standard Main Style
               if (styleName === detectedMainStyleName) {
                   styleLines.push(`Style: ${styleName},${scaledMainStyle}`); 
               } 
               else if (isAlt) {
                   styleLines.push(`Style: ${styleName},${scaledItalicStyle}`);
               } 
               // Also handle case where "Default" is defined but NOT the detected main style, 
               // we might still want to style it properly just in case it's used sporadically.
               else if (styleNameLower === 'default') {
                   styleLines.push(`Style: ${styleName},${scaledMainStyle}`); 
               }
               else {
                   // Keep original style for unknown things (like specific signs)
                   // BUT change the font to EXPORT_MAIN_FONT
                   if (styleParts.length > 2) {
                       styleParts[1] = EXPORT_MAIN_FONT;
                       styleLines.push(styleParts.join(','));
                   } else {
                       styleLines.push(line);
                   }
               }
           } else {
               styleLines.push(line);
           }
       } else if (lower.startsWith('format:')) {
           styleLines.push(DEFAULT_FORMAT_LINE);
       }
    }
    else if (section === 'events') {
      if (lower.startsWith('format:')) {
        formatLine = line;
      } 
      // Capture both Dialogue and Comment
      else if (lower.startsWith('dialogue:') || lower.startsWith('comment:')) {
        // Check for existing credits to remove
        if (lower.includes('encoded by') || lower.includes('subbed by') || lower.includes('credits') || lower.includes('hentai')) {
            continue; // Skip/Remove existing credits/logo
        }
        
        const isComment = lower.startsWith('comment:');
        const parts = line.split(',');
        const textContent = parts.slice(9).join(',').trim();

        // CHECK FOR AUTOMATION / HIDDEN LINES / COMMENTS / EMPTY LINES
        if (isAutomationLine(trimmed) || isComment || !textContent) {
            hiddenEvents.push(line);
            continue; // Skip processing for main/sign
        }

        let processedLine = line;
        
        if (parts.length > 3) {
            // Check End Time for Max Calculation (Index 2)
            const endTime = parts[2].trim();
            const currentEndCs = assTimeToCs(endTime);
            if (currentEndCs > maxEndTimeCs) {
                maxEndTimeCs = currentEndCs;
                maxEndTimeStr = endTime;
            }

            const currentStyle = parts[3].trim();
            // EVENT FIX: If the event uses "Default" but the detected main style is something else (e.g. "Hardsub"),
            // Switch this event to use "Hardsub" so it inherits the correct main style we defined above.
            if (currentStyle.toLowerCase() === 'default' && detectedMainStyleName !== 'Default') {
                parts[3] = detectedMainStyleName;
            }
            
            // Replace \fn tags in the text content (index 9 onwards)
            if (parts.length > 9) {
                let textContent = parts.slice(9).join(',');
                textContent = textContent.replace(/\\fn[^\\}]+/g, `\\fn${EXPORT_MAIN_FONT}`);
                parts.splice(9, parts.length - 9, textContent);
            }
            
            processedLine = parts.join(',');
        }

        const isSign = isSignLine(trimmed);
        if (isSign) {
          signDialogues.push(processedLine);
        } else {
          mainDialogues.push(processedLine);
        }
      } else if (trimmed !== '') {
        // Fallback for weird lines, put in hidden to be safe and clean
        hiddenEvents.push(line);
      }
    }
  }

  // UPDATE: Only apply Auto CPL and Overlap Logic if it's NOT an existing ASS file
  // This preserves alignments like \an2 in pre-existing files
  let finalMainDialogues = mainDialogues;
  let finalSigns = signDialogues;
  
  if (!isAss) {
      finalMainDialogues = applyAutoCPL(finalMainDialogues);
      finalMainDialogues = resolveOverlaps(finalMainDialogues);
  } else if (config) {
      // For existing ASS files, if config is provided, inject the credits/logo
      const injected = getInjectionLines(mainDialogues, maxEndTimeStr, detectedMainStyleName);
      finalSigns = [...signDialogues, ...injected];

      // Ensure credits/logo styles are present for injection
      if (!styleLines.some(l => l.includes('Style: Credits'))) {
          styleLines.push(`Style: Credits,${scaledCreditsStyle}`);
      }
      if (!styleLines.some(l => l.includes('Style: Logo'))) {
          styleLines.push(`Style: Logo,${scaledLogoStyle}`);
      }
  }

  const finalStyles = styleLines.join('\n');

  return {
    originalFileName: fileName,
    raw: content,
    scriptInfo: generateScriptInfo(playResX, playResY, finalTitle), 
    styles: finalStyles,
    formatLine: formatLine || 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    eventComments: eventComments || [], 
    mainDialogues: finalMainDialogues,
    signDialogues: finalSigns,
    hiddenEvents,
    episodeNum
  };
};

export const rebuildSubtitleContent = (data: SubtitleData): string => {
    let fileContent = "";

    // SCRIPT INFO
    if (data.scriptInfo) {
        fileContent += data.scriptInfo.trim() + "\n\n";
    }

    // STYLES
    if (data.styles) {
        fileContent += data.styles.trim() + "\n\n";
    }

    // EVENTS
    fileContent += "[Events]\n";
    if (data.formatLine) {
        fileContent += data.formatLine.trim() + "\n";
    }

    // Comments
    if (data.eventComments && data.eventComments.length > 0) {
        fileContent += data.eventComments.join('\n') + "\n";
    }

    // Dialogues (Signs + Main + Hidden)
    const signs = data.signDialogues || [];
    const main = data.mainDialogues || [];
    const hidden = data.hiddenEvents || [];
    
    // We combine all of them to ensure nothing is lost during export
    const allLines = [...signs, ...main, ...hidden];
    
    if (allLines.length > 0) {
        fileContent += allLines.join('\n');
    }

    return fileContent;
};
