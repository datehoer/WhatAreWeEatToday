/**
 * Vercel Analytics 事件追踪工具
 */

// 事件类型定义
export type AnalyticsEvent =
  // 页面浏览
  | 'page_view_home'
  | 'page_view_vote'
  | 'page_view_rooms'
  | 'page_view_me'
  // 用户交互
  | 'search_input'
  | 'filter_toggle'
  | 'tag_filter_include'
  | 'tag_filter_exclude'
  | 'tag_filter_clear'
  | 'location_change'
  // 关键业务
  | 'room_create'
  | 'room_enter'
  | 'room_exit'
  | 'room_dismiss'
  | 'vote_cast'
  | 'vote_cancel'
  | 'shop_select'
  | 'shop_deselect'
  // API调用
  | 'api_load_shops'
  | 'api_load_more'
  | 'api_search'
  | 'api_get_tags'

// 追踪事件
export function trackEvent(event: AnalyticsEvent, properties?: Record<string, string | number | boolean>) {
  // @ts-ignore - Vercel Analytics track function
  if (typeof window !== 'undefined' && window.va) {
    // @ts-ignore
    window.va('event', {
      name: event,
      ...properties
    });
  }
}

// 页面浏览追踪
export const trackPageView = {
  home: () => trackEvent('page_view_home'),
  vote: () => trackEvent('page_view_vote'),
  rooms: () => trackEvent('page_view_rooms'),
  me: () => trackEvent('page_view_me'),
};

// 用户交互追踪
export const trackInteraction = {
  search: (query: string) => trackEvent('search_input', { query, hasQuery: !!query }),
  filterToggle: (filterType: string) => trackEvent('filter_toggle', { filterType }),
  tagInclude: (tag: string) => trackEvent('tag_filter_include', { tag }),
  tagExclude: (tag: string) => trackEvent('tag_filter_exclude', { tag }),
  tagClear: () => trackEvent('tag_filter_clear'),
  locationChange: (locationName: string) => trackEvent('location_change', { locationName }),
};

// 关键业务追踪
export const trackBusiness = {
  roomCreate: (candidatesCount: number, expiryMinutes?: number) =>
    trackEvent('room_create', { candidatesCount, expiryMinutes: expiryMinutes ?? 0 }),
  roomEnter: (roomCode: string) => trackEvent('room_enter', { roomCode }),
  roomExit: (roomCode: string) => trackEvent('room_exit', { roomCode }),
  roomDismiss: (roomCode: string) => trackEvent('room_dismiss', { roomCode }),
  voteCast: (roomCode: string, shopId: string) =>
    trackEvent('vote_cast', { roomCode, shopId }),
  voteCancel: (roomCode: string) =>
    trackEvent('vote_cancel', { roomCode }),
  shopSelect: (shopName: string) =>
    trackEvent('shop_select', { shopName }),
  shopDeselect: (shopId: string) =>
    trackEvent('shop_deselect', { shopId }),
};

// API 调用追踪
export const trackApi = {
  loadShops: (count: number, hasSearch?: boolean, hasTags?: boolean) =>
    trackEvent('api_load_shops', { count, hasSearch, hasTags }),
  loadMore: (count: number) =>
    trackEvent('api_load_more', { count }),
  search: (query: string) =>
    trackEvent('api_search', { query }),
  getTags: (tagCount: number) =>
    trackEvent('api_get_tags', { tagCount }),
};
