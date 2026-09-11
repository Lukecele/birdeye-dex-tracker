import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExplorerUrl,
  getUniqueMessageTargets,
  matchCommand,
  formatTradeMessage,
  TradeData,
  TokenMeta
} from '../src/lib/trade-formatter.ts';

describe('DEX Tracker - Explorer URL Generation', () => {
  it('generates correct explorer link for BSC', () => {
    const url = buildExplorerUrl('0x123abc', 'bsc');
    assert.equal(url, 'https://bscscan.com/tx/0x123abc');
  });

  it('generates correct explorer link for Solana', () => {
    const url = buildExplorerUrl('5xyz', 'solana');
    assert.equal(url, 'https://solscan.io/tx/5xyz');
  });

  it('generates correct explorer link for Ethereum', () => {
    const url = buildExplorerUrl('0x456def', 'ethereum');
    assert.equal(url, 'https://etherscan.io/tx/0x456def');
  });
});

describe('DEX Tracker - Message Target Deduplication', () => {
  it('prunes generic group ID if a specific topic thread ID is present', () => {
    const targets = new Set(['-100123456', '-100123456_42', '-100987654']);
    const deduped = getUniqueMessageTargets(targets);
    assert.equal(deduped.includes('-100123456'), false);
    assert.equal(deduped.includes('-100123456_42'), true);
    assert.equal(deduped.includes('-100987654'), true);
    assert.equal(deduped.length, 2);
  });

  it('preserves generic group when no thread IDs exist', () => {
    const targets = new Set(['-100111', '-100222']);
    const deduped = getUniqueMessageTargets(targets);
    assert.equal(deduped.length, 2);
  });
});

describe('DEX Tracker - Telegram Command Matching', () => {
  it('matches exact commands', () => {
    assert.equal(matchCommand('/start', '/start'), true);
    assert.equal(matchCommand('/stop', '/stop'), true);
    assert.equal(matchCommand('/ping', '/ping'), true);
  });

  it('matches commands with bot username tag', () => {
    assert.equal(matchCommand('/start@MyDexBot', '/start', 'MyDexBot'), true);
    assert.equal(matchCommand('/ping@mydexbot', '/ping', 'MyDexBot'), true);
  });

  it('does not match command prefixes without whitespace', () => {
    assert.equal(matchCommand('/starter', '/start'), false);
  });
});

describe('DEX Tracker - HTML Trade Message Formatting', () => {
  const sampleTrade: TradeData = {
    type: 'buy',
    tokensAmount: 50000,
    volumeUSD: 1250.75,
    txHash: '0xabc123',
    source: 'PancakeSwap v2'
  };

  const sampleMeta: TokenMeta = {
    name: 'SampleToken',
    symbol: 'SMPL',
    priceUsd: 0.025015,
    priceChange: { m5: 3.5, h1: 12.8 }
  };

  it('formats Buy message in Italian', () => {
    const msg = formatTradeMessage(sampleTrade, sampleMeta, '0xtoken', 'bsc', false);
    assert.ok(msg.includes('🟢 NUOVO ACQUISTO'));
    assert.ok(msg.includes('SampleToken (SMPL)'));
    assert.ok(msg.includes('Controvalore:</b>') && msg.includes('1250,75'));
    assert.ok(msg.includes('PancakeSwap v2'));
  });

  it('formats Sell message in English', () => {
    const sellTrade: TradeData = { ...sampleTrade, type: 'sell' };
    const msg = formatTradeMessage(sellTrade, sampleMeta, '0xtoken', 'bsc', true);
    assert.ok(msg.includes('🔴 NEW SELL'));
    assert.ok(msg.includes('Amount:</b> <code>50,000'));
    assert.ok(msg.includes('$1,250.75'));
  });
});
