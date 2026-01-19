import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JobStatus, VideoJob } from './types';
import { transcribeVideo } from './services/geminiService';
import { VideoList } from './components/VideoList';
import { TranscriptView } from './components/TranscriptView';
import { UploadIcon, DownloadIcon } from './components/Icons';

function App() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats calculation
  const stats = {
      total: jobs.length,
      completed: jobs.filter(j => j.status === JobStatus.COMPLETED).length,
      processing: jobs.filter(j => j.status === JobStatus.PROCESSING || j.status === JobStatus.UPLOADING).length,
      failed: jobs.filter(j => j.status === JobStatus.ERROR).length
  };

  // Add files to queue
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newJobs: VideoJob[] = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substring(7),
        file: file as File,
        status: JobStatus.IDLE,
        progress: 0,
      }));
      
      setJobs(prev => [...prev, ...newJobs]);
      // Select the first new job if nothing is selected
      if (!selectedJobId && newJobs.length > 0) {
        setSelectedJobId(newJobs[0].id);
      }
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
    if (selectedJobId === id) setSelectedJobId(null);
  };

  const updateJob = useCallback((id: string, updates: Partial<VideoJob>) => {
    setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));
  }, []);

  const handleDownloadJob = (id: string) => {
    const job = jobs.find(j => j.id === id);
    if (job && job.transcript) {
      const element = document.createElement("a");
      const file = new Blob([job.transcript], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${job.file.name}_transcript.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const handleDownloadAll = () => {
    const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED && j.transcript);
    if (completedJobs.length === 0) return;

    const allTranscripts = completedJobs.map(job => {
      return `----------------------------------------\nVideo: ${job.file.name}\n----------------------------------------\n\n${job.transcript}\n\n`;
    }).join('\n');

    const element = document.createElement("a");
    const file = new Blob([allTranscripts], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `all_transcripts_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Queue Processing Logic
  const processNextJob = useCallback(async () => {
    if (isProcessing) return;

    const nextJob = jobs.find(job => job.status === JobStatus.IDLE);
    if (!nextJob) return;

    setIsProcessing(true);
    updateJob(nextJob.id, { status: JobStatus.UPLOADING });

    try {
      // 1. Prepare (Client side read done in service, effectively 'processing' for user view)
      updateJob(nextJob.id, { status: JobStatus.PROCESSING });

      // 2. Call Gemini
      const transcript = await transcribeVideo(nextJob.file);

      // 3. Complete
      updateJob(nextJob.id, { 
        status: JobStatus.COMPLETED, 
        transcript,
        progress: 100 
      });

    } catch (error: any) {
      updateJob(nextJob.id, { 
        status: JobStatus.ERROR, 
        error: error.message || "Failed processing",
        progress: 0 
      });
    } finally {
      setIsProcessing(false);
    }
  }, [jobs, isProcessing, updateJob]);

  // Watch queue and trigger processing
  useEffect(() => {
    if (!isProcessing && jobs.some(j => j.status === JobStatus.IDLE)) {
      processNextJob();
    }
  }, [jobs, isProcessing, processNextJob]);


  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans selection:bg-primary-500/30">
      {/* Header */}
      <header className="flex-shrink-0 h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center px-6 sticky top-0 z-10 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
               <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
               <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
            </svg>
          </div>
          <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            Gemini Batch Transcriber
          </h1>
        </div>

        <div className="flex items-center gap-6 text-sm">
           <div className="hidden md:flex gap-4 text-slate-400">
             <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-600"></span> Total: {stats.total}</span>
             <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary-500"></span> Processing: {stats.processing}</span>
             <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span> Completed: {stats.completed}</span>
           </div>
           
           <div className="flex items-center gap-3">
             {stats.completed > 0 && (
               <button 
                 onClick={handleDownloadAll}
                 className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm"
               >
                 <DownloadIcon className="w-4 h-4" />
                 Download All ({stats.completed})
               </button>
             )}

             <button 
               onClick={() => fileInputRef.current?.click()}
               className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-primary-500/20 flex items-center gap-2"
             >
               <UploadIcon className="w-4 h-4" />
               Upload Videos
             </button>
           </div>
           <input 
             type="file" 
             ref={fileInputRef} 
             className="hidden" 
             accept="video/*" 
             multiple 
             onChange={handleFileChange} 
           />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-6 gap-6 grid grid-cols-12 max-w-[1600px] mx-auto w-full">
        
        {/* Left Sidebar: Queue */}
        <section className="col-span-4 lg:col-span-3 flex flex-col min-h-0 bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-800/40">
            <h2 className="font-semibold text-slate-200">Processing Queue</h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
             <VideoList 
               jobs={jobs} 
               selectedJobId={selectedJobId} 
               onSelectJob={setSelectedJobId} 
               onRemoveJob={removeJob}
               onDownloadJob={handleDownloadJob}
             />
          </div>
        </section>

        {/* Right Panel: Transcription */}
        <section className="col-span-8 lg:col-span-9 flex flex-col min-h-0">
          <TranscriptView 
             job={jobs.find(j => j.id === selectedJobId)}
          />
        </section>

      </main>
    </div>
  );
}

export default App;