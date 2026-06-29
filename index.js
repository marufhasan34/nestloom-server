const express = require("express");
const app = express();
const port = 5000;
const cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))

const verifyToken = async (req,res,next) => {
  const authHeader = req.headers.authorization;


if(!authHeader || !authHeader.startsWith('Bearer')) {
  return res.status(401).json({msg: 'unauthorized'})
}

const token = authHeader.split(' ')[1]

if(!token){
  return res.status(401).json({msg: 'unauthorized'})
}

try {
  const {payload} = await jwtVerify(token,JWKS)
  req.user = payload

  next()
}catch(error){
   console.log(error)
   return res.status(401).json({msg: 'unauthorized'})
}

}

const ownerVerify = async (req,res,next) => {
  const user = req.user;
  if(user.role !=='owner' || user.plan != 'pro'){
    return res.status(403).json({msg: 'Forbidden'})
  }
  next()
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("nestloom_db");
    const propertyCollection = database.collection("property");
    const subscriptionsCollection = database.collection("subscriptions");
   const userCollection = database.collection("user"); 


    await subscriptionsCollection.createIndex({ sessionId: 1 }, { unique: true });
    

    app.post("/subscription", async (req, res) => {
      const { sessionId, userId, priceId } = req.body;

      const isExist = await subscriptionsCollection.findOne({sessionId})
      if(isExist){
        return res.json({msg: 'Already Exist!'})
      }
      await subscriptionsCollection.insertOne({
        sessionId,
        userId,
        priceId,
      });

      await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: "pro" } },
      );

      res.json({ msg: "Payment successful!" });
    });

    app.get("/api/property", async (req, res) => {
      const query = {};
      if (req.query.myPropertyId) {
        query.myPropertyId = req.query.myPropertyId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = await propertyCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/api/property", verifyToken , ownerVerify ,async (req, res) => {
      const property = req.body;
      const result = await propertyCollection.insertOne({...property, userId: req.user.id});
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );  
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
