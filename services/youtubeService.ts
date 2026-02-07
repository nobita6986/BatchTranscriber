// Service to handle YouTube interaction (Metadata + Transcript Fetching)

export interface YoutubeMetadata {
    title: string;
    thumbnail: string;
    author_name?: string;
}

const extractVideoId = (url: string): string | null => {
    // Extended regex to handle Shorts, Mobile, and Standard URLs
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(shorts\/)|(&v=))([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[9].length === 11) ? match[9] : null;
};

// OEmbed is the cleanest way to get public metadata without an API key
export const getYoutubeMetadata = async (url: string): Promise<YoutubeMetadata> => {
    try {
        const videoId = extractVideoId(url);
        if (!videoId) throw new Error("Invalid YouTube URL");

        // Use canonical watch URL for oembed to avoid issues with shorts links
        const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
        
        const res = await fetch(oembedUrl);
        if (!res.ok) throw new Error("Video not found");
        const data = await res.json();
        
        return {
            title: data.title,
            thumbnail: data.thumbnail_url,
            author_name: data.author_name
        };
    } catch (e) {
        const videoId = extractVideoId(url);
        if (!videoId) throw new Error("Invalid YouTube URL");
        
        return {
            title: `YouTube Video (${videoId})`,
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        };
    }
};

// --- HELPER: LANGUAGE SELECTION ---
const selectBestTrack = (captions: any[]) => {
    if (!captions || captions.length === 0) return null;

    const isAuto = (t: any) => (t.kind === 'asr' || (t.label && t.label.toLowerCase().includes('auto')));

    // 1. Manual English
    const manualEn = captions.find((t: any) => (t.languageCode === 'en' || t.language === 'en') && !isAuto(t));
    if (manualEn) return manualEn;

    // 2. Manual Any Language (Preferred for Japanese/other videos)
    const manualAny = captions.find((t: any) => !isAuto(t));
    if (manualAny) return manualAny;

    // 3. Auto English
    const autoEn = captions.find((t: any) => t.languageCode === 'en' || t.language === 'en');
    if (autoEn) return autoEn;

    // 4. Fallback to whatever is first
    return captions[0];
};


// --- STRATEGY 0: SearchAPI (Premium) ---
const fetchViaSearchApi = async (videoId: string, apiKey?: string): Promise<string> => {
    if (!apiKey) throw new Error("No SearchAPI key configured");

    const url = new URL('https://www.searchapi.io/api/v1/search');
    url.searchParams.append('engine', 'youtube_transcripts');
    url.searchParams.append('video_id', videoId);
    url.searchParams.append('api_key', apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
        const errText = await response.text();
        // If engine is invalid or plan doesn't support it, throw specifically
        if (response.status === 401 || response.status === 403) {
            throw new Error(`SearchAPI Key Invalid or Quota Exceeded: ${response.status}`);
        }
        throw new Error(`SearchAPI Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    if (!data.transcripts || !Array.isArray(data.transcripts) || data.transcripts.length === 0) {
        throw new Error("SearchAPI returned no transcripts.");
    }

    // Combine text parts
    const fullText = data.transcripts
        .map((t: any) => t.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    return fullText;
};


// --- STRATEGY 1: Invidious API (Free) ---
const INVIDIOUS_INSTANCES = [
    'https://inv.tux.pizza',
    'https://invidious.jing.rocks',
    'https://vid.ufficio.com.ar',
    'https://invidious.projectsegfau.lt'
];

const cleanVTT = (rawVtt: string): string => {
    return rawVtt
        .replace(/^WEBVTT/g, '') // Remove Header
        .replace(/(\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3})/g, '') // Remove Timestamps
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/^\s*$/gm, '') // Remove empty lines
        .replace(/\r?\n|\r/g, ' ') // Join lines
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim();
};

const fetchViaInvidious = async (videoId: string): Promise<string> => {
    let lastError;

    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const apiUrl = `${instance}/api/v1/videos/${videoId}`;
            const res = await fetch(apiUrl);
            if (!res.ok) continue; 
            
            const data = await res.json();
            const captions = data.captions;

            if (!captions || captions.length === 0) {
                // Video might genuinely not have captions
                throw new Error("No captions found on Invidious.");
            }

            // Use relaxed selection logic
            const track = selectBestTrack(captions);

            if (!track) throw new Error("No suitable caption track found.");

            const captionUrl = `${instance}${track.url}`;
            const capRes = await fetch(captionUrl);
            if (!capRes.ok) throw new Error("Failed to download caption text.");
            
            const vttText = await capRes.text();
            const cleanText = cleanVTT(vttText);
            if (cleanText.length < 5) throw new Error("Transcript empty after cleaning.");

            return cleanText;

        } catch (e: any) {
            // console.warn(`Invidious instance ${instance} failed:`, e.message);
            lastError = e;
        }
    }
    throw lastError || new Error("All Invidious instances failed.");
};


// --- STRATEGY 2: Raw Scraping (Fallback) ---
const PROXY_LIST = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

const fetchViaScraping = async (videoId: string): Promise<string> => {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let lastError;

    for (const proxyBase of PROXY_LIST) {
        try {
            const proxyUrl = proxyBase + encodeURIComponent(targetUrl);
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Proxy status: ${response.status}`);
            
            const html = await response.text();

            if (html.includes('class="g-recaptcha"')) throw new Error("Blocked by Captcha");

            let captionTracks;
            // Pattern 1: Direct in HTML
            const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
            if (captionMatch) {
                captionTracks = JSON.parse(captionMatch[1]);
            } else {
                // Pattern 2: Inside player response
                const playerMatch = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});/);
                if (playerMatch) {
                     const parsed = JSON.parse(playerMatch[1]);
                     captionTracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                }
            }

            if (!captionTracks || captionTracks.length === 0) throw new Error("No caption tracks found in HTML.");

            // Use relaxed selection logic
            const track = selectBestTrack(captionTracks);

            if (!track || !track.baseUrl) throw new Error("No transcript URL.");

            const xmlProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(track.baseUrl);
            const xmlRes = await fetch(xmlProxyUrl);
            const xmlText = await xmlRes.text();

            // Clean XML
            const text = xmlText
                .replace(/<text.+?>/g, ' ')
                .replace(/<\/text>/g, ' ')
                .replace(/&amp;#39;/g, "'")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, "&")
                .replace(/\s+/g, ' ')
                .trim();
            
            if (text.length === 0) throw new Error("Empty transcript content");
            
            return text;

        } catch (e: any) {
            // console.warn(`Scraping proxy ${proxyBase} failed:`, e.message);
            lastError = e;
        }
    }
    throw lastError || new Error("Scraping fallback failed (Captcha or No Captions).");
};

// --- MAIN EXPORT ---
export const fetchYoutubeTranscript = async (url: string, searchApiKey?: string): Promise<string> => {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid Video ID");

    // Strategy 0: SearchAPI (Most Reliable if Key Provided)
    if (searchApiKey) {
        try {
            return await fetchViaSearchApi(videoId, searchApiKey);
        } catch (e: any) {
            console.warn("SearchAPI failed, falling back...", e.message);
            // If quota exceeded, we fall back to free methods
        }
    }

    // Strategy 1: Invidious
    try {
        return await fetchViaInvidious(videoId);
    } catch (e) {
        console.warn("Invidious failed, falling back...", e);
    }

    // Strategy 2: Scraping
    try {
        return await fetchViaScraping(videoId);
    } catch (e: any) {
        throw new Error(`Failed to fetch transcript. The video might not have captions enabled. Details: ${e.message}`);
    }
};
