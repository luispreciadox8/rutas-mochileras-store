const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'products.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Crear carpeta de uploads si no existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// Configuración de multer para subir imágenes al disco
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

function getProducts() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveProducts(prods) {
  fs.writeFileSync(DB_FILE, JSON.stringify(prods, null, 2), 'utf8');
}

// REST API Endpoints
app.get('/api/products', (req, res) => {
  res.json(getProducts());
});

app.post('/api/products/bulk', (req, res) => {
  const products = req.body;
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'Se requiere un arreglo de productos' });
  }
  saveProducts(products);
  res.json({ message: 'Inventario actualizado con éxito', count: products.length });
});

app.post('/api/products', upload.single('image'), (req, res) => {
  const { code, group, price, description, image } = req.body;
  if (!code || !group || !price || !description) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const products = getProducts();
  if (products.some(p => p.code === code.toUpperCase())) {
    return res.status(400).json({ error: 'El código de producto ya existe' });
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : (image || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&auto=format&fit=crop&q=60');

  const newProduct = {
    code: code.toUpperCase(),
    group,
    price: parseFloat(price),
    description,
    image: imageUrl,
    createdAt: new Date()
  };

  products.unshift(newProduct);
  saveProducts(products);
  res.status(201).json(newProduct);
});

app.put('/api/products/:code', upload.single('image'), (req, res) => {
  const { code } = req.params;
  const { group, price, description, image } = req.body;
  const products = getProducts();

  const idx = products.findIndex(p => p.code.toUpperCase() === code.toUpperCase());
  if (idx === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  if (group) products[idx].group = group;
  if (price) products[idx].price = parseFloat(price);
  if (description) products[idx].description = description;
  if (req.file) {
    products[idx].image = `/uploads/${req.file.filename}`;
  } else if (image) {
    products[idx].image = image;
  }

  saveProducts(products);
  res.json(products[idx]);
});

app.delete('/api/products/:code', (req, res) => {
  const { code } = req.params;
  let products = getProducts();
  products = products.filter(p => p.code.toUpperCase() !== code.toUpperCase());
  saveProducts(products);
  res.json({ message: 'Producto eliminado' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de Rutas Mochileras Store corriendo en: http://localhost:${PORT}`);
});
