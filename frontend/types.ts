export interface Shop {
  id: string; // 数据库中是 BIGINT，但前端统一用 string 处理
  name: string;
  location?: { lat: number; lng: number }; // 可选，因为从数据库查询时不返回
  distance: number; // in meters
  rating: number;
  avg_price: number;
  tags: string[]; // 数据库中是 "tag1;tag2" 格式，前端转为数组
  image_url: string; // 对应数据库的 logo 字段
  deepinfo?: string[]; // 餐厅详细信息（菜品、特色等）
}

export interface VoteRecord {
  voter_id: string;
  shop_id: string;
  voter_email?: string; // 投票者的邮箱（可选，用于显示）
}

export interface Room {
  room_code: string;
  room_name?: string; // 房间名称（可选）
  candidates: Shop[];
  created_at: number;
  votes: VoteRecord[];
  expires_at?: number; // 过期时间戳（毫秒）
  is_active: boolean; // 房间是否活跃
  created_by?: string; // 创建者ID
}

// 房间列表项（简化的 Room 类型）
export interface RoomListItem {
  room_code: string;
  room_name?: string;
  created_at: number;
  expires_at?: number;
  is_active: boolean;
  candidates_count: number;
  votes_count: number;
}

export type ViewMode = 'home' | 'room';
export type HomeTab = 'manual' | 'random';
export type AppTab = 'home' | 'vote' | 'rooms' | 'me';

export interface UserState {
  id: string; // UUID
  lat?: number;
  lng?: number;
  addressName?: string;
}
