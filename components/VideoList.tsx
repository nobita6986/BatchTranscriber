import React from 'react';
import { JobStatus, VideoJob } from '../types';
import { CheckCircleIcon, XCircleIcon, FileIcon, DownloadIcon } from './Icons';

interface VideoListProps {
  jobs: VideoJob[];
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  onRemoveJob: (id: string) => void;
  onDownloadJob: (id: string) => void;
}

export const VideoList: React.FC<VideoListProps> = ({ jobs, selectedJobId, onSelectJob, onRemoveJob, onDownloadJob }) => {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
        <p className="text-lg">No videos uploaded yet</p>
        <p className="text-sm">Upload videos to start transcribing</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <div
          key={job.id}
          onClick={() => onSelectJob(job.id)}
          className={`relative group flex items-center p-3 rounded-lg cursor-pointer transition-all border ${
            selectedJobId === job.id
              ? 'bg-slate-800 border-primary-500 ring-1 ring-primary-500'
              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
          }`}
        >
          {/* Status Icon */}
          <div className="flex-shrink-0 mr-4">
            {job.status === JobStatus.COMPLETED && <CheckCircleIcon className="w-6 h-6 text-green-500" />}
            {job.status === JobStatus.ERROR && <XCircleIcon className="w-6 h-6 text-red-500" />}
            {job.status === JobStatus.PROCESSING && (
              <div className="w-6 h-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
            )}
            {job.status === JobStatus.IDLE && <FileIcon className="w-6 h-6 text-slate-400" />}
            {job.status === JobStatus.UPLOADING && (
                 <div className="w-6 h-6 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-slate-200 truncate pr-12">{job.file.name}</h4>
            <div className="flex items-center text-xs text-slate-400 mt-1 space-x-2">
              <span>{(job.file.size / (1024 * 1024)).toFixed(2)} MB</span>
              <span>•</span>
              <span className={`
                 ${job.status === JobStatus.COMPLETED ? 'text-green-400' : ''}
                 ${job.status === JobStatus.ERROR ? 'text-red-400' : ''}
                 ${job.status === JobStatus.PROCESSING ? 'text-primary-400' : ''}
              `}>
                {job.status === JobStatus.IDLE && 'Queued'}
                {job.status === JobStatus.UPLOADING && 'Reading File...'}
                {job.status === JobStatus.PROCESSING && 'Transcribing...'}
                {job.status === JobStatus.COMPLETED && 'Done'}
                {job.status === JobStatus.ERROR && 'Failed'}
              </span>
            </div>
          </div>
          
           {/* Actions - Absolute positioned */}
           <div className="absolute right-2 top-2 flex items-center gap-1">
             {job.status === JobStatus.COMPLETED && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadJob(job.id);
                  }}
                  className="p-1 text-slate-400 hover:text-primary-400 transition-colors bg-slate-800/50 rounded-md hover:bg-slate-700"
                  title="Download Transcript"
                >
                  <DownloadIcon className="w-4 h-4" />
                </button>
             )}
             
             {/* Remove Button (visible on hover) */}
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveJob(job.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity bg-slate-800/50 rounded-md hover:bg-slate-700"
                title="Remove Video"
              >
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
             </button>
           </div>
        </div>
      ))}
    </div>
  );
};