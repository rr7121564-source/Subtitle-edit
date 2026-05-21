

import { inflate } from 'pako';

// A robust, streaming MKV (Matroska) parser to extract subtitles in browser.
// Supports large files and Zlib compression.

interface TrackInfo {
  number: number;
  type: number; // 17 = subtitle
  codecId: string;
  name?: string;
  language?: string;
  codecPrivate?: Uint8Array; // Header info for ASS
  compression?: {
    algo: number; // 0: zlib, 3: header stripping
    settings?: Uint8Array;
  };
}

export interface MkvTrack {
    number: number;
    name: string;
    language: string;
    codecId: string;
}

interface SubtitleEvent {
  trackNumber: number;
  timeMs: number;
  durationMs: number;
  text: string;
}

class StreamReader {
    private file: File;
    private offset: number = 0;
    private buffer: Uint8Array;
    private bufferStart: number = 0;
    private bufferSize: number = 2 * 1024 * 1024; // 2MB buffer

    constructor(file: File) {
        this.file = file;
        this.buffer = new Uint8Array(0);
    }

    async ensure(length: number): Promise<boolean> {
        if (this.offset + length <= this.bufferStart + this.buffer.length) {
            return true;
        }
        
        // If requesting beyond file size
        if (this.offset >= this.file.size) return false;

        // Read new chunk
        const readStart = this.offset;
        const readEnd = Math.min(this.file.size, readStart + Math.max(this.bufferSize, length));
        const blob = this.file.slice(readStart, readEnd);
        const buffer = await blob.arrayBuffer();
        
        this.buffer = new Uint8Array(buffer);
        this.bufferStart = readStart;
        return true;
    }

    async readByte(): Promise<number> {
        if (!await this.ensure(1)) return -1;
        const val = this.buffer[this.offset - this.bufferStart];
        this.offset++;
        return val;
    }

    async readBytes(length: number): Promise<Uint8Array | null> {
        if (!await this.ensure(length)) return null;
        const start = this.offset - this.bufferStart;
        const val = this.buffer.slice(start, start + length);
        this.offset += length;
        return val;
    }
    
    // Peek without moving offset
    async peekByte(): Promise<number> {
        if (!await this.ensure(1)) return -1;
        return this.buffer[this.offset - this.bufferStart];
    }

    skip(length: number) {
        this.offset += length;
    }

    seek(pos: number) {
        this.offset = pos;
        // Invalidate buffer if seek is outside current buffer
        if (pos < this.bufferStart || pos >= this.bufferStart + this.buffer.length) {
            this.buffer = new Uint8Array(0);
            this.bufferStart = pos;
        }
    }

    getPosition() {
        return this.offset;
    }
    
    getSize() {
        return this.file.size;
    }
}

// Read Element ID (Keeps the marker bit)
const readElementId = async (reader: StreamReader): Promise<{ value: number; length: number }> => {
  const startPos = reader.getPosition();
  const byte = await reader.readByte();
  if (byte === -1) return { value: -1, length: 0 };
  
  let length = 0;
  if (byte & 0x80) length = 1;
  else if (byte & 0x40) length = 2;
  else if (byte & 0x20) length = 3;
  else if (byte & 0x10) length = 4;
  else return { value: -1, length: 0 }; 

  let value = byte;
  for (let i = 1; i < length; i++) {
    const nextByte = await reader.readByte();
    if (nextByte === -1) return { value: -1, length: 0 };
    value = (value * 256) + nextByte;
  }

  return { value, length };
};

// Read Data Size (Strips the marker bit) aka VINT
const readVint = async (reader: StreamReader): Promise<{ value: number; length: number }> => {
  const byte = await reader.readByte();
  if (byte === -1) return { value: -1, length: 0 };

  let length = 0;
  let mask = 0;

  if (byte & 0x80) { length = 1; mask = 0x7F; }
  else if (byte & 0x40) { length = 2; mask = 0x3F; }
  else if (byte & 0x20) { length = 3; mask = 0x1F; }
  else if (byte & 0x10) { length = 4; mask = 0x0F; }
  else if (byte & 0x08) { length = 5; mask = 0x07; }
  else if (byte & 0x04) { length = 6; mask = 0x03; }
  else if (byte & 0x02) { length = 7; mask = 0x01; }
  else if (byte & 0x01) { length = 8; mask = 0x00; }
  else return { value: -1, length: 0 };

  let value = byte & mask;
  for (let i = 1; i < length; i++) {
    const nextByte = await reader.readByte();
    if (nextByte === -1) return { value: -1, length: 0 };
    value = (value * 256) + nextByte;
  }

  return { value, length };
};

const readString = (bytes: Uint8Array): string => {
  const str = new TextDecoder('utf-8').decode(bytes);
  return str.replace(/\0/g, '').trim();
};

// Helper to format time (ms) to ASS format (h:mm:ss.cc)
const formatAssTime = (ms: number): string => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
};

export const getMkvSubtitleTracks = async (file: File): Promise<MkvTrack[]> => {
    try {
        const reader = new StreamReader(file);
        const fileSize = file.size;
        const tracks: TrackInfo[] = [];

        // EBML IDs
        const ID_SEGMENT = 0x18538067;
        const ID_TRACKS = 0x1654AE6B;
        const ID_TRACKENTRY = 0xAE;
        const ID_TRACKNUMBER = 0xD7;
        const ID_TRACKTYPE = 0x83;
        const ID_CODECID = 0x86;
        const ID_TRACKNAME = 0x536E;
        const ID_TRACKLANG = 0x22B59C;
        const ID_TRACKLANG_IETF = 0x22B47C; 
        const ID_CLUSTER = 0x1F43B675;

        // Peak at first segment elements to find tracks
        while (reader.getPosition() < fileSize) {
            const idRes = await readElementId(reader);
            if (idRes.length === 0) break;
            const sizeRes = await readVint(reader);
            if (sizeRes.length === 0) break;
            const elementEnd = reader.getPosition() + sizeRes.value;

            if (idRes.value === 0x1A45DFA3) { // EBML Header
                reader.skip(sizeRes.value);
                continue;
            }
            if (idRes.value === ID_SEGMENT) {
                continue;
            }
            if (idRes.value === ID_CLUSTER) {
                // If we hit clusters, we've likely passed the tracks header
                break;
            }

            if (idRes.value === ID_TRACKS) {
                while (reader.getPosition() < elementEnd) {
                    const tIdRes = await readElementId(reader);
                    const tSizeRes = await readVint(reader);
                    const tEnd = reader.getPosition() + tSizeRes.value;

                    if (tIdRes.value === ID_TRACKENTRY) {
                        const currentTrack: TrackInfo = { type: 0, number: 0, codecId: '' };
                        while (reader.getPosition() < tEnd) {
                            const eIdRes = await readElementId(reader);
                            const eSizeRes = await readVint(reader);
                            const eEnd = reader.getPosition() + eSizeRes.value;

                            if (eIdRes.value === ID_TRACKNUMBER) {
                                const bytes = await reader.readBytes(eSizeRes.value);
                                if (bytes) {
                                    let val = 0;
                                    for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                                    currentTrack.number = val;
                                }
                            } else if (eIdRes.value === ID_TRACKTYPE) {
                                const bytes = await reader.readBytes(eSizeRes.value);
                                if (bytes) {
                                    let val = 0;
                                    for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                                    currentTrack.type = val;
                                }
                            } else if (eIdRes.value === ID_CODECID) {
                                const bytes = await reader.readBytes(eSizeRes.value);
                                if (bytes) currentTrack.codecId = readString(bytes);
                            } else if (eIdRes.value === ID_TRACKNAME) {
                                const bytes = await reader.readBytes(eSizeRes.value);
                                if (bytes) currentTrack.name = readString(bytes);
                            } else if (eIdRes.value === ID_TRACKLANG || eIdRes.value === ID_TRACKLANG_IETF || (eIdRes.value >> 8) === 0x22B5 || (eIdRes.value >> 8) === 0x22B4 || eIdRes.value === 0x22B5 || eIdRes.value === 0x22B4) {
                                const bytes = await reader.readBytes(eSizeRes.value);
                                if (bytes) {
                                    const lang = readString(bytes);
                                    if (lang && lang.toLowerCase() !== 'und') {
                                        currentTrack.language = lang;
                                    } else if (!currentTrack.language) {
                                        currentTrack.language = 'und';
                                    }
                                }
                            } else {
                                reader.skip(eSizeRes.value);
                            }
                            reader.seek(eEnd);
                        }
                        if (currentTrack.type === 17 || currentTrack.codecId.startsWith('S_TEXT')) {
                            tracks.push(currentTrack);
                        }
                    }
                    reader.seek(tEnd);
                }
            }
            reader.seek(elementEnd);
        }

        return tracks.map(t => ({
            number: t.number,
            name: t.name || (t.codecId.includes('ASS') ? 'ASS Track' : 'SRT Track'),
            language: t.language || 'und',
            codecId: t.codecId
        }));
    } catch (e) {
        return [];
    }
};

export const extractSubtitleFromMkv = async (file: File, videoTitle: string = "Extracted Subtitle", preferredTrackNumber?: number): Promise<string | null> => {
  try {
    const reader = new StreamReader(file);
    const fileSize = file.size;

    let timecodeScale = 1000000; // Default 1ms
    const tracks: TrackInfo[] = [];
    const events: SubtitleEvent[] = [];
    const subtitleTrackNumbers = new Set<number>();

    // EBML IDs
    const ID_SEGMENT = 0x18538067;
    const ID_SEGMENT_INFO = 0x1549A966;
    const ID_TIMECODESCALE = 0x2AD7B1;
    const ID_TRACKS = 0x1654AE6B;
    const ID_TRACKENTRY = 0xAE;
    const ID_TRACKNUMBER = 0xD7;
    const ID_TRACKTYPE = 0x83;
    const ID_CODECID = 0x86;
    const ID_CODECPRIVATE = 0x63A2;
    const ID_TRACKNAME = 0x536E;
    const ID_TRACKLANG = 0x22B59C;
    const ID_TRACKLANG_IETF = 0x22B47C;
    const ID_CONTENTENCODINGS = 0x6D80;
    const ID_CONTENTENCODING = 0x6240;
    const ID_CONTENTCOMPRESSION = 0x5034;
    const ID_CONTENTCOMPALGO = 0x4254;
    const ID_CONTENTCOMPSETTINGS = 0x4255;
    
    const ID_CLUSTER = 0x1F43B675;
    const ID_TIMECODE = 0xE7;
    const ID_BLOCKGROUP = 0xA0;
    const ID_BLOCKDURATION = 0x9B;
    const ID_BLOCK = 0xA1;
    const ID_SIMPLEBLOCK = 0xA3;
    const ID_VOID = 0xEC;

    let lastYieldTime = Date.now();

    // EBML Parsing Loop
    while (reader.getPosition() < fileSize) {
      // Yield to main thread to prevent UI freeze
      if (Date.now() - lastYieldTime > 50) {
          await new Promise(resolve => setTimeout(resolve, 0));
          lastYieldTime = Date.now();
      }

      const idRes = await readElementId(reader);
      if (idRes.length === 0) break;
      const id = idRes.value;

      const sizeRes = await readVint(reader);
      if (sizeRes.length === 0) break;
      const size = sizeRes.value;

      const elementEnd = reader.getPosition() + size;

      // VOID (Skip)
      if (id === ID_VOID) {
        reader.seek(elementEnd);
        continue;
      }

      // SEGMENT (Enter)
      if (id === ID_SEGMENT) { 
        continue; 
      }
      
      // SEGMENT INFO
      if (id === ID_SEGMENT_INFO) {
        while (reader.getPosition() < elementEnd) {
           const iIdRes = await readElementId(reader);
           const iSizeRes = await readVint(reader);
           
           if (iIdRes.value === ID_TIMECODESCALE) {
             const bytes = await reader.readBytes(iSizeRes.value);
             if (bytes) {
                 let val = 0;
                 for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                 timecodeScale = val;
             }
           } else {
               reader.skip(iSizeRes.value);
           }
        }
        reader.seek(elementEnd);
        continue;
      }

      // TRACKS
      if (id === ID_TRACKS) {
        while (reader.getPosition() < elementEnd) {
          const tIdRes = await readElementId(reader);
          const tSizeRes = await readVint(reader);
          const tEnd = reader.getPosition() + tSizeRes.value;

          if (tIdRes.value === ID_TRACKENTRY) {
             const currentTrack: TrackInfo = { type: 0, number: 0, codecId: '' };
             
             while (reader.getPosition() < tEnd) {
                const eIdRes = await readElementId(reader);
                const eSizeRes = await readVint(reader);
                const eEnd = reader.getPosition() + eSizeRes.value;
                
                if (eIdRes.value === ID_TRACKNUMBER) {
                    const bytes = await reader.readBytes(eSizeRes.value);
                    if (bytes) {
                        let val = 0;
                        for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                        currentTrack.number = val;
                    }
                }
                else if (eIdRes.value === ID_TRACKTYPE) {
                    const bytes = await reader.readBytes(eSizeRes.value);
                    if (bytes) {
                        let val = 0;
                        for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                        currentTrack.type = val;
                    }
                }
                else if (eIdRes.value === ID_CODECID) {
                    const bytes = await reader.readBytes(eSizeRes.value);
                    if (bytes) currentTrack.codecId = readString(bytes);
                }
                else if (eIdRes.value === ID_CODECPRIVATE) {
                    const bytes = await reader.readBytes(eSizeRes.value);
                    if (bytes) currentTrack.codecPrivate = bytes;
                }
                else if (eIdRes.value === ID_TRACKNAME) {
                    const bytes = await reader.readBytes(eSizeRes.value);
                    if (bytes) currentTrack.name = readString(bytes);
                }
                else if (eIdRes.value === ID_TRACKLANG || eIdRes.value === ID_TRACKLANG_IETF || (eIdRes.value >> 8) === 0x22B5 || (eIdRes.value >> 8) === 0x22B4 || eIdRes.value === 0x22B5 || eIdRes.value === 0x22B4) {
                    const bytes = await reader.readBytes(eSizeRes.value);
                    if (bytes) {
                        const lang = readString(bytes);
                        if (lang && lang.toLowerCase() !== 'und') {
                            currentTrack.language = lang;
                        } else if (!currentTrack.language) {
                            currentTrack.language = 'und';
                        }
                    }
                }
                else if (eIdRes.value === ID_CONTENTENCODINGS) {
                    // Handle Compression
                    while (reader.getPosition() < eEnd) {
                        const ceIdRes = await readElementId(reader);
                        const ceSizeRes = await readVint(reader);
                        const ceEnd = reader.getPosition() + ceSizeRes.value;

                        if (ceIdRes.value === ID_CONTENTENCODING) {
                            while (reader.getPosition() < ceEnd) {
                                const cIdRes = await readElementId(reader);
                                const cSizeRes = await readVint(reader);
                                const cEnd = reader.getPosition() + cSizeRes.value;

                                if (cIdRes.value === ID_CONTENTCOMPRESSION) {
                                    if (!currentTrack.compression) currentTrack.compression = { algo: -1 };
                                    
                                    while (reader.getPosition() < cEnd) {
                                        const ccIdRes = await readElementId(reader);
                                        const ccSizeRes = await readVint(reader);
                                        
                                        if (ccIdRes.value === ID_CONTENTCOMPALGO) {
                                            const bytes = await reader.readBytes(ccSizeRes.value);
                                            if (bytes) {
                                                let val = 0;
                                                for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                                                currentTrack.compression.algo = val;
                                            }
                                        } else if (ccIdRes.value === ID_CONTENTCOMPSETTINGS) {
                                            const bytes = await reader.readBytes(ccSizeRes.value);
                                            if (bytes) currentTrack.compression.settings = bytes;
                                        } else {
                                            reader.skip(ccSizeRes.value);
                                        }
                                    }
                                } else {
                                    reader.skip(cSizeRes.value);
                                }
                            }
                        } else {
                            reader.skip(ceSizeRes.value);
                        }
                    }
                }
                else {
                    reader.skip(eSizeRes.value);
                }
                
                reader.seek(eEnd); // Ensure we align
             }
             
             // 17 = Subtitle, or explicit CodecID check
             if (currentTrack.type === 17 || (currentTrack.codecId && currentTrack.codecId.startsWith('S_TEXT'))) {
                 tracks.push(currentTrack);
                 subtitleTrackNumbers.add(currentTrack.number);
             }
          }
          reader.seek(tEnd);
        }
        reader.seek(elementEnd);
        continue;
      }

      // CLUSTER
      if (id === ID_CLUSTER) {
         const isUnknownSize = size > fileSize;
         const clusterEnd = isUnknownSize ? Infinity : elementEnd;
         let clusterTime = 0;
         
         while (reader.getPosition() < clusterEnd) {
             const startPos = reader.getPosition();
             const cIdRes = await readElementId(reader);
             if (cIdRes.length === 0) break;
             
             // Check for Level 1 elements that indicate end of this Cluster
             // ID_CLUSTER, ID_SEGMENT_INFO, ID_TRACKS, ID_CUES, ID_TAGS, ID_CHAPTERS, ID_ATTACHMENTS, ID_SEEKHEAD
             if (cIdRes.value === ID_CLUSTER || 
                 cIdRes.value === ID_SEGMENT_INFO || 
                 cIdRes.value === ID_TRACKS || 
                 cIdRes.value === 0x1C53BB6B || // Cues
                 cIdRes.value === 0x1254C367 || // Tags
                 cIdRes.value === 0x1043A770 || // Chapters
                 cIdRes.value === 0x1941A469 || // Attachments
                 cIdRes.value === 0x114D9B74    // SeekHead
                ) {
                 reader.seek(startPos);
                 break;
             }

             const cSizeRes = await readVint(reader);
             if (cSizeRes.length === 0) break;
             
             const cContentEnd = reader.getPosition() + cSizeRes.value;

             if (cIdRes.value === ID_TIMECODE) {
                 const bytes = await reader.readBytes(cSizeRes.value);
                 if (bytes) {
                     let val = 0;
                     for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                     clusterTime = val;
                 }
             }
             else if (cIdRes.value === ID_BLOCKGROUP) {
                 let blockDuration = 0;
                 let blockData: { track: number, time: number, data: Uint8Array } | null = null;
                 
                 while (reader.getPosition() < cContentEnd) {
                     const gIdRes = await readElementId(reader);
                     const gSizeRes = await readVint(reader);
                     const gEnd = reader.getPosition() + gSizeRes.value;
                     
                     if (gIdRes.value === ID_BLOCKDURATION) {
                         const bytes = await reader.readBytes(gSizeRes.value);
                         if (bytes) {
                             let val = 0;
                             for(let k=0; k<bytes.length; k++) val = (val * 256) + bytes[k];
                             blockDuration = val;
                         }
                     } 
                     else if (gIdRes.value === ID_BLOCK) {
                         const trackNumRes = await readVint(reader);
                         if (subtitleTrackNumbers.has(trackNumRes.value)) {
                             const timeBytes = await reader.readBytes(2);
                             if (timeBytes) {
                                 const timeOffsetVal = (timeBytes[0] << 8) | timeBytes[1]; // Signed 16-bit
                                 // Convert to signed
                                 const signedTime = timeOffsetVal > 32767 ? timeOffsetVal - 65536 : timeOffsetVal;
                                 
                                 // Skip flags (1 byte)
                                 await reader.readByte();
                                 
                                 const headerSize = trackNumRes.length + 3;
                                 const payloadSize = gSizeRes.value - headerSize;
                                 if (payloadSize > 0) {
                                    const data = await reader.readBytes(payloadSize);
                                    if (data) blockData = { track: trackNumRes.value, time: signedTime, data };
                                 }
                             }
                         } else {
                             reader.skip(gSizeRes.value - trackNumRes.length);
                         }
                     } else {
                         reader.skip(gSizeRes.value);
                     }
                     reader.seek(gEnd);
                 }
                 
                 if (blockData) {
                     const track = tracks.find(t => t.number === blockData!.track);
                     if (track) {
                         let text = decodeBlock(blockData.data, track);
                         if (text) {
                            events.push({
                                trackNumber: blockData.track,
                                timeMs: (clusterTime + blockData.time) * (timecodeScale / 1000000),
                                durationMs: blockDuration * (timecodeScale / 1000000),
                                text: text
                            });
                         }
                     }
                 }
             }
             else if (cIdRes.value === ID_SIMPLEBLOCK) {
                  const trackNumRes = await readVint(reader);
                  
                  if (subtitleTrackNumbers.has(trackNumRes.value)) {
                      const timeBytes = await reader.readBytes(2);
                      if (timeBytes) {
                          const timeOffsetVal = (timeBytes[0] << 8) | timeBytes[1];
                          const signedTime = timeOffsetVal > 32767 ? timeOffsetVal - 65536 : timeOffsetVal;
                          
                          // Flags
                          await reader.readByte();
                          
                          const headerSize = trackNumRes.length + 3;
                          const payloadSize = cSizeRes.value - headerSize;
                          
                          if (payloadSize > 0) {
                              const data = await reader.readBytes(payloadSize);
                              if (data) {
                                  const track = tracks.find(t => t.number === trackNumRes.value);
                                  if (track) {
                                      let text = decodeBlock(data, track);
                                      if (text) {
                                          events.push({
                                              trackNumber: trackNumRes.value,
                                              timeMs: (clusterTime + signedTime) * (timecodeScale / 1000000),
                                              durationMs: 2000, // Default duration if unknown
                                              text: text
                                          });
                                      }
                                  }
                              }
                          }
                      }
                  } else {
                      reader.skip(cSizeRes.value - trackNumRes.length);
                  }
             } else {
                 reader.skip(cSizeRes.value);
             }
             
             reader.seek(cContentEnd);
         }
         
         if (!isUnknownSize) {
             reader.seek(elementEnd);
         }
         continue;
      }

      // Skip any other top-level or unknown elements
      reader.seek(elementEnd);
    }

    if (tracks.length === 0) {
        return null;
    }

    // Count events per track to ensure we don't pick an empty track
    const eventsPerTrack = new Map<number, number>();
    for (const e of events) {
        eventsPerTrack.set(e.trackNumber, (eventsPerTrack.get(e.trackNumber) || 0) + 1);
    }

    // Filter tracks that actually have content
    const activeTracks = tracks.filter(t => (eventsPerTrack.get(t.number) || 0) > 0);

    if (activeTracks.length === 0) {
        console.warn("MKV: Found subtitle tracks but no events were decoded.");
        return null;
    }
    
    // Sort active tracks by preference if not explicitly requested
    if (preferredTrackNumber === undefined) {
        activeTracks.sort((a, b) => {
            const getScore = (t: TrackInfo) => {
                if (t.codecId === 'S_TEXT/ASS' || t.codecId === 'S_TEXT/SSA') return 3;
                if (t.codecId === 'S_TEXT/UTF8' || t.codecId === 'S_TEXT/ASCII') return 2;
                return 1;
            };
            const scoreA = getScore(a);
            const scoreB = getScore(b);
            
            if (scoreA !== scoreB) return scoreB - scoreA; // Higher score first
            
            // Tie-breaker: event count
            return (eventsPerTrack.get(b.number) || 0) - (eventsPerTrack.get(a.number) || 0);
        });
    }

    const targetTrack = preferredTrackNumber !== undefined 
        ? activeTracks.find(t => t.number === preferredTrackNumber) || activeTracks[0]
        : activeTracks[0];
    const isSrt = !(targetTrack.codecId === 'S_TEXT/ASS' || targetTrack.codecId === 'S_TEXT/SSA');

    let output = '';

    if (targetTrack.codecPrivate) {
        // We might need to inject/overwrite the Title here if it exists in private data, but usually private data is just the styles section.
        // We'll prepend the Script Info with our title if it's missing or just rely on re-building later.
        // Simple approach: Just use what's there.
        const privateText = readString(targetTrack.codecPrivate);
        output += privateText.trim() + '\n\n';
    } else {
        output += `[Script Info]\nTitle: ${videoTitle}\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H60000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n\n`;
    }

    // Force update Title if [Script Info] exists
    if (output.includes('[Script Info]')) {
        if (/Title: .*/.test(output)) {
            output = output.replace(/Title: .*/, `Title: ${videoTitle}`);
        } else {
            output = output.replace('[Script Info]', `[Script Info]\nTitle: ${videoTitle}`);
        }
    }

    if (!output.includes('[Events]')) {
        output += '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    }

    const trackEvents = events.filter(e => e.trackNumber === targetTrack!.number);
    trackEvents.sort((a, b) => a.timeMs - b.timeMs);

    trackEvents.forEach(e => {
        const start = formatAssTime(e.timeMs);
        const end = formatAssTime(e.timeMs + e.durationMs);
        let text = e.text;
        
        // FIX: Sanitization for double Dialogue prefix
        if (text.trim().startsWith('Dialogue:')) {
            text = text.trim().substring(9).trim();
            if (text.startsWith(',')) text = text.substring(1).trim();
        }

        // NEW FIX: Remove ReadOrder if present (Heuristic: Int, Int, ...)
        const parts = text.split(',');
        if (parts.length >= 3) {
            const p0 = parts[0].trim();
            const p1 = parts[1].trim();
            const isP0Int = /^\d+$/.test(p0);
            const isP1Int = /^\d+$/.test(p1);
            
            if (isP0Int && isP1Int) {
                const firstCommaIndex = text.indexOf(',');
                text = text.substring(firstCommaIndex + 1);
            }
        }
        
        if (!text || !text.trim()) return;

        if (isSrt || targetTrack!.codecId === 'S_TEXT/UTF8' || targetTrack!.codecId === 'S_TEXT/ASCII') {
             text = text.replace(/\r\n|\n/g, '\\N');
        } else {
             const firstComma = text.indexOf(',');
             if (firstComma !== -1) {
                 const firstPart = text.substring(0, firstComma);
                 const rest = text.substring(firstComma + 1);
                 output += `Dialogue: ${firstPart},${start},${end},${rest}\n`;
                 return;
             }
        }
        
        output += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
    });

    return output;

  } catch (err) {
    console.error("MKV Parse Error", err);
    return null;
  }
};

function decodeBlock(data: Uint8Array, track: TrackInfo): string | null {
    try {
        let payload = data;
        
        // Handle Compression
        if (track.compression) {
            if (track.compression.algo === 0) { // Zlib
                try {
                    payload = inflate(data);
                } catch (e) {
                    console.warn("Zlib decompression failed", e);
                    return null;
                }
            } else if (track.compression.algo === 3) { // Header Stripping
                if (track.compression.settings) {
                    const newPayload = new Uint8Array(track.compression.settings.length + data.length);
                    newPayload.set(track.compression.settings);
                    newPayload.set(data, track.compression.settings.length);
                    payload = newPayload;
                }
            }
        }
        
        return readString(payload);
    } catch (e) {
        return null;
    }
}
