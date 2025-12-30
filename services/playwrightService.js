const { chromium } = require('playwright');

const info = async (startDate, endDate, terms) => {
    const browser = await chromium.launch({ 
        channel: 'chrome',
        headless: true
    });
    try {
        const page = await browser.newPage();
        
        await page.goto('https://diariooficial.elperuano.pe/normas', { waitUntil: 'networkidle' });
        await page.evaluate(({ start, end }) => {
            if (start) {
                const elStart = document.querySelector('#cddesde');
                if (elStart) elStart.value = start;
            }
            if (end) {
                const elEnd = document.querySelector('#cdhasta');
                if (elEnd) elEnd.value = end;
            }
        }, { start: startDate, end: endDate });

        if (terms) {
            const searchInput = await page.$('#txtBusqueda');
            if (searchInput) await page.fill('#txtBusqueda', terms);
        }

        await page.click('#btnBuscar');
        
        try {
            await page.waitForSelector('article.edicionesoficiales_articulos', { timeout: 10000 });
        } catch (e) {
            console.log("No se visualizaron resultados con esos filtros.");
            return [];
        }

        const results = await page.$$eval('article.edicionesoficiales_articulos', (articles, filterTerms) => {
            const keywords = filterTerms ? filterTerms.toLowerCase().split(' ') : [];

            return articles.map(art => ({
                organization: art.querySelector('h4')?.innerText.trim() || '',
                title: art.querySelector('h5 a')?.innerText.trim() || '',
                date: art.querySelector('p b')?.innerText.replace('Fecha:', '').trim() || '',
                pdfLink: art.querySelector('input.dataUrl')?.getAttribute('data-url') || '',
                summary: art.querySelectorAll('p')[1]?.innerText.trim() || ''
            })).filter(item => {
                if (keywords.length === 0) return true;
                const orgOnly = item.organization.toLowerCase();
                return keywords.some(word => orgOnly.includes(word));
            });
        }, terms);

        return results;

    } catch (error) {
        console.error("Error en el scraping:", error.message);
        return [];
    } finally {
        await browser.close();
    }
};

module.exports = { info };