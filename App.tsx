


import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { ResultPanel } from './components/ResultPanel';
import { Lightbox } from './components/Lightbox';
import { HistoryPanel } from './components/HistoryPanel';
import { DrawingCanvas } from './components/DrawingCanvas';
import { VeoPanel } from './components/VeoPanel';
import {
    generateImagesWithGemini,
    optimizePromptWithGemini,
    removeBackground,
    upscaleImageWithGemini,
    analyzeImageAesthetics,
    getInspiration,
    fileToGenerativePart,
    describeImageForVeo,
    createDirectorScript,
    generateVeoVideo,
} from './services/geminiService';
import type {
    AppMode,
    GeneratedImage,
    UploadedImage,
    HistoryItem,
    LightboxConfig,
    Toast,
    DrawTool,
    AspectRatio,
    DrawingCanvasRef,
    VeoAspectRatio,
    VeoHistoryItem,
    VeoParams
} from './types';
import { ASPECT_RATIOS } from './constants';
// FIX: Add missing import for fileToBase64 from utils.ts
import { dataURLtoFile, getFileSizeFromBase64, getImageDimensions, getMimeTypeFromDataUrl, createCompositeImage, generateVideoThumbnail, fileToBase64 } from './utils';
// FIX: Removed incorrect import for MenuIcon. It is defined locally within this component.

// --- Helper Hook for localStorage ---
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        if (typeof window === "undefined") return initialValue;
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });

    const setValue: React.Dispatch<React.SetStateAction<T>> = useCallback((value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            if (typeof window !== "undefined") {
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
            }
        } catch (error) {
            console.error(error);
        }
    }, [key, storedValue]);

    return [storedValue, setValue];
}

// --- Toast Notification Component ---
const ToastNotification: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    const typeClasses = {
        success: "bg-green-600/90",
        error: "bg-red-600/90",
        info: "bg-blue-600/90"
    };

    return (
        <div className={`px-4 py-2 rounded-lg shadow-lg text-white font-semibold text-sm backdrop-blur-sm ${typeClasses[toast.type]}`}>
            {toast.message}
        </div>
    );
};

const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);


function App() {
    // --- State Management ---
    const [appMode, setAppMode] = useState<AppMode>('GENERATE');
    const [isLoading, setIsLoading] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [prompt, setPrompt] = useState('');
    const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
    const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('1:1');
    const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
    const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
    const [addGreenScreen, setAddGreenScreen] = useState(false);
    const [history, setHistory] = useLocalStorage<HistoryItem[]>('image-gen-history', []);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [drawTool, setDrawTool] = useState<DrawTool>('brush');
    const [brushSize, setBrushSize] = useState(10);
    const [fillColor, setFillColor] = useState<string>('transparent');
    const [strokeColor, setStrokeColor] = useState<string>('#FFFFFF');
    const [canvasBackgroundColor, setCanvasBackgroundColor] = useState<string>('#111827');
    const [drawAspectRatio, setDrawAspectRatio] = useState<AspectRatio>('1:1');
    const [drawBackgroundImage, setDrawBackgroundImage] = useState<string | null>(null);
    const [lightboxConfig, setLightboxConfig] = useState<LightboxConfig>(null);
    const [isControlPanelOpen, setIsControlPanelOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const modifierKey = useRef<'Ctrl' | '⌘'>('Ctrl');
    const drawCanvasRef = useRef<DrawingCanvasRef>(null);
    const [isPreviewingBrushSize, setIsPreviewingBrushSize] = useState(false);

    // --- Veo State ---
    const [veoPrompt, setVeoPrompt] = useState('');
    const [startFrame, setStartFrame] = useState<UploadedImage | null>(null);
    const [endFrame, setEndFrame] = useState<UploadedImage | null>(null);
    const [veoAspectRatio, setVeoAspectRatio] = useState<VeoAspectRatio>('16:9');
    const [videoDuration, setVideoDuration] = useState(8);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoGenerationStatus, setVideoGenerationStatus] = useState('');
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [veoHistory, setVeoHistory] = useState<VeoHistoryItem[]>([]);
    const [lastSuccessfulVeoParams, setLastSuccessfulVeoParams] = useState<VeoParams | null>(null);


    // --- Helper Functions ---
    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const processGeneratedImages = useCallback(async (base64Images: string[], generationPrompt: string): Promise<GeneratedImage[]> => {
        const newImages: GeneratedImage[] = [];
        for (const base64 of base64Images) {
            const src = `data:image/png;base64,${base64}`;
            const size = getFileSizeFromBase64(src);
            const { width, height } = await getImageDimensions(src);
            newImages.push({
                id: `img-${Date.now()}-${Math.random()}`,
                src,
                alt: generationPrompt,
                prompt: generationPrompt,
                width,
                height,
                size,
                analysis: null,
            });
        }
        return newImages;
    }, []);

    const addToHistory = useCallback((items: GeneratedImage[]) => {
        setHistory(prev => [...items, ...prev].slice(0, 100)); // Keep history to 100 items
    }, [setHistory]);

    // --- Handlers ---
    const handleGenerate = useCallback(async (currentPrompt: string, currentRefImages: UploadedImage[], currentAspectRatio: AspectRatio) => {
        if (!currentPrompt.trim() && currentRefImages.length === 0) {
            setError("請輸入提示詞或上傳參考圖。");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedImages([]);

        try {
            const imageParts = await Promise.all(currentRefImages.map(img => fileToGenerativePart(img.file)));
            const resultBase64s = await generateImagesWithGemini(currentPrompt, imageParts, currentAspectRatio);
            const newImages = await processGeneratedImages(resultBase64s, currentPrompt);
            setGeneratedImages(newImages);
            addToHistory(newImages);
        } catch (err) {
            console.error("Generation failed:", err);
            const message = err instanceof Error ? err.message : "發生未知錯誤";
            setError(`生成失敗: ${message}`);
            addToast(`生成失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [processGeneratedImages, addToHistory, addToast]);

    const handleCurrentStateGenerate = useCallback(() => {
        handleGenerate(prompt, referenceImages, selectedAspectRatio);
    }, [handleGenerate, prompt, referenceImages, selectedAspectRatio]);
    
    const handleRemoveBackground = useCallback(async () => {
        if (!uploadedImage) {
            setError("請先上傳圖片。");
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedImages([]);
        
        try {
            const base64 = (await fileToBase64(uploadedImage.file));
            const { image, text } = await removeBackground(base64, uploadedImage.file.type, addGreenScreen);
            
            if (image) {
                const generationPrompt = `Removed background from original image. ${addGreenScreen ? 'Added green screen.' : ''} ${text || ''}`.trim();
                const newImages = await processGeneratedImages([image], generationPrompt);
                setGeneratedImages(newImages);
                addToHistory(newImages);
                addToast('背景移除成功！', 'success');
            } else {
                 throw new Error(text || "模型未返回圖片。");
            }
        } catch (err) {
            console.error("Background removal failed:", err);
            const message = err instanceof Error ? err.message : "發生未知錯誤";
            setError(`移除背景失敗: ${message}`);
            addToast(`移除背景失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [uploadedImage, addGreenScreen, processGeneratedImages, addToHistory, addToast]);

    const handleOptimizePrompt = useCallback(async () => {
        const currentPrompt = appMode === 'VEO' ? veoPrompt : prompt;
        const setThePrompt = appMode === 'VEO' ? setVeoPrompt : setPrompt;

        if (!currentPrompt.trim()) {
            addToast('請先輸入提示詞', 'info');
            return;
        }
        setIsOptimizing(true);
        try {
            const optimized = await optimizePromptWithGemini(currentPrompt);
            setThePrompt(optimized);
            addToast('提示詞優化成功！', 'success');
        } catch (err) {
            console.error("Prompt optimization failed:", err);
            addToast('提示詞優化失敗', 'error');
        } finally {
            setIsOptimizing(false);
        }
    }, [prompt, veoPrompt, appMode, addToast]);
    
    const handleInspirePrompt = useCallback(async () => {
        setIsOptimizing(true); // Share loading state
        const setThePrompt = appMode === 'VEO' ? setVeoPrompt : setPrompt;
        try {
            const inspiration = await getInspiration();
            setThePrompt(prev => prev.trim() ? `${prev.trim()}, ${inspiration}` : inspiration);
        } catch(err) {
            console.error("Inspire failed:", err);
            addToast('獲取靈感失敗', 'error');
        } finally {
            setIsOptimizing(false);
        }
    }, [appMode, addToast]);
    
    const handleClearSettings = useCallback(() => {
        setPrompt('');
        setReferenceImages([]);
        setUploadedImage(null);
        setSelectedAspectRatio('1:1');
        setVeoPrompt('');
        setStartFrame(null);
        setEndFrame(null);
        setVeoAspectRatio('16:9');
        setVideoDuration(8);
        addToast('設定已清除', 'info');
    }, [addToast]);

    const handleUpscale = useCallback(async (src: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const base64 = src.split(',')[1];
            const mimeType = getMimeTypeFromDataUrl(src);
            const upscaledBase64 = await upscaleImageWithGemini(base64, mimeType);
            const newImages = await processGeneratedImages([upscaledBase64], `Upscaled image.`);
            setGeneratedImages(newImages);
            addToHistory(newImages);
            addToast('畫質提升成功！', 'success');
        } catch (err) {
            console.error("Upscale failed:", err);
            const message = err instanceof Error ? err.message : "發生未知錯誤";
            setError(`提升畫質失敗: ${message}`);
            addToast(`提升畫質失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
            setLightboxConfig(null);
        }
    }, [processGeneratedImages, addToHistory, addToast]);
    
    const handleZoomOut = useCallback(async (item: GeneratedImage) => {
        setIsLoading(true);
        setError(null);
        setLightboxConfig(null);
        try {
            const file = dataURLtoFile(item.src, 'zoom-out-source.png');
            const imagePart = await fileToGenerativePart(file);
            const zoomPrompt = 'Zoom out 2x from this image. Expand the scene naturally while keeping the original content centered and perfectly preserved.';
            const resultBase64s = await generateImagesWithGemini(zoomPrompt, [imagePart], '1:1'); // Zoom out is best with 1:1
            const newImages = await processGeneratedImages(resultBase64s, `Zoom out of: ${item.alt}`);
            setGeneratedImages(newImages);
            addToHistory(newImages);
            addToast('Zoom Out 成功!', 'success');
        } catch (err) {
            console.error("Zoom out failed:", err);
            const message = err instanceof Error ? err.message : "發生未知錯誤";
            setError(`Zoom out 失敗: ${message}`);
            addToast(`Zoom out 失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [processGeneratedImages, addToHistory, addToast]);
    
    const handleUseImage = useCallback(async (image: GeneratedImage, action: 'reference' | 'remove_bg' | 'draw_bg') => {
        addToast('影像已載入', 'success');
        setLightboxConfig(null);
        const file = dataURLtoFile(image.src, 'used-image.png');
        const uploaded: UploadedImage = { src: image.src, file };

        if (action === 'reference') {
            setReferenceImages(prev => [...prev, uploaded].slice(0, 8));
            setAppMode('GENERATE');
        } else if (action === 'remove_bg') {
            setUploadedImage(uploaded);
            setAppMode('REMOVE_BG');
        } else if (action === 'draw_bg') {
            setDrawBackgroundImage(image.src);
            setAppMode('DRAW');
        }
    }, [addToast]);

    const handleSelectItemForAnalysis = useCallback(async (item: HistoryItem) => {
        setSelectedHistoryItem(item);
        if (item.analysis) return; // Already analyzed

        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
            const file = dataURLtoFile(item.src, 'history-item.png');
            const imagePart = await fileToGenerativePart(file);
            const analysisResult = await analyzeImageAesthetics(imagePart);
            
            const updatedItem = { ...item, analysis: analysisResult };
            setHistory(prev => prev.map(h => h.id === item.id ? updatedItem : h));
            setSelectedHistoryItem(updatedItem);
        } catch (err) {
            console.error("Analysis failed:", err);
            const message = err instanceof Error ? err.message : "發生未知錯誤";
            setAnalysisError(`分析失敗: ${message}`);
        } finally {
            setIsAnalyzing(false);
        }
    }, [setHistory]);

    const handleUseDrawing = useCallback(async () => {
        const dataUrl = drawCanvasRef.current?.exportImage();
        if (dataUrl) {
            const file = dataURLtoFile(dataUrl, 'drawing.png');
            setReferenceImages(prev => [...prev, { src: dataUrl, file }].slice(0, 8));
            setAppMode('GENERATE');
            addToast('畫布已作為參考圖', 'success');
        }
    }, [addToast]);
    
    // --- VEO Handlers ---
    const handleGenerateVeo = useCallback(async () => {
        if (!veoPrompt && !startFrame && !endFrame) {
            addToast('請提供提示詞或首尾幀圖片', 'error');
            return;
        }
        setIsGeneratingVideo(true);
        setGeneratedVideoUrl(null);
        
        const currentParams: VeoParams = { prompt: veoPrompt, startFrame, endFrame, aspectRatio: veoAspectRatio, duration: videoDuration };

        try {
            let finalPrompt = veoPrompt;
            let compositeImage: { imageBytes: string; mimeType: string } | undefined;
            
            // AI Director Workflow
            if (startFrame && endFrame) {
                setVideoGenerationStatus("正在分析首幀...");
                const startPart = await fileToGenerativePart(startFrame.file);
                const startDesc = await describeImageForVeo(startPart);

                setVideoGenerationStatus("正在分析尾幀...");
                const endPart = await fileToGenerativePart(endFrame.file);
                const endDesc = await describeImageForVeo(endPart);

                setVideoGenerationStatus("AI導演正在構思轉場劇本...");
                const directorScript = await createDirectorScript(veoPrompt, startDesc, endDesc);

                setVideoGenerationStatus("正在合併參考圖...");
                const { dataUrl: compositeDataUrl } = await createCompositeImage(startFrame.src, endFrame.src);
                compositeImage = {
                    imageBytes: compositeDataUrl.split(',')[1],
                    mimeType: 'image/png'
                };
                
                finalPrompt = `使用者核心提示: ${veoPrompt}\n\n導演級轉場劇本: ${directorScript}\n\n首幀分析:\n${startDesc}\n\n尾幀分析:\n${endDesc}\n\n技術要求: 生成一個${videoDuration}秒的影片。重點：影片的最後一幀畫面，必須完全符合『結尾場景』`;

            } else {
                 finalPrompt = `${veoPrompt}, a ${videoDuration} second video`;
                 if (startFrame) {
                    const { file } = startFrame;
                    compositeImage = { imageBytes: await fileToBase64(file), mimeType: file.type };
                 }
            }

            const videoResultUrl = await generateVeoVideo(finalPrompt, compositeImage, setVideoGenerationStatus);

            setVideoGenerationStatus("正在生成影片縮圖...");
            const thumbnailUrl = await generateVideoThumbnail(`${videoResultUrl}&key=${process.env.API_KEY}`);
            
            const newHistoryItem: VeoHistoryItem = {
                ...currentParams,
                id: `veo-${Date.now()}`,
                videoUrl: videoResultUrl,
                thumbnailUrl,
                timestamp: Date.now(),
            };
            
            setVeoHistory(prev => [newHistoryItem, ...prev]);
            setGeneratedVideoUrl(videoResultUrl);
            setLastSuccessfulVeoParams(currentParams);
            addToast("影片生成成功！", "success");

        } catch (err) {
            console.error("Veo generation failed:", err);
            const message = err instanceof Error ? err.message : "發生未知錯誤";
            addToast(`影片生成失敗: ${message}`, 'error');
        } finally {
            setIsGeneratingVideo(false);
            setVideoGenerationStatus('');
        }
    }, [veoPrompt, startFrame, endFrame, veoAspectRatio, videoDuration, addToast]);

    const handleVeoImageUpdate = useCallback(async (start: UploadedImage | null, end: UploadedImage | null) => {
        if (!start || !end) return; // Only trigger for dual frames
        
        setIsOptimizing(true); // Reuse optimizing state for loading indicator
        addToast("AI導演分析中，即將自動生成提示...", "info");
        try {
            const startPart = await fileToGenerativePart(start.file);
            const startDesc = await describeImageForVeo(startPart);
            const endPart = await fileToGenerativePart(end.file);
            const endDesc = await describeImageForVeo(endPart);
            const directorScript = await createDirectorScript("", startDesc, endDesc);
            setVeoPrompt(directorScript);
        } catch (err) {
            console.error("Auto-prompt generation failed:", err);
            addToast("自動生成提示失敗", "error");
        } finally {
            setIsOptimizing(false);
        }
    }, [addToast]);

    useEffect(() => {
        handleVeoImageUpdate(startFrame, endFrame);
    }, [startFrame, endFrame, handleVeoImageUpdate]);


    // --- Effects ---
    useEffect(() => {
        // Set modifier key
        modifierKey.current = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

        // Check for mobile
        const checkMobile = () => {
            const isNowMobile = window.innerWidth < 768;
            setIsMobile(isNowMobile);
            if (!isNowMobile) {
                setIsControlPanelOpen(true);
            } else {
                 setIsControlPanelOpen(false);
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Effect for keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const modifier = modifierKey.current === '⌘' ? e.metaKey : e.ctrlKey;
            if (modifier) {
                switch (e.key) {
                    case 'Enter':
                        e.preventDefault();
                        if (appMode === 'GENERATE' || appMode === 'CHARACTER_CREATOR') handleCurrentStateGenerate();
                        else if (appMode === 'REMOVE_BG') handleRemoveBackground();
                        else if (appMode === 'DRAW') handleUseDrawing();
                        else if (appMode === 'VEO') handleGenerateVeo();
                        break;
                    case 'o':
                    case 'O':
                         e.preventDefault();
                         handleOptimizePrompt();
                         break;
                    case 'i':
                    case 'I':
                        e.preventDefault();
                        handleInspirePrompt();
                        break;
                    case 'Backspace':
                        e.preventDefault();
                        handleClearSettings();
                        break;
                }
            }
            if (e.key === '[' && appMode === 'DRAW') {
                e.preventDefault();
                setBrushSize(s => Math.max(1, s - 1));
                setIsPreviewingBrushSize(true);
            }
            if (e.key === ']' && appMode === 'DRAW') {
                e.preventDefault();
                setBrushSize(s => Math.min(100, s + 1));
                setIsPreviewingBrushSize(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
             if (['[', ']'].includes(e.key)) {
                setIsPreviewingBrushSize(false);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [appMode, handleCurrentStateGenerate, handleRemoveBackground, handleUseDrawing, handleOptimizePrompt, handleInspirePrompt, handleClearSettings, handleGenerateVeo]);
    
    // Effect for clipboard paste
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const src = e.target?.result as string;
                            const newImage = { src, file };
                            if (appMode === 'REMOVE_BG') {
                                setUploadedImage(newImage);
                            } else if (appMode === 'DRAW') {
                                setDrawBackgroundImage(src);
                            } else {
                                setReferenceImages(prev => [...prev, newImage].slice(0, 8));
                            }
                            addToast('已從剪貼簿貼上圖片', 'success');
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [appMode, addToast]);


    const renderMainPanel = () => {
        switch (appMode) {
            case 'GENERATE':
            case 'CHARACTER_CREATOR':
            case 'REMOVE_BG':
                return (
                    <ResultPanel
                        images={generatedImages}
                        isLoading={isLoading}
                        error={error}
                        onPromptSelect={(p) => { setPrompt(p); handleGenerate(p, [], selectedAspectRatio); }}
                        onUpscale={handleUpscale}
                        onZoomOut={handleZoomOut}
                        onSetLightboxConfig={(images, startIndex) => setLightboxConfig({ images, startIndex })}
                        onUseImage={handleUseImage}
                    />
                );
            case 'DRAW':
                return (
                    <div className="flex-1 flex items-center justify-center p-4 bg-black">
                         <DrawingCanvas
                            ref={drawCanvasRef}
                            tool={drawTool}
                            brushSize={brushSize}
                            fillColor={fillColor}
                            strokeColor={strokeColor}
                            backgroundColor={canvasBackgroundColor}
                            aspectRatio={drawAspectRatio}
                            backgroundImage={drawBackgroundImage}
                            isPreviewingBrushSize={isPreviewingBrushSize}
                        />
                    </div>
                );
            case 'HISTORY':
                return (
                    <HistoryPanel
                        history={history}
                        selectedItem={selectedHistoryItem}
                        onSelectItem={handleSelectItemForAnalysis}
                        isAnalyzing={isAnalyzing}
                        analysisError={analysisError}
                        onUseHistoryItem={(item) => handleUseImage(item, 'reference')}
                        onDeleteHistoryItem={(id) => {
                             setHistory(prev => prev.filter(item => item.id !== id));
                             if (selectedHistoryItem?.id === id) setSelectedHistoryItem(null);
                             addToast('紀錄已刪除', 'success');
                        }}
                        onClearHistory={() => {
                            if(window.confirm('確定要清除所有歷史紀錄嗎？此操作無法復原。')) {
                                setHistory([]);
                                setSelectedHistoryItem(null);
                                addToast('歷史紀錄已清除', 'success');
                            }
                        }}
                        onSetLightboxConfig={(images, startIndex) => setLightboxConfig({ images, startIndex })}
                        addToast={addToast}
                        onUseImage={(src, mode) => {
                            const file = dataURLtoFile(src, 'from-history.png');
                            if (mode === 'REMOVE_BG') {
                                setUploadedImage({src, file});
                                setAppMode('REMOVE_BG');
                            } else if (mode === 'DRAW') {
                                setDrawBackgroundImage(src);
                                setAppMode('DRAW');
                            }
                        }}
                        onUpscale={handleUpscale}
                        onZoomOut={(src) => {
                            const item = history.find(h => h.src === src);
                            if (item) handleZoomOut(item);
                        }}
                    />
                );
            case 'VEO':
                return (
                    <VeoPanel
                        isLoading={isGeneratingVideo}
                        loadingMessage={videoGenerationStatus}
                        videoUrl={generatedVideoUrl}
                        history={veoHistory}
                        onDeleteHistory={(id) => setVeoHistory(prev => prev.filter(item => item.id !== id))}
                        onRestoreSettings={(params) => {
                            setVeoPrompt(params.prompt);
                            setStartFrame(params.startFrame);
                            setEndFrame(params.endFrame);
                            setVeoAspectRatio(params.aspectRatio);
                            setVideoDuration(params.duration);
                            addToast('設定已還原', 'success');
                        }}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
            <ControlPanel
                appMode={appMode}
                setAppMode={setAppMode}
                onGenerate={handleCurrentStateGenerate}
                onRemoveBackground={handleRemoveBackground}
                isLoading={isLoading}
                uploadedImage={uploadedImage}
                setUploadedImage={setUploadedImage}
                referenceImages={referenceImages}
                setReferenceImages={setReferenceImages}
                onRemoveReferenceImage={(index) => setReferenceImages(prev => prev.filter((_, i) => i !== index))}
                prompt={prompt}
                setPrompt={setPrompt}
                selectedAspectRatio={selectedAspectRatio}
                onAspectRatioSelect={setSelectedAspectRatio}
                isOptimizing={isOptimizing}
                onOptimizePrompt={handleOptimizePrompt}
                onInspirePrompt={handleInspirePrompt}
                onClearSettings={handleClearSettings}
                addGreenScreen={addGreenScreen}
                setAddGreenScreen={setAddGreenScreen}
                drawTool={drawTool}
                setDrawTool={setDrawTool}
                brushSize={brushSize}
                onBrushSizeChange={setBrushSize}
                fillColor={fillColor}
                setFillColor={setFillColor}
                strokeColor={strokeColor}
                setStrokeColor={setStrokeColor}
                drawAspectRatio={drawAspectRatio}
                setDrawAspectRatio={setDrawAspectRatio}
                canvasBackgroundColor={canvasBackgroundColor}
                setCanvasBackgroundColor={setCanvasBackgroundColor}
                onClearCanvas={() => drawCanvasRef.current?.clear()}
                onUndoCanvas={() => drawCanvasRef.current?.undo()}
                onUseDrawing={handleUseDrawing}
                onDrawBackgroundUpload={(file) => {
                     const reader = new FileReader();
                     reader.onload = (e) => setDrawBackgroundImage(e.target?.result as string);
                     reader.readAsDataURL(file);
                }}
                isControlPanelOpen={isControlPanelOpen}
                setIsControlPanelOpen={setIsControlPanelOpen}
                isMobile={isMobile}
                modifierKey={modifierKey.current}
                // VEO Props
                veoPrompt={veoPrompt}
                setVeoPrompt={setVeoPrompt}
                startFrame={startFrame}
                setStartFrame={setStartFrame}
                endFrame={endFrame}
                setEndFrame={setEndFrame}
                veoAspectRatio={veoAspectRatio}
                setVeoAspectRatio={setVeoAspectRatio}
                videoDuration={videoDuration}
                setVideoDuration={setVideoDuration}
                onGenerateVeo={handleGenerateVeo}
                isGeneratingVideo={isGeneratingVideo}
            />
            
            <div className="flex-1 flex flex-col min-w-0 relative">
                {isMobile && !isControlPanelOpen && (
                    <button onClick={() => setIsControlPanelOpen(true)} className="absolute top-4 left-4 z-30 p-2 bg-gray-900/80 rounded-full">
                        <MenuIcon className="w-6 h-6"/>
                    </button>
                )}
                {renderMainPanel()}
            </div>

            {lightboxConfig && (
                <Lightbox
                    config={lightboxConfig}
                    onClose={() => setLightboxConfig(null)}
                    onUpscale={handleUpscale}
                    onZoomOut={handleZoomOut}
                    onUseImage={handleUseImage}
                />
            )}
            
             <div className="absolute bottom-4 right-4 z-50 flex flex-col items-end gap-2">
                {toasts.map(toast => (
                    <ToastNotification key={toast.id} toast={toast} onDismiss={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} />
                ))}
            </div>
        </div>
    );
}

export default App;