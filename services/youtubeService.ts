// Service to handle YouTube interaction (Metadata + Transcript Fetching)

export interface YoutubeMetadata {
    title: string;
    thumbnail: string;
    author_name?: string;
}

const SEARCH_API_KEY = 'r1Z8QfhRCLj1VuH93y6U7P56'; // Key provided by user

const extractVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// OEmbed is the cleanest way to get public metadata without an API key
export const getYoutubeMetadata = async (url: string): Promise<YoutubeMetadata> => {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
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

// --- TRANSCRIPT FETCHING STRATEGIES ---

// Strategy 0: SearchAPI (Premium/Reliable) - Uses the provided API Key
// This bypasses YouTube blocking by using a commercial scraper
const fetchViaSearchApi = async (videoId: string): Promise<string> => {
    if (!SEARCH_API_KEY) throw new Error("No SearchAPI key configured");

    const url = new URL('https://www.searchapi.io/api/v1/search');
    url.searchParams.append('engine', 'youtube_transcripts');
    url.searchParams.append('video_id', videoId);
    url.searchParams.append('api_key', SEARCH_API_KEY);

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

    // SearchAPI returns { transcripts: [ { text, start, duration, ... } ] }
    if (!data.transcripts || !Array.isArray(data.transcripts) || data.transcripts.length === 0) {
        throw new Error("SearchAPI returned no transcripts for this video.");
    }

    // Combine text parts
    const fullText = data.transcripts
        .map((t: any) => t.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    return fullText;
};


// Strategy 1: Invidious API (Best Free option for client-side)
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
                throw new Error("No captions found for this video.");
            }

            const track = captions.find((t: any) => t.language === 'en' && !t.label.toLowerCase().includes('auto')) 
                       || captions.find((t: any) => t.language === 'en')
                       || captions[0]; 

            if (!track) throw new Error("No suitable caption track found.");

            const captionUrl = `${instance}${track.url}`;
            const capRes = await fetch(captionUrl);
            if (!capRes.ok) throw new Error("Failed to download caption text.");
            
            const vttText = await capRes.text();
            const cleanText = cleanVTT(vttText);
            if (cleanText.length < 5) throw new Error("Transcript empty after cleaning.");

            return cleanText;

        } catch (e: any) {
            console.warn(`Invidious instance ${instance} failed:`, e.message);
            lastError = e;
        }
    }
    throw lastError || new Error("All Invidious instances failed.");
};


// Strategy 2: Raw HTML Scraping via Proxy (Fallback)
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
            const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
            if (captionMatch) {
                captionTracks = JSON.parse(captionMatch[1]);
            } else {
                const playerMatch = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});/);
                if (playerMatch) {
                     const parsed = JSON.parse(playerMatch[1]);
                     captionTracks = parsed?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                }
            }

            if (!captionTracks || captionTracks.length === 0) throw new Error("No caption tracks found in HTML.");

            const track = captionTracks.find((t: any) => t.languageCode === 'en' && (!t.kind || t.kind !== 'asr')) 
                       || captionTracks.find((t: any) => t.languageCode === 'en') 
                       || captionTracks[0];

            if (!track || !track.baseUrl) throw new Error("No transcript URL.");

            const xmlProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(track.baseUrl);
            const xmlRes = await fetch(xmlProxyUrl);
            const xmlText = await xmlRes.text();

            const text = xmlText
                .replace(/<text.+?>/g, ' ')
                .replace(/<\/text>/g, ' ')
                .replace(/&amp;#39;/g, "'")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, "&")
                .replace(/\s+/g, ' ')
                .trim();
            
            return text;

        } catch (e: any) {
            console.warn(`Scraping proxy ${proxyBase} failed:`, e.message);
            lastError = e;
        }
    }
    throw lastError || new Error("Scraping fallback failed.");
};

// Main Export
export const fetchYoutubeTranscript = async (url: string): Promise<string> => {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid Video ID");

    // 1. Try SearchAPI (Premium) - Most Reliable
    try {
        console.log("Attempting SearchAPI...");
        return await fetchViaSearchApi(videoId);
    } catch (e: any) {
        console.warn("SearchAPI strategy failed:", e.message);
        // Fallthrough to free methods
    }

    // 2. Try Invidious (Free API)
    try {
        console.log("Attempting Invidious API...");
        return await fetchViaInvidious(videoId);
    } catch (e) {
        console.warn("Invidious strategy failed:", e);
    }

    // 3. Try Scraping (Last Resort)
    try {
        console.log("Attempting Direct Scraping...");
        return await fetchViaScraping(videoId);
    } catch (e: any) {
        throw new Error(`Could not fetch transcript. All methods failed. Last error: ${e.message}`);
    }
};
