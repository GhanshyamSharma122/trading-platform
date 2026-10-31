import path from "node:path";
import { pathToFileURL } from "node:url";

/** @returns {Promise<import("../types/strategy.js").TradingStrategy & {path: string}>} */
export async function loadStrategy(strategyPath) {
  const absolutePath = path.resolve(strategyPath);
  const strategyModule = await import(pathToFileURL(absolutePath).href);
  /** @type {import("../types/strategy.js").TradingStrategy} */
  const strategy = strategyModule.default ?? strategyModule.strategy ?? strategyModule;

  if (!strategy || typeof strategy.onBar !== "function") {
    throw new Error(`Strategy at ${absolutePath} must export an object with an onBar(context) function.`);
  }

  return {
    name: strategy.name ?? path.basename(absolutePath),
    onBar: strategy.onBar,
    onStart: strategy.onStart ?? null,
    onFinish: strategy.onFinish ?? null,
    path: absolutePath
  };
}
