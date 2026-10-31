export default {
  name: "simple-template-strategy",

  async onBar({ bar, series, position, helpers }) {
    const closes = series.map((item) => item.close);
    const sma10 = helpers.sma(closes, 10);
    const latestSma = sma10.at(-1);

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
  }
};
