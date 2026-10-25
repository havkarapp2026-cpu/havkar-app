function unavailable() {
  throw new Error("HOT Wallet is not enabled in HAVKAR.");
}

const HOT = {
  request: unavailable
};

module.exports = { HOT };
