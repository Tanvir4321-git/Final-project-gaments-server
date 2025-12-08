const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const { MongoClient,ServerApiVersion, ObjectId } = require('mongodb')
const port = process.env.PORT || 3000


//mideleware
app.use(express.json())
app.use(cors())

//mongodb uri 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@first-mongobd-porject.tmjl5yc.mongodb.net/?appName=first-mongobd-porject`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});




async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

   const db=client.db('final_project_garments')
   const productCollection=db.collection('products')
   const usercollection=db.collection('users')

//users
app.post('/users',async (req,res)=>{
  const userinfo=req.body
  userinfo.status='pending'
  userinfo.createdAt=new Date().toString()
  userinfo.logintime=new Date().toString()
  const query={email:userinfo.email}
  const findUser= await usercollection.findOne(query)
  if(findUser){
   const update={
  $set:{
    logintime:new Date().toISOString()
  }
 }

    const updatelogintime= await usercollection.updateOne(query,update)
    return res.send(updatelogintime)
  }

  const result=await usercollection.insertOne(userinfo)
  res.send(result)
})


//our products home page
app.get('/our-products',async(req,res)=>{
    const result=await productCollection.find().limit(6).toArray()
    res.send(result)
})

// products more details
app.get('/our-products/:id',async(req,res)=>{
    const id=req.params.id
    const result=await productCollection.findOne({_id:new ObjectId(id)})
    res.send(result)
})



app.get('/', (req, res) => {
  res.send('Hello World!')
})

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
