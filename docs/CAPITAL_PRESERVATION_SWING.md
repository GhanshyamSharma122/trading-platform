# Capital Preservation Swing Strategy

This strategy is built for small-account daily swing trading where survival matters more than speed.

It is meant for:

- cash equities
- daily bars
- starting capital around `10000`
- single-symbol backtests or normalized basket backtests

It is not meant to promise `10x` returns. It is meant to enforce rules that reduce account blow-ups.

## Rules

Entry:

- price closes above `20 SMA` and `50 SMA`
- `20 SMA` is above `50 SMA`
- both moving averages are rising
- today closes above the previous `5` bars' highest close
- today volume is at least equal to the previous `20` bars' average volume

Risk and sizing:

- risk per trade = `1%` of available cash
- max capital deployed per entry = `50%` of available cash
- initial stop = tighter of:
  - `4%` below entry
  - recent `5`-bar swing low

Exit:

- sell all if close hits stop
- sell all if close reaches `2R` target
- sell all if close falls back below `20 SMA`

Safety brakes:

- after a losing trade, wait `3` bars before the next entry
- stop taking new entries after `3` losing trades in the same week

Current default values after local optimization:

- `SWING_BREAKOUT_LOOKBACK=8`
- `SWING_STOP_LOSS_PCT=0.03`
- `SWING_TARGET_R=2`
- `SWING_VOLUME_MULTIPLIER=1`
- `SWING_MAX_CAPITAL_FRACTION=0.5`
- `SWING_EXIT_SMA_PERIOD=10`

## Tunable Parameters

The strategy reads these optional environment variables:

- `SWING_BREAKOUT_LOOKBACK`
- `SWING_STOP_LOSS_PCT`
- `SWING_TARGET_R`
- `SWING_VOLUME_MULTIPLIER`
- `SWING_MAX_CAPITAL_FRACTION`
- `SWING_EXIT_SMA_PERIOD`
- `SWING_VOLUME_LOOKBACK`
- `SWING_COOLDOWN_BARS`
- `SWING_MAX_WEEKLY_LOSSES`
- `SWING_SWING_LOW_LOOKBACK`

## File

- Strategy: [capitalPreservationSwing.js](C:/Users/shyam/OneDrive/Desktop/trading platform/strategies/capitalPreservationSwing.js)

## Example Commands

Single-symbol backtest with `10000` cash:

```bash
node src/cli.js backtest --symbol RELIANCE.BSE --interval daily --strategy ./strategies/capitalPreservationSwing.js --cash 10000 --fallback cache
```

Basket backtest on included India large-caps:

```bash
node src/cli.js basket-backtest --basket ./baskets/verified-india-largecaps.json --strategy ./strategies/capitalPreservationSwing.js --cash 10000 --interval daily --fallback cache
```

## Important Limitation

The engine executes on bar close only. That means stop-loss and target behavior here are simulated at the close of the bar, not intraday tick-by-tick.

## Optimization

Run the local parameter sweep on cached data:

```bash
npm run optimize:swing
```

It writes the ranked results to:

- [capital-preservation-optimization.json](C:/Users/shyam/OneDrive/Desktop/trading platform/runs/capital-preservation-optimization.json)
