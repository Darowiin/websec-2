(function () {
    'use strict';

    let settlements = [];
    let map = null;
    let clusterGroup = null;
    let charts = { temperature: null, precipitation: null, wind: null };
    let currentSettlement = null;

    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchResults = document.getElementById('search-results');
    const modal = document.getElementById('weather-modal');
    const modalCityName = document.getElementById('modal-city-name');
    const modalCityRegion = document.getElementById('modal-city-region');
    const modalClose = document.getElementById('modal-close');
    const weatherLoading = document.getElementById('weather-loading');
    const weatherError = document.getElementById('weather-error');
    const weatherCharts = document.getElementById('weather-charts');
    const weatherRetry = document.getElementById('weather-retry');
    const currentWeatherEl = document.getElementById('current-weather');
    const loadingOverlay = document.getElementById('loading-overlay');

    async function init() {
        try {
            const response = await fetch('settlements.json');
            settlements = await response.json();
            console.log(`Loaded ${settlements.length} settlements`);

            initMap();

            addMarkers();

            setupSearch();
            setupModal();

            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
                setTimeout(() => loadingOverlay.remove(), 500);
            }, 600);
        } catch (err) {
            console.error('Failed to initialize:', err);
            loadingOverlay.querySelector('p').textContent = 'Ошибка загрузки данных';
        }
    }

    function initMap() {
        map = L.map('map', {
            center: [61.5, 90],
            zoom: 4,
            minZoom: 3,
            maxZoom: 18,
            zoomControl: true,
            attributionControl: true
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);
    }

    function addMarkers() {
        clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            disableClusteringAtZoom: 10,
            chunkedLoading: true
        });

        settlements.forEach((s, index) => {
            let markerClass = 'settlement-marker';
            let size = [12, 12];
            if (s.population >= 500000) {
                markerClass += ' large-city';
                size = [16, 16];
            } else if (s.population >= 100000) {
                markerClass += ' medium-city';
                size = [14, 14];
            }

            const icon = L.divIcon({
                className: markerClass,
                iconSize: size,
                iconAnchor: [size[0] / 2, size[1] / 2]
            });

            const marker = L.marker([s.lat, s.lon], { icon });

            const popupHTML = `
                <div class="popup-content">
                    <h3>${escapeHtml(s.name)}</h3>
                    <div class="popup-region">${escapeHtml(s.region)}</div>
                    <div class="popup-pop">
                        👥 ${formatPopulation(s.population)} чел.
                    </div>
                    <button class="popup-btn" data-index="${index}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Прогноз погоды
                    </button>
                </div>
            `;

            marker.bindPopup(popupHTML, {
                maxWidth: 280,
                className: 'custom-popup'
            });

            marker.on('popupopen', () => {
                setTimeout(() => {
                    const btn = document.querySelector(`.popup-btn[data-index="${index}"]`);
                    if (btn) {
                        btn.addEventListener('click', () => {
                            map.closePopup();
                            openWeatherModal(s);
                        });
                    }
                }, 50);
            });

            clusterGroup.addLayer(marker);
        });

        map.addLayer(clusterGroup);
    }

    function setupSearch() {
        let debounceTimer = null;

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();

            searchClear.style.display = query ? 'flex' : 'none';

            if (query.length < 2) {
                hideSearchResults();
                return;
            }

            debounceTimer = setTimeout(() => {
                performSearch(query);
            }, 200);
        });

        searchInput.addEventListener('focus', () => {
            const query = searchInput.value.trim();
            if (query.length >= 2) {
                performSearch(query);
            }
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            hideSearchResults();
            searchInput.focus();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-container')) {
                hideSearchResults();
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideSearchResults();
                searchInput.blur();
            }
        });
    }

    function performSearch(query) {
        const normalizedQuery = query.toLowerCase();
        const results = settlements
            .filter(s => s.name.toLowerCase().includes(normalizedQuery))
            .slice(0, 15);

        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
        } else {
            searchResults.innerHTML = results.map((s, i) => `
                <div class="search-result-item" data-lat="${s.lat}" data-lon="${s.lon}" data-index="${settlements.indexOf(s)}">
                    <div class="result-icon">📍</div>
                    <div class="result-text">
                        <div class="result-name">${highlightMatch(s.name, query)}</div>
                        <div class="result-region">${escapeHtml(s.region)}</div>
                    </div>
                    <div class="result-pop">${formatPopulation(s.population)}</div>
                </div>
            `).join('');
        }

        showSearchResults();

        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const lat = parseFloat(item.dataset.lat);
                const lon = parseFloat(item.dataset.lon);
                const idx = parseInt(item.dataset.index);

                hideSearchResults();
                searchInput.value = settlements[idx].name;
                searchClear.style.display = 'flex';

                map.flyTo([lat, lon], 12, { duration: 1.5 });
                setTimeout(() => {
                    openWeatherModal(settlements[idx]);
                }, 800);
            });
        });
    }

    function showSearchResults() {
        searchResults.classList.add('active');
    }

    function hideSearchResults() {
        searchResults.classList.remove('active');
    }

    function highlightMatch(text, query) {
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        return escaped.replace(regex, '<strong style="color: var(--accent-blue);">$1</strong>');
    }

    function setupModal() {
        modalClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display !== 'none') {
                closeModal();
            }
        });
        weatherRetry.addEventListener('click', () => {
            if (currentSettlement) {
                loadWeather(currentSettlement);
            }
        });
    }

    function openWeatherModal(settlement) {
        currentSettlement = settlement;
        modalCityName.textContent = settlement.name;
        modalCityRegion.textContent = `${settlement.region} · ${formatPopulation(settlement.population)} жителей`;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadWeather(settlement);
    }

    function closeModal() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        destroyCharts();
    }

    async function loadWeather(settlement) {
        weatherLoading.style.display = 'flex';
        weatherError.style.display = 'none';
        weatherCharts.style.display = 'none';

        try {
            const url = `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${settlement.lat}&longitude=${settlement.lon}` +
                `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weathercode` +
                `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weathercode` +
                `&timezone=auto` +
                `&forecast_days=7`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            weatherLoading.style.display = 'none';
            weatherCharts.style.display = 'block';

            renderCurrentWeather(data);
            renderCharts(data);
        } catch (err) {
            console.error('Weather fetch error:', err);
            weatherLoading.style.display = 'none';
            weatherError.style.display = 'flex';
        }
    }

    function renderCurrentWeather(data) {
        const current = data.current;
        const weatherDesc = getWeatherDescription(current.weathercode);

        currentWeatherEl.innerHTML = `
            <div class="weather-stat">
                <div class="stat-icon">${weatherDesc.icon}</div>
                <div class="stat-value">${Math.round(current.temperature_2m)}°C</div>
                <div class="stat-label">Сейчас</div>
            </div>
            <div class="weather-stat">
                <div class="stat-icon">🌡️</div>
                <div class="stat-value">${Math.round(current.apparent_temperature)}°C</div>
                <div class="stat-label">Ощущается</div>
            </div>
            <div class="weather-stat">
                <div class="stat-icon">💧</div>
                <div class="stat-value">${current.relative_humidity_2m}%</div>
                <div class="stat-label">Влажность</div>
            </div>
            <div class="weather-stat">
                <div class="stat-icon">💨</div>
                <div class="stat-value">${Math.round(current.wind_speed_10m)}</div>
                <div class="stat-label">Ветер, км/ч</div>
            </div>
            <div class="weather-stat">
                <div class="stat-icon">🌧️</div>
                <div class="stat-value">${current.precipitation}</div>
                <div class="stat-label">Осадки, мм</div>
            </div>
        `;
    }

    function renderCharts(data) {
        destroyCharts();

        const daily = data.daily;
        const labels = daily.time.map(d => {
            const date = new Date(d);
            const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
            const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
            return `${dayNames[date.getDay()]}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
        });

        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { family: "'Inter', sans-serif", size: 12 },
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(148, 163, 184, 0.2)',
                    borderWidth: 1,
                    cornerRadius: 10,
                    padding: 12,
                    titleFont: { family: "'Inter', sans-serif", weight: '600' },
                    bodyFont: { family: "'Inter', sans-serif" },
                    displayColors: true,
                    boxPadding: 4
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#64748b',
                        font: { family: "'Inter', sans-serif", size: 11 }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)',
                        drawBorder: false
                    }
                },
                y: {
                    ticks: {
                        color: '#64748b',
                        font: { family: "'Inter', sans-serif", size: 11 }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.08)',
                        drawBorder: false
                    }
                }
            }
        };

        const tempCtx = document.getElementById('chart-temperature').getContext('2d');
        const tempGradientMax = tempCtx.createLinearGradient(0, 0, 0, 220);
        tempGradientMax.addColorStop(0, 'rgba(251, 146, 60, 0.3)');
        tempGradientMax.addColorStop(1, 'rgba(251, 146, 60, 0)');

        const tempGradientMin = tempCtx.createLinearGradient(0, 0, 0, 220);
        tempGradientMin.addColorStop(0, 'rgba(96, 165, 250, 0.3)');
        tempGradientMin.addColorStop(1, 'rgba(96, 165, 250, 0)');

        charts.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Макс. температура (°C)',
                        data: daily.temperature_2m_max,
                        borderColor: '#fb923c',
                        backgroundColor: tempGradientMax,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#fb923c',
                        pointBorderColor: '#1e293b',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Мин. температура (°C)',
                        data: daily.temperature_2m_min,
                        borderColor: '#60a5fa',
                        backgroundColor: tempGradientMin,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#60a5fa',
                        pointBorderColor: '#1e293b',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}°C`
                        }
                    }
                }
            }
        });

        const precipCtx = document.getElementById('chart-precipitation').getContext('2d');
        const precipGradient = precipCtx.createLinearGradient(0, 0, 0, 220);
        precipGradient.addColorStop(0, 'rgba(34, 211, 238, 0.5)');
        precipGradient.addColorStop(1, 'rgba(34, 211, 238, 0.05)');

        charts.precipitation = new Chart(precipCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Осадки (мм)',
                    data: daily.precipitation_sum,
                    backgroundColor: precipGradient,
                    borderColor: '#22d3ee',
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: (ctx) => `Осадки: ${ctx.parsed.y} мм`
                        }
                    }
                },
                scales: {
                    ...commonOptions.scales,
                    y: {
                        ...commonOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });

        const windCtx = document.getElementById('chart-wind').getContext('2d');
        const windGradient = windCtx.createLinearGradient(0, 0, 0, 220);
        windGradient.addColorStop(0, 'rgba(167, 139, 250, 0.3)');
        windGradient.addColorStop(1, 'rgba(167, 139, 250, 0)');

        charts.wind = new Chart(windCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Макс. скорость ветра (км/ч)',
                    data: daily.wind_speed_10m_max,
                    borderColor: '#a78bfa',
                    backgroundColor: windGradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#a78bfa',
                    pointBorderColor: '#1e293b',
                    pointBorderWidth: 2
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: (ctx) => `Ветер: ${ctx.parsed.y} км/ч`
                        }
                    }
                },
                scales: {
                    ...commonOptions.scales,
                    y: {
                        ...commonOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    function destroyCharts() {
        Object.values(charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        charts = { temperature: null, precipitation: null, wind: null };
    }

    function getWeatherDescription(code) {
        const descriptions = {
            0: { text: 'Ясно', icon: '☀️' },
            1: { text: 'Преимущественно ясно', icon: '🌤️' },
            2: { text: 'Переменная облачность', icon: '⛅' },
            3: { text: 'Пасмурно', icon: '☁️' },
            45: { text: 'Туман', icon: '🌫️' },
            48: { text: 'Изморозь', icon: '🌫️' },
            51: { text: 'Слабая морось', icon: '🌦️' },
            53: { text: 'Умеренная морось', icon: '🌦️' },
            55: { text: 'Сильная морось', icon: '🌧️' },
            56: { text: 'Ледяная морось', icon: '🌧️' },
            57: { text: 'Сильная ледяная морось', icon: '🌧️' },
            61: { text: 'Слабый дождь', icon: '🌦️' },
            63: { text: 'Умеренный дождь', icon: '🌧️' },
            65: { text: 'Сильный дождь', icon: '🌧️' },
            66: { text: 'Ледяной дождь', icon: '🌧️' },
            67: { text: 'Сильный ледяной дождь', icon: '🌧️' },
            71: { text: 'Слабый снег', icon: '🌨️' },
            73: { text: 'Умеренный снег', icon: '🌨️' },
            75: { text: 'Сильный снег', icon: '❄️' },
            77: { text: 'Снежные зёрна', icon: '🌨️' },
            80: { text: 'Ливень', icon: '🌧️' },
            81: { text: 'Умеренный ливень', icon: '🌧️' },
            82: { text: 'Сильный ливень', icon: '⛈️' },
            85: { text: 'Снегопад', icon: '🌨️' },
            86: { text: 'Сильный снегопад', icon: '❄️' },
            95: { text: 'Гроза', icon: '⛈️' },
            96: { text: 'Гроза с градом', icon: '⛈️' },
            99: { text: 'Гроза с сильным градом', icon: '⛈️' }
        };
        return descriptions[code] || { text: 'Нет данных', icon: '🌡️' };
    }

    function formatPopulation(pop) {
        if (pop >= 1000000) {
            return (pop / 1000000).toFixed(1) + ' млн';
        }
        return pop.toLocaleString('ru-RU');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    document.addEventListener('DOMContentLoaded', init);
})();