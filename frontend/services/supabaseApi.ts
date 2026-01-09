import { supabase } from './supabaseClient'
import { Shop, Room, VoteRecord } from '../types'
import { DEFAULT_LOCATION } from '../config/location'

/**
 * 转换 Supabase Storage 图片 URL 为优化的渲染 URL
 * 将 v1/object/ 替换为 v1/render/image/ 并添加质量参数
 */
const optimizeImageUrl = (url: string, quality = 30): string => {
  if (!url) return ''

  // 如果已经是 render URL，直接返回
  if (url.includes('/v1/render/image/')) return url

  // 替换 v1/object/ 为 v1/render/image/
  const optimizedUrl = url.replace('/v1/object/', '/v1/render/image/')

  // 添加质量参数
  const separator = optimizedUrl.includes('?') ? '&' : '?'
  return `${optimizedUrl}${separator}quality=${quality}`
}

export const api = {
  /**
   * 获取附近的餐厅（支持分页、标签过滤和名称搜索）
   * @param offset 偏移量（已加载的数量）
   * @param limit 每次加载的数量，默认 20
   * @param includeTags 包含的标签数组
   * @param excludeTags 排除的标签数组
   * @param nameQuery 餐厅名称搜索关键词
   * @param centerLat 中心纬度（可选，默认使用配置的位置）
   * @param centerLng 中心经度（可选，默认使用配置的位置）
   * @param radiusMeters 搜索半径（可选，默认使用配置的半径）
   * @returns 餐厅列表
   */
  getNearbyShops: async (
    offset = 0,
    limit = 20,
    includeTags?: string[],
    excludeTags?: string[],
    nameQuery?: string,
    centerLat?: number,
    centerLng?: number,
    radiusMeters?: number
  ): Promise<Shop[]> => {
    const { data, error } = await supabase
      .rpc('get_shops_with_tag_filters', {
        center_lat: centerLat ?? DEFAULT_LOCATION.lat,
        center_lng: centerLng ?? DEFAULT_LOCATION.lng,
        radius_meters: radiusMeters ?? DEFAULT_LOCATION.radius,
        offset_count: offset,
        limit_count: limit,
        include_tags: includeTags && includeTags.length > 0 ? includeTags : null,
        exclude_tags: excludeTags && excludeTags.length > 0 ? excludeTags : null,
        name_query: nameQuery && nameQuery.trim() ? nameQuery.trim() : null
      })

    if (error) {
      console.error('Error fetching nearby shops:', error)
      throw error
    }

    // 转换数据格式以匹配前端类型
    return (data || []).map((shop: any) => ({
      id: shop.id.toString(),
      name: shop.name,
      distance: shop.dist_meters,
      rating: shop.rating,
      avg_price: shop.avg_price,
      tags: shop.tag ? shop.tag.split(';').filter(Boolean).map(t => t.trim()) : [],
      image_url: optimizeImageUrl(shop.logo || ''),
      deepinfo: shop.deepinfo ? JSON.parse(shop.deepinfo) : [],
      location: { lat: 0, lng: 0 } // 从数据库查询时不返回坐标
    }))
  },

  /**
   * 创建投票房间
   * @param candidates 候选餐厅列表
   * @param expiresInMinutes 过期时间（分钟），0 或 undefined 表示永不过期
   * @param roomName 房间名称（可选）
   * @returns 房间代码
   */
  createRoom: async (
    candidates: Shop[],
    expiresInMinutes?: number,
    roomName?: string
  ): Promise<string> => {
    // 获取当前用户 ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('用户未登录')
    }

    // 计算过期时间
    let expiresAt = null
    if (expiresInMinutes && expiresInMinutes > 0) {
      expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString()
    }

    // 准备 candidates 数据（存储为 JSONB）
    const candidatesData = candidates.map(shop => ({
      id: parseInt(shop.id),
      name: shop.name,
      logo: shop.image_url,
      distance: shop.distance,
      rating: shop.rating,
      avg_price: shop.avg_price,
      tags: shop.tags,
      deepinfo: shop.deepinfo || [],
      vote_count: 0
    }))

    // 尝试创建房间，如果房间代码冲突则重试
    const maxRetries = 5
    for (let i = 0; i < maxRetries; i++) {
      // 生成随机房间代码（4 位字母数字）
      const code = Math.random().toString(36).substring(2, 6).toUpperCase()

      const { error } = await supabase
        .from('vote_rooms')
        .insert({
          room_code: code,
          room_name: roomName || null,
          candidates: candidatesData,
          expires_at: expiresAt,
          created_by: user.id
        })

      if (!error) {
        return code
      }

      // 如果是唯一性约束冲突，重试；否则抛出错误
      if (error.code !== '23505') {
        console.error('Error creating room:', error)
        throw error
      }
    }

    throw new Error('Failed to generate unique room code after multiple attempts')
  },

  /**
   * 获取房间信息（包含投票者邮箱）
   * @param roomCode 房间代码
   * @returns 房间数据
   */
  getRoom: async (roomCode: string): Promise<Room | null> => {
    // 使用 RPC 函数获取房间详情（包含投票者邮箱）
    const { data: roomDetails, error: roomError } = await supabase
      .rpc('get_room_details', { room_code_param: roomCode })

    if (roomError) {
      console.error('Error fetching room:', roomError)
      return null
    }

    if (!roomDetails) {
      return null
    }

    const roomData = (roomDetails as any).room
    const votesData = (roomDetails as any).votes

    // 转换 candidates 为 Shop 类型
    const candidates: Shop[] = roomData.candidates.map((c: any) => ({
      id: c.id.toString(),
      name: c.name,
      distance: c.distance || 0,
      rating: c.rating || 0,
      avg_price: c.avg_price || 0,
      tags: c.tags || [],
      deepinfo: c.deepinfo || [],
      image_url: optimizeImageUrl(c.logo || '')
    }))

    // 转换投票记录（包含邮箱）
    const votes: VoteRecord[] = (votesData || []).map((v: any) => ({
      voter_id: v.voter_id,
      shop_id: v.shop_id.toString(),
      voter_email: v.voter_email
    }))

    return {
      room_code: roomData.room_code,
      room_name: roomData.room_name || undefined,
      candidates,
      created_at: new Date(roomData.created_at).getTime(),
      votes,
      expires_at: roomData.expires_at ? new Date(roomData.expires_at).getTime() : undefined,
      is_active: roomData.is_active ?? true,
      created_by: roomData.created_by
    }
  },

  /**
   * 投票
   * @param roomCode 房间代码
   * @param voterId 投票人 ID
   * @param shopId 餐厅 ID
   * @returns 更新后的房间数据
   */
  castVote: async (
    roomCode: string,
    voterId: string,
    shopId: string
  ): Promise<Room | null> => {
    // 使用 upsert 来处理 UNIQUE(room_code, voter_id) 约束
    // on_conflict 指定当冲突时更新的列
    const { error } = await supabase
      .from('vote_records')
      .upsert(
        {
          room_code: roomCode,
          shop_id: parseInt(shopId),
          voter_id: voterId
        },
        {
          onConflict: 'room_code,voter_id',
          ignoreDuplicates: false
        }
      )

    if (error) {
      console.error('Error casting vote:', error)
      throw error
    }

    // 返回更新后的房间数据
    return api.getRoom(roomCode)
  },

  /**
   * 取消投票
   * @param roomCode 房间代码
   * @param voterId 投票人 ID
   * @returns 更新后的房间数据
   */
  cancelVote: async (
    roomCode: string,
    voterId: string
  ): Promise<Room | null> => {
    const { error } = await supabase
      .from('vote_records')
      .delete()
      .eq('room_code', roomCode)
      .eq('voter_id', voterId)

    if (error) {
      console.error('Error canceling vote:', error)
      throw error
    }

    // 返回更新后的房间数据
    return api.getRoom(roomCode)
  },

  /**
   * 获取所有标签及其统计
   * @returns 标签列表，包含标签名和对应的餐厅数量
   */
  getAllTags: async (): Promise<Array<{ tag: string; count: number }>> => {
    const { data, error } = await supabase.rpc('get_all_tags')

    if (error) {
      console.error('Error fetching all tags:', error)
      throw error
    }

    return (data || []).map((item: any) => ({
      tag: item.tag,
      count: item.count
    }))
  },

  /**
   * 订阅房间投票的实时更新
   * @param roomCode 房间代码
   * @param callback 回调函数，接收更新后的房间数据
   * @returns 取消订阅的函数
   */
  subscribeToRoomVotes: (
    roomCode: string,
    callback: (room: Room) => void
  ) => {
    const channel = supabase
      .channel(`room_votes_${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*', // 监听所有变化（INSERT, UPDATE, DELETE）
          schema: 'public',
          table: 'vote_records',
          filter: `room_code=eq.${roomCode}`
        },
        async (payload) => {
          console.log('Vote records changed:', payload)
          // 当投票记录变化时，重新获取房间数据
          const room = await api.getRoom(roomCode)
          if (room) {
            callback(room)
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status)
        if (status === 'SUBSCRIPTION_ERROR') {
          console.error('Failed to subscribe to vote_records for room:', roomCode)
        }
      })

    // 返回取消订阅的函数
    return () => {
      supabase.removeChannel(channel)
    }
  },

  // ========== 用户位置相关方法 ==========

  /**
   * 获取用户的所有保存位置
   */
  getUserLocations: async (): Promise<Array<{
    id: number
    name: string
    lat: number
    lng: number
    is_default: boolean
  }>> => {
    const { data, error } = await supabase
      .from('user_locations')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching user locations:', error)
      throw error
    }

    return (data || []).map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      is_default: loc.is_default
    }))
  },

  /**
   * 保存用户位置
   */
  saveUserLocation: async (
    name: string,
    lat: number,
    lng: number,
    isDefault = false
  ): Promise<void> => {
    // 获取当前用户 ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('用户未登录')
    }

    // 如果设置为默认，先取消其他默认位置
    if (isDefault) {
      await supabase
        .from('user_locations')
        .update({ is_default: false })
        .eq('is_default', true)
        .eq('user_id', user.id)
    }

    const { error } = await supabase
      .from('user_locations')
      .insert({
        user_id: user.id,
        name,
        lat,
        lng,
        is_default: isDefault
      })

    if (error) {
      console.error('Error saving user location:', error)
      throw error
    }
  },

  /**
   * 删除用户位置
   */
  deleteUserLocation: async (locationId: number): Promise<void> => {
    // 获取当前用户 ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('用户未登录')
    }

    const { error } = await supabase
      .from('user_locations')
      .delete()
      .eq('id', locationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting user location:', error)
      throw error
    }
  },

  /**
   * 设置默认位置
   */
  setDefaultLocation: async (locationId: number): Promise<void> => {
    // 获取当前用户 ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('用户未登录')
    }

    // 先取消所有默认位置
    await supabase
      .from('user_locations')
      .update({ is_default: false })
      .eq('is_default', true)
      .eq('user_id', user.id)

    // 设置新的默认位置
    const { error } = await supabase
      .from('user_locations')
      .update({ is_default: true })
      .eq('id', locationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error setting default location:', error)
      throw error
    }
  },

  /**
   * 使用浏览器定位获取当前位置
   */
  getCurrentPosition: (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('浏览器不支持地理位置功能'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
        },
        (error) => {
          let message = '定位失败'
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = '定位权限被拒绝，请在浏览器设置中允许定位'
              break
            case error.POSITION_UNAVAILABLE:
              message = '无法获取位置信息'
              break
            case error.TIMEOUT:
              message = '定位超时，请重试'
              break
          }
          reject(new Error(message))
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    })
  },

  /**
   * 解散房间（仅创建者可以解散）
   * @param roomCode 房间代码
   */
  dismissRoom: async (roomCode: string): Promise<void> => {
    // 获取当前用户 ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('用户未登录')
    }

    // 更新房间为已解散状态
    const { data, error } = await supabase
      .from('vote_rooms')
      .update({ is_active: false })
      .eq('room_code', roomCode)
      .eq('created_by', user.id) // 只能解散自己创建的房间
      .select('room_code,is_active')
      .maybeSingle()

    if (error) {
      console.error('Error dismissing room:', error)
      throw error
    }

    // RLS 没有放行 / 条件不匹配时，PostgREST 可能返回 204/空结果且不报错
    if (!data) {
      throw new Error('解散失败：未找到可更新的房间（可能没有权限或房间不存在）')
    }
  },

  /**
   * 清除房间所有投票（仅创建者可以清除）
   * @param roomCode 房间代码
   */
  clearVotes: async (roomCode: string): Promise<void> => {
    const { data, error } = await supabase.rpc('clear_votes', {
      room_code_param: roomCode
    })

    if (error) {
      console.error('Error clearing votes:', error)
      throw error
    }

    if (!data) {
      throw new Error('清除投票失败')
    }
  },

  /**
   * 获取当前用户创建的房间列表
   */
  getMyRooms: async (): Promise<any[]> => {
    const { data, error } = await supabase.rpc('get_my_rooms')

    if (error) {
      console.error('Error fetching my rooms:', error)
      throw error
    }

    return (data || []).map((room: any) => ({
      room_code: room.room_code,
      room_name: room.room_name,
      created_at: new Date(room.created_at).getTime(),
      expires_at: room.expires_at ? new Date(room.expires_at).getTime() : undefined,
      is_active: room.is_active,
      candidates_count: room.candidates_count,
      votes_count: room.votes_count
    }))
  }
}
