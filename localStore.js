const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "local-store.json");

const initialState = {
  products: [],
  orders: [],
};

function readState() {
  try {
    return { ...initialState, ...JSON.parse(fs.readFileSync(dataFile, "utf8")) };
  } catch {
    return { ...initialState };
  }
}

function writeState(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
}

function listProducts() {
  return readState().products.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

function addProduct(product) {
  const state = readState();
  const item = {
    ...product,
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
  };
  state.products.unshift(item);
  writeState(state);
  return item;
}

function updateProduct(id, product) {
  const state = readState();
  const index = state.products.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  state.products[index] = { ...state.products[index], ...product, id };
  writeState(state);
  return state.products[index];
}

function deleteProduct(id) {
  const state = readState();
  const before = state.products.length;
  state.products = state.products.filter((item) => String(item.id) !== String(id));
  writeState(state);
  return state.products.length !== before;
}

function listOrders() {
  return readState().orders.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function addOrder(order) {
  const state = readState();
  const item = {
    ...order,
    id: order.id || `TM-${Date.now()}`,
    date: order.date || new Date().toISOString(),
  };
  state.orders.unshift(item);
  writeState(state);
  return item;
}

function updateOrder(id, order) {
  const state = readState();
  const index = state.orders.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  state.orders[index] = { ...state.orders[index], ...order, id };
  writeState(state);
  return state.orders[index];
}

module.exports = {
  listProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  listOrders,
  addOrder,
  updateOrder,
};
