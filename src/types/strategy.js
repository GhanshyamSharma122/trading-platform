/**
 * @typedef {Object} StrategyBar
 * @property {string} timestamp
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 */

/**
 * @typedef {Object} PositionSnapshot
 * @property {number} quantity
 * @property {number} averagePrice
 * @property {number} marketValue
 * @property {number} unrealizedPnL
 */

/**
 * @typedef {Object} TradeRecord
 * @property {"buy"|"sell"} action
 * @property {number} quantity
 * @property {number} price
 * @property {string} timestamp
 * @property {number=} realizedPnL
 */

/**
 * @typedef {Object} PortfolioSnapshot
 * @property {number} cash
 * @property {number} equity
 * @property {number} realizedPnL
 * @property {PositionSnapshot} position
 * @property {TradeRecord[]} trades
 */

/**
 * @typedef {Object} IndicatorHelpers
 * @property {(values: number[], period: number) => Array<number|null>} sma
 * @property {(values: number[], period: number) => Array<number|null>} ema
 * @property {(values: number[], period?: number) => Array<number|null>} rsi
 */

/**
 * @typedef {Object} StrategyContext
 * @property {"backtest"|"paper"} mode
 * @property {string} symbol
 * @property {string} interval
 * @property {string} requestedInterval
 * @property {StrategyBar} bar
 * @property {StrategyBar[]} series
 * @property {number} index
 * @property {PositionSnapshot} position
 * @property {PortfolioSnapshot} portfolio
 * @property {Record<string, any>} state
 * @property {IndicatorHelpers} helpers
 */

/**
 * @typedef {Object} StrategyStartContext
 * @property {string} symbol
 * @property {string} interval
 * @property {string} requestedInterval
 * @property {"backtest"|"paper"} mode
 * @property {Record<string, any>} state
 */

/**
 * @typedef {Object} StrategyFinishContext
 * @property {"backtest"|"paper"} mode
 * @property {string} symbol
 * @property {string} interval
 * @property {string} requestedInterval
 * @property {Record<string, any>} state
 * @property {PortfolioSnapshot} portfolio
 */

/**
 * @typedef {Object} StrategyDecision
 * @property {"buy"|"sell"|"hold"} action
 * @property {number|"all"=} quantity
 */

/**
 * @typedef {Object} TradingStrategy
 * @property {string=} name
 * @property {(context: StrategyStartContext) => Promise<void>|void=} onStart
 * @property {(context: StrategyContext) => Promise<StrategyDecision|void>|StrategyDecision|void} onBar
 * @property {(context: StrategyFinishContext) => Promise<void>|void=} onFinish
 */

export {};
