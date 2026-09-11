import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { ethers } from "ethers";

// Bot Configuration
const PORT = 3000;
const POLLING_INTERVAL_MS = 5000; // Check every 5 seconds for block logs

import fs from "fs";

// In-Memory State
let botStatus = {
  running: false,
  lastCheck: null as Date | null,
  errorCount: 0,
  lastError: null as string | null,
};

const recentTrades: any[] = [];
const TRADES_FILE = path.join(process.cwd(), "data", "trades.json");
let pollingIntervalRef: NodeJS.Timeout | null = null;
let priceFetchIntervalRef: NodeJS.Timeout | null = null;

// Load trades from file
try {
  if (fs.existsSync(TRADES_FILE)) {
    const data = fs.readFileSync(TRADES_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      recentTrades.push(...parsed.slice(0, 50));
      console.log(`Loaded ${recentTrades.length} trades from disk.`);
    }
  }
} catch (e) {
  console.error("Failed to load trades file:", e);
}

function saveTrades() {
  try {
    fs.writeFileSync(TRADES_FILE, JSON.stringify(recentTrades.slice(0, 50)));
  } catch (e) {
    console.error("Failed to save trades file:", e);
  }
}

const CHATS_FILE = path.join(process.cwd(), "data", "chats.json");
let BOT_LANGUAGE: "it" | "en" = "it";
let knownChatIds: Set<string> = new Set();
let chatSettings: Record<string, { language: "it" | "en" }> = {};
let lastTelegramUpdateId = 0;
let telegramPollingIntervalRef: NodeJS.Timeout | null = null;
let botUsername: string | null = null;

async function fetchBotUsername() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (response.ok) {
      const json = await response.json();
      if (json.ok && json.result?.username) {
        botUsername = json.result.username.toLowerCase();
        console.log(`Telegram Bot username fetched successfully: @${botUsername}`);
      }
    }
  } catch (err) {
    console.error("Failed to fetch Telegram bot username:", err);
  }
}

function matchCommand(text: string, command: string): boolean {
  let cleaned = text;
  if (botUsername) {
    cleaned = text.replace(`@${botUsername}`, "").trim();
  }
  if (cleaned.startsWith(command)) {
    const after = cleaned.slice(command.length);
    return after === "" || /^\s/.test(after);
  }
  return false;
}

// Helper to get chat-specific language
function getChatLanguage(chatTarget: string): "it" | "en" {
  return chatSettings[chatTarget]?.language || BOT_LANGUAGE;
}

// Load chats from file
try {
  if (fs.existsSync(CHATS_FILE)) {
    const data = fs.readFileSync(CHATS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      knownChatIds = new Set(parsed.map(String));
      chatSettings = {};
      for (const id of knownChatIds) {
        chatSettings[id] = { language: BOT_LANGUAGE };
      }
    } else if (parsed && typeof parsed === "object") {
      chatSettings = parsed;
      knownChatIds = new Set(Object.keys(chatSettings));
      console.log(`Loaded ${knownChatIds.size} chats with custom settings from disk.`);
    }
  } else {
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  }
} catch (e) {
  console.error("Failed to load chats file:", e);
}

function saveChats() {
  try {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chatSettings, null, 2));
  } catch (e) {
    console.error("Failed to save chats file:", e);
  }
}

const CONFIG_FILE = path.join(process.cwd(), "data", "config.json");
let TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0x5EE54869Ecd5E752C31aF095187326D4A4D50e1c";
let CHAIN = process.env.CHAIN || "bsc";

// Load config from disk
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const configData = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(configData);
    if (parsed.tokenAddress) TOKEN_ADDRESS = parsed.tokenAddress;
    if (parsed.chain) CHAIN = parsed.chain;
    if (parsed.language) BOT_LANGUAGE = parsed.language;
    console.log("Loaded configuration from disk:", parsed);
  } else {
    // Save defaults to config file
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
      tokenAddress: TOKEN_ADDRESS,
      chain: CHAIN,
      language: BOT_LANGUAGE
    }, null, 2));
  }
} catch (e) {
  console.error("Failed to load / init config file:", e);
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
      tokenAddress: TOKEN_ADDRESS,
      chain: CHAIN,
      language: BOT_LANGUAGE
    }, null, 2));
  } catch (e) {
    console.error("Failed to save config file:", e);
  }
}

// Filter targets to prevent sending to both the main group and its specific topics
function getUniqueMessageTargets(targets: Set<string>): string[] {
  const targetArray = Array.from(targets);
  const threadChatIds = new Set<string>();

  // Collect all base chat IDs that have a thread specified
  for (const t of targetArray) {
    const parts = t.split('_');
    if (parts.length > 1) {
      threadChatIds.add(parts[0]);
    }
  }

  // Filter out any plain chat IDs that have at least one thread ID registered
  return targetArray.filter(t => {
    const parts = t.split('_');
    if (parts.length === 1 && threadChatIds.has(parts[0])) {
      return false; // Skip the plain chat (General) because we have a specific topic
    }
    return true;
  });
}

// Utility: Broadcast Telegram Message to all known chats
async function sendTelegramMessage(trade: any) {
  if (knownChatIds.size === 0) {
    console.log("No known chat IDs to send message to.");
    return;
  }

  const uniqueTargets = getUniqueMessageTargets(knownChatIds);
  for (const chatTarget of uniqueTargets) {
    const isEn = getChatLanguage(chatTarget) === "en";
    const msg = formatTradeMessage(trade, isEn);
    await sendTelegramMessageToChat(chatTarget, msg);
  }
}

async function sendTelegramMessageToChat(chatTarget: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return;
  }

  const parts = chatTarget.split('_');
  const chatId = parts[0];
  const threadId = parts.length > 1 ? parts[1] : undefined;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send Telegram message to ${chatTarget}`, await response.text());
    }
  } catch (err) {
    console.error(`Error communicating with Telegram for chat ${chatTarget}`, err);
  }
}

// Utility: Process a single Telegram update
async function handleSingleTelegramUpdate(update: any) {
  let chatId = null;
  let threadId = null;
  let chatType = "";
  if (update.message) {
    chatId = update.message.chat.id;
    chatType = update.message.chat.type || "";
    if (update.message.message_thread_id) {
      threadId = update.message.message_thread_id;
    }
  }
  else if (update.channel_post) {
    chatId = update.channel_post.chat.id;
    chatType = update.channel_post.chat.type || "";
  }
  else if (update.my_chat_member) {
    chatId = update.my_chat_member.chat.id;
    chatType = update.my_chat_member.chat.type || "";
  }
  
  if (chatId) {
    const chatTarget = threadId ? `${chatId}_${threadId}` : `${chatId}`;
    const testStr = update.message?.text?.toLowerCase() || '';
    
    if (update.message) {
      // Fetch bot username on-the-fly if not already fetched
      if (!botUsername) {
        await fetchBotUsername();
      }

      const isPrivate = chatType === 'private';
      const isCommand = testStr.startsWith('/');
      const hasBotTag = botUsername ? testStr.includes(`@${botUsername}`) : false;

      // In non-private chats (groups, supergroups, etc), allow commands or explicit bot tags
      if (!isPrivate && !isCommand && !hasBotTag) {
        return;
      }

      const isEn = getChatLanguage(chatTarget) === "en";

      if (matchCommand(testStr, "/start")) {
        if (!knownChatIds.has(chatTarget)) {
          console.log(`Discovered new chat ID: ${chatTarget}`);
          knownChatIds.add(chatTarget);
        }
        if (!chatSettings[chatTarget]) {
          chatSettings[chatTarget] = { language: BOT_LANGUAGE };
        }
        saveChats();
        
        const startMsg = getChatLanguage(chatTarget) === "en"
          ? "The bot is active and will send buy and sell notifications here!"
          : "Il bot è attivo e invierà qui le notifiche degli acquisti e delle vendite!";
        await sendTelegramMessageToChat(chatTarget, startMsg);
      } else if (matchCommand(testStr, "/stop")) {
        if (knownChatIds.has(chatTarget)) {
          console.log(`Stopped in chat ID: ${chatTarget}`);
          knownChatIds.delete(chatTarget);
          delete chatSettings[chatTarget];
        }
        saveChats();

        const stopMsg = isEn
          ? "Notifications stopped in this chat."
          : "Notifiche interrotte in questa chat.";
        await sendTelegramMessageToChat(chatTarget, stopMsg);
      } else if (matchCommand(testStr, "/ping")) {
        const isEn = getChatLanguage(chatTarget) === "en";
        const msg = isEn ? "🏓 <b>Pong!</b> The bot is awake and monitoring." : "🏓 <b>Pong!</b> Il bot è attivo e in ascolto.";
        await sendTelegramMessageToChat(chatTarget, msg);
        // Force a poll check when pinged
        pollTrades().catch(e => console.error("Manual poll from ping failed:", e));
      } else if (matchCommand(testStr, "/chart") || matchCommand(testStr, "/grafico")) {
        const chartLabel = isEn ? "Chart" : "Grafico";
        await sendTelegramMessageToChat(chatTarget, `📊 <b>${chartLabel}:</b>\n<a href="https://dexscreener.com/${CHAIN.toLowerCase()}/${TOKEN_ADDRESS}">DexScreener</a>`);
      } else if (matchCommand(testStr, "/price") || matchCommand(testStr, "/prezzo")) {
        const priceLabel = isEn ? "Current Price" : "Prezzo Attuale";
        const priceStr = tokenPriceUsd > 0 ? tokenPriceUsd.toFixed(8) : (isEn ? "N/A" : "N/D");
        await sendTelegramMessageToChat(chatTarget, `💲 <b>${priceLabel}:</b> $${priceStr}`);
      } else if (matchCommand(testStr, "/lang") || matchCommand(testStr, "/lingua")) {
        const textCleaned = testStr.toLowerCase();
        let targetLang: "en" | "it" | null = null;
        
        if (textCleaned.includes("en") || textCleaned.includes("eng") || textCleaned.includes("english") || textCleaned.includes("inglese")) {
          targetLang = "en";
        } else if (textCleaned.includes("it") || textCleaned.includes("ita") || textCleaned.includes("italian") || textCleaned.includes("italiano")) {
          targetLang = "it";
        }

        if (targetLang) {
          if (!knownChatIds.has(chatTarget)) {
            knownChatIds.add(chatTarget);
          }
          chatSettings[chatTarget] = { language: targetLang };
          saveChats();

          const responseMsg = targetLang === "en"
            ? "🇬🇧 <b>Language set to English for this chat!</b> All future trade notifications in this chat will be in English."
            : "🇮🇹 <b>Lingua impostata in Italiano per questa chat!</b> Tutte le future notifiche in questa chat saranno in Italiano.";
          await sendTelegramMessageToChat(chatTarget, responseMsg);
        } else {
          const currentLang = getChatLanguage(chatTarget);
          const helpMsg = currentLang === "en"
            ? "⚙️ <b>Change Chat Language</b>\nTo change the language of this chat, use:\n• <code>/lang en</code> (English)\n• <code>/lang it</code> (Italian)"
            : "⚙️ <b>Cambia Lingua della Chat</b>\nPer cambiare la lingua in questa chat, usa:\n• <code>/lang en</code> (Inglese)\n• <code>/lang it</code> (Italiano)";
          await sendTelegramMessageToChat(chatTarget, helpMsg);
        }
      }
    }
  }
}

// Utility: Poll Telegram for new chats (Fallback for local dev)
async function pollTelegramUpdates() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=5`);
    if (!response.ok) return;
    const json = await response.json();
    
    if (json.ok && json.result && json.result.length > 0) {
      for (const update of json.result) {
        lastTelegramUpdateId = update.update_id;
        await handleSingleTelegramUpdate(update);
      }
    }
  } catch (err) {
    console.error("Error polling Telegram updates:", err);
  }
}

let knownPools: Map<string, string> = new Map();
let tokenPriceUsd: number = 0;
let tokenName: string = "Unknown";
let tokenSymbol: string = "???";
let tokenPriceChange: any = {};
let priceHistory: number[] = [];
let tokenDecimals: number = 9; // default to 9 until verified
let lastBlockChecked: number | null = null;
let rpcProvider: ethers.JsonRpcProvider | null = null;

// State Persistence for Block Tracker
const STATE_FILE = path.join(process.cwd(), "data", "state.json");
try {
  if (fs.existsSync(STATE_FILE)) {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (typeof parsed.lastBlockChecked === "number") {
      lastBlockChecked = parsed.lastBlockChecked;
      console.log(`Loaded last checked block from disk: ${lastBlockChecked}`);
    }
  } else {
    fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
  }
} catch (e) {
  console.error("Failed to load block state file:", e);
}

function saveLastBlock(block: number) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastBlockChecked: block }));
  } catch (e) {
    console.error("Failed to save block state file:", e);
  }
}

let webhookRegistered = false;
let detectedPublicUrl: string | null = null;
let selfPingIntervalRef: NodeJS.Timeout | null = null;

async function startSelfPing() {
  if (selfPingIntervalRef) return;
  
  selfPingIntervalRef = setInterval(async () => {
    if (!detectedPublicUrl) return;
    
    try {
      // Use a timestamp to prevent any caching and ensure a real request hits the server
      const pingUrl = `${detectedPublicUrl}${detectedPublicUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
      console.log(`Self-pinging to keep alive: ${detectedPublicUrl}`);
      await fetch(pingUrl);
    } catch (err) {
      console.error("Self-ping failed:", err);
    }
  }, 1000 * 60 * 2); // Every 2 minutes
}

async function registerTelegramWebhook(host: string, protocol: string) {
  if (webhookRegistered) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  // Detect and store the public URL for the self-ping immortality loop
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    detectedPublicUrl = `${protocol}://${host}/api/status`;
    startSelfPing();
  }

  // We only set the webhook in production environments
  if (process.env.NODE_ENV !== "production") return;

  try {
    // Avoid registration if host is a local machine address
    if (!host || host.includes("localhost") || host.includes("127.0.0.1") || host.includes("0.0.0.0")) {
      return;
    }

    const webhookUrl = `https://${host}/api/telegram-webhook`;
    console.log(`Attempting to register Telegram Webhook to: ${webhookUrl}`);

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl })
    });

    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        console.log("Telegram Webhook registered successfully!");
        webhookRegistered = true;
        
        // Stop local long-polling updates because the Webhook will handle them in real time now
        if (telegramPollingIntervalRef) {
          clearInterval(telegramPollingIntervalRef);
          telegramPollingIntervalRef = null;
          console.log("Stopped local getUpdates polling since Webhook is now active.");
        }
      } else {
        console.error("Failed to register Telegram Webhook:", json);
      }
    } else {
      console.error("Webhook registration failed with response:", await res.text());
    }
  } catch (err) {
    console.error("Error setting Telegram Webhook:", err);
  }
}

function getRpcUrl(chain: string) {
  const c = chain.toLowerCase();
  if (c === 'bsc') return "https://bsc.publicnode.com";
  if (c === 'ethereum' || c === 'eth') return "https://ethereum.publicnode.com";
  return "https://bsc.publicnode.com";
}

// Initialize RPC and get pools & price from DexScreener
async function initRPC() {
  try {
    rpcProvider = new ethers.JsonRpcProvider(getRpcUrl(CHAIN));
    
    // Fetch token decimals from contract
    try {
      const contract = new ethers.Contract(TOKEN_ADDRESS, ["function decimals() view returns (uint8)"], rpcProvider);
      tokenDecimals = await contract.decimals();
    } catch(e) {
      console.warn("Could not fetch decimals, defaulting to 9");
      tokenDecimals = 9;
    }

    await fetchDexScreenerData();
    
  } catch(e) {
    console.error("Init RPC error:", e);
  }
}

async function fetchDexScreenerData() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
    const json = await res.json();
    if (json.pairs && json.pairs.length > 0) {
      json.pairs.forEach((p: any) => {
          knownPools.set(p.pairAddress.toLowerCase(), p.dexId || 'Unknown DEX');
      });
      tokenPriceUsd = parseFloat(json.pairs[0].priceUsd || "0");
      tokenName = json.pairs[0].baseToken?.name || "Unknown";
      tokenSymbol = json.pairs[0].baseToken?.symbol || "???";
      tokenPriceChange = json.pairs[0].priceChange || {};
      
      priceHistory.push(tokenPriceUsd);
      if (priceHistory.length > 20) priceHistory.shift();
    }
  } catch(e) {
    console.error("DexScreener fetch error:", e);
  }
}

// Format Trade for Telegram
function formatTradeMessage(trade: any, forceIsEn?: boolean) {
  const isBuy = trade.type === "buy";
  const isEn = forceIsEn !== undefined ? forceIsEn : (BOT_LANGUAGE === "en");
  
  // Emojis for layout
  const headerIcon = isBuy ? "🟢" : "🔴";
  const actionText = isBuy 
    ? (isEn ? "NEW BUY" : "NUOVO ACQUISTO") 
    : (isEn ? "NEW SELL" : "NUOVA VENDITA");
  
  const locale = isEn ? "en-US" : "it-IT";
  const volUsd = trade.volumeUSD.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const tokens = trade.tokensAmount.toLocaleString(locale, { maximumFractionDigits: 2 });
  
  let explorerUrl = `https://bscscan.com/tx/${trade.txHash}`;
  if (CHAIN.toLowerCase() === 'solana') explorerUrl = `https://solscan.io/tx/${trade.txHash}`;
  if (CHAIN.toLowerCase() === 'ethereum') explorerUrl = `https://etherscan.io/tx/${trade.txHash}`;

  const priceStr = tokenPriceUsd > 0 ? tokenPriceUsd.toFixed(8) : (isEn ? "N/A" : "N/D");

  // Trend format: "m5: x% | h1: y%"
  const t5 = typeof tokenPriceChange?.m5 === 'number' ? `${tokenPriceChange.m5 > 0 ? '+' : ''}${tokenPriceChange.m5}% (5m)` : '';
  const t1 = typeof tokenPriceChange?.h1 === 'number' ? `${tokenPriceChange.h1 > 0 ? '+' : ''}${tokenPriceChange.h1}% (1h)` : '';
  const trendLine = t5 && t1 ? `📈 <b>Trend:</b> ${t5} | ${t1}\n` : '';

  const labelQty = isEn ? "Amount" : "Quantità";
  const labelValue = isEn ? "Value" : "Controvalore";
  const labelPrice = isEn ? "Current Price" : "Prezzo Attuale";
  const labelPlatform = isEn ? "Platform" : "Piattaforma";
  const labelTx = isEn ? "View Transaction" : "Vedi Transazione";
  const labelDex = isEn ? "Open DexScreener" : "Apri DexScreener";

  return `<b>${headerIcon} ${actionText}</b>
<i>Token:</i> <b>${tokenName} (${tokenSymbol})</b>

💎 <b>${labelQty}:</b> <code>${tokens}</code>
💵 <b>${labelValue}:</b> ${volUsd}
${trendLine}
💲 <b>${labelPrice}:</b> $${priceStr} 
🔄 <b>${labelPlatform}:</b> ${trade.source}

🔗 <a href="${explorerUrl}">${labelTx}</a>
📈 <a href="https://dexscreener.com/${CHAIN.toLowerCase()}/${TOKEN_ADDRESS}">${labelDex}</a>`;
}

// Core Polling Logic - RPC Events
let isPollingTrades = false;

async function pollTrades() {
  if (isPollingTrades) {
    console.log("Previous poll is still running, skipping overlap check.");
    return;
  }
  isPollingTrades = true;

  try {
    botStatus.lastCheck = new Date();
    if (!rpcProvider) return;

    try {
      const currentBlock = await rpcProvider.getBlockNumber();
      
      if (!lastBlockChecked) {
        lastBlockChecked = currentBlock;
        saveLastBlock(currentBlock);
        console.log(`Initialized bot. Listening for trades from block: ${currentBlock}`);
        return;
      }

      if (currentBlock <= lastBlockChecked) return;

      // Buffer blocks to avoid load balancer desync where getLogs node is behind getBlockNumber node
      const safeToBlock = currentBlock - 5;
      if (safeToBlock < lastBlockChecked + 1) return;

      // Catch up in chunks of blocks to avoid RPC timeout or large response errors
      const CHUNK_SIZE = 1000;
      const MAX_CATCHUP = 5000; // Limit catch-up to ~4h on BSC to prevent extreme RPC lag
      
      let fromBlock = lastBlockChecked + 1;
      
      // If we are too far behind, jump closer to current block but log it
      if (safeToBlock - fromBlock > MAX_CATCHUP) {
        console.warn(`Bot was offline for too long (${safeToBlock - fromBlock} blocks). Jumping to last ${MAX_CATCHUP} blocks to catch up.`);
        fromBlock = safeToBlock - MAX_CATCHUP;
      }

      while (fromBlock <= safeToBlock) {
        const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, safeToBlock);
        
        const filter = {
          address: TOKEN_ADDRESS,
          topics: [ethers.id("Transfer(address,address,uint256)")],
          fromBlock: fromBlock,
          toBlock: toBlock
        };

        const logs = await rpcProvider.getLogs(filter);

        for (const log of logs) {
          try {
            const fromHex = log.topics[1];
            const toHex = log.topics[2];
            if (!fromHex || !toHex) continue;

            const fromAddress = ethers.dataSlice(fromHex, 12).toLowerCase();
            const toAddress = ethers.dataSlice(toHex, 12).toLowerCase();
            const amountHex = log.data;

            const isBuy = knownPools.has(fromAddress);
            const isSell = knownPools.has(toAddress);

            if (isBuy || isSell) {
              const rawAmount = ethers.toBigInt(amountHex);
              const amountParsed = Number(ethers.formatUnits(rawAmount, tokenDecimals));
              const valueUsd = amountParsed * tokenPriceUsd;

              const dexName = isBuy ? knownPools.get(fromAddress) : knownPools.get(toAddress);

              const trade = {
                txHash: log.transactionHash,
                type: isBuy ? 'buy' : 'sell',
                source: dexName || (isBuy ? fromAddress.slice(0,6) : toAddress.slice(0,6)),
                volumeUSD: valueUsd,
                tokensAmount: amountParsed,
                blockTime: Math.floor(Date.now() / 1000)
              };

              recentTrades.unshift(trade);
              if (recentTrades.length > 50) recentTrades.pop();
              saveTrades();

              await sendTelegramMessage(trade);
            }
          } catch (logErr) {
            console.error("Error processing single log", logErr);
          }
        }

        fromBlock = toBlock + 1;
        lastBlockChecked = toBlock;
        saveLastBlock(toBlock);
      }

      botStatus.errorCount = 0;
      botStatus.lastError = null;

    } catch (err: any) {
      if (err?.message?.includes("invalid block range params")) {
        // Just ignore this, the RPC node is a bit behind, we'll try again next tick
        console.log(`RPC node is a bit behind, skipping logs until next tick.`);
        return;
      }
      botStatus.errorCount++;
      botStatus.lastError = err.message;
      console.error("Error during RPC polling:", err.message);

      // If high error count, try to re-init RPC provider
      if (botStatus.errorCount >= 10 && botStatus.errorCount % 10 === 0) {
        console.log("High error count detected, attempting to re-initialize RPC provider...");
        initRPC().catch(e => console.error("Re-init RPC failed:", e));
      }
    }
  } finally {
    isPollingTrades = false;
  }
}

function startPolling() {
  if (botStatus.running) return;
  botStatus.running = true;
  
  initRPC().then(() => {
    pollTrades(); 
    pollingIntervalRef = setInterval(pollTrades, POLLING_INTERVAL_MS);
    priceFetchIntervalRef = setInterval(fetchDexScreenerData, 60000); // refresh pools/price every min
  });
}

function stopPolling() {
  botStatus.running = false;
  if (pollingIntervalRef) {
    clearInterval(pollingIntervalRef);
    pollingIntervalRef = null;
  }
  if (priceFetchIntervalRef) {
    clearInterval(priceFetchIntervalRef);
    priceFetchIntervalRef = null;
  }
}

// Ensure Telegram polling always runs
if (process.env.TELEGRAM_BOT_TOKEN) {
  pollTelegramUpdates();
  telegramPollingIntervalRef = setInterval(pollTelegramUpdates, 5000);
}

// Auto-start polling if token and chain are set
if (process.env.TELEGRAM_BOT_TOKEN && TOKEN_ADDRESS && CHAIN) {
  startPolling();
}

async function startServer() {
  const app = express();

  app.use(express.json());

  // === API ROUTES ===
  app.get("/api/status", (req, res) => {
    const host = req.get("host");
    if (host) {
      registerTelegramWebhook(host, req.protocol);
    }

    res.json({
        ...botStatus,
        tokenAddress: TOKEN_ADDRESS,
        chain: CHAIN,
        language: BOT_LANGUAGE,
        hasTelegramKey: !!process.env.TELEGRAM_BOT_TOKEN,
        activeChatCount: knownChatIds.size,
    });
  });

  app.post("/api/telegram-webhook", async (req, res) => {
    try {
      const update = req.body;
      if (update && update.update_id) {
        await handleSingleTelegramUpdate(update);
      }
      res.sendStatus(200);
    } catch (err) {
      console.error("Error handling Telegram Webhook POST update:", err);
      res.sendStatus(500);
    }
  });

  app.get("/api/trades", (req, res) => {
    res.json(recentTrades);
  });

  app.post("/api/start", (req, res) => {
    startPolling();
    res.json({ success: true, running: botStatus.running });
  });

  app.post("/api/stop", (req, res) => {
    stopPolling();
    res.json({ success: true, running: botStatus.running });
  });

  app.post("/api/config", (req, res) => {
    const { tokenAddress, chain, language } = req.body;
    let tokenOrChainChanged = false;

    if (tokenAddress && tokenAddress !== TOKEN_ADDRESS) {
      TOKEN_ADDRESS = tokenAddress;
      tokenOrChainChanged = true;
    }
    if (chain && chain !== CHAIN) {
      CHAIN = chain;
      tokenOrChainChanged = true;
    }
    if (language === "it" || language === "en") {
      BOT_LANGUAGE = language;
    }

    saveConfig();

    if (tokenOrChainChanged) {
      // Reset cursor when token changes
      lastBlockChecked = null;
      recentTrades.length = 0; // Empty the array
      knownPools.clear();
      
      if (botStatus.running) {
        stopPolling();
        startPolling();
      }
    }

    res.json({ success: true, tokenAddress: TOKEN_ADDRESS, chain: CHAIN, language: BOT_LANGUAGE });
  });

  // === VITE MIDDLEWARE (DEV) OR STATIC SERVER (PROD) ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
