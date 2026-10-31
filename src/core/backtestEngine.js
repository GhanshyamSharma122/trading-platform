import { createPortfolio, executeOrder, snapshotPortfolio } from "./portfolio.js";
import { helpers } from "../lib/indicators.js";

function computeStats({ equityCurve, startingCash, portfolio }) {
  const endingEquity = equityCurve.at(-1)?.equity ?? startingCash;
  const returnPct = ((endingEquity - startingCash) / startingCash) * 100;

  let peak = equityCurve[0]?.equity ?? startingCash;
  let maxDrawdownPct = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdown = peak === 0 ? 0 : ((peak - point.equity) / peak) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdown);
  }

  return {
    startingCash,
    endingEquity: Number(endingEquity.toFixed(2)),
    returnPct: Number(returnPct.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    totalTrades: portfolio.trades.length,
    realizedPnL: Number(portfolio.realizedPnL.toFixed(2))
  };
}

export async function runBacktestOnBars({
  bars,
  symbol,
  interval,
  strategy,
  startingCash,
  requestedInterval = interval,
  marketData = null
}) {
  const marketDataMeta = marketData?.meta ?? {
    source: "memory",
    fallbackUsed: false,
    requestedInterval,
    effectiveInterval: interval
  };
  const effectiveInterval = marketDataMeta.effectiveInterval;
  const portfolio = createPortfolio({ symbol, startingCash });
  const state = {};
  const signals = [];
  const equityCurve = [];

  if (strategy.onStart) {
    await strategy.onStart({
      symbol,
      interval: effectiveInterval,
      requestedInterval,
      mode: "backtest",
      state
    });
  }

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const series = bars.slice(0, index + 1);
    const portfolioSnapshot = snapshotPortfolio(portfolio, bar.close);

    const decision =
      (await strategy.onBar({
        mode: "backtest",
        symbol,
        interval: effectiveInterval,
        requestedInterval,
        bar,
        series,
        index,
        position: portfolioSnapshot.position,
        portfolio: portfolioSnapshot,
        state,
        helpers
      })) ?? { action: "hold" };

    const action = String(decision.action ?? "hold").toLowerCase();
    const trade = executeOrder({
      portfolio,
      action,
      quantity: decision.quantity,
      price: bar.close,
      timestamp: bar.timestamp
    });

    const nextSnapshot = snapshotPortfolio(portfolio, bar.close);

    signals.push({
      timestamp: bar.timestamp,
      action,
      requestedQuantity: decision.quantity ?? null,
      executedTrade: trade,
      equity: nextSnapshot.equity
    });

    equityCurve.push({
      timestamp: bar.timestamp,
      equity: nextSnapshot.equity
    });
  }

  const finalSnapshot = snapshotPortfolio(portfolio, bars.at(-1)?.close ?? 0);

  if (strategy.onFinish) {
    await strategy.onFinish({
      mode: "backtest",
      symbol,
      interval: effectiveInterval,
      requestedInterval,
      state,
      portfolio: finalSnapshot
    });
  }

  return {
    strategy: strategy.name,
    symbol,
    interval: effectiveInterval,
    requestedInterval,
    marketData: marketDataMeta,
    barsProcessed: bars.length,
    stats: computeStats({ equityCurve, startingCash, portfolio }),
    portfolio: finalSnapshot,
    signals,
    equityCurve
  };
}

export async function runBacktest({
  client,
  symbol,
  interval,
  strategy,
  startingCash,
  outputSize,
  dataOptions = {},
  fallback = "auto"
}) {
  const marketData = await client.getTimeSeriesWithFallback(
    { symbol, interval, outputSize, ...dataOptions },
    { fallback }
  );

  return runBacktestOnBars({
    bars: marketData.bars,
    symbol,
    interval: marketData.meta.effectiveInterval,
    requestedInterval: interval,
    strategy,
    startingCash,
    marketData
  });
}
