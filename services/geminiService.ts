import { GoogleGenAI, Modality, Part, Type } from "@google/genai";
import type { AspectRatio, GeneratedImage, UploadedImage, VeoAspectRatio, VeoHistoryItem, VeoParams, Toast } from "../types";
import { fileToBase64, generateVideoThumbnail, createCompositeImage, dataURLtoFile } from "../utils";
import { EDITING_EXAMPLES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const GENERAL_MODEL = 'gemini-2.5-flash';
const IMAGE_GEN_MODEL = 'imagen-4.0-generate-001';
const IMAGE_EDIT_MODEL = 'gemini-2.5-flash-image-preview';
const VIDEO_GEN_MODEL = 'veo-2.0-generate-001';


export const generateImages = async (
    prompt: string,
    aspectRatio: AspectRatio,
    referenceImages: UploadedImage[]
): Promise<GeneratedImage[]> => {
    
    if (referenceImages.length > 0) {
        const parts: Part[] = [];
        for (const img of referenceImages) {
            parts.push({
                inlineData: {
                    data: await fileToBase64(img.file),
                    mimeType: img.file.type,
                },
            });
        }
        parts.push({ text: `Based on the provided images, create a new image with this prompt, maintaining a ${aspectRatio} aspect ratio: ${prompt}` });

        const response = await ai.models.generateContent({
            model: IMAGE_EDIT_MODEL,
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        const generated: GeneratedImage[] = [];
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                 generated.push({
                    id: crypto.randomUUID(),
                    src: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                    alt: prompt,
                    prompt: prompt,
                });
            }
        }
        if (generated.length === 0) throw new Error("The model did not return an image.");
        return generated;

    } else {
        const response = await ai.models.generateImages({
            model: IMAGE_GEN_MODEL,
            prompt: prompt,
            config: {
                numberOfImages: 4,
                outputMimeType: 'image/png',
                aspectRatio: aspectRatio as any,
            },
        });
    
        return response.generatedImages.map(img => ({
            id: crypto.randomUUID(),
            src: `data:image/png;base64,${img.image.imageBytes}`,
            alt: prompt,
            prompt: prompt,
        }));
    }
};

export const getEditingSuggestion = async (file: File): Promise<{ description: string, suggestion: string }> => {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;
    const editingGuideString = JSON.stringify(EDITING_EXAMPLES);

    const response = await ai.models.generateContent({
        model: GENERAL_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType } },
                { text: `Analyze this image and the provided editing guide.
                1.  First, briefly describe the main subject and scene in traditional Chinese. The description should be concise and engaging.
                2.  Second, based on your description, choose the single most fitting editing prompt from the guide that would be a creative and interesting modification.
                
                Editing Guide: ${editingGuideString}
                
                Return a JSON object with two keys: "description" (your analysis in traditional Chinese) and "suggestion" (the exact prompt string from the guide).` },
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    description: { type: Type.STRING, description: '對圖片的簡潔中文描述' },
                    suggestion: { type: Type.STRING, description: '從指南中選擇的最推薦的改圖提示' }
                },
                propertyOrdering: ["description", "suggestion"]
            }
        }
    });

    try {
        const jsonText = response.text.trim();
        const json = JSON.parse(jsonText);
        if (json.description && json.suggestion) {
            return json;
        }
        throw new Error("Invalid JSON structure in suggestion response.");
    } catch (e) {
        console.error("Failed to parse suggestion JSON:", e, "Raw response:", response.text);
        throw new Error("Failed to get a valid editing suggestion from the AI.");
    }
};


export const removeBackground = async (file: File, addGreenScreen: boolean): Promise<string> => {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;
    
    const prompt = `Remove the background, leaving only the main subject. The new background should be ${addGreenScreen ? 'a solid green screen color (#00b140)' : 'transparent'}.`;

    const response = await ai.models.generateContent({
        model: IMAGE_EDIT_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType } },
                { text: prompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return part.inlineData.data;
        }
    }
    throw new Error('No image was returned from the background removal service.');
};

export const optimizePrompt = async (prompt: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: GENERAL_MODEL,
        contents: `Optimize this image generation prompt to be more vivid, detailed, and effective for a text-to-image AI. Return only the optimized prompt, without any introductory text. Original prompt: "${prompt}"`,
    });
    return response.text.trim();
};

export const inspirePrompt = async (): Promise<string> => {
    const response = await ai.models.generateContent({
        model: GENERAL_MODEL,
        contents: 'Create a random, creative, and visually interesting prompt for an AI image generator. The prompt should be a single sentence or a short paragraph. Do not use markdown or quotes.',
    });
    return response.text.trim();
};

export const analyzeImage = async (file: File): Promise<{ score: string; analysis: string }> => {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type;

    const response = await ai.models.generateContent({
        model: GENERAL_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType } },
                { text: 'Analyze the aesthetics of this image. Provide a score out of 100 and a brief, constructive analysis of its composition, lighting, color, and subject matter.' },
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    score: { type: Type.STRING },
                    analysis: { type: Type.STRING }
                }
            }
        }
    });

    try {
        const json = JSON.parse(response.text.trim());
        return { score: json.score, analysis: json.analysis };
    } catch (e) {
        console.error("Failed to parse analysis JSON:", e, "Raw response:", response.text);
        throw new Error("Failed to get a valid analysis from the AI.");
    }
};

export const enhanceWebcamImage = async (base64Data: string, mimeType: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: IMAGE_EDIT_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType } },
                { text: 'Enhance this webcam photo to improve lighting, clarity, and overall quality, making it look more professional.' },
            ],
        },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return part.inlineData.data;
    }
    throw new Error('Image enhancement failed to return an image.');
};

export const upscaleImage = async (file: File): Promise<string> => {
    const base64Data = await fileToBase64(file);
    const response = await ai.models.generateContent({
        model: IMAGE_EDIT_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType: file.type } },
                { text: 'Upscale this image, increasing its resolution and enhancing details without altering the content. Make it sharper and clearer.' },
            ],
        },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return part.inlineData.data;
    }
    throw new Error('Upscaling failed to return an image.');
};

export const zoomOutImage = async (file: File): Promise<string> => {
    const base64Data = await fileToBase64(file);
    const response = await ai.models.generateContent({
        model: IMAGE_EDIT_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType: file.type } },
                { text: 'Zoom out from this image by 2x, intelligently filling in the new surrounding areas to create a wider scene. Maintain the original style and content.' },
            ],
        },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return part.inlineData.data;
    }
    throw new Error('Zoom out failed to return an image.');
};

// --- VEO Services ---

export const describeImageForVideo = async (file: File): Promise<string> => {
    const base64Data = await fileToBase64(file);
    const response = await ai.models.generateContent({
        model: GENERAL_MODEL,
        contents: {
            parts: [
                { inlineData: { data: base64Data, mimeType: file.type } },
                { text: `扮演一位專業的電影導演，為 Veo 2 AI 影片模型分析這張圖片。嚴格按照以下12個維度輸出專業級提示詞，主動加入「角色動作運動」和「鏡頭運動」，把這張靜態圖片變成一個動態的開場腳本：[主體描述]，在[場景背景]中，[動作與姿態]，[表情情緒]，穿著[服飾與配件]，周圍環繞著[環境細節與物件]，使用[藝術風格]，[光影效果]，[構圖與視角]，整體呈現[色調與質感]、[角色動作運動]、[鏡頭運動]。不要包含長寬比資訊。` }
            ]
        }
    });
    return response.text.trim();
};

export const createDirectorScript = async (startFile: File, endFile: File): Promise<string> => {
    const startBase64 = await fileToBase64(startFile);
    const endBase64 = await fileToBase64(endFile);
    
    const response = await ai.models.generateContent({
        model: GENERAL_MODEL,
        contents: {
            parts: [
                { text: "你是專為 Veo 2 設計的電影導演。你的任務是根據「開頭場景」和「結尾場景」這兩張參考圖，構思一個從開頭自然蛻變到結尾的連續鏡頭故事。你的首要規則是：影片的最後一幀畫面，必須完全變成『結尾場景』的樣子。在這個前提下，再去構思如何從『開頭場景』自然地演變過去。請輸出一段專業的導演級腳本描述這個過程，包含鏡頭運動和角色動態。" },
                { text: "開頭場景：" },
                { inlineData: { data: startBase64, mimeType: startFile.type } },
                { text: "結尾場景：" },
                { inlineData: { data: endBase64, mimeType: endFile.type } }
            ]
        }
    });
    return response.text.trim();
};

export const generateVeoVideo = async (params: VeoParams, addToast: (message: string, type?: Toast['type']) => void): Promise<VeoHistoryItem> => {
    addToast('開始生成影片，這可能需要幾分鐘...', 'info');
    
    let compositeImage: UploadedImage | undefined = undefined;
    if (params.startFrame && params.endFrame) {
        addToast('AI導演合併圖像中...', 'info');
        const { dataUrl } = await createCompositeImage(params.startFrame.src, params.endFrame.src);
        compositeImage = {
            src: dataUrl,
            file: dataURLtoFile(dataUrl, 'composite.png')
        };
    }

    const finalPrompt = `${params.prompt}\n\n重點：影片的最後一幀畫面，必須完全符合『結尾場景』。`;

    const imageForApi = compositeImage || params.startFrame;

    let operation = await ai.models.generateVideos({
        model: VIDEO_GEN_MODEL,
        prompt: finalPrompt,
        image: imageForApi ? {
            imageBytes: await fileToBase64(imageForApi.file),
            mimeType: imageForApi.file.type,
        } : undefined,
        config: {
            numberOfVideos: 1,
            // Fix: Removed unsupported `aspectRatio` property from the generateVideos config.
        }
    });
    
    addToast('影片請求已提交，正在處理中...', 'info');

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
        operation = await ai.operations.getVideosOperation({ operation: operation });
        // Fix: The progressPercentage can be of type 'unknown' from the SDK. Cast it to a number before use.
        const progress = Number((operation.metadata as any)?.progressPercentage) || 0;
        addToast(`影片生成進度: ${Math.round(progress)}%`, 'info');
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed, but no download link was provided.");
    }
    
    addToast('影片生成完畢，正在獲取縮圖...', 'success');
    
    const videoUrlWithKey = `${downloadLink}&key=${process.env.API_KEY}`;
    const thumbnailUrl = await generateVideoThumbnail(videoUrlWithKey);

    return {
        ...params,
        id: crypto.randomUUID(),
        videoUrl: videoUrlWithKey,
        thumbnailUrl,
        timestamp: Date.now(),
    };
};
