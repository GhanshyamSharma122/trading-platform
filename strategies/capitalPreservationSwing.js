function movingAverageIsRising(series, lookback = 3) {
  if (series.length <= lookback) {
    return false;
  }

  const current = series.at(-1);
  const past = series.at(-1 - lookback);
  return current !== null && past !== null && current > past;
}

function highestClose(bars, lookback) {
  if (bars.length < lookback) {
    return null;
  }

  return bars
    .slice(-lookback)
    .reduce((highest, bar) => Math.max(highest, bar.close), Number.NEGATIVE_INFINITY);
}

function averageVolume(bars, lookback) {
  if (bars.length < lookback) {
    return null;
  }

  const window = bars.slice(-lookback);
  const total = window.reduce((sum, bar) => sum + (bar.volume ?? 0), 0);
  return total / lookback;
}

function weekKey(timestamp) {
  const date = new Date(timestamp);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function computePositionSize({ cash, entryPrice, stopPrice, riskFraction, maxCapitalFraction }) {
  const riskPerShare = entryPrice - stopPrice;
  if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) {
    return 0;
  }

  const riskBudget = cash * riskFraction;
  const capitalBudget = cash * maxCapitalFraction;
  const maxByRisk = Math.floor(riskBudget / riskPerShare);
  const maxByCapital = Math.floor(capitalBudget / entryPrice);

  return Math.max(0, Math.min(maxByRisk, maxByCapital));
}

function readNumberEnv(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default {
  name: "capital-preservation-swing",

  async onStart({ state }) {
    state.riskFraction = readNumberEnv("SWING_RISK_FRACTION", 0.01);
    state.maxCapitalFraction = readNumberEnv("SWING_MAX_CAPITAL_FRACTION", 0.5);
    state.stopLossPct = readNumberEnv("SWING_STOP_LOSS_PCT", 0.03);
    state.targetRMultiple = readNumberEnv("SWING_TARGET_R", 2);
    state.breakoutLookback = readNumberEnv("SWING_BREAKOUT_LOOKBACK", 8);
    state.volumeLookback = readNumberEnv("SWING_VOLUME_LOOKBACK", 20);
    state.volumeMultiplier = readNumberEnv("SWING_VOLUME_MULTIPLIER", 1);
    state.cooldownBars = readNumberEnv("SWING_COOLDOWN_BARS", 3);
    state.maxLosingTradesPerWeek = readNumberEnv("SWING_MAX_WEEKLY_LOSSES", 3);
    state.exitSmaPeriod = readNumberEnv("SWING_EXIT_SMA_PERIOD", 10);
    state.swingLowLookback = readNumberEnv("SWING_SWING_LOW_LOOKBACK", 5);
    state.cooldownRemaining = 0;
    state.currentWeek = null;
    state.weeklyLossCount = 0;
    state.activeTrade = null;
    state.processedTrades = 0;
  },

  async onBar({ bar, series, portfolio, position, state, helpers }) {
    state.cooldownRemaining = Math.max((state.cooldownRemaining ?? 0) - 1, 0);

    const barWeek = weekKey(bar.timestamp);
    if (state.currentWeek !== barWeek) {
      state.currentWeek = barWeek;
      state.weeklyLossCount = 0;
    }

    if (portfolio.trades.length > state.processedTrades) {
      const latestTrade = portfolio.trades.at(-1);
      state.processedTrades = portfolio.trades.length;

      if (latestTrade?.action === "sell") {
        if ((latestTrade.realizedPnL ?? 0) < 0) {
          state.weeklyLossCount += 1;
          state.cooldownRemaining = state.cooldownBars;
        }

        state.activeTrade = null;
      }
    }

    const closes = series.map((item) => item.close);
    const sma20 = helpers.sma(closes, 20);
    const sma50 = helpers.sma(closes, 50);
    const exitSma = helpers.sma(closes, state.exitSmaPeriod);
    const sma20Now = sma20.at(-1);
    const sma50Now = sma50.at(-1);
    const exitSmaNow = exitSma.at(-1);

    if (position.quantity > 0 && state.activeTrade) {
      if (bar.close <= state.activeTrade.stopPrice || bar.close >= state.activeTrade.targetPrice) {
        return { action: "sell", quantity: "all" };
      }

      if (exitSmaNow !== null && bar.close < exitSmaNow) {
        return { action: "sell", quantity: "all" };
      }

      return { action: "hold" };
    }

    if (series.length < 55) {
      return { action: "hold" };
    }

    if (state.cooldownRemaining > 0 || state.weeklyLossCount >= state.maxLosingTradesPerWeek) {
      return { action: "hold" };
    }

    if (sma20Now === null || sma50Now === null) {
      return { action: "hold" };
    }

    const trendAligned =
      bar.close > sma20Now &&
      bar.close > sma50Now &&
      sma20Now > sma50Now &&
      movingAverageIsRising(sma20, 3) &&
      movingAverageIsRising(sma50, 3);

    if (!trendAligned) {
      return { action: "hold" };
    }

    const priorBars = series.slice(0, -1);
    const breakoutLevel = highestClose(priorBars, state.breakoutLookback);
    const volumeAverage = averageVolume(priorBars, state.volumeLookback);

    if (breakoutLevel === null || volumeAverage === null) {
      return { action: "hold" };
    }

    const volumeConfirmed = (bar.volume ?? 0) >= volumeAverage * state.volumeMultiplier;
    if (bar.close <= breakoutLevel || !volumeConfirmed) {
      return { action: "hold" };
    }

    const recentSwingLow = priorBars
      .slice(-state.swingLowLookback)
      .reduce((lowest, current) => Math.min(lowest, current.low), Number.POSITIVE_INFINITY);

    const stopFromPct = bar.close * (1 - state.stopLossPct);
    const stopPrice = Math.max(stopFromPct, recentSwingLow);
    const quantity = computePositionSize({
      cash: portfolio.cash,
      entryPrice: bar.close,
      stopPrice,
      riskFraction: state.riskFraction,
      maxCapitalFraction: state.maxCapitalFraction
    });

    if (quantity <= 0) {
      return { action: "hold" };
    }

    const riskPerShare = bar.close - stopPrice;
    state.activeTrade = {
      entryPrice: bar.close,
      stopPrice,
      targetPrice: bar.close + (riskPerShare * state.targetRMultiple)
    };

    return { action: "buy", quantity };
  },

  async onFinish({ symbol, portfolio }) {
    console.log(
      `[capital-preservation-swing] ${symbol}: trades=${portfolio.trades.length}, realizedPnL=${portfolio.realizedPnL.toFixed(2)}, endingEquity=${portfolio.equity.toFixed(2)}`
    );
  }
};
