// @ts-ignore
import JSZip from 'jszip';
import { SubtitleData } from '../types';
import { rebuildSubtitleContent } from './parser';

// NEW: Export Subtitles as ZIP
export const generateZipFromSubtitles = async (files: SubtitleData[]): Promise<Blob> => {
    const ZipClass: any = JSZip;
    const zip = new ZipClass();

    files.forEach(file => {
        const content = rebuildSubtitleContent(file);
        let filename = file.originalFileName;
        
        // Ensure extension is .ass if not present
        if (!filename.toLowerCase().endsWith('.ass')) {
            filename = filename.replace(/\.(srt|vtt|txt)$/i, '') + '.ass';
        }
        
        zip.file(filename, content);
    });

    return await zip.generateAsync({ type: "blob" });
};
