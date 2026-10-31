export function sma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) {
      return null;
    }

    const slice = values.slice(index - period + 1, index + 1);
    const sum = slice.reduce((total, value) => total + value, 0);
    return sum / period;
  });
}

export function ema(values, period) {
  const multiplier = 2 / (period + 1);
  const result = [];
  let previous = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (index + 1 < period) {
      result.push(null);
      continue;
    }

    if (previous === null) {
      const seed = values.slice(index - period + 1, index + 1);
      previous = seed.reduce((total, item) => total + item, 0) / period;
      result.push(previous);
      continue;
    }

    previous = (value - previous) * multiplier + previous;
    result.push(previous);
  }

  return result;
}

export function rsi(values, period = 14) {
  const result = new Array(values.length).fill(null);

  if (values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return result;
}

export const helpers = { sma, ema, rsi };
