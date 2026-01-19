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
  progress: number; // 0 to 100
  thumbnailUrl?: string; // Object URL for preview
}

export interface TranscriptionStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
}