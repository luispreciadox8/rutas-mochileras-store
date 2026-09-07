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
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error('Error al crear directorio uploads:', err);
  }
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// Configuración de multer para subir imágenes al disco
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `img-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

function getProducts() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('Error al leer DB_FILE:', err);
    return [];
  }
}

function saveBase64Image(base64Str) {
  if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image/')) {
    return base64Str;
  }
  try {
    const matches = base64Str.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64Str;

    let ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    const filename = `img-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error al guardar imagen base64:', err);
    return base64Str;
  }
}

function saveProducts(prods) {
  try {
    // Procesar imágenes base64 si existen y convertirlas a archivos en uploads/
    const processedProds = prods.map(p => ({
      ...p,
      image: saveBase64Image(p.image)
    }));
    fs.writeFileSync(DB_FILE, JSON.stringify(processedProds, null, 2), 'utf8');
    return processedProds;
  } catch (err) {
    console.error('Error al guardar DB_FILE:', err);
    throw err;
  }
}

// REST API Endpoints
app.get('/api/products', (req, res) => {
  try {
    res.json(getProducts());
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener inventario: ' + err.message });
  }
});

app.post('/api/products/bulk', (req, res) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Se requiere un arreglo de productos' });
    }
    const saved = saveProducts(products);
    res.json({ message: 'Inventario actualizado con éxito', count: saved.length, products: saved });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar inventario en el servidor: ' + err.message });
  }
});

app.post('/api/products', upload.single('image'), (req, res) => {
  try {
    const { code, group, price, description, image } = req.body;
    if (!code || !group || !price || !description) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (código, grupo, precio, descripción)' });
    }

    const products = getProducts();
    if (products.some(p => p.code.toUpperCase() === code.toUpperCase())) {
      return res.status(400).json({ error: `El código ${code.toUpperCase()} ya existe.` });
    }

    let imageUrl = req.file ? `/uploads/${req.file.filename}` : (image || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&auto=format&fit=crop&q=60');
    imageUrl = saveBase64Image(imageUrl);

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
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar producto: ' + err.message });
  }
});

app.put('/api/products/:code', upload.single('image'), (req, res) => {
  try {
    const { code } = req.params;
    const { group, price, description, image } = req.body;
    const products = getProducts();

    const idx = products.findIndex(p => p.code.toUpperCase() === code.toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (group) products[idx].group = group;
    if (price !== undefined) products[idx].price = parseFloat(price);
    if (description) products[idx].description = description;
    
    if (req.file) {
      products[idx].image = `/uploads/${req.file.filename}`;
    } else if (image) {
      products[idx].image = saveBase64Image(image);
    }

    saveProducts(products);
    res.json(products[idx]);
  } catch (err) {
    res.status(500).json({ error: 'Error al modificar producto: ' + err.message });
  }
});

app.delete('/api/products/:code', (req, res) => {
  try {
    const { code } = req.params;
    let products = getProducts();
    const initialLen = products.length;
    products = products.filter(p => p.code.toUpperCase() !== code.toUpperCase());
    
    if (products.length === initialLen) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    saveProducts(products);
    res.json({ message: `Producto ${code} eliminado con éxito` });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar producto: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de Rutas Mochileras Store corriendo en puerto: ${PORT}`);
});
