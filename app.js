const express = require('express')
const bodyParser = require('body-parser');
const multer = require('multer')
const usersRouter = require('./api/users');
const vendorsRouter = require('./api/vendor');
const ratingRouter = require('./api/rating');


const app = express();
const port = 3000;

// Konfigurasi bodyparser untuk mengelola data yang di upload
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Konfigurasi multer untuk mengelola file yang diunggah
const upload = multer({ dest: 'uploads/' });

app.get("/", (req, res)=>{
    res.json({
        status:"error",
        message:"no query"
    })
})

app.use('/uploads', express.static('uploads'));
app.use("/users", usersRouter)
app.use("/login", usersRouter)
app.use("/vendor", vendorsRouter)
app.use("/rating", ratingRouter)


app.listen(port, ()=>{
    console.log(`Server berjalan di http://localhost:${port}`)
})