import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set in environment variables");
  }
  const databaseName = process.env.MONGO_DB_NAME || "govai";
  const isAllowedTestDb =
    (process.env.NODE_ENV === "test" || process.env.ALLOW_TEST_DB === "true") &&
    databaseName.startsWith("govai_");

  if (databaseName !== "govai" && !isAllowedTestDb) {
    throw new Error(`Refusing to start with unexpected MongoDB database "${databaseName}"`);
  }

  try {
    await mongoose.connect(uri, {
      dbName: databaseName,
      serverSelectionTimeoutMS: 10000,
      autoIndex: process.env.AUTO_INDEX === "true",
    });
    console.log("MongoDB connected");
    console.log({
      host: mongoose.connection.host,
      database: mongoose.connection.name,
      readyState: mongoose.connection.readyState,
      actualDatabase: mongoose.connection.db.databaseName,
    });
  } catch (error) {
    console.error("MongoDB connection error", error.message);
    throw error;
  }
};
