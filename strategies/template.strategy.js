/**
 * Typed starter strategy for VS Code / JSDoc-aware editors.
 *
 * @typedef {import("../src/types/strategy.js").TradingStrategy} TradingStrategy
 * @typedef {import("../src/types/strategy.js").StrategyStartContext} StrategyStartContext
 * @typedef {import("../src/types/strategy.js").StrategyContext} StrategyContext
 * @typedef {import("../src/types/strategy.js").StrategyFinishContext} StrategyFinishContext
 */

/** @type {TradingStrategy} */
const strategy = {
  name: "template-strategy",

  /**
   * @param {StrategyStartContext} context
   */
  async onStart({ symbol, interval, requestedInterval, mode, state }) {
    state.lastSeenPrice = null;
    console.log(
      `Starting strategy for ${symbol}. mode=${mode}, interval=${interval}, requested=${requestedInterval}`
    );
  },

  /**
   * @param {StrategyContext} context
   */
  async onBar({ bar, series, position, state, helpers, interval, requestedInterval }) {
    const closes = series.map((item) => item.close);
    const sma10 = helpers.sma(closes, 10);
    const latestSma = sma10.at(-1);

    state.lastSeenPrice = bar.close;

    if (requestedInterval !== interval) {
      return { action: "hold" };
    }

    if (latestSma === null) {
      return { action: "hold" };
    }

    if (bar.close > latestSma && position.quantity === 0) {
      return { action: "buy", quantity: 1 };
    }

    if (bar.close < latestSma && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  },

  /**
   * @param {StrategyFinishContext} context
   */
  async onFinish({ portfolio, state }) {
    console.log("Finished strategy run.");
    console.log(JSON.stringify({ portfolio, state }, null, 2));
  }
};

export default strategy;
