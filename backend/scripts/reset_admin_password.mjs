import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "node:readline";

dotenv.config({ override: true });

const TARGET_EMAIL = "admin@govai.gov";
const TARGET_DATABASE = "govai";

const ask = (question, hidden = false) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (!hidden) {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    return;
  }

  process.stdout.write(question);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  let answer = "";
  const onData = (chunk) => {
    const key = chunk.toString();
    if (key === "\n" || key === "\r" || key === "\u0004") {
      process.stdin.setRawMode?.(false);
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
      return;
    }
    if (key === "\u0003") {
      process.stdin.setRawMode?.(false);
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      process.exit(130);
    }
    if (key === "\u007f") {
      answer = answer.slice(0, -1);
      return;
    }
    answer += key;
  };
  process.stdin.on("data", onData);
});

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

let connection;
try {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  if ((process.env.MONGO_DB_NAME || TARGET_DATABASE) !== TARGET_DATABASE) {
    throw new Error(`Refusing to run outside database ${TARGET_DATABASE}`);
  }

  connection = await mongoose.connect(process.env.MONGO_URI, {
    dbName: TARGET_DATABASE,
    serverSelectionTimeoutMS: 10000,
  });

  const users = connection.connection.db.collection("users");
  const matches = await users.find(
    { email: TARGET_EMAIL },
    { projection: { email: 1, role: 1, status: 1 } }
  ).toArray();

  if (matches.length !== 1 || matches[0].role !== "admin" || matches[0].status !== "active") {
    throw new Error("Refusing to reset: target account scope or state is not exactly as expected");
  }

  console.log(`Target database: ${connection.connection.name}`);
  console.log(`Target email: ${TARGET_EMAIL}`);
  console.log(`Target role: ${matches[0].role}`);
  console.log("Exact field to be changed: password hash");
  const confirmation = await ask("Type RESET ADMIN PASSWORD to continue: ");
  if (confirmation !== "RESET ADMIN PASSWORD") {
    console.log("Reset cancelled; no database changes were made.");
    process.exitCode = 0;
  } else {
    const password = await ask("New password (input hidden): ", true);
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await users.updateOne(
      { _id: matches[0]._id, email: TARGET_EMAIL, role: "admin", status: "active" },
      { $set: { password: passwordHash } }
    );
    if (result.modifiedCount !== 1) throw new Error("Password update did not modify exactly one account");
    const updated = await users.findOne({ _id: matches[0]._id }, { projection: { password: 1 } });
    if (!updated?.password || !(await bcrypt.compare(password, updated.password))) {
      throw new Error("Post-update bcrypt verification failed");
    }
    console.log("Admin password reset and bcrypt verification succeeded.");
  }
} catch (error) {
  fail(`Password reset failed: ${error.message}`);
} finally {
  if (connection) await connection.disconnect();
}
