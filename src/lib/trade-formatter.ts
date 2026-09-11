/**
 * Trade formatting and Telegram notification utilities
 */

export interface TradeData {
  type: "buy" | "sell";
  tokensAmount: number;
  volumeUSD: number;
  txHash: string;
  source: string;
}

export interface TokenMeta {
  name: string;
  symbol: string;
  priceUsd: number;
  priceChange?: {
    m5?: number;
    h1?: number;
    h24?: number;
  };
}

/**
 * Builds block explorer URL according to selected blockchain network.
 */
export function buildExplorerUrl(txHash: string, chain: string): string {
  const c = (chain || "bsc").toLowerCase();
  if (c === "solana") return `https://solscan.io/tx/${txHash}`;
  if (c === "ethereum") return `https://etherscan.io/tx/${txHash}`;
  return `https://bscscan.com/tx/${txHash}`;
}

/**
 * Resolves deduplicated message targets, preventing duplicate transmissions to both supergroups and topic threads.
 */
export function getUniqueMessageTargets(targets: Set<string> | string[]): string[] {
  const targetArray = Array.from(targets);
  const threadChatIds = new Set<string>();

  for (const t of targetArray) {
    const parts = t.split('_');
    if (parts.length > 1) {
      threadChatIds.add(parts[0]);
    }
  }

  return targetArray.filter(t => {
    const parts = t.split('_');
    if (parts.length === 1 && threadChatIds.has(parts[0])) {
      return false;
    }
    return true;
  });
}

/**
 * Verifies if an incoming text matches a Telegram bot command (/start, /stop, etc.)
 */
export function matchCommand(text: string, command: string, botUsername?: string | null): boolean {
  if (!text) return false;
  let cleaned = text.trim();
  if (botUsername) {
    cleaned = cleaned.replace(new RegExp(`@${botUsername}`, 'i'), "").trim();
  }
  if (cleaned.toLowerCase().startsWith(command.toLowerCase())) {
    const after = cleaned.slice(command.length);
    return after === "" || /^\s/.test(after);
  }
  return false;
}

/**
 * Formats HTML trade alert message for Telegram broadcast in English or Italian.
 */
export function formatTradeMessage(
  trade: TradeData,
  tokenMeta: TokenMeta,
  tokenAddress: string,
  chain: string = "bsc",
  isEn: boolean = false
): string {
  const isBuy = trade.type === "buy";
  const headerIcon = isBuy ? "🟢" : "🔴";
  const actionText = isBuy 
    ? (isEn ? "NEW BUY" : "NUOVO ACQUISTO") 
    : (isEn ? "NEW SELL" : "NUOVA VENDITA");

  const locale = isEn ? "en-US" : "it-IT";
  const volUsd = (Number(trade.volumeUSD) || 0).toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const tokens = (Number(trade.tokensAmount) || 0).toLocaleString(locale, { maximumFractionDigits: 2 });
  const explorerUrl = buildExplorerUrl(trade.txHash, chain);
  const priceStr = tokenMeta.priceUsd > 0 ? tokenMeta.priceUsd.toFixed(8) : (isEn ? "N/A" : "N/D");

  const t5 = typeof tokenMeta.priceChange?.m5 === 'number' 
    ? `${tokenMeta.priceChange.m5 > 0 ? '+' : ''}${tokenMeta.priceChange.m5}% (5m)` 
    : '';
  const t1 = typeof tokenMeta.priceChange?.h1 === 'number' 
    ? `${tokenMeta.priceChange.h1 > 0 ? '+' : ''}${tokenMeta.priceChange.h1}% (1h)` 
    : '';
  const trendLine = t5 && t1 ? `📈 <b>Trend:</b> ${t5} | ${t1}\n` : '';

  const labelQty = isEn ? "Amount" : "Quantità";
  const labelValue = isEn ? "Value" : "Controvalore";
  const labelPrice = isEn ? "Current Price" : "Prezzo Attuale";
  const labelPlatform = isEn ? "Platform" : "Piattaforma";
  const labelTx = isEn ? "View Transaction" : "Vedi Transazione";
  const labelDex = isEn ? "Open DexScreener" : "Apri DexScreener";

  return `<b>${headerIcon} ${actionText}</b>
<i>Token:</i> <b>${tokenMeta.name} (${tokenMeta.symbol})</b>

💎 <b>${labelQty}:</b> <code>${tokens}</code>
💵 <b>${labelValue}:</b> ${volUsd}
${trendLine}💲 <b>${labelPrice}:</b> $${priceStr} 
🔄 <b>${labelPlatform}:</b> ${trade.source}

🔗 <a href="${explorerUrl}">${labelTx}</a>
📈 <a href="https://dexscreener.com/${chain.toLowerCase()}/${tokenAddress}">${labelDex}</a>`;
}
