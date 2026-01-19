import { GoogleGenAI } from "@google/genai";

// Helper to convert file to Base64
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:video/mp4;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const transcribeVideo = async (file: File, apiKey: string): Promise<string> => {
  try {
    if (!apiKey) {
      throw new Error("No API Key provided. Please configure an API Key in settings.");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Prepare video data
    const base64Data = await fileToGenerativePart(file);

    // Using gemini-3-flash-preview for efficiency and multimodal capabilities
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          },
          {
            text: "Transcribe the audio from this video verbatim. Output ONLY the transcript text without any introductory or concluding remarks. If there is no speech, reply with '[No Speech Detected]'."
          }
        ]
      },
      config: {
        temperature: 0.2, // Low temperature for factual transcription
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No transcript generated.");
    }
    
    return text;

  } catch (error: any) {
    console.error("Gemini Transcription Error:", error);
    // Improve error message for common issues
    if (error.message?.includes("400")) {
       throw new Error("Bad Request: Video might be too large or format unsupported by Gemini directly.");
    }
    throw new Error(error.message || "Failed to process video");
  }
};