const express = require('express');
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const { SimpleLinearRegression } = require('ml-regression');

const db = admin.firestore();
const router = express.Router();

// Fungsi untuk membaca file CSV dan mengembalikan data sebagai array objek
const parseCsv = async (filePath) => {
    const data = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', () => {
                resolve(data);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

const calculateDistance = (row, params) => {
    // Menghitung jarak Euclidean antara baris data dan nilai parameter pengguna
    const distance = Math.sqrt(
        Math.pow(row['jumlah_lantai'] - params.jumlah_lantai, 2) +
        Math.pow(row['kamar_tidur'] - params.kamar_tidur, 2) +
        Math.pow(row['kamar_mandi'] - params.kamar_mandi, 2) +
        Math.pow(row['luas_bangunan'] - params.luas_bangunan, 2) +
        Math.pow(row['luas_tanah'] - params.luas_tanah, 2) +
        Math.pow(row['jumlah_carport'] - params.jumlah_carport, 2) +
        Math.pow(row['jumlah_garage'] - params.jumlah_garage, 2)
    );
    return distance;
};

// Fungsi untuk menghitung estimasi harga berdasarkan input pengguna menggunakan Simple Linear Regression
const calculateEstimatedPrice = async (params) => {
    const data = await parseCsv('./dataset/datasetprice.csv');
    
    // Hitung jarak untuk setiap baris data
    const distances = data.map(row => {
        return {
            row,
            distance: calculateDistance(row, params)
        };
    });

    // Urutkan berdasarkan jarak terdekat hingga terjauh
    distances.sort((a, b) => a.distance - b.distance);

    // Pisahkan data menjadi kelompok
    const closestRows = distances.slice(0, 3).map(({ row }) => row);

    // Menggabungkan hasil dari setiap kelompok
    const selectedResults = closestRows;

    // Tentukan rentang harga
    const minRow = selectedResults.reduce((prev, curr) => parseFloat(prev['price_value']) < parseFloat(curr['price_value']) ? prev : curr);
    const maxRow = selectedResults.reduce((prev, curr) => parseFloat(prev['price_value']) > parseFloat(curr['price_value']) ? prev : curr);

    // Ambil mata uang dan unit harga dari baris data terdekat
    const currencyMin = minRow['price_currency'];
    const unitMin = minRow['price_unit'];
    const currencyMax = maxRow['price_currency'];
    const unitMax = maxRow['price_unit'];

    // Tentukan rentang harga dengan mata uang dan unit yang sesuai
    const minPrice = parseFloat(minRow['price_value']);
    const maxPrice = parseFloat(maxRow['price_value']);
    const priceRange = `${currencyMin}. ${minPrice.toFixed(2)} ${unitMin} - ${currencyMax}. ${maxPrice.toFixed(2)} ${unitMax}`;

    return priceRange;
};


// Endpoint untuk estimasi harga
router.post('/estimate', async (req, res) => {
    try {
        const { jumlah_lantai, kamar_tidur, kamar_mandi, luas_bangunan, luas_tanah, jumlah_carport, jumlah_garage } = req.body;

        const estimatedPrice = await calculateEstimatedPrice({
            jumlah_lantai,
            kamar_tidur,
            kamar_mandi,
            luas_bangunan,
            luas_tanah,
            jumlah_carport,
            jumlah_garage
        });

        return res.status(200).json({ status: 'success', estimatedPrice });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghitung estimasi harga' });
    }
});

// Tambah pesanan
router.post('/add', async (req, res) => {
    try {
        const { id_pemesan, id_vendor, jumlah_lantai, kamar_tidur, kamar_mandi, luas_bangunan, luas_tanah, jumlah_carport, jumlah_garage } = req.body;
        const estimatedPrice = await calculateEstimatedPrice(req.body);

        const id = uuidv4();
        await db.collection('orders').doc(id).set({
            id:id,
            id_pemesan,
            id_vendor,
            jumlah_lantai,
            kamar_tidur,
            kamar_mandi,
            luas_bangunan,
            luas_tanah,
            jumlah_carport,
            jumlah_garage,
            estimatedPrice,
            status: 'WAITING'
        });

        return res.status(201).json({ status: 'success', message: 'Pesanan berhasil ditambahkan', id });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan pesanan' });
    }
});

// Update pesanan
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Ambil data pesanan yang ada di database
        const orderRef = db.collection('orders').doc(id);
        const orderSnapshot = await orderRef.get();

        if (!orderSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        // Mendapatkan data pesanan yang ada
        const existingOrderData = orderSnapshot.data();

        // Mendapatkan data yang dikirimkan dalam permintaan pembaruan
        const { jumlah_lantai, kamar_tidur, kamar_mandi, luas_bangunan, luas_tanah, jumlah_carport, jumlah_garage, status } = req.body;

        // Memeriksa dan mengganti nilai yang dikirimkan dalam permintaan pembaruan
        const updateData = {
            jumlah_lantai: jumlah_lantai || existingOrderData.jumlah_lantai,
            kamar_tidur: kamar_tidur || existingOrderData.kamar_tidur,
            kamar_mandi: kamar_mandi || existingOrderData.kamar_mandi,
            luas_bangunan: luas_bangunan || existingOrderData.luas_bangunan,
            luas_tanah: luas_tanah || existingOrderData.luas_tanah,
            jumlah_carport: jumlah_carport || existingOrderData.jumlah_carport,
            jumlah_garage: jumlah_garage || existingOrderData.jumlah_garage,
            status: status || existingOrderData.status
        };

        // Melakukan pembaruan hanya jika ada setidaknya satu parameter yang dikirimkan
        const parametersToUpdate = Object.values(updateData).some(value => value !== undefined);

        if (parametersToUpdate) {
            // Lakukan pembaruan data
            await orderRef.update(updateData);
            
            // Hitung ulang estimasi harga setelah pembaruan data
            const estimatedPrice = await calculateEstimatedPrice(updateData);

            // Menyimpan estimasi harga yang telah dihitung ulang ke dalam database
            await orderRef.update({ estimatedPrice });

            // Mengembalikan respons dengan estimasi harga yang diperbarui
            return res.status(200).json({ status: 'success', message: 'Pesanan berhasil diperbarui', estimatedPrice });
        } else {
            return res.status(400).json({ status: 'error', message: 'Tidak ada data yang dikirim untuk diperbarui' });
        }
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat memperbarui pesanan' });
    }
});

// Hapus pesanan
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const orderRef = db.collection('orders').doc(id);
        const orderSnapshot = await orderRef.get();

        if (!orderSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        await orderRef.delete();

        return res.status(200).json({ status: 'success', message: 'Pesanan berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghapus pesanan' });
    }
});

// Lihat pesanan
router.get('/view/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const orderSnapshot = await db.collection('orders').doc(id).get();

        if (!orderSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        return res.status(200).json({ status: 'success', data: orderSnapshot.data() });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat pesanan' });
    }
});

// Lihat pesanan berdasarkan id_pemesan
router.get('/view_by_client/:id_pemesan', async (req, res) => {
    try {
        const { id_pemesan } = req.params;

        const ordersSnapshot = await db.collection('orders').where('id_pemesan', '==', id_pemesan).get();

        if (ordersSnapshot.empty) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push(doc.data());
        });

        return res.status(200).json({ status: 'success', data: orders });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat pesanan' });
    }
});

// Lihat pesanan berdasarkan ID vendor
router.get('/view_by_vendor/:id_vendor', async (req, res) => {
    try {
        const { id_vendor } = req.params;

        const ordersSnapshot = await db.collection('orders').where('id_vendor', '==', id_vendor).get();

        if (ordersSnapshot.empty) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan untuk ID vendor yang diberikan' });
        }

        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push(doc.data());
        });

        return res.status(200).json({ status: 'success', data: orders });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat pesanan berdasarkan ID vendor' });
    }
});



module.exports = router;
