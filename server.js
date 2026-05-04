const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const compression = require("compression");
require("dotenv").config();

const app = express();

// =======================
// Performance Middlewares
// =======================
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(compression());

// =======================
// MongoDB Connection (WITH STATUS LOG)
// =======================
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ourmarket", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
})
.then(() => {
  console.log("🟢 MongoDB CONNECTED ✔");
})
.catch(err => {
  console.log("🔴 MongoDB CONNECTION FAILED ❌");
  console.error(err.message);
});

// =======================
// Cloudinary Config
// =======================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =======================
// Cloudinary Connection TEST (LOG STYLE)
// =======================
cloudinary.api.ping()
  .then(() => {
    console.log("🟢 Cloudinary CONNECTED ✔");
  })
  .catch((err) => {
    console.log("🔴 Cloudinary CONNECTION FAILED ❌");
    console.error(err.message);
  });

// =======================
// User Schema
// =======================
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phone: { type: String, unique: true, index: true },
  location: String,
  password: String,
  image: String,
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// =======================
// Multer (memory storage)
// =======================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// =======================
// Upload helper
// =======================
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "users" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

// =======================
// REGISTER ROUTE
// =======================
app.post("/api/register", upload.single("image"), async (req, res) => {
  try {
    const { firstName, lastName, phone, location, password } = req.body;

    const existingUser = await User.findOne({ phone }).lean();
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let imageUrl = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      imageUrl = result.secure_url;
    }

    const user = await User.create({
      firstName,
      lastName,
      phone,
      location,
      password: hashedPassword,
      image: imageUrl,
    });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "SECRET_KEY",
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      message: "User registered successfully",
      token,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// LOGIN ROUTE
// =======================
app.post("/api/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "SECRET_KEY",
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});