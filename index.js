const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 5000;
require('dotenv').config()
require('colors')
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { default: Stripe } = require('stripe');
const stripe = process.env.SECRET_KEY

// middleware
app.use(express.json())
app.use(cors())


// connect mongoDB 

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.afdwhlk.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//verify JWT
function verifyJWT(req, res, next) {
    // console.log('token inside verify JWT' , req.headers.authorization)
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send("unAuthorized access")
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidded access' })
        }
        req.decoded = decoded
        next()


    })
}


async function dbConnect() {
    try {
        await client.connect()
        console.log('database connected '.yellow)
    }
    catch (error) {
        console.log(error.name.bgRed)
    }

}
dbConnect()


// create coollection here 
const appoinmentOptionCollection = client.db("Doctors-portal").collection("services")

const bookingsCollection = client.db("Doctors-portal").collection("bookings")
const usersCollection = client.db("Doctors-portal").collection("users")
const  doctorsCollection = client.db("Doctors-portal").collection('doctors')



//verifyAdmin 
// NOTE : make sure you use verifyAdmin after verifyJWT 
const verifyAdmin = async (req, res, next) =>{
    console.log('inside verifyAdmin ', req.decoded.email)
    const decodedEmail = req.decoded.email
    const query = { email: decodedEmail }
    const user = await usersCollection.findOne(query)
    if (user?.role !== 'admin') {
        return res.status(403).send({
            message: 'forbiddend Access'
        })
    }
    next()
}


// end point 
//get appointmentOPtion 


//use Aggregate to query mulitple collection and then merge data
app.get('/appointmentOption', async (req, res) => {
    const date = req.query.date;
    const query = {};
    const options = await appoinmentOptionCollection.find(query).toArray();

    // get the bookings of the provided date
    const bookingQuery = { appointmentDate: date }
    const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

    // code carefully :D
    options.forEach(option => {
        const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
        const bookedSlots = optionBooked.map(book => book.slot);
        const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        option.slots = remainingSlots;
        console.log(date, option.name, remainingSlots.length)
    })
    res.send(options);
});

// api with version s

// app.get('/v2/appointmentOptions', async(req,res)=>{
//     const date = req.query.data ; 
//     const options  = await appoinmentOptionCollection.aggregate([
//         {
//             $lookup:{
//                 from:  'bookings',
//        localField: 'name',
//        foreignField: 'treatment',
//        pipeline: [ 
//         {
//             $match: {
//                $expr:{
//                 $eq: ['$appointmentDate', date]
//                } 
//             }
//         }
//        ] ,
//        as:  'booked'
//             } 
//         }, 
//         {
//             $project: {
//                 name: 1, 
//                 slots: 1, 
//                 booked: {
//                     $map: {
//                         inpout: '$booked',
//                         as: 'book', 
//                         in: '$book.slot'
//                     }
//                 }
//             }
//         } ,
//         {
//             $project: {
//                 name: 1, 
//                 slots: {
//                     $setDifferences: [ '$slots' , '$booked']
//                 }
//             }
//         }
//     ]).toArray();
//     res.send(options)
// })



// *bookings
// api naming convention 
// *app.get('/bookings)
// *app.get('/bookings/:id)
// app.post('/bookings)
// app.patch('/bookings/:id)
// app.delete('/bookings/:id)

// data filter by data and email , treatment 
app.post('/bookings', async (req, res) => {
    const booking = req.body;
    console.log(booking);
    const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment
    }

    const alreadyBooked = await bookingsCollection.find(query).toArray();

    if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`
        return res.send({ acknowledged: false, message })
    }

    const result = await bookingsCollection.insertOne(booking);
    res.send(result);
})





// akn kaj holo kono user er appiontments gula database theke load kora 
app.get('/bookings', verifyJWT, async (req, res) => {
    const email = req.query.email;
    // console.log('token',req.headers.authorization)
    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' })
    }
    // console.log(email)
    const query = { email: email };
    const bookings = await bookingsCollection.find(query).toArray()
    res.send(bookings)
})


app.get('/jwt', async (req, res) => {
    const email = req.query.email
    const query = { email: email }
    const user = await usersCollection.findOne(query)
    if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '5h' })
        return res.send({ accessToken: token })
    }
    console.log(user)
    res.status(403).send({ accessToken: '' })
})

// user der data db te patanor jonno 
app.post('/users',   async (req, res) => {
    const user = req.body
    console.log(user)
    const result = await usersCollection.insertOne(user)
    res.send(result)
})
//all uers data load 
app.get('/users',  async (req, res) => {
    try {
        // console.log(req.headers.authorization)
        const query = {}
        const users = await usersCollection.find(query).toArray()
        res.send(users)
    }
    catch (err) {
        console.log(err.message.bgRed)
        res.send({
            success: false,
            message: 'something went wrong'
        })

    }
})

//make admin api 
app.put('/users/admin/:id', verifyJWT, verifyAdmin ,  async (req, res) => {
    try {
        // const decodedEmail = req.decoded.email
        // const query = { email: decodedEmail }
        // const user = await usersCollection.findOne(query)
        // if (user?.role !== 'admin') {
        //     return res.status(403).send({
        //         message: 'forbiddend Access'
        //     })
        // }
        const id = req.params.id
        const filter = { _id: ObjectId(id) }
        const options = { upsert: true }
        const updatedDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = await usersCollection.updateOne(filter, updatedDoc, options)
        res.send(({
            success: true,
            data: result,
            message: 'Admin done '
        }))
    }
    catch (err) {
        console.log(err.message.bgRed)
        res.send('kisu ekta vul korteco')
    }
});

// admin role check api 
app.get('/users/admin/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email }
    const user = await usersCollection.findOne(query)
    res.send({ isdAdmin: user?.role === 'admin' })
})

///Doctors specialty 
app.get('/appointmentSpecialty', async(req, res)=>{
    const query = {}
    const result = await appoinmentOptionCollection.find(query).project({name: 1}).toArray()
    res.send(result)
})

//doctors er der information server a patanor jonno 
app.post('/doctors', verifyJWT , verifyAdmin ,  async (req, res) => {
    const doctor = req.body;
    const result = await doctorsCollection.insertOne(doctor);
    res.send(result);
}); 

// doctors der information db theke  load korar jonno 

app.get('/doctors', verifyJWT , verifyAdmin ,  async(req, res) =>{
    const query = {}
    const doctors = await doctorsCollection.find(query).toArray()
    res.send(doctors)
})

//doctor delete api 
app.delete('/doctor/:id', verifyJWT , verifyAdmin , async(req, res)=>{
    const id = req.params.id
    try{
        const query = ({_id: ObjectId(id)})
        const result = await doctorsCollection.deleteOne(query)
        if(result.deletedCount){
            // console.log('doctor deleted')
            res.send({
                success: true , 
                message: `doctor deleted`
            })

        }else{
            console.log("something went wrong ".red)

        }
    }
    catch(err){
        res.send({
            success: false,
            error: err.message
        })
    }
})

//temporary to update price field on appointment options
app.get('/addprice', async(req, res)=>{
    const filter = {}
    const options = {upsert: true}
    const updatedDoc = {
        $set: {
            price: 99
        }
    }
    const result = await appoinmentOptionCollection.updateMany(filter , updatedDoc, options)
    res.send(result)

})

// id diye  bookings er data laod kora 
app.get('/bookings/:id', async(req ,res)=>{
    const id = req.params.id
    const query = {_id: ObjectId(id)}
    const booking = await bookingsCollection.findOne(query)
    res.send(booking)
})

// /stripe api start here  

// app.post('/create-payment-intent', async (req, res) => {
//     const booking = req.body;
//     const price = booking.price;
//     const amount = price * 100;

//     const paymentIntent = await stripe.paymentIntent.create({
//         currency: 'usd',
//         amount: amount,
//         "payment_method_types": [
//             "card"
//         ]
//     });
//     res.send({
//         clientSecret: paymentIntent.client_secret,
//     });
// });

app.post('/create-payment-intent', async(req, res) =>{
    const booking = req.body;
    const price = booking.price
    const amount = price * 100 
    const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd', 
        amount : amount, 
        "payment_method_types": [
            "card"
        ]

    });
    res.send({
        clientSecret : paymentIntent.client_secret, 
    });
    
})


app.get('/', async (req, res) => {
    res.send('doctors portal server is runnig ')

})

app.listen(port, () => console.log(`server is runnig on port ${port}`.blue))