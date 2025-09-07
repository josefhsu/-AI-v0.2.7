import React from 'react';
import type { VeoHistoryItem, VeoParams } from '../types';
// FIX: Import VideoCameraIcon from the central icon component file for consistency.
import { DownloadIcon, TrashIcon, WandIcon, VideoCameraIcon } from './Icon';

interface VeoPanelProps {
  isLoading: boolean;
  loadingMessage: string;
  videoUrl: string | null;
  history: VeoHistoryItem[];
  onDeleteHistory: (id: string) => void;
  onRestoreSettings: (params: VeoParams) => void;
}

const VeoHistoryItemCard: React.FC<{
  item: VeoHistoryItem;
  onDelete: (id: string) => void;
  onRestore: (params: VeoParams) => void;
}> = ({ item, onDelete, onRestore }) => {
  return (
    <div className="relative group break-inside-avoid mb-4 overflow-hidden rounded-lg shadow-lg shadow-black/50">
      <img src={item.thumbnailUrl} alt={item.prompt} className="w-full h-auto block" />
      <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col p-2 text-white">
        <p className="text-xs flex-grow overflow-hidden">{item.prompt}</p>
        <div className="flex justify-end gap-2 mt-2">
            <button
                onClick={() => onRestore(item)}
                title="還原設定"
                className="p-2 bg-slate-700/80 rounded-full hover:bg-cyan-600"
            >
                <WandIcon className="w-4 h-4" />
            </button>
          <a
            href={`${item.videoUrl}&key=${process.env.API_KEY}`}
            download={`veo-video-${item.id}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
            title="下載影片"
            className="p-2 bg-slate-700/80 rounded-full hover:bg-cyan-600"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
          <button
            onClick={() => onDelete(item.id)}
            title="刪除紀錄"
            className="p-2 bg-slate-700/80 rounded-full hover:bg-red-600"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const VeoPanel: React.FC<VeoPanelProps> = ({
  isLoading,
  loadingMessage,
  videoUrl,
  history,
  onDeleteHistory,
  onRestoreSettings,
}) => {
  const videoUrlWithKey = videoUrl ? `${videoUrl}&key=${process.env.API_KEY}` : null;

  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-black overflow-hidden h-full">
      {/* Video Player Section */}
      <div className="lg:col-span-2 bg-gray-900/50 rounded-lg flex flex-col items-center justify-center p-4 relative shadow-lg shadow-cyber-cyan/10 ring-1 ring-cyber-cyan/20">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center text-center text-white">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-fuchsia-500 mb-4"></div>
            <p className="text-lg font-semibold mb-2">影片生成中...</p>
            <p className="text-sm text-slate-400 max-w-sm">{loadingMessage}</p>
          </div>
        ) : videoUrlWithKey ? (
          <video src={videoUrlWithKey} controls autoPlay loop className="max-w-full max-h-full rounded-md" />
        ) : (
          <div className="text-center text-slate-500">
            <VideoCameraIcon className="w-24 h-24 mx-auto mb-4" />
            <p className="text-lg font-semibold">您生成的影片將會顯示在這裡</p>
          </div>
        )}
      </div>

      {/* History Section */}
      <div className="lg:col-span-1 bg-gray-900/50 rounded-lg flex flex-col overflow-hidden p-4 shadow-lg shadow-cyber-pink/10 ring-1 ring-cyber-pink/20">
        <h2 className="text-xl font-bold text-cyan-400 mb-4 flex-shrink-0">歷史紀錄</h2>
        {history.length === 0 ? (
          <div className="flex-grow flex items-center justify-center text-center text-slate-500">
            <p>這裡還沒有任何紀錄。</p>
          </div>
        ) : (
          <div className="overflow-y-auto pr-2" style={{ columnCount: 2, columnGap: '1rem' }}>
            {history.map(item => (
              <VeoHistoryItemCard
                key={item.id}
                item={item}
                onDelete={onDeleteHistory}
                onRestore={onRestoreSettings}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

// FIX: Removed dummy icon definition, as it is now imported from Icon.tsx
