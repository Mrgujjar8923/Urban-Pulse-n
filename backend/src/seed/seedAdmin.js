import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Member } from "../models/Member.js";

const ADMIN_EMAIL = "admin@govai.gov";
const ADMIN_NAME = "GovAI Admin";
const ADMIN_PASSWORD = "admin123";
const DEMO_USERS = [
  {
    name: "Demo Citizen",
    email: "citizen.demo@govai.gov",
    password: "citizen123",
    role: "citizen",
    status: "active",
  },
  {
    name: "Road Infrastructure Demo Officer",
    email: "road.demo@govai.gov",
    password: "roadDemo123",
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  },
  {
    name: "Water Supply Demo Officer",
    email: "water.demo@govai.gov",
    password: "waterDemo123",
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
  },
  {
    name: "Electricity Demo Officer",
    email: "electricity.demo@govai.gov",
    password: "electricityDemo123",
    role: "department",
    department: "Electricity",
    departmentRole: "officer",
    status: "active",
  },
  {
    name: "Environment Demo Officer",
    email: "environment.demo@govai.gov",
    password: "environmentDemo123",
    role: "department",
    department: "Environment",
    departmentRole: "officer",
    status: "active",
  },
  {
    name: "Road & Infrastructure Authority",
    email: "road.authority@govai.gov",
    password: "roadAuthority123",
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "authority",
    status: "active",
  },
  {
    name: "Water Supply Authority",
    email: "water.authority@govai.gov",
    password: "waterAuthority123",
    role: "department",
    department: "Water Supply",
    departmentRole: "authority",
    status: "active",
  },
];

const reconcileDemoUser = async (userData) => {
  const existing = await User.findOne({ email: userData.email });

  if (!existing) {
    await User.create(userData);
    console.log(`User created: ${userData.email}`);
    return;
  }

  existing.name = userData.name;
  existing.role = userData.role;
  existing.department = userData.department;
  existing.departmentRole = userData.departmentRole || (userData.role === "department" ? "officer" : undefined);
  existing.status = userData.status;
  existing.password = userData.password;
  await existing.save();
  console.log(`Demo user reconciled: ${userData.email}`);
};

(async () => {
  try {
    await connectDB();

    const admin = await User.findOne({ email: ADMIN_EMAIL });
    if (!admin) {
      await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "admin",
        status: "active",
      });
      console.log(`User created: ${ADMIN_EMAIL}`);
    } else {
      console.log(`User already exists: ${ADMIN_EMAIL}`);
    }

    const citizen = await User.findOne({ email: "citizen.demo@govai.gov" });
    if (!citizen) {
      await User.create(DEMO_USERS[0]);
      console.log(`User created: ${DEMO_USERS[0].email}`);
    } else {
      console.log(`User already exists: ${DEMO_USERS[0].email}`);
    }

    for (const userData of DEMO_USERS.slice(1)) {
      await reconcileDemoUser(userData);
      const officerUser = await User.findOne({ email: userData.email });
      if (officerUser && userData.departmentRole !== "authority") {
        let member = await Member.findOne({ userId: officerUser._id });
        if (!member) {
          member = await Member.findOne({ department: officerUser.department, name: officerUser.name });
          if (member) {
            member.userId = officerUser._id;
            await member.save();
            console.log(`Linked existing member ${member.name} to user ${officerUser.email}`);
          } else {
            await Member.create({
              name: officerUser.name,
              department: officerUser.department,
              userId: officerUser._id,
              createdBy: admin?._id,
            });
            console.log(`Created linked member for officer ${officerUser.email}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("Demo user seed failed", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
