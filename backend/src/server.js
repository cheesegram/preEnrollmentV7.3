import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import studentsRoutes from "./routes/studentsRoutes.js";
import curriculumRoutes from "./routes/curriculumRoutes.js";
import sectionsRoutes from "./routes/sectionsRoutes.js";
import { connectDB } from "./config/db.js";
import rateLimiter from "./middleware/rateLimiter.js";

import dns from "node:dns/promises";

dns.setServers(["1.1.1.1", "1.0.0.1"]);

dotenv.config();


const app = express();
const PORT = process.env.PORT || 5001;
const __dirname = path.resolve();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/students", studentsRoutes);
app.use("/api/curriculum", curriculumRoutes);
app.use("/api/sections", sectionsRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server started on PORT:", PORT);
  });
});
