// 青逝痕 Tenkinoko 制作
import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X, Images } from 'lucide-react';
import { UPLOADED_GALLERY_ITEMS, UploadedAssetItem } from '../data/strongholdData';

interface ImageLightboxModalProps {
  initialUrl: string | null;
  initialTitle?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  initialUrl,
  initialTitle,
  onClose,
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(
    initialUrl || UPLOADED_GALLERY_ITEMS[0].url
  );
  const [currentTitle, setCurrentTitle] = useState<string>(
    initialTitle || UPLOADED_GALLERY_ITEMS[0].title
  );
  const [zoom, setZoom] = useState<number>(1);
  const [activeCategory, setActiveCategory] = useState<string>('全部');

  if (!initialUrl) return null;

  const categories = ['全部', '公式化运营', '站位一图流', '盟约全图鉴', '贴吧高分实战'];
  const filteredItems = UPLOADED_GALLERY_ITEMS.filter(
    (item) => activeCategory === '全部' || item.category === activeCategory
  );

  const handleSelectAsset = (item: UploadedAssetItem) => {
    setCurrentUrl(item.url);
    setCurrentTitle(item.title);
    setZoom(1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="高清原图一图流检视器"
      className="fixed inset-0 z-50 bg-[#070A0F]/95 flex flex-col"
    >
      {/* Top Control Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-[#0F172A]">
        <div className="flex items-center gap-3 min-w-0">
          <Images className="w-5 h-5 text-amber-400 shrink-0" />
          <h2 className="text-base font-semibold text-slate-100 truncate">
            {currentTitle}
          </h2>
          <span className="text-xs text-slate-400 hidden sm:inline">
            · 支持滚轮与按钮缩放检视细节
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            aria-label="缩小图片"
          >
            <ZoomOut className="w-3.5 h-3.5" />
            <span>缩小</span>
          </button>
          <span className="text-xs font-mono-tabular text-amber-400 px-2">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            aria-label="放大图片"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>放大</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            aria-label="重置缩放"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            aria-label="关闭原图检视器"
          >
            <X className="w-4 h-4" />
            <span>关闭</span>
          </button>
        </div>
      </div>

      {/* Main Split Body: Left Thumbnail Switcher + Right High-Res Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: All 21 Uploaded Images */}
        <aside className="w-80 border-r border-slate-800 bg-[#0B0E14] flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-slate-800 flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredItems.map((item) => {
              const active = item.url === currentUrl;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectAsset(item)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-start gap-3 ${
                    active
                      ? 'bg-slate-800/90 border-amber-500/70 text-slate-100'
                      : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-16 h-12 object-cover rounded bg-slate-950 shrink-0 border border-slate-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-100 line-clamp-1">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center/Right Scrollable Image Viewport */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-[#070A0F]">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
            className="transition-transform duration-150"
          >
            <img
              src={currentUrl}
              alt={currentTitle}
              referrerPolicy="no-referrer"
              className="max-w-full rounded-lg border border-slate-800 shadow-2xl bg-slate-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
