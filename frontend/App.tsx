import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from './services/supabaseApi';
import { trackPageView, trackInteraction, trackBusiness, trackApi } from './services/analytics';
import { Shop, Room, HomeTab, AppTab } from './types';
import { ShopCard } from './components/ShopCard';
import { CollapsibleFilterPanel, FilterState } from './components/FilterPanel';
import { TagFilterPanel } from './components/TagFilterPanel';
import { AuthPanel } from './components/AuthPanel';
import { LoginPage } from './components/LoginPage';
import { DEFAULT_LOCATION } from './config/location';
import { useSupabaseSession } from './services/useSupabaseSession';
import { supabase } from './services/supabaseClient';
import {
  MapPin, Settings2, Shuffle, ArrowRight, Share2, Copy,
  ChefHat, CheckCircle2, Home, User, Utensils, LogOut, Search, X, ArrowUp,
  Plus, Trash2, Navigation, Star
} from 'lucide-react';

// --- Utilities ---

const PAGE_SIZE = 20;

// --- Components ---

const Header = ({ title, rightAction }: { title: string, rightAction?: React.ReactNode }) => (
  <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <ChefHat className="text-orange-500 w-6 h-6" />
      <h1 className="font-bold text-lg text-gray-800">{title}</h1>
    </div>
    {rightAction}
  </header>
);

const Toast = ({ message, show }: { message: string, show: boolean }) => (
  <div className={`fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full text-sm shadow-lg transition-all duration-300 z-[60] ${show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
    {message}
  </div>
);

// --- Main App ---

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null);

  // Global Data State
  const { user: authedUser, loading: authLoading } = useSupabaseSession();
  const [toastMsg, setToastMsg] = useState('');
  const [nearbyShops, setNearbyShops] = useState<Shop[]>([]);
  const [todayRecommendations, setTodayRecommendations] = useState<Shop[]>([]);
  const [locationName, setLocationName] = useState(DEFAULT_LOCATION.name);
  const [searchQuery, setSearchQuery] = useState('');

  // 当前使用的位置（优先使用用户的默认位置，否则使用配置的默认位置）
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number
    lng: number
    name: string
  }>({
    lat: DEFAULT_LOCATION.lat,
    lng: DEFAULT_LOCATION.lng,
    name: DEFAULT_LOCATION.name
  });

  // 标签筛选状态
  const [includeTags, setIncludeTags] = useState<Set<string>>(new Set());
  const [excludeTags, setExcludeTags] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  // 分页加载状态
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // refs：避免滚动/回调拿到旧闭包里的状态
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const voteScrollRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const shopsCountRef = useRef(0);
  const includeTagsRef = useRef(includeTags);
  const excludeTagsRef = useRef(excludeTags);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  };

  const requireAuth = (nextTab: AppTab = 'me'): boolean => {
    if (authLoading) return false
    if (!authedUser) {
      showToast('请先登录后再使用该功能')
      setActiveTab(nextTab)
      return false
    }
    return true
  }

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    shopsCountRef.current = nearbyShops.length;
  }, [nearbyShops.length]);

  useEffect(() => {
    includeTagsRef.current = includeTags;
  }, [includeTags]);

  useEffect(() => {
    excludeTagsRef.current = excludeTags;
  }, [excludeTags]);

  // 搜索和筛选状态
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    minDistance: 0,
    maxDistance: 5000,
    minPrice: 0,
    maxPrice: 500,
    minRating: 0,
    maxRating: 5,
    sortBy: 'distance'
  });

  // 用户位置管理状态
  type UserLocation = {
    id: number
    name: string
    lat: number
    lng: number
    is_default: boolean
  }
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationNameInput, setLocationNameInput] = useState('');
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [useDefaultConfig, setUseDefaultConfig] = useState(false); // 是否使用配置的默认位置

  // 前端过滤和排序（名称搜索已移至后端）
  const filteredShops = useMemo(() => {
    let result = [...nearbyShops];

    // 1. 距离区间过滤
    result = result.filter(shop => {
      return shop.distance >= filterState.minDistance && shop.distance <= filterState.maxDistance;
    });

    // 2. 价格区间过滤
    result = result.filter(shop => {
      const price = shop.avg_price || 0;
      return price >= filterState.minPrice && price <= filterState.maxPrice;
    });

    // 3. 评分区间过滤
    result = result.filter(shop => {
      return shop.rating >= filterState.minRating && shop.rating <= filterState.maxRating;
    });

    // 4. 排序（使用副本避免修改原数组）
    result = [...result].sort((a, b) => {
      switch (filterState.sortBy) {
        case 'distance':
          return a.distance - b.distance;
        case 'rating':
          return b.rating - a.rating;
        case 'price':
          return (a.avg_price || 0) - (b.avg_price || 0);
        case 'default':
          return 0;
        default:
          return 0;
      }
    });

    return result;
  }, [nearbyShops, filterState]);

  // 搜索查询的 ref，用于在 loadShops 中使用
  const searchQueryRef = useRef(searchQuery);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // 生成或获取今日推荐
  const getTodayRecommendations = useCallback(() => {
    const today = new Date().toDateString(); // 获取今天的日期作为缓存 key
    const cacheKey = `today_recommendations_${today}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const recommendations = JSON.parse(cached);
        // 验证缓存的数据是否完整
        if (Array.isArray(recommendations) && recommendations.length === 5) {
          setTodayRecommendations(recommendations);
          return;
        }
      } catch (e) {
        console.error('Failed to parse cached recommendations:', e);
      }
    }

    // 如果没有缓存或缓存无效，生成新的推荐
    if (nearbyShops.length > 0) {
      const shuffled = [...nearbyShops].sort(() => 0.5 - Math.random());
      const recommendations = shuffled.slice(0, 5);

      // 存入缓存
      localStorage.setItem(cacheKey, JSON.stringify(recommendations));
      setTodayRecommendations(recommendations);
    }
  }, [nearbyShops]);

  // 加载餐厅数据的函数
  const loadShops = useCallback(async (resetPage = false) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      if (resetPage) {
        setNearbyShops([]);
        shopsCountRef.current = 0;
      }

      const includeTagsArray = Array.from(includeTagsRef.current);
      const excludeTagsArray = Array.from(excludeTagsRef.current);
      const currentSearchQuery = searchQueryRef.current;

      const data = await api.getNearbyShops(
        resetPage ? 0 : shopsCountRef.current,
        PAGE_SIZE,
        includeTagsArray.length > 0 ? includeTagsArray : undefined,
        excludeTagsArray.length > 0 ? excludeTagsArray : undefined,
        currentSearchQuery.trim() || undefined,
        currentLocation.lat,
        currentLocation.lng,
        DEFAULT_LOCATION.radius
      );

      // 追踪 API 调用
      if (resetPage) {
        const hasSearch = !!currentSearchQuery?.trim();
        const hasTags = includeTagsArray.length > 0 || excludeTagsArray.length > 0;
        trackApi.loadShops(data.length, hasSearch, hasTags);
        if (hasSearch) {
          trackApi.search(currentSearchQuery.trim());
        }
      } else {
        trackApi.loadMore(data.length);
      }

      if (resetPage) {
        setNearbyShops(data);
        shopsCountRef.current = data.length;
      } else {
        setNearbyShops(prev => {
          if (data.length === 0) return prev;
          const seen = new Set(prev.map(s => s.id));
          const merged = [...prev];
          for (const shop of data) {
            if (!seen.has(shop.id)) {
              seen.add(shop.id);
              merged.push(shop);
            }
          }
          shopsCountRef.current = merged.length;
          return merged;
        });
      }

      const nextHasMore = data.length === PAGE_SIZE;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [currentLocation]);

  // 切换标签状态：默认 → 选中（包含）→ 排除 → 默认
  const toggleTag = (tag: string) => {
    const nextInclude = new Set(includeTagsRef.current);
    const nextExclude = new Set(excludeTagsRef.current);

    if (nextInclude.has(tag)) {
      // 包含 -> 排除
      nextInclude.delete(tag);
      nextExclude.add(tag);
      trackInteraction.tagExclude(tag);
    } else if (nextExclude.has(tag)) {
      // 排除 -> 默认
      nextExclude.delete(tag);
    } else {
      // 默认 -> 包含
      nextInclude.add(tag);
      trackInteraction.tagInclude(tag);
    }

    includeTagsRef.current = nextInclude;
    excludeTagsRef.current = nextExclude;
    setIncludeTags(nextInclude);
    setExcludeTags(nextExclude);

    loadShops(true);
  };

  // 清除所有标签筛选
  const clearTagFilters = () => {
    const nextInclude = new Set<string>();
    const nextExclude = new Set<string>();
    includeTagsRef.current = nextInclude;
    excludeTagsRef.current = nextExclude;
    setIncludeTags(nextInclude);
    setExcludeTags(nextExclude);
    // 清除后重新加载数据
    loadShops(true);
    trackInteraction.tagClear();
  };

  // 筛选器处理函数
  const handleFilterChange = (newState: Partial<FilterState>) => {
    setFilterState(prev => ({ ...prev, ...newState }));
  };

  const handleFilterReset = () => {
    setFilterState({
      minDistance: 0,
      maxDistance: 5000,
      minPrice: 0,
      maxPrice: 500,
      minRating: 0,
      maxRating: 5,
      sortBy: 'distance'
    });
  };

  // Creation State (Vote Tab)
  const [selectedShops, setSelectedShops] = useState<Shop[]>([]);
  const [creationTab, setCreationTab] = useState<HomeTab>('manual');
  const [randomCandidates, setRandomCandidates] = useState<Shop[]>([]);
  const [roomConfigModalOpen, setRoomConfigModalOpen] = useState(false); // 房间配置弹窗
  const [roomExpiryMinutes, setRoomExpiryMinutes] = useState<number | undefined>(30); // 默认30分钟
  const [roomNameInput, setRoomNameInput] = useState(''); // 房间名称输入
  const [myRooms, setMyRooms] = useState<any[]>([]); // 我的房间列表
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Room State (Vote Tab)
  const [roomData, setRoomData] = useState<Room | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [addShopModalOpen, setAddShopModalOpen] = useState(false); // 添加店铺弹窗
  const [shopSearchQuery, setShopSearchQuery] = useState(''); // 店铺搜索查询
  const [selectedShopToAdd, setSelectedShopToAdd] = useState<Shop | null>(null); // 选中的店铺
  const [addingShop, setAddingShop] = useState(false); // 正在添加店铺

  // --- Effects ---

  // 1. Route Handling (Hash)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#room/')) {
        // 等待认证加载完成后再检查登录状态
        if (authLoading) return

        if (!authedUser) {
          showToast('请先登录后再进入投票房间')
          window.location.hash = ''
          setActiveTab('me')
          setCurrentRoomCode(null)
          setRoomData(null)
          return
        }
        const code = hash.split('/')[1];
        if (code) {
          setCurrentRoomCode(code);
          setActiveTab('vote'); // Auto switch to vote tab
        }
      } else {
        setCurrentRoomCode(null);
        // Don't force switch tab on hash clear, user might just be navigating back
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Init

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [authLoading, authedUser]);

  // 1.5 Auth State: 登录后初始化到主页
  useEffect(() => {
    if (authLoading) return
    if (authedUser && activeTab === 'me') {
      // 如果刚登录成功且在"我的"页面，切换到主页
      setActiveTab('home')
      setHasMore(true)
    }
  }, [authLoading, authedUser]);

  // 2. Load Shops (Global)
  useEffect(() => {
    if (authLoading) return
    if (!authedUser) return
    // 初始加载
    const loadInitialData = async () => {
      // 并行加载标签和餐厅数据
      const [tagsData] = await Promise.all([
        api.getAllTags(),
        loadShops(true)
      ]);

      setAllTags(tagsData);
      // 追踪标签加载
      trackApi.getTags(tagsData.length);
    };

    loadInitialData();
  }, [authLoading, authedUser, loadShops]);

  // 3. 搜索查询变化时重新加载数据
  useEffect(() => {
    if (authLoading) return
    if (!authedUser) return
    // 防抖处理搜索输入
    const timer = setTimeout(() => {
      loadShops(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, authLoading, authedUser]);

  // 4. 附近餐厅加载完成后生成今日推荐
  useEffect(() => {
    if (nearbyShops.length > 0) {
      getTodayRecommendations();
    }
  }, [nearbyShops, getTodayRecommendations]);

  // 加载用户保存的位置
  useEffect(() => {
    if (authLoading || !authedUser) return
    const loadUserLocations = async () => {
      try {
        const locations = await api.getUserLocations()
        setUserLocations(locations)
      } catch (error) {
        console.error('Failed to load user locations:', error)
      }
    }
    loadUserLocations()
  }, [authLoading, authedUser])

  // 加载房间列表（切换到 rooms 标签时）
  useEffect(() => {
    if (activeTab !== 'rooms') return
    loadMyRooms()

    // 每分钟刷新一次倒计时
    const interval = setInterval(() => {
      loadMyRooms()
    }, 60000)

    return () => clearInterval(interval)
  }, [activeTab])

  // 页面浏览追踪
  useEffect(() => {
    if (!authedUser) return
    switch (activeTab) {
      case 'home':
        trackPageView.home();
        break;
      case 'vote':
        trackPageView.vote();
        break;
      case 'rooms':
        trackPageView.rooms();
        break;
      case 'me':
        trackPageView.me();
        break;
    }
  }, [activeTab, authedUser])

  // 位置管理处理函数
  const handleGetCurrentLocation = async () => {
    setLocating(true)
    try {
      const position = await api.getCurrentPosition()
      setCurrentPosition(position)
      showToast('定位成功')
    } catch (error: any) {
      showToast(error?.message || '定位失败')
    } finally {
      setLocating(false)
    }
  }

  const handleSaveLocation = async () => {
    if (!currentPosition) {
      showToast('请先获取当前位置')
      return
    }
    if (!locationNameInput.trim()) {
      showToast('请输入位置名称')
      return
    }

    try {
      const isDefault = userLocations.length === 0 // 如果是第一个位置，设为默认
      await api.saveUserLocation(
        locationNameInput.trim(),
        currentPosition.lat,
        currentPosition.lng,
        isDefault
      )
      showToast('位置保存成功')

      // 重新加载位置列表
      const locations = await api.getUserLocations()
      setUserLocations(locations)

      // 关闭弹窗并重置表单
      setLocationModalOpen(false)
      setLocationNameInput('')
      setCurrentPosition(null)
    } catch (error: any) {
      showToast(error?.message || '保存失败')
    }
  }

  // 选择使用某个位置
  const handleSelectLocation = (location: UserLocation) => {
    setCurrentLocation({
      lat: location.lat,
      lng: location.lng,
      name: location.name
    })
    setLocationName(location.name)
    setUseDefaultConfig(false)
    trackInteraction.locationChange(location.name)
    showToast(`已切换到：${location.name}`)
  }

  // 选择使用默认配置位置
  const handleSelectDefaultConfig = () => {
    setCurrentLocation({
      lat: DEFAULT_LOCATION.lat,
      lng: DEFAULT_LOCATION.lng,
      name: DEFAULT_LOCATION.name
    })
    setLocationName(DEFAULT_LOCATION.name)
    setUseDefaultConfig(true)
    showToast(`已切换到：${DEFAULT_LOCATION.name}`)
  }

  const handleDeleteLocation = async (locationId: number) => {
    try {
      await api.deleteUserLocation(locationId)
      showToast('位置已删除')

      // 重新加载位置列表
      const locations = await api.getUserLocations()
      setUserLocations(locations)
    } catch (error: any) {
      showToast(error?.message || '删除失败')
    }
  }

  const handleSetDefaultLocation = async (locationId: number) => {
    try {
      await api.setDefaultLocation(locationId)
      showToast('已设置为默认位置')

      // 重新加载位置列表
      const locations = await api.getUserLocations()
      setUserLocations(locations)
    } catch (error: any) {
      showToast(error?.message || '设置失败')
    }
  }

  const loadMore = useCallback(async () => {
    // 使用 ref 访问最新状态
    if (loadingRef.current || !hasMoreRef.current || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    try {
      await loadShops(false);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [loadShops]);

  // 滚动监听器 - 在主页和投票页的自主挑选模式下启用
  useEffect(() => {
    const shouldEnableScroll = activeTab === 'home' || (activeTab === 'vote' && creationTab === 'manual' && !currentRoomCode);

    if (!shouldEnableScroll) return;

    // 主页使用 main 元素；投票页（自主挑选）使用内部列表滚动容器
    const scrollElement =
      activeTab === 'home' ? mainScrollRef.current :
      (activeTab === 'vote' && creationTab === 'manual') ? voteScrollRef.current :
      null;

    if (!scrollElement) return;

    const handleScroll = () => {
      const scrollHeight = scrollElement.scrollHeight;
      const scrollTop = scrollElement.scrollTop;
      const clientHeight = scrollElement.clientHeight;

      // 当滚动超过 300px 时显示返回顶部按钮（仅主页）
      if (activeTab === 'home') {
        setShowBackToTop(scrollTop > 300);
      }

      // 当滚动到距离底部 200px 时加载更多
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [activeTab, creationTab, currentRoomCode, loadMore]);

  // 3. Room Realtime Subscription
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (activeTab === 'vote' && currentRoomCode) {
      // 初始获取房间数据
      const fetchRoom = async () => {
        const room = await api.getRoom(currentRoomCode);
        if (room) setRoomData(room);
      };

      fetchRoom();

      // 订阅实时更新
      unsubscribe = api.subscribeToRoomVotes(currentRoomCode, (room) => {
        setRoomData(room);
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [activeTab, currentRoomCode]);

  // Initial Randomize logic for Vote Creation
  useEffect(() => {
    if (activeTab === 'vote' && !currentRoomCode && creationTab === 'random' && nearbyShops.length > 0 && randomCandidates.length === 0) {
      handleRandomize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentRoomCode, creationTab, nearbyShops]);

  // --- Handlers ---

  const handleCreateRoom = async () => {
    if (!requireAuth('me')) return
    const candidates = creationTab === 'manual' ? selectedShops : randomCandidates;
    if (candidates.length < 2) return;

    // 打开配置弹窗
    setRoomConfigModalOpen(true)
  };

  // 确认创建房间
  const handleConfirmCreateRoom = async () => {
    const candidates = creationTab === 'manual' ? selectedShops : randomCandidates;

    try {
      const code = await api.createRoom(candidates, roomExpiryMinutes, roomNameInput.trim() || undefined)
      showToast('房间创建成功')

      // 追踪房间创建事件
      trackBusiness.roomCreate(candidates.length, roomExpiryMinutes)

      // 关闭弹窗并清空输入
      setRoomConfigModalOpen(false)
      setRoomNameInput('')
      setRoomExpiryMinutes(30)

      window.location.hash = `#room/${code}`
    } catch (error: any) {
      showToast(error?.message || '创建失败')
    }
  };

  // 取消创建房间
  const handleCancelCreateRoom = () => {
    setRoomConfigModalOpen(false)
  };

  const handleDismissRoom = async () => {
    if (!currentRoomCode) return
    try {
      await api.dismissRoom(currentRoomCode)
      showToast('房间已解散')

      // 追踪房间解散事件
      trackBusiness.roomDismiss(currentRoomCode)

      // 重新加载房间列表
      await loadMyRooms()

      handleExitRoom()
    } catch (error: any) {
      showToast(error?.message || '解散失败')
    }
  };

  const handleClearVotes = async () => {
    if (!currentRoomCode) return
    try {
      await api.clearVotes(currentRoomCode)
      showToast('投票已清除')

      // 重新加载房间数据
      const updatedRoom = await api.getRoom(currentRoomCode)
      if (updatedRoom) {
        setRoomData(updatedRoom)
      }
    } catch (error: any) {
      showToast(error?.message || '清除投票失败')
    }
  };

  const handleRandomize = () => {
    const shuffled = [...nearbyShops].sort(() => 0.5 - Math.random());
    setRandomCandidates(shuffled.slice(0, 5));
  };

  // 加载房间列表
  const loadMyRooms = async () => {
    if (!authedUser) return
    setLoadingRooms(true)
    try {
      const rooms = await api.getMyRooms()
      setMyRooms(rooms)
    } catch (error) {
      console.error('Failed to load rooms:', error)
    } finally {
      setLoadingRooms(false)
    }
  };

  // 进入房间
  const handleEnterRoom = async (roomCode: string) => {
    trackBusiness.roomEnter(roomCode)

    // 如果已经在当前房间，手动刷新数据
    if (currentRoomCode === roomCode) {
      const room = await api.getRoom(roomCode)
      if (room) {
        setRoomData(room)
      }
      // 确保切换到投票 tab
      setActiveTab('vote')
    } else {
      window.location.hash = `#room/${roomCode}`
    }
  };

  const handleVote = async (shopId: string) => {
    if (!requireAuth('me')) return
    if (!currentRoomCode || !roomData) return;

    const myVote = roomData.votes.find(v => v.voter_id === authedUser!.id);

    let updatedRoom: Room | null = null;

    // 如果已经投给了这个餐厅，则取消投票
    if (myVote?.shop_id === shopId) {
      updatedRoom = await api.cancelVote(currentRoomCode, myVote.voter_id);
      showToast('已取消投票');
      trackBusiness.voteCancel(currentRoomCode)
    } else {
      // 否则投票给这个餐厅
      updatedRoom = await api.castVote(currentRoomCode, authedUser!.id, shopId);
      showToast('投票成功！');
      trackBusiness.voteCast(currentRoomCode, shopId)
    }

    // 立即更新本地状态
    if (updatedRoom) {
      setRoomData(updatedRoom);
    }
  };

  // 添加候选店铺到房间
  const handleAddCandidate = async (shop: Shop) => {
    if (!currentRoomCode) return;

    setAddingShop(true);
    try {
      const result = await api.addCandidate(currentRoomCode, shop.id);

      if (result.alreadyExists) {
        showToast('该店铺已在候选列表中');
      } else {
        showToast('店铺已添加');

        // 重新获取房间数据
        const updatedRoom = await api.getRoom(currentRoomCode);
        if (updatedRoom) {
          setRoomData(updatedRoom);
        }

        // 关闭弹窗并重置状态
        setAddShopModalOpen(false);
        setShopSearchQuery('');
        setSelectedShopToAdd(null);
      }
    } catch (error: any) {
      showToast(error?.message || '添加失败');
    } finally {
      setAddingShop(false);
    }
  };

  // 从房间删除候选店铺
  const handleRemoveCandidate = async (shopId: string) => {
    if (!currentRoomCode) return;

    if (!confirm('确定要从候选列表中删除这个店铺吗？')) {
      return;
    }

    try {
      const result = await api.removeCandidate(currentRoomCode, shopId);

      if (!result.candidateExisted) {
        showToast('店铺不存在于候选列表中');
      } else {
        showToast('店铺已删除');

        // 重新获取房间数据
        const updatedRoom = await api.getRoom(currentRoomCode);
        if (updatedRoom) {
          setRoomData(updatedRoom);
        }
      }
    } catch (error: any) {
      showToast(error?.message || '删除失败');
    }
  };

  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setHasCopied(true);
    showToast('链接已复制，快发给饭搭子！');
    setTimeout(() => setHasCopied(false), 2000);
  };

  const toggleSelection = (shop: Shop) => {
    const exists = selectedShops.find(s => s.id === shop.id);
    if (exists) {
      setSelectedShops(prev => prev.filter(s => s.id !== shop.id));
      trackBusiness.shopDeselect(shop.id)
    } else {
      if (selectedShops.length >= 5) {
        showToast('最多只能选 5 个哦');
        return;
      }
      setSelectedShops(prev => [...prev, shop]);
      trackBusiness.shopSelect(shop.name)
    }
  };

  const handleExitRoom = () => {
    if (currentRoomCode) {
      trackBusiness.roomExit(currentRoomCode)
    }
    window.location.hash = '';
    setCurrentRoomCode(null);
    setRoomData(null);
  };

  const scrollToTop = () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // --- View Renderers ---

  const renderHome = () => (
    !authedUser ? (
      <div className="p-6 pb-24">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-gray-700 space-y-2">
          <div className="font-bold">需要登录</div>
          <div className="text-sm text-gray-500">登录后才能查看附近餐厅与标签筛选。</div>
        </div>
      </div>
    ) : (
    <div className="space-y-4 px-4 py-4">
       {/* Search */}
       <div className="relative">
         <Search className="absolute left-3 top-3.5 text-gray-400 w-4 h-4" />
         <input
           type="text"
           placeholder="搜索餐厅名称或标签..."
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
           className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
         />
         {searchQuery && (
           <button
             onClick={() => setSearchQuery('')}
             className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
           >
             <X size={16} />
           </button>
         )}
       </div>

       {/* 筛选器 */}
       <CollapsibleFilterPanel
         filterState={filterState}
         expanded={filterExpanded}
         onToggle={() => setFilterExpanded(!filterExpanded)}
         onChange={handleFilterChange}
         onReset={handleFilterReset}
       />

       {/* 标签筛选 */}
       <TagFilterPanel
         allTags={allTags}
         includeTags={includeTags}
         excludeTags={excludeTags}
         expanded={tagsExpanded}
         onToggle={() => setTagsExpanded(!tagsExpanded)}
         onTagClick={toggleTag}
         onClear={clearTagFilters}
       />

       <div className="flex items-center justify-between text-sm font-bold text-gray-800 mt-2">
         <h2>附近热门</h2>
         <span className="text-gray-400 text-xs">
           {searchQuery ? `搜索结果 ${nearbyShops.length} 家` : `已加载 ${nearbyShops.length} 家`}
           {!hasMore && nearbyShops.length > 0 && ' (已全部加载)'}
         </span>
       </div>

       <div className="space-y-3 pb-24">
         {filteredShops.length > 0 ? (
           <>
             {filteredShops.map(shop => (
               <div key={shop.id} id={`shop-${shop.id}`}>
                 <ShopCard shop={shop} mode="display" />
               </div>
             ))}
             {/* 加载更多指示器 */}
             {loading && (
               <div className="text-center py-4 text-gray-400 text-sm">
                 加载中...
               </div>
             )}
             {!hasMore && filteredShops.length > 0 && (
               <div className="text-center py-4 text-gray-400 text-sm">
                 没有更多餐厅了
               </div>
             )}
           </>
         ) : (
           <div className="text-center py-12 text-gray-400">
             <p>没有找到相关餐厅</p>
             <button
               onClick={() => setSearchQuery('')}
               className="mt-2 text-orange-500 text-sm font-medium"
             >
               清除搜索
             </button>
           </div>
         )}
       </div>
    </div>
    )
  );

  const renderVote = () => {
    if (!authedUser) {
      return (
        <div className="p-6 pb-24">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-gray-700 space-y-2">
            <div className="font-bold">需要登录</div>
            <div className="text-sm text-gray-500">登录后才能创建/进入投票房间。</div>
          </div>
        </div>
      )
    }
    // 1. Active Room View
    if (currentRoomCode) {
      if (!roomData) return <div className="p-10 text-center text-gray-500">加载房间信息...</div>;

      // 检查房间是否有效
      const isExpired = roomData.expires_at && roomData.expires_at < Date.now()
      const isDismissed = !roomData.is_active

      if (isExpired || isDismissed) {
        return (
          <div className="p-10 text-center">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="text-6xl mb-4">{isExpired ? '⏰' : '🚫'}</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                {isExpired ? '房间已过期' : '房间已解散'}
              </h2>
              <p className="text-gray-500 mb-6">
                {isExpired ? '该投票房间已超过有效期' : '该房间已被创建者解散'}
              </p>
              <button
                onClick={handleExitRoom}
                className="px-6 py-2 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors"
              >
                返回
              </button>
            </div>
          </div>
        )
      }

      const totalVotes = roomData.votes.length;
      const myVote = roomData.votes.find(v => v.voter_id === authedUser.id);
      const voteCounts = roomData.candidates.reduce((acc, shop) => {
        acc[shop.id] = roomData.votes.filter(v => v.shop_id === shop.id).length;
        return acc;
      }, {} as Record<string, number>);

      // 获取每个餐厅的投票者邮箱列表
      const shopVoters = roomData.candidates.reduce((acc, shop) => {
        acc[shop.id] = roomData.votes
          .filter(v => v.shop_id === shop.id)
          .map(v => v.voter_email)
          .filter(Boolean) as string[];
        return acc;
      }, {} as Record<string, string[]>);

      return (
        <div className="p-4 space-y-6 pb-24">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-center space-y-3">
             <div className="flex justify-between items-center mb-2">
               <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full animate-pulse">进行中</span>
               <div className="flex items-center gap-2">
                 {/* 清除投票按钮 - 仅创建者可见 */}
                 {roomData.created_by === authedUser.id && totalVotes > 0 && (
                   <button
                     onClick={handleClearVotes}
                     className="text-xs text-orange-500 flex items-center gap-1 hover:text-orange-700 font-medium"
                   >
                     清除投票
                   </button>
                 )}
                 {/* 解散房间按钮 - 仅创建者可见 */}
                 {roomData.created_by === authedUser.id && (
                   <button
                     onClick={handleDismissRoom}
                     className="text-xs text-red-500 flex items-center gap-1 hover:text-red-700 font-medium"
                   >
                     解散房间
                   </button>
                 )}
                 <button onClick={handleExitRoom} className="text-xs text-gray-400 flex items-center gap-1 hover:text-red-500">
                   <LogOut size={12} /> 退出
                 </button>
               </div>
             </div>
             <h2 className="text-2xl font-bold text-gray-800 tracking-wider font-mono">{roomData.room_code}</h2>
             <div className="text-gray-500 text-xs">房间号</div>
             {roomData.room_name && (
               <div className="text-lg font-semibold text-gray-700 mt-1">{roomData.room_name}</div>
             )}

             {/* 过期时间显示 */}
             {roomData.expires_at && (
               <div className="text-xs text-orange-600 bg-orange-50 px-3 py-1 rounded-full inline-block">
                 {roomData.expires_at < Date.now()
                   ? '已过期'
                   : `${Math.ceil((roomData.expires_at - Date.now()) / 60000)} 分钟后过期`}
               </div>
             )}
             {!roomData.expires_at && (
               <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full inline-block">
                 永不过期
               </div>
             )}

             <button
               onClick={copyLink}
               className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-orange-200 bg-orange-50 rounded-xl text-orange-700 font-bold hover:bg-orange-100 transition-colors"
             >
               {hasCopied ? <CheckCircle2 size={18} /> : <Share2 size={18} />}
               {hasCopied ? '链接已复制' : '复制邀请链接'}
             </button>
          </div>

          <div>
            <div className="flex justify-between items-end mb-3 px-1">
              <h2 className="font-bold text-gray-800 text-lg">候选餐厅</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAddShopModalOpen(true)}
                  className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full font-medium flex items-center gap-1 hover:bg-orange-600"
                >
                  <Plus size={12} />
                  添加店铺
                </button>
                <span className="text-xs text-gray-500 font-medium bg-gray-200 px-2 py-1 rounded-full">共 {totalVotes} 票</span>
              </div>
            </div>
            <div className="space-y-3">
              {roomData.candidates.map(shop => (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  mode="vote"
                  voteCount={voteCounts[shop.id]}
                  totalVotes={totalVotes}
                  hasVotedForThis={myVote?.shop_id === shop.id}
                  onVote={handleVote}
                  voters={shopVoters[shop.id] || []}
                  onRemove={handleRemoveCandidate}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 2. Creation View
    const activeCandidates = creationTab === 'manual' ? selectedShops : randomCandidates;
    const canCreate = activeCandidates.length >= 2;

    return (
      <div className="relative flex flex-col h-full">
        {/* Tabs */}
        <div className="flex-shrink-0 flex p-4 gap-4 bg-white border-b border-gray-100">
          <button
            onClick={() => setCreationTab('manual')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${creationTab === 'manual' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'}`}
          >
            <Settings2 size={16} />
            自主挑选
          </button>
          <button
            onClick={() => setCreationTab('random')}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 ${creationTab === 'random' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border'}`}
          >
            <Shuffle size={16} />
            帮我随机
          </button>
        </div>

        <div ref={voteScrollRef} className="flex-1 px-4 py-4 space-y-4 overflow-y-auto pb-32">
          {creationTab === 'random' && (
            <div className="text-center py-4 bg-white rounded-xl shadow-sm border border-orange-100">
               <h3 className="text-lg font-bold text-gray-800 mb-2">✨ 试试手气?</h3>
               <button onClick={handleRandomize} className="px-6 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-bold hover:bg-orange-200 transition-colors">
                 换一批
               </button>
            </div>
          )}

          {/* 搜索框和筛选器 - 仅在自主挑选模式显示 */}
          {creationTab === 'manual' && (
            <>
              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="搜索餐厅名称或标签..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* 筛选器 */}
              <CollapsibleFilterPanel
                filterState={filterState}
                expanded={filterExpanded}
                onToggle={() => setFilterExpanded(!filterExpanded)}
                onChange={handleFilterChange}
                onReset={handleFilterReset}
              />

              {/* 标签筛选 */}
              <TagFilterPanel
                allTags={allTags}
                includeTags={includeTags}
                excludeTags={excludeTags}
                expanded={tagsExpanded}
                onToggle={() => setTagsExpanded(!tagsExpanded)}
                onTagClick={toggleTag}
                onClear={clearTagFilters}
              />
            </>
          )}

          <div className="space-y-3">
            {creationTab === 'manual' ? (
              filteredShops.length > 0 ? (
                <>
                  {filteredShops.map(shop => (
                    <ShopCard
                      key={shop.id}
                      shop={shop}
                      mode="select"
                      isSelected={selectedShops.some(s => s.id === shop.id)}
                      onToggle={toggleSelection}
                    />
                  ))}
                  {/* 加载更多指示器 */}
                  {loading && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      加载中...
                    </div>
                  )}
                  {!hasMore && filteredShops.length > 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      没有更多餐厅了
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p>没有找到相关餐厅</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-orange-500 text-sm font-medium"
                  >
                    清除搜索
                  </button>
                </div>
              )
            ) : (
              randomCandidates.map(shop => (
                <ShopCard key={shop.id} shop={shop} mode="select" isSelected={true} />
              ))
            )}
          </div>
        </div>

        {/* Floating Create Button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent z-10">
          <button
            disabled={!canCreate}
            onClick={handleCreateRoom}
            className={`w-full py-3.5 rounded-full font-bold text-lg flex items-center justify-center gap-2 shadow-xl transition-all transform active:scale-[0.98] ${
              canCreate
                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-orange-500/30'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {creationTab === 'manual'
              ? `发起投票 (${selectedShops.length})`
              : `就这 5 家，发起`
            }
            {canCreate && <ArrowRight size={20} />}
          </button>
        </div>
      </div>
    );
  };

  const renderRooms = () => {
    if (!authedUser) {
      return (
        <div className="p-6 pb-24">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-gray-700 space-y-2">
            <div className="font-bold">需要登录</div>
            <div className="text-sm text-gray-500">登录后才能查看房间列表。</div>
          </div>
        </div>
      )
    }

    return (
      <div className="p-4 space-y-4 pb-24">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">我的房间</h1>
          <button
            onClick={() => setActiveTab('vote')}
            className="px-4 py-2 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            创建房间
          </button>
        </div>

        {/* 房间列表 */}
        {loadingRooms ? (
          <div className="text-center py-16 text-gray-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mb-4"></div>
            <p>加载中...</p>
          </div>
        ) : myRooms.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
            <ChefHat size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-bold text-gray-700 mb-2">暂无房间</h3>
            <p className="text-gray-500 mb-6">创建一个投票房间，邀请朋友一起选择美食吧</p>
            <button
              onClick={() => setActiveTab('vote')}
              className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors"
            >
              去创建房间
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {myRooms.map(room => {
              // 计算剩余时间
              const isExpired = room.expires_at && room.expires_at < Date.now()
              const remainingMinutes = room.expires_at
                ? Math.max(0, Math.ceil((room.expires_at - Date.now()) / 60000))
                : null

              return (
                <div
                  key={room.room_code}
                  onClick={() => handleEnterRoom(room.room_code)}
                  className={`bg-white rounded-2xl shadow-sm border p-4 cursor-pointer transition-colors ${
                    isExpired ? 'border-gray-200 opacity-60' : 'border-gray-100 hover:border-orange-300 hover:bg-orange-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-gray-800 text-lg">
                          {room.room_name || '未命名房间'}
                        </h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-mono font-bold">
                          {room.room_code}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                        <span className="flex items-center gap-1">
                          <Utensils size={14} />
                          {room.candidates_count} 个选项
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={14} />
                          {room.votes_count} 票
                        </span>
                      </div>

                      {/* 过期时间倒计时 */}
                      {isExpired ? (
                        <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full inline-block">
                          已过期
                        </div>
                      ) : remainingMinutes !== null ? (
                        <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full inline-block">
                          {remainingMinutes === 0 ? '即将过期' : `${remainingMinutes} 分钟后过期`}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full inline-block">
                          永不过期
                        </div>
                      )}
                    </div>

                    <ArrowRight size={20} className={`mt-2 ${isExpired ? 'text-gray-300' : 'text-orange-500'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  };

  const renderMe = () => {
    const handleSignOut = async () => {
      try {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        showToast('已退出登录')
        // 退出后会自动回到登录页面（由认证路由处理）
      } catch (e: any) {
        showToast(e?.message || '退出失败，请重试')
      }
    }

    return (
      <div className="p-4 space-y-4 pb-24">
        {/* 用户信息卡片 */}
        <div className="bg-gradient-to-br from-orange-400 to-orange-600 rounded-3xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <User size={24} />
              </div>
              <div>
                <div className="text-xs text-white/80 mb-0.5">已登录</div>
                <div className="font-semibold break-all">
                  {authedUser?.email || '（无邮箱）'}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full py-2.5 bg-white/20 hover:bg-white/30 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            退出登录
          </button>
        </div>

        {/* 我的位置管理 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-gray-700">
              <MapPin size={18} className="text-orange-500" />
              <span>我的位置</span>
            </div>
            <button
              onClick={() => setLocationModalOpen(true)}
              className="text-xs text-orange-600 font-semibold px-3 py-1 bg-orange-50 rounded-full flex items-center gap-1"
            >
              <Plus size={12} />
              添加
            </button>
          </div>

          {/* 当前使用的位置 */}
          <div className={`p-4 border-b ${useDefaultConfig ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
            <div className={`flex items-center gap-2 text-xs mb-2 ${useDefaultConfig ? 'text-blue-700' : 'text-orange-700'}`}>
              <Navigation size={14} />
              <span className="font-semibold">当前使用位置</span>
            </div>
            <div className="text-sm font-medium text-gray-800">{currentLocation.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            </div>
          </div>

          {/* 使用配置默认位置选项 */}
          <div
            onClick={handleSelectDefaultConfig}
            className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
              useDefaultConfig ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                useDefaultConfig ? 'bg-blue-200' : 'bg-gray-100'
              }`}>
                <MapPin size={18} className={useDefaultConfig ? 'text-blue-600' : 'text-gray-500'} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${useDefaultConfig ? 'text-blue-700' : 'text-gray-700'}`}>
                    {DEFAULT_LOCATION.name}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    配置默认
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {DEFAULT_LOCATION.lat.toFixed(4)}, {DEFAULT_LOCATION.lng.toFixed(4)}
                </p>
              </div>
            </div>
            {useDefaultConfig && (
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
            )}
          </div>

          {/* 已保存的位置列表 */}
          <div className="divide-y divide-gray-50">
            {userLocations.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <MapPin size={32} className="mx-auto mb-2 text-gray-300" />
                <p>暂无保存的位置</p>
                <p className="text-xs mt-1">点击上方"添加"按钮保存当前位置</p>
              </div>
            ) : (
              userLocations.map((loc) => {
                const isSelected = currentLocation.name === loc.name && !useDefaultConfig
                return (
                  <div
                    key={loc.id}
                    className={`p-4 transition-colors ${isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => handleSelectLocation(loc)}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-orange-200' : 'bg-gray-100'
                        }`}>
                          <MapPin size={18} className={isSelected ? 'text-orange-600' : 'text-gray-500'} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isSelected ? 'text-orange-700' : 'text-gray-800'}`}>
                              {loc.name}
                            </span>
                            {loc.is_default && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Star size={10} />
                                默认
                              </span>
                            )}
                            {isSelected && !loc.is_default && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                使用中
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!loc.is_default && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSetDefaultLocation(loc.id)
                            }}
                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="设为默认"
                          >
                            <Star size={16} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteLocation(loc.id)
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                        {isSelected && (
                          <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center ml-2">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 今日推荐 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center gap-2 font-bold text-gray-700">
            <Shuffle size={18} className="text-orange-500" />
            <span>今日推荐</span>
            <span className="text-xs text-gray-400 font-normal ml-auto">每天随机 5 家</span>
          </div>
          {todayRecommendations.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              加载推荐中...
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayRecommendations.map((shop) => (
                <div
                  key={shop.id}
                  onClick={() => {
                    setActiveTab('home')
                    setTimeout(() => {
                      document.getElementById(`shop-${shop.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }, 100)
                  }}
                  className="p-3 hover:bg-orange-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={shop.image_url}
                      alt={shop.name}
                      className="w-16 h-16 rounded-xl object-cover bg-gray-100"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{shop.name}</div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        {shop.rating > 0 && (
                          <span className="flex items-center gap-1">
                            <Star size={10} className="text-yellow-500 fill-yellow-500" />
                            {shop.rating.toFixed(1)}
                          </span>
                        )}
                        {shop.avg_price > 0 && (
                          <span>¥{Math.floor(shop.avg_price)}</span>
                        )}
                        <span className="text-orange-600">{Math.floor(shop.distance)}m</span>
                      </div>
                      {shop.tags && shop.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {shop.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ArrowRight size={16} className="text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 添加位置弹窗 */}
        {locationModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-800">添加当前位置</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  位置名称
                </label>
                <input
                  type="text"
                  value={locationNameInput}
                  onChange={(e) => setLocationNameInput(e.target.value)}
                  placeholder="如：公司、家、健身房"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="text-sm font-medium text-gray-700">当前位置</div>
                {currentPosition ? (
                  <div className="text-xs text-gray-600">
                    纬度: {currentPosition.lat.toFixed(6)}<br />
                    经度: {currentPosition.lng.toFixed(6)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">尚未定位</div>
                )}
                <button
                  onClick={handleGetCurrentLocation}
                  disabled={locating}
                  className="w-full py-2.5 bg-orange-100 text-orange-700 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-orange-200 disabled:opacity-60 transition-colors"
                >
                  <Navigation size={16} className={locating ? 'animate-spin' : ''} />
                  {locating ? '定位中...' : currentPosition ? '重新定位' : '获取当前位置'}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setLocationModalOpen(false)
                    setLocationNameInput('')
                    setCurrentPosition(null)
                  }}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveLocation}
                  disabled={!currentPosition || !locationNameInput.trim()}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  };

  // 认证加载中
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-500">加载中...</p>
        </div>
      </div>
    )
  }

  // 未登录，显示登录页面
  if (!authedUser) {
    return (
      <>
        <LoginPage
          user={authedUser}
          authLoading={authLoading}
          onLoginSuccess={() => {
            // 登录成功后会自动跳转到主页（由 AuthGate useEffect 处理）
          }}
          onToast={showToast}
        />
        <Toast message={toastMsg} show={!!toastMsg} />
      </>
    )
  }

  // 已登录，显示主应用
  return (
    <div className="h-screen max-w-md mx-auto bg-gray-50 flex flex-col overflow-hidden">
      <Header
        title={activeTab === 'home' ? '发现美食' : activeTab === 'vote' ? '发起投票' : activeTab === 'rooms' ? '我的房间' : '个人中心'}
      />

      <Toast message={toastMsg} show={!!toastMsg} />

      {/* 可滚动的主内容区域 */}
      <main ref={mainScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'vote' && renderVote()}
        {activeTab === 'rooms' && renderRooms()}
        {activeTab === 'me' && renderMe()}
      </main>

      {/* 返回顶部按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-24 right-6 z-50 w-12 h-12 bg-orange-500 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          showBackToTop
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-4 scale-90 pointer-events-none'
        }`}
      >
        <ArrowUp size={20} strokeWidth={2.5} />
      </button>

      {/* Bottom Navigation - 固定在底部 */}
      <nav className="bg-white border-t border-gray-200 flex justify-around items-center px-2 py-1 pb-safe z-50">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center p-2 flex-1 rounded-lg transition-colors ${activeTab === 'home' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
          <span className="text-[10px] font-medium mt-1">主页</span>
        </button>

        <button
          onClick={() => setActiveTab('vote')}
          className={`flex flex-col items-center justify-center p-2 flex-1 rounded-lg transition-colors ${activeTab === 'vote' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Utensils size={24} strokeWidth={activeTab === 'vote' ? 2.5 : 2} />
          <span className="text-[10px] font-medium mt-1">投票</span>
        </button>

        <button
          onClick={() => setActiveTab('rooms')}
          className={`flex flex-col items-center justify-center p-2 flex-1 rounded-lg transition-colors ${activeTab === 'rooms' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <ChefHat size={24} strokeWidth={activeTab === 'rooms' ? 2.5 : 2} />
          <span className="text-[10px] font-medium mt-1">房间</span>
        </button>

        <button
          onClick={() => setActiveTab('me')}
          className={`flex flex-col items-center justify-center p-2 flex-1 rounded-lg transition-colors ${activeTab === 'me' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <User size={24} strokeWidth={activeTab === 'me' ? 2.5 : 2} />
          <span className="text-[10px] font-medium mt-1">我的</span>
        </button>
      </nav>

      {/* 房间配置弹窗 */}
      {roomConfigModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-5">
            <h3 className="text-lg font-bold text-gray-800">配置房间</h3>

            {/* 房间名称输入 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                房间名称 <span className="text-gray-400 font-normal">(可选)</span>
              </label>
              <input
                type="text"
                value={roomNameInput}
                onChange={(e) => setRoomNameInput(e.target.value)}
                placeholder="如：今天中午吃啥、周五聚餐..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* 房间过期时间选择 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  房间过期时间
                </label>
                <span className="text-sm text-gray-500">
                  {roomExpiryMinutes === 0
                    ? '永不过期'
                    : roomExpiryMinutes === 30
                    ? '30 分钟'
                    : roomExpiryMinutes === 60
                    ? '1 小时'
                    : roomExpiryMinutes === 120
                    ? '2 小时'
                    : `${roomExpiryMinutes} 分钟`}
                </span>
              </div>
              <div className="flex gap-2">
                {[
                  { label: '30分', value: 30 },
                  { label: '1小时', value: 60 },
                  { label: '2小时', value: 120 },
                  { label: '永久', value: 0 }
                ].map(option => (
                  <button
                    key={option.label}
                    onClick={() => setRoomExpiryMinutes(option.value)}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      roomExpiryMinutes === option.value
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancelCreateRoom}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmCreateRoom}
                className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/30"
              >
                创建房间
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加店铺弹窗 */}
      {addShopModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800">添加候选店铺</h3>
                <button
                  onClick={() => {
                    setAddShopModalOpen(false);
                    setShopSearchQuery('');
                    setSelectedShopToAdd(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="搜索餐厅名称或标签..."
                  value={shopSearchQuery}
                  onChange={(e) => setShopSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {shopSearchQuery && (
                  <button
                    onClick={() => setShopSearchQuery('')}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* 店铺列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {/* 从附近餐厅搜索，排除已添加的店铺 */}
                {nearbyShops
                  .filter(shop => {
                    // 搜索过滤
                    const matchesSearch = !shopSearchQuery.trim() ||
                      shop.name.toLowerCase().includes(shopSearchQuery.toLowerCase()) ||
                      shop.tags.some(tag => tag.toLowerCase().includes(shopSearchQuery.toLowerCase()));
                    // 排除已添加的店铺
                    const alreadyAdded = roomData?.candidates.some(c => c.id === shop.id);
                    return matchesSearch && !alreadyAdded;
                  })
                  .slice(0, 10)
                  .map(shop => (
                      <div
                        key={shop.id}
                        onClick={() => setSelectedShopToAdd(shop)}
                        className={`p-3 rounded-xl cursor-pointer transition-colors ${
                          selectedShopToAdd?.id === shop.id
                            ? 'bg-orange-50 border-2 border-orange-500'
                            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={shop.image_url}
                            alt={shop.name}
                            className="w-12 h-12 rounded-lg object-cover bg-gray-200"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-800 text-sm truncate">{shop.name}</div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                              {shop.rating > 0 && (
                                <span className="flex items-center gap-1">
                                  <Star size={10} className="text-yellow-500 fill-yellow-500" />
                                  {shop.rating.toFixed(1)}
                                </span>
                              )}
                              <span className="text-orange-600">{Math.floor(shop.distance)}m</span>
                            </div>
                          </div>
                          {selectedShopToAdd?.id === shop.id && (
                            <CheckCircle2 size={20} className="text-orange-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}

                {nearbyShops.filter(shop => {
                  const matchesSearch = !shopSearchQuery.trim() ||
                    shop.name.toLowerCase().includes(shopSearchQuery.toLowerCase()) ||
                    shop.tags.some(tag => tag.toLowerCase().includes(shopSearchQuery.toLowerCase()));
                  const alreadyAdded = roomData?.candidates.some(c => c.id === shop.id);
                  return matchesSearch && !alreadyAdded;
                }).length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">没有找到相关店铺</p>
                  </div>
                )}
              </div>
            </div>

            {/* 底部操作按钮 */}
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => selectedShopToAdd && handleAddCandidate(selectedShopToAdd)}
                disabled={!selectedShopToAdd || addingShop}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${
                  selectedShopToAdd && !addingShop
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {addingShop ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    添加中...
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    添加到候选列表
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
