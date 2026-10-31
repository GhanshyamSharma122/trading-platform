import { runBacktestOnBars } from "./backtestEngine.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSeries(bars, baseClose) {
  return bars.map((bar) => ({
    timestamp: bar.timestamp,
    open: (bar.open / baseClose) * 100,
    high: (bar.high / baseClose) * 100,
    low: (bar.low / baseClose) * 100,
    close: (bar.close / baseClose) * 100,
    volume: bar.volume
  }));
}

function intersectTimestamps(seriesList) {
  const timestampCounts = new Map();

  for (const series of seriesList) {
    for (const bar of series) {
      timestampCounts.set(bar.timestamp, (timestampCounts.get(bar.timestamp) ?? 0) + 1);
    }
  }

  return [...timestampCounts.entries()]
    .filter(([, count]) => count === seriesList.length)
    .map(([timestamp]) => timestamp)
    .sort((left, right) => new Date(left) - new Date(right));
}

function buildSyntheticBars(seriesList) {
  const timestamps = intersectTimestamps(seriesList);

  return timestamps.map((timestamp) => {
    const matches = seriesList.map((series) => series.find((bar) => bar.timestamp === timestamp));

    const average = (key) =>
      matches.reduce((total, bar) => total + bar[key], 0) / Math.max(matches.length, 1);

    return {
      timestamp,
      open: Number(average("open").toFixed(4)),
      high: Number(average("high").toFixed(4)),
      low: Number(average("low").toFixed(4)),
      close: Number(average("close").toFixed(4)),
      volume: Math.round(matches.reduce((total, bar) => total + bar.volume, 0))
    };
  });
}

export async function runBasketBacktest({
  client,
  basket,
  strategy,
  startingCash,
  interval,
  outputSize,
  dataOptions = {},
  fallback = "auto",
  limitSymbols
}) {
  const requestedSymbols = typeof limitSymbols === "number"
    ? basket.symbols.slice(0, limitSymbols)
    : basket.symbols;

  const successful = [];
  const failed = [];

  for (const symbol of requestedSymbols) {
    if (successful.length + failed.length > 0) {
      await sleep(1100);
    }

    try {
      const marketData = await client.getTimeSeriesWithFallback(
        { symbol, interval, outputSize, ...dataOptions },
        { fallback }
      );

      if (marketData.bars.length < 2) {
        failed.push({ symbol, reason: "Not enough bars returned" });
        continue;
      }

      const normalized = normalizeSeries(marketData.bars, marketData.bars[0].close);
      successful.push({
        symbol,
        bars: marketData.bars,
        normalized,
        marketData: marketData.meta
      });
    } catch (error) {
      failed.push({ symbol, reason: error.message });
    }
  }

  if (successful.length < basket.minSuccessfulSymbols) {
    throw new Error(
      `Basket backtest requires at least ${basket.minSuccessfulSymbols} successful symbols, but only ${successful.length} loaded.`
    );
  }

  const syntheticBars = buildSyntheticBars(successful.map((item) => item.normalized));
  if (syntheticBars.length < 2) {
    throw new Error("Synthetic basket series is empty after aligning constituent timestamps.");
  }

  const marketData = {
    meta: {
      source: "basket",
      fallbackUsed: successful.some((item) => item.marketData.fallbackUsed),
      requestedInterval: interval,
      effectiveInterval: interval,
      basketName: basket.name,
      basketPath: basket.path,
      requestedSymbols: requestedSymbols.length,
      successfulSymbols: successful.length,
      failedSymbols: failed.length,
      constituents: successful.map((item) => ({
        symbol: item.symbol,
        source: item.marketData.source,
        fallbackUsed: item.marketData.fallbackUsed,
        effectiveInterval: item.marketData.effectiveInterval
      })),
      failures: failed
    }
  };

  const results = await runBacktestOnBars({
    bars: syntheticBars,
    symbol: basket.name,
    interval,
    requestedInterval: interval,
    strategy,
    startingCash,
    marketData
  });

  return {
    ...results,
    basket: {
      name: basket.name,
      path: basket.path,
      weighting: basket.weighting,
      requestedSymbols: requestedSymbols.length,
      successfulSymbols: successful.length,
      failedSymbols: failed
    }
  };
}
