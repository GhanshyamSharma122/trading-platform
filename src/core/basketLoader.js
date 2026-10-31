import fs from "node:fs/promises";
import path from "node:path";

export async function loadBasket(basketPath) {
  const absolutePath = path.resolve(basketPath);
  const content = await fs.readFile(absolutePath, "utf8");
  const basket = JSON.parse(content);

  if (!basket || !Array.isArray(basket.symbols) || basket.symbols.length === 0) {
    throw new Error(`Basket at ${absolutePath} must contain a non-empty "symbols" array.`);
  }

  return {
    name: basket.name ?? path.basename(absolutePath, path.extname(absolutePath)),
    weighting: basket.weighting ?? "equal",
    minSuccessfulSymbols: Number(basket.minSuccessfulSymbols ?? 5),
    symbols: basket.symbols.map((symbol) => String(symbol).trim()).filter(Boolean),
    path: absolutePath
  };
}
