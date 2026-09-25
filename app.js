const express = require('express');
const path = require('path');
const { exec } = require('child_process'); 
const linkRoutes = require('./routes/linkRoutes');

const app = express();

// Evitar que proxies corten lecturas largas sin respuesta
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'WebScrapping', ts: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', linkRoutes);

// JSON para rutas no encontradas de API
app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, message: 'Ruta API no encontrada' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    
    // Solo abrir navegador en desarrollo local
    if (process.env.NODE_ENV !== 'production') {
        const url = `http://localhost:${PORT}`;
        const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${start} ${url}`);
    }
});
