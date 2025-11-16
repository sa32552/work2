const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Base de données SQLite
const db = new sqlite3.Database(':memory:');

// Initialisation de la base
db.serialize(() => {
  // Table utilisateurs
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    type TEXT,
    boutiqueName TEXT,
    phone TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Table formulaires
  db.run(`CREATE TABLE IF NOT EXISTS formulaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boutiqueId INTEGER,
    boutiqueName TEXT,
    clientName TEXT,
    produit TEXT,
    prix TEXT,
    heureLivraison TEXT,
    localisation TEXT,
    status TEXT DEFAULT 'en_attente',
    livreurId INTEGER,
    livreurName TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Table messages
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromId INTEGER,
    toId INTEGER,
    content TEXT,
    type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Créer l'admin et livreurs par défaut
  const initUsers = () => {
    const hashedAdminPassword = bcrypt.hashSync('admin123', 10);
    const hashedLivreurPassword = bcrypt.hashSync('livreur123', 10);
    
    const users = [
      { email: 'admin@premium.com', password: hashedAdminPassword, name: 'Admin Principal', type: 'admin' },
      { email: 'livreur1@premium.com', password: hashedLivreurPassword, name: 'Jean Dupont', type: 'livreur' },
      { email: 'livreur2@premium.com', password: hashedLivreurPassword, name: 'Marie Martin', type: 'livreur' }
    ];

    users.forEach(user => {
      db.run("INSERT OR IGNORE INTO users (email, password, name, type) VALUES (?, ?, ?, ?)", 
        [user.email, user.password, user.name, user.type], 
        function(err) {
          if (err) {
            console.log('Erreur création utilisateur:', err);
          } else {
            console.log('✅ Utilisateur créé:', user.email);
          }
        }
      );
    });
  };

  initUsers();
});

// ==================== ROUTES ====================

// Test serveur
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Serveur Premium Delivery ACTIF!',
    status: 'En ligne',
    database: 'SQLite intégrée',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/login',
      'POST /api/register-boutique', 
      'GET /api/boutiques',
      'GET /api/livreurs',
      'GET /api/test-users'
    ]
  });
});

// 🔑 CONNEXION - ROUTE CORRIGÉE
app.post('/api/login', (req, res) => {
  console.log('📧 Tentative de connexion reçue:', req.body);
  
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err) {
      console.error('❌ Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé:', email);
      return res.status(400).json({ error: 'Utilisateur non trouvé' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      console.log('❌ Mot de passe incorrect pour:', email);
      return res.status(400).json({ error: 'Mot de passe incorrect' });
    }

    console.log('✅ Connexion réussie:', user.email);
    
    const token = jwt.sign({ 
      userId: user.id, 
      type: user.type 
    }, 'premium_delivery_secret_2024');

    const response = {
      message: 'Connexion réussie',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type,
        boutiqueName: user.boutiqueName || null
      }
    };
    
    console.log('📤 Envoi réponse:', JSON.stringify(response));
    res.json(response);
  });
});

// 👥 INSCRIPTION BOUTIQUE
app.post('/api/register-boutique', (req, res) => {
  console.log('🏪 Inscription boutique:', req.body);
  
  const { email, password, name, boutiqueName, phone } = req.body;
  
  if (!email || !password || !name || !boutiqueName) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
  }

  db.get("SELECT id FROM users WHERE email = ?", [email], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (row) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run("INSERT INTO users (email, password, name, boutiqueName, phone, type) VALUES (?, ?, ?, ?, ?, 'boutique')",
      [email, hashedPassword, name, boutiqueName, phone || ''],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const token = jwt.sign({ 
          userId: this.lastID, 
          type: 'boutique' 
        }, 'premium_delivery_secret_2024');
        
        const response = {
          message: 'Boutique inscrite avec succès',
          token: token,
          user: {
            id: this.lastID,
            email: email,
            name: name,
            boutiqueName: boutiqueName,
            type: 'boutique'
          }
        };
        
        res.json(response);
      }
    );
  });
});

// 📊 TEST - LISTE DES UTILISATEURS
app.get('/api/test-users', (req, res) => {
  db.all("SELECT id, email, name, type FROM users", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ 
      message: 'Liste des utilisateurs',
      count: rows.length,
      users: rows 
    });
  });
});

// 🏪 LISTE DES BOUTIQUES
app.get('/api/boutiques', (req, res) => {
  db.all("SELECT * FROM users WHERE type = 'boutique'", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 🚗 LISTE DES LIVREURS
app.get('/api/livreurs', (req, res) => {
  db.all("SELECT * FROM users WHERE type = 'livreur'", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 📝 NOUVEAU FORMULAIRE
app.post('/api/formulaire', (req, res) => {
  const { boutiqueId, clientName, produit, prix, heureLivraison, localisation } = req.body;
  
  db.get("SELECT boutiqueName FROM users WHERE id = ?", [boutiqueId], (err, boutique) => {
    if (err || !boutique) {
      return res.status(400).json({ error: 'Boutique non trouvée' });
    }

    db.run(`INSERT INTO formulaires 
      (boutiqueId, boutiqueName, clientName, produit, prix, heureLivraison, localisation) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [boutiqueId, boutique.boutiqueName, clientName, produit, prix, heureLivraison, localisation],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const formulaire = {
          id: this.lastID,
          boutiqueId,
          boutiqueName: boutique.boutiqueName,
          clientName,
          produit,
          prix,
          heureLivraison,
          localisation,
          status: 'en_attente',
          createdAt: new Date()
        };

        io.emit('new_formulaire', formulaire);
        res.json({ message: 'Formulaire envoyé avec succès', formulaire });
      }
    );
  });
});

// 🔧 ROUTE TEST PING
app.get('/api/ping', (req, res) => {
  res.json({ 
    message: 'pong', 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// ==================== WEBSOCKET ====================
io.on('connection', (socket) => {
  console.log('👤 Client connecté:', socket.id);
  
  socket.on('join_user', (userId) => {
    socket.join(userId);
    console.log(`📍 Utilisateur ${userId} rejoint sa room`);
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Client déconnecté:', socket.id);
  });
});

// ==================== DÉMARRAGE ====================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur Premium Delivery DÉMARRÉ!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 URL: https://premium-delivery-server1-production.up.railway.app`);
  console.log(`🗄️ Base de données: SQLite intégrée`);
  console.log(`👤 Compte test: admin@premium.com / admin123`);
});