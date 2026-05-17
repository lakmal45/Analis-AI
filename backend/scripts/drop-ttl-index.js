/**
 * Drop the TTL index on the signals collection.
 *
 * The old schema had:
 *   SignalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
 *
 * MongoDB does NOT remove TTL indexes automatically when you change the
 * schema.  Run this script once to remove it:
 *
 *   node scripts/drop-ttl-index.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI not set in .env");
  process.exit(1);
}

const TTL_INDEX_NAME = "expiresAt_1";
const COLLECTION_NAME = "signals";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;
  const collection = db.collection(COLLECTION_NAME);

  const indexes = await collection.indexes();
  const ttlIndex = indexes.find(
    (idx) => idx.name === TTL_INDEX_NAME && idx.expireAfterSeconds !== undefined,
  );

  if (!ttlIndex) {
    console.log(`No TTL index named "${TTL_INDEX_NAME}" found — nothing to drop.`);
  } else {
    console.log(`Found TTL index: ${JSON.stringify(ttlIndex)}`);
    await collection.dropIndex(TTL_INDEX_NAME);
    console.log(`✅ Dropped TTL index "${TTL_INDEX_NAME}" successfully.`);
  }

  // Also clear expiresAt on any existing COMPLETED/CANCELLED signals
  const clearResult = await collection.updateMany(
    { status: { $in: ["COMPLETED", "CANCELLED"] }, expiresAt: { $ne: null } },
    { $set: { expiresAt: null } },
  );
  console.log(`Cleared expiresAt on ${clearResult.modifiedCount} resolved signal(s).`);

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
