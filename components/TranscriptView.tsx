import React from 'react';
import { VideoJob, JobStatus } from '../types';
import { CopyIcon, DownloadIcon } from './Icons';

interface TranscriptViewProps {
  job: VideoJob | undefined;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({ job }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (job?.transcript) {
      navigator.clipboard.writeText(job.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (job?.transcript) {
      const element = document.createElement("a");
      const file = new Blob([job.transcript], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${job.file.name}_transcript.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  if (!job) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 bg-slate-900 rounded-xl border border-slate-800">
        <p>Select a video to view transcript</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
        <div>
          <h3 className="font-semibold text-slate-100">{job.file.name}</h3>
          <p className="text-xs text-slate-400 mt-1">
             {job.status === JobStatus.COMPLETED ? 'Transcription Complete' : 'Status: ' + job.status}
          </p>
        </div>
        <div className="flex space-x-2">
            <button
            onClick={handleDownload}
            disabled={!job.transcript}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            title="Download .txt"
          >
            <DownloadIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleCopy}
            disabled={!job.transcript}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 relative"
            title="Copy to clipboard"
          >
            {copied ? (
               <span className="text-green-500 text-xs font-bold absolute inset-0 flex items-center justify-center">Copied</span>
            ) : (
                <CopyIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {job.status === JobStatus.COMPLETED && job.transcript ? (
          <div className="prose prose-invert max-w-none">
            <p className="whitespace-pre-wrap leading-relaxed text-slate-300">
              {job.transcript}
            </p>
          </div>
        ) : job.status === JobStatus.ERROR ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <span className="text-lg font-medium mb-2">Transcription Failed</span>
            <span className="text-sm opacity-80">{job.error || "Unknown error occurred"}</span>
          </div>
        ) : (
           <div className="flex flex-col items-center justify-center h-full space-y-4">
             {job.status === JobStatus.IDLE && (
                 <p className="text-slate-500">Waiting in queue...</p>
             )}
             {(job.status === JobStatus.PROCESSING || job.status === JobStatus.UPLOADING) && (
                 <>
                    <div className="w-12 h-12 rounded-full border-4 border-primary-600 border-t-transparent animate-spin"></div>
                    <p className="text-primary-400 animate-pulse font-medium">
                        {job.status === JobStatus.UPLOADING ? 'Preparing file...' : 'AI Transcribing...'}
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs text-center">
                        This process may take a moment depending on video length.
                    </p>
                 </>
             )}
           </div>
        )}
      </div>
    </div>
  );
};