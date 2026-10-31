import fs from "node:fs/promises";
import path from "node:path";

const TIME_SERIES_MAP = {
  daily: {
    fn: "TIME_SERIES_DAILY",
    key: "Time Series (Daily)"
  },
  weekly: {
    fn: "TIME_SERIES_WEEKLY_ADJUSTED",
    key: "Weekly Adjusted Time Series"
  },
  monthly: {
    fn: "TIME_SERIES_MONTHLY_ADJUSTED",
    key: "Monthly Adjusted Time Series"
  }
};

const INTRADAY_INTERVALS = new Set(["1min", "5min", "15min", "30min", "60min"]);

function toNumber(value) {
  return Number.parseFloat(value);
}

function normalizeBar(timestamp, raw) {
  return {
    timestamp,
    open: toNumber(raw["1. open"]),
    high: toNumber(raw["2. high"]),
    low: toNumber(raw["3. low"]),
    close: toNumber(raw["4. close"]),
    volume: toNumber(raw["6. volume"] ?? raw["5. volume"] ?? 0)
  };
}

function sanitizePart(value) {
  return String(value ?? "na").replace(/[^a-z0-9._-]+/giu, "_");
}

function isRecoverableProviderError(error) {
  const message = String(error?.message ?? "");
  return (
    message.includes("Alpha Vantage rate limit:") ||
    message.includes("Alpha Vantage information:") ||
    message.includes("fetch failed")
  );
}

export class AlphaVantageClient {
  constructor({ apiKey, baseUrl }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.cacheRoot = path.resolve("data-cache");
  }

  buildRequestDetails({
    symbol,
    interval = "daily",
    outputSize = "compact",
    adjusted,
    extendedHours,
    month,
    entitlement
  }) {
    const url = new URL(this.baseUrl);

    if (INTRADAY_INTERVALS.has(interval)) {
      url.searchParams.set("function", "TIME_SERIES_INTRADAY");
      url.searchParams.set("interval", interval);
      url.searchParams.set("outputsize", outputSize);
      url.searchParams.set("datatype", "json");

      if (typeof adjusted === "boolean") {
        url.searchParams.set("adjusted", String(adjusted));
      }

      if (typeof extendedHours === "boolean") {
        url.searchParams.set("extended_hours", String(extendedHours));
      }

      if (month) {
        url.searchParams.set("month", month);
      }

      if (entitlement) {
        url.searchParams.set("entitlement", entitlement);
      }
    } else {
      const config = TIME_SERIES_MAP[interval];

      if (!config) {
        throw new Error(`Unsupported interval: ${interval}`);
      }

      url.searchParams.set("function", config.fn);
      url.searchParams.set("outputsize", outputSize);
      url.searchParams.set("datatype", "json");

      if (entitlement) {
        url.searchParams.set("entitlement", entitlement);
      }
    }

    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", this.apiKey);

    const seriesKey = INTRADAY_INTERVALS.has(interval)
      ? `Time Series (${interval})`
      : TIME_SERIES_MAP[interval].key;

    return { url, seriesKey };
  }

  async fetchTimeSeries(request) {
    const { symbol, interval = "daily" } = request;
    const { url, seriesKey } = this.buildRequestDetails(request);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Alpha Vantage request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (payload.Note) {
      throw new Error(`Alpha Vantage rate limit: ${payload.Note}`);
    }

    if (payload.Information) {
      throw new Error(`Alpha Vantage information: ${payload.Information}`);
    }

    if (payload["Error Message"]) {
      throw new Error(`Alpha Vantage error: ${payload["Error Message"]}`);
    }

    const rawSeries = payload[seriesKey];
    if (!rawSeries) {
      throw new Error(`Time series data missing from Alpha Vantage response for ${symbol}`);
    }

    const bars = Object.entries(rawSeries)
      .map(([timestamp, raw]) => normalizeBar(timestamp, raw))
      .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

    return {
      bars,
      meta: {
        source: "api",
        fallbackUsed: false,
        requestedInterval: interval,
        effectiveInterval: interval,
        request
      }
    };
  }

  async writeCache(request, response) {
    const cachePath = this.getCachePath(request);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(response, null, 2), "utf8");
  }

  async readCache(request) {
    const cachePath = this.getCachePath(request);
    const content = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(content);

    return {
      ...parsed,
      meta: {
        ...(parsed.meta ?? {}),
        source: "cache",
        fallbackUsed: true,
        cachePath
      }
    };
  }

  getCachePath({ symbol, interval = "daily", outputSize = "compact", month, entitlement }) {
    const filename = [
      sanitizePart(symbol),
      sanitizePart(interval),
      sanitizePart(outputSize),
      sanitizePart(month ?? "latest"),
      sanitizePart(entitlement ?? "historical")
    ].join("__");

    return path.join(this.cacheRoot, `${filename}.json`);
  }

  async getTimeSeries(request) {
    const response = await this.fetchTimeSeries(request);
    await this.writeCache(request, response);
    return response.bars;
  }

  async getTimeSeriesWithFallback(request, { fallback = "auto" } = {}) {
    try {
      const response = await this.fetchTimeSeries(request);
      await this.writeCache(request, response);
      return response;
    } catch (error) {
      if (fallback === "none") {
        throw error;
      }

      const exactCacheResult =
        (fallback === "auto" || fallback === "cache") && isRecoverableProviderError(error)
          ? await this.tryReadCache(request)
          : null;

      if (exactCacheResult) {
        exactCacheResult.meta.reason = error.message;
        exactCacheResult.meta.fallbackTarget = "exact-cache";
        return exactCacheResult;
      }

      if (
        INTRADAY_INTERVALS.has(request.interval) &&
        (fallback === "auto" || fallback === "daily") &&
        isRecoverableProviderError(error)
      ) {
        const dailyRequest = {
          symbol: request.symbol,
          interval: "daily",
          outputSize: request.outputSize
        };

        try {
          const dailyResponse = await this.fetchTimeSeries(dailyRequest);
          await this.writeCache(dailyRequest, dailyResponse);
          return {
            ...dailyResponse,
            meta: {
              ...dailyResponse.meta,
              fallbackUsed: true,
              requestedInterval: request.interval,
              effectiveInterval: "daily",
              fallbackTarget: "daily-api",
              reason: error.message
            }
          };
        } catch (dailyError) {
          const cachedDaily = await this.tryReadCache(dailyRequest);
          if (cachedDaily) {
            cachedDaily.meta.requestedInterval = request.interval;
            cachedDaily.meta.effectiveInterval = "daily";
            cachedDaily.meta.fallbackTarget = "daily-cache";
            cachedDaily.meta.reason = `${error.message}; ${dailyError.message}`;
            return cachedDaily;
          }

          throw dailyError;
        }
      }

      throw error;
    }
  }

  async tryReadCache(request) {
    try {
      return await this.readCache(request);
    } catch {
      return null;
    }
  }
}
