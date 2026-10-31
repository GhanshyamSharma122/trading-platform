function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export function createPortfolio({ symbol, startingCash }) {
  return {
    symbol,
    cash: roundMoney(startingCash),
    position: {
      quantity: 0,
      averagePrice: 0
    },
    equity: roundMoney(startingCash),
    realizedPnL: 0,
    trades: []
  };
}

export function snapshotPortfolio(portfolio, marketPrice) {
  const marketValue = portfolio.position.quantity * marketPrice;
  return {
    cash: roundMoney(portfolio.cash),
    equity: roundMoney(portfolio.cash + marketValue),
    realizedPnL: roundMoney(portfolio.realizedPnL),
    position: {
      quantity: portfolio.position.quantity,
      averagePrice: roundMoney(portfolio.position.averagePrice),
      marketValue: roundMoney(marketValue),
      unrealizedPnL: roundMoney(
        portfolio.position.quantity * (marketPrice - portfolio.position.averagePrice)
      )
    },
    trades: [...portfolio.trades]
  };
}

export function executeOrder({ portfolio, action, quantity, price, timestamp }) {
  const normalizedQuantity =
    quantity === "all" ? portfolio.position.quantity : Math.max(0, Number(quantity ?? 0));

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0 || !price) {
    return null;
  }

  if (action === "buy") {
    const totalCost = normalizedQuantity * price;
    if (totalCost > portfolio.cash) {
      return null;
    }

    const existingCostBasis = portfolio.position.averagePrice * portfolio.position.quantity;
    const newQuantity = portfolio.position.quantity + normalizedQuantity;
    const newCostBasis = existingCostBasis + totalCost;

    portfolio.cash = roundMoney(portfolio.cash - totalCost);
    portfolio.position.quantity = newQuantity;
    portfolio.position.averagePrice = newCostBasis / newQuantity;

    const trade = {
      action,
      quantity: normalizedQuantity,
      price: roundMoney(price),
      timestamp
    };
    portfolio.trades.push(trade);
    return trade;
  }

  if (action === "sell") {
    const quantityToSell = Math.min(portfolio.position.quantity, normalizedQuantity);
    if (quantityToSell <= 0) {
      return null;
    }

    const proceeds = quantityToSell * price;
    const realized = quantityToSell * (price - portfolio.position.averagePrice);

    portfolio.cash = roundMoney(portfolio.cash + proceeds);
    portfolio.realizedPnL = roundMoney(portfolio.realizedPnL + realized);
    portfolio.position.quantity -= quantityToSell;

    if (portfolio.position.quantity === 0) {
      portfolio.position.averagePrice = 0;
    }

    const trade = {
      action,
      quantity: quantityToSell,
      price: roundMoney(price),
      timestamp,
      realizedPnL: roundMoney(realized)
    };
    portfolio.trades.push(trade);
    return trade;
  }

  return null;
}
