import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { AlphaVantageClient } from "./lib/alphaVantageClient.js";
import { loadStrategy } from "./core/strategyLoader.js";
import { runBacktest } from "./core/backtestEngine.js";

const SYMBOLS = [
  "HDFCBANK.BSE",
  "ICICIBANK.BSE",
  "INFY.BSE",
  "ITC.BSE",
  "RELIANCE.BSE",
  "TCS.BSE"
];

const PARAM_GRID = {
  breakoutLookback: [3, 5, 8],
  stopLossPct: [0.03, 0.04, 0.05],
  targetR: [1.5, 2, 2.5],
  volumeMultiplier: [0.9, 1],
  maxCapitalFraction: [0.5, 0.75],
  exitSmaPeriod: [10, 20]
};

function buildVariants(grid) {
  const entries = Object.entries(grid);
  const variants = [];

  function walk(index, current) {
    if (index === entries.length) {
      variants.push({ ...current });
      return;
    }

    const [key, values] = entries[index];
    for (const value of values) {
      current[key] = value;
      walk(index + 1, current);
    }
  }

  walk(0, {});
  return variants;
}

function toEnv(config) {
  return {
    SWING_BREAKOUT_LOOKBACK: String(config.breakoutLookback),
    SWING_STOP_LOSS_PCT: String(config.stopLossPct),
    SWING_TARGET_R: String(config.targetR),
    SWING_VOLUME_MULTIPLIER: String(config.volumeMultiplier),
    SWING_MAX_CAPITAL_FRACTION: String(config.maxCapitalFraction),
    SWING_EXIT_SMA_PERIOD: String(config.exitSmaPeriod)
  };
}

function scoreResult(results) {
  const totalReturnPct = results.reduce((sum, item) => sum + item.stats.returnPct, 0);
  const averageReturnPct = totalReturnPct / results.length;
  const totalTrades = results.reduce((sum, item) => sum + item.stats.totalTrades, 0);
  const averageDrawdownPct =
    results.reduce((sum, item) => sum + item.stats.maxDrawdownPct, 0) / results.length;
  const winners = results.filter((item) => item.stats.returnPct > 0).length;

  return {
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    averageReturnPct: Number(averageReturnPct.toFixed(2)),
    totalTrades,
    averageDrawdownPct: Number(averageDrawdownPct.toFixed(2)),
    winners,
    score: Number((totalReturnPct - (averageDrawdownPct * 2)).toFixed(2))
  };
}

async function runVariant({ client, strategyPath, variant }) {
  const restore = new Map();

  for (const [key, value] of Object.entries(toEnv(variant))) {
    restore.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    const strategy = await loadStrategy(strategyPath);
    const results = [];

    for (const symbol of SYMBOLS) {
      const result = await runBacktest({
        client,
        symbol,
        interval: "daily",
        strategy,
        startingCash: 10000,
        outputSize: "compact",
        dataOptions: {},
        fallback: "cache"
      });

      results.push(result);
    }

    return {
      params: variant,
      summary: scoreResult(results),
      symbols: results.map((result) => ({
        symbol: result.symbol,
        endingEquity: result.stats.endingEquity,
        returnPct: result.stats.returnPct,
        maxDrawdownPct: result.stats.maxDrawdownPct,
        totalTrades: result.stats.totalTrades
      }))
    };
  } finally {
    for (const [key, value] of restore.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  const config = loadConfig();
  const client = new AlphaVantageClient(config);
  const strategyPath = path.resolve("strategies/capitalPreservationSwing.js");
  const variants = buildVariants(PARAM_GRID);
  const ranked = [];

  for (const variant of variants) {
    const result = await runVariant({ client, strategyPath, variant });
    ranked.push(result);
  }

  ranked.sort((left, right) => right.summary.score - left.summary.score);

  const output = {
    strategy: "capital-preservation-swing",
    cash: 10000,
    symbols: SYMBOLS,
    variantsTested: ranked.length,
    best: ranked.slice(0, 10)
  };

  const outputPath = path.resolve("runs/capital-preservation-optimization.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
