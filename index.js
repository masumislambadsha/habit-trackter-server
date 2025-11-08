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
        console.error("Error fetching featured habits:", error);
        res.status(500).send({ error: "Failed to fetch featured habits" });
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
