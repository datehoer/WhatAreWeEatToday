import React, { useState } from 'react';
import { Shop } from '../types';
import { Star, MapPin, Banknote } from 'lucide-react';

interface ShopCardProps {
  shop: Shop;
  mode: 'select' | 'vote' | 'display';
  isSelected?: boolean;
  onToggle?: (shop: Shop) => void;
  voteCount?: number;
  totalVotes?: number;
  hasVotedForThis?: boolean;
  onVote?: (shopId: string) => void;
  voters?: string[]; // 投票者邮箱列表
}

export const ShopCard: React.FC<ShopCardProps> = ({
  shop,
  mode,
  isSelected,
  onToggle,
  voteCount = 0,
  totalVotes = 1,
  hasVotedForThis,
  onVote,
  voters = []
}) => {
  // 提取邮箱 @ 前的部分作为用户名
  const voterNames = voters.map(email => email.split('@')[0]);
  const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

  // deepinfo 展开状态
  const [showAllDeepinfo, setShowAllDeepinfo] = useState(false);
  const MAX_VISIBLE_DEEPINFO = 3;
  const hasDeepinfo = shop.deepinfo && shop.deepinfo.length > 0;
  const visibleDeepinfo = hasDeepinfo && !showAllDeepinfo
    ? shop.deepinfo.slice(0, MAX_VISIBLE_DEEPINFO)
    : shop.deepinfo || [];
  const hasMoreDeepinfo = hasDeepinfo && shop.deepinfo.length > MAX_VISIBLE_DEEPINFO;

  return (
    <div 
      className={`relative w-full bg-white rounded-xl shadow-sm border transition-all duration-200 overflow-hidden ${
        hasVotedForThis ? 'border-orange-500 ring-1 ring-orange-500 bg-orange-50' : 'border-gray-100'
      } ${mode === 'select' && isSelected ? 'border-orange-500 bg-orange-50' : ''}`}
      onClick={() => {
        if (mode === 'select' && onToggle) onToggle(shop);
        if (mode === 'vote' && onVote) onVote(shop.id);
      }}
    >
      {/* Progress Bar Background for Vote Mode */}
      {mode === 'vote' && percentage > 0 && (
        <div
          className="absolute top-0 bottom-0 left-0 bg-orange-100 transition-all duration-500 z-0 pointer-events-none"
          style={{ width: `${percentage}%`, opacity: 0.5 }}
        />
      )}

      <div className="relative z-10 p-3 flex items-center gap-3">
        {/* Image */}
        <div className="flex-shrink-0 w-20 h-20 bg-gray-200 rounded-lg overflow-hidden">
          <img src={shop.image_url} alt={shop.name} className="w-full h-full object-cover" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h3 className="text-base font-bold text-gray-900 truncate">{shop.name}</h3>
            {mode === 'select' && (
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
            )}
            {mode === 'vote' && (
              <span className="text-sm font-bold text-orange-600">{voteCount} 票</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span className="flex items-center text-yellow-500">
              <Star size={12} fill="currentColor" className="mr-0.5" />
              {shop.rating}
            </span>
            <span>•</span>
            <span className="flex items-center">
              <Banknote size={12} className="mr-0.5" />
              ¥{shop.avg_price}/人
            </span>
            <span>•</span>
            <span className="flex items-center">
              <MapPin size={12} className="mr-0.5" />
              {shop.distance < 1000 ? `${Math.round(shop.distance)}m` : `${(shop.distance / 1000).toFixed(1)}km`}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {shop.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                {tag}
              </span>
            ))}
          </div>

          {/* Deepinfo - 餐厅详细信息 */}
          {hasDeepinfo && (
            <div className="mt-2 flex flex-wrap gap-1">
              {visibleDeepinfo.map((info, index) => (
                <span key={index} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded">
                  {info}
                </span>
              ))}
              {hasMoreDeepinfo && !showAllDeepinfo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllDeepinfo(true);
                  }}
                  className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded hover:bg-gray-100"
                >
                  更多 {shop.deepinfo!.length - MAX_VISIBLE_DEEPINFO}+
                </button>
              )}
              {showAllDeepinfo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllDeepinfo(false);
                  }}
                  className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded hover:bg-gray-100"
                >
                  收起
                </button>
              )}
            </div>
          )}

          {/* 投票者列表（仅投票模式） */}
          {mode === 'vote' && voterNames.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {voterNames.map((name, index) => (
                <span key={index} className="px-1.5 py-0.5 bg-green-50 text-green-700 text-[10px] rounded-full font-medium">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
