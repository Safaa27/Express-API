const express = require('express');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');

// Inisialisasi Firebase Admin SDK
const serviceAccount = require('../serviceAccountKey.json');
const { status } = require('@grpc/grpc-js');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

const db = admin.firestore();
const router = express.Router();

router.get("/", (req, res)=>{
    res.json({
        status:"error",
        message:"no query"
    })
})

router.post('/daftar', async (req, res) => {
    try {
        const { email, nama, no_hp, peran, password, confirmPassword } = req.body;

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
            password:hashedPassword
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
            return res.status(404).json({ message: 'Data user tidak ditemukan' });
        }

        const userData = doc.data();
        return res.status(200).json(userData);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data user' });
    }
});

// UPDATE data user berdasarkan email
router.put('/update/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const { newEmail, nama, peran, no_hp, password } = req.body;

        const userRef = db.collection('users').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ 
                status:"error",
                message: 'Data user tidak ditemukan',
                data:email
            });
        }

        // Update data user
        await userRef.update({
            newEmail,
            nama,
            no_hp,
            peran,
            password: await bcrypt.hash(password, 10) // Enkripsi ulang password
        });

        return res.status(200).json({ 
            status:"success",
            message: 'Data user berhasil diperbarui',
            data:email
        });
    } catch (error) {
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
            return res.status(404).json({ message: 'Data user tidak ditemukan' });
        }

        // Hapus data user
        await userRef.delete();

        return res.status(200).json({ message: 'Data user berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ message: 'Terjadi kesalahan saat menghapus data user' });
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
