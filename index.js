const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

// create tracking id
const crypto = require("crypto");
const { count, timeStamp } = require('console');

function generateTrackingId() {
  const prefix = "PRCL"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}

// firebasae admin key
const admin = require("firebase-admin");



const decoded = Buffer.from(process.env.FIRE_BASE_SERVICE_kEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//mideleware
app.use(express.json())
app.use(cors())


const verifyFbtoken = async (req, res, next) => {
  const authorization = req.headers.authorization


  if (!authorization) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  try {
    const token = authorization.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(token)
    req.decoded_email = decoded.email

    next()
  }
  catch (err) {
    return res.status(401).send({ message: "Invalid token", error: err.message })
  }



}




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
    // await client.connect();

    const db = client.db('final_project_garments')
    const productCollection = db.collection('products')
    const ourproductcollection = db.collection('ourproducts')
    const usercollection = db.collection('users')
    const trackingcollection = db.collection('tracking')
    const deliverycollection = db.collection('delivery')
    const paymentcollection = db.collection('payment')


    // admin midleware
    const adminmidlware = async (req, res, next) => {
      const email = req.decoded_email
      const user = await usercollection.findOne({ email })
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Access Forbidden' });
      }
      next()
    }
    // Manager midleware
    const managerMidlware = async (req, res, next) => {
      const email = req.decoded_email
      const user = await usercollection.findOne({ email })
      if (!user || user.role !== 'Manager') {
        return res.status(403).send({ message: 'Access Forbidden' });
      }
      next()
    }
    // buyer midleware
    const buyerMidlware = async (req, res, next) => {
      const email = req.decoded_email
      const user = await usercollection.findOne({ email })
      if (!user || user.role !== 'Buyer') {
        return res.status(403).send({ message: 'Access Forbidden' });
      }
      next()
    }



    //for parcel tracking
    const logTracking = async (trackingId, status, date, location) => {
      const log = {
        trackingId,
        status,
        details: status.split('-').join(' '),
        date,
        location
      }
      const result = await trackingcollection.insertOne(log)
      return result
    }



    //users related api 

    app.post('/users', async (req, res) => {
      const userinfo = req.body
      userinfo.status = 'pending'
      userinfo.createdAt = new Date().toString()
      userinfo.logintime = new Date().toString()
      const query = { email: userinfo.email }
      const findUser = await usercollection.findOne(query)
      if (findUser) {
        const update = {
          $set: {
            logintime: new Date().toISOString()
          }
        }

        const updatelogintime = await usercollection.updateOne(query, update)
        return res.send(updatelogintime)
      }

      const result = await usercollection.insertOne(userinfo)
      res.send(result)
    })

    // get user role
    app.get('/users/:email/role', verifyFbtoken, async (req, res) => {
      const email = req.params.email
      const user = await usercollection.findOne({ email })
      res.send({ role: user?.role || 'Buyer', status: user?.status || 'pending' })
    })

    // get all users for admin
    app.get('/users', verifyFbtoken, adminmidlware, async (req, res) => {
      const search = req.query.search.replace(/\s+/g, '')
      const filter = req.query.filter
      const query = {}
      if (filter && filter !== 'all') {
        query.role = filter
      }


      if (search) {
        query.name = { $regex: search, $options: "i" }
      }
      const result = await usercollection.find(query).toArray()
      res.send(result)
    })

    // user status update
    app.patch('/users/:id', verifyFbtoken, adminmidlware, async (req, res) => {
      const { status, feedback } = req.body

      const id = req.params.id
      const query = { _id: new ObjectId(id) }

      const update = {
        $set: {
          status: status,
          feedback: feedback
        }
      }
      const result = await usercollection.updateOne(query, update)
      res.send(result)
    })

   // user profile update
   app.patch('/porfileUpdate/:email', async (req,res)=>{
    const {name,image}=req.body
    const email=req.params.email
     const query = { email: email }

  const update = {
        $set: {
        name,image
        }
      }
        const result = await usercollection.updateOne(query, update)
      res.send(result)

   })

    // get all user for profile section
    app.get('/user-profile/:email', verifyFbtoken, async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await usercollection.findOne(query)
      res.send(result)
    })


  // dashboard related api

    // users dashboard

    app.get('/users/summary', async (req, res) => {
  try {
   

    const result = await usercollection.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: "$count" },
          roles: {
            $push: {
              role: "$_id",
              count: "$count"
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalUsers: 1,
          roles: 1
        }
      }
    ]).toArray();

    res.send(result[0]);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get('/orders/summary', async (req, res) => {
  try {
    const result = await trackingcollection.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    // array → object বানানো
    const statusCounts = {};
    let totalOrders = 0;

    result.forEach(item => {
      statusCounts[item._id] = item.count;
      totalOrders += item.count;
    });

    res.send({
      totalOrders,
      statusCounts
    });

  } catch (error) {
    console.error("STATUS SUMMARY ERROR:", error);
    res.status(500).send({ message: error.message });
  }
});





// total order
app.get('/totalOrders',async(req,res)=>{
  const result= await deliverycollection.countDocuments()
  res.send(result)
})

    // product related api

    // add product api
    app.post('/products', verifyFbtoken, managerMidlware, async (req, res) => {
      const productInfo = req.body


      productInfo.createdAt = new Date().toString()
      productInfo.showonHomePage = 'Accept'
      const result = await productCollection.insertOne(productInfo)
      res.send(result)
    })

    //All products products  
    app.get('/all-products', async (req, res) => {
      const { limit = 0, skip = 0,filter,sort } = req.query
     const search = (req.query.search || '').trim()

      
      const query = {}
      if (filter && filter !== 'all') {
        query.category = filter
      }


      if (search) {
        query.productName = { $regex: search, $options: "i" }
      }

// Sorting
    let sortQuery = {};
    if (sort === 'lowToHigh') {
        sortQuery = { price: 1 }; 
    } else if (sort === 'highToLow') {
        sortQuery = { price: -1 }; 
    }

      const result = await productCollection
        .find(query).sort(sortQuery).limit(Number(limit))
        .skip(Number(skip))
        .project({ description: 0 }).toArray()
      const totalporductCount = await productCollection.countDocuments(query)
      res.send({ result, totalporduct: totalporductCount })
    })

    // all products for dash board
    app.get('/dashboard-all-products', verifyFbtoken, async (req, res) => {
      const result = await productCollection.find().toArray()
      res.send(result)
    })

    // show products on home page
    app.post('/our-products', verifyFbtoken, adminmidlware, async (req, res) => {
      const data = req.body
      data.createdAt = new Date().toString()
      const id = data._id
      data.productId = data._id
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: { showonHome: 'added' }
      }

      const result = await ourproductcollection.insertOne(data)
      const updateresult = await productCollection.updateOne(query, update)

      res.send({ home: result, prduct: updateresult })
    })

    // rmove product from home page
    app.delete('/remove-from-homepage/:id', async (req, res) => {
      const id = req.params.id
      const productId = req.params.id
      const productquery = { productId: productId }
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: { showonHome: 'Accept' }
      }

      const result = await ourproductcollection.deleteOne(productquery)
      const updateresult = await productCollection.updateOne(query, update)
      res.send({ home: result, prduct: updateresult })
    })





    //our products home page
    app.get('/our-products', async (req, res) => {

      const result = await ourproductcollection.find().sort({ createdAt: -1 }).limit(6).toArray()
      res.send(result)
    })

    // products more details
    app.get('/our-products/:id', async (req, res) => {
      const id = req.params.id
      const result = await productCollection.findOne({ _id: new ObjectId(id) })
      res.send(result)
    })

    // product delete by admin and manager
    app.delete('/delete/:id', verifyFbtoken, async (req, res) => {
      const id = req.params.id
      const porductId = req.params.id
      const productquery = { productId: porductId }
      const query = { _id: new ObjectId(id) }
      const result = await productCollection.deleteOne(query)
      const ourproduct = await ourproductcollection.deleteOne(productquery)
      res.send({ allproduct: result, ourproduct: ourproduct })
    })

    //product update by admin manager
    app.patch('/product-update/:id', verifyFbtoken, async (req, res) => {
      const updateinfo = req.body
      const productId = req.params.id
      const productquery = { productId: productId }
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: updateinfo

      }
      const result = await productCollection.updateOne(query, update)
      const resulthome = await ourproductcollection.updateOne(productquery, update)

      res.send({ all: result, home: resulthome })
    })

    // manage product by manager
    app.get('/manage-products', verifyFbtoken, managerMidlware, async (req, res) => {
      const email = req.query.email
      const search = req.query.search.replace(/\s+/g, '')
      const query = {
        createdBy: email,
        productName: { $regex: search, $options: "i" }
      }
      const result = await productCollection.find(query).toArray()
      res.send(result)
    })

    //get pendig orders for manager
    app.get('/pending-orders', verifyFbtoken, managerMidlware, async (req, res) => {
      const email = req.query.email


      const query = {}
      if (email) {
        query.createdBy = email,
          query.status = 'pending'
      }
      const result = await deliverycollection.find(query).toArray()
      res.send(result)
    })

    //pending order status update by manager
    app.patch('/order-approved/:id', verifyFbtoken, managerMidlware, async (req, res) => {
      const id = req.params.id
      const { status, trackingId } = req.body
      const timeStamp = new Date().toISOString();
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: {
          status: status,
          daliveryStatus: status,
          timestamp: timeStamp
        }
      }

      const result = await deliverycollection.updateOne(query, update)

      logTracking(trackingId, 'order-accepted', timeStamp)
      res.send(result)

    })

    // get  approve order 
    app.get('/approve-orders', verifyFbtoken, managerMidlware, async (req, res) => {

      const email = req.query.email


      const query = {}
      if (email) {
        query.createdBy = email,
          query.status = 'approved'
      }
      const result = await deliverycollection.find(query).toArray()
      res.send(result)

    })

    // update tracking status
    app.post('/parcels/status', verifyFbtoken, managerMidlware, async (req, res) => {
      const { status, trackingId, date, location } = req.body


      const result = await logTracking(trackingId, status, date, location)
      res.send(result)

    })



    // delivery collection
    // buyer order add in db
    app.post('/delivery', verifyFbtoken, async (req, res) => {
      const info = req.body
      const trackingId = generateTrackingId()
      info.trackingId = trackingId
      info.createdAt = new Date().toString()
      info.status = 'pending'
      const quantity = info.quantityleft
      const productId = info.productId
      const query = { _id: new ObjectId(productId) }
      const update = {
        $set: {
          availableQuantity: quantity
        }
      }


      const result = await deliverycollection.insertOne(info)
      const updatequantity = await productCollection.updateOne(query, update)
      res.send({ delivery: result, allporduct: updatequantity })

    })

    // get singale user order by email
    app.get('/orders', verifyFbtoken, buyerMidlware, async (req, res) => {
      const { email } = req.query
      const query = {}

      if (email) {
        query.email = email
      }


      const cursor = deliverycollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })

    // get all order for admin
    app.get('/ad-allorders', verifyFbtoken, async (req, res) => {
      const search = req.query.search.replace(/\s+/g, '')
      const query = {

        status: { $regex: search, $options: "i" }
      }
      const result = await deliverycollection.find(query).toArray()
      res.send(result)
    })

    // buyer order cancle 
    app.delete('/myorder/:id', verifyFbtoken, buyerMidlware, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await deliverycollection.deleteOne(query)
      res.send(result)
    })




    // payment related api
    app.post('/create-checkout-session', async (req, res) => {
      const paymentinfo = req.body
      const amount = Number(paymentinfo.cost) * 100
      const session = await stripe.checkout.sessions.create({

        line_items: [
          {

            price_data: {
              currency: 'USD',
              unit_amount: amount,
              product_data: {
                name: paymentinfo.ParcelName
              },

            },
            quantity: 1,
          },
        ],
        customer_email: paymentinfo.Senderemail,
        mode: 'payment',
        metadata: {
          parcelId: paymentinfo.parcelId,
          parcelName: paymentinfo.ParcelName,
          trackingId: paymentinfo.trackingId
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/all-orders`,
      });

      res.send({ url: session.url })

    })

    //payment successful
    app.patch('/payment-success', async (req, res) => {
      const sessionId = req.query.session_id
      const session = await stripe.checkout.sessions.retrieve(sessionId);


      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId }
      const paymentExist = await paymentcollection.findOne(query)
      if (paymentExist) {
        return res.send({ message: 'payment already done', transactionId, trackingId: paymentExist.trackingId })
      }



      const trackingid = session.metadata.trackingId
      if (session.payment_status === 'paid') {
        const id = session.metadata.parcelId
        const query = { _id: new ObjectId(id) }
        const update = {
          $set: {
            paymentStatus: 'paid',
            daliveryStatus: 'waiting for confirmation',
            transactionId: session.payment_intent,

          }
        }
        const result = await deliverycollection.updateOne(query, update)
        // payment history
        const paymentHistory = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          ParcelName: session.metadata.ParcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          trackingId: trackingid,
          paidAt: new Date()

        }
        if (session.payment_status === 'paid') {
          const resultPayment = await paymentcollection.insertOne(paymentHistory)



          return res.send({ success: true, modifyParcel: result, paymentInfo: resultPayment, trackingId: trackingid, transactionId: session.payment_intent, })
        }

      }
      return res.send({ success: false })
    })


    //tracking related api
    app.get('/trackings/:trackingId/logs', async (req, res) => {
      const trackingId = req.params.trackingId
      const query = { trackingId }
      const result = await trackingcollection.find(query).toArray()
      res.send(result)
    })


    app.get('/', (req, res) => {
      res.send('Hello World!')
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
