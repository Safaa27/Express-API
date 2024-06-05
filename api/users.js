const express = require('express');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// Inisialisasi Firebase Admin SDK
const serviceAccount = require('../serviceAccountKey.json');
const { status } = require('@grpc/grpc-js');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

const db = admin.firestore();
const router = express.Router();
// Storage untuk menyimpan foto portofolio
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        // Menghasilkan nama file berdasarkan hash SHA256
        const hash = crypto.createHash('sha256').update(file.originalname).digest('hex');
        const fileExt = path.extname(file.originalname);
        cb(null, `${hash}${fileExt}`);
    }
});

// Filter untuk hanya menerima file dengan tipe gambar
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Hanya diperbolehkan mengunggah file gambar'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

router.get("/", (req, res)=>{
    res.json({
        status:"error",
        message:"no query"
    })
})

router.post('/daftar', upload.single('profile'), async (req, res) => {
    try {
        const { email, nama, no_hp, peran, password, confirmPassword } = req.body;

        // Menghasilkan URL foto portofolio
        let profileUrl = '';
        if (req.file) {
            const filePath = req.file.path;
            profileUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
        }

        if (!email || !nama || !no_hp || !peran || !password || !confirmPassword) {
            return res.status(400).json({ 
                status:"error",
                message: 'Semua kolom harus diisi' 
            });
        } else if(password != confirmPassword){
            return res.status(400).json({
                status:"error",
                message: 'Password dan Confirm Password tidak sama'
            })
        }

        // Enkripsi password menggunakan bcrypt
        const hashedPassword = await bcrypt.hash(password, 10);

        // Gunakan email sebagai bagian dari ID dokumen
        const userRef = db.collection('users').doc(email);

        // Periksa apakah dokumen user dengan email yang sama sudah ada
        const doc = await userRef.get();
        if (doc.exists) {
            return res.status(400).json({ 
                status:"error",
                message: 'user dengan email yang sama sudah ada' 
            });
        }

        // Tambahkan data user ke Firestore dengan email sebagai ID dokumen
        await userRef.set({
            email,
            nama,
            no_hp,
            peran,
            password:hashedPassword,
            profile:profileUrl
        });

        return res.status(201).json({ 
            status:"success",
            message: 'Data user berhasil ditambahkan' 
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            status:"error",
            message: 'Terjadi kesalahan saat menambahkan data user' 
        });
    }
});

// GET data user berdasarkan email
router.get('/:email', async (req, res) => {
    try {
        const { email } = req.params;
        if (email === 'all') {
            const usersSnapshot = await db.collection('users').get();
            const usersList = [];
            usersSnapshot.forEach(doc => {
                usersList.push(doc.data());
            });
            return res.status(200).json(usersList);
        }

        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status:"error", message: 'Data user tidak ditemukan' });
        }

        const userData = doc.data();
        return res.status(200).json(userData);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status:"error", message: 'Terjadi kesalahan saat mengambil data user' });
    }
});

// UPDATE data user berdasarkan email
router.put('/update/:email', upload.single('profile'), async (req, res) => {
    try {
        const { email } = req.params;
        
        const { nama, peran, no_hp, password } = req.body;

        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();
        

        // Menghasilkan URL foto portofolio
        const userData = doc.data();
        let profileUrl = userData.profile;
        if (req.file) {
            const filePath = req.file.path;
            profileUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
        }

        if (!doc.exists) {
            return res.status(404).json({ 
                status:"error",
                message: 'Data user tidak ditemukan',
                data:email
            });
        }

        // Update data user
        await userRef.update({ 
            nama,
            no_hp,
            peran,
            profileUrl:profileUrl,
            password: await bcrypt.hash(password, 10) // Enkripsi ulang password
        });

        return res.status(200).json({ 
            status:"success",
            message: 'Data user berhasil diperbarui',
            data:email
        });
    } catch (error) {
        const { email } = req.params;
        console.error('Error:', error);
        return res.status(500).json({ 
            status:"error",
            message: 'Terjadi kesalahan saat memperbarui data user',
            data:email
        });
    }
});

// DELETE data user berdasarkan email
router.delete('/delete/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status:"error", message: 'Data user tidak ditemukan' });
        }

        // Hapus data user
        await userRef.delete();

        return res.status(200).json({ status:"success", message: 'Data user berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status:"error", message: 'Terjadi kesalahan saat menghapus data user' });
    }
});

router.post('/auth', async (req, res)=>{
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                status:"error",
                message: 'Email dan password harus diisi' 
            });
        }

        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                status:"error",
                 message: 'Email atau password salah' 
                });
        }

        const userData = doc.data();

        // Memeriksa apakah password cocok
        const passwordMatch = await bcrypt.compare(password, userData.password);

        if (!passwordMatch) {
            return res.status(401).json({ 
                status:"error",
                message: 'Email atau password salah' 
            });
        }

        // Jika email dan password cocok, beri respons berhasil
        return res.status(200).json({ 
            status:"success",
            message: 'Login berhasil',
            data : userData
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            status:"error",
            message: 'Terjadi kesalahan saat melakukan login' 
        });
    }
})


module.exports = router;
