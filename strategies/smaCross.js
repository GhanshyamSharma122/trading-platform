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

    if (fastPrev !== null && slowPrev !== null && fastPrev <= slowPrev && fastNow > slowNow && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    if (fastPrev !== null && slowPrev !== null && fastPrev >= slowPrev && fastNow < slowNow && position.quantity > 0) {
      return { action: "sell", quantity: "all" };
    }

    return { action: "hold" };
  }
};
