import { GoogleGenAI, Type, Schema } from "@google/genai";

// Standard prompt for transcription
export const NORMAL_PROMPT = `Task: Generate subtitles for this media (Audio or Video) in SRT format.
Rules:
1. Output ONLY standard SRT format.
2. Listen to the audio closely and transcribe dialogue.
3. Keep the original language of the video.
4. Timestamps must be accurate to the spoken words.
5. Do not include any conversational text or markdown, just the SRT block.`;

/**
 * Transcribes media using streaming to provide real-time updates.
 */
export const transcribeMediaStream = async (
  apiKey: string,
  base64Data: string,
  mimeType: string,
  onProgress: (lines: number, textChunk: string) => void
): Promise<{ srt: string }> => {
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // UPDATED: Use 2.5 Flash Lite for Free Tier Stability
  const model = 'gemini-2.5-flash-lite-preview-02-05'; 

  const responseStream = await ai.models.generateContentStream({
    model: model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: NORMAL_PROMPT },
          { inlineData: { mimeType: mimeType, data: base64Data } }
        ]
      }
    ],
    config: {
        responseMimeType: "text/plain"
    }
  });

  let fullText = '';
  let lineCount = 0;

  for await (const chunk of responseStream) {
    const chunkText = chunk.text || '';
    fullText += chunkText;
    
    // Estimate lines based on timestamp patterns in the chunk
    // SRT format: 00:00:00,000 --> 00:00:00,000
    const matches = chunkText.match(/\d{2}:\d{2}:\d{2}/g);
    if (matches) {
        // Each dialogue has 2 timestamps (start/end), so roughly matches/2
        lineCount += matches.length / 2; 
        onProgress(Math.floor(lineCount), chunkText);
    }
  }

  return { srt: fullText };
};

// Keep the old one for backward compatibility if needed
export const transcribeMedia = async (apiKey: string, base64Data: string, mimeType: string): Promise<{ srt: string }> => {
  const ai = new GoogleGenAI({ apiKey: apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-preview-02-05',
    contents: [
      {
        parts: [
          { text: "Transcribe audio to SRT. Output ONLY SRT." },
          { inlineData: { data: base64Data, mimeType: mimeType } }
        ]
      }
    ]
  });
  return { srt: response.text || '' };
};

// --- NEW TRANSLATION SERVICE ---

const TRANSLATION_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING }
};

interface TranslationConfig {
  apiKey: string;
  model: string;
  targetLang: string;
  prompt: string;
  glossary: { original: string; translated: string }[];
  batchSize: number;
  useLessEnglish: boolean;
}

export interface TranslationStats {
    progress: number;
    processed: number;
    total: number;
    batchIdx: number;
    totalBatches: number;
    lastText: string;
    currentBatchLines: string[]; // NEW: To show exact lines in UI
}

const HINGLISH_ANIME_PROMPT = `Role :- Tum ek professional anime subtitle translator ho jo (.ass, .srt, .vtt) files ko kisi bhi language se natural, emotional, and smooth Hinglish.
Focus on anime-style feel — dialogues should sound casual, expressive, and real, not word-to-word stiff translation.
Use “Mai” for “I” and “Tum” for “You”. No overuse of English words — sirf common aur natural lagne wale English words hi rakho.
Maintain character mood and scene ka emotion.

Tone :-
1. Dialogue natural, human-like, short aur real-life chat flow me ho.
2. Background sounds (ahh, mmh, hmm) wahi rehne do.
3. Over-literal translation avoid karo, tone impact maintain karo.
4. Timeline/subtitle format bilkul preserve karna (number aur timing change mat karna).

Guidelines :-
1. Dialogue ko natural Hinglish flow me rakhna, jaise real life baat-cheet ho.
2. Timeline ya subtitle format bilkul change mat karna.
3. Har line apni jagah par rahe, merge mat karna.
4. Background sounds (ahh, hmm, etc.) ko wahi rakhna agar wo already given ho.
5. Character ki personality aur mood preserve karo (tsundere thoda rude + cute tone, senpai thoda formal, etc.).
6. Over-literal translation avoid karo.
7. Translate jitna ho sake chota karna
8. Output structure = pichle output ke identical.
9. Gender mistakes forbidden.

📌 Word Style (Common English Words jo rakhe jaa sakte hain):
I'm sorry  - mujhe maaf karna
Sorry - maaf karna
Thanks / thank you - shukriya 
Good morning - good morning 
Good night - good night 
Love - Pyaar / Love (scene ke mood pe depend)

OUTPUT RULES:
1. Har subtitle line apni jagah pe rahe, merge mat karna.
2. Translation **human-like + natural**.
3. Background sounds preserve karo.
4. Timeline / subtitle numbering bilkul same rakho.

EXTRA INSTRUCTIONS:
1. Chhote aur impactful dialogue bana ke translate karo.`;

const getGenericPrompt = (targetLang: string) => `TASK: TRANSLATE SUBTITLES TO ${targetLang.toUpperCase()} ONLY.

Role: You are a professional anime subtitle translator converting subtitles into natural, emotional, and smooth ${targetLang}.
You must STRICTLY translate into ${targetLang}. Do NOT use Hinglish or any other language unless the target language is specifically Hinglish.

Focus on anime-style feel — dialogues should sound casual, expressive, and real, not stiff word-for-word translations.
Maintain character mood and scene emotion.

Tone:
1. Dialogues must be natural, human-like, short, and flow like real-life conversation in ${targetLang}.
2. Preserve background sounds (ahh, mmh, hmm) as they are.
3. Avoid over-literal translation; maintain the impact of the tone.

Guidelines:
1. Keep the dialogue flow natural in ${targetLang}.
2. Strictly preserve the timeline/subtitle format.
3. Do not merge lines.
4. Preserve background sounds.
5. Capture character personality (tsundere, formal, etc.).
6. Translate as concisely as possible.
7. Output structure must be identical to input.

OUTPUT RULES:
1. Each subtitle line must remain in its place.
2. Translation must be human-like and natural in ${targetLang}.
3. Preserve background sounds.`;

// Helper delay function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const translateSubtitlesBatch = async (
  lines: string[], 
  config: TranslationConfig,
  onProgress: (stats: TranslationStats) => void,
  signal?: AbortSignal
): Promise<string[]> => {
  // Ensure we use the provided API Key
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  
  // Use user defined batch size or default to 25 (Safer for Free Tier)
  const BATCH_SIZE = config.batchSize || 25;
  const totalBatches = Math.ceil(lines.length / BATCH_SIZE);
  const translatedLines: string[] = [];

  // Free Tier Rate Limit Safeguard: ~15 RPM = 4 seconds per request. 
  // We use 4500ms to be safe.
  const FREE_TIER_DELAY_MS = 4500;

  // Prepare Glossary Text
  const glossaryText = config.glossary.length > 0 
      ? "GLOSSARY (Strictly follow these mappings):\n" + config.glossary.map(g => `${g.original} -> ${g.translated}`).join('\n')
      : "No specific glossary.";

  // Less English Instruction
  // DISABLE if target is English to avoid confusion
  const isTargetEnglish = config.targetLang.toLowerCase() === 'english' || config.targetLang.toLowerCase() === 'en';
  const lessEnglishInstruction = (config.useLessEnglish && !isTargetEnglish)
    ? `STRICT RULE: MINIMIZE ENGLISH.
       Translate the entire sentence into the target language grammar and vocabulary.
       EXCEPTION: Keep ONLY very common daily-use English words (e.g., 'Car', 'Game', 'Phone', 'Ok', 'Bye', 'School', 'Doctor') as is.
       Do NOT use English for verbs, feelings, or complex descriptions. Use the target language for those.` 
    : "";

  // Determine which prompt to use
  let basePrompt = "";
  if (config.prompt && config.prompt.trim() !== '') {
      basePrompt = `USER CUSTOM INSTRUCTION: ${config.prompt}`;
  } else {
      if (config.targetLang.toLowerCase() === 'hinglish') {
          basePrompt = HINGLISH_ANIME_PROMPT;
      } else {
          basePrompt = getGenericPrompt(config.targetLang);
      }
  }

  const systemInstruction = `
IMPORTANT: You MUST translate the text into ${config.targetLang}.
Ignore previous instructions if they conflict with the Target Language.

${basePrompt}

TARGET LANGUAGE: ${config.targetLang}

${glossaryText}
${lessEnglishInstruction}

RULES:
1. Translate the input array of subtitle texts line by line.
2. Return a JSON Array of strings.
3. The length of the output array MUST match the input array exactly.
4. Preserve any ASS tags (like {\\an8}, {\\i1}) exactly as they are.
5. Maintain the tone and intensity of the original text.
6. STRICTLY follow the Glossary if provided.
  `;

  // Process in Batches
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
      }

      // --- SMART DELAY FOR FREE TIER ---
      // If not the first batch, wait to respect RPM limits
      if (i > 0) {
          await delay(FREE_TIER_DELAY_MS);
      }
      
      // Double check abort after delay
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const batch = lines.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE);
      const currentBatchIdx = batchIndex + 1;
      
      try {
          // --- PRIMARY ATTEMPT ---
          let response = await ai.models.generateContent({
              model: config.model,
              contents: [
                  {
                      role: 'user',
                      parts: [
                          { text: `INPUT ARRAY TO TRANSLATE:\n${JSON.stringify(batch)}` }
                      ]
                  }
              ],
              config: {
                  systemInstruction: systemInstruction, 
                  responseMimeType: "application/json",
                  responseSchema: TRANSLATION_SCHEMA,
                  temperature: 0.3
              }
          });

          const jsonText = response.text || '[]';
          let result: string[] = [];
          
          try {
              const cleanJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
              result = JSON.parse(cleanJson);
          } catch (e) {
               // JSON Parse failed, let's trigger fallback or handle text
               throw new Error("JSON Parse Failed");
          }

          if (Array.isArray(result) && result.length === batch.length) {
              translatedLines.push(...result);
          } else {
              throw new Error("Length Mismatch");
          }

          // Progress update logic...
          const processedCount = Math.min(lines.length, i + BATCH_SIZE);
          const progress = Math.min(100, Math.round((currentBatchIdx / totalBatches) * 100));
          onProgress({ progress, processed: processedCount, total: lines.length, batchIdx: currentBatchIdx, totalBatches, lastText: "", currentBatchLines: result });

      } catch (err: any) {
          console.warn(`Batch ${batchIndex} failed with ${config.model}. Attempting fallback...`, err);
          
          // --- FALLBACK ATTEMPT (Gemini 2.5 Flash Lite + No Schema) ---
          // Use this if primary model (like 3.0 Pro) fails or isn't found
          try {
             // Add extra delay before retry to handle rate limits
             await delay(2000); 

             const fallbackResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-lite-preview-02-05',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: systemInstruction },
                            { text: `INPUT ARRAY TO TRANSLATE:\n${JSON.stringify(batch)}\n\nOUTPUT STRICT JSON ARRAY:` }
                        ]
                    }
                ],
                config: {
                    responseMimeType: "text/plain", // Relaxed mime type
                    temperature: 0.3
                }
             });

             const fbText = fallbackResponse.text || '[]';
             let fbResult: string[] = [];
             
             try {
                const cleanFb = fbText.replace(/```json/g, '').replace(/```/g, '').trim();
                fbResult = JSON.parse(cleanFb);
             } catch(e) {
                 // Even fallback failed JSON, use raw batch
                 fbResult = batch;
             }

             // Handle Length Mismatch in Fallback
             if (!Array.isArray(fbResult) || fbResult.length !== batch.length) {
                 const fixed = batch.map((orig, idx) => fbResult[idx] || orig);
                 fbResult = fixed;
             }

             translatedLines.push(...fbResult);
             
             // Update Progress with Fallback Data
             const processedCount = Math.min(lines.length, i + BATCH_SIZE);
             const progress = Math.min(100, Math.round((currentBatchIdx / totalBatches) * 100));
             onProgress({ progress, processed: processedCount, total: lines.length, batchIdx: currentBatchIdx, totalBatches, lastText: `Recovered with 2.5 Flash Lite`, currentBatchLines: fbResult });

          } catch (fallbackErr) {
             // If error is serious (like API Key invalid), rethrow so UI can catch it
             if (err.message.includes("API key") || err.message.includes("403")) {
                 throw err;
             }
             
             // FINAL FAILSAFE: Return original batch so process doesn't stop totally if just one batch failed
             translatedLines.push(...batch);
             const processedCount = Math.min(lines.length, i + BATCH_SIZE);
             const progress = Math.min(100, Math.round((currentBatchIdx / totalBatches) * 100));
             onProgress({ progress, processed: processedCount, total: lines.length, batchIdx: currentBatchIdx, totalBatches, lastText: `Error: ${err.message}`, currentBatchLines: batch.map(l => "[FAILED] " + l) });
          }
      }
  }

  return translatedLines;
};