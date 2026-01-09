/**
 * 位置类型定义
 */
export type LocationConfig = {
  lat: number
  lng: number
  name: string
  radius: number
  limit: number
}

/**
 * 默认位置配置（后备位置，当用户没有保存位置时使用）
 */
export const DEFAULT_LOCATION: LocationConfig = {
  lat: 30.280417,           // 纬度
  lng: 120.003134,          // 经度
  name: '英国中心写字楼T2幢',  // 显示名称
  radius: 2000,          // 搜索半径（米）
  limit: 50              // 返回餐厅数量上限
}
