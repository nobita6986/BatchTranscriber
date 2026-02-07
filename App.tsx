import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JobStatus, VideoJob, LibraryItem, ApiKeyConfig } from './types';
import { transcribeVideo, refineTranscript } from './services/geminiService';
import { getYoutubeMetadata, fetchYoutubeTranscript } from './services/youtubeService';
import { VideoList } from './components/VideoList';
import { TranscriptView } from './components/TranscriptView';
import { UploadIcon, DownloadIcon, SettingsIcon, LibraryIcon, PlayIcon, PauseIcon, TrashIcon, RefreshIcon, BoltIcon, YoutubeIcon, XCircleIcon } from './components/Icons';
import { ApiKeyManager } from './components/ApiKeyManager';

// Robust environment variable accessor
const getSystemApiKey = () => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env.API_KEY || process.env.REACT_APP_API_KEY;
    }
  } catch (e) {
    console.warn("Could not read environment variables:", e);
  }
  return undefined;
};

const SYSTEM_API_KEY = getSystemApiKey();
const AUTO_CONCURRENCY_LIMIT = 3;

function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'queue' | 'library'>('queue');
  
  // Job Queue
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  
  // Library
  const [library, setLibrary] = useState<LibraryItem[]>(() => {
    try {
      const saved = localStorage.getItem('transcript_library');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse library from local storage", e);
      return [];
    }
  });
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);

  // Settings / Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_api_keys');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse api keys", e);
      return [];
    }
  });
  const [activeKeyId, setActiveKeyId] = useState<string | null>(() => {
    return localStorage.getItem('gemini_active_key_id') || null;
  });
  // New: SearchAPI Key State
  const [searchApiKey, setSearchApiKey] = useState<string>(() => {
     return localStorage.getItem('searchapi_key') || '';
  });

  const [showKeyManager, setShowKeyManager] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');

  // Control
  const [isQueueRunning, setIsQueueRunning] = useState(true); 
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(3);
  const [autoConcurrency, setAutoConcurrency] = useState<boolean>(true);
  
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

  useEffect(() => {
      localStorage.setItem('searchapi_key', searchApiKey);
  }, [searchApiKey]);


  // --- Helper Functions ---
  const getActiveApiKey = () => {
    if (activeKeyId) {
      const keyConfig = apiKeys.find(k => k.id === activeKeyId);
      if (keyConfig) return keyConfig.key;
    }
    return SYSTEM_API_KEY || '';
  };

  const addToLibrary = (job: VideoJob, text: string) => {
    const newItem: LibraryItem = {
      id: Math.random().toString(36).substring(7),
      fileName: job.name,
      fileSize: job.size || 0,
      transcript: text,
      createdAt: new Date().toISOString(),
      source: job.source,
      url: job.url
    };
    setLibrary(prev => [newItem, ...prev]);
  };

  // --- Stats ---
  const processingCount = jobs.filter(j => j.status === JobStatus.PROCESSING || j.status === JobStatus.UPLOADING).length;
  const stats = {
      total: jobs.length,
      completed: jobs.filter(j => j.status === JobStatus.COMPLETED).length,
      processing: processingCount,
      failed: jobs.filter(j => j.status === JobStatus.ERROR).length,
      libraryCount: library.length
  };

  // --- Event Handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Fix: Explicitly type 'file' as File to avoid 'unknown' type error in Array.from map
      const newJobs: VideoJob[] = Array.from(e.target.files).map((file: File) => ({
        id: Math.random().toString(36).substring(7),
        source: 'file',
        file: file,
        name: file.name,
        size: file.size,
        status: JobStatus.IDLE,
        progress: 0,
      }));
      
      setJobs(prev => [...prev, ...newJobs]);
      if (activeTab === 'library') setActiveTab('queue');
      if (!selectedJobId && newJobs.length > 0) setSelectedJobId(newJobs[0].id);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleYoutubeImport = async () => {
      const urls = youtubeInput.split('\n').map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length === 0) return;

      setShowYoutubeModal(false);
      setYoutubeInput('');
      setActiveTab('queue');

      // Create placeholders immediately
      const newJobs: VideoJob[] = urls.map(url => ({
          id: Math.random().toString(36).substring(7),
          source: 'youtube',
          url: url,
          name: url, // Temporary name until fetched
          status: JobStatus.IDLE,
          progress: 0
      }));

      setJobs(prev => [...prev, ...newJobs]);

      // Fetch metadata in background for UI polish
      newJobs.forEach(async (job) => {
          try {
              const meta = await getYoutubeMetadata(job.url!);
              setJobs(prev => prev.map(j => j.id === job.id ? { ...j, name: meta.title, thumbnail: meta.thumbnail } : j));
          } catch (e) {
              // Ignore metadata errors, processing will handle it later
          }
      });
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
    if (selectedJobId === id) setSelectedJobId(null);
  };

  const removeLibraryItem = (id: string) => {
    setLibrary(prev => prev.filter(item => item.id !== id));
    if (selectedLibraryId === id) setSelectedLibraryId(null);
  };

  const handleClearLibrary = () => {
     if (library.length === 0) return;
     if (window.confirm("Are you sure you want to delete all transcripts from the library?")) {
        setLibrary([]);
        setSelectedLibraryId(null);
     }
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
       `------------------\nFile: ${item.fileName}\nSource: ${item.source === 'youtube' ? item.url : 'File Upload'}\nDate: ${new Date(item.createdAt).toLocaleString()}\n------------------\n${item.transcript}\n\n`
     ).join('\n');
     
     const element = document.createElement("a");
     const file = new Blob([allText], {type: 'text/plain'});
     element.href = URL.createObjectURL(file);
     element.download = `full_library_export_${new Date().toISOString().slice(0,10)}.txt`;
     document.body.appendChild(element);
     element.click();
     document.body.removeChild(element);
  };

  const retryJob = (id: string) => {
    updateJob(id, { status: JobStatus.IDLE, error: undefined, progress: 0 });
    if (!isQueueRunning) setIsQueueRunning(true);
  };

  const retryAllFailed = () => {
    setJobs(prev => prev.map(job => {
      if (job.status === JobStatus.ERROR) {
        return { ...job, status: JobStatus.IDLE, error: undefined, progress: 0 };
      }
      return job;
    }));
    if (!isQueueRunning) setIsQueueRunning(true);
  };

  // --- Queue Processor ---
  const processJob = useCallback(async (jobId: string) => {
      const job = jobs.find(j => j.id === jobId);
      if (!job || job.status !== JobStatus.IDLE) return;

      const key = getActiveApiKey();
      if (!key) {
        updateJob(jobId, { status: JobStatus.ERROR, error: "Missing Gemini API Key" });
        setIsQueueRunning(false); 
        setShowKeyManager(true);
        return;
      }

      try {
        updateJob(jobId, { status: JobStatus.UPLOADING }); // "Fetching" for YouTube
        
        let transcript = "";

        if (job.source === 'youtube' && job.url) {
            // 1. Fetch Raw Transcript (Pass SearchAPI Key)
            const rawText = await fetchYoutubeTranscript(job.url, searchApiKey);
            
            // 2. Refine with Gemini
            updateJob(jobId, { status: JobStatus.PROCESSING });
            transcript = await refineTranscript(rawText, key);

        } else if (job.source === 'file' && job.file) {
            // Standard File Transcription
            updateJob(jobId, { status: JobStatus.PROCESSING });
            transcript = await transcribeVideo(job.file, key);
        } else {
            throw new Error("Invalid Job Source");
        }

        updateJob(jobId, { 
          status: JobStatus.COMPLETED, 
          transcript,
          progress: 100 
        });
        
        // Pass fresh object based on current job data to library
        // We use jobs.find to get the latest state (e.g. name updated by metadata fetch)
        const updatedJob = jobs.find(j => j.id === jobId) || job;
        addToLibrary(updatedJob, transcript);

      } catch (error: any) {
        updateJob(jobId, { 
          status: JobStatus.ERROR, 
          error: error.message || "Failed processing",
          progress: 0 
        });
      }
  }, [jobs, updateJob, apiKeys, activeKeyId, searchApiKey]); // Added searchApiKey to dependency

  // Main Queue Watcher
  useEffect(() => {
    if (!isQueueRunning) return;

    const activeJobsCount = jobs.filter(j => j.status === JobStatus.PROCESSING || j.status === JobStatus.UPLOADING).length;
    const effectiveLimit = autoConcurrency ? AUTO_CONCURRENCY_LIMIT : concurrencyLimit;
    const slotsAvailable = effectiveLimit - activeJobsCount;

    if (slotsAvailable > 0) {
      const idleJobs = jobs.filter(j => j.status === JobStatus.IDLE);
      if (idleJobs.length > 0) {
        const jobsToStart = idleJobs.slice(0, slotsAvailable);
        jobsToStart.forEach(job => processJob(job.id));
      }
    }
  }, [jobs, isQueueRunning, autoConcurrency, concurrencyLimit, processJob]);


  // --- Derived State for View ---
  const currentViewItem = activeTab === 'queue' 
    ? jobs.find(j => j.id === selectedJobId)
    : library.find(i => i.id === selectedLibraryId);

  const viewData = currentViewItem ? {
      // Compatibility mapping for TranscriptView
      id: currentViewItem.id,
      source: (activeTab === 'queue' ? (currentViewItem as VideoJob).source : (currentViewItem as LibraryItem).source || 'file'),
      file: { name: (activeTab === 'queue' ? (currentViewItem as VideoJob).name : (currentViewItem as LibraryItem).fileName) } as File,
      status: activeTab === 'queue' ? (currentViewItem as VideoJob).status : JobStatus.COMPLETED,
      transcript: currentViewItem.transcript,
      error: activeTab === 'queue' ? (currentViewItem as VideoJob).error : undefined,
      progress: 0
  } as VideoJob : undefined;


  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans selection:bg-primary-500/30">
      
      {/* YouTube Modal */}
      {showYoutubeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                      <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                          <YoutubeIcon className="w-5 h-5 text-red-500" />
                          Import from YouTube
                      </h3>
                      <button onClick={() => setShowYoutubeModal(false)} className="text-slate-400 hover:text-white">
                          <XCircleIcon className="w-6 h-6" />
                      </button>
                  </div>
                  <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                      <p className="text-sm text-slate-400">
                          Paste YouTube URLs below (one per line). <br/>
                          <span className="text-xs text-slate-500 opacity-80">* Uses available captions and AI to refine them. Does not support auto-generated captions for some videos.</span>
                      </p>
                      <textarea 
                          className="w-full h-48 bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-primary-500 font-mono"
                          placeholder="https://www.youtube.com/watch?v=...\nhttps://youtu.be/..."
                          value={youtubeInput}
                          onChange={e => setYoutubeInput(e.target.value)}
                      />
                  </div>
                  <div className="p-4 border-t border-slate-700 bg-slate-800/30 flex justify-end gap-2">
                      <button onClick={() => setShowYoutubeModal(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors">Cancel</button>
                      <button 
                          onClick={handleYoutubeImport}
                          disabled={!youtubeInput.trim()}
                          className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Import Videos
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* API Key Modal */}
      {showKeyManager && (
        <ApiKeyManager 
          apiKeys={apiKeys}
          selectedKeyId={activeKeyId}
          searchApiKey={searchApiKey}
          onAddKey={(k) => {
             setApiKeys(prev => [...prev, k]);
             if (!activeKeyId) setActiveKeyId(k.id);
          }}
          onRemoveKey={(id) => {
             setApiKeys(prev => prev.filter(k => k.id !== id));
             if (activeKeyId === id) setActiveKeyId(null);
          }}
          onSelectKey={setActiveKeyId}
          onUpdateSearchKey={setSearchApiKey}
          onClose={() => setShowKeyManager(false)}
        />
      )}

      {/* Header */}
      <header className="flex-shrink-0 h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center px-6 sticky top-0 z-10 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
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
             >
               {isQueueRunning ? <PauseIcon className="w-4 h-4"/> : <PlayIcon className="w-4 h-4"/>}
               <span className="hidden sm:inline">{isQueueRunning ? 'Running' : 'Paused'}</span>
             </button>

             <div className="h-4 w-px bg-slate-700 mx-1"></div>

             {/* Threads Control */}
             <div className="flex items-center gap-2 px-2">
                <BoltIcon className={`w-4 h-4 ${autoConcurrency ? 'text-primary-400' : 'text-slate-400'}`} />
                <div className="flex items-center gap-2 bg-slate-900/50 rounded p-0.5">
                   <button 
                     onClick={() => setAutoConcurrency(!autoConcurrency)}
                     className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                       autoConcurrency 
                       ? 'bg-primary-600 text-white shadow-sm' 
                       : 'text-slate-400 hover:text-slate-200'
                     }`}
                   >
                     Auto
                   </button>
                   
                   {!autoConcurrency && (
                     <div className="flex items-center gap-1 px-1">
                        <button 
                          onClick={() => setConcurrencyLimit(Math.max(1, concurrencyLimit - 1))}
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded"
                        >-</button>
                        <span className="w-4 text-center text-xs font-mono">{concurrencyLimit}</span>
                        <button 
                          onClick={() => setConcurrencyLimit(Math.min(10, concurrencyLimit + 1))}
                          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded"
                        >+</button>
                     </div>
                   )}
                </div>
             </div>
             
             <div className="h-4 w-px bg-slate-700 mx-1"></div>

             {/* Retry All Failed Button */}
             {stats.failed > 0 && (
               <>
                 <button 
                   onClick={retryAllFailed}
                   className="flex items-center gap-2 px-3 py-1.5 rounded-md font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                 >
                   <RefreshIcon className="w-4 h-4" />
                   <span className="hidden lg:inline">Retry Failed ({stats.failed})</span>
                   <span className="lg:hidden">{stats.failed}</span>
                 </button>
                 <div className="h-4 w-px bg-slate-700 mx-1"></div>
               </>
             )}
             
             <div className="flex gap-3 px-2 text-slate-400 text-xs">
                <span>Total: {stats.total}</span>
                <span className={processingCount > 0 ? 'text-primary-400 font-medium' : ''}>
                   Proc: {processingCount}/{autoConcurrency ? 'Auto' : concurrencyLimit}
                </span>
             </div>
           </div>

           <button 
             onClick={() => setShowKeyManager(true)}
             className={`p-2 rounded-lg transition-all ${!activeKeyId && !SYSTEM_API_KEY ? 'bg-red-500/10 text-red-400 animate-pulse border border-red-500/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
             title="API Settings"
           >
             <SettingsIcon className="w-5 h-5" />
           </button>

           {/* Download All Button */}
           {library.length > 0 && (
              <button 
                onClick={handleDownloadAllLibrary}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg font-medium transition-all border border-slate-700 flex items-center gap-2 shadow-sm"
                title="Download all saved transcripts"
              >
                <DownloadIcon className="w-4 h-4" />
                <span className="hidden xl:inline">Download All</span>
              </button>
           )}

           <div className="flex items-center gap-2">
               <button 
                 onClick={() => setShowYoutubeModal(true)}
                 className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg font-medium transition-all shadow-sm border border-slate-600 flex items-center gap-2"
                 title="Import YouTube Links"
               >
                 <YoutubeIcon className="w-5 h-5 text-red-500" />
                 <span className="hidden lg:inline">YouTube</span>
               </button>

               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-primary-500/20 flex items-center gap-2"
               >
                 <UploadIcon className="w-4 h-4" />
                 <span className="hidden sm:inline">Upload</span>
               </button>
           </div>
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
                     if (job?.transcript) handleDownload(job.name, job.transcript);
                  } else {
                     const item = library.find(i => i.id === id);
                     if (item) handleDownload(item.fileName, item.transcript);
                  }
               }}
               onRetry={activeTab === 'queue' ? retryJob : undefined}
             />
          </div>

          {/* Footer Actions (Library only) */}
          {activeTab === 'library' && library.length > 0 && (
             <div className="p-3 border-t border-slate-800 bg-slate-800/30 space-y-2">
               <button 
                 onClick={handleDownloadAllLibrary}
                 className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg border border-slate-700 text-xs font-medium transition-colors"
               >
                 <DownloadIcon className="w-4 h-4" /> Export All Library
               </button>
               <button 
                 onClick={handleClearLibrary}
                 className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 rounded-lg text-xs font-medium transition-colors"
               >
                 <TrashIcon className="w-4 h-4" /> Delete All
               </button>
             </div>
          )}
        </section>

        {/* Right Panel: Transcription */}
        <section className="col-span-8 lg:col-span-9 flex flex-col min-h-0">
          <TranscriptView 
             job={viewData} 
          />
        </section>

      </main>
    </div>
  );
}

export default App;
