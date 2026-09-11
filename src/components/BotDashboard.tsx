import { useEffect, useState } from "react";
import { AppConfig, Trade } from "../types";
import { 
  Play, Square, RefreshCcw, Activity, AlertCircle, 
  CheckCircle2, Settings, ExternalLink, ArrowDownRight, ArrowUpRight 
} from "lucide-react";

export default function BotDashboard() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Editable config state
  const [editAddress, setEditAddress] = useState("");
  const [editChain, setEditChain] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const [resStatus, resTrades] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/trades")
      ]);
      const dataStatus = await resStatus.json();
      const dataTrades = await resTrades.json();
      
      setConfig(dataStatus);
      setTrades(dataTrades);

      if (!isEditing && !editAddress) {
        setEditAddress(dataStatus.tokenAddress);
        setEditChain(dataStatus.chain);
      }
    } catch (e) {
      console.error("Failed to fetch dashboard data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBotStart = async () => {
    if (!config) return;
    const action = config.running ? "stop" : "start";
    await fetch(`/api/${action}`, { method: "POST" });
    fetchStatus();
  };

  const toggleLanguage = async () => {
    if (!config) return;
    const nextLang = config.language === "en" ? "it" : "en";
    
    // Optimistically update local config state
    setConfig(prev => prev ? { ...prev, language: nextLang } : null);
    
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: nextLang })
      });
      fetchStatus();
    } catch (e) {
      console.error("Failed to update language config", e);
    }
  };

  const handleSaveConfig = async () => {
    setSaveLoading(true);
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenAddress: editAddress, chain: editChain })
    });
    setSaveLoading(false);
    setIsEditing(false);
    fetchStatus();
  };

  if (isLoading && !config) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <RefreshCcw className="animate-spin text-zinc-500 w-8 h-8" />
      </div>
    );
  }

  const isSetupValid = config?.hasTelegramKey;
  const isEn = config?.language === "en";

  const t = {
    title: "DEX Telegram Bot",
    subtitle: isEn ? "Liquidity pool swap tracker and notifier." : "Aggregatore di swap su tutte le pool di liquidità.",
    missingKeys: isEn ? "Missing API Keys" : "Chiavi API Mancanti",
    stopBot: isEn ? "Stop Bot" : "Ferma Bot",
    startBot: isEn ? "Start Bot" : "Avvia Bot",
    envStatus: isEn ? "Environment Status" : "Stato Ambiente",
    tgToken: isEn ? "Telegram Bot Token" : "Token Bot Telegram",
    configured: isEn ? "Configured" : "Configurato",
    missing: isEn ? "Missing" : "Mancante",
    activeChats: isEn ? "Active Chats" : "Chat Attive",
    settingsHelpMissing: isEn 
      ? "Configure your Bot Token in the AI Studio Secrets panel or the .env file. Restart the server after modifying." 
      : "Configura il Token del Bot nel pannello Secrets di AI Studio o nel file .env. Dopo aver aggiunto le variabili d'ambiente, riavvia il server.",
    settingsHelpOk: isEn 
      ? "Add the bot to your channels or groups and type /start to register them automatically." 
      : "Aggiungi il bot ai tuoi canali/gruppi e invia /start per registrarli automaticamente.",
    tokenConfig: isEn ? "Token Configuration" : "Configurazione Token",
    chain: isEn ? "Chain" : "Chain",
    contractAddress: isEn ? "Contract Address" : "Indirizzo Contratto (Contract Address)",
    viewDexScreener: isEn ? "View on DexScreener" : "Vedi su DexScreener",
    saveConfig: isEn ? "Save Configuration" : "Salva Configurazione",
    saving: isEn ? "Saving..." : "Salvataggio in corso...",
    liveStats: isEn ? "Live Status" : "Live Status",
    lastCheck: isEn ? "Last Check" : "Ultimo controllo",
    never: isEn ? "Never" : "Mai",
    botStateLabel: isEn ? "Bot Status" : "Stato Bot",
    activeListening: isEn ? "Active - listening" : "Attivo - in ascolto",
    stopped: isEn ? "Stopped" : "Ferma",
    systemErrors: isEn ? "System Errors" : "Errori di sistema",
    channelLogsTitle: isEn ? "Sent to Telegram" : "Inviati su Telegram",
    recentLabel: isEn ? "Last" : "Ultimi",
    noTradesYet: isEn ? "No trades processed yet." : "Nessun trade processato ancora.",
    noTradesSub: isEn 
      ? "Start the bot and make sure the token has trade volume." 
      : "Avvia il bot e assicurati che il token abbia volumi.",
    tokens: isEn ? "tokens" : "tokens",
    viewTx: isEn ? "View Transaction" : "Vedi Transazione",
    openDexScreener: isEn ? "Open DexScreener" : "Apri DexScreener",
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="text-blue-500" />
              {t.title}
            </h1>
            <p className="text-zinc-400 mt-1">{t.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Bilingual Switcher Toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 text-sm font-medium transition cursor-pointer text-zinc-200"
              title={isEn ? "Switch to Italian" : "Passa all'Inglese"}
            >
              <span>{isEn ? "🇬🇧" : "🇮🇹"}</span>
              <span className="text-xs uppercase tracking-wider font-semibold">{isEn ? "EN" : "IT"}</span>
            </button>

            {!isSetupValid && (
              <span className="flex items-center gap-1.5 text-amber-500 text-sm font-medium bg-amber-500/10 px-3 py-1.5 rounded-full">
                <AlertCircle size={16} /> {t.missingKeys}
              </span>
            )}
            
            <button
              onClick={toggleBotStart}
              disabled={!isSetupValid}
              className={`flex items-center gap-2 px-5 py-2 rounded-full font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                config?.running 
                  ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" 
                  : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
              }`}
            >
               {config?.running ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
               {config?.running ? t.stopBot : t.startBot}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COL: Config & Status */}
          <div className="space-y-6">
            
            {/* Environment Status Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-lg font-semibold mb-4 text-zinc-100">{t.envStatus}</h2>
              <ul className="space-y-3">
                <StatusItem label={t.tgToken} active={config?.hasTelegramKey} isEn={isEn} />
                <li className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{t.activeChats}</span>
                  <span className="text-zinc-400 font-medium bg-zinc-800 px-2.5 py-0.5 rounded-md">
                    {config?.activeChatCount || 0}
                  </span>
                </li>
              </ul>
              {!isSetupValid ? (
                <div className="mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-400">
                  {t.settingsHelpMissing}
                </div>
              ) : (
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-400">
                  {t.settingsHelpOk}
                </div>
              )}
            </div>

            {/* Token Config Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-100">{t.tokenConfig}</h2>
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <Settings size={18} />
                </button>
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">{t.chain}</label>
                    <input 
                      type="text" 
                      value={editChain}
                      onChange={e => setEditChain(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">{t.contractAddress}</label>
                    <input 
                      type="text" 
                      value={editAddress}
                      onChange={e => setEditAddress(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <button 
                    onClick={handleSaveConfig}
                    disabled={saveLoading}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg text-sm font-medium transition"
                  >
                    {saveLoading ? t.saving : t.saveConfig}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 mb-1">{t.chain}</p>
                    <div className="flex items-center gap-2">
                       <span className="capitalize font-medium text-zinc-200">{config?.chain}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-500 mb-1">{t.contractAddress}</p>
                    <div className="flex flex-col gap-2">
                       <span className="font-mono text-sm text-blue-400 break-all">{config?.tokenAddress}</span>
                       <a 
                          href={`https://dexscreener.com/${config?.chain?.toLowerCase()}/${config?.tokenAddress}`} 
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          {t.viewDexScreener} <ExternalLink size={12} />
                       </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Performance Stats */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-lg font-semibold mb-3 text-zinc-100">{t.liveStats}</h2>
              <div className="space-y-2 text-sm">
                 <div className="flex justify-between">
                    <span className="text-zinc-500">{t.lastCheck}</span>
                    <span className="text-zinc-300">
                      {config?.lastCheck ? new Date(config.lastCheck).toLocaleTimeString() : t.never}
                    </span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-zinc-500">{t.botStateLabel}</span>
                    {config?.running ? <span className="text-green-500">{t.activeListening}</span> : <span className="text-zinc-500">{t.stopped}</span>}
                 </div>
                 {config?.errorCount ? (
                   <div className="flex justify-between">
                      <span className="text-zinc-500">{t.systemErrors}</span>
                      <span className="text-red-400">{config.errorCount}</span>
                   </div>
                 ) : null}
              </div>
            </div>

          </div>

          {/* RIGHT COL: Recent Log */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-zinc-100">{t.channelLogsTitle}</h2>
              <div className="text-xs font-medium bg-zinc-950 px-2.5 py-1 rounded-md text-zinc-400">
                {t.recentLabel} {trades.length}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
              {trades.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-12 text-zinc-500">
                  <Activity size={32} className="opacity-20 mb-3" />
                  <p>{t.noTradesYet}</p>
                  <p className="text-sm mt-1">{t.noTradesSub}</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {trades.map((tItem, idx) => (
                    <div key={tItem.txHash + idx} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition">
                       <div className="flex items-center gap-4">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${tItem.type === 'buy' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {tItem.type === 'buy' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold capitalize ${tItem.type === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                                {isEn ? (tItem.type === 'buy' ? 'Buy' : 'Sell') : (tItem.type === 'buy' ? 'Acquisto' : 'Vendita')}
                              </span>
                              <span className="text-sm text-zinc-400 font-mono">
                                • {tItem.source}
                              </span>
                            </div>
                            <div className="text-zinc-300 text-sm mt-0.5">
                              {tItem.tokensAmount.toLocaleString(isEn ? 'en-US' : 'it-IT', { maximumFractionDigits: 2 })} {t.tokens}
                            </div>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className="font-medium text-zinc-200">
                            ${tItem.volumeUSD.toLocaleString(isEn ? 'en-US' : 'it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {new Date(Number(tItem.blockTime) * 1000).toLocaleTimeString(isEn ? 'en-US' : 'it-IT')}
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, active, isEn }: { label: string, active?: boolean, isEn?: boolean }) {
  return (
    <li className="flex items-center justify-between text-sm">
      <span className="text-zinc-300">{label}</span>
      {active ? (
        <span className="flex items-center gap-1.5 text-green-500 font-medium">
          <CheckCircle2 size={16} /> {isEn ? "Configured" : "Configurato"}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-red-400 font-medium bg-red-400/10 px-2 py-0.5 rounded-md">
          <AlertCircle size={14} /> {isEn ? "Missing" : "Mancante"}
        </span>
      )}
    </li>
  );
}
