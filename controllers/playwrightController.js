const { info } = require('../services/playwrightService');

const getInfo = async (req, res) => {
    // Asignamos un string vacío por defecto si el parámetro no viene en la URL
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";
    const terms = req.query.terms || "";

    try {
        const result = await info(startDate, endDate, terms);
        const data = Array.isArray(result) ? result : (result.data || []);
        const reason = result.reason || (data.length === 0 ? 'no_results' : 'ok');
        const message = result.message || null;
        res.json({
            success: true,
            count: data.length,
            data,
            reason,
            message
        });
    } catch (error) {
        console.error("Error en el controlador:", error);
        const msg = error && error.message ? error.message : String(error);
        const isTimeout = /timeout/i.test(msg);
        res.status(isTimeout ? 504 : 502).json({
            success: false,
            message: msg,
            hint: 'En Render/free hosting el sitio del Peruano a veces bloquea la IP del servidor o el request supera el timeout del proxy.'
        });
    }
};

module.exports = { getInfo };