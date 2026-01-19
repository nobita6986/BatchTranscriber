export enum JobStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING', // Client-side reading
  PROCESSING = 'PROCESSING', // AI Inference
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface VideoJob {
  id: string;
  file: File;
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