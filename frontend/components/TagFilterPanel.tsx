import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface TagInfo {
  tag: string;
  count: number;
}

export type TagFilterState = 'include' | 'exclude' | 'none';

interface TagFilterPanelProps {
  allTags: TagInfo[];
  includeTags: Set<string>;
  excludeTags: Set<string>;
  expanded: boolean;
  onToggle: () => void;
  onTagClick: (tag: string) => void;
  onClear: () => void;
}

export const TagFilterPanel: React.FC<TagFilterPanelProps> = ({
  allTags,
  includeTags,
  excludeTags,
  expanded,
  onToggle,
  onTagClick,
  onClear
}) => {
  const activeFilterCount = includeTags.size + excludeTags.size;

  const getTagState = (tag: string): TagFilterState => {
    if (includeTags.has(tag)) return 'include';
    if (excludeTags.has(tag)) return 'exclude';
    return 'none';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">标签筛选</span>
          {activeFilterCount > 0 && (
            <span className="text-xs text-orange-600">
              ({activeFilterCount})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-xs text-orange-600 hover:text-orange-700"
            >
              清除
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-3 pt-0 border-t border-gray-50">
          <div className="flex flex-wrap gap-2 mt-3">
            {allTags.map(({ tag, count }) => {
              const state = getTagState(tag);
              return (
                <button
                  key={tag}
                  onClick={() => onTagClick(tag)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    state === 'include'
                      ? 'bg-green-500 text-white'
                      : state === 'exclude'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
              {includeTags.size > 0 && (
                <span className="inline-flex items-center gap-1 mr-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  包含: {Array.from(includeTags).join(', ')}
                </span>
              )}
              {excludeTags.size > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  排除: {Array.from(excludeTags).join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
