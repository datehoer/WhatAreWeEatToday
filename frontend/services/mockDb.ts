import { Room, Shop, VoteRecord } from '../types';

// Mock Data for Shops
const MOCK_SHOPS: Shop[] = [
  { id: '1', name: '麦当劳 (McDonalds)', distance: 150, rating: 4.5, avg_price: 35, tags: ['快餐', '汉堡'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=1' },
  { id: '2', name: '海底捞火锅', distance: 300, rating: 4.9, avg_price: 120, tags: ['火锅', '服务好'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=2' },
  { id: '3', name: '太二酸菜鱼', distance: 450, rating: 4.7, avg_price: 80, tags: ['川菜', '酸菜鱼'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=3' },
  { id: '4', name: '喜茶 (HEYTEA)', distance: 50, rating: 4.8, avg_price: 25, tags: ['奶茶', '甜品'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=4' },
  { id: '5', name: '沙县小吃', distance: 120, rating: 3.8, avg_price: 18, tags: ['快餐', '小吃'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=5' },
  { id: '6', name: '木屋烧烤', distance: 800, rating: 4.6, avg_price: 90, tags: ['烧烤', '夜宵'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=6' },
  { id: '7', name: '肯德基 (KFC)', distance: 220, rating: 4.4, avg_price: 35, tags: ['快餐', '炸鸡'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=7' },
  { id: '8', name: '星巴克 (Starbucks)', distance: 100, rating: 4.3, avg_price: 40, tags: ['咖啡', '轻食'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=8' },
  { id: '9', name: '西贝莜面村', distance: 600, rating: 4.5, avg_price: 100, tags: ['西北菜', '面食'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=9' },
  { id: '10', name: '萨莉亚', distance: 550, rating: 4.2, avg_price: 45, tags: ['西餐', '意面'], location: { lat: 0, lng: 0 }, image_url: 'https://picsum.photos/200/200?random=10' },
];

const STORAGE_KEY = 'meal_decision_rooms';

const getRooms = (): Record<string, Room> => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : {};
};

const saveRooms = (rooms: Record<string, Room>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
};

export const api = {
  // Simulate Fetching nearby shops
  getNearbyShops: async (lat?: number, lng?: number): Promise<Shop[]> => {
    // In a real app, use PostGIS. Here we just return mock sorted loosely by distance.
    await new Promise(r => setTimeout(r, 500)); // Simulate network
    return [...MOCK_SHOPS].sort((a, b) => a.distance - b.distance);
  },

  // Create a room
  createRoom: async (candidates: Shop[]): Promise<string> => {
    const rooms = getRooms();
    const code = Math.random().toString(36).substring(2, 7); // e.g. "x7z9a"
    const newRoom: Room = {
      room_code: code,
      candidates,
      created_at: Date.now(),
      votes: []
    };
    rooms[code] = newRoom;
    saveRooms(rooms);
    return code;
  },

  // Get Room Data
  getRoom: async (code: string): Promise<Room | null> => {
    const rooms = getRooms();
    return rooms[code] || null;
  },

  // Vote
  castVote: async (roomCode: string, voterId: string, shopId: string): Promise<Room | null> => {
    const rooms = getRooms();
    const room = rooms[roomCode];
    if (!room) return null;

    // Remove existing vote by this user if any (to allow switching votes)
    const existingVoteIndex = room.votes.findIndex(v => v.voter_id === voterId);
    if (existingVoteIndex > -1) {
      room.votes.splice(existingVoteIndex, 1);
    }

    // Add new vote
    room.votes.push({ voter_id: voterId, shop_id: shopId });
    saveRooms(rooms);
    return room;
  }
};
