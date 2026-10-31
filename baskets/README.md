# Basket Files

Basket files define a group of symbols for `basket-backtest`.

## File Format

Example:

```json
{
  "name": "nifty50-top10-proxy",
  "weighting": "equal",
  "minSuccessfulSymbols": 3,
  "symbols": [
    "RELIANCE.BSE",
    "TCS.BSE",
    "INFY.BSE"
  ]
}
```

## Fields

- `name`: display name for the basket
- `weighting`: currently informational; `equal` is the intended mode
- `minSuccessfulSymbols`: minimum number of symbols that must load for the basket run to continue
- `symbols`: ordered list of Alpha Vantage symbols

## Notes

- Symbol order matters when you use `--limit-symbols`.
- Put the most reliable symbols first.
- For Indian market testing in this project, `.BSE` symbols are currently the most practical default.
- Basket series are synthetic and normalized from constituent prices. They are suitable for testing strategies, not for exact index replication.

## Commands

Run a basket backtest:

```bash
node src/cli.js basket-backtest --basket ./baskets/nifty50.json --strategy ./strategies/smaCross.js
```

Run a faster basket backtest:

```bash
node src/cli.js basket-backtest --basket ./baskets/nifty50-top10.json --strategy ./strategies/smaCross.js --limit-symbols 5
```

Run a curated verified basket:

```bash
node src/cli.js basket-backtest --basket ./baskets/verified-india-largecaps.json --strategy ./strategies/smaCross.js
```

## Included Baskets

- `nifty50.json`: broad NIFTY 50 proxy basket
- `nifty50-top10.json`: smaller NIFTY 50 proxy for faster runs
- `verified-india-largecaps.json`: only symbols explicitly verified in this workspace against Alpha Vantage
