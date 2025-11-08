const express = require('express')
const cors =require("cors")
require("dotenv").config();
const app = express()
const port = 3000

app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require("firebase-admin");
const serviceAccount = require("./3d-model-admin-sdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tadlde2.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    await client.connect();

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send(`Assignment Server listening on port ${port}`)
})

app.listen(port, () => {
  console.log(`Assignment Server listening on port ${port}`)
})
