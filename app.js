const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors'); // Import the CORS package

const usersRouter = require('./api/users');
const vendorsRouter = require('./api/vendor');
const ratingRouter = require('./api/rating');
const pesananRoutes = require('./api/pesanan');

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Konfigurasi bodyparser untuk mengelola data yang di upload
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Konfigurasi multer untuk mengelola file yang diunggah
const upload = multer({ dest: 'uploads/' });

app.get("/", (req, res) => {
    res.json({
        status: "error",
        message: "no query"
    });
});

app.use('/uploads', express.static('uploads'));
app.use('/testAPI', express.static('testAPI'));
app.use("/users", usersRouter);
app.use("/login", usersRouter);
app.use("/vendor", vendorsRouter);
app.use("/rating", ratingRouter);
app.use('/orders', pesananRoutes);

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});