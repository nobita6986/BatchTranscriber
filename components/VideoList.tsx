import React from 'react';
import { JobStatus, VideoJob, LibraryItem } from '../types';
import { CheckCircleIcon, XCircleIcon, FileIcon, DownloadIcon, TrashIcon, RefreshIcon } from './Icons';

interface VideoListProps {
  mode: 'queue' | 'library';
  jobs?: VideoJob[];
  libraryItems?: LibraryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload?: (id: string) => void;
  onRetry?: (id: string) => void;
}

export const VideoList: React.FC<VideoListProps> = ({ 
  mode, jobs = [], libraryItems = [], selectedId, onSelect, onRemove, onDownload, onRetry
}) => {
  
  if (mode === 'queue' && jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
        <p className="text-lg">No videos queued</p>
        <p className="text-sm">Upload videos to start</p>
      </div>
    );
  }

  if (mode === 'library' && libraryItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
        <p className="text-lg">Library is empty</p>
        <p className="text-sm">Completed transcripts appear here</p>
      </div>
    );
  }

  const items = mode === 'queue' ? jobs : libraryItems;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        // Safe casting/checking based on mode
        const isJob = mode === 'queue';
        const job = isJob ? (item as VideoJob) : null;
        const libItem = !isJob ? (item as LibraryItem) : null;
        
        const id = isJob ? job!.id : libItem!.id;
        const name = isJob ? job!.file.name : libItem!.fileName;
        const size = isJob ? job!.file.size : libItem!.fileSize;
        
        return (
          <div
            key={id}
            onClick={() => onSelect(id)}
            className={`relative group flex items-center p-3 rounded-lg cursor-pointer transition-all border ${
              selectedId === id
                ? 'bg-slate-800 border-primary-500 ring-1 ring-primary-500'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
            }`}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 mr-4">
              {isJob ? (
                <>
                  {job!.status === JobStatus.COMPLETED && <CheckCircleIcon className="w-6 h-6 text-green-500" />}
                  {job!.status === JobStatus.ERROR && <XCircleIcon className="w-6 h-6 text-red-500" />}
                  {job!.status === JobStatus.PROCESSING && (
                    <div className="w-6 h-6 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                  )}
                  {job!.status === JobStatus.IDLE && <FileIcon className="w-6 h-6 text-slate-400" />}
                  {job!.status === JobStatus.UPLOADING && (
                      <div className="w-6 h-6 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  )}
                </>
              ) : (
                <FileIcon className="w-6 h-6 text-purple-400" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-slate-200 truncate pr-14">{name}</h4>
              <div className="flex items-center text-xs text-slate-400 mt-1 space-x-2">
                <span>{(size / (1024 * 1024)).toFixed(2)} MB</span>
                <span>•</span>
                {isJob ? (
                  <span className={`
                    ${job!.status === JobStatus.COMPLETED ? 'text-green-400' : ''}
                    ${job!.status === JobStatus.ERROR ? 'text-red-400' : ''}
                    ${job!.status === JobStatus.PROCESSING ? 'text-primary-400' : ''}
                  `}>
                    {job!.status === JobStatus.IDLE && 'Queued'}
                    {job!.status === JobStatus.UPLOADING && 'Reading...'}
                    {job!.status === JobStatus.PROCESSING && 'Transcribing...'}
                    {job!.status === JobStatus.COMPLETED && 'Done'}
                    {job!.status === JobStatus.ERROR && 'Failed'}
                  </span>
                ) : (
                  <span className="text-purple-300">
                    {new Date(libItem!.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="absolute right-2 top-2 flex items-center gap-1">
              {/* Retry Button */}
              {isJob && job!.status === JobStatus.ERROR && onRetry && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(id);
                    }}
                    className="p-1 text-red-400 hover:text-white transition-colors bg-slate-800/50 rounded-md hover:bg-red-500/50"
                    title="Retry"
                  >
                    <RefreshIcon className="w-4 h-4" />
                  </button>
              )}

              {onDownload && (isJob ? job!.status === JobStatus.COMPLETED : true) && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(id);
                    }}
                    className="p-1 text-slate-400 hover:text-primary-400 transition-colors bg-slate-800/50 rounded-md hover:bg-slate-700"
                    title="Download"
                  >
                    <DownloadIcon className="w-4 h-4" />
                  </button>
              )}
              
              <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity bg-slate-800/50 rounded-md hover:bg-slate-700"
                  title="Remove"
                >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};