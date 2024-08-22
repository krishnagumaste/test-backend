import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { handleGetUrl, handleImageUrl } from './aws/geturl.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

const userConnections = {}; // Store user WebSocket connections

// MongoDB User Schema
const userSchema = new mongoose.Schema({
    username: {type: String, required: true, unique: true},
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// MongoDB Product Schema
const productSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    bidPrice: { type: String, required: true },
    imageSrc: { type: String, required: true },
    imageAlt: { type: String, required: true },
    details: { type: String },
    bidHistory: [{ username: String, bidPrice: String }],
    endDate: { type: String }
});

const Product = mongoose.model('Product', productSchema);

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach the decoded token to the request object
        next(); // Proceed to the next middleware or route handler
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Check if the user exists
    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET);

    // Send response
    res.json({ token });
});


// Signup Route
app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;

    // Check if the user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
        return res.status(400).json({ message: 'Username or email already in use' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({
        username,
        email,
        password: hashedPassword
    });

    // Save the user to the database
    await newUser.save();

    // Generate JWT
    const token = jwt.sign({ username: newUser.username }, process.env.JWT_SECRET);

    // Send response with the token
    res.status(201).json({ token });
});


// Get All Products Route
app.post('/products', authMiddleware, async (req, res) => {
    try {
        const products = await Product.find(); // Fetch all products
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});

// Get Product by Name Route
app.post('/product', authMiddleware, async (req, res) => {
    const { _id } = req.body;

    try {
        // Find the product by name
        const product = await Product.findOne({ _id });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Send the product details in response
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});



// Place Bid Route
app.post('/placebid', authMiddleware, async (req, res) => {
    const { _id, bidValue } = req.body;
    const { username } = req.user; // Extract username from decoded token

    if (!bidValue || !bidValue.startsWith('$')) {
        return res.status(400).json({ message: 'Invalid bid value format. It should start with a $' });
    }

    try {
        // Find the product by _id
        const product = await Product.findById(_id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Update the bidPrice and bidHistory
        product.bidPrice = bidValue;
        product.bidHistory.push({ username, bidPrice: bidValue });

        // Save the updated product
        await product.save();

        // Send the updated product details in response
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});



// User Page Info Route
app.post('/userpageinfo', authMiddleware, async (req, res) => {
    const { username } = req.user; // Extract username from the token

    try {
        const user = await User.findOne({ username }).select('username email');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const products = await Product.find({
            'bidHistory.username': username
        }).where('bidHistory').elemMatch({
            username,
            bidPrice: { $exists: true }
        }).sort({
            'bidHistory.0': -1
        });

        const validProducts = products.filter(product => {
            const lastBid = product.bidHistory[product.bidHistory.length - 1];
            return lastBid.username === username;
        });

        const currentProducts = await Product.find({
            'bidHistory.0.username': username // Check if the first object in bidHistory has the username
        });

        // If no products are found, return a message indicating so
        if (products.length === 0) {
            return res.status(404).json({ message: 'No products found with your first bid' });
        }

        res.json({
            user,
            products: validProducts,
            currentProducts: currentProducts
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});



// app.post('/currentbids', authMiddleware, async (req, res) => {
//     const { username } = req.user; // Extract username from the token

//     try {
//         // Find products where the first bid in bidHistory matches the username
//         const products = await Product.find({
//             'bidHistory.0.username': username // Check if the first object in bidHistory has the username
//         });

//         // If no products are found, return a message indicating so
//         if (products.length === 0) {
//             return res.status(404).json({ message: 'No products found with your first bid' });
//         }

//         // Send the products in response
//         res.json(products);
//     } catch (err) {
//         res.status(500).json({ message: 'Server error', error: err });
//     }
// });




app.post('/newproduct', authMiddleware, async (req, res) => {
    const { id, name, bidPrice, imageSrc, imageAlt, details, endDate } = req.body;
    const { username } = req.user; // Extract username from decoded token

    try {
        // Check if the product with the same ID already exists
        const existingProduct = await Product.findOne({ id });
        if (existingProduct) {
            return res.status(400).json({ message: 'Product with this ID already exists' });
        }

        // Create a new product with the initial bidHistory
        const newProduct = new Product({
            id,
            name,
            bidPrice,
            imageSrc,
            imageAlt,
            details,
            bidHistory: [{ username, bidPrice }], // Initialize bidHistory with the user's bid
            endDate
        });

        // Save the product to the database
        await newProduct.save();

        // Send response with the newly created product details
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});




// Function to send a notification via WebSocket
const sendNotification = (previousBidder, productId, newBidPrice) => {
    const wsConnection = userConnections[previousBidder];
    if (wsConnection) {
        wsConnection.send(
            JSON.stringify({
                message: `New bid of ${newBidPrice} on product with ID ${productId}`,
            })
        );
        console.log(`Notification sent to ${previousBidder}`);
    } else {
        console.log(`User ${previousBidder} not connected`);
    }
};

// Bid Route
app.post('/bid', authMiddleware, async (req, res) => {
    const { _id, bidPrice } = req.body;
    const { username } = req.user; // Extract username from decoded token

    if (!bidPrice || !bidPrice.startsWith('$')) {
        return res.status(400).json({ message: 'Invalid bid value format. It should start with a $' });
    }

    try {
        // Find the product by _id
        const product = await Product.findById(_id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Get the previous highest bidder
        const lastBid = product.bidHistory[product.bidHistory.length - 1];

        // Update the bidPrice and bidHistory
        product.bidPrice = bidPrice;
        product.bidHistory.push({ username, bidPrice });

        // Save the updated product
        await product.save();

        // Send the updated product details in response
        res.json(product);

        // Send notification to the previous highest bidder if exists
        if (lastBid) {
            sendNotification(lastBid.username, _id, bidPrice);
        }

    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});

// WebSocket Server Setup
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws, req) => {
    let username;

    // Extract and verify the JWT from query parameters (assuming it's sent as a query string)
    const token = new URL(req.url, `http://localhost:${WS_PORT}`).searchParams.get('token');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        username = decoded.username;

        // Store the WebSocket connection for the user
        userConnections[username] = ws;
        console.log(`${username} connected via WebSocket`);

        // Handle WebSocket closure
        ws.on('close', () => {
            delete userConnections[username];
            console.log(`${username} disconnected`);
        });
    } catch (err) {
        console.error('Invalid WebSocket connection attempt');
        ws.close(); // Close the connection if the token is invalid
    }
});



// Cancel Bid Route
app.post('/cancelbid', authMiddleware, async (req, res) => {
    const { _id } = req.body;

    try {
        // Find the product by _id
        const product = await Product.findById(_id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Delete the product from the collection
        await Product.deleteOne({ _id });

        // Send a success response
        res.json({ message: 'Product bid canceled and deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});







app.post("/geturl", authMiddleware, handleGetUrl);

app.post("/imageurl", authMiddleware, handleImageUrl);



app.get('/', (req, res) => {
    res.send('Hello World!');
});


mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch(err => console.error('Could not connect to MongoDB', err));