export interface AppConfig {
  tokenAddress: string;
  chain: string;
  running: boolean;
  lastCheck: string | null;
  errorCount: number;
  lastError: string | null;
  hasTelegramKey: boolean;
  activeChatCount: number;
  language?: "it" | "en";
}

export interface Trade {
  txHash: string;
  type: "buy" | "sell";
  source: string;
  volumeUSD: number;
  tokensAmount: number;
  blockTime: number | string;
}
