const http = require('node:http')
const path = require('node:path')
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
})

const { createClient } = require('@supabase/supabase-js')
const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  WebhookClient,
} = require('discord.js')

const requiredEnv = [
  'DISCORD_TOKEN',
  'TRADE_LOG_CHANNEL_ID',
  'ALERT_WEBHOOK_URL',
  'SUPABASE_URL',
]
const missingEnv = requiredEnv.filter((name) => !process.env[name])

if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_ANON_KEY
) {
  missingEnv.push('SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY')
}
if (missingEnv.length > 0) {
  throw new Error(`필수 환경 변수가 없습니다: ${missingEnv.join(', ')}`)
}

// Render 같은 신뢰할 수 있는 서버에서는 RLS를 우회하는 Service Role Key 권장.
// 요청한 ANON KEY도 지원하지만 해당 키 사용 시 테이블의 RLS 정책이 필요하다.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

const tradeLogChannelId = process.env.TRADE_LOG_CHANNEL_ID
const alertWebhook = new WebhookClient({
  url: process.env.ALERT_WEBHOOK_URL,
})

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
})

function normalizeEmoji(value) {
  if (!value) return ''
  // 눈에 안 보이는 변형 선택자/공백을 제거해 DB 값과 비교한다.
  return value.normalize('NFC').replace(/\uFE0F/g, '').replace(/\s+/g, '').trim()
}

function emojiDebug(value) {
  if (!value) return '(empty)'
  const codes = [...value]
    .map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase()}`)
    .join(' ')
  return `${value} [${codes}]`
}

function collectMessageText(message) {
  const parts = [message.content]

  for (const embed of message.embeds) {
    parts.push(embed.title, embed.description)
    for (const field of embed.fields) {
      parts.push(field.name, field.value)
    }
  }

  return parts
    .filter(Boolean)
    .join('\n')
    .replace(/\r/g, '')
    .replace(/[*_`>#]/g, '')
    .trim()
}

function extractLabeledValue(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*${escapedLabel}\\s*\\n+\\s*([^\\n]+)`, 'u'),
  )
  return match?.[1]?.trim() ?? null
}

function extractEmbedFields(message) {
  for (const embed of message.embeds) {
    const title = embed.title ?? ''
    const description = embed.description ?? ''
    if (
      !title.includes('아이템 전달 보고서') &&
      !description.includes('아이템 전달 보고서')
    ) {
      continue
    }

    const fields = {}
    for (const field of embed.fields) {
      fields[field.name.trim()] = field.value.trim()
    }
    return fields
  }
  return null
}

function parsePerson(value) {
  if (!value) return null
  const trimmed = value.trim()

  // 유니코드 이모지 또는 디스코드 커스텀 이모지(<:name:id>)가 앞에 있는 경우
  const withEmoji = trimmed.match(
    /^(?:(<a?:\w+:\d+>)|(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*))\s*(.+?)\s*\((\d+)번\)$/u,
  )
  if (withEmoji) {
    const userCode = Number.parseInt(withEmoji[4], 10)
    if (!Number.isSafeInteger(userCode) || userCode <= 0) return null
    return {
      factionEmoji: withEmoji[1] || withEmoji[2],
      nickname: withEmoji[3].trim(),
      userCode,
    }
  }

  // 받는 사람처럼 맨 앞 이모지가 없는 경우: 딜연(548번)
  const withoutEmoji = trimmed.match(/^(.+?)\s*\((\d+)번\)$/u)
  if (!withoutEmoji) return null

  const userCode = Number.parseInt(withoutEmoji[2], 10)
  if (!Number.isSafeInteger(userCode) || userCode <= 0) return null

  return {
    factionEmoji: null,
    nickname: withoutEmoji[1].trim(),
    userCode,
  }
}

function parseQuantity(value) {
  const match = value?.match(/^([\d,]+)\s*EA$/i)
  if (!match) return NaN
  return Number.parseInt(match[1].replaceAll(',', ''), 10)
}

function parseTradeMessage(message) {
  const embedFields = extractEmbedFields(message)
  let sellerValue
  let buyerValue
  let itemName
  let quantityText

  if (embedFields) {
    sellerValue = embedFields['보내는 사람']
    buyerValue = embedFields['받는 사람']
    itemName = embedFields['보낸 아이템']
    quantityText = embedFields['보낸 갯수']
  } else {
    const text = collectMessageText(message)
    if (!text.includes('아이템 전달 보고서')) return null
    sellerValue = extractLabeledValue(text, '보내는 사람')
    buyerValue = extractLabeledValue(text, '받는 사람')
    itemName = extractLabeledValue(text, '보낸 아이템')
    quantityText = extractLabeledValue(text, '보낸 갯수')
  }

  const seller = parsePerson(sellerValue)
  const buyer = parsePerson(buyerValue)
  const quantity = parseQuantity(quantityText)

  if (
    !seller ||
    !buyer ||
    !itemName ||
    !seller.factionEmoji ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > 2147483647
  ) {
    return null
  }

  return {
    seller,
    buyer,
    itemName: itemName.trim(),
    quantity,
  }
}

function calculateTotalPrice(itemName, pricePerUnit, quantity) {
  // 검은 돈만 DB 기본가 1,200만 원 대신 정산 단가 120만 원을 적용한다.
  const settlementPrice =
    itemName === '💸 검은 돈' ? 1200000n : BigInt(pricePerUnit)
  const totalPrice = settlementPrice * BigInt(quantity)

  // PostgreSQL BIGINT는 signed 64-bit이다.
  if (totalPrice > 9223372036854775807n) {
    throw new Error('총 금액이 PostgreSQL BIGINT 범위를 초과했습니다.')
  }

  return totalPrice
}

function formatWon(amount) {
  return `${amount.toLocaleString('ko-KR')}원`
}

function throwIfSupabaseError(error, operation) {
  if (!error) return
  throw new Error(`${operation} 실패: ${error.message}`, { cause: error })
}

async function validateAndSaveTrade(parsed) {
  const { data: factions, error: factionError } = await supabase
    .from('faction_settings')
    .select('id, faction_emoji')
  throwIfSupabaseError(factionError, '팩션 조회')

  const sellerEmoji = normalizeEmoji(parsed.seller.factionEmoji)
  const faction = (factions ?? []).find(
    (row) => normalizeEmoji(row.faction_emoji) === sellerEmoji,
  )
  if (!faction) {
    const dbEmojis = (factions ?? [])
      .map((row) => emojiDebug(row.faction_emoji))
      .join(' | ')
    console.info(
      `팩션 불일치: 추출=${emojiDebug(parsed.seller.factionEmoji)} / DB=${dbEmojis || '(없음)'}`,
    )
    return { saved: false, reason: 'FACTION_MISMATCH' }
  }

  const { data: seller, error: sellerError } = await supabase
    .from('users')
    .select('user_code, role')
    .eq('user_code', parsed.seller.userCode)
    .maybeSingle()
  throwIfSupabaseError(sellerError, '판매자 조회')
  if (!seller || Number(seller.role) === 0) {
    return { saved: false, reason: 'SELLER_NOT_REGISTERED' }
  }

  const { data: item, error: itemError } = await supabase
    .from('items')
    .select('item_name, price_per_unit')
    .eq('item_name', parsed.itemName)
    .maybeSingle()
  throwIfSupabaseError(itemError, '아이템 조회')
  if (!item) return { saved: false, reason: 'ITEM_NOT_REGISTERED' }

  const totalPrice = calculateTotalPrice(
    parsed.itemName,
    item.price_per_unit,
    parsed.quantity,
  )
  const { data: savedLog, error: insertError } = await supabase
    .from('trade_logs')
    .insert({
      seller_code: parsed.seller.userCode,
      seller_name: parsed.seller.nickname,
      buyer_code: parsed.buyer.userCode,
      buyer_name: parsed.buyer.nickname,
      item_name: parsed.itemName,
      quantity: parsed.quantity,
      // BigInt는 JSON 직렬화가 안 되므로 10진 문자열로 전달한다.
      total_price: totalPrice.toString(),
    })
    .select('id, created_at')
    .single()
  throwIfSupabaseError(insertError, '거래 로그 저장')

  return {
    saved: true,
    logId: savedLog.id,
    createdAt: savedLog.created_at,
    totalPrice,
  }
}

async function sendTradeAlert(parsed, savedTrade) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(
      [
        `판매자 : ${parsed.seller.nickname}(${parsed.seller.userCode})`,
        `구매자 : ${parsed.buyer.nickname}(${parsed.buyer.userCode})`,
        `아이템 : ${parsed.itemName} (${parsed.quantity.toLocaleString('ko-KR')}EA)`,
        `금액 : ${formatWon(savedTrade.totalPrice)}`,
      ].join('\n'),
    )
    .setTimestamp(new Date(savedTrade.createdAt))

  await alertWebhook.send({
    username: '거래 알림',
    embeds: [embed],
    allowedMentions: { parse: [] },
  })
}

bot.once(Events.ClientReady, (client) => {
  console.log(`Discord 봇 로그인 완료: ${client.user.tag}`)
})

bot.on(Events.MessageCreate, async (receivedMessage) => {
  try {
    const message = receivedMessage.partial
      ? await receivedMessage.fetch()
      : receivedMessage
    if (message.channelId !== tradeLogChannelId) return

    // 웹훅 메시지의 author.bot은 true이므로 봇 메시지 여부로 제외하면 안 된다.
    const parsed = parseTradeMessage(message)
    if (!parsed) return

    const savedTrade = await validateAndSaveTrade(parsed)
    if (!savedTrade.saved) {
      console.info(
        `거래 로그 무시: ${savedTrade.reason} (메시지 ${message.id})`,
      )
      return
    }

    try {
      await sendTradeAlert(parsed, savedTrade)
      console.info(`거래 로그 #${savedTrade.logId} 저장 및 알림 완료`)
    } catch (error) {
      // 저장 성공 후 알림 실패가 이미 기록된 거래를 유실시키면 안 된다.
      console.error(`알림 발송 실패 (로그 #${savedTrade.logId}):`, error)
    }
  } catch (error) {
    console.error(`거래 메시지 처리 실패 (${receivedMessage.id}):`, error)
  }
})

bot.on(Events.Error, (error) => {
  console.error('Discord 클라이언트 오류:', error)
})

// Render Web Service는 포트 바인딩을 요구한다. PORT가 있으면 헬스체크용 최소
// HTTP 서버를 연다. Background Worker(포트 없음)에서는 열지 않고 넘어간다.
let healthServer = null
let selfPingTimer = null

function startSelfPing() {
  const baseUrl = process.env.SELF_PING_URL || process.env.RENDER_EXTERNAL_URL
  if (!baseUrl) {
    console.info(
      '자체 핑 비활성화: SELF_PING_URL 또는 RENDER_EXTERNAL_URL이 없습니다.',
    )
    return
  }

  let healthUrl
  try {
    healthUrl = new URL('/health', baseUrl).toString()
  } catch {
    console.error('자체 핑 URL이 올바르지 않습니다.')
    return
  }

  selfPingTimer = setInterval(async () => {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok && response.status !== 503) {
        console.warn(`자체 핑 응답 오류: HTTP ${response.status}`)
      }
    } catch (error) {
      console.warn(`자체 핑 실패: ${error.message}`)
    }
  }, 30000)

  console.log(`자체 핑 활성화: 30초 간격 (${healthUrl})`)
}

if (process.env.PORT) {
  healthServer = http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(bot.isReady() ? 200 : 503).end(
        bot.isReady() ? 'ok' : 'starting',
      )
      return
    }
    response.writeHead(200).end('discord trade bot running')
  })
  healthServer.listen(Number(process.env.PORT), '0.0.0.0', () => {
    console.log(`헬스체크 서버 실행 중: 포트 ${process.env.PORT}`)
    startSelfPing()
  })
}

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} 수신, 봇을 종료합니다.`)
  bot.destroy()
  alertWebhook.destroy()
  if (selfPingTimer) clearInterval(selfPingTimer)
  if (healthServer) healthServer.close()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (error) => {
  console.error('처리되지 않은 Promise 오류:', error)
})

if (require.main === module) {
  bot.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Discord 봇 로그인 실패:', error)
    process.exit(1)
  })
}

module.exports = {
  calculateTotalPrice,
  parsePerson,
  parseTradeMessage,
}
