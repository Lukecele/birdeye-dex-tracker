# DEX Swap Tracker & Telegram Bot

A real-time DEX liquidity pool swap tracker and Telegram alert bot with an interactive web administration dashboard. Built with Express, Vite, React, TypeScript, Ethers.js, and Google Cloud Run.

**Live Web Dashboard:** [https://birdeye-telegram-bot-697887897331.europe-west2.run.app](https://birdeye-telegram-bot-697887897331.europe-west2.run.app)  
**Production Telegram Bot:** [@ArbincMoon_bot](https://t.me/ArbincMoon_bot) (Live Buy/Sell alert bot in community topic)  
**Deployment:** Google Cloud Run (Containerized Express Daemon & Web Dashboard)  
**License:** MIT

---

## Overview

This project provides automated on-chain liquidity monitoring and event alerting across decentralized exchanges (PancakeSwap, SushiSwap). It connects directly to Birdeye REST APIs and on-chain RPC nodes, processing swap events, calculating USD volumes, and broadcasting rich formatted alerts to configured Telegram channels.

The application includes an integrated web control dashboard that allows administrators to dynamically start or stop the monitoring workers, change monitored token contracts, switch supported chains (BSC, Solana, Ethereum), and toggle language localizations (English / Italian).

---

## Key Features

- **Real-Time Swap Streaming:** Listens to liquidity pool swap events via Birdeye API and on-chain logs with configurable polling intervals.
- **Automated Telegram Bot Alerts:** Delivers real-time Buy/Sell transaction alerts with USD trade value, token amount, price, and one-click links to DexScreener and BscScan (>9,500 live transactions logged).
- **Web Control Dashboard:** Reactive management interface built with React, Vite, and Tailwind CSS.
  - Live worker status monitoring (Active / Stopped, error counters, last check timestamps).
  - On-the-fly token contract address and chain configuration.
  - Dynamic language toggle (EN / IT).
  - Recent transactions visual feed.
- **Serverless Cloud Deployment:** Containerized and optimized for Google Cloud Run and Vercel edge reverse proxy.

---

## Tech Stack

- **Backend:** Node.js, Express, Ethers.js, Telegram Bot API
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, Lucide React
- **Cloud & DevOps:** Google Cloud Run, Docker, Vercel

---

## Local Development

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation
```bash
# Clone repository
git clone https://github.com/Lukecele/birdeye-dex-tracker.git
cd birdeye-dex-tracker

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Start development server
npm run dev
```

---

## ⚖️ Open-Source Architecture & Non-Custodial Notice

This repository contains free, open-source telemetry and event alerting software (MIT License) developed and maintained by independent open-source software engineers.

- **Non-Custodial Telemetry:** This application connects in read-only mode to public blockchain RPC nodes and Birdeye APIs to index trade events. It does not execute swaps, hold custody of user keys or funds, or provide financial or investment advisory services.
- **MiCA Exemption (Recital 22):** Independent, non-custodial analytics and decentralized event monitoring tools without financial custody operate outside the scope of crypto-asset service provider (CASP) regulations.

---

## License

Released under the [MIT License](./LICENSE).
