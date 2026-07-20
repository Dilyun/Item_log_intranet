export type UserRole = 0 | 1 | 2

export type AppUser = {
  discord_id: string
  user_code: number
  nickname: string
  role: UserRole
}

export type TradeLog = {
  id: number
  seller_code: number
  seller_name: string
  buyer_code: number
  buyer_name: string
  item_name: string
  quantity: number
  total_price: number | string
  created_at: string
}

export type Item = {
  item_name: string
  price_per_unit: number | string
}

export type FactionSettings = {
  id: number
  faction_emoji: string
  public_account_rate: number
}

export type AppTab = 'dashboard' | 'users' | 'settings'
