// Test helper: technicians must have an approved ID to receive requests; approve the seeded demo ones.
module.exports = async function approveSeedIds() {
  const store = require('../server/core/store');
  await store.init();
  const db = await store.getDb();
  for (const t of await db.technicians.getAll()) await db.technicians.update(t.id, { idStatus: 'approved', verified: true });
};
