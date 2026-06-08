export function getFapiBase(isTestnet: boolean) {
  if (isTestnet) return "https://testnet.binancefuture.com"
  const proxy = Deno.env.get("BINANCE_PROXY_URL")
  return proxy ?? "https://fapi.binance.com"
}

function getProxyHeaders(): Record<string, string> {
  const secret = Deno.env.get("PROXY_SECRET")
  return secret ? { "X-Proxy-Secret": secret } : {}
}

async function binanceSign(params: Record<string, string | number>, apiSecret: string): Promise<string> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(qs))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${qs}&signature=${hex}`
}

export async function binanceGet(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    headers: { 'X-MBX-APIKEY': apiKey, ...getProxyHeaders() },
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance GET ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

export async function binancePost(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded', ...getProxyHeaders() },
    body: signed,
  })
  const body = await resp.text()
  if (!resp.ok) throw new Error(`Binance POST ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

export async function binanceDelete(path: string, params: Record<string, string | number> = {}, apiKey: string, apiSecret: string, isTestnet: boolean): Promise<unknown> {
  const signed = await binanceSign({ ...params, timestamp: Date.now() }, apiSecret)
  const resp = await fetch(`${getFapiBase(isTestnet)}${path}?${signed}`, {
    method: 'DELETE',
    headers: { 'X-MBX-APIKEY': apiKey, ...getProxyHeaders() },
  })
  const body = await resp.text()
  if (!resp.ok && resp.status !== 400) throw new Error(`Binance DELETE ${path} ${resp.status}: ${body}`)
  return JSON.parse(body)
}

export async function getBinanceBalance(apiKey: string, apiSecret: string, isTestnet: boolean): Promise<number> {
  const balances = await binanceGet('/fapi/v2/balance', {}, apiKey, apiSecret, isTestnet) as { asset: string; balance: string }[]
  const usdt = balances?.find(a => a.asset === 'USDT')
  return usdt ? parseFloat(usdt.balance) : 0
}
