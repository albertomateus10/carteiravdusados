const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1ZXum0nBBdqZSwIddWKTyh5IUswc20KHGdyvB36mGh_Q/gviz/tq?tqx=out:csv&gid=0';

// Global state
let allData = [];
let isFetching = false;
const filters = {
    loja: 'all',
    ano: 'all',
    mes: 'all',
    search: ''
};

// DOM Elements
const elements = {
    tableBody: document.getElementById('table-body'),
    filterLoja: document.getElementById('filter-loja'),
    filterAno: document.getElementById('filter-ano'),
    filterMes: document.getElementById('filter-mes'),
    search: document.getElementById('table-search'),
    totalCars: document.getElementById('stat-total-cars'),
    totalValue: document.getElementById('stat-total-value'),
    avgValue: document.getElementById('stat-avg-value'),
    loading: document.getElementById('loading-overlay'),
    refreshBtn: document.getElementById('refresh-btn'),
    kpiLojas: document.getElementById('kpi-lojas-list'),
    kpiTopVendedor: document.getElementById('kpi-top-vendedor'),
    kpiTopVendedorCount: document.getElementById('kpi-top-vendedor-count'),
    kpiTopModelo: document.getElementById('kpi-top-modelo'),
    kpiTopModeloCount: document.getElementById('kpi-top-modelo-count')
};

/**
 * Initialize Dashboard
 */
async function init() {
    console.log('Inicializando...');
    setupEventListeners();
    await fetchData();
}

/**
 * Setup UI Event Listeners
 */
function setupEventListeners() {
    elements.filterLoja.addEventListener('change', (e) => {
        filters.loja = e.target.value;
        render();
    });

    elements.filterAno.addEventListener('change', (e) => {
        filters.ano = e.target.value;
        render();
    });

    elements.filterMes.addEventListener('change', (e) => {
        filters.mes = e.target.value;
        render();
    });

    elements.search.addEventListener('input', (e) => {
        filters.search = e.target.value.toLowerCase();
        render();
    });

    elements.refreshBtn.addEventListener('click', () => {
        clearFilters();
        fetchData();
    });
}

/**
 * Reset all filters to default
 */
function clearFilters() {
    filters.loja = 'all';
    filters.ano = 'all';
    filters.mes = 'all';
    filters.search = '';

    elements.filterLoja.value = 'all';
    elements.filterAno.value = 'all';
    elements.filterMes.value = 'all';
    elements.search.value = '';

    render();
}

/**
 * Fetch and Parse CSV Data
 */
async function fetchData() {
    if (isFetching) return;

    isFetching = true;
    elements.loading.classList.add('active');
    console.log('Iniciando busca de dados...');

    try {
        const response = await fetch(SHEETS_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const csvText = await response.text();
        console.log('Dados recebidos, tamanho:', csvText.length);

        const newData = parseCSV(csvText);
        console.log('Dados processados:', newData.length, 'linhas');

        if (newData.length === 0) {
            console.warn('Nenhum dado processado do CSV. Verifique a estrutura da planilha.');
        } else {
            allData = newData;
            populateFilterOptions();
            render();
        }
    } catch (error) {
        console.error('Erro detalhado:', error);
        let msg = 'Erro ao carregar dados: ' + error.message;
        if (error.message === 'Failed to fetch' && window.location.protocol === 'file:') {
            msg += '\n\nO navegador bloqueou o acesso à planilha por segurança (CORS). Isso acontece ao abrir o arquivo diretamente.\n\nPara funcionar: Use um servidor local (como npx serve) ou tente abrir em outro navegador.';
        } else {
            msg += '\n\nCertifique-se que a planilha está publicada e você tem conexão com a internet.';
        }
        alert(msg);
    } finally {
        elements.loading.classList.remove('active');
        isFetching = false;
    }
}

/**
 * Simple CSV Parser for Google Sheets
 */
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const data = [];

    // Find the header row - looking for 'Loja' and 'Vendedor' in any case
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase();
        if (lowerLine.includes('data') && lowerLine.includes('loja') && lowerLine.includes('vendedor')) {
            headerIdx = i;
            console.log('Cabeçalho encontrado na linha:', i);
            break;
        }
    }

    if (headerIdx === -1) {
        console.error('Cabeçalho não encontrado no CSV');
        return [];
    }

    const rows = lines.slice(headerIdx + 1);

    for (let rowText of rows) {
        if (!rowText.trim() || rowText.split(',').every(cell => !cell.trim())) continue;

        // Custom parser to handle quotes and commas manually
        const row = [];
        let inQuotes = false;
        let currentCell = '';

        for (let char of rowText) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        row.push(currentCell.trim());

        // Map columns based on structure observed:
        // Raw starts with comma often: "", "Data", "Loja", "Vendedor", "Modelo", "Valor", "Placa"
        // Let's find the indices of data dynamically if possible, or assume based on first non-empty

        // Find 'Data' column index by checking the header row again
        const headerRow = [];
        let hInQuotes = false;
        let hCurrentCell = '';
        for (let char of lines[headerIdx]) {
            if (char === '"') hInQuotes = !hInQuotes;
            else if (char === ',' && !hInQuotes) { headerRow.push(hCurrentCell.toLowerCase().trim()); hCurrentCell = ''; }
            else hCurrentCell += char;
        }
        headerRow.push(hCurrentCell.toLowerCase().trim());

        const idxData = headerRow.indexOf('data');
        const idxLoja = headerRow.indexOf('loja');
        const idxVendedor = headerRow.indexOf('vendedor');
        const idxModelo = headerRow.findIndex(h => h.includes('modelo'));
        const idxValor = headerRow.findIndex(h => h.includes('valor'));
        const idxPlaca = headerRow.indexOf('placa');

        const rawDate = row[idxData];
        if (!rawDate || rawDate.toLowerCase() === 'data') continue;

        const dateParts = rawDate.split('/');
        const year = dateParts.length === 3 ? (dateParts[2].length === 2 ? '20' + dateParts[2] : dateParts[2]) : inferYear(dateParts[1]);

        let rawModelo = row[idxModelo] || 'N/A';
        // Normaliza o modelo pegando apenas o primeiro nome (ex: "Toro Freedom" -> "Toro")
        const modeloNormalizado = rawModelo.trim().split(' ')[0];

        data.push({
            data: rawDate,
            loja: row[idxLoja] || 'N/A',
            vendedor: row[idxVendedor] || 'N/A',
            modelo: modeloNormalizado,
            valor: parseCurrency(row[idxValor]),
            valorRaw: row[idxValor],
            placa: row[idxPlaca] || '-',
            mes: getMonthFromDate(rawDate),
            ano: year
        });
    }
    return data;
}

/**
 * Infer Year based on Month if missing
 * 11, 12 -> 2024 (pre-project start or just before Jan 2025)
 * 1, 2, 3... -> 2025
 */
function inferYear(monthStr) {
    const month = parseInt(monthStr);
    if (month >= 11) return '2024';
    return '2025';
}

/**
 * Parse currency string to number
 */
function parseCurrency(val) {
    if (!val) return 0;
    // Format: "R$ 89.000,00" -> 89000
    // Remove R$ (case insensitive because users might type it manually), dots, and convert comma to dot
    let clean = val.replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(clean) || 0;
}

/**
 * Get month name
 */
function getMonthFromDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length < 2) return 'Desconhecido';

    const monthIndex = parseInt(parts[1]) - 1;
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[monthIndex] || 'Desconhecido';
}

/**
 * Fill dropdowns with unique options
 */
function populateFilterOptions() {
    const lojas = [...new Set(allData.map(d => d.loja))].filter(Boolean).sort();
    const anos = [...new Set(allData.map(d => d.ano))].sort();
    const meses = [...new Set(allData.map(d => d.mes))];

    const monthOrder = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    meses.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

    // Lojas
    elements.filterLoja.innerHTML = '<option value="all">Todas as Lojas</option>';
    lojas.forEach(loja => {
        const opt = document.createElement('option');
        opt.value = loja;
        opt.textContent = loja;
        elements.filterLoja.appendChild(opt);
    });

    // Anos
    elements.filterAno.innerHTML = '<option value="all">Todos os Anos</option>';
    anos.forEach(ano => {
        const opt = document.createElement('option');
        opt.value = ano;
        opt.textContent = ano;
        elements.filterAno.appendChild(opt);
    });

    // Meses
    elements.filterMes.innerHTML = '<option value="all">Todos os Meses</option>';
    meses.forEach(mes => {
        const opt = document.createElement('option');
        opt.value = mes;
        opt.textContent = mes;
        elements.filterMes.appendChild(opt);
    });
}

/**
 * Filter and Render
 */
function render() {
    const filtered = allData.filter(item => {
        const matchLoja = filters.loja === 'all' || item.loja === filters.loja;
        const matchAno = filters.ano === 'all' || item.ano === filters.ano;
        const matchMes = filters.mes === 'all' || item.mes === filters.mes;
        const matchSearch = !filters.search ||
            item.modelo.toLowerCase().includes(filters.search) ||
            item.vendedor.toLowerCase().includes(filters.search) ||
            item.placa.toLowerCase().includes(filters.search);

        return matchLoja && matchAno && matchMes && matchSearch;
    });

    // Update Stats
    const totalCount = filtered.length;
    const totalValNum = filtered.reduce((acc, curr) => acc + curr.valor, 0);
    const avgValNum = totalCount > 0 ? totalValNum / totalCount : 0;

    elements.totalCars.textContent = totalCount;
    elements.totalValue.textContent = formatCurrency(totalValNum);
    elements.avgValue.textContent = formatCurrency(avgValNum);

    // Render Table
    elements.tableBody.innerHTML = filtered.map(item => `
        <tr>
            <td>${item.data}</td>
            <td>${item.loja}</td>
            <td>${item.vendedor}</td>
            <td>${item.modelo}</td>
            <td>${item.placa}</td>
            <td class="valor-cell">${item.valorRaw || formatCurrency(item.valor)}</td>
        </tr>
    `).join('');

    if (filtered.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">Nenhum veículo encontrado para os filtros selecionados.</td></tr>';
    }

    renderExtraKPIs(filtered);
}

/**
 * Calculate and render extra KPIs
 */
function renderExtraKPIs(data) {
    if (!data || data.length === 0) {
        elements.kpiLojas.innerHTML = '<div class="loja-item">Nenhum dado</div>';
        elements.kpiTopVendedor.textContent = '-';
        elements.kpiTopVendedorCount.textContent = '0 carros';
        elements.kpiTopModelo.textContent = '-';
        elements.kpiTopModeloCount.textContent = '0 carros';
        return;
    }

    // Carros por Loja
    const lojasCount = data.reduce((acc, curr) => {
        acc[curr.loja] = (acc[curr.loja] || 0) + 1;
        return acc;
    }, {});

    elements.kpiLojas.innerHTML = Object.entries(lojasCount)
        .sort((a, b) => b[1] - a[1])
        .map(([loja, count]) => `
            <div class="loja-item">
                <span class="loja-name">${loja}</span>
                <span class="loja-count">${count}</span>
            </div>
        `).join('');

    // Top Vendedor
    const vendedorCount = data.reduce((acc, curr) => {
        if (curr.vendedor && curr.vendedor !== 'N/A') {
            acc[curr.vendedor] = (acc[curr.vendedor] || 0) + 1;
        }
        return acc;
    }, {});

    const topVendedor = Object.entries(vendedorCount).sort((a, b) => b[1] - a[1])[0];
    if (topVendedor) {
        elements.kpiTopVendedor.textContent = topVendedor[0];
        elements.kpiTopVendedorCount.textContent = `${topVendedor[1]} ${topVendedor[1] === 1 ? 'carro' : 'carros'}`;
    }

    // Modelo Mais Recebido
    const modeloCount = data.reduce((acc, curr) => {
        if (curr.modelo && curr.modelo !== 'N/A') {
            acc[curr.modelo] = (acc[curr.modelo] || 0) + 1;
        }
        return acc;
    }, {});

    const topModelo = Object.entries(modeloCount).sort((a, b) => b[1] - a[1])[0];
    if (topModelo) {
        elements.kpiTopModelo.textContent = topModelo[0];
        elements.kpiTopModeloCount.textContent = `${topModelo[1]} ${topModelo[1] === 1 ? 'carro' : 'carros'}`;
    }
}

/**
 * Format currency
 */
function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(val);
}

// Start app - using DOMContentLoaded for better reliability
document.addEventListener('DOMContentLoaded', () => {
    init();
});

// Fallback: se por algum motivo os dados não carregarem em 3 segundos, tenta forçar apenas o fetch
setTimeout(() => {
    if (allData.length === 0 && !isFetching) {
        console.log('Tentativa de carregamento de segurança (fallback)...');
        fetchData();
    }
}, 3000);
