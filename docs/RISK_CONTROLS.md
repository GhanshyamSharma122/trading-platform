# Risk Controls Guide

This engine is simple, so risk management logic should usually live inside your strategy.

## What You Can Control Today

Inside a strategy, you can control:

- whether to enter
- whether to exit
- quantity
- cooldown behavior
- fallback acceptance

## What The Engine Does Not Model Yet

- commissions
- slippage
- partial fills
- stop orders at intrabar prices
- short selling
- leverage

Because of that, risk logic here is rule-based and bar-close driven.

## Pattern 1: Max Position Size

```js
export default {
  name: "max-position-size",
  async onBar({ portfolio, position }) {
    const maxShares = 10;

    if (position.quantity >= maxShares) {
      return { action: "hold" };
    }

    const remaining = maxShares - position.quantity;
    const qty = Math.min(2, remaining);

    if (portfolio.cash > 0 && qty > 0) {
      return { action: "buy", quantity: qty };
    }

    return { action: "hold" };
  }
};
```

## Pattern 2: Fixed Fraction Sizing

```js
export default {
  name: "fixed-fraction-sizing",
  async onBar({ bar, portfolio, position }) {
    if (position.quantity > 0) {
      return { action: "hold" };
    }

    const capitalFraction = 0.2;
    const budget = portfolio.cash * capitalFraction;
    const quantity = Math.floor(budget / bar.close);

    if (quantity <= 0) {
      return { action: "hold" };
    }

    return { action: "buy", quantity };
  }
};
```

## Pattern 3: Stop Loss

```js
export default {
  name: "stop-loss-example",
  async onBar({ bar, position }) {
    if (position.quantity === 0) {
      return { action: "hold" };
    }

    const stopLossPct = 0.05;
    const stopPrice = position.averagePrice * (1 - stopLossPct);

    if (bar.close <= stopPrice) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## Pattern 4: Take Profit

```js
export default {
  name: "take-profit-example",
  async onBar({ bar, position }) {
    if (position.quantity === 0) {
      return { action: "hold" };
    }

    const targetPct = 0.1;
    const targetPrice = position.averagePrice * (1 + targetPct);

    if (bar.close >= targetPrice) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## Pattern 5: Stop Loss + Take Profit

```js
export default {
  name: "bracket-exit",
  async onBar({ bar, position }) {
    if (position.quantity === 0) {
      return { action: "hold" };
    }

    const stopPrice = position.averagePrice * 0.95;
    const targetPrice = position.averagePrice * 1.1;

    if (bar.close <= stopPrice || bar.close >= targetPrice) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## Pattern 6: Equity Protection

```js
export default {
  name: "equity-protection",
  async onStart({ state }) {
    state.peakEquity = 0;
  },

  async onBar({ portfolio, position, state }) {
    state.peakEquity = Math.max(state.peakEquity, portfolio.equity);

    const drawdownPct =
      state.peakEquity === 0 ? 0 : (state.peakEquity - portfolio.equity) / state.peakEquity;

    if (drawdownPct > 0.08 && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
```

## Pattern 7: Fallback Refusal

```js
export default {
  name: "fallback-refusal",
  async onBar({ interval, requestedInterval }) {
    if (interval !== requestedInterval) {
      return { action: "hold" };
    }

    return { action: "hold" };
  }
};
```

## Practical Advice

- keep sizing simple first
- use bar-close stops carefully because they are not intrabar fills
- avoid building too many overlapping exit rules at once
- test each control independently
- log your control variables while debugging
