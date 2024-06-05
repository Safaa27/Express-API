const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid')

const db = admin.firestore();

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

// Fungsi untuk menghasilkan ID acak sepanjang 20 karakter
const generateRandomId = () => {
    return uuidv4().replace(/-/g, '').slice(0, 20);
};

// Menambah data vendor
router.post('/add', upload.single('portofolio'), async (req, res) => {
    try {
        const {
            
            kontak_user,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_singkat
        } = req.body;

        // Menghasilkan URL foto portofolio
        let portofolioUrl = '';
        if (req.file) {
            const filePath = req.file.path;
            portofolioUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
        }

        // Menambahkan data vendor ke Firestore
        const randId = generateRandomId()
        await db.collection('vendors').doc(randId).set({
            id: randId,
            kontak_user,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_singkat,
            portofolio: portofolioUrl
        });

        return res.status(201).json({ status: 'success', message: 'Data vendor berhasil ditambahkan' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan data vendor' });
    }
});

// Menampilkan semua data vendor
router.get('/all', async (req, res) => {
    try {
        const vendorsSnapshot = await db.collection('vendors').get();

        const vendorsList = [];
        for (const doc of vendorsSnapshot.docs) {
            let data = doc.data();

            // Mengambil data pemilik dari koleksi users
            const userSnapshot = await db.collection('users').doc(data.kontak_user).get();
            if (userSnapshot.exists) {
                const userData = userSnapshot.data();
                data.pemilik_info = {
                    email: userData.email,
                    nama: userData.nama,
                    no_hp: userData.no_hp
                };
            }

            // Mengambil semua rating untuk id_vendor tertentu
            const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();

            let totalRating = 0;
            let ratingCount = 0;

            ratingsSnapshot.forEach(doc => {
                totalRating += doc.data().rating;
                ratingCount++;
            });

            let averageRating = 0;
            if (ratingsSnapshot.empty) {
               
            }else{
                averageRating = (totalRating / ratingCount).toFixed(1);
            }
            
            data.rating = averageRating
            vendorsList.push(data);
        }

        return res.status(200).json(vendorsList);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat mengambil data vendor' });
    }
});


// Menampilkan data vendor berdasarkan filter
router.get('/filter', async (req, res) => {
    try {
        const { tipe_layanan, lokasi_kantor, rating, jenis_properti } = req.query;

        // Mengubah semua parameter query menjadi huruf kecil
        const filterOptions = {
            tipe_layanan: tipe_layanan ? tipe_layanan.toLowerCase() : '',
            lokasi_kantor: lokasi_kantor ? lokasi_kantor.toLowerCase() : '',
            rating: rating ? rating.toLowerCase() : '',
            jenis_properti: jenis_properti ? jenis_properti.toLowerCase() : ''
        };

        let query = db.collection('vendors');
        const vendorsSnapshot = await query.get();

        const vendorsList = await Promise.all(vendorsSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            let matches = true;

            // Mengambil semua rating untuk id_vendor tertentu
            const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();

            let totalRating = 0;
            let ratingCount = 0;

            ratingsSnapshot.forEach(doc => {
                totalRating += doc.data().rating;
                ratingCount++;
            });
            
            let averageRating = 0;
            if (ratingsSnapshot.empty) {
               
            }else{
                averageRating = (totalRating / ratingCount).toFixed(1);
            }
        

            if (filterOptions.tipe_layanan) {
                const tipeLayananArray = data.tipe_layanan.toLowerCase().split(',').map(item => item.trim());
                if (!tipeLayananArray.includes(filterOptions.tipe_layanan)) {
                    matches = false;
                }
            }
            if (filterOptions.lokasi_kantor) {
                const lokasiArray = data.lokasi_kantor.toLowerCase().split(',').map(item => item.trim());
                if (!lokasiArray.includes(filterOptions.lokasi_kantor)) {
                    matches = false;
                }
            }
            if (filterOptions.rating) {
                if (averageRating < parseInt(filterOptions.rating)) {
                    matches = false;
                }
            }
            if (filterOptions.jenis_properti) {
                const jenisPropertiArray = data.jenis_properti.toLowerCase().split(',').map(item => item.trim());
                if (!jenisPropertiArray.includes(filterOptions.jenis_properti)) {
                    matches = false;
                }
            }

            if (matches) {
                // Mengambil data pemilik dari koleksi users
                const userSnapshot = await db.collection('users').doc(data.kontak_user).get();
                if (userSnapshot.exists) {
                    const userData = userSnapshot.data();
                    data.pemilik_info = {
                        email: userData.email,
                        nama: userData.nama,
                        no_hp: userData.no_hp
                    };
                    data.rating = averageRating
                }
                return data;
            }
            return null;
        }));

        // Filter out null values
        const filteredVendorsList = vendorsList.filter(vendor => vendor !== null);

        return res.status(200).json(filteredVendorsList);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melakukan filter data vendor' });
    }
});

// Menampilkan detail data vendor berdasarkan id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const vendorRef = db.collection('vendors').doc(id);
        const doc = await vendorRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: 'error', message: 'Data vendor tidak ditemukan' });
        }

        const data = doc.data();
        // Mengambil semua rating untuk id_vendor tertentu
        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();

        let totalRating = 0;
        let ratingCount = 0;

        ratingsSnapshot.forEach(doc => {
            totalRating += doc.data().rating;
            ratingCount++;
        });
        
        let averageRating = 0;
        if (ratingsSnapshot.empty) {
           
        }else{
            averageRating = (totalRating / ratingCount).toFixed(1);
        }
        

        // Mengambil data pemilik dari koleksi users
        const userSnapshot = await db.collection('users').doc(data.kontak_user).get();
        if (userSnapshot.exists) {
            const userData = userSnapshot.data();
            data.pemilik_info = {
                email: userData.email,
                nama: userData.nama,
                no_hp: userData.no_hp
            };

            data.rating = averageRating
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat mengambil detail data vendor' });
    }
});

// Update data vendor berdasarkan id
router.put('/:id', upload.single('portofolio'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            kontak_user,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_singkat
        } = req.body;

        const vendorRef = db.collection('vendors').doc(id);
        const doc = await vendorRef.get();

        const vendorData = doc.data();
        // Menghasilkan URL foto portofolio
        let portofolioUrl = vendorData.portofolio;
        if (req.file) {
            const filePath = req.file.path;
            portofolioUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
        }

        if (!doc.exists) {
            return res.status(404).json({ status: 'error', message: 'Data vendor tidak ditemukan' });
        }

        // Update data vendor
        await vendorRef.update({
            kontak_user,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_singkat,
            portofolio: portofolioUrl
        });

        return res.status(200).json({ status: 'success', message: 'Data vendor berhasil diperbarui' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat memperbarui data vendor' });
    }
});

// Hapus data vendor berdasarkan id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const vendorRef = db.collection('vendors').doc(id);
        const vendorSnapshot = await vendorRef.get();
        
        if (!vendorSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Vendor tidak ditemukan' });
        }

        await vendorRef.delete();

        // Menghapus rating terkait
        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', id).get();
        const deletePromises = ratingsSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);

        return res.status(200).json({ status: 'success', message: 'Vendor dan rating terkait berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghapus data vendor' });
    }
});

router.get("/", (req, res)=>{
    res.json({
        status:"error",
        message:"no query"
    })
})

module.exports = router;