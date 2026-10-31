export default {
  name: "buy-and-hold",
  async onBar({ index, position }) {
    if (index === 0 && position.quantity === 0) {
      return { action: "buy", quantity: 10 };
    }

    return { action: "hold" };
  }
};
