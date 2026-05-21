
export interface SubtitleConfig {
  teamName: string;
  telegram: string;
  subbedBy: string;
  logoText: string;
}

export interface SubtitlePreset extends SubtitleConfig {
  id: string;
  name: string;
}

export interface SubtitleData {
  originalFileName: string;
  raw: string;
  scriptInfo: string;
  styles: string;
  formatLine: string;
  eventComments: string[];
  mainDialogues: string[];
  signDialogues: string[];
  hiddenEvents: string[]; // Store automation/spam lines here to preserve them on export
  isModified?: boolean; // Track if file was edited
  sourceType?: 'file' | 'mkv'; // Added to track source
  episodeNum?: string; // Track episode number
  isDownloaded?: boolean; // Track if the file has been downloaded
  history?: {
    past: string[][];
    future: string[][];
  };
}

export type ViewState = 'AUTH' | 'LANDING' | 'HOME' | 'PROJECT_DASHBOARD' | 'EDITOR' | 'STYLES' | 'PREVIEW';

export type PlanTier = 'FREE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'MEMBER' | 'BETA_TESTER';

export interface ExportRecord {
    id: string;
    filename: string;
    date: string; // ISO Date String
    content: string; // The full subtitle content or Base64 for ZIP
    type?: 'text' | 'zip'; // Distinguish format
}

export interface User {
    uid?: string;
    username: string;
    email: string;
    password?: string;
    deviceId?: string;
    plan?: PlanTier;
    planExpires?: number;
    dailyUsage?: {
        date: string;
        count: number;
    };
    totalUsage?: number;
    credits?: number; // Added for credit system
    exportHistory?: ExportRecord[];
    lastActive?: number;
}

export interface ParsedLine {
  original: string;
  isSign: boolean;
  id: number;
}

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
}
