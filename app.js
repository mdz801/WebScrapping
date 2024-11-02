const express = require('express');
const linkRoutes = require('./routes/linkRoutes');
//Prueba
const app = express();
const PORT = 3000;


app.use('/api', linkRoutes);


app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

