import fs from "node:fs/promises";
import path from "node:path";
import { createPortfolio, executeOrder, snapshotPortfolio } from "./portfolio.js";
import { helpers } from "../lib/indicators.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPaperTrader({
  client,
  symbol,
  interval,
  strategy,
  startingCash,
  pollSeconds,
  outputPath,
  dataOptions = {},
  fallback = "auto"
}) {
  const portfolio = createPortfolio({ symbol, startingCash });
  const state = {};
  const seenBars = new Set();
  let effectiveInterval = interval;

  if (strategy.onStart) {
    await strategy.onStart({ symbol, interval, requestedInterval: interval, mode: "paper", state });
  }

  console.log(`Starting paper trading for ${symbol} on ${interval}. Press Ctrl+C to stop.`);

  while (true) {
    const marketData = await client.getTimeSeriesWithFallback(
      {
        symbol,
        interval,
        outputSize: "compact",
        ...dataOptions
      },
      { fallback }
    );
    const bars = marketData.bars;
    effectiveInterval = marketData.meta.effectiveInterval;
    const latestBar = bars.at(-1);

    if (!latestBar) {
      await sleep(pollSeconds * 1000);
      continue;
    }

    if (!seenBars.has(latestBar.timestamp)) {
      const portfolioSnapshot = snapshotPortfolio(portfolio, latestBar.close);
      const decision =
        (await strategy.onBar({
          mode: "paper",
          symbol,
          interval: effectiveInterval,
          requestedInterval: interval,
          bar: latestBar,
          series: bars,
          index: bars.length - 1,
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
        price: latestBar.close,
        timestamp: latestBar.timestamp
      });

      const snapshot = snapshotPortfolio(portfolio, latestBar.close);
      const record = {
        timestamp: latestBar.timestamp,
        marketData: marketData.meta,
        latestBar,
        decision,
        trade,
        portfolio: snapshot
      };

      console.log(JSON.stringify(record, null, 2));

      if (outputPath) {
        const absolutePath = path.resolve(outputPath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, JSON.stringify(record, null, 2), "utf8");
      }

      seenBars.add(latestBar.timestamp);
    }

    await sleep(pollSeconds * 1000);
  }
}
