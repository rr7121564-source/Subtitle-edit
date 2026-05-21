// Reverted to simple utility to avoid FFmpeg worker issues
export const extractAudioForAI = async (videoFile: File): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Just return the video file as base64. 
            // Gemini can handle video input directly for transcription.
            const base64String = result.includes(',') ? result.split(',')[1] : result;
            resolve({ base64: base64String, mimeType: videoFile.type || 'video/mp4' });
        };
        reader.onerror = reject;
        reader.readAsDataURL(videoFile);
    });
};