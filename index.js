const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
const formData = require("form-data");
const Mailgun = require("mailgun.js");
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.PRIVATE_API_KEY,
});

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3xfyiqs.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const dbConnect = async () => {
  try {
    client.connect();
    console.log("db connect");
  } catch (error) {
    console.log(error.name, error.message);
  }
};
dbConnect();

// await client.connect();

const userCollection = client.db("survey").collection("users");
const surveyCollection = client.db("survey").collection("surveys");
const paymentCollection = client.db("survey").collection("payment");

app.get("/", (req, res) => {
  res.send("survey is starting...");
});
// survey creation
app.post("/surveys", async (req, res) => {
  const survey = req.body;
  const result = await surveyCollection.insertOne(survey);
  res.send(result);
});
app.get("/surveys", async (req, res) => {
  const result = await surveyCollection.find().toArray();
  res.send(result);
});

app.get("/surveys/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const cursor = await surveyCollection.findOne(query);
  res.send(cursor);
});
app.patch("/surveys/:id", async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;
  //  const updateItem = await surveyCollection.updateOne(id, updateData, {new:true});
  //  const query = {_id:new ObjectId(id)};
  const updateItem = await surveyCollection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: "after" },
    { new: true }
  );
  res.send(updateItem.value);
});

// likecount and dislike count
app.patch("/like/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    await surveyCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: { likeCount: 1 } }
    );

    res.status(200).json({ success: true, message: "like count increase by 1" });
  } catch (error) {
    console.error("Error updating likecount:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
  //  const updateItem = await surveyCollection.updateOne(id, updateData, {new:true});
  //  const query = {_id:new ObjectId(id)};
  // const updateItem = await surveyCollection.findOneAndUpdate(
  //   { _id: new ObjectId(id) },
  //   { $set: updateData },
  //   { returnDocument: "after" },
  //   { new: true }
  // );
  // res.send(updateItem.value);
});

// jwt related api
app.post("/jwt", async (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

// middlewares
const verifyToken = (req, res, next) => {
  // console.log("inside verify token", req.headers);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unaouthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unaouthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// const verifyAdmin = async(req, res, next) => {
//   // const email = req.decoded.email;
//   const email = 'emil@gmail.com'
//   console.log(req.decooded);
//   const query = {email: email};
//   const user = await userCollection.findOne(query);
//   const isAdmin = user?.role === 'admin'|| user?.role === 'surveyor';
//   if(!isAdmin) {
//     return res.status(403).send({ message: "forbidden access" });
//   }
//   next();
// }

app.get("/users", verifyToken, async (req, res) => {
  // console.log(req.headers);
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.get("/users/admin/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  let admin = false;
  if (user) {
    admin = user?.role == "admin";
  }
  res.send({ admin });
});

app.get("/users/surveyor/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  let surveyor = false;
  if (user) {
    surveyor = user?.role == "surveyor";
  }
  res.send({ surveyor });
});

app.post("/users", async (req, res) => {
  const user = req.body;
  // email
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "user already exists", insertedId: null });
  }
  user.role = "user";
  const result = await userCollection.insertOne(user);
  res.send(result);
});

app.delete("/users/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await userCollection.deleteOne(query);
  res.send(result);
});

// admin role
app.patch("/users/admin/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      role: "admin",
    },
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

app.patch("/users/surveyor/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      role: "surveyor",
    },
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// payment intent
app.post("/create-payment-intent", async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price * 100);
  console.log(amount, "payment inside");
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: "usd",
    payment_method_types: ["card"],
  });
  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});
app.post("/payment", async (req, res) => {
  const payment = req.body;
  const result = await paymentCollection.insertOne(payment);
  const updateDoc = {
    $set: {
      role: "proUser",
    },
  };
  const filter = { email: payment.email };
  const updateData = await userCollection.updateOne(filter, updateDoc);
  console.log(updateData);

  mg.messages
    .create(process.env.MAIL_SENDING_DOMAIN, {
      from: "Mailgun Sandbox <postmaster@sandboxaa4be60d07004d8c9fbd3dc9aba12493.mailgun.org>",
      to: ["shabbirtanbir@gmail.com"],
      subject: "Surver Polling confirmation",
      text: "Testing some Mailgun awesomness!",
      html: `
      <div>
        <h2>Thanks for join membership plan </h2>
        <h4>Your transtction Id:<strong>${payment.transactionId}</strong> </h4>
        <p>We would like to get your feedback about our survey</p>
      </div>
    `,
    })
    .then((msg) => console.log(msg)) // logs response data
    .catch((err) => console.log(err));
  res.send(result);
});

app.get("/proUsers/:email", async (req, res) => {
  const email = req.params.email;
  // if (email !== req.decoded.email) {
  //   return res.status(403).send({ message: "forbidden access" });
  // }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  // console.log(user);
  let proUser = false;
  if (user) {
    proUser = user?.role === "proUser";
  }
  // mailgun

  res.send({ proUser });
});

app.get("/payment", async (req, res) => {
  const result = await paymentCollection.find().toArray();
  //  console.log(result);
  res.send(result);
});

// app.patch("/users/:id", verifyToken, async (req, res) => {
//   const id = req.params.id;
//   const filter = { _id: new ObjectId(id) };
//   const updateDoc = {
//     $set: {
//       role: "proUser",
//     },
//   };
//   const result = await userCollection.updateOne(filter, updateDoc);
//   res.send(result);
// });

// await client.db("admin").command({ ping: 1 });
// console.log(
//   "Pinged your deployment. You successfully connected to MongoDB!"
// );

app.listen(port, () => {
  console.log(`survey is starting on port ${port}`);
});
