# Strategy Writing Guide

This guide explains how to write strategy files for this trading platform.

It covers:

- the strategy file format
- the lifecycle callbacks
- the data you receive on each bar
- how orders are interpreted
- how to use built-in indicators
- how fallback and basket runs affect your strategy
- practical patterns for writing safer strategies

## Quick Start

Generate a new typed strategy:

```bash
node src/cli.js create-strategy --name myStrategy
```

That creates:

```text
strategies/myStrategy.js
```

You can also create a strategy manually like this:

```js
export default {
  name: "my-strategy",

  async onBar({ index, position }) {
    if (index === 0 && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    return { action: "hold" };
  }
};
```

Run it:

```bash
node src/cli.js backtest --symbol IBM --interval daily --strategy ./strategies/myStrategy.js
```

## Strategy File Format

Your strategy must be a Node.js ES module and should export a default object.

Best starting point:

- use `node src/cli.js create-strategy --name myStrategy`
- edit the generated file in `strategies/`

Minimal shape:

```js
export default {
  name: "my-strategy",
  async onBar(context) {
    return { action: "hold" };
  }
};
```

Full shape:

```js
export default {
  name: "my-strategy",

  async onStart(context) {},

  async onBar(context) {
    return { action: "hold" };
  },

  async onFinish(context) {}
};
```

Rules:

- `onBar` is required
- `onStart` is optional
- `onFinish` is optional
- `name` is optional but recommended

If `name` is omitted, the loader uses the file name.

## Lifecycle

### `onStart(context)`

Called once before processing begins.

Use it to:

- initialize custom state
- print startup information
- precompute configuration

Context fields:

- `symbol`
- `interval`
- `requestedInterval`
- `mode`
- `state`

Example:

```js
export default {
  name: "startup-example",
  async onStart({ symbol, interval, requestedInterval, mode, state }) {
    state.tradeCount = 0;
    console.log(`Starting ${mode} for ${symbol}. interval=${interval}, requested=${requestedInterval}`);
  },
  async onBar() {
    return { action: "hold" };
  }
};
```

### `onBar(context)`

Called for every bar.

- In `backtest` mode, it runs once for each historical bar.
- In `paper` mode, it runs once for each newly-seen bar.

This is where your signal generation logic belongs.

### `onFinish(context)`

Called once after a backtest completes.

Use it to:

- print summaries
- export custom metrics
- inspect final strategy state

Context fields:

- `mode`
- `symbol`
- `interval`
- `requestedInterval`
- `state`
- `portfolio`

## `onBar(context)` in Detail

The platform passes this object into `onBar`:

- `mode`
- `symbol`
- `interval`
- `requestedInterval`
- `bar`
- `series`
- `index`
- `position`
- `portfolio`
- `state`
- `helpers`

### `mode`

Either:

- `"backtest"`
- `"paper"`

### `symbol`

The active symbol or basket name.

Examples:

- `IBM`
- `RELIANCE.BSE`
- `nifty50-proxy`

### `interval`

The actual interval being used by the engine.

Examples:

- `daily`
- `5min`
- `weekly`

Important:

- `interval` is the real interval your strategy is receiving
- if fallback changes the feed, `interval` may differ from the CLI request

### `requestedInterval`

The original interval requested by the CLI.

This matters when fallback is active.

Example:

- You request `5min`
- Alpha Vantage intraday access fails
- the platform falls back to daily cached data
- `requestedInterval` is `"5min"`
- `interval` is `"daily"`

If your strategy depends on true intraday behavior, check this explicitly.

### `bar`

The current OHLCV bar:

```js
{
  timestamp: "2026-03-23",
  open: 246.5,
  high: 251.35,
  low: 244.7101,
  close: 248.44,
  volume: 4972008
}
```

### `series`

All bars from the beginning of the run up to the current bar, inclusive.

Typical usage:

```js
const closes = series.map((bar) => bar.close);
const highs = series.map((bar) => bar.high);
const lows = series.map((bar) => bar.low);
```

### `index`

Zero-based index of the current bar.

Useful for:

- first-bar initialization
- warm-up guards
- custom rolling logic

### `position`

Current position snapshot:

```js
{
  quantity: 10,
  averagePrice: 312.57,
  marketValue: 2484.4,
  unrealizedPnL: -641.3
}
```

Use `position.quantity` to check whether you are already long.

### `portfolio`

Full portfolio snapshot:

```js
{
  cash: 6874.3,
  equity: 9358.7,
  realizedPnL: 0,
  position: {
    quantity: 10,
    averagePrice: 312.57,
    marketValue: 2484.4,
    unrealizedPnL: -641.3
  },
  trades: [
    {
      action: "buy",
      quantity: 10,
      price: 312.57,
      timestamp: "2025-10-28"
    }
  ]
}
```

Use it for:

- checking cash before attempting larger orders
- reading realized PnL
- looking at previous trades

### `state`

`state` is a mutable plain object that persists across callbacks during a run.

This is the correct place to store strategy memory.

Example:

```js
export default {
  name: "state-example",
  async onBar({ state }) {
    state.barCount = (state.barCount ?? 0) + 1;
    return { action: "hold" };
  }
};
```

Good uses for `state`:

- counting bars
- cooldown timers
- remembering whether a crossover already triggered
- storing previous indicator values
- collecting custom diagnostics

Avoid using module-level globals for strategy memory.

### `helpers`

Built-in indicator helpers:

- `helpers.sma(values, period)`
- `helpers.ema(values, period)`
- `helpers.rsi(values, period = 14)`

All helpers return arrays aligned to the input length.

For bars that do not have enough history yet, they return `null`.

Example:

```js
const closes = series.map((bar) => bar.close);
const sma20 = helpers.sma(closes, 20);
const latestSma = sma20.at(-1);

if (latestSma === null) {
  return { action: "hold" };
}
```

## What Your Strategy Can Return

Your `onBar` function should return one of these shapes:

```js
{ action: "buy", quantity: 10 }
{ action: "sell", quantity: 5 }
{ action: "sell", quantity: "all" }
{ action: "hold" }
```

### Supported actions

- `buy`
- `sell`
- `hold`

### Quantity rules

- quantity must be numeric for standard buy/sell
- `"all"` is valid only for sell orders
- invalid quantities are ignored by the engine

### Execution rules

- orders execute at the current bar's `close`
- buys are ignored if there is not enough cash
- sells are capped to current position size
- invalid or missing actions behave like `hold`

This engine is long-only right now.

There is no short selling, leverage, slippage model, or commission model yet.

## Warm-Up Handling

Many strategies need enough history before indicators are meaningful.

Always guard against insufficient history.

Bad:

```js
const sma20 = helpers.sma(closes, 20);
if (bar.close > sma20.at(-1)) {
  return { action: "buy", quantity: 5 };
}
```

Better:

```js
if (series.length < 20) {
  return { action: "hold" };
}

const sma20 = helpers.sma(closes, 20);
const latestSma = sma20.at(-1);

if (latestSma === null) {
  return { action: "hold" };
}
```

## Common Patterns

### 1. Buy-and-hold

```js
export default {
  name: "buy-and-hold",
  async onBar({ index, position }) {
    if (index === 0 && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    return { action: "hold" };
  }
};
```

### 2. Moving average crossover

```js
export default {
  name: "sma-cross",
  async onBar({ series, position, helpers }) {
    if (series.length < 20) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const fast = helpers.sma(closes, 5);
    const slow = helpers.sma(closes, 20);

    const fastNow = fast.at(-1);
    const slowNow = slow.at(-1);
    const fastPrev = fast.at(-2);
    const slowPrev = slow.at(-2);

    if (fastPrev <= slowPrev && fastNow > slowNow && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    if (fastPrev >= slowPrev && fastNow < slowNow && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

### 3. Cooldown after selling

```js
export default {
  name: "cooldown-example",
  async onBar({ series, position, state, helpers }) {
    state.cooldown = Math.max((state.cooldown ?? 0) - 1, 0);

    if (series.length < 20) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const sma10 = helpers.sma(closes, 10).at(-1);

    if (sma10 === null) {
      return { action: "hold" };
    }

    if (position.quantity === 0 && state.cooldown === 0 && closes.at(-1) > sma10) {
      return { action: "buy", quantity: 5 };
    }

    if (position.quantity > 0 && closes.at(-1) < sma10) {
      state.cooldown = 5;
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

### 4. Regime-aware strategy with fallback detection

```js
export default {
  name: "intraday-only-example",
  async onBar({ interval, requestedInterval }) {
    if (requestedInterval !== interval) {
      return { action: "hold" };
    }

    if (interval !== "5min") {
      return { action: "hold" };
    }

    return { action: "hold" };
  }
};
```

This matters if you only trust a signal on real intraday bars.

## Basket Strategies

Basket backtests generate a synthetic price series from multiple constituent symbols.

What your strategy sees:

- `symbol` is the basket name, such as `nifty50-proxy`
- `interval` is the basket interval
- bars are synthetic normalized basket bars

What your strategy does not see directly:

- per-constituent raw bars

If you need constituent-level logic, that would require a different engine design.

## Paper Trading Notes

Paper mode:

- polls Alpha Vantage periodically
- runs the strategy on the newest bar only when it changes
- executes simulated trades in memory

Current limitations:

- no broker integration
- no persistent portfolio database
- no commissions or slippage

## Fallback Behavior and Strategy Design

When a request cannot be fulfilled directly:

- the platform may use exact cached data
- or fall back from intraday to daily
- or use cached daily data

Because of that:

- strategies should check `interval` if granularity matters
- strategies should check `requestedInterval` if they care about degradation

Recommended guard:

```js
if (requestedInterval !== interval) {
  console.log(`Skipping because requested ${requestedInterval} but received ${interval}`);
  return { action: "hold" };
}
```

## Running Strategies

### Single-symbol backtest

```bash
node src/cli.js backtest --symbol IBM --interval daily --strategy ./strategies/myStrategy.js
```

### Delayed/historical request

```bash
node src/cli.js backtest --symbol MSFT --interval 5min --strategy ./strategies/myStrategy.js --entitlement delayed --month 2026-03 --full
```

### Basket backtest

```bash
node src/cli.js basket-backtest --basket ./baskets/nifty50.json --strategy ./strategies/myStrategy.js --limit-symbols 5
```

### Paper trading

```bash
node src/cli.js paper --symbol IBM --interval daily --strategy ./strategies/myStrategy.js --poll-seconds 60
```

## Debugging Advice

If a strategy is not doing what you expect:

- print `bar.timestamp`, `bar.close`, and indicator values
- print `interval` and `requestedInterval`
- inspect `position.quantity`
- inspect `state`
- start with a simple deterministic strategy
- test on `daily` before trying intraday

Example:

```js
console.log({
  ts: bar.timestamp,
  close: bar.close,
  qty: position.quantity,
  interval,
  requestedInterval
});
```

## Best Practices

- keep strategy logic deterministic
- use `state` for memory
- guard warm-up periods
- check for `null` indicator values
- keep order sizing simple first
- test on one symbol before moving to baskets
- treat fallback data carefully if your logic assumes intraday granularity

## Reference Files

- `strategies/template.strategy.js`
- `strategies/buyAndHold.js`
- `strategies/smaCross.js`
- `baskets/nifty50.json`
- `baskets/verified-india-largecaps.json`
