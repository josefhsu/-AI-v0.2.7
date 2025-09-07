
import React, { useState, useEffect } from 'react';
import type { VeoHistoryItem } from '../types';
import { DownloadIcon, TrashIcon, VideoCameraIcon, RegenerateIcon, TextIcon, RestoreIcon } from './Icon';
import { downloadImage } from '../utils';

type ActionButtonProps = {
    // FIX: Changed onClick prop to accept a mouse event to allow for event handling like stopPropagation.
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    label: string;
    disabled?: boolean;
    small?: boolean;
};

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, icon: Icon, label, disabled, small }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={label}
        className={`flex items-center justify-center gap-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            small 
                ? 'p-2 bg-slate-800/80 hover:bg-fuchsia-600'
                : 'flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700'
        }`}
    >
        <Icon className={small ? "w-4 h-4" : "w-5 h-5"} />
        {!small && <span className="text-sm">{label}</span>}
    </button>
);


const VeoHistory: React.FC<{
    history: VeoHistoryItem[];
    onDelete: (id: string) => void;
    onPlay: (item: VeoHistoryItem) => void;
    onRegenerate: () => void;
    onUseText: () => void;
    onRestore: () => void;
}> = ({ history, onDelete, onPlay, onRegenerate, onUseText, onRestore }) => {
    return (
        <div className="pt-4 pr-2">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">歷史紀錄</h3>
            {history.length === 0 ? (
                 <p className="text-sm text-slate-500 text-center py-4">這裡還沒有任何紀錄。</p>
            ) : (
                <div className="columns-2 md:columns-3 lg:columns-2 gap-3 space-y-3">
                    {history.map((item) => (
                        <div key={item.id} className="relative group rounded-lg overflow-hidden cursor-pointer break-inside-avoid" onClick={() => onPlay(item)}>
                            <img src={item.thumbnailUrl} alt={item.prompt} className="w-full h-auto object-cover" />
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                <p className="text-xs text-slate-200 max-h-16 overflow-hidden">{item.prompt}</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                    <ActionButton onClick={() => downloadImage(item.videoUrl, 'veo-video.mp4')} icon={DownloadIcon} label="下載" small />
                                    <ActionButton onClick={onRegenerate} icon={RegenerateIcon} label="再生成" small />
                                    <ActionButton onClick={onUseText} icon={TextIcon} label="使用文字" small />
                                    <ActionButton onClick={onRestore} icon={RestoreIcon} label="還原設定" small />
                                    <ActionButton onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} icon={TrashIcon} label="刪除" small />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const EmptyState: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-4">
        <VideoCameraIcon className="w-24 h-24 mb-4" />
        <h2 className="text-xl font-bold text-cyan-400">VEO 影片生成</h2>
        <p className="max-w-xs mt-2 text-sm">您生成的影片將會顯示在這裡。請在左側面板設定您的提示詞與選項，然後點擊「生成影片」。</p>
    </div>
);

type VeoPanelProps = {
    history: VeoHistoryItem[];
    onDelete: (id: string) => void;
    isLoading: boolean;
    currentVideo: VeoHistoryItem | null;
    onPlay: (item: VeoHistoryItem) => void;
    onRegenerate: () => void;
    onUseText: () => void;
    onRestore: () => void;
};

export const VeoPanel: React.FC<VeoPanelProps> = ({ history, onDelete, isLoading, currentVideo, onPlay, onRegenerate, onUseText, onRestore }) => {
    const [effectiveVideo, setEffectiveVideo] = useState<VeoHistoryItem | null>(null);

    useEffect(() => {
        // If there's a currentVideo prop, use it.
        // Otherwise, if history is not empty and no video is selected, default to the latest one.
        if (currentVideo) {
            setEffectiveVideo(currentVideo);
        } else if (!currentVideo && history.length > 0) {
            setEffectiveVideo(history[0]);
        } else {
            setEffectiveVideo(null);
        }
    }, [currentVideo, history]);

    return (
        <main className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-black min-w-0">
            {/* Main Content: Player */}
            <div className="flex-1 flex flex-col p-4">
                <div className="flex-1 flex items-center justify-center bg-black rounded-lg relative overflow-hidden shadow-lg shadow-cyber-cyan/20">
                    {isLoading && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-fuchsia-500 mb-4"></div>
                            <p className="text-lg font-semibold text-white">影片生成中，請稍候...</p>
                            <p className="text-sm text-slate-400 mt-2">這可能需要數分鐘時間</p>
                         </div>
                    )}
                    {effectiveVideo ? (
                        <video key={effectiveVideo.id} src={effectiveVideo.videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                    ) : !isLoading && (
                        <EmptyState />
                    )}
                </div>
                {effectiveVideo && !isLoading && (
                    <div className="flex-shrink-0 pt-4">
                        <div className="flex items-center gap-3">
                            <ActionButton onClick={() => downloadImage(effectiveVideo.videoUrl, 'veo-video.mp4')} icon={DownloadIcon} label="下載" />
                            <ActionButton onClick={onRegenerate} icon={RegenerateIcon} label="再生成" />
                            <ActionButton onClick={onUseText} icon={TextIcon} label="使用文字" />
                            <ActionButton onClick={onRestore} icon={RestoreIcon} label="還原設定" />
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel: History */}
            <aside className="w-full md:w-80 flex-shrink-0 bg-gray-900/50 overflow-y-auto p-2">
                 <VeoHistory 
                    history={history} 
                    onDelete={onDelete} 
                    onPlay={onPlay} 
                    onRegenerate={onRegenerate}
                    onUseText={onUseText}
                    onRestore={onRestore}
                />
            </aside>
        </main>
    );
};
