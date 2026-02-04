const express = require('express');
const path = require('path');
const { exec } = require('child_process'); 
const linkRoutes = require('./routes/linkRoutes');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', linkRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${start} ${url}`);
});