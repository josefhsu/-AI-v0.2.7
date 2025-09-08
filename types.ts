import { ASPECT_RATIOS } from './constants';

export type AppMode = 'GENERATE' | 'CHARACTER_CREATOR' | 'REMOVE_BG' | 'DRAW' | 'HISTORY' | 'VEO';

export type AspectRatio = typeof ASPECT_RATIOS[number];

export type UploadedImage = {
    src: string;
    file: File;
    isPlaceholder?: boolean;
    width?: number;
    height?: number;
};

export type GeneratedImage = {
    id: string;
    src: string;
    alt: string; 
    prompt?: string; // The prompt used to generate this specific image
    width?: number;
    height?: number;
    size?: number; // in bytes
    analysis?: {
        score: string;
        analysis: string;
    } | null;
};

export type HistoryItem = GeneratedImage;

export type DrawTool = 'brush' | 'rectangle' | 'circle' | 'arrow';

export type LightboxConfig = {
    images: GeneratedImage[];
    startIndex: number;
} | null;

export type Toast = {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
};

export type DrawingCanvasRef = {
    exportImage: () => string; // returns data URL
    clear: () => void;
    undo: () => void;
};

// --- VEO Types ---
export type VeoAspectRatio = '16:9' | '1:1' | '9:16';

export type VeoParams = {
    prompt: string;
    startFrame: UploadedImage | null;
    endFrame: UploadedImage | null;
    aspectRatio: VeoAspectRatio;
    duration: number;
};

export type VeoHistoryItem = VeoParams & {
    id: string;
    videoUrl: string;
    thumbnailUrl: string;
    timestamp: number;
};
