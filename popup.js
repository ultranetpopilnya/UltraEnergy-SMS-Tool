const SECRET_HASH = "f190a3d0c04e5b2b3f4ee16d2df26597720b8d1c09179d2a0dad7e4605776875";

async function getDeviceKey() {

    const extId = chrome.runtime.id; 
    const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(extId + "UltraEnergySecure"), 
        { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: new TextEncoder().encode("StaticBrowserSalt99"), iterations: 10000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

async function encryptToken(text) {
    if (!text) return null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getDeviceKey();
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(text));
    return { ciphertext: Array.from(new Uint8Array(encrypted)), iv: Array.from(iv) };
}

async function decryptToken(encryptedObj) {
    if (!encryptedObj || !encryptedObj.ciphertext) return '';
    try {
        const key = await getDeviceKey();
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(encryptedObj.iv) }, 
            key, 
            new Uint8Array(encryptedObj.ciphertext)
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Помилка розшифровки токена", e);
        return '';
    }
}

// === ФУНКЦІЯ МАЛЮВАННЯ ПЛАВАЮЧОГО СПИСКУ НОМЕРІВ ===
function renderPhoneSelector(phones) {
    let badge = document.getElementById('phoneBadge');
    let btn = document.getElementById('phoneDropdownBtn');
    let menu = document.getElementById('phoneDropdownMenu');
    let phoneInput = document.getElementById('phone');

    // Очищаємо попередні класи перед новим рендером
badge.className = 'phone-badge'; 
btn.className = 'inside-input-btn'; // скидаємо анімацію

if (currentNetwork === 'ultra') {
    badge.classList.add('ultra-color'); // Додає фіолетовий колір Ultranet
} else if (currentNetwork === 'energy') {
    badge.classList.add('energy-color'); // Додає зелений колір ISP Energy
}

// Додаємо м'яку анімацію, щоб кнопка привертала увагу
btn.classList.add('anim-bounce-down');

    // Якщо номерів 0 або 1 - ховаємо всі допоміжні елементи
    if (!phones || phones.length <= 1) {
        if (badge) badge.style.display = 'none';
        if (btn) btn.style.display = 'none';
        if (menu) menu.style.display = 'none';
        if (phoneInput) phoneInput.classList.remove('has-dropdown');
        return;
    }

    // Якщо номерів більше 1 - показуємо бейдж та кнопку 🔽
    if (badge) {
        badge.innerText = `(${phones.length})`;
        badge.style.display = 'inline-block';
    }
    if (btn) btn.style.display = 'block';
    if (phoneInput) phoneInput.classList.add('has-dropdown');
    
    // Очищаємо і наповнюємо плаваюче меню
    if (menu) {
        menu.innerHTML = '';
        phones.forEach(p => {
            let item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerText = '+ ' + p;
            
            // Клік по номеру в списку
            item.onclick = (e) => {
                e.stopPropagation(); // Зупиняємо подію, щоб меню не клікнуло само по собі
                phoneInput.value = p;
                saveStateToCache();
                menu.style.display = 'none'; // Ховаємо меню
            };
            menu.appendChild(item);
        });
    }
}

// === ФУНКЦІЯ: СТАТУСИ ПРЯМО НА КНОПЦІ ===
function showButtonStatus(btnId, message, type) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.innerText;
    }

    btn.classList.remove('btn-success', 'btn-error', 'btn-loading');

    let icon = '';
    if (type === 'success') {
        btn.classList.add('btn-success');
        icon = '✅';
        btn.disabled = true; 
    } else if (type === 'error') {
        btn.classList.add('btn-error');
        icon = '❌';
        btn.disabled = false; 
    } else if (type === 'loading') {
        btn.classList.add('btn-loading');
        icon = '⏳';
        btn.disabled = true; 
    }

    btn.innerHTML = `<span class="emoji-icon">${icon}</span> <span>${message}</span>`;
    
    if (type !== 'loading') {
        setTimeout(() => {
            if (btn.innerText.includes(message)) {
                resetButton(btnId);
            }
        }, 4000); 
    }
}

function resetButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('btn-success', 'btn-error', 'btn-loading');
    if (btn.dataset.originalText) {
        btn.innerText = btn.dataset.originalText;
    }
    btn.disabled = false;
}
// ===========================================

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let creds = { ultra: { token: '', sender: 'UltraNet' }, energy: { token: '', sender: 'ISP Energy' } };
let currentNetwork = null; 
let loadedTemplates = []; 
let selectedTemplateIndex = 0; // <-- ДОДАТИ: Пам'ятає, який шаблон обрано
let extractedData = { contract: '11500xxxxx', password: 'xxxxx', phones: [], credit: '' };
let autoCloseEnabled = true;
let savedSmsPrice = 1.29;
const isSidePanel = window.location.search.includes('panel=1');

async function scrapeAbillsData() {
    let result = { contract: '11500xxxxx', password: 'xxxxx', phones: [], credit: '' };

    // Функція пошуку суми кредиту
    const getAmount = (doc) => {
        let input = doc.getElementById('CREDIT') || doc.querySelector('input[name="CREDIT"]');
        if (input) {
            let rawValue = input.value || input.getAttribute('placeholder') || '';
            let cleanValue = rawValue.replace(/,/g, '.').replace(/[^\d.]/g, '');
            let val = parseFloat(cleanValue);
            if (!isNaN(val) && val > 0) return val.toString(); 
        }
        return '';
    };

    // Швидка функція пошуку пароля/договору
    const extractCredentials = (docToSearch) => {
        let creds = { contract: null, password: null };
        
        let copyElements = docToSearch.querySelectorAll('[onclick*="copyToBuffer"]');
        for (let btn of copyElements) {
            let onclick = btn.getAttribute('onclick');
            let match = onclick.match(/copyToBuffer\(['"]([^'"]+)['"]\)/);
            if (match && match[1]) {
                let extractedValue = match[1];
                let btnText = (btn.innerText || btn.title || '').toLowerCase();
                
                if (btnText.includes('контракт') || btnText.includes('договір') || btnText.includes('договор') || btnText.includes('contract')) {
                    creds.contract = extractedValue;
                } else if (btnText.includes('пароль') || btnText.includes('password') || btnText.includes('pass')) {
                    creds.password = extractedValue;
                }
            }
        }

        if (!creds.contract) {
            let contractInput = docToSearch.querySelector('input[name="CONTRACT"], input[id="CONTRACT"], .contract_template_value');
            if (contractInput && contractInput.value) creds.contract = contractInput.value;
        }
        if (!creds.password) {
            let passInput = docToSearch.querySelector('input[name="PASSWORD"], input[id="PASSWORD"], input[name="PASS"]');
            if (passInput && passInput.value) creds.password = passInput.value;
        }
        
        return creds;
    };

    try {
        result.credit = getAmount(document);

        // === ПОКРАЩЕНА СТРОГА ФУНКЦІЯ ПОШУКУ ТЕЛЕФОНІВ ===
        const extractPhones = (docToSearch) => {
            let localPhoneSet = new Set();
            
            // Регулярка шукає блоки, що схожі на номери (дозволяє дужки, пробіли, дефіси)
            let phoneRegex = /(?:\+?38)?[\s\-\(]*0\d[\s\-\(\)]*(?:\d[\s\-\(\)]*){7,8}\d/g;

            // Допоміжна функція: очищає і строго валідує номер
            const processAndAddPhone = (rawStr) => {
                if (!rawStr) return;
                let clean = rawStr.replace(/\D/g, ''); // Залишаємо тільки цифри
                
                // Приводимо до стандарту 380...
                let normalized = "";
                if (clean.length === 10 && clean.startsWith('0')) {
                    normalized = '38' + clean;
                } else if (clean.length === 12 && clean.startsWith('380')) {
                    normalized = clean;
                }

                // СТРОГА ПЕРЕВІРКА: Валідація українських кодів операторів
                // (Київстар, Vodafone, Lifecell, Інтертелеком, Тримоб)
                let validUaPhoneRegex = /^380(39|50|63|66|67|68|73|75|77|89|91|92|93|94|95|96|97|98|99)\d{7}$/;

                if (normalized && validUaPhoneRegex.test(normalized)) {
                    localPhoneSet.add(normalized);
                }
            };

            // Допоміжна функція: "витягує" всі номери з довгого тексту
            const extractFromText = (text) => {
                if (!text || typeof text !== 'string') return;
                let matches = text.match(phoneRegex);
                if (matches) {
                    matches.forEach(m => processAndAddPhone(m));
                }
                // ПРИБРАНО БЛОК ELSE: тепер ми не намагаємося "видушити" цифри з усього тексту сторінки, 
                // якщо там немає послідовності, схожої на номер телефону.
            };

            // ТАРГЕТ 1: Усі поля вводу (input) ТА ВЕЛИКІ ТЕКСТОВІ ПОЛЯ (textarea)
            let inputsAndTextareas = docToSearch.querySelectorAll('input:not([type="hidden"]), textarea');
            inputsAndTextareas.forEach(el => {
                extractFromText(el.value);
                if (el.placeholder) extractFromText(el.placeholder);
            });

            // ТАРГЕТ 2: Коментарі абонента (блоки timeline-item)
            let timelineItems = docToSearch.querySelectorAll('.timeline-item');
            timelineItems.forEach(item => extractFromText(item.innerText));

            // ТАРГЕТ 3: Глобальний текст всієї сторінки
            let bodyText = docToSearch.body ? docToSearch.body.innerText : '';
            extractFromText(bodyText);

            return Array.from(localPhoneSet);
        };

        // Запускаємо пошук телефонів по поточній сторінці
        result.phones = extractPhones(document);

        // СПРОБА ЗНАЙТИ ДОГОВІР ТА ПАРОЛЬ НА ПОТОЧНІЙ СТОРІНЦІ
        let currentDocCreds = extractCredentials(document);
        if (currentDocCreds.contract) result.contract = currentDocCreds.contract;
        if (currentDocCreds.password) result.password = currentDocCreds.password;

        // РОБИМО ФОНОВИЙ ЗАПИТ ТІЛЬКИ ЯКЩО ЧОГОСЬ НЕ ВИСТАЧАЄ
        let needFetch = (result.contract === '11500xxxxx' || result.password === 'xxxxx' || !result.credit || result.phones.length === 0);

        if (needFetch) {
            let uid = null;
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('UID')) uid = urlParams.get('UID');
            if (!uid) {
                let uidInput = document.querySelector('input[name="UID"], input[name="uid"], input[id="UID"]');
                if (uidInput) uid = uidInput.value;
            }

            if (uid) {
                let fetchUrl = `/admin/index.cgi?qindex=15&header=2&UID=${uid}&SHOW_PASSWORD=1&IN_MODAL=1`;
                let response = await fetch(fetchUrl);
                let htmlText = await response.text();

                let parser = new DOMParser();
                let doc = parser.parseFromString(htmlText, 'text/html');

                if (!result.credit) result.credit = getAmount(doc);

                let fetchedCreds = extractCredentials(doc);
                if (result.contract === '11500xxxxx' && fetchedCreds.contract) result.contract = fetchedCreds.contract;
                if (result.password === 'xxxxx' && fetchedCreds.password) result.password = fetchedCreds.password;
                
                // Збираємо номери з фонової сторінки і додаємо до існуючих (без дублікатів)
                let backgroundPhones = extractPhones(doc);
                if (backgroundPhones.length > 0) {
                    result.phones = [...new Set([...result.phones, ...backgroundPhones])];
                }
            }
        }
    } catch (e) { console.error("Помилка парсингу:", e); }

    return result;
}

// === ФУНКЦІЯ ПІДРАХУНКУ СИМВОЛІВ ТА ЧАСТИН SMS (ЛОГІКА TURBOSMS) ===
function updateSmsCounter() {
    const textEl = document.getElementById('message');
    if (!textEl) return;
    
    const text = textEl.value || '';
    
    // 1. Проста і надійна перевірка на кирилицю (будь-який символ, якого немає в англійській розкладці)
    const isUnicode = /[^\x00-\x7F]/.test(text);

    // 2. Підрахунок "ваги" символів
    let calcLength = 0;
    if (isUnicode) {
        // У кирилиці кожен символ важить рівно 1
        calcLength = text.length;
    } else {
        // У латиниці ці 8 символів рахуються за ДВА
        for (let i = 0; i < text.length; i++) {
            if ("~^[]{}\\|".indexOf(text[i]) !== -1) {
                calcLength += 2;
            } else {
                calcLength += 1;
            }
        }
    }

    // 3. Таблиці лімітів від TurboSMS
    const latinLimits = [160, 305, 457, 609, 761, 913, 1065, 1217, 1369, 1521];
    const uniLimits = [70, 133, 199, 265, 331, 397, 463, 529, 595, 661];

    let limits = isUnicode ? uniLimits : latinLimits;
    
    // ЗМІНЕНО: Стартуємо з 0 СМС (замість 1)
    let parts = 0; 
    let maxCharsInCurrentPart = limits[0]; // 160 або 70

    if (calcLength > 0) {
        let foundLimit = false;
        for (let i = 0; i < limits.length; i++) {
            if (calcLength <= limits[i]) {
                parts = i + 1;
                maxCharsInCurrentPart = limits[i];
                foundLimit = true;
                break;
            }
        }
        
        // Якщо раптом текст гігантський (більше 10 частин)
        if (!foundLimit) {
            if (isUnicode) {
                parts = Math.ceil((calcLength - 67) / 66) + 1;
                maxCharsInCurrentPart = 67 + 66 * (parts - 1);
            } else {
                parts = Math.ceil((calcLength - 153) / 152) + 1;
                maxCharsInCurrentPart = 153 + 152 * (parts - 1);
            }
        }
    }

    // Рахуємо, скільки залишилось до наступної межі
    const left = maxCharsInCurrentPart - calcLength;

    // 4. Оновлюємо лівий бік (Символи)
    let charCountEl = document.getElementById('charCount');
    let charLeftEl = document.getElementById('charLeft');
    if (charCountEl) charCountEl.innerText = calcLength;
    if (charLeftEl) charLeftEl.innerText = left;

    // 5. Підрахунок вартості
    let price = 1.29; 
    if (typeof savedSmsPrice !== 'undefined' && !isNaN(savedSmsPrice)) {
        price = parseFloat(savedSmsPrice);
    }
    
    let totalCost = (parts * price).toFixed(2); 
    
    // 6. Оновлюємо правий бік
    let wrapper = document.getElementById('smsStatusWrapper');
    if (wrapper) {
        let colorClass = parts >= 3 ? 'sms-warning' : 'energy-color';
        let partsClass = parts >= 3 ? 'sms-warning' : '';
        
        // Якщо 0 смс, ціна сіра, а не яскраво-зелена
        if (parts === 0) {
            colorClass = '';
        }

        wrapper.innerHTML = `СМС: <strong class="${partsClass}">${parts}</strong> шт<span style="margin-left: 5px;">≈ <strong class="${colorClass}">${totalCost}</strong> ₴</span>`;
    }
}

function updatePreview() {
    if (!loadedTemplates || loadedTemplates.length === 0) return;
    
    // БЕРЕМО ДАНІ З НАШОЇ ЗМІННОЇ
    let selectedIndex = selectedTemplateIndex;
    
    if (selectedIndex === null || !loadedTemplates[selectedIndex]) {
        document.getElementById('message').value = 'Шаблон не знайдено';
        updateSmsCounter(); // <--- ДОДАТИ ЦЕ
        return;
    }

    let text = loadedTemplates[selectedIndex].text;  
    let amount = document.getElementById('amount').value;
    if (!amount) amount = 'xxxx';
    
    text = text.replace(/{amount}/g, amount);
    text = text.replace(/{contract}/g, extractedData.contract);
    text = text.replace(/{password}/g, extractedData.password);
    
    document.getElementById('message').value = text;
    
    updateSmsCounter(); // <--- ДОДАТИ ЦЕ (оновлює лічильник при виборі шаблону)
}

function loadSettings() {
    chrome.storage.local.get(['encUltra', 'encEnergy', 'autoClose', 'smsPrice'], async (data) => {
        // Непомітно для користувача розшифровуємо токени
        if (data.encUltra) creds.ultra.token = await decryptToken(data.encUltra);
        if (data.encEnergy) creds.energy.token = await decryptToken(data.encEnergy);
        
        savedSmsPrice = data.smsPrice !== undefined ? parseFloat(data.smsPrice) : 1.29;
        autoCloseEnabled = data.autoClose !== undefined ? data.autoClose : true;
        
        let toggle = document.getElementById('autoCloseToggle');
        if (toggle) toggle.checked = autoCloseEnabled;
        
        updateSmsCounter(); 
    });
}

async function loadTemplatesFromFile(network) {
    let fileName = network === 'ultra' ? 'templates_ultra.json' : 'templates_energy.json';
    try {
        let url = chrome.runtime.getURL(fileName);
        let response = await fetch(url);
        loadedTemplates = await response.json();

        // НОВА ЛОГІКА ДЛЯ КАСТОМНОГО МЕНЮ ШАБЛОНІВ
        let menu = document.getElementById('templateDropdownMenu');
        let input = document.getElementById('templateInput');
        
        if (!menu || !input) return;
        
        menu.innerHTML = ''; 

        // Ставимо початковий текст (перший шаблон)
        if (loadedTemplates.length > 0) {
            // Перевіряємо, чи індекс не виходить за межі (якщо змінилась мережа)
            if (selectedTemplateIndex >= loadedTemplates.length) selectedTemplateIndex = 0;
            input.value = loadedTemplates[selectedTemplateIndex].title;
        }

        // Наповнюємо плаваюче меню
        loadedTemplates.forEach((tpl, index) => {
            let item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerText = tpl.title;
            
            // Що робити при кліку на шаблон
            item.onclick = (e) => {
                e.stopPropagation(); 
                input.value = tpl.title; // Змінюємо текст у полі
                selectedTemplateIndex = index; // Запам'ятовуємо індекс
                menu.style.display = 'none'; // Ховаємо меню
                
                updatePreview(); // Оновлюємо текст СМС
                saveStateToCache(); // Зберігаємо в кеш
            };
            menu.appendChild(item);
        });
    } catch (e) {
        console.error("Не вдалося завантажити файл шаблонів: ", e);
        let input = document.getElementById('templateInput');
        if (input) input.value = 'Помилка завантаження';
    }
}

// === КЕШУВАННЯ ДО 10 АБОНЕНТІВ (LRU CACHE) ===
let currentPageMarker = null;

function saveStateToCache() {
    if (!currentPageMarker) return;

    let state = {
        extractedData: extractedData,
        amount: document.getElementById('amount').value,
        phone: document.getElementById('phone').value,
        templateIndex: selectedTemplateIndex,
        message: document.getElementById('message').value,
        timestamp: Date.now() // Ставимо час, щоб знати, хто найновіший
    };

    // Використовуємо пам'ять СЕСІЇ (очиститься при закритті браузера)
    chrome.storage.session.get(['subscribersCache'], (storage) => {
        let cache = storage.subscribersCache || {};
        
        // Зберігаємо або оновлюємо поточного абонента
        cache[currentPageMarker] = state;

        // Контроль ліміту: якщо більше 10 записів - видаляємо найстаріший
        let keys = Object.keys(cache);
        if (keys.length > 10) {
            let oldestKey = keys.reduce((oldest, current) => {
                return cache[current].timestamp < cache[oldest].timestamp ? current : oldest;
            });
            delete cache[oldestKey];
        }

        chrome.storage.session.set({ subscribersCache: cache });
    });
}

function restoreStateFromCache(cachedState) {
    extractedData = cachedState.extractedData;
    
    // ОСЬ ТУТ ПРОСТО ВИКЛИКАЄМО НОВУ ФУНКЦІЮ:
    renderPhoneSelector(extractedData.phones);

    document.getElementById('phone').value = cachedState.phone || '';
    document.getElementById('amount').value = cachedState.amount || '';
    // Відновлюємо індекс
    selectedTemplateIndex = cachedState.templateIndex !== undefined ? cachedState.templateIndex : 0;
    
    // Візуально повертаємо назву шаблону в поле
    let tplInput = document.getElementById('templateInput');
    if (tplInput && loadedTemplates[selectedTemplateIndex]) {
        tplInput.value = loadedTemplates[selectedTemplateIndex].title;
    }
    document.getElementById('message').value = cachedState.message || '';
    
    // ДОДАНО: Примусово запускаємо підрахунок після відновлення тексту!
    updateSmsCounter();
    
    saveStateToCache(); 
}

// ГОЛОВНА ФУНКЦІЯ ПАРСИНГУ ТА ЗАВАНТАЖЕННЯ
function runAutoParse() {
    resetButton('sendBtn'); 

    let queryOptions = isSidePanel ? { active: true, lastFocusedWindow: true } : { active: true, currentWindow: true };
    
    // ДОДАНО async СЮДИ
    chrome.tabs.query(queryOptions, async (tabs) => { 
        if (!tabs || tabs.length === 0) return;
        
        let currentTab = tabs[0];
        let subTitle = document.getElementById('subTitle');
        let isBillingSite = true;
        
        // 1. ВИЗНАЧАЄМО МЕРЕЖУ ПО ДОМЕНУ
        if (currentTab.url.includes('bill.ultranetgroup.com.ua')) {
            currentNetwork = 'ultra';
        } else if (currentTab.url.includes('bill.ispenergy.com.ua')) {
            currentNetwork = 'energy';
        } else {
            // ЯКЩО ЦЕ ІНШИЙ САЙТ - беремо Ultra за замовчуванням
            currentNetwork = 'ultra'; 
            isBillingSite = false;
        }

        // 2. ЗАВАНТАЖУЄМО ШАБЛОНИ ОДРАЗУ (щоб вони були доступні всюди)
        await loadTemplatesFromFile(currentNetwork);

        // 3. ЯКЩО ЦЕ НЕ САЙТ БІЛІНГУ
        if (!isBillingSite) {
            subTitle.innerText = 'Перевіряйте дані абонента перед відправкою смс!';
            subTitle.className = 'warning-text'; // Повертає помаранчевий/червоний колір попередження
            subTitle.style.display = 'block';
            updatePreview(); 
            return; 
        }

        // 4. ПЕРЕВІРЯЄМО, ЧИ ЦЕ САМЕ КАРТКА АБОНЕНТА
        chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
                let hasUidInUrl = window.location.search.includes('UID=') || window.location.search.includes('uid=');
                let hasContextUid = false;
                let uidInputs = document.querySelectorAll('input[name="UID"], input[name="uid"], input[id="UID"]');
                for (let input of uidInputs) {
                    if (input.value && input.value.trim() !== '') {
                        hasContextUid = true;
                        break;
                    }
                }
                let profileIndicators = document.querySelectorAll('input[name="CREDIT"], input[name="DEPOSIT"], input[name="CONTRACT"], [onclick*="copyToBuffer"]');
                let isSubscriberCard = (hasUidInUrl || hasContextUid) && profileIndicators.length > 0;

                let isReloaded = !window.__sms_ext_marker;
                if (isReloaded) {
                    window.__sms_ext_marker = 'marker_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                }
                
                return { 
                    isReloaded: isReloaded, 
                    marker: window.__sms_ext_marker,
                    isSubscriberCard: isSubscriberCard 
                };
            }
        }, async (markerResults) => {
            if (!markerResults || !markerResults[0]) return;
            
            let pageInfo = markerResults[0].result;

            // ЯКЩО ЦЕ БІЛІНГ, АЛЕ НЕ КАРТКА АБОНЕНТА
            if (!pageInfo.isSubscriberCard) {
                subTitle.innerText = 'Перевіряйте дані перед відправкою смс!';
                subTitle.className = 'subtitle-text'; // Стандартний сірий текст
                subTitle.style.display = 'block';
                
                // Очищаємо поля, як було в оригіналі, щоб не висіли старі дані
                document.getElementById('phone').value = '';
                document.getElementById('amount').value = '';
                updatePreview();
                updateSmsCounter();
                return; 
            }

            // === ЯКЩО МИ ТУТ - ЗНАЧИТЬ ВІДКРИТА КАРТКА АБОНЕНТА ===
            subTitle.innerText = currentNetwork === 'ultra' ? 'Відправити SMS Ultranet' : 'Відправити SMS ISP Energy';
            subTitle.className = currentNetwork === 'ultra' ? 'ultra-color subtitle-text' : 'energy-color subtitle-text'; 
            subTitle.style.display = 'block';

            currentPageMarker = pageInfo.marker;

            chrome.storage.session.get(['subscribersCache'], (storage) => {
                let cache = storage.subscribersCache || {};
                let cachedState = cache[currentPageMarker];

                if (!pageInfo.isReloaded && cachedState) {
                    restoreStateFromCache(cachedState);
                    return; 
                }

                // === ПАРСИНГ НОВОГО АБОНЕНТА ===
                extractedData = { contract: '11500xxxxx', password: 'xxxxx', phones: [], credit: '' };
                document.getElementById('phone').value = '';
                document.getElementById('amount').value = '';
                document.getElementById('message').value = ''; 

                chrome.scripting.executeScript({
                    target: { tabId: currentTab.id, allFrames: true },
                    func: scrapeAbillsData
                }, (results) => {
                    if (results) {
                        for (let frame of results) {
                            let data = frame.result;
                            if (!data) continue;
                            
                            if (data.contract !== '11500xxxxx') extractedData.contract = data.contract;
                            if (data.password !== 'xxxxx') extractedData.password = data.password;
                            if (data.credit) extractedData.credit = data.credit; 
                            
                            if (data.phones && data.phones.length > 0) {
                                extractedData.phones = [...new Set([...extractedData.phones, ...data.phones])];
                            }
                        }

                        if (extractedData.credit) document.getElementById('amount').value = extractedData.credit;

                        let phoneInput = document.getElementById('phone');
                        if (extractedData.phones.length > 0) phoneInput.value = extractedData.phones[0];

                        // Малюємо нові плаваючі кнопки вибору номерів
                        if (typeof renderPhoneSelector === 'function') renderPhoneSelector(extractedData.phones);

                        updatePreview();
                        saveStateToCache(); 
                    }
                });
            });
        });
    });
}

function checkAuthAndParse() {
    chrome.storage.local.get(['isAuthorized'], (data) => {
        if (data.isAuthorized) runAutoParse();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const manifestData = chrome.runtime.getManifest();
    const vBtn = document.getElementById('versionBtn');
    if (vBtn) {
        vBtn.title = "Поточна версія: " + manifestData.version;
        // Забороняємо клік, якщо немає класу 'has-update'
        vBtn.addEventListener('click', (e) => {
            if (!vBtn.classList.contains('has-update')) {
                e.preventDefault(); 
            }
        });
    }

    // ДІСТАЄМО СТАТУС І ТЕМУ ОДНОЧАСНО
    chrome.storage.local.get(['isAuthorized', 'theme'], (data) => {
        
        // 1. ЗАСТОСОВУЄМО ТЕМУ
        // 1. ЗАСТОСОВУЄМО ТЕМУ
let savedTheme = data.theme || 'light';
document.body.setAttribute('data-theme', savedTheme);

let themeInput = document.getElementById('themeInput');
if (themeInput) {
    // Зберігаємо технічне значення ('light' або 'dark')
    themeInput.dataset.value = savedTheme;
    // Показуємо користувачу гарний текст
    themeInput.value = savedTheme === 'dark' ? 'Темна тема' : 'Світла тема';
}

        // 2. ПОКАЗУЄМО ІНТЕРФЕЙС (ПРИБИРАЄМО ПРОЗОРІСТЬ)
        document.body.classList.add('theme-loaded');

        // 3. РОЗПОДІЛЯЄМО ЕКРАНИ
        if (data.isAuthorized) {
            document.getElementById('loginView').style.display = 'none';
            document.getElementById('onboardingView').style.display = 'none';
            document.getElementById('mainView').style.display = 'block';
            loadSettings();
            runAutoParse();
        } else {
            document.getElementById('loginView').style.display = 'block';
            document.getElementById('onboardingView').style.display = 'none';
            document.getElementById('mainView').style.display = 'none';
        }
    });

    // === ЛОГІКА ВІДКРИТТЯ/ЗАКРИТТЯ ПЛАВАЮЧОГО СПИСКУ НОМЕРІВ ===
    const phoneBtn = document.getElementById('phoneDropdownBtn');
    const phoneMenu = document.getElementById('phoneDropdownMenu');

    if (phoneBtn && phoneMenu) {
        // Клік по кнопці 🔽
        phoneBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Перемикаємо видимість меню
            phoneMenu.style.display = phoneMenu.style.display === 'none' ? 'block' : 'none';
        });

        // Клік будь-де у вікні - закриває всі відкриті меню
    document.addEventListener('click', (e) => {
        if (phoneMenu && phoneMenu.style.display === 'block' && e.target !== phoneBtn && e.target !== phoneMenu) {
            phoneMenu.style.display = 'none';
        }
        if (tplMenu && tplMenu.style.display === 'block' && e.target !== tplBtn && e.target !== tplMenu && e.target !== tplInput) {
            tplMenu.style.display = 'none';
        }
        if (themeMenu && themeMenu.style.display === 'block' && e.target !== themeBtn && e.target !== themeMenu && e.target !== themeInput) {
            themeMenu.style.display = 'none';
        }
    });
    }

    // Далі йдуть твої слухачі кнопок (loginBtn і т.д.)...

    document.getElementById('loginBtn').addEventListener('click', async () => {
        let inputPass = document.getElementById('accessKey').value;
        let hashedInput = await sha256(inputPass);

        if (hashedInput === SECRET_HASH) {
            chrome.storage.local.set({ isAuthorized: true }, () => {
                document.getElementById('loginView').style.display = 'none';
                document.getElementById('onboardingView').style.display = 'block';
            });
        } else {
            showButtonStatus('loginBtn', 'Невірний ключ!', 'error');
        }
    });

    document.getElementById('accessKey').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });

    document.getElementById('onboardSaveBtn').addEventListener('click', async () => {
        let uT = document.getElementById('onboardUltraToken').value.trim();
        let eT = document.getElementById('onboardEnergyToken').value.trim();

        showButtonStatus('onboardSaveBtn', 'Захищаємо дані...', 'loading');

        // Шифруємо
        let encU = await encryptToken(uT);
        let encE = await encryptToken(eT);

        chrome.storage.local.set({ encUltra: encU, encEnergy: encE }, () => {
            creds.ultra.token = uT; 
            creds.energy.token = eT; 
            setTimeout(() => {
                document.getElementById('onboardingView').style.display = 'none';
                document.getElementById('mainView').style.display = 'block';
                updateSmsCounter(); 
                runAutoParse();
            }, 500);
        });
    });

    const pinBtn = document.getElementById('pinBtn');
    if (isSidePanel) {
        pinBtn.innerText = '✖️'; // Змінив іконку закриття панелі на красиву
        pinBtn.title = 'Закрити панель';
        pinBtn.classList.add('icon-btn-danger');
    } else {
        pinBtn.innerText = '📌';
        pinBtn.title = 'Закріпити в боковій панелі';
    }

    pinBtn.addEventListener('click', () => {
        if (!isSidePanel) {
            chrome.windows.getCurrent({ populate: false }, (win) => {
                chrome.sidePanel.open({ windowId: win.id }).then(() => {
                    window.close(); 
                }).catch(e => console.error("Помилка відкриття:", e));
            });
        } else {
            window.close();
        }
    });

    document.getElementById('openSettingsBtn').addEventListener('click', () => {
        document.getElementById('mainView').style.display = 'none';
        document.getElementById('settingsView').className = 'anim-slide-right';
        document.getElementById('settingsView').style.display = 'block';
        document.getElementById('ultraToken').value = creds.ultra.token;
        document.getElementById('energyToken').value = creds.energy.token;
        document.getElementById('smsPriceInput').value = savedSmsPrice; // <--- ДОДАТИ ЦЕ
        resetButton('saveSettingsBtn'); 
    });

    // === ЛОГІКА ВІДКРИТТЯ МЕНЮ ТЕМ ===
    const themeBtn = document.getElementById('themeDropdownBtn');
    const themeInput = document.getElementById('themeInput');
    const themeMenu = document.getElementById('themeDropdownMenu');

    function toggleThemeMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        themeMenu.style.display = themeMenu.style.display === 'none' ? 'block' : 'none';
    }

    if (themeBtn && themeInput && themeMenu) {
        themeBtn.addEventListener('click', toggleThemeMenu);
        themeInput.addEventListener('click', toggleThemeMenu);

        // Обробка кліку по пунктах вибору теми
        const themeItems = themeMenu.querySelectorAll('.dropdown-item');
        themeItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                let selectedValue = item.dataset.value;
                
                // Оновлюємо поле вводу
                themeInput.value = item.innerText;
                themeInput.dataset.value = selectedValue; 
                
                // Одразу показуємо попередній перегляд теми
                document.body.setAttribute('data-theme', selectedValue);
                
                // Ховаємо меню
                themeMenu.style.display = 'none';
            });
        });
    }

    // === НОВА КНОПКА ЗАКРИТТЯ НАЛАШТУВАНЬ (ІКОНКА ХРЕСТИК) ===
    document.getElementById('closeSettingsIconBtn').addEventListener('click', () => {
        document.getElementById('settingsView').style.display = 'none';
        document.getElementById('mainView').className = 'anim-slide-left';
        document.getElementById('mainView').style.display = 'block';
    });

    document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
        let uT = document.getElementById('ultraToken').value.trim();
        let eT = document.getElementById('energyToken').value.trim();
        let aC = document.getElementById('autoCloseToggle').checked; 
        let selectedTheme = document.getElementById('themeInput').dataset.value || 'light';
        let priceVal = parseFloat(document.getElementById('smsPriceInput').value);
        let sPrice = isNaN(priceVal) ? 1.29 : priceVal; 

        showButtonStatus('saveSettingsBtn', 'Захищаємо дані...', 'loading');

        let encU = await encryptToken(uT);
        let encE = await encryptToken(eT);

        chrome.storage.local.set({ 
            encUltra: encU, 
            encEnergy: encE, 
            autoClose: aC, 
            theme: selectedTheme, 
            smsPrice: sPrice 
        }, () => {
            creds.ultra.token = uT; 
            creds.energy.token = eT; 
            autoCloseEnabled = aC; 
            savedSmsPrice = sPrice; 
            
            document.body.setAttribute('data-theme', selectedTheme);
            
            showButtonStatus('saveSettingsBtn', 'Збережено!', 'success');
            setTimeout(() => {
                document.getElementById('closeSettingsIconBtn').click(); 
                resetButton('saveSettingsBtn');
                updateSmsCounter(); 
            }, 1000); 
        });
    });

    // === ЛОГІКА ВІДКРИТТЯ МЕНЮ ШАБЛОНІВ ===
    const tplBtn = document.getElementById('templateDropdownBtn');
    const tplInput = document.getElementById('templateInput');
    const tplMenu = document.getElementById('templateDropdownMenu');

    function toggleTemplateMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        // Якщо відкрите меню телефонів - закриваємо його, щоб не накладались
        if (phoneMenu) phoneMenu.style.display = 'none';
        
        tplMenu.style.display = tplMenu.style.display === 'none' ? 'block' : 'none';
    }

    if (tplBtn && tplInput && tplMenu) {
        // Дозволяємо відкривати меню і по кнопці-стрілочці, і просто клікнувши на поле вводу
        tplBtn.addEventListener('click', toggleTemplateMenu);
        tplInput.addEventListener('click', toggleTemplateMenu);
    }
    document.getElementById('amount').addEventListener('input', () => {
        updatePreview();
        saveStateToCache();
    });
    // Зберігаємо зміни номера і тексту на льоту
    document.getElementById('phone').addEventListener('input', saveStateToCache);
    document.getElementById('message').addEventListener('input', () => {
        saveStateToCache();
        updateSmsCounter(); // Оновлює лічильник, коли друкуєте руками
    });

    document.getElementById('sendBtn').addEventListener('click', () => {
    let rawPhoneInput = document.getElementById('phone').value.trim().toLowerCase();
    let text = document.getElementById('message').value;

    // === ТЕСТ: Успішна відправка ===
    if (rawPhoneInput === 'test') {
        showButtonStatus('sendBtn', 'Тестова відправка...', 'loading');
        setTimeout(() => {
            showButtonStatus('sendBtn', 'Тест успішний!', 'success');
            if (autoCloseEnabled) setTimeout(() => window.close(), 1200);
        }, 800);
        return; 
    }

    // === ТЕСТ: Поява вікна оновлення (команда "up") ===
    if (rawPhoneInput === 'up') {
        showButtonStatus('sendBtn', 'Перевірка версії...', 'loading');
        
        setTimeout(() => {
            const btn = document.getElementById('sendBtn');
            btn.className = 'btn';
            btn.textContent = 'Відправити SMS';
            btn.disabled = false;

            const vBtn = document.getElementById('versionBtn');
            const updateText = document.getElementById('updateText');
            const bannerVersion = document.getElementById('updateBannerVersion');

            if (vBtn && updateText && bannerVersion) {
                bannerVersion.textContent = "9.9.9"; // Номер версії
                updateText.style.display = 'flex';   // Показуємо іконку
                vBtn.classList.add('has-update');    // Розширюємо кнопку (неон)
                vBtn.title = "Завантажити оновлення!";
                vBtn.href = "https://github.com/ultranetpopilnya/UltraEnergy-SMS-Tool/archive/refs/heads/main.zip"; // ПОСИЛАННЯ
                vBtn.target = "_blank";              // ДОДАНО: Тепер завантаження піде в новій вкладці
            }
        }, 600);
        return;
    }

    // === ОСНОВНА ЛОГІКА ВІДПРАВКИ SMS ===
    if (!currentNetwork) {
        showButtonStatus('sendBtn', 'Відкрийте сторінку білінгу!', 'error');
        return;
    }

    let currentToken = creds[currentNetwork].token;
    let currentSender = creds[currentNetwork].sender;

    if (!currentToken) {
        showButtonStatus('sendBtn', 'Вкажіть токен у налаштуваннях!', 'error');
        return;
    }

    let phone = rawPhoneInput.replace(/\D/g, '');

    if (!phone) {
        showButtonStatus('sendBtn', 'Введіть номер телефону!', 'error');
        return;
    }
    if (!text || text.trim() === '') {
        showButtonStatus('sendBtn', 'Повідомлення порожнє!', 'error');
        return;
    }
    if (phone.length === 10) phone = '38' + phone;
    if (phone.length !== 12 || !phone.startsWith('380')) {
        showButtonStatus('sendBtn', 'Некоректний формат номера!', 'error');
        return;
    }

    showButtonStatus('sendBtn', 'Відправляємо SMS...', 'loading');

    fetch('https://api.turbosms.ua/message/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ "recipients": [phone], "sms": { "sender": currentSender, "text": text } })
    })
    .then(response => {
        // Перевіряємо, чи це взагалі JSON, перед тим як парсити
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.json();
        } else {
            throw new Error("Сервер повернув не JSON (можливо помилка 502)");
        }
    })
    .then(data => {
        if (data.response_code === 800 || data.response_code === 801) { 
            showButtonStatus('sendBtn', 'Успішно надіслано!', 'success');
            if (autoCloseEnabled) setTimeout(() => window.close(), 1200);
        } else {
            showButtonStatus('sendBtn', data.response_status || 'Невідома помилка', 'error');
        }
    })
    .catch(error => {
        console.error("Помилка відправки SMS:", error); // В консоль для дебагу
        showButtonStatus('sendBtn', 'Помилка з\'єднання з API!', 'error');
    });
});

    // ТИМЧАСОВА КНОПКА ДЛЯ РОЗРОБНИКА
    let reloadBtn = document.getElementById('devReloadBtn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            chrome.runtime.reload(); // Ця команда повністю перезапускає розширення!
        });
    }
});

chrome.tabs.onActivated.addListener(() => {
    if (isSidePanel) checkAuthAndParse();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active && isSidePanel) {
        checkAuthAndParse();
    }
});