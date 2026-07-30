import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in environment variables");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MONGODB CONNECTED SUCCESSFULLY!");
  } catch (error) {
    if (error?.code === 8000) {
      console.error("MongoDB Atlas authentication failed (code 8000).");
      console.error("Verify DB username/password, then update backend/.env MONGO_URI with a fresh Atlas connection string.");
      console.error("If the password has special characters, URL-encode it (example: @ -> %40).\n");
    }

    console.error("Error connecting to MONGODB", error);
    process.exit(1); // exit with failure
  }
};
