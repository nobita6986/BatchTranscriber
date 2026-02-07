export enum JobStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING', // Client-side reading / Fetching
  PROCESSING = 'PROCESSING', // AI Inference
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export type JobSource = 'file' | 'youtube';

export interface VideoJob {
  id: string;
  source: JobSource;
  file?: File; // Only if source === 'file'
  url?: string; // Only if source === 'youtube'
  thumbnail?: string; // For YouTube
  name: string; // Unified name field
  size?: number; // Only for files
  status: JobStatus;
  transcript?: string;
  error?: string;
  progress: number;
}

export interface LibraryItem {
  id: string;
  fileName: string;
  transcript: string;
  createdAt: string; // ISO Date string
  fileSize: number;
  source?: JobSource;
  url?: string;
}

export interface ApiKeyConfig {
  id: string;
  name: string;
  key: string;
}

export interface TranscriptionStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
}