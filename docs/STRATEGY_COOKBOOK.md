# Strategy Cookbook

This file contains ready-to-adapt strategy patterns.

Use these as templates, not as finished trading systems.

## 1. First Bar Entry

```js
export default {
  name: "first-bar-entry",
  async onBar({ index, position }) {
    if (index === 0 && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    return { action: "hold" };
  }
};
```

## 2. Simple SMA Trend Filter

```js
export default {
  name: "sma-trend-filter",
  async onBar({ series, position, helpers }) {
    if (series.length < 20) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const sma20 = helpers.sma(closes, 20).at(-1);

    if (sma20 === null) {
      return { action: "hold" };
    }

    if (closes.at(-1) > sma20 && position.quantity === 0) {
      return { action: "buy", quantity: 5 };
    }

    if (closes.at(-1) < sma20 && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## 3. SMA Crossover

```js
export default {
  name: "sma-crossover",
  async onBar({ series, position, helpers }) {
    if (series.length < 20) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const fast = helpers.sma(closes, 5);
    const slow = helpers.sma(closes, 20);

    const fastPrev = fast.at(-2);
    const slowPrev = slow.at(-2);
    const fastNow = fast.at(-1);
    const slowNow = slow.at(-1);

    if (fastPrev !== null && slowPrev !== null && fastPrev <= slowPrev && fastNow > slowNow && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    if (fastPrev !== null && slowPrev !== null && fastPrev >= slowPrev && fastNow < slowNow && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## 4. RSI Pullback Entry

```js
export default {
  name: "rsi-pullback",
  async onBar({ series, position, helpers }) {
    if (series.length < 20) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const rsi = helpers.rsi(closes, 14).at(-1);

    if (rsi === null) {
      return { action: "hold" };
    }

    if (rsi < 30 && position.quantity === 0) {
      return { action: "buy", quantity: 5 };
    }

    if (rsi > 60 && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## 5. Cooldown Strategy

```js
export default {
  name: "cooldown-strategy",
  async onBar({ series, position, state, helpers }) {
    state.cooldown = Math.max((state.cooldown ?? 0) - 1, 0);

    if (series.length < 10) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const sma10 = helpers.sma(closes, 10).at(-1);

    if (sma10 === null) {
      return { action: "hold" };
    }

    if (position.quantity === 0 && state.cooldown === 0 && closes.at(-1) > sma10) {
      return { action: "buy", quantity: 3 };
    }

    if (position.quantity > 0 && closes.at(-1) < sma10) {
      state.cooldown = 5;
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## 6. Intraday-Only Guard

```js
export default {
  name: "intraday-only",
  async onBar({ interval, requestedInterval }) {
    if (interval !== requestedInterval) {
      return { action: "hold" };
    }

    if (interval !== "5min") {
      return { action: "hold" };
    }

    return { action: "hold" };
  }
};
```

## 7. Basket-Compatible Trend Follower

```js
export default {
  name: "basket-trend",
  async onBar({ series, position, helpers }) {
    if (series.length < 30) {
      return { action: "hold" };
    }

    const closes = series.map((bar) => bar.close);
    const sma30 = helpers.sma(closes, 30).at(-1);

    if (sma30 === null) {
      return { action: "hold" };
    }

    if (closes.at(-1) > sma30 && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    if (closes.at(-1) < sma30 && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## How To Use This Cookbook

- start from the closest pattern
- keep the first version simple
- test on daily data first
- add one rule at a time
- log values while you tune the logic
