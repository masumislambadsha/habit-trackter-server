const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

// index.js
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: [
      "https://habit-tracker-54432.web.app",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);
app.use(express.json());

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: "Unauthorized – no token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user_uid = decoded.uid;
    req.user_email = decoded.email;
    req.user_name = decoded.name || decoded.displayName;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

function calculateStreak(history) {
  if (!history?.length) return 0;
  const dates = [...history].map((d) => new Date(d)).sort((a, b) => b - a);
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]);
    d.setHours(0, 0, 0, 0);
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    if (d.getTime() === expected.getTime()) streak++;
    else break;
  }
  return streak;
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tadlde2.mongodb.net/habitTracker?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let habitsCollection;

async function run() {
  const db = client.db("habitTracker");
      habitsCollection = db.collection("public_habits");
      console.log("MongoDB connected");

      app.get("/", (req, res) => res.send(`API Running on ${PORT}`));

  // lastest 6 doc api
  app.get("/habits/featured", async (req, res) => {
    try {
      const data = await habitsCollection
        .find({ public: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // all havit api
  app.get("/habits/public", async (req, res) => {
    const { search, category, limit = 100 } = req.query;
    let query = { public: true };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (category) query.category = category;
    try {
      const data = await habitsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .toArray();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // myhabit api
  app.get("/habits/my", verifyFirebaseToken, async (req, res) => {
    try {
      const userId = req.user_uid;
      const result = await habitsCollection.find({ userId }).toArray();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // detailed habit api
  app.get("/habits/:id", async (req, res) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid habit ID" });
      }
      const doc = await habitsCollection.findOne({
        _id: ObjectId.createFromHexString(id),
      });
      doc ? res.json(doc) : res.status(404).json({ error: "Not found" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // post habit api
  app.post("/habits", verifyFirebaseToken, async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        reminderTime,
        image,
        userName,
        userEmail,
        public: isPublic,
      } = req.body;

      const userId = req.user_uid;

      if (!title || !description || !category)
        return res.status(400).json({ message: "Missing required fields" });

      const newHabit = {
        title,
        description,
        category,
        reminderTime: reminderTime || "09:00",
        image: image || "",
        userName: userName || req.user_name || "User",
        userEmail: userEmail || req.user_email,
        userId: userId,
        public: isPublic ?? true,
        completionHistory: [],
        streak: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { insertedId } = await habitsCollection.insertOne(newHabit);
      res
        .status(201)
        .json({ success: true, habit: { _id: insertedId, ...newHabit } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // update habit api
  app.patch("/habits/:id", verifyFirebaseToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: "Invalid ID" });

      const userId = req.user_uid;
      const habit = await habitsCollection.findOne({
        _id: ObjectId.createFromHexString(id),
      });

      if (!habit) return res.status(404).json({ error: "Not found" });
      if (habit.userId !== userId)
        return res.status(403).json({ error: "Forbidden" });

      const { title, description, category, reminderTime, image } = req.body;

      const update = {
        $set: {
          ...(title && { title: title.trim() }),
          ...(description && { description: description.trim() }),
          ...(category && { category: category.trim() }),
          ...(reminderTime && { reminderTime }),
          ...(image !== undefined && { image: image.trim() }), // keep empty string if cleared
          updatedAt: new Date(),
        },
      };

      await habitsCollection.updateOne(
        { _id: ObjectId.createFromHexString(id) },
        update
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // delete habit api
  app.delete("/habits/:id", verifyFirebaseToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: "Invalid ID" });

      const userId = req.user_uid;
      const habit = await habitsCollection.findOne({
        _id: ObjectId.createFromHexString(id),
      });

      if (!habit) return res.status(404).json({ error: "Not found" });
      if (habit.userId !== userId)
        return res.status(403).json({ error: "Forbidden" });

      await habitsCollection.deleteOne({
        _id: ObjectId.createFromHexString(id),
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // habit completation api
  app.patch("/habits/:id/complete", verifyFirebaseToken, async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: "Invalid ID" });

      const userId = req.user_uid;
      const habit = await habitsCollection.findOne({
        _id: ObjectId.createFromHexString(id),
      });

      if (!habit) return res.status(404).json({ error: "Habit not found" });
      if (habit.userId !== userId)
        return res.status(403).json({ error: "Only Publisher Can Modify" });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const already = habit.completionHistory.some((d) => {
        const cd = new Date(d);
        cd.setHours(0, 0, 0, 0);
        return cd.getTime() === today.getTime();
      });

      if (already)
        return res.status(400).json({ error: "Already completed today" });

      const newHistory = [...habit.completionHistory, new Date()];
      const newStreak = calculateStreak(newHistory);

      await habitsCollection.updateOne(
        { _id: ObjectId.createFromHexString(id) },
        {
          $set: {
            completionHistory: newHistory,
            streak: newStreak,
            updatedAt: new Date(),
          },
        }
      );

      res.json({
        success: true,
        completionHistory: newHistory,
        streak: newStreak,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // analytic api
  app.get("/habits/analytics/user", verifyFirebaseToken, async (req, res) => {
    try {
      const userId = req.user_uid;
      const habits = await habitsCollection.find({ userId }).toArray();
      const last30 = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const completed = habits.filter((h) =>
          h.completionHistory.some((c) => {
            const cd = new Date(c);
            cd.setHours(0, 0, 0, 0);
            return cd.getTime() === d.getTime();
          })
        ).length;
        last30.unshift({ date: d.toLocaleDateString(), completed });
      }
      const totalCompletions = habits.reduce(
        (s, h) => s + h.completionHistory.length,
        0
      );
      const maxStreak = Math.max(
        0,
        ...habits.map((h) => calculateStreak(h.completionHistory))
      );
      res.json({
        last30DaysData: last30,
        totalCompletions,
        maxStreak,
        totalHabits: habits.length,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
run()
  .then(() => {
    app.get("/", (req, res) => res.send("3d-models-hub-server running"));
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
