import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JobStatus, VideoJob, LibraryItem, ApiKeyConfig } from './types';
import { transcribeVideo } from './services/geminiService';
import { VideoList } from './components/VideoList';
import { TranscriptView } from './components/TranscriptView';
import { UploadIcon, DownloadIcon, SettingsIcon, LibraryIcon, PlayIcon, PauseIcon, TrashIcon } from './components/Icons';
import { ApiKeyManager } from './components/ApiKeyManager';

function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'queue' | 'library'>('queue');
  
  // Job Queue
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  
  // Library
  const [library, setLibrary] = useState<LibraryItem[]>(() => {
    const saved = localStorage.getItem('transcript_library');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);

  // Settings / Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>(() => {
    const saved = localStorage.getItem('gemini_api_keys');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeKeyId, setActiveKeyId] = useState<string | null>(() => {
    return localStorage.getItem('gemini_active_key_id') || null;
  });
  const [showKeyManager, setShowKeyManager] = useState(false);

  // Control
  const [isProcessing, setIsProcessing] = useState(false);
  const [isQueueRunning, setIsQueueRunning] = useState(true); // Default to auto-run
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Persistence Effects ---
  useEffect(() => {
    localStorage.setItem('transcript_library', JSON.stringify(library));
  }, [library]);

  useEffect(() => {
    localStorage.setItem('gemini_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    if (activeKeyId) localStorage.setItem('gemini_active_key_id', activeKeyId);
    else localStorage.removeItem('gemini_active_key_id');
  }, [activeKeyId]);


  // --- Helper Functions ---
  const getActiveApiKey = () => {
    // 1. Try selected custom key
    if (activeKeyId) {
      const keyConfig = apiKeys.find(k => k.id === activeKeyId);
      if (keyConfig) return keyConfig.key;
    }
    // 2. Try environment variable (default)
    return process.env.API_KEY || '';
  };

  const addToLibrary = (job: VideoJob, text: string) => {
    const newItem: LibraryItem = {
      id: Math.random().toString(36).substring(7),
      fileName: job.file.name,
      fileSize: job.file.size,
      transcript: text,
      createdAt: new Date().toISOString(),
    };
    setLibrary(prev => [newItem, ...prev]);
  };

  // --- Stats ---
  const stats = {
      total: jobs.length,
      completed: jobs.filter(j => j.status === JobStatus.COMPLETED).length,
      processing: jobs.filter(j => j.status === JobStatus.PROCESSING || j.status === JobStatus.UPLOADING).length,
      libraryCount: library.length
  };

  // --- Event Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newJobs: VideoJob[] = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substring(7),
        file: file as File,
        status: JobStatus.IDLE,
        progress: 0,
      }));
      
      setJobs(prev => [...prev, ...newJobs]);
      if (activeTab === 'library') setActiveTab('queue');
      // Auto-select first if none selected
      if (!selectedJobId && newJobs.length > 0) {
        setSelectedJobId(newJobs[0].id);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
    if (selectedJobId === id) setSelectedJobId(null);
  };

  const removeLibraryItem = (id: string) => {
    setLibrary(prev => prev.filter(item => item.id !== id));
    if (selectedLibraryId === id) setSelectedLibraryId(null);
  };

  const updateJob = useCallback((id: string, updates: Partial<VideoJob>) => {
    setJobs(prev => prev.map(job => job.id === id ? { ...job, ...updates } : job));
  }, []);

  const handleDownload = (filename: string, text: string) => {
      const element = document.createElement("a");
      const file = new Blob([text], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${filename}_transcript.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
  };

  const handleDownloadAllLibrary = () => {
     if (library.length === 0) return;
     const allText = library.map(item => 
       `------------------\nFile: ${item.fileName}\nDate: ${new Date(item.createdAt).toLocaleString()}\n------------------\n${item.transcript}\n\n`
     ).join('\n');
     
     const element = document.createElement("a");
     const file = new Blob([allText], {type: 'text/plain'});
     element.href = URL.createObjectURL(file);
     element.download = `full_library_export_${new Date().toISOString().slice(0,10)}.txt`;
     document.body.appendChild(element);
     element.click();
     document.body.removeChild(element);
  };

  // --- Queue Processor ---
  const processNextJob = useCallback(async () => {
    if (isProcessing || !isQueueRunning) return;

    const nextJob = jobs.find(job => job.status === JobStatus.IDLE);
    if (!nextJob) return;

    // Check API Key
    const key = getActiveApiKey();
    if (!key) {
      updateJob(nextJob.id, { 
        status: JobStatus.ERROR, 
        error: "Missing API Key. Configure in Settings." 
      });
      setIsQueueRunning(false); // Stop queue if no key
      setShowKeyManager(true);
      return;
    }

    setIsProcessing(true);
    updateJob(nextJob.id, { status: JobStatus.UPLOADING });

    try {
      updateJob(nextJob.id, { status: JobStatus.PROCESSING });
      const transcript = await transcribeVideo(nextJob.file, key);

      // Success
      updateJob(nextJob.id, { 
        status: JobStatus.COMPLETED, 
        transcript,
        progress: 100 
      });
      addToLibrary(nextJob, transcript);

    } catch (error: any) {
      updateJob(nextJob.id, { 
        status: JobStatus.ERROR, 
        error: error.message || "Failed processing",
        progress: 0 
      });
    } finally {
      setIsProcessing(false);
    }
  }, [jobs, isProcessing, isQueueRunning, updateJob, apiKeys, activeKeyId]);

  // Watch queue
  useEffect(() => {
    if (!isProcessing && isQueueRunning && jobs.some(j => j.status === JobStatus.IDLE)) {
      processNextJob();
    }
  }, [jobs, isProcessing, isQueueRunning, processNextJob]);

  // --- Derived State for View ---
  const currentViewItem = activeTab === 'queue' 
    ? jobs.find(j => j.id === selectedJobId)
    : library.find(i => i.id === selectedLibraryId);

  // Adapt VideoJob or LibraryItem for TranscriptView
  const viewData = currentViewItem ? {
      file: { name: (activeTab === 'queue' ? (currentViewItem as VideoJob).file.name : (currentViewItem as LibraryItem).fileName) } as File,
      status: activeTab === 'queue' ? (currentViewItem as VideoJob).status : JobStatus.COMPLETED,
      transcript: currentViewItem.transcript,
      error: activeTab === 'queue' ? (currentViewItem as VideoJob).error : undefined
  } : undefined;


  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans selection:bg-primary-500/30">
      
      {/* API Key Modal */}
      {showKeyManager && (
        <ApiKeyManager 
          apiKeys={apiKeys}
          selectedKeyId={activeKeyId}
          onAddKey={(k) => {
             setApiKeys(prev => [...prev, k]);
             if (!activeKeyId) setActiveKeyId(k.id); // Auto select first
          }}
          onRemoveKey={(id) => {
             setApiKeys(prev => prev.filter(k => k.id !== id));
             if (activeKeyId === id) setActiveKeyId(null);
          }}
          onSelectKey={setActiveKeyId}
          onClose={() => setShowKeyManager(false)}
        />
      )}

      {/* Header */}
      <header className="flex-shrink-0 h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center px-6 sticky top-0 z-10 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
             {/* Logo Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
               <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
               <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
            </svg>
          </div>
          <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent hidden sm:block">
            Gemini Transcriber
          </h1>
        </div>

        <div className="flex items-center gap-4 text-sm">
           {/* Queue Controls */}
           <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1 border border-slate-700">
             <button 
                onClick={() => setIsQueueRunning(!isQueueRunning)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  isQueueRunning 
                    ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' 
                    : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                }`}
                title={isQueueRunning ? "Queue Running - Click to Pause" : "Queue Paused - Click to Resume"}
             >
               {isQueueRunning ? <PauseIcon className="w-4 h-4"/> : <PlayIcon className="w-4 h-4"/>}
               <span className="hidden sm:inline">{isQueueRunning ? 'Running' : 'Paused'}</span>
             </button>
             
             <div className="h-4 w-px bg-slate-700 mx-1"></div>
             
             <div className="flex gap-3 px-2 text-slate-400 text-xs">
                <span>Total: {stats.total}</span>
                <span className={isProcessing ? 'text-primary-400' : ''}>Proc: {stats.processing}</span>
             </div>
           </div>

           <button 
             onClick={() => setShowKeyManager(true)}
             className={`p-2 rounded-lg transition-all ${!activeKeyId && !process.env.API_KEY ? 'bg-red-500/10 text-red-400 animate-pulse border border-red-500/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
             title="API Settings"
           >
             <SettingsIcon className="w-5 h-5" />
           </button>

           <button 
             onClick={() => fileInputRef.current?.click()}
             className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-primary-500/20 flex items-center gap-2"
           >
             <UploadIcon className="w-4 h-4" />
             <span className="hidden sm:inline">Upload</span>
           </button>
           <input type="file" ref={fileInputRef} className="hidden" accept="video/*" multiple onChange={handleFileChange} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-6 gap-6 grid grid-cols-12 max-w-[1600px] mx-auto w-full">
        
        {/* Left Sidebar */}
        <section className="col-span-4 lg:col-span-3 flex flex-col min-h-0 bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button 
              onClick={() => setActiveTab('queue')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'queue' ? 'bg-slate-800 text-primary-400 border-b-2 border-primary-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Queue
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'library' ? 'bg-slate-800 text-primary-400 border-b-2 border-primary-500' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <LibraryIcon className="w-4 h-4" /> Library ({stats.libraryCount})
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
             <VideoList 
               mode={activeTab}
               jobs={jobs}
               libraryItems={library} 
               selectedId={activeTab === 'queue' ? selectedJobId : selectedLibraryId} 
               onSelect={activeTab === 'queue' ? setSelectedJobId : setSelectedLibraryId} 
               onRemove={activeTab === 'queue' ? removeJob : removeLibraryItem}
               onDownload={(id) => {
                  if (activeTab === 'queue') {
                     const job = jobs.find(j => j.id === id);
                     if (job?.transcript) handleDownload(job.file.name, job.transcript);
                  } else {
                     const item = library.find(i => i.id === id);
                     if (item) handleDownload(item.fileName, item.transcript);
                  }
               }}
             />
          </div>

          {/* Footer Actions (Library only) */}
          {activeTab === 'library' && library.length > 0 && (
             <div className="p-3 border-t border-slate-800 bg-slate-800/30">
               <button 
                 onClick={handleDownloadAllLibrary}
                 className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg border border-slate-700 text-xs font-medium transition-colors"
               >
                 <DownloadIcon className="w-4 h-4" /> Export All Library
               </button>
             </div>
          )}
        </section>

        {/* Right Panel: Transcription */}
        <section className="col-span-8 lg:col-span-9 flex flex-col min-h-0">
          <TranscriptView 
             job={viewData as VideoJob} // Type assertion OK because view only uses common props present in viewData structure constructed above
          />
        </section>

      </main>
    </div>
  );
}

export default App;