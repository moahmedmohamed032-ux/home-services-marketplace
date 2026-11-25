// In-memory persistence backend (local development and tests). Implements the
// primitive CRUD surface that store.js builds its business logic on.
const { buildDataset } = require('./dataset');

let data = null;

async function init() {
  if (data) return;
  data = buildDataset();
}

const strip = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

const table = (name) => ({
  getAll: async () => strip(data[name]),
  getById: async (id) => strip(data[name].find((r) => r.id === id)),
  insert: async (row) => { data[name].push(row); return strip(row); },
  update: async (id, patch) => {
    const row = data[name].find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    return strip(row);
  },
  remove: async (id) => {
    const i = data[name].findIndex((r) => r.id === id);
    if (i === -1) return false;
    data[name].splice(i, 1);
    return true;
  },
});

module.exports = {
  init,
  nextId: async (prefix) => data.nextId(prefix),
  users: table('users'),
  technicians: table('technicians'),
  bookings: table('bookings'),
  invoices: table('invoices'),
};
