const express = require('express')
const bodyParser = require('body-parser');
const multer = require('multer')
const usersRouter = require('./api/users');


const app = express();
const port = 3000;

// Konfigurasi bodyparser untuk mengelola data yang di upload
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
// Konfigurasi multer untuk mengelola file yang diunggah
const upload = multer({ dest: 'uploads/' });

app.get("/", (req, res)=>{
    res.json({
        status:"error",
        message:"no query"
    })
})

app.use("/users", usersRouter)
app.use("/login", usersRouter)



app.listen(port, ()=>{
    console.log(`Server berjalan di http://localhost:${port}`)
})