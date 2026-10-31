# Alpha Trading Platform

Node.js trading platform for:

- Alpha Vantage market data
- single-symbol backtests
- basket backtests
- paper trading
- user-written Node.js strategies

The implementation follows the Alpha Vantage model documented in `api_docs.txt`.

## Requirements

- Node.js 18+
- an Alpha Vantage API key

## Quick Start

1. Copy `.env.example` to `.env`
2. Set `ALPHAVANTAGE_API_KEY`
3. Create a strategy:

```bash
node src/cli.js create-strategy --name myStrategy
```

4. Run a backtest:

```bash
node src/cli.js backtest --symbol IBM --interval daily --strategy ./strategies/myStrategy.js
```

The generated strategy file is:

```text
strategies/myStrategy.js
```

If you use VS Code, the generated file uses JSDoc types for autocomplete.

## Common Commands

Create a typed strategy:

```bash
node src/cli.js create-strategy --name myStrategy
```

Fetch data:

```bash
node src/cli.js data --symbol IBM --interval daily
node src/cli.js data --symbol MSFT --interval 5min --entitlement delayed --month 2026-03 --full
```

Run a single-symbol backtest:

```bash
node src/cli.js backtest --symbol IBM --interval daily --strategy ./strategies/smaCross.js
```

Run a basket backtest:

```bash
node src/cli.js basket-backtest --basket ./baskets/nifty50.json --strategy ./strategies/smaCross.js --limit-symbols 5
```

Start paper trading:

```bash
node src/cli.js paper --symbol IBM --interval daily --strategy ./strategies/buyAndHold.js
```

Show CLI help:

```bash
node src/cli.js --help
```

## Strategy Writing

Start here:

- [docs/STRATEGY_SDK.md](C:/Users/shyam/OneDrive/Desktop/trading platform/docs/STRATEGY_SDK.md)
- [docs/STRATEGY_COOKBOOK.md](C:/Users/shyam/OneDrive/Desktop/trading platform/docs/STRATEGY_COOKBOOK.md)
- [docs/RISK_CONTROLS.md](C:/Users/shyam/OneDrive/Desktop/trading platform/docs/RISK_CONTROLS.md)

Starter files:

- [template.strategy.js](C:/Users/shyam/OneDrive/Desktop/trading platform/strategies/template.strategy.js)
- [simpleTemplate.strategy.js](C:/Users/shyam/OneDrive/Desktop/trading platform/strategies/simpleTemplate.strategy.js)
- [strategy.js](C:/Users/shyam/OneDrive/Desktop/trading platform/src/types/strategy.js)

## Basket Files

Included basket definitions:

- [nifty50.json](C:/Users/shyam/OneDrive/Desktop/trading platform/baskets/nifty50.json)
- [nifty50-top10.json](C:/Users/shyam/OneDrive/Desktop/trading platform/baskets/nifty50-top10.json)
- [verified-india-largecaps.json](C:/Users/shyam/OneDrive/Desktop/trading platform/baskets/verified-india-largecaps.json)
- [README.md](C:/Users/shyam/OneDrive/Desktop/trading platform/baskets/README.md)

## Data Options

These options work across `data`, `backtest`, and `paper`:

- `--entitlement delayed|realtime`
- `--month YYYY-MM`
- `--adjusted true|false`
- `--extended-hours true|false`
- `--full`
- `--fallback auto|cache|daily|none`

Fallback behavior:

- exact request first
- exact cache next
- daily API next for intraday failures
- daily cache last

Backtest/data responses report:

- `intervalRequested`
- `intervalUsed`
- `marketData`

## Project Layout

- `src/cli.js`: command entry point
- `src/lib/alphaVantageClient.js`: Alpha Vantage client, cache, fallback
- `src/core/backtestEngine.js`: single-symbol backtests
- `src/core/basketBacktestEngine.js`: synthetic basket backtests
- `src/core/paperTrader.js`: simulated paper trading
- `src/core/strategyLoader.js`: strategy loader
- `src/types/strategy.js`: JSDoc strategy types
- `strategies/`: starter and sample strategies
- `baskets/`: basket definitions
- `docs/`: strategy docs

## Notes

- This is a simulation framework, not brokerage execution.
- The default daily flow uses the free `TIME_SERIES_DAILY` endpoint.
- Intraday delayed/realtime access depends on your Alpha Vantage plan.
- Intraday fallback is for testing continuity, not precise execution.
