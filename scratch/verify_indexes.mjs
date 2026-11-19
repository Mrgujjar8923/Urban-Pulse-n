import mongoose from "mongoose";

const uri = "mongodb://127.0.0.1:27017/govai_demo";

async function run() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const collection = db.collection("complaints");

    console.log("=== ACTUAL MONGODB INDEXES ON 'complaints' COLLECTION ===");
    const indexes = await collection.indexes();
    console.log(JSON.stringify(indexes, null, 2));

    console.log("\n=== HISTORICAL RECORD CHECK ===");
    const totalCount = await collection.countDocuments();
    const nullOrMissingCount = await collection.countDocuments({
      $or: [{ clientRequestId: null }, { clientRequestId: { $exists: false } }]
    });
    const stringCount = await collection.countDocuments({
      clientRequestId: { $type: "string" }
    });

    console.log(`Total complaints: ${totalCount}`);
    console.log(`Complaints with null or missing clientRequestId: ${nullOrMissingCount}`);
    console.log(`Complaints with string clientRequestId: ${stringCount}`);

    console.log("\n=== CHECK FOR DUPLICATE NON-NULL clientRequestId ===");
    const duplicates = await collection.aggregate([
      { $match: { clientRequestId: { $type: "string" } } },
      { $group: { _id: "$clientRequestId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log(`Duplicates found: ${duplicates.length}`);
    if (duplicates.length > 0) {
      console.log(JSON.stringify(duplicates, null, 2));
    }

  } finally {
    await mongoose.disconnect();
  }
}

run().catch(console.error);
