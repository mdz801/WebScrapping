const { info } = require('../services/playwrightService');

const getInfo = async (req, res) => {
    // Asignamos un string vacío por defecto si el parámetro no viene en la URL
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";
    const terms = req.query.terms || "";

    try {
        const linksArray = await info(startDate, endDate, terms); 
        res.json({
            success: true,
            count: linksArray.length,
            data: linksArray
        });
    } catch (error) {
        console.error("Error en el controlador:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getInfo };