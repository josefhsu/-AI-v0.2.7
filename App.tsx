import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { ResultPanel } from './components/ResultPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { Lightbox } from './components/Lightbox';
import { DrawingCanvas } from './components/DrawingCanvas';
import { VeoPanel } from './components/VeoPanel';
import type {
    AppMode,
    AspectRatio,
    GeneratedImage,
    HistoryItem,
    LightboxConfig,
    Toast,
    UploadedImage,
    DrawTool,
    DrawingCanvasRef,
    VeoParams,
    VeoHistoryItem,
    VeoAspectRatio,
} from './types';
import * as geminiService from './services/geminiService';
import { dataURLtoFile, getFileSizeFromBase64, getImageDimensions } from './utils';
import { API_SUPPORTED_ASPECT_RATIOS, ASPECT_RATIOS } from './constants';

const App: React.FC = () => {
    // --- Core State ---
    const [appMode, setAppMode] = useState<AppMode>('GENERATE');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [images, setImages] = useState<GeneratedImage[]>([]);
    const [isControlPanelOpen, setIsControlPanelOpen] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [modifierKey, setModifierKey] = useState<'Ctrl' | '⌘'>('Ctrl');

    // --- Toast State ---
    const [toasts, setToasts] = useState<Toast[]>([]);

    // --- Generate Mode State ---
    const [prompt, setPrompt] = useState('');
    const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
    const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>('1:1');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isSuggestingEdit, setIsSuggestingEdit] = useState(false);
    const prevRefImagesCount = useRef(0);

    // --- Remove BG Mode State ---
    const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
    const [addGreenScreen, setAddGreenScreen] = useState(false);

    // --- Draw Mode State ---
    const drawCanvasRef = useRef<DrawingCanvasRef>(null);
    const [drawTool, setDrawTool] = useState<DrawTool>('brush');
    const [brushSize, setBrushSize] = useState(10);
    const [fillColor, setFillColor] = useState('transparent');
    const [strokeColor, setStrokeColor] = useState('#FFFFFF');
    const [drawAspectRatio, setDrawAspectRatio] = useState<AspectRatio>('1:1');
    const [canvasBackgroundColor, setCanvasBackgroundColor] = useState('#111827');
    const [drawBackgroundImage, setDrawBackgroundImage] = useState<string | null>(null);
    const [isPreviewingBrushSize, setIsPreviewingBrushSize] = useState(false);


    // --- History Mode State ---
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // --- VEO Mode State ---
    const [veoPrompt, setVeoPrompt] = useState('');
    const [startFrame, setStartFrame] = useState<UploadedImage | null>(null);
    const [endFrame, setEndFrame] = useState<UploadedImage | null>(null);
    const [veoAspectRatio, setVeoAspectRatio] = useState<VeoAspectRatio>('16:9');
    const [videoDuration, setVideoDuration] = useState(5);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [veoHistory, setVeoHistory] = useState<VeoHistoryItem[]>([]);
    const [currentVeoVideo, setCurrentVeoVideo] = useState<VeoHistoryItem | null>(null);
    const [lastVeoSuccessParams, setLastVeoSuccessParams] = useState<VeoParams | null>(null);
    const [isAnalyzingFrames, setIsAnalyzingFrames] = useState(false);


    // --- Lightbox State ---
    const [lightboxConfig, setLightboxConfig] = useState<LightboxConfig>(null);

    // --- Effects ---

    // Load history from localStorage on mount
    useEffect(() => {
        try {
            const savedHistory = localStorage.getItem('image-gen-history');
            if (savedHistory) {
                setHistory(JSON.parse(savedHistory));
            }
        } catch (e) {
            console.error("Failed to load history from localStorage", e);
        }
        
        if (navigator.userAgent.indexOf("Mac") !== -1) {
            setModifierKey("⌘");
        }

        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Save history to localStorage when it changes
    useEffect(() => {
        try {
            localStorage.setItem('image-gen-history', JSON.stringify(history));
        } catch (e) {
            console.error("Failed to save history to localStorage", e);
        }
    }, [history]);

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
        }, 5000); // Increased duration for important messages
    }, []);

    // AI Editing Advisor Effect
    useEffect(() => {
        const handleSuggestion = async () => {
            if (appMode === 'GENERATE' && referenceImages.length > prevRefImagesCount.current) {
                const newImage = referenceImages[referenceImages.length - 1];
                if (newImage && !newImage.isPlaceholder) {
                    setIsSuggestingEdit(true);
                    addToast("AI改圖顧問分析中...", "info");
                    try {
                        const { description, suggestion } = await geminiService.getEditingSuggestion(newImage.file);
                        setPrompt(p => {
                            const currentPrompt = p ? p.trim() + "\n\n" : "";
                            const newFullPrompt = currentPrompt + suggestion;
                            addToast(`為您推薦改圖：${description}`, "success");
                            return newFullPrompt;
                        });
                    } catch (err) {
                        const message = err instanceof Error ? err.message : '未知錯誤';
                        addToast(`建議獲取失敗: ${message}`, "error");
                    } finally {
                        setIsSuggestingEdit(false);
                    }
                }
            }
            prevRefImagesCount.current = referenceImages.length;
        };
        handleSuggestion();
    }, [referenceImages, appMode, addToast]);


    // --- Utility Functions ---
    const addToHistory = useCallback(async (newImages: Omit<GeneratedImage, 'width' | 'height' | 'size'>[]) => {
        const newHistoryItems: HistoryItem[] = [];
        for(const image of newImages) {
            try {
                const { width, height } = await getImageDimensions(image.src);
                const size = getFileSizeFromBase64(image.src);
                newHistoryItems.push({ ...image, width, height, size, analysis: null });
            } catch (err) {
                 console.error("Could not get image metadata", err);
                 newHistoryItems.push({ ...image, analysis: null });
            }
        }
        setHistory(prev => [...newHistoryItems, ...prev].slice(0, 50)); // Limit history size
    }, []);

    // --- API Handlers ---

    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) {
            addToast("請輸入提示詞", "error");
            return;
        }
        setIsLoading(true);
        setError(null);
        setImages([]);
        if (appMode !== 'GENERATE' && appMode !== 'CHARACTER_CREATOR') setAppMode('GENERATE');

        try {
            let aspectRatioToUse = selectedAspectRatio;
            if (!API_SUPPORTED_ASPECT_RATIOS.includes(selectedAspectRatio)) {
                addToast(`長寬比 ${selectedAspectRatio} 不支援，將使用 1:1`, 'info');
                aspectRatioToUse = '1:1';
            }
            const result = await geminiService.generateImages(prompt, aspectRatioToUse, referenceImages);
            setImages(result);
            addToHistory(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : '發生未知錯誤';
            setError(message);
            addToast(`生成失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [prompt, selectedAspectRatio, referenceImages, appMode, addToast, addToHistory]);

    const handleRemoveBackground = useCallback(async () => {
        if (!uploadedImage) {
            addToast("請先上傳圖片", "error");
            return;
        }
        setIsLoading(true);
        setError(null);
        setImages([]);

        try {
            const resultBase64 = await geminiService.removeBackground(uploadedImage.file, addGreenScreen);
            const resultSrc = `data:image/png;base64,${resultBase64}`;
            const newImage: Omit<GeneratedImage, 'width'|'height'|'size'> = {
                id: crypto.randomUUID(),
                src: resultSrc,
                alt: `${uploadedImage.file.name} - background removed`,
                prompt: `Remove background from original image, green screen: ${addGreenScreen}`
            };
            setImages([newImage]);
            addToHistory([newImage]);
        } catch (err) {
            const message = err instanceof Error ? err.message : '發生未知錯誤';
            setError(message);
            addToast(`去背失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [uploadedImage, addGreenScreen, addToast, addToHistory]);

    const handleOptimizePrompt = useCallback(async () => {
        const currentPrompt = appMode === 'VEO' ? veoPrompt : prompt;
        if (!currentPrompt.trim()) {
            addToast("請先輸入要優化的提示詞", "error");
            return;
        }
        setIsOptimizing(true);
        try {
            const optimized = await geminiService.optimizePrompt(currentPrompt);
            if (appMode === 'VEO') {
                setVeoPrompt(optimized);
            } else {
                setPrompt(optimized);
            }
            addToast("提示詞已優化", "success");
        } catch (err) {
            addToast(`優化失敗: ${err instanceof Error ? err.message : '未知錯誤'}`, 'error');
        } finally {
            setIsOptimizing(false);
        }
    }, [prompt, veoPrompt, appMode, addToast]);

    // --- VEO Handlers ---
    const handleGenerateVeo = useCallback(async (paramsOverride?: VeoParams) => {
        const paramsToUse = paramsOverride || { prompt: veoPrompt, startFrame, endFrame, aspectRatio: veoAspectRatio, duration: videoDuration };
        
        if (!paramsToUse.prompt.trim()) {
            addToast("請輸入影片提示詞", "error");
            return;
        }
        setIsGeneratingVideo(true);
        setError(null);
        
        try {
            const result = await geminiService.generateVeoVideo(paramsToUse, addToast);
            const newHistory = [result, ...veoHistory];
            setVeoHistory(newHistory);
            setCurrentVeoVideo(result);
            setLastVeoSuccessParams(paramsToUse);
            addToast("影片生成成功！", "success");
        } catch (err) {
            const message = err instanceof Error ? err.message : '發生未知錯誤';
            setError(message);
            addToast(`影片生成失敗: ${message}`, 'error');
        } finally {
            setIsGeneratingVideo(false);
        }
    }, [veoPrompt, startFrame, endFrame, veoAspectRatio, videoDuration, addToast, veoHistory]);

    const handleVeoImageChange = useCallback(async (
        newStartFrame: UploadedImage | null,
        newEndFrame: UploadedImage | null
    ) => {
        if (!newStartFrame && !newEndFrame) return;

        setIsAnalyzingFrames(true);
        addToast("AI導演分析中...", "info");
        try {
            let directorPrompt = '';
            if (newStartFrame && newEndFrame) {
                directorPrompt = await geminiService.createDirectorScript(newStartFrame.file, newEndFrame.file);
            } else if (newStartFrame || newEndFrame) {
                const imageFile = (newStartFrame || newEndFrame)!.file;
                directorPrompt = await geminiService.describeImageForVideo(imageFile);
            }
            setVeoPrompt(directorPrompt);
            addToast("提示詞已自動生成！", "success");
        } catch (err) {
            addToast(`AI導演分析失敗: ${err instanceof Error ? err.message : '未知錯誤'}`, 'error');
        } finally {
            setIsAnalyzingFrames(false);
        }
    }, [addToast]);

    const handleStartFrameChange = (image: UploadedImage | null) => {
        setStartFrame(image);
        handleVeoImageChange(image, endFrame);
    };

    const handleEndFrameChange = (image: UploadedImage | null) => {
        setEndFrame(image);
        handleVeoImageChange(startFrame, image);
    };

    const handleVeoRegenerate = useCallback(() => {
        const paramsToRegen = currentVeoVideo || lastVeoSuccessParams;
        if (paramsToRegen) {
            handleGenerateVeo(paramsToRegen);
        } else {
            addToast("沒有可再生成的設定", "info");
        }
    }, [currentVeoVideo, lastVeoSuccessParams, handleGenerateVeo, addToast]);

    const handleVeoUseText = useCallback(() => {
        if (currentVeoVideo) {
            setVeoPrompt(currentVeoVideo.prompt);
            setStartFrame(null);
            setEndFrame(null);
            addToast("已使用影片文字並清除圖片", "success");
            setCurrentVeoVideo(null); // Clear video to reflect change
        } else {
             addToast("沒有可使用的文字", "info");
        }
    }, [currentVeoVideo, addToast]);

    const handleVeoRestore = useCallback(() => {
        const paramsToRestore = currentVeoVideo || lastVeoSuccessParams;
        if (paramsToRestore) {
            setVeoPrompt(paramsToRestore.prompt);
            setStartFrame(paramsToRestore.startFrame);
            setEndFrame(paramsToRestore.endFrame);
            setVeoAspectRatio(paramsToRestore.aspectRatio);
            setVideoDuration(paramsToRestore.duration);
            addToast("已還原設定", "success");
        } else {
            addToast("沒有可還原的設定", "info");
        }
    }, [currentVeoVideo, lastVeoSuccessParams, addToast]);

    const handleVeoDelete = (id: string) => {
        if (currentVeoVideo?.id === id) {
            const currentIndex = veoHistory.findIndex(item => item.id === id);
            if (veoHistory.length > 1) {
                const nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
                setCurrentVeoVideo(veoHistory[nextIndex] || null);
            } else {
                 setCurrentVeoVideo(null);
            }
        }
        setVeoHistory(h => h.filter(item => item.id !== id));
    };

    const handleSendImageToVeo = useCallback((src: string, frame: 'start' | 'end') => {
        const file = dataURLtoFile(src, `veo-frame-${frame}.png`);
        const uploadedImage: UploadedImage = { src, file };
        
        if (frame === 'start') {
            handleStartFrameChange(uploadedImage);
        } else {
            handleEndFrameChange(uploadedImage);
        }
        
        setAppMode('VEO');
        setLightboxConfig(null);
        addToast(`圖片已傳送至 ${frame === 'start' ? '首幀' : '尾幀'}`, 'success');
    }, [addToast]);

    // --- UI Handlers ---

    const onClearSettings = useCallback(() => {
        setPrompt('');
        setReferenceImages([]);
        setSelectedAspectRatio('1:1');
        addToast("設定已清除");
    }, [addToast]);
    
    const onClearVeoSettings = useCallback(() => {
        setVeoPrompt('');
        setStartFrame(null);
        setEndFrame(null);
        setVeoAspectRatio('16:9');
        setVideoDuration(5);
        addToast("Veo 設定已清除");
    }, [addToast]);
    
    const onInspirePrompt = useCallback(async () => {
        setIsOptimizing(true); // Reuse optimizing state for loading indicator
        try {
            const inspired = await geminiService.inspirePrompt();
            if (appMode === 'VEO') {
                setVeoPrompt(inspired);
            } else {
                setPrompt(inspired);
            }
        } catch(err) {
            addToast(`靈感獲取失敗: ${err instanceof Error ? err.message : '未知錯誤'}`, 'error');
        } finally {
            setIsOptimizing(false);
        }
    }, [appMode, addToast]);
    
    const onUseImage = useCallback((image: GeneratedImage, action: 'reference' | 'remove_bg' | 'draw_bg') => {
        const file = dataURLtoFile(image.src, `used-${image.id}.png`);
        const uploaded: UploadedImage = { src: image.src, file };

        switch(action) {
            case 'reference':
                setReferenceImages(prev => [...prev, uploaded].slice(0, 8));
                setAppMode('GENERATE');
                addToast("圖片已添加至參考圖", "success");
                break;
            case 'remove_bg':
                setUploadedImage(uploaded);
                setAppMode('REMOVE_BG');
                break;
            case 'draw_bg':
                setDrawBackgroundImage(image.src);
                setAppMode('DRAW');
                addToast("圖片已設為畫布背景", "success");
                break;
        }
        setLightboxConfig(null);
    }, [addToast]);
    
    const onUseHistoryImage = useCallback((src: string, targetMode: AppMode) => {
        const file = dataURLtoFile(src, `history-img.png`);
        const uploaded: UploadedImage = { src, file };

        if (targetMode === 'REMOVE_BG') {
            setUploadedImage(uploaded);
            setAppMode('REMOVE_BG');
        } else if (targetMode === 'DRAW') {
            setDrawBackgroundImage(src);
            setAppMode('DRAW');
        }
    }, []);

    const onUpscale = useCallback(async (src: string) => {
        setIsLoading(true);
        setError(null);
        setImages([]);
        setAppMode('GENERATE');
        setLightboxConfig(null);

        try {
            const file = dataURLtoFile(src, 'upscale.png');
            const resultBase64 = await geminiService.upscaleImage(file);
            const resultSrc = `data:image/png;base64,${resultBase64}`;
            const newImage: Omit<GeneratedImage, 'width'|'height'|'size'> = {
                id: crypto.randomUUID(),
                src: resultSrc,
                alt: 'Upscaled image',
                prompt: 'Upscaled image'
            };
            setImages([newImage]);
            addToHistory([newImage]);
            addToast("圖片畫質已提升", "success");
        } catch (err) {
            const message = err instanceof Error ? err.message : '發生未知錯誤';
            setError(message);
            addToast(`提升畫質失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast, addToHistory]);

    const onZoomOut = useCallback(async (item: GeneratedImage) => {
        setIsLoading(true);
        setError(null);
        setImages([]);
        setAppMode('GENERATE');
        setLightboxConfig(null);

        try {
            const file = dataURLtoFile(item.src, 'zoomout.png');
            const resultBase64 = await geminiService.zoomOutImage(file);
            const resultSrc = `data:image/png;base64,${resultBase64}`;
            const newImage: Omit<GeneratedImage, 'width'|'height'|'size'> = {
                id: crypto.randomUUID(),
                src: resultSrc,
                alt: 'Zoomed out image',
                prompt: item.prompt
            };
            setImages([newImage]);
            addToHistory([newImage]);
            addToast("圖片已擴圖", "success");
        } catch (err) {
            const message = err instanceof Error ? err.message : '發生未知錯誤';
            setError(message);
            addToast(`擴圖失敗: ${message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast, addToHistory]);

    const handlePromptSelect = (p: string) => {
        setPrompt(p);
        setAppMode('GENERATE');
    };
    
    const handleUseDrawing = useCallback(async () => {
        if (!drawCanvasRef.current) return;
        const dataUrl = drawCanvasRef.current.exportImage();
        const file = dataURLtoFile(dataUrl, 'drawing.png');
        setReferenceImages([{ src: dataUrl, file }]);
        setAppMode('GENERATE');
        addToast("畫布已作為參考圖", "success");
    }, [addToast]);

    const handleHistorySelect = useCallback(async (item: HistoryItem) => {
        setSelectedHistoryItem(item);
        if (item.analysis) return; // Don't re-analyze

        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
            const analysisResult = await geminiService.analyzeImage(dataURLtoFile(item.src, 'analysis.png'));
            const updatedHistory = history.map(h => h.id === item.id ? { ...h, analysis: analysisResult } : h);
            setHistory(updatedHistory);
            setSelectedHistoryItem(prev => prev ? { ...prev, analysis: analysisResult } : null);
        } catch (err) {
            setAnalysisError(err instanceof Error ? err.message : '分析失敗');
        } finally {
            setIsAnalyzing(false);
        }
    }, [history]);
    
     // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
             const key = e.key.toLowerCase();
             const isMod = e.ctrlKey || e.metaKey;

             if (isMod && key === 'enter') {
                 e.preventDefault();
                 if (appMode === 'GENERATE' || appMode === 'CHARACTER_CREATOR') handleGenerate();
                 else if (appMode === 'REMOVE_BG') handleRemoveBackground();
                 else if (appMode === 'DRAW') handleUseDrawing();
                 else if (appMode === 'VEO') handleGenerateVeo();
             }
             if (isMod && key === 'o') { e.preventDefault(); handleOptimizePrompt(); }
             if (isMod && key === 'i') { e.preventDefault(); onInspirePrompt(); }
             if (isMod && key === 'backspace') {
                 e.preventDefault();
                 if (appMode === 'VEO') {
                    onClearVeoSettings();
                 } else {
                    onClearSettings();
                 }
             }
             
             if (appMode === 'DRAW') {
                if (isMod && key === 'z') { e.preventDefault(); drawCanvasRef.current?.undo(); }
                if (key === '[') setBrushSize(s => Math.max(1, s-1));
                if (key === ']') setBrushSize(s => Math.min(100, s+1));
             }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [appMode, handleGenerate, handleRemoveBackground, handleUseDrawing, handleOptimizePrompt, onInspirePrompt, onClearSettings, handleGenerateVeo, onClearVeoSettings]);
    
    // --- Paste from clipboard ---
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const src = event.target?.result as string;
                            const uploaded: UploadedImage = { src, file };
                            if (appMode === 'REMOVE_BG') {
                                setUploadedImage(uploaded);
                            } else if (appMode === 'GENERATE' || appMode === 'CHARACTER_CREATOR') {
                                setReferenceImages(prev => [...prev, uploaded].slice(0, 8));
                            } else if (appMode === 'VEO') {
                                if (!startFrame) {
                                    handleStartFrameChange(uploaded);
                                } else if (!endFrame) {
                                    handleEndFrameChange(uploaded);
                                }
                            }
                            addToast('圖片已從剪貼簿貼上', 'success');
                        };
                        reader.readAsDataURL(file);
                    }
                    e.preventDefault();
                    return;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [appMode, addToast, startFrame, endFrame]);
    
    // --- Render Logic ---

    const renderMainPanel = () => {
        switch (appMode) {
            case 'HISTORY':
                return <HistoryPanel
                    history={history}
                    selectedItem={selectedHistoryItem}
                    onSelectItem={handleHistorySelect}
                    isAnalyzing={isAnalyzing}
                    analysisError={analysisError}
                    onUseHistoryItem={(item) => onUseImage(item, 'reference')}
                    onDeleteHistoryItem={(id) => {
                        setHistory(h => h.filter(item => item.id !== id));
                        if(selectedHistoryItem?.id === id) setSelectedHistoryItem(null);
                    }}
                    onClearHistory={() => setHistory([])}
                    onSetLightboxConfig={(images, startIndex) => setLightboxConfig({ images, startIndex })}
                    addToast={addToast}
                    onUseImage={onUseHistoryImage}
                    onUpscale={onUpscale}
                    onZoomOut={(src) => {
                        const item = history.find(h => h.src === src);
                        if (item) onZoomOut(item);
                    }}
                    onSendImageToVeo={handleSendImageToVeo}
                />;
            case 'DRAW':
                return <main className="flex-1 flex flex-col p-2 md:p-4 bg-black min-w-0"><DrawingCanvas 
                    ref={drawCanvasRef}
                    tool={drawTool}
                    brushSize={brushSize}
                    fillColor={fillColor}
                    strokeColor={strokeColor}
                    backgroundColor={canvasBackgroundColor}
                    aspectRatio={drawAspectRatio}
                    backgroundImage={drawBackgroundImage}
                    isPreviewingBrushSize={isPreviewingBrushSize}
                /></main>
            case 'VEO':
                return <VeoPanel 
                    history={veoHistory}
                    onDelete={handleVeoDelete}
                    isLoading={isGeneratingVideo}
                    currentVideo={currentVeoVideo}
                    onPlay={setCurrentVeoVideo}
                    onRegenerate={handleVeoRegenerate}
                    onUseText={handleVeoUseText}
                    onRestore={handleVeoRestore}
                />;
            default:
                return <ResultPanel
                    images={images}
                    isLoading={isLoading}
                    error={error}
                    onPromptSelect={handlePromptSelect}
                    onUpscale={onUpscale}
                    onZoomOut={onZoomOut}
                    onSetLightboxConfig={(images, startIndex) => setLightboxConfig({ images, startIndex })}
                    onUseImage={onUseImage}
                    onSendImageToVeo={handleSendImageToVeo}
                />;
        }
    };
    
    const controlPanelProps = {
        appMode, setAppMode, onGenerate: handleGenerate, onRemoveBackground: handleRemoveBackground,
        isLoading, uploadedImage, setUploadedImage, referenceImages, setReferenceImages,
        onRemoveReferenceImage: (index: number) => setReferenceImages(imgs => imgs.filter((_, i) => i !== index)),
        prompt, setPrompt, selectedAspectRatio, onAspectRatioSelect: setSelectedAspectRatio, isOptimizing,
        onOptimizePrompt: handleOptimizePrompt, onInspirePrompt, onClearSettings, addGreenScreen, setAddGreenScreen,
        drawTool, setDrawTool, brushSize, onBrushSizeChange: setBrushSize, fillColor, setFillColor, strokeColor, setStrokeColor,
        drawAspectRatio, setDrawAspectRatio, canvasBackgroundColor, setCanvasBackgroundColor,
        onClearCanvas: () => drawCanvasRef.current?.clear(),
        onUndoCanvas: () => drawCanvasRef.current?.undo(),
        onUseDrawing: handleUseDrawing,
        onDrawBackgroundUpload: (file: File) => {
            const reader = new FileReader();
            reader.onload = (e) => setDrawBackgroundImage(e.target?.result as string);
            reader.readAsDataURL(file);
        },
        isControlPanelOpen, setIsControlPanelOpen, isMobile, modifierKey,
        isSuggestingEdit,
        // VEO Props
        veoPrompt, setVeoPrompt, startFrame, onStartFrameChange: handleStartFrameChange, endFrame, onEndFrameChange: handleEndFrameChange,
        veoAspectRatio, setVeoAspectRatio, videoDuration, setVideoDuration, onGenerateVeo: handleGenerateVeo, isGeneratingVideo, isAnalyzingFrames
    };

    return (
        <div className="h-screen bg-gray-900 text-white flex font-sans overflow-hidden">
            <ControlPanel {...controlPanelProps} />
            <div className="flex-1 flex flex-col relative min-w-0">
                {!isControlPanelOpen && (
                    <button onClick={() => setIsControlPanelOpen(true)} className="md:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800/80 rounded-md">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
                    </button>
                )}
                {renderMainPanel()}
            </div>

            {lightboxConfig && (
                <Lightbox
                    config={lightboxConfig}
                    onClose={() => setLightboxConfig(null)}
                    onUpscale={onUpscale}
                    onZoomOut={onZoomOut}
                    onUseImage={onUseImage}
                    onSendImageToVeo={handleSendImageToVeo}
                />
            )}
            
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-[100] space-y-2">
                {toasts.map(toast => (
                    <div key={toast.id} className={`px-4 py-2 rounded-md text-sm font-semibold shadow-lg animate-fade-in-out ${
                        toast.type === 'success' ? 'bg-green-600' :
                        toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
                    }`}>
                        {toast.message}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default App;