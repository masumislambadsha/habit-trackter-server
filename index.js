const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 5000;

const serviceAccountPath = "./habit-track-admin-sdk.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());

const verifyFirebaseToken = async (req, res, next) => {
  // if (!req.headers.authorization) {
  //   return res.status(401).send({ message: "Unauthorized - No token" });
  // }
  // const token = req.headers.authorization.split(" ")[1];
  // if (!token) {
  //   return res.status(401).send({ message: "Unauthorized - Token missing" });
  // }
  // try {
  //   const userInfo = await admin.auth().verifyIdToken(token);
  //   req.user_uid = userInfo.uid;
  //   req.user_email = userInfo.email;
  //   req.user_name = userInfo.name;
  //   next();
  // } catch (error) {
  //   return res.status(401).send({ message: "Unauthorized - Invalid token" });
  // }
  next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tadlde2.mongodb.net/habitTracker?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("habit tracker server is running");
});

async function run() {
  try {
    const db = client.db("habitTracker");
    const habitsCollection = db.collection("public_habits");

    // featured api
    app.get("/habits/featured", async (req, res) => {
      try {
        const cursor = habitsCollection
          .find({ public: true })
          .sort({ createdAt: -1 })
          .limit(6);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching featured habits:", error);}
    });

    // public api
    app.get("/habits/public", async (req, res) => {
      try {
        const { search, category, limit = 100 } = req.query;
        let query = { public: true };

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }
        if (category) {
          query.category = category;
        }

        const cursor = habitsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .limit(parseInt(limit));
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching public habits:", error);
        res.status(500).send({ error: "Failed to fetch public habits" });
      }
    });

    // single api
    app.get("/habits/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await habitsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!result) {
          return res.status(404).send({ error: "Habit not found" });
        }
        res.send(result);
      } catch (error) {
        console.error("Error fetching habit:", error);
        res.status(500).send({ error: "Failed to fetch habit" });
      }
    });

    // create habit api
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

        if (!title || !description || !category) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const newHabit = {
          title,
          description,
          category,
          reminderTime: reminderTime || "09:00",
          image: image || "",
          userName,
          userEmail,
          userId,
          public: isPublic !== undefined ? isPublic : true,
          completionHistory: [],
          streak: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await habitsCollection.insertOne(newHabit);
        res
          .status(201)
          .send({
            success: true,
            habit: { _id: result.insertedId, ...newHabit },
          });
      } catch (error) {
        console.error("Error creating habit:", error);
        res.status(500).send({ error: "Failed to create habit" });
      }
    });

    // my habit api
    app.get("/habits/my", verifyFirebaseToken, async (req, res) => {
      try {
        const userId = req.user_uid;
        const cursor = habitsCollection
          .find({ userId })
          .sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching user habits:", error);
        res.status(500).send({ error: "Failed to fetch user habits" });
      }
    });

    // update api
    app.patch("/habits/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user_uid;
        const habit = await habitsCollection.findOne({ _id: new ObjectId(id) });

        if (!habit) return res.status(404).send({ error: "Habit not found" });
        if (habit.userId !== userId)
          return res
            .status(403)
            .send({ error: "You can only update your own habits" });

        const { title, description, category, reminderTime, image } = req.body;
        const update = {
          $set: {
            title: title || habit.title,
            description: description || habit.description,
            category: category || habit.category,
            reminderTime: reminderTime || habit.reminderTime,
            image: image !== undefined ? image : habit.image,
            updatedAt: new Date(),
          },
        };

        await habitsCollection.updateOne({ _id: new ObjectId(id) }, update);
        res.send({ success: true, message: "Habit updated successfully" });
      } catch (error) {
        console.error("Error updating habit:", error);
        res.status(500).send({ error: "Failed to update habit" });
      }
    });

    // delete api
    app.delete("/habits/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user_uid;
        const habit = await habitsCollection.findOne({ _id: new ObjectId(id) });

        if (!habit) return res.status(404).send({ error: "Habit not found" });
        if (habit.userId !== userId)
          return res
            .status(403)
            .send({ error: "You can only delete your own habits" });

        await habitsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: true, message: "Habit deleted successfully" });
      } catch (error) {
        console.error("Error deleting habit:", error);
        res.status(500).send({ error: "Failed to delete habit" });
      }
    });

    app.patch("/habits/:id/complete", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const userId = req.user_uid;
        const habit = await habitsCollection.findOne({ _id: new ObjectId(id) });

        if (!habit) return res.status(404).send({ error: "Habit not found" });
        if (habit.userId !== userId)
          return res.status(403).send({ error: "Unauthorized" });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const alreadyCompletedToday = habit.completionHistory.some((date) => {
          const completionDate = new Date(date);
          completionDate.setHours(0, 0, 0, 0);
          return isSameDay(completionDate, today);
        });

        if (alreadyCompletedToday) {
          return res.status(400).send({ error: "Already completed today" });
        }

        const newCompletionHistory = [...habit.completionHistory, new Date()];
        const newStreak = calculateStreak(newCompletionHistory);

        const update = {
          $set: {
            completionHistory: newCompletionHistory,
            streak: newStreak,
            updatedAt: new Date(),
          },
        };

        await habitsCollection.updateOne({ _id: new ObjectId(id) }, update);
        res.send({
          success: true,
          completionHistory: newCompletionHistory,
          streak: newStreak,
        });
      } catch (error) {
        console.error("Error marking habit complete:", error);
        res.status(500).send({ error: "Failed to mark habit complete" });
      }
    });

    // user info api
    app.get("/habits/analytics/user", verifyFirebaseToken, async (req, res) => {
      try {
        const userId = req.user_uid;
        const habits = await habitsCollection.find({ userId }).toArray();

        const last30DaysData = [];
        for (let i = 0; i < 30; i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          date.setHours(0, 0, 0, 0);

          let completedCount = 0;
          habits.forEach((habit) => {
            const completed = habit.completionHistory.some((h) => {
              const completionDate = new Date(h);
              completionDate.setHours(0, 0, 0, 0);
              return isSameDay(completionDate, date);
            });
            if (completed) completedCount++;
          });

          last30DaysData.unshift({
            date: date.toLocaleDateString(),
            completed: completedCount,
          });
        }

        const totalCompletions = habits.reduce(
          (sum, habit) => sum + habit.completionHistory.length,
          0
        );
        const maxStreak = Math.max(
          0,
          ...habits.map((h) => calculateStreak(h.completionHistory))
        );

        res.send({
          last30DaysData,
          totalCompletions,
          maxStreak,
          totalHabits: habits.length,
        });
      } catch (error) {
        console.error("Error fetching analytics:", error);
        res.status(500).send({ error: "Failed to fetch analytics" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("Error in run function:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Visit: http://localhost:${port}`);
});
