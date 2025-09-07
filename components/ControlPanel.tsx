import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { AppMode, UploadedImage, DrawTool, AspectRatio, VeoAspectRatio } from '../types';
import {
    MagicIcon, EraseIcon, PaintBrushIcon, HistoryIcon, PlusIcon, TrashIcon, WandIcon, LightbulbIcon,
    XCircleIcon, UndoIcon, RectangleIcon, CircleIcon, ArrowUpRightIcon, CameraIcon, ImportIcon, XIcon,
    ClipboardIcon, UserCircleIcon, VideoCameraIcon
} from './Icon';
import { ASPECT_RATIOS, FUNCTION_BUTTONS, ART_STYLES_LIST, EDITING_EXAMPLES, CHARACTER_CREATOR_SECTIONS, VEO_ASPECT_RATIOS, VEO_MEME_PROMPTS } from '../constants';
import { enhanceWebcamImage } from '../services/geminiService';
import { ColorPicker } from './ColorPicker';
import { dataURLtoFile } from '../utils';
import { AutosizeTextarea } from './AutosizeTextarea';


type ControlPanelProps = {
    appMode: AppMode;
    setAppMode: (mode: AppMode) => void;
    onGenerate: () => void;
    onRemoveBackground: () => void;
    isLoading: boolean;
    uploadedImage: UploadedImage | null;
    setUploadedImage: (image: UploadedImage | null) => void;
    referenceImages: UploadedImage[];
    setReferenceImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
    onRemoveReferenceImage: (index: number) => void;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    selectedAspectRatio: AspectRatio;
    onAspectRatioSelect: (aspectRatio: AspectRatio) => void;
    isOptimizing: boolean;
    onOptimizePrompt: () => void;
    onInspirePrompt: () => void;
    onClearSettings: () => void;
    addGreenScreen: boolean;
    setAddGreenScreen: (value: boolean) => void;
    drawTool: DrawTool;
    setDrawTool: (tool: DrawTool) => void;
    brushSize: number;
    onBrushSizeChange: (size: number) => void;
    fillColor: string;
    setFillColor: (color: string) => void;
    strokeColor: string;
    setStrokeColor: (color: string) => void;
    drawAspectRatio: AspectRatio;
    setDrawAspectRatio: (ratio: AspectRatio) => void;
    canvasBackgroundColor: string;
    setCanvasBackgroundColor: (color: string) => void;
    onClearCanvas: () => void;
    onUndoCanvas: () => void;
    onUseDrawing: () => void;
    onDrawBackgroundUpload: (file: File) => void;
    isControlPanelOpen: boolean;
    setIsControlPanelOpen: (isOpen: boolean) => void;
    isMobile: boolean;
    modifierKey: 'Ctrl' | '⌘';
    isSuggestingEdit: boolean;
    // VEO Props
    veoPrompt: string;
    setVeoPrompt: React.Dispatch<React.SetStateAction<string>>;
    startFrame: UploadedImage | null;
    onStartFrameChange: (image: UploadedImage | null) => void;
    endFrame: UploadedImage | null;
    onEndFrameChange: (image: UploadedImage | null) => void;
    veoAspectRatio: VeoAspectRatio;
    setVeoAspectRatio: (ratio: VeoAspectRatio) => void;
    videoDuration: number;
    setVideoDuration: (duration: number) => void;
    onGenerateVeo: () => void;
    isGeneratingVideo: boolean;
    isAnalyzingFrames: boolean;
};

const NavButton: React.FC<{
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    label: string;
    isActive: boolean;
    onClick: () => void;
    title?: string;
}> = ({ icon: Icon, label, isActive, onClick, title }) => (
    <button
        onClick={onClick}
        title={title}
        className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-colors ${
            isActive ? 'bg-fuchsia-600 text-white' : 'text-slate-300 hover:bg-fuchsia-900/50 hover:text-white'
        }`}
    >
        <Icon className="w-5 h-5" />
        <span className="text-xs font-medium">{label}</span>
    </button>
);

const Section: React.FC<{ title?: string; children: React.ReactNode, noMb?: boolean, className?: string }> = ({ title, children, noMb, className }) => (
    <div className={`${noMb ? '' : 'mb-4'} ${className}`}>
        {title && <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-2">{title}</h3>}
        {children}
    </div>
);


const Accordion: React.FC<{ title: string; children: React.ReactNode, initialOpen?: boolean }> = ({ title, children, initialOpen=false }) => {
    const [isOpen, setIsOpen] = useState(initialOpen);

    return (
        <div className="bg-black/30 rounded-lg">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-2 text-left">
                <span className="text-xs font-medium">{title}</span>
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {isOpen && <div className="p-2 border-t border-fuchsia-500/20">{children}</div>}
        </div>
    );
};


const WebcamCapture: React.FC<{
    onClose: () => void;
    onImageSelect: (image: UploadedImage) => void;
}> = ({ onClose, onImageSelect }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEnhancing, setIsEnhancing] = useState(false);

    useEffect(() => {
        let stream: MediaStream | null = null;
        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        setIsLoading(false);
                    };
                }
            } catch (err) {
                console.error("Error accessing webcam:", err);
                alert("無法存取攝像頭。請檢查權限設定。");
                onClose();
            }
        };

        startCamera();

        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, [onClose]);

    const handleTakePhoto = useCallback(async () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context?.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = canvas.toDataURL('image/png');
            if (imageData) {
                setIsEnhancing(true);
                try {
                    const base64 = imageData.split(',')[1];
                    const enhancedBase64 = await enhanceWebcamImage(base64, 'image/png');
                    const finalSrc = `data:image/png;base64,${enhancedBase64}`;
                    const file = dataURLtoFile(finalSrc, `webcam-enhanced-${Date.now()}.png`);
                    onImageSelect({ src: finalSrc, file });
                    onClose();
                } catch (err) {
                    console.error("Failed to enhance image:", err);
                    alert(`影像優化失敗: ${err instanceof Error ? err.message : String(err)}`);
                    setIsEnhancing(false);
                }
            }
        }
    }, [videoRef, canvasRef, onImageSelect, onClose]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !isEnhancing) {
                e.preventDefault();
                handleTakePhoto();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleTakePhoto, isEnhancing]);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-gray-900 p-4 rounded-lg shadow-lg max-w-lg w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4">攝像頭拍攝</h3>
                <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden flex items-center justify-center">
                    {(isLoading || isEnhancing) && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                            <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-fuchsia-500 mb-3"></div>
                            <p className="font-semibold">{isEnhancing ? '正在優化影像...' : '正在啟動攝像頭...'}</p>
                         </div>
                    )}
                    <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover transform scale-x-[-1] ${isLoading ? 'opacity-0' : 'opacity-100'}`} />
                    <canvas ref={canvasRef} className="hidden" />
                </div>
                 <button onClick={handleTakePhoto} disabled={isLoading || isEnhancing} className="w-full mt-4 py-2 bg-fuchsia-600 rounded-lg font-semibold hover:bg-fuchsia-700 disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {isEnhancing ? '請稍候...' : '拍攝照片 (Enter)'}
                </button>
            </div>
        </div>
    );
};

const ImageUploader: React.FC<{
    onImageUpload: (image: UploadedImage) => void;
    children?: React.ReactNode;
    className?: string;
    showButtons?: boolean;
    multiple?: boolean;
    disabled?: boolean;
}> = ({ onImageUpload, children, className, showButtons = false, multiple = false, disabled = false }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isWebcamOpen, setIsWebcamOpen] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            for (const file of Array.from(files)) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const src = e.target?.result as string;
                        onImageUpload({ src, file });
                    };
                    reader.readAsDataURL(file);
                }
            }
        }
        if (event.target) {
            event.target.value = '';
        }
    };
    
    const handlePasteFromClipboard = () => {
       alert("貼上功能已啟用！請直接在頁面上按 Ctrl+V (或 Cmd+V) 來貼上圖片。");
    };
    
    const handleClick = () => {
        if (!disabled && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/png, image/jpeg, image/webp"
                multiple={multiple}
                disabled={disabled}
            />
            <div className={className} onClick={handleClick}>
                {children}
            </div>
            {showButtons && (
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                     <button onClick={handleClick} disabled={disabled} className="flex items-center justify-center gap-2 p-2 bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50">
                        <ImportIcon className="w-4 h-4"/> 從檔案上傳
                    </button>
                    <button onClick={() => !disabled && setIsWebcamOpen(true)} disabled={disabled} className="flex items-center justify-center gap-2 p-2 bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50">
                        <CameraIcon className="w-4 h-4"/> 攝像頭
                    </button>
                    <button onClick={handlePasteFromClipboard} disabled={disabled} className="col-span-2 flex items-center justify-center gap-2 p-2 bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50">
                        <ClipboardIcon className="w-4 h-4"/> 從剪貼簿貼上
                    </button>
                </div>
            )}
            {isWebcamOpen && <WebcamCapture onClose={() => setIsWebcamOpen(false)} onImageSelect={onImageUpload} />}
        </>
    );
};

const VersionInfo: React.FC<{ modifierKey: 'Ctrl' | '⌘' }> = ({ modifierKey }) => (
    <div className="flex flex-col h-full text-slate-400 p-4 overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
            <img 
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                alt="鳥巢AI包娜娜 Logo" 
                className="w-24 h-24 mb-4" 
            />
            <h3 className="text-xl font-semibold text-cyan-400">鳥巢AI包娜娜 v0.3.0</h3>
            <p className="text-lg mt-2 mb-4">主要功能介紹：</p>
            <ul className="text-sm text-left space-y-2 list-disc list-inside bg-black/20 p-4 rounded-lg">
                <li>賽博龐克風格介面與快捷鍵支援</li>
                <li>AI 繪圖、角色創造與提示詞優化</li>
                <li>智慧背景移除與綠幕功能</li>
                <li>功能強大的塗鴉板，支援圖層與背景</li>
                <li>AI 美感分析與歷史紀錄快取</li>
                <li>沉浸式 Lightbox 瀏覽（縮放與平移）</li>
                <li>一鍵提升畫質與 Zoom Out 擴圖</li>
                <li className="font-bold text-cyan-300">全新 Veo 2 影片生成與 AI 導演</li>
            </ul>
            <div className="mt-6 text-xl text-slate-400 border-t border-fuchsia-500/20 pt-4 w-full">
                <p className="font-bold text-cyan-400 mb-2">2025歡迎邀約鳥巢AI</p>
                <p>想學最新AI生成影音工具嗎？</p>
                <p>企業想找AI工具顧問減少摸索時間？</p>
                <p className="mb-2">
                    歡迎找鳥巢AI預約 <a href="https://aiarttw.us/contact" target="_blank" rel="noopener noreferrer" className="text-fuchsia-400 hover:underline">https://aiarttw.us/contact</a>
                </p>
                <p className="text-slate-500">
                    #300場AI活動經歷<br />
                    #企業生成式AI代訓<br />
                    #鳥巢AI影音教學合作洽詢 <br />
                    #SunoV45+ #AI歌以載道 <br />
                    鳥巢AI歌曲 <br /><a href="https://aiarttw.us/aisong" target="_blank" rel="noopener noreferrer" className="text-fuchsia-400 hover:underline">https://aiarttw.us/aisong</a>
                </p>
            </div>
        </div>
    </div>
);


export const ControlPanel: React.FC<ControlPanelProps> = (props) => {
    const { appMode, setAppMode, isControlPanelOpen, setIsControlPanelOpen, isMobile, modifierKey, isSuggestingEdit } = props;

    const handleFileUpload = (setter: (image: UploadedImage | null) => void) => (image: UploadedImage) => {
        setter(image);
    };

    const handleRefImageUpload = (image: UploadedImage) => {
        props.setReferenceImages(prev => [...prev, image].slice(0, 8)); // Limit to 8
    };

    const handleFunctionButtonClick = (promptText: string) => {
        props.setPrompt(prev => {
            const trimmedPrev = prev.trim();
            // Avoid adding comma if prompt is empty
            return trimmedPrev ? `${trimmedPrev}, ${promptText}` : promptText;
        });
    };

    const renderGeneratePanel = () => (
        <>
            <Section title="1. 提示詞 (Prompt)">
                <AutosizeTextarea
                    value={props.prompt}
                    onChange={(e) => props.setPrompt(e.target.value)}
                    placeholder="輸入您的創意，例如：一隻可愛的貓咪太空人..."
                    className="w-full p-2 bg-gray-800/50 rounded-lg text-sm placeholder-slate-500 focus:ring-2 focus:ring-fuchsia-500 focus:outline-none resize-none min-h-[7rem]"
                />
                <div className="flex gap-2 mt-2">
                    <button onClick={props.onOptimizePrompt} disabled={props.isOptimizing} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-900/50 rounded-md hover:bg-fuchsia-700 disabled:opacity-50" title={!isMobile ? `自動優化 (${modifierKey}+O)` : '自動優化'}>
                        <WandIcon className="w-4 h-4" /> {props.isOptimizing ? '優化中...' : '自動優化'}
                    </button>
                    <button onClick={props.onInspirePrompt} disabled={props.isOptimizing} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-900/50 rounded-md hover:bg-fuchsia-700 disabled:opacity-50" title={!isMobile ? `靈感提示 (${modifierKey}+I)` : '靈感提示'}>
                        <LightbulbIcon className="w-4 h-4" /> {props.isOptimizing ? '提示中...' : '靈感提示'}
                    </button>
                    <button onClick={props.onClearSettings} className="p-2 text-xs bg-purple-900/50 rounded-md hover:bg-red-500/20 hover:text-red-400" title={`清除設定${!isMobile ? ` (${modifierKey}+Backspace)` : ''}`.trim()}>
                        <XCircleIcon className="w-4 h-4" />
                    </button>
                </div>
            </Section>
            
            <div className="mb-4 space-y-2">
                <Accordion title="世界Top100藝術風格">
                    <div className="max-h-32 overflow-y-auto pr-1 flex flex-wrap gap-1">
                        {ART_STYLES_LIST.map(style => (
                            <button key={style.en} onClick={() => handleFunctionButtonClick(style.en)} className="px-2 py-0.5 bg-slate-700/50 text-xs rounded hover:bg-fuchsia-600">{style.zh}</button>
                        ))}
                    </div>
                </Accordion>

                <Accordion title="包娜娜終極改圖指南">
                    <div className="max-h-48 overflow-y-auto pr-1">
                        {EDITING_EXAMPLES.map(cat => (
                        <div key={cat.category}>
                                <p className="text-xs text-cyan-300 mt-2 mb-1 font-semibold">{cat.category}</p>
                                {cat.examples.map(ex => (
                                    <button key={ex.title} onClick={() => props.setPrompt(ex.prompt)} title={ex.prompt} className="w-full text-left px-2 py-0.5 bg-slate-700/50 text-xs rounded hover:bg-fuchsia-600 mb-1">{ex.title}</button>
                                ))}
                        </div>
                        ))}
                    </div>
                </Accordion>
            </div>

            <Section title="火熱應用">
                <div className="flex flex-wrap gap-2">
                    {FUNCTION_BUTTONS.map(btn => (
                        <button 
                            key={btn.label}
                            onClick={() => handleFunctionButtonClick(btn.prompt)}
                            title={btn.prompt}
                            className="px-2 py-1 bg-cyan-500/20 text-xs rounded hover:bg-cyan-500"
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </Section>

            <Section title="參考圖 (選填，最多8張)" className="relative">
                 {isSuggestingEdit && (
                    <div className="absolute inset-0 bg-black/70 z-10 flex flex-col items-center justify-center rounded-lg">
                         <div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-cyan-400"></div>
                         <p className="mt-2 text-sm text-cyan-300">AI改圖顧問分析中...</p>
                    </div>
                 )}
                 <div className="grid grid-cols-4 gap-2 mb-2">
                    {props.referenceImages.map((img, index) => (
                        <div key={index} className="relative group aspect-square">
                            <img src={img.src} alt={`ref-${index}`} className="w-full h-full object-cover rounded-md"/>
                             <button onClick={() => props.onRemoveReferenceImage(index)} className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100">
                                 <XIcon className="w-3 h-3"/>
                             </button>
                        </div>
                    ))}
                    {props.referenceImages.length < 8 && (
                        <ImageUploader onImageUpload={handleRefImageUpload} multiple>
                             <div className="flex items-center justify-center w-full min-h-[70px] bg-black/30 rounded-lg border-2 border-dashed border-fuchsia-500/20 hover:border-fuchsia-500 cursor-pointer">
                                <PlusIcon className="w-6 h-6 text-slate-500" />
                            </div>
                        </ImageUploader>
                    )}
                 </div>
                 <ImageUploader onImageUpload={handleRefImageUpload} showButtons multiple />
            </Section>

            <Section title="圖片設定">
                <div className="space-y-3">
                     <div>
                        <label className="text-xs text-slate-400 block mb-1">長寬比例</label>
                        <div className="grid grid-cols-5 gap-2 text-xs">
                           {ASPECT_RATIOS.map(ratio => (
                               <button 
                                key={ratio} 
                                onClick={() => props.onAspectRatioSelect(ratio)} 
                                className={`py-1 rounded transition-colors ${props.selectedAspectRatio === ratio ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
                                >
                                {ratio}
                                </button>
                           ))}
                        </div>
                    </div>
                </div>
            </Section>
            
            <button onClick={props.onGenerate} disabled={props.isLoading || isSuggestingEdit} className="w-full py-3 mt-auto bg-fuchsia-600 rounded-lg font-semibold hover:bg-fuchsia-700 disabled:bg-slate-700 disabled:cursor-not-allowed flex items-center justify-center gap-2" title={!isMobile ? `生成圖片 (${modifierKey}+Enter)` : '生成圖片'}>
                 {props.isLoading ? '生成中...' : (isSuggestingEdit ? 'AI分析中...' : '生成圖片')}
            </button>
        </>
    );

    const renderCharacterCreatorPanel = () => (
        <>
            <Section title="1. 組合角色提示詞">
                <AutosizeTextarea
                    value={props.prompt}
                    onChange={(e) => props.setPrompt(e.target.value)}
                    placeholder="點擊下方按鈕來建立你的角色..."
                    className="w-full p-2 bg-gray-800/50 rounded-lg text-sm placeholder-slate-500 focus:ring-2 focus:ring-fuchsia-500 focus:outline-none resize-none min-h-[6rem]"
                />
                 <div className="flex gap-2 mt-2">
                    <button onClick={props.onOptimizePrompt} disabled={props.isOptimizing} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-900/50 rounded-md hover:bg-fuchsia-700 disabled:opacity-50" title={!isMobile ? `自動優化 (${modifierKey}+O)` : '自動優化'}>
                        <WandIcon className="w-4 h-4" /> {props.isOptimizing ? '優化中...' : '自動優化'}
                    </button>
                    <button onClick={props.onInspirePrompt} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-900/50 rounded-md hover:bg-fuchsia-700" title={!isMobile ? `靈感提示 (${modifierKey}+I)` : '靈感提示'}>
                        <LightbulbIcon className="w-4 h-4" /> 靈感提示
                    </button>
                    <button onClick={props.onClearSettings} className="p-2 text-xs bg-purple-900/50 rounded-md hover:bg-red-500/20 hover:text-red-400" title={`清除設定${!isMobile ? ` (${modifierKey}+Backspace)` : ''}`.trim()}>
                        <XCircleIcon className="w-4 h-4" />
                    </button>
                 </div>
            </Section>

            {CHARACTER_CREATOR_SECTIONS.map(section => (
                 <Section key={section.category} title={section.category}>
                    <div className="flex flex-wrap gap-2">
                        {section.options.map(opt => (
                            <button
                                key={opt.label}
                                onClick={() => handleFunctionButtonClick(opt.prompt)}
                                title={opt.prompt}
                                className="px-2 py-1 bg-cyan-500/20 text-xs rounded hover:bg-cyan-500"
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                 </Section>
            ))}

             <button onClick={props.onGenerate} disabled={props.isLoading} className="w-full py-3 mt-auto bg-fuchsia-600 rounded-lg font-semibold hover:bg-fuchsia-700 disabled:bg-slate-700 disabled:cursor-not-allowed flex items-center justify-center gap-2" title={!isMobile ? `生成角色 (${modifierKey}+Enter)` : '生成角色'}>
                 {props.isLoading ? '生成中...' : '生成角色'}
            </button>
        </>
    );

    const renderRemoveBgPanel = () => (
        <>
            <Section title="1. 上傳圖片">
                <ImageUploader 
                    onImageUpload={handleFileUpload(props.setUploadedImage)}
                    showButtons
                >
                    {props.uploadedImage ? (
                        <div className="relative group aspect-video mb-2 cursor-pointer">
                            <img src={props.uploadedImage.src} alt="Uploaded" className="w-full h-full object-contain rounded-lg bg-black/20" />
                             <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <p>點擊更換圖片</p>
                             </div>
                        </div>
                    ) : (
                         <div className="flex flex-col items-center justify-center w-full h-32 bg-black/30 rounded-lg border-2 border-dashed border-fuchsia-500/20 mb-2 cursor-pointer hover:border-fuchsia-500">
                            <p className="text-sm">預覽區域</p>
                        </div>
                    )}
                </ImageUploader>
            </Section>
            <Section title="2. 選項">
                <div className="flex items-center justify-between p-2 bg-black/30 rounded-lg">
                    <label htmlFor="green-screen-toggle" className="text-sm cursor-pointer">去背後綠幕</label>
                    <input
                        id="green-screen-toggle"
                        type="checkbox"
                        checked={props.addGreenScreen}
                        onChange={(e) => props.setAddGreenScreen(e.target.checked)}
                        className="w-4 h-4 text-fuchsia-600 bg-gray-700 border-gray-600 rounded focus:ring-fuchsia-500 focus:ring-2"
                    />
                </div>
            </Section>
            {props.uploadedImage && (
                <>
                    <button onClick={props.onRemoveBackground} disabled={props.isLoading} className="w-full py-3 mt-auto bg-fuchsia-600 rounded-lg font-semibold hover:bg-fuchsia-700 disabled:bg-slate-700 disabled:cursor-not-allowed" title={!isMobile ? `移除背景 (${modifierKey}+Enter)` : '移除背景'}>
                        {props.isLoading ? '處理中...' : '移除背景'}
                    </button>
                </>
            )}
        </>
    );
    
    const renderDrawPanel = () => {
        const tools: { name: DrawTool, icon: React.FC<any>, key: string, label: string }[] = [
            { name: 'brush', icon: PaintBrushIcon, key: 'B', label: '筆刷' },
            { name: 'rectangle', icon: RectangleIcon, key: 'R', label: '矩形' },
            { name: 'circle', icon: CircleIcon, key: 'C', label: '圓形' },
            { name: 'arrow', icon: ArrowUpRightIcon, key: 'A', label: '箭頭' },
        ];

        const isShapeTool = props.drawTool === 'rectangle' || props.drawTool === 'circle';
        const brushSizeLabel = {
            brush: '筆刷尺寸',
            rectangle: '邊框寬度',
            circle: '邊框寬度',
            arrow: '線條寬度'
        }[props.drawTool];

        return (
            <>
                <Section title="工具">
                    <div className="grid grid-cols-4 gap-2">
                        {tools.map(t => (
                            <button key={t.name} onClick={() => props.setDrawTool(t.name)} className={`p-2 rounded-lg ${props.drawTool === t.name ? 'bg-fuchsia-600' : 'bg-slate-800 hover:bg-slate-700'}`} title={!isMobile ? `${t.label} (${t.key})` : t.label}>
                                <t.icon className="w-5 h-5 mx-auto"/>
                            </button>
                        ))}
                    </div>
                </Section>
                <Section title="屬性" noMb>
                    <div className="space-y-4">
                        {isShapeTool ? (
                            <>
                                <ColorPicker label="填滿" color={props.fillColor} setColor={props.setFillColor} paletteKey="draw-fill-palette" />
                                <ColorPicker label="邊框" color={props.strokeColor} setColor={props.setStrokeColor} paletteKey="draw-stroke-palette" />
                            </>
                        ) : (
                            <ColorPicker label="顏色" color={props.strokeColor} setColor={props.setStrokeColor} paletteKey="draw-stroke-palette" />
                        )}
                        
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">{brushSizeLabel}</label>
                            <div className="flex items-center gap-2" title={!props.isMobile ? "使用 [ 和 ] 鍵調整" : undefined}>
                                 <input type="range" min="1" max="100" value={props.brushSize} onChange={(e) => props.onBrushSizeChange(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                                 <span className="text-sm font-semibold w-8 text-center">{props.brushSize}</span>
                            </div>
                        </div>
                    </div>
                </Section>
                 <Section title="畫布">
                    <div className="mb-3">
                        <label className="text-xs text-slate-400 block mb-1">畫布比例</label>
                        <div className="grid grid-cols-5 gap-2 text-xs">
                           {ASPECT_RATIOS.map(ratio => (
                               <button 
                                key={ratio} 
                                onClick={() => props.setDrawAspectRatio(ratio)} 
                                className={`py-1 rounded transition-colors ${props.drawAspectRatio === ratio ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
                                >
                                {ratio}
                                </button>
                           ))}
                        </div>
                    </div>
                    <div className="my-3">
                       <ColorPicker label="畫布背景" color={props.canvasBackgroundColor} setColor={props.setCanvasBackgroundColor} paletteKey="draw-canvas-bg-palette" />
                    </div>
                    <ImageUploader 
                        onImageUpload={(img) => props.onDrawBackgroundUpload(img.file)}
                        showButtons
                    >
                         <div className="flex flex-col items-center justify-center w-full h-20 bg-black/30 rounded-lg border-2 border-dashed border-fuchsia-500/20 mb-2 cursor-pointer hover:border-fuchsia-500">
                            <p className="text-sm text-slate-400">上傳背景 (選填)</p>
                            <p className="text-xs text-slate-500">背景將顯示於畫布</p>
                        </div>
                    </ImageUploader>
                 </Section>
                <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button onClick={props.onUndoCanvas} className="flex items-center justify-center gap-2 py-2 bg-slate-800 rounded-md hover:bg-slate-700" title={!isMobile ? `復原 (${modifierKey}+Z)` : '復原'}>
                        <UndoIcon className="w-4 h-4"/>復原
                    </button>
                    <button onClick={props.onClearCanvas} className="flex items-center justify-center gap-2 py-2 bg-slate-800 rounded-md hover:bg-slate-700" title={!isMobile ? `清除 (${modifierKey}+Backspace)` : '清除'}>
                        <TrashIcon className="w-4 h-4"/>清除
                    </button>
                    <button onClick={props.onUseDrawing} className="col-span-2 py-3 bg-fuchsia-600 rounded-lg font-semibold hover:bg-fuchsia-700" title={!isMobile ? `使用此畫布生成 (${modifierKey}+Enter)` : '使用此畫布生成'}>
                        使用此畫布生成
                    </button>
                </div>
            </>
        );
    };

    const VeoFrameUploader: React.FC<{
        label: string;
        image: UploadedImage | null;
        setImage: (image: UploadedImage | null) => void;
        disabled?: boolean;
    }> = ({ label, image, setImage, disabled }) => {
        const [isMenuOpen, setIsMenuOpen] = useState(false);
        const [isWebcamOpen, setIsWebcamOpen] = useState(false);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const menuRef = useRef<HTMLDivElement>(null);

        const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file?.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const src = e.target?.result as string;
                    setImage({ src, file });
                };
                reader.readAsDataURL(file);
            }
            if (event.target) event.target.value = '';
        };

        const handlePasteFromClipboard = () => alert("貼上功能已啟用！請直接在頁面上按 Ctrl+V (或 Cmd+V) 來貼上圖片。");

        const handleImageSelect = (img: UploadedImage) => {
            setImage(img);
            setIsWebcamOpen(false);
        };

        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                    setIsMenuOpen(false);
                }
            };
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }, []);

        return (
            <div className="relative">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp" />
                <label className="text-xs text-slate-400 block mb-1">{label}</label>
                {image ? (
                    <div className={`relative group aspect-video rounded-md overflow-hidden ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <img src={image.src} alt={label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-sm">點擊更換</p>
                            <button onClick={(e) => { e.stopPropagation(); if(!disabled) setImage(null); }} disabled={disabled} className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white"><XIcon className="w-3 h-3"/></button>
                        </div>
                    </div>
                ) : (
                    <div onClick={() => !disabled && setIsMenuOpen(true)} className={`flex flex-col items-center justify-center w-full h-full aspect-video bg-black/30 rounded-lg border-2 border-dashed border-fuchsia-500/20 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-fuchsia-500'}`}>
                        <PlusIcon className="w-6 h-6 text-slate-500" />
                        <p className="text-xs text-slate-500 mt-1">點擊上傳</p>
                    </div>
                )}
                {isMenuOpen && (
                    <div ref={menuRef} className="absolute z-10 top-full mt-2 w-full bg-slate-800 rounded-md shadow-lg p-2 space-y-2 text-sm">
                        <button onClick={() => { fileInputRef.current?.click(); setIsMenuOpen(false); }} className="w-full flex items-center gap-2 p-2 hover:bg-slate-700 rounded-md"><ImportIcon className="w-4 h-4"/>從檔案</button>
                        <button onClick={() => { setIsWebcamOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-2 p-2 hover:bg-slate-700 rounded-md"><CameraIcon className="w-4 h-4"/>攝像頭</button>
                        <button onClick={() => { handlePasteFromClipboard(); setIsMenuOpen(false); }} className="w-full flex items-center gap-2 p-2 hover:bg-slate-700 rounded-md"><ClipboardIcon className="w-4 h-4"/>剪貼簿</button>
                    </div>
                )}
                {isWebcamOpen && <WebcamCapture onClose={() => setIsWebcamOpen(false)} onImageSelect={handleImageSelect} />}
            </div>
        );
    };

    const renderVeoPanel = () => {
        const handleVeoFunctionButtonClick = (promptText: string) => {
            props.setVeoPrompt(prev => prev.trim() ? `${prev.trim()}, ${promptText}` : promptText);
        };

        return (
            <>
                <Section title="提示詞">
                    <div className="relative">
                        <AutosizeTextarea
                            value={props.veoPrompt}
                            onChange={(e) => props.setVeoPrompt(e.target.value)}
                            placeholder="一位太空人，在一個廢棄的太空艙裡，凝視著窗外的星空..."
                            className="w-full p-2 bg-gray-800/50 rounded-lg text-sm placeholder-slate-500 focus:ring-2 focus:ring-fuchsia-500 focus:outline-none resize-none min-h-[6rem]"
                            disabled={props.isAnalyzingFrames}
                        />
                        {props.isAnalyzingFrames && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                                <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-fuchsia-400"></div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button onClick={props.onOptimizePrompt} disabled={props.isOptimizing || props.isAnalyzingFrames} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-900/50 rounded-md hover:bg-fuchsia-700 disabled:opacity-50">
                            <WandIcon className="w-4 h-4" /> {props.isOptimizing ? '處理中...' : '優化提示'}
                        </button>
                        <button onClick={props.onInspirePrompt} disabled={props.isOptimizing || props.isAnalyzingFrames} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-900/50 rounded-md hover:bg-fuchsia-700 disabled:opacity-50">
                            <LightbulbIcon className="w-4 h-4" /> 提示靈感
                        </button>
                    </div>
                </Section>
                
                <div className="mb-4 space-y-2">
                    <Accordion title="世界Top100藝術風格">
                        <div className="max-h-32 overflow-y-auto pr-1 flex flex-wrap gap-1">
                            {ART_STYLES_LIST.map(style => (
                                <button key={style.en} onClick={() => handleVeoFunctionButtonClick(style.en)} className="px-2 py-0.5 bg-slate-700/50 text-xs rounded hover:bg-fuchsia-600">{style.zh}</button>
                            ))}
                        </div>
                    </Accordion>
                </div>

                <Section title="幽默迷因">
                     <div className="flex flex-wrap gap-2">
                        {VEO_MEME_PROMPTS.map(p => (
                            <button key={p.label} onClick={() => props.setVeoPrompt(p.prompt)} title={p.prompt} className="px-3 py-1 bg-slate-800/70 text-xs rounded-full hover:bg-cyan-600/50 hover:text-cyan-300">
                                {p.label}
                            </button>
                        ))}
                    </div>
                </Section>
                
                <Section title="AI 導演">
                    <div className="grid grid-cols-2 gap-3">
                        <VeoFrameUploader label="首幀 (可選)" image={props.startFrame} setImage={props.onStartFrameChange} disabled={props.isAnalyzingFrames} />
                        <VeoFrameUploader label="尾幀 (可選)" image={props.endFrame} setImage={props.onEndFrameChange} disabled={props.isAnalyzingFrames} />
                    </div>
                </Section>
                
                <Section title="影片設定">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">寬高比</label>
                        <div className="grid grid-cols-5 gap-2 text-xs">
                           {VEO_ASPECT_RATIOS.map(ratio => (
                               <button 
                                key={ratio} 
                                onClick={() => props.setVeoAspectRatio(ratio)} 
                                className={`py-1 rounded transition-colors ${props.veoAspectRatio === ratio ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
                                >
                                {ratio}
                                </button>
                           ))}
                        </div>
                    </div>
                    <div className="mt-3">
                         <label className="text-xs text-slate-400 block mb-1">影片長度 ({props.videoDuration}秒)</label>
                         <input type="range" min="5" max="8" step="1" value={props.videoDuration} onChange={(e) => props.setVideoDuration(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                </Section>

                <button onClick={() => props.onGenerateVeo()} disabled={props.isGeneratingVideo || props.isAnalyzingFrames} className="w-full py-3 mt-auto bg-gradient-to-r from-cyan-500 to-fuchsia-600 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                     {props.isGeneratingVideo ? '生成中...' : (props.isAnalyzingFrames ? '分析中...' : '生成影片')}
                </button>
            </>
        );
    };


    const renderContent = () => {
        switch (appMode) {
            case 'GENERATE': return renderGeneratePanel();
            case 'CHARACTER_CREATOR': return renderCharacterCreatorPanel();
            case 'REMOVE_BG': return renderRemoveBgPanel();
            case 'DRAW': return renderDrawPanel();
            case 'HISTORY': return <VersionInfo modifierKey={modifierKey} />;
            case 'VEO': return renderVeoPanel();
            default: return null;
        }
    };
    
    return (
        <aside className={`absolute md:relative inset-y-0 left-0 z-40 transform ${isControlPanelOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out bg-gray-900/80 backdrop-blur-md border-r border-fuchsia-500/20 w-80 md:w-96 flex flex-col`}>
             <button onClick={() => setIsControlPanelOpen(false)} className="md:hidden absolute top-4 right-4 text-slate-400 hover:text-white z-50">
                <XIcon className="w-6 h-6" />
            </button>
            <div className="p-4 border-b border-fuchsia-500/20">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-transparent bg-clip-text">鳥巢AI包娜娜 v0.3.0 Cyberpunk</h1>
              </div>
              <nav className="grid grid-cols-3 gap-1 bg-black/50 p-1 rounded-lg">
                  <NavButton icon={MagicIcon} label="AI生成" title={!isMobile ? `AI生成 (${modifierKey}+Alt+1)` : 'AI生成'} isActive={appMode === 'GENERATE'} onClick={() => setAppMode('GENERATE')} />
                  <NavButton icon={UserCircleIcon} label="角色創造" title={!isMobile ? `角色創造 (${modifierKey}+Alt+2)` : '角色創造'} isActive={appMode === 'CHARACTER_CREATOR'} onClick={() => setAppMode('CHARACTER_CREATOR')} />
                  <NavButton icon={EraseIcon} label="背景移除" title={!isMobile ? `背景移除 (${modifierKey}+Alt+3)` : '背景移除'} isActive={appMode === 'REMOVE_BG'} onClick={() => setAppMode('REMOVE_BG')} />
                  <NavButton icon={PaintBrushIcon} label="塗鴉板" title={!isMobile ? `塗鴉板 (${modifierKey}+Alt+4)` : '塗鴉板'} isActive={appMode === 'DRAW'} onClick={() => setAppMode('DRAW')} />
                  <NavButton icon={HistoryIcon} label="歷史紀錄" title={!isMobile ? `歷史紀錄 (${modifierKey}+Alt+5)` : '歷史紀錄'} isActive={appMode === 'HISTORY'} onClick={() => setAppMode('HISTORY')} />
                  <NavButton icon={VideoCameraIcon} label="生Veo2" title="影片生成" isActive={appMode === 'VEO'} onClick={() => setAppMode('VEO')} />
              </nav>
            </div>
            <div className="flex-1 flex flex-col overflow-y-auto p-4">
                 {renderContent()}
            </div>
        </aside>
    );
};