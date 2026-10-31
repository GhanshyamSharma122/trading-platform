import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { AlphaVantageClient } from "./lib/alphaVantageClient.js";
import { runBacktest } from "./core/backtestEngine.js";
import { runPaperTrader } from "./core/paperTrader.js";
import { loadStrategy } from "./core/strategyLoader.js";
import { loadBasket } from "./core/basketLoader.js";
import { runBasketBacktest } from "./core/basketBacktestEngine.js";

function parseBooleanOption(value, optionName) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`Invalid value for --${optionName}. Use true or false.`);
}

function buildDataOptions(options) {
  const dataOptions = {
    adjusted: parseBooleanOption(options.adjusted, "adjusted"),
    extendedHours: parseBooleanOption(options["extended-hours"], "extended-hours"),
    month: options.month,
    entitlement: options.entitlement,
    fallback: options.fallback ?? "auto"
  };

  if (
    dataOptions.entitlement &&
    !["realtime", "delayed"].includes(String(dataOptions.entitlement).toLowerCase())
  ) {
    throw new Error("Invalid value for --entitlement. Use realtime or delayed.");
  }

  if (dataOptions.entitlement) {
    dataOptions.entitlement = String(dataOptions.entitlement).toLowerCase();
  }

  if (dataOptions.month && !/^\d{4}-\d{2}$/u.test(dataOptions.month)) {
    throw new Error("Invalid value for --month. Use YYYY-MM, for example 2026-03.");
  }

  if (!["auto", "cache", "daily", "none"].includes(String(dataOptions.fallback).toLowerCase())) {
    throw new Error("Invalid value for --fallback. Use auto, cache, daily, or none.");
  }

  dataOptions.fallback = String(dataOptions.fallback).toLowerCase();

  return dataOptions;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[i + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { command, options };
}

function printHelp() {
  console.log(`
Usage:
  node src/cli.js create-strategy --name myStrategy
  node src/cli.js data --symbol IBM --interval daily [--output ./data.json]
  node src/cli.js data --symbol IBM --interval 5min --entitlement delayed --month 2026-03
  node src/cli.js backtest --symbol IBM --interval daily --strategy ./strategies/smaCross.js [--cash 10000]
  node src/cli.js basket-backtest --basket ./baskets/nifty50.json --strategy ./strategies/smaCross.js [--limit-symbols 10]
  node src/cli.js paper --symbol IBM --interval 5min --strategy ./strategies/buyAndHold.js --entitlement delayed [--poll-seconds 60]

Options:
  --name           New strategy file name without extension, for example myStrategy
  --symbol         Market symbol, for example IBM or AAPL
  --interval       daily | weekly | monthly | 1min | 5min | 15min | 30min | 60min
  --strategy       Path to your Node.js strategy file
  --basket         Path to a basket JSON file
  --cash           Starting cash, default 10000
  --output         Optional output path for JSON results
  --poll-seconds   Paper mode polling interval, default 60
  --full           Use Alpha Vantage full output size when supported
  --entitlement    delayed | realtime when supported by Alpha Vantage
  --month          Historical intraday month in YYYY-MM format
  --adjusted       true | false for intraday adjusted prices
  --extended-hours true | false for intraday pre/post market data
  --fallback       auto | cache | daily | none
  --limit-symbols  Restrict basket backtest to the first N symbols in the basket
`);
}

async function maybeWriteJson(outputPath, payload) {
  if (!outputPath) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const absolutePath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote output to ${absolutePath}`);
}

function toStrategyIdentifier(rawName) {
  return String(rawName)
    .trim()
    .replace(/\.js$/iu, "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

async function createStrategyFile(nameOption) {
  if (!nameOption) {
    throw new Error("Missing required option --name");
  }

  const strategyName = toStrategyIdentifier(nameOption);
  if (!strategyName) {
    throw new Error("Invalid strategy name. Use letters, numbers, dashes, or underscores.");
  }

  const templatePath = path.resolve("strategies/template.strategy.js");
  const destinationPath = path.resolve("strategies", `${strategyName}.js`);

  try {
    await fs.access(destinationPath);
    throw new Error(`Strategy file already exists: ${destinationPath}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const template = await fs.readFile(templatePath, "utf8");
  const contents = template.replace(/template-strategy/gu, strategyName);

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.writeFile(destinationPath, contents, "utf8");

  console.log(`Created strategy file at ${destinationPath}`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command || options.help || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "create-strategy") {
    await createStrategyFile(options.name);
    return;
  }

  const symbol = options.symbol;
  const interval = options.interval ?? "daily";
  const dataOptions = buildDataOptions(options);
  const { fallback, ...requestOptions } = dataOptions;

  if (command === "data" || command === "backtest" || command === "paper" || command === "basket-backtest") {
    if (command === "basket-backtest") {
      if (!options.basket) {
        throw new Error("Missing required option --basket");
      }

      if (!options.strategy) {
        throw new Error("Missing required option --strategy");
      }

      const config = loadConfig();
      const client = new AlphaVantageClient(config);
      const basket = await loadBasket(options.basket);
      const strategy = await loadStrategy(options.strategy);
      const results = await runBasketBacktest({
        client,
        basket,
        strategy,
        startingCash: Number(options.cash ?? 10000),
        interval,
        outputSize: options.full ? "full" : "compact",
        dataOptions: requestOptions,
        fallback,
        limitSymbols: options["limit-symbols"] ? Number(options["limit-symbols"]) : undefined
      });

      await maybeWriteJson(options.output, results);
      return;
    }

    if (!symbol) {
      throw new Error("Missing required option --symbol");
    }

    const config = loadConfig();
    const client = new AlphaVantageClient(config);

    if (command === "data") {
      const marketData = await client.getTimeSeriesWithFallback(
        {
          symbol,
          interval,
          outputSize: options.full ? "full" : "compact",
          ...requestOptions
        },
        { fallback }
      );
      await maybeWriteJson(options.output, {
        symbol,
        intervalRequested: interval,
        intervalUsed: marketData.meta.effectiveInterval,
        request: dataOptions,
        marketData: marketData.meta,
        bars: marketData.bars
      });
      return;
    }

    if (command === "backtest") {
      if (!options.strategy) {
        throw new Error("Missing required option --strategy");
      }

      const strategy = await loadStrategy(options.strategy);
      const results = await runBacktest({
        client,
        symbol,
        interval,
        strategy,
        startingCash: Number(options.cash ?? 10000),
        outputSize: options.full ? "full" : "compact",
        dataOptions: requestOptions,
        fallback
      });

      await maybeWriteJson(options.output, results);
      return;
    }

    if (!options.strategy) {
      throw new Error("Missing required option --strategy");
    }

    const strategy = await loadStrategy(options.strategy);
    await runPaperTrader({
      client,
      symbol,
      interval,
      strategy,
      startingCash: Number(options.cash ?? 10000),
      pollSeconds: Number(options["poll-seconds"] ?? 60),
      outputPath: options.output ?? null,
      dataOptions: requestOptions,
      fallback
    });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
