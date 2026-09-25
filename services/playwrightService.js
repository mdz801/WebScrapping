/**
 * Servicio de scraping usando peticiones HTTP + Cheerio
 * (Sin Playwright para ahorrar memoria)
 */

const cheerio = require('cheerio');

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 20000);

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Timeout al contactar ${url} (${timeoutMs}ms). En hosting esto suele ser IP bloqueada o red lenta.`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

const info = async (startDate, endDate, terms) => {
    console.log('=== INICIO SCRAPING ===');
    console.log(`Parámetros: startDate=${startDate}, endDate=${endDate}, terms=${terms}`);
    
    try {
        // Paso 1: Obtener página principal para cookies
        console.log('[1/4] Obteniendo sesión...');
        const mainResponse = await fetchWithTimeout('https://diariooficial.elperuano.pe/normas', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8'
            }
        });

        if (!mainResponse.ok) {
            throw new Error(`El Peruano respondió ${mainResponse.status} al abrir /normas`);
        }
        
        const cookies = mainResponse.headers.get('set-cookie') || '';
        console.log('[1/4] Sesión OK');
        
        // Paso 2: Hacer búsqueda POST
        console.log('[2/4] Buscando normas...');
        const dateParam = encodeURIComponent(`${endDate} 00:00:00`);
        
        const formData = new URLSearchParams();
        formData.append('cddesde', startDate);
        formData.append('cdhasta', endDate);
        
        const searchResponse = await fetchWithTimeout(
            `https://diariooficial.elperuano.pe/Normas/Filtro?dateparam=${dateParam}`,
            {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html, */*; q=0.01',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Origin': 'https://diariooficial.elperuano.pe',
                    'Referer': 'https://diariooficial.elperuano.pe/normas',
                    'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
                    'Cookie': cookies
                },
                body: formData.toString()
            }
        );

        if (!searchResponse.ok) {
            throw new Error(`El Peruano respondió ${searchResponse.status} en /Normas/Filtro`);
        }
        
        const html = await searchResponse.text();
        console.log(`[2/4] Respuesta: ${html.length} bytes`);
        
        // Verificar si hay error o sin resultados
        if (html.includes('No se encontr') || html.length < 200) {
            return { data: [], reason: 'no_results', message: 'No se encontraron normas en ese rango de fechas.' };
        }
        
        // Paso 3: Parsear HTML con Cheerio
        console.log('[3/4] Parseando resultados...');
        const $ = cheerio.load(html);
        const results = [];
        const keywords = terms ? terms.toLowerCase().split(' ').filter(w => w.length > 0) : [];
        
        // DEBUG: Mostrar estructura
        console.log('[DEBUG] Tags encontrados:');
        console.log('  - articles:', $('article').length);
        console.log('  - divs con clase:', $('div[class]').length);
        console.log('  - h4:', $('h4').length);
        console.log('  - h5:', $('h5').length);
        console.log('  - inputs dataUrl:', $('input.dataUrl, .dataUrl').length);
        console.log('  - botones descarga:', $('button, a[href*="pdf"], [onclick*="pdf"]').length);
        
        // Preferir data-url real de epdoc2 (aunque esté en comentarios HTML).
        // Los <a href="busquedas..."> a menudo dan 404 / "temporarily unavailable".
        const extractPdfFromArticleHtml = (articleHtml) => {
            if (!articleHtml) return '';
            const individual = articleHtml.match(/data-url="(https:\/\/epdoc2\.elperuano\.pe\/EpPo\/DescargaIN\.asp\?[^"]+)"/i);
            if (individual) return individual[1];
            const anyEpdoc = articleHtml.match(/data-url="(https:\/\/epdoc2\.elperuano\.pe\/[^"]+)"/i);
            if (anyEpdoc) return anyEpdoc[1];
            const anyDataUrl = articleHtml.match(/data-url="(https?:\/\/[^"]+)"/i);
            return anyDataUrl ? anyDataUrl[1] : '';
        };

        // Estrategia 1: Buscar por artículos
        $('article').each((i, article) => {
            const $art = $(article);
            const org = $art.find('h4').first().text().trim();
            const $titleLink = $art.find('h5 a').first();
            const title = ($titleLink.text() || $art.find('h5').first().text() || '').trim();
            
            // Buscar fecha
            let date = '';
            const dateMatch = $art.text().match(/Fecha:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
            if (dateMatch) date = dateMatch[1];
            
            // 1) data-url comentados (PDF real)
            let pdfLink = extractPdfFromArticleHtml($.html(article));

            // 2) input.dataUrl vivo
            if (!pdfLink) {
                const pdfInput = $art.find('input.dataUrl, [data-url]').first();
                if (pdfInput.length) {
                    const dataUrl = pdfInput.attr('data-url');
                    if (dataUrl) pdfLink = dataUrl.trim();
                }
            }

            // 3) último recurso: enlace visible (puede fallar en busquedas)
            if (!pdfLink) {
                const descargaA = $art.find('a.buttonaction').filter((j, el) => {
                    const t = $(el).text().toLowerCase();
                    return t.includes('descarga individual') || t.includes('descargar');
                }).first();
                if (descargaA.length && descargaA.attr('href')) {
                    pdfLink = descargaA.attr('href').trim();
                } else if ($titleLink.attr('href')) {
                    pdfLink = $titleLink.attr('href').trim();
                }
            }

            if (pdfLink && pdfLink.startsWith('../')) {
                pdfLink = new URL(pdfLink, 'https://diariooficial.elperuano.pe/').href;
            }
            
            // Buscar resumen
            const summary = $art.find('p').slice(1).first().text().trim().substring(0, 300);
            
            if (title) {
                results.push({ organization: org, title, date, pdfLink, summary });
            }
        });
        
        // Estrategia 2: Si no hay articles, buscar por estructura de divs
        if (results.length === 0) {
            console.log('[3/4] Buscando estructura alternativa...');
            
            // Buscar todos los inputs con data-url (cada uno es una norma)
            $('input.dataUrl, input[data-url]').each((i, input) => {
                const $input = $(input);
                const dataUrl = $input.attr('data-url');
                const dataId = $input.attr('data-id');
                
                if (!dataUrl) return;
                
                // Buscar el contenedor padre
                const $container = $input.closest('div').parent();
                const fullText = $container.text();
                
                // Extraer organización (buscar h4 o texto en mayúsculas)
                let org = $container.find('h4, h3').first().text().trim();
                if (!org) {
                    const orgMatch = fullText.match(/^([A-ZÁÉÍÓÚÑ\s]{10,})(?=\s|$)/m);
                    if (orgMatch) org = orgMatch[1].trim();
                }
                
                // Extraer título (decreto, resolución, etc.)
                let title = $container.find('h5, h5 a').first().text().trim();
                if (!title) {
                    const titleMatch = fullText.match(/((?:DECRETO|RESOLUCIÓN|ACUERDO|LEY|ORDENANZA)[^\n]{0,100})/i);
                    if (titleMatch) title = titleMatch[1].trim();
                }
                
                // Extraer fecha
                let date = '';
                const dateMatch = fullText.match(/Fecha:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
                if (dateMatch) date = dateMatch[1];
                
                // Construir link PDF
                const pdfLink = `https://diariooficial.elperuano.pe/Normas/obtenerDocumentoLegal/${dataId}?link=${encodeURIComponent(dataUrl)}`;
                
                // Resumen
                const summary = fullText.replace(org, '').replace(title, '').substring(0, 250).trim();
                
                if (title && !results.some(r => r.title === title)) {
                    results.push({ organization: org, title, date, pdfLink, summary });
                }
            });
        }
        
        // Estrategia 3: Parsing genérico por texto
        if (results.length === 0) {
            console.log('[3/4] Usando parsing genérico...');
            
            // Buscar todos los bloques que contengan tipos de norma
            const text = $.text();
            const normaRegex = /(DECRETO\s+(?:SUPREMO|LEGISLATIVO|DE URGENCIA)|RESOLUCIÓN\s+(?:MINISTERIAL|SUPREMA|DIRECTORAL)|ACUERDO|LEY\s+N|ORDENANZA)[^\n]{0,120}/gi;
            const matches = text.match(normaRegex) || [];
            
            matches.slice(0, 50).forEach(match => {
                const title = match.trim();
                if (!results.some(r => r.title === title)) {
                    results.push({
                        organization: '',
                        title: title,
                        date: '',
                        pdfLink: '',
                        summary: ''
                    });
                }
            });
        }
        
        // Filtrar por keywords
        const filtered = keywords.length > 0
            ? results.filter(item => {
                const texto = `${item.organization} ${item.title} ${item.summary}`.toLowerCase();
                return keywords.some(w => texto.includes(w));
            })
            : results;
        
        console.log(`[4/4] Extraídas: ${filtered.length} normas`);
        if (filtered.length > 0) {
            console.log(`[4/4] Primera: ${filtered[0].title.substring(0, 50)}`);
            console.log(`[4/4] PDF: ${filtered[0].pdfLink ? 'Sí' : 'No'}`);
        }
        
        return {
            data: filtered,
            reason: filtered.length > 0 ? 'ok' : 'no_results',
            message: filtered.length === 0 ? 'No se encontraron normas con esos filtros.' : null
        };
        
    } catch (error) {
        console.error('=== ERROR ===');
        console.error(error.message);
        // Relanzar para que el controlador devuelva HTTP 502/500 JSON (no 200 vacío)
        throw error;
    }
};

module.exports = { info };
