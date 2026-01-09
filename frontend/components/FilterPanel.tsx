import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface FilterState {
  minDistance: number;
  maxDistance: number;
  minPrice: number;
  maxPrice: number;
  minRating: number;
  maxRating: number;
  sortBy: 'distance' | 'rating' | 'price' | 'default';
}

interface FilterPanelProps {
  filterState: FilterState;
  onChange: (newState: Partial<FilterState>) => void;
  onReset: () => void;
}

const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};

export const CollapsibleFilterPanel: React.FC<FilterPanelProps & { expanded: boolean; onToggle: () => void }> = ({
  expanded,
  onToggle,
  filterState,
  onChange,
  onReset
}) => {
  const {
    minDistance,
    maxDistance,
    minPrice,
    maxPrice,
    minRating,
    maxRating,
    sortBy
  } = filterState;

  const hasActiveFilter =
    minDistance > 0 ||
    maxDistance < 5000 ||
    minPrice > 0 ||
    maxPrice < 500 ||
    minRating > 0 ||
    maxRating < 5 ||
    sortBy !== 'distance';

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
    >
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">筛选和排序</span>
          {hasActiveFilter && (
            <span className="text-xs text-orange-600">●</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilter && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="text-xs text-orange-600 hover:text-orange-700"
            >
              重置
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-3 pt-0 border-t border-gray-50 space-y-4">
          {/* 距离区间 */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-600">距离区间</div>
              <div className="text-xs text-orange-600 font-medium">
                {formatDistance(minDistance)} - {formatDistance(maxDistance)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8">最近</span>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="100"
                  value={minDistance}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    onChange({ minDistance: Math.min(val, maxDistance - 100) });
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8">最远</span>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="100"
                  value={maxDistance}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    onChange({ maxDistance: Math.max(val, minDistance + 100) });
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0m</span>
              <span>5km</span>
            </div>
          </div>

          {/* 价格区间 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-600">价格区间</div>
              <div className="text-xs text-orange-600 font-medium">
                ¥{minPrice} - ¥{maxPrice}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8">最低</span>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="10"
                  value={minPrice}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    onChange({ minPrice: Math.min(val, maxPrice - 10) });
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8">最高</span>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="10"
                  value={maxPrice}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    onChange({ maxPrice: Math.max(val, minPrice + 10) });
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>¥0</span>
              <span>¥500</span>
            </div>
          </div>

          {/* 评分区间 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-600">评分区间</div>
              <div className="text-xs text-orange-600 font-medium">
                {minRating.toFixed(1)} - {maxRating.toFixed(1)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8">最低</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={minRating}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange({ minRating: Math.min(val, maxRating - 0.1) });
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8">最高</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={maxRating}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onChange({ maxRating: Math.max(val, minRating + 0.1) });
                  }}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0.0</span>
              <span>5.0</span>
            </div>
          </div>

          {/* 排序方式 */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2">排序方式</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'distance', label: '按距离', icon: '📍' },
                { value: 'rating', label: '按评分', icon: '⭐' },
                { value: 'price', label: '按价格', icon: '💰' },
                { value: 'default', label: '综合', icon: '🔄' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => onChange({ sortBy: option.value as any })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    sortBy === option.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
