const SECRET_HASH = "f190a3d0c04e5b2b3f4ee16d2df26597720b8d1c09179d2a0dad7e4605776875";

function closeDropdown(menu, btn) {
    menu.classList.add('closing');
    menu.addEventListener('animationend', () => {
        menu.style.display = 'none';
        menu.classList.remove('closing');
    }, { once: true });
    if (btn) btn.classList.remove('open');
}

// === УНІВЕРСАЛЬНА ФУНКЦІЯ ДРОПДАУНУ ===
// Використання: initDropdown('btnId', 'menuId', 'inputId', (value, label) => { ... }, { canOpen: () => true })
// inputId — необов'язковий (null якщо не потрібен)
// onSelect — викликається при виборі пункту: (value, label) => {}
// options.canOpen — необов'язкова функція-перевірка чи можна відкрити
function initDropdown(btnId, menuId, inputId, onSelect, options = {}) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    const input = inputId ? document.getElementById(inputId) : null;
    if (!btn || !menu) return null;

    const self = {
        open() {
            // Закриваємо всі інші відкриті дропдауни
            document.querySelectorAll('.floating-dropdown').forEach(m => {
                if (m !== menu && m.style.display === 'block') m._ddClose?.();
            });
            menu.style.display = 'block';
            btn.classList.add('open');
        },
        close() {
            closeDropdown(menu, btn);
        },
        toggle(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (options.canOpen && !options.canOpen()) return;
            menu.style.display === 'block' ? self.close() : self.open();
        },
        clearItems() {
            menu.innerHTML = '';
        },
        addItem(label, value) {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerText = label;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (input) input.value = label;
                self.close();
                if (onSelect) onSelect(value !== undefined ? value : label, label);
            });
            menu.appendChild(item);
            return item;
        }
    };

    // Зберігаємо посилання на close прямо на елементі (для закриття ззовні)
    menu._ddClose = self.close;

    btn.addEventListener('click', (e) => self.toggle(e));
    if (input) input.addEventListener('click', (e) => self.toggle(e));

    // Клік поза меню — закрити
    document.addEventListener('click', (e) => {
        if (menu.style.display === 'block'
            && !btn.contains(e.target)
            && !menu.contains(e.target)
            && e.target !== input) {
            self.close();
        }
    });

    return self;
}

// Глобальні екземпляри дропдаунів (потрібні в renderPhoneSelector та loadTemplatesFromFile)
let phoneDropdown, templateDropdown, themeDropdown;

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

// Очищаємо попередні класи ТІЛЬКИ якщо елементи існують
    if (badge) badge.className = 'phone-badge'; 
    if (btn) btn.className = 'inside-input-btn'; // скидаємо анімацію

    if (currentNetwork === 'ultra' && badge) {
        badge.classList.add('ultra-color'); // Додає фіолетовий колір Ultranet
    } else if (currentNetwork === 'energy' && badge) {
        badge.classList.add('energy-color'); // Додає зелений колір ISP Energy
    }

    // Додаємо м'яку анімацію, щоб кнопка привертала увагу
    if (btn) btn.classList.add('anim-bounce-down');

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
    if (menu && phoneDropdown) {
        phoneDropdown.clearItems();
        phones.forEach(p => phoneDropdown.addItem('+ ' + p, p));
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
let isValidSubscriber = false; 
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

        wrapper.innerHTML = `СМС: <strong class="${partsClass}">${parts}</strong>шт<span style="margin-left: 5px;">≈ <strong class="${colorClass}">${totalCost}</strong> ₴</span>`;
    }
}

// === 1. З УКРАЇНСЬКОЇ НА ЛАТИНИЦЮ (КМУ №55) ===
function transliterateToLatin(text) {
    if (!text) return '';
    text = text.replace(/Зг/g, 'Zgh').replace(/зг/g, 'zgh');

    const strictMap = {
        'А':'A', 'а':'a', 'Б':'B', 'б':'b', 'В':'V', 'в':'v', 'Г':'H', 'г':'h',
        'Ґ':'G', 'ґ':'g', 'Д':'D', 'д':'d', 'Е':'E', 'е':'e', 'Ж':'Zh', 'ж':'zh',
        'З':'Z', 'з':'z', 'И':'Y', 'и':'y', 'І':'I', 'і':'i', 'К':'K', 'к':'k',
        'Л':'L', 'л':'l', 'М':'M', 'м':'m', 'Н':'N', 'н':'n', 'О':'O', 'о':'o',
        'П':'P', 'п':'p', 'Р':'R', 'р':'r', 'С':'S', 'с':'s', 'Т':'T', 'т':'t',
        'У':'U', 'у':'u', 'Ф':'F', 'ф':'f', 'Х':'Kh', 'х':'kh', 'Ц':'Ts', 'ц':'ts',
        'Ч':'Ch', 'ч':'ch', 'Ш':'Sh', 'ш':'sh', 'Щ':'Shch','щ':'shch'
    };

    const positionalMap = {
        'Є': { start: 'Ye', other: 'ie' }, 'є': { start: 'ye', other: 'ie' },
        'Ї': { start: 'Yi', other: 'i' },  'ї': { start: 'yi', other: 'i' },
        'Й': { start: 'Y',  other: 'i' },  'й': { start: 'y',  other: 'i' },
        'Ю': { start: 'Yu', other: 'iu' }, 'ю': { start: 'yu', other: 'iu' },
        'Я': { start: 'Ya', other: 'ia' }, 'я': { start: 'ya', other: 'ia' }
    };

    let result = '';
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let isStartOfWord = (i === 0) || /[\s\n\.,!?;:'"()\[\]{}\-]/.test(text[i - 1]);

        if (strictMap[char] !== undefined) {
            result += strictMap[char];
        } else if (positionalMap[char] !== undefined) {
            result += isStartOfWord ? positionalMap[char].start : positionalMap[char].other;
        } else if (char === 'ь' || char === 'Ь' || char === '\'' || char === '’' || char === '`' || char === 'ʼ') {
            continue; // М'який знак та апострофи видаляємо
        } else {
            result += char;
        }
    }
    return result;
}

// === 2. З ЛАТИНИЦІ НА УКРАЇНСЬКУ (Зворотний алгоритм) ===
function transliterateToCyrillic(text) {
    if (!text) return '';
    
    // 1. Складні комбінації
    let res = text
        .replace(/Zgh/g, 'Зг').replace(/zgh/g, 'зг')
        .replace(/Shch/g, 'Щ').replace(/shch/g, 'щ')
        .replace(/Ts/g, 'Ц').replace(/ts/g, 'ц')
        .replace(/Ch/g, 'Ч').replace(/ch/g, 'ч')
        .replace(/Sh/g, 'Ш').replace(/sh/g, 'ш')
        .replace(/Kh/g, 'Х').replace(/kh/g, 'х')
        .replace(/Zh/g, 'Ж').replace(/zh/g, 'ж');

    // 2. Позиційні (на початку слова: межа слова \b)
    res = res
        .replace(/\bYe/g, 'Є').replace(/\bye/g, 'є')
        .replace(/\bYi/g, 'Ї').replace(/\byi/g, 'ї')
        .replace(/\bYu/g, 'Ю').replace(/\byu/g, 'ю')
        .replace(/\bYa/g, 'Я').replace(/\bya/g, 'я')
        .replace(/\bY/g, 'Й').replace(/\by/g, 'й');

    // 3. Позиційні (всередині слова)
    res = res.replace(/ie/g, 'є').replace(/iu/g, 'ю').replace(/ia/g, 'я');

    // 4. Пряма заміна 1 до 1
    const simpleMap = {
        'A':'А', 'a':'а', 'B':'Б', 'b':'б', 'V':'В', 'v':'в', 'H':'Г', 'h':'г',
        'G':'Ґ', 'g':'ґ', 'D':'Д', 'd':'д', 'E':'Е', 'e':'е', 'Z':'З', 'z':'з',
        'Y':'И', 'y':'и', 'I':'І', 'i':'і', 'K':'К', 'k':'к', 'L':'Л', 'l':'л', 
        'M':'М', 'm':'м', 'N':'Н', 'n':'н', 'O':'О', 'o':'о', 'P':'П', 'p':'п', 
        'R':'Р', 'r':'р', 'S':'С', 's':'с', 'T':'Т', 't':'т', 'U':'У', 'u':'у', 
        'F':'Ф', 'f':'ф'
    };

    let finalRes = '';
    for (let i = 0; i < res.length; i++) {
        let char = res[i];
        finalRes += simpleMap[char] !== undefined ? simpleMap[char] : char;
    }

    return finalRes;
}

function updatePreview() {
    if (!loadedTemplates || loadedTemplates.length === 0) return;
    
    let selectedIndex = selectedTemplateIndex;
    
    // Якщо шаблон ще не вибрано (ми не на білінгу) - поле пусте
    if (selectedIndex === null) {
        updateSmsCounter();
        updateTranslitBtnState();
        return;
    }
    
    if (!loadedTemplates[selectedIndex]) {
        document.getElementById('message').value = 'Шаблон не знайдено';
        updateSmsCounter(); 
        return;
    }

    let text = loadedTemplates[selectedIndex].text;  
    let amount = document.getElementById('amount').value;
    if (!amount) amount = 'xxxx';
    
    text = text.replace(/{amount}/g, amount);
    text = text.replace(/{contract}/g, extractedData.contract);
    text = text.replace(/{password}/g, extractedData.password);
    
    document.getElementById('message').value = text;
    
    updateSmsCounter(); 
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

async function loadTemplatesFromFile(network, isBillingSite = true) {
    if (!network) {
        loadedTemplates = [];
        selectedTemplateIndex = null;
        return; 
    }
    let fileName = network === 'ultra' ? 'templates_ultra.json' : 'templates_energy.json';
    try {
        let url = chrome.runtime.getURL(fileName);
        let response = await fetch(url);
        loadedTemplates = await response.json();

        let menu = document.getElementById('templateDropdownMenu');
        let input = document.getElementById('templateInput');
        
        if (!menu || !input) return;
        
        menu.innerHTML = ''; 

        // Ставимо початковий текст (або залишаємо пустим)
        if (loadedTemplates.length > 0) {
            if (isBillingSite) {
                if (selectedTemplateIndex === null || selectedTemplateIndex >= loadedTemplates.length) {
                    selectedTemplateIndex = 0;
                }
                input.value = loadedTemplates[selectedTemplateIndex].title;
            } else {
                // Якщо не на сайті білінгу - скидаємо індекс і очищаємо поле
                selectedTemplateIndex = null;
                input.value = ''; 
                input.placeholder = 'Оберіть шаблон...';
            }
        }

        // Наповнюємо плаваюче меню
        if (templateDropdown) {
            templateDropdown.clearItems();
            loadedTemplates.forEach((tpl, index) => {
                templateDropdown.addItem(tpl.title, index);
            });
        }
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
    // Відновлюємо індекс (може бути null)
    selectedTemplateIndex = cachedState.templateIndex !== undefined ? cachedState.templateIndex : null;
    
    // Візуально повертаємо назву шаблону в поле
    let tplInput = document.getElementById('templateInput');
    if (tplInput) {
        if (selectedTemplateIndex !== null && loadedTemplates[selectedTemplateIndex]) {
            tplInput.value = loadedTemplates[selectedTemplateIndex].title;
        } else {
            tplInput.value = ''; // Якщо індекс null, залишаємо пустим
        }
    }
    document.getElementById('message').value = cachedState.message || '';
    
    // ДОДАНО: Примусово запускаємо підрахунок після відновлення тексту!
    updateSmsCounter();
    updateTranslitBtnState();
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
        if (!subTitle) return;
        let isBillingSite = true;
        
        // 1. ВИЗНАЧАЄМО МЕРЕЖУ ПО ДОМЕНУ
        let currentUrl = currentTab.url || ""; // Якщо URL немає, робимо його порожнім текстом, щоб скрипт не падав

        if (currentUrl.includes('bill.ultranetgroup.com.ua')) {
            currentNetwork = 'ultra';
        } else if (currentUrl.includes('bill.ispenergy.com.ua')) {
            currentNetwork = 'energy';
        } else {
            currentNetwork = null; // <--- БЛОКУЄМО МЕРЕЖУ!
            isBillingSite = false;
        }

        // 2. ЗАВАНТАЖУЄМО ШАБЛОНИ ОДРАЗУ (передаємо інфо, чи ми на сайті білінгу)
        await loadTemplatesFromFile(currentNetwork, isBillingSite);

        // 3. ЯКЩО ЦЕ НЕ САЙТ БІЛІНГУ
        if (!isBillingSite) {
            isValidSubscriber = false;
            subTitle.innerText = 'Перевіряйте дані абонента перед відправкою смс!';
            subTitle.className = 'warning-text'; 
            subTitle.style.display = 'block';
            
            // Робимо недоступним поле шаблону, але залишаємо його пустим
            let tplInput = document.getElementById('templateInput');
            if (tplInput) {
                tplInput.value = ''; // ТУТ ТЕПЕР ПУСТО
                tplInput.placeholder = ''; // Прибираємо навіть підказку
                tplInput.disabled = true;
                tplInput.style.cursor = 'not-allowed';
            }
            
            // Очищаємо інші поля, але НЕ блокуємо їх (щоб працювали команди test / up)
            document.getElementById('phone').value = '';
            document.getElementById('amount').value = '';
            document.getElementById('message').value = '';
            
            updateSmsCounter();
            return; 
        } else {
            // РОЗБЛОКОВУЄМО поле шаблону, якщо повернулися на білінг
            let tplInput = document.getElementById('templateInput');
            if (tplInput) {
                tplInput.disabled = false;
                tplInput.style.cursor = 'pointer';
                tplInput.placeholder = 'Оберіть шаблон...'; // Повертаємо підказку
            }
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
                isValidSubscriber = false; // Забороняємо відправку
                
                subTitle.innerText = 'Перевіряйте дані абонента перед відправкою смс!';
                subTitle.className = 'warning-text'; 
                subTitle.style.display = 'block';
                
                // РОБИМО ПОЛЕ ШАБЛОНІВ ПУСТИМ І НЕДОСТУПНИМ
                let tplInput = document.getElementById('templateInput');
                if (tplInput) {
                    tplInput.value = ''; 
                    tplInput.placeholder = ''; 
                    tplInput.disabled = true;
                    tplInput.style.cursor = 'not-allowed';
                }
                
                selectedTemplateIndex = null; // <--- ДОДАНО: Скидаємо внутрішню пам'ять про шаблон
                
                // Очищаємо інші поля
                document.getElementById('phone').value = '';
                document.getElementById('amount').value = '';
                document.getElementById('message').value = ''; // <--- ЗМІНЕНО: Жорстко очищаємо поле повідомлення
                
                // updatePreview(); <--- ВИДАЛЕНО: Саме це викликало автоматичний запис тексту!
                
                updateSmsCounter();
                return; 
            }

            // === ЯКЩО МИ ТУТ - ЗНАЧИТЬ ВІДКРИТА КАРТКА АБОНЕНТА ===
            isValidSubscriber = true;
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

// === ФУНКЦІЯ ВІДОБРАЖЕННЯ ОНОВЛЕННЯ В UI ===
function showUpdateUI(newVersion) {
    const badge = document.getElementById('menuUpdateBadge');
    const updateBtn = document.getElementById('menuUpdateBtn');
    const versionEl = document.getElementById('newVersionText');
    const DOWNLOAD_URL = 'https://github.com/ultranetpopilnya/UltraEnergy-SMS-Tool/archive/refs/heads/main.zip';

    if (badge) badge.style.display = 'block';
    if (versionEl && newVersion) versionEl.innerText = newVersion;
    if (updateBtn) {
        updateBtn.style.display = 'flex';
        updateBtn.onclick = () => window.open(DOWNLOAD_URL, '_blank');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // ДОДАЛИ В ЗАПИТ updateAvailable ТА newVersion
    chrome.storage.local.get(['isAuthorized', 'theme', 'updateAvailable', 'newVersion'], (data) => {
        
        let savedTheme = data.theme || 'light';
        document.body.setAttribute('data-theme', savedTheme);

        let themeInput = document.getElementById('themeInput');
        if (themeInput) {
            themeInput.dataset.value = savedTheme;
            themeInput.value = savedTheme === 'dark' ? 'Темна тема' : 'Світла тема';
        }

        document.body.classList.add('theme-loaded');

        if (data.isAuthorized) {
            document.getElementById('loginView').style.display = 'none';
            document.getElementById('onboardingView').style.display = 'none';
            document.getElementById('mainView').style.display = 'block';
            loadSettings();
            runAutoParse();
            
            // 1. Миттєво показуємо оновлення, якщо бекграунд вже його знайшов раніше
            if (data.updateAvailable) {
                showUpdateUI(data.newVersion);
            }

            // 2. Змушуємо бекграунд перевірити ще раз ПРЯМО ЗАРАЗ (вимога: перевіряти при відкритті)
            chrome.runtime.sendMessage({ type: 'CHECK_FOR_UPDATE_NOW' }, (response) => {
                if (response && response.isNew) {
                    showUpdateUI(response.version);
                }
            });
            
        } else {
            document.getElementById('loginView').style.display = 'block';
            document.getElementById('onboardingView').style.display = 'none';
            document.getElementById('mainView').style.display = 'none';
        }
    });
    

    // === ІНІЦІАЛІЗАЦІЯ ВСІХ ДРОПДАУНІВ ===

    phoneDropdown = initDropdown('phoneDropdownBtn', 'phoneDropdownMenu', null, (value) => {
        document.getElementById('phone').value = value;
        saveStateToCache();
    });

    templateDropdown = initDropdown('templateDropdownBtn', 'templateDropdownMenu', 'templateInput',
        (value) => {
            selectedTemplateIndex = value;
            updatePreview();
            saveStateToCache();
        },
        { canOpen: () => !!currentNetwork }
    );

    themeDropdown = initDropdown('themeDropdownBtn', 'themeDropdownMenu', 'themeInput',
        (value, label) => {
            const themeInput = document.getElementById('themeInput');
            themeInput.dataset.value = value;
            document.body.setAttribute('data-theme', value);
        }
    );

    // Додаємо статичні пункти для теми (вони не генеруються динамічно)
    if (themeDropdown) {
        themeDropdown.addItem('Світла тема', 'light');
        themeDropdown.addItem('Темна тема', 'dark');
    }
    
    // === СЛУХАЧ КНОПКИ ТРАНСЛІТЕРАЦІЇ (ДВОСТОРОННІЙ) ===
    const translitBtn = document.getElementById('translitBtn');
    if (translitBtn) {
        translitBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            let msgEl = document.getElementById('message');
            let text = msgEl.value;
            if (!text) return;

            const hasCyrillic = /[а-яА-ЯєЄїЇіІґҐ]/.test(text);

            if (hasCyrillic) {
                msgEl.value = transliterateToLatin(text);
            } else {
                msgEl.value = transliterateToCyrillic(text);
            }
            
            updateSmsCounter(); 
            saveStateToCache(); 
            updateTranslitBtnState(); // <--- ДОДАНО: одразу міняє напис після кліку
        });
    }

    // === ФУНКЦІЯ: ОНОВЛЕННЯ ТЕКСТУ НА КНОПЦІ ТРАНСЛІТУ ===
function updateTranslitBtnState() {
    const btnText = document.getElementById('translitBtnText');
    const msgEl = document.getElementById('message');
    if (!btnText || !msgEl) return;
    
    const text = msgEl.value;
    
    // Якщо пусто або є хоч одна кирилична літера -> Пропонуємо "в Lat"
    const hasCyrillic = /[а-яА-ЯєЄїЇіІґҐ]/.test(text);
    
    if (text === '' || hasCyrillic) {
        btnText.innerText = 'Трансліт латиницею';
    } else {
        btnText.innerText = 'Трансліт кирилицею';
    }
}

// === ЛОГІКА БОКОВОГО МЕНЮ (САЙДБАР) ===
    
    // Відображення версії
    let versionEl = document.getElementById('currentVersionText');
    if (versionEl) {
        versionEl.innerText = chrome.runtime.getManifest().version;
    }

    const mainMenuBtn = document.getElementById('mainMenuBtn');
    const mainMenuDropdown = document.getElementById('mainMenuDropdown');

    function closeMainMenu() {
        if (!mainMenuDropdown) return;
        mainMenuDropdown.classList.remove('open');
        if (mainMenuBtn) mainMenuBtn.classList.remove('menu-open');
    }

    if (mainMenuBtn && mainMenuDropdown) {
        // Відкриття/Закриття меню
        mainMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (mainMenuDropdown.classList.contains('open')) {
                closeMainMenu();
            } else {
                // Ховаємо всі інші відкриті дропдауни
                document.querySelectorAll('.floating-dropdown').forEach(m => {
                    if (m.style.display === 'block') m._ddClose?.();
                    m.style.display = 'none';
                });
                
                mainMenuDropdown.classList.add('open');
                mainMenuBtn.classList.add('menu-open');
            }
        });

        // Клік поза меню закриває його
        document.addEventListener('click', (e) => {
            if (mainMenuDropdown.classList.contains('open') && 
                !mainMenuDropdown.contains(e.target) && 
                !mainMenuBtn.contains(e.target)) {
                closeMainMenu();
            }
        });
    }

    // === ФУНКЦІЇ КНОПОК ВСЕРЕДИНІ МЕНЮ ===

    // 1. Кнопка Налаштування
    const menuSettingsBtn = document.getElementById('menuSettingsBtn');
    if (menuSettingsBtn) {
        menuSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            
            const mainMenuDropdown = document.getElementById('mainMenuDropdown');
            const mainMenuBtn = document.getElementById('mainMenuBtn');
            
            // 1. Меню розтягується
            mainMenuDropdown.classList.add('expanding-to-full');
            mainMenuBtn.style.opacity = '0';

            // 2. Чекаємо 300мс
            setTimeout(() => {
                document.getElementById('mainView').style.display = 'none';
                
                const settingsView = document.getElementById('settingsView');
                settingsView.className = ''; 
                settingsView.style.display = 'block'; 
                settingsView.classList.add('anim-fade-slide'); // Поява налаштувань
                
                // 3. БЕЗПЕЧНЕ СКИДАННЯ МЕНЮ (ховаємо, скидаємо класи, повертаємо)
                mainMenuDropdown.style.display = 'none';
                mainMenuDropdown.classList.remove('open', 'expanding-to-full');
                setTimeout(() => { mainMenuDropdown.style.display = 'flex'; }, 50);
                
                document.getElementById('ultraToken').value = creds.ultra.token;
                document.getElementById('energyToken').value = creds.energy.token;
                document.getElementById('smsPriceInput').value = savedSmsPrice;
                resetButton('saveSettingsBtn'); 
            }, 300);
        });
    }

    // 2. Кнопка Закріплення (Pin)
    const menuPinBtnText = document.getElementById('menuPinBtn');
    if (menuPinBtnText) {
        if (isSidePanel) {
            menuPinBtnText.innerHTML = `<img src="icons/left_arrow_3d.png" class="menu-icon"> Закрити панель`;
        }
        menuPinBtnText.addEventListener('click', () => {
            closeMainMenu();
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
    }

    // 3. Кнопка Перезавантаження
    const menuReloadBtn = document.getElementById('menuReloadBtn');
    if (menuReloadBtn) {
        menuReloadBtn.addEventListener('click', () => {
            chrome.runtime.reload();
        });
    }

    // 4. Кнопка Оновлення
    const menuUpdateBtn = document.getElementById('menuUpdateBtn');
    if (menuUpdateBtn) {
        menuUpdateBtn.addEventListener('click', () => {
            window.open("https://github.com/ultranetpopilnya/UltraEnergy-SMS-Tool/archive/refs/heads/main.zip", "_blank");
            closeMainMenu();
        });
    }

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

    // === НОВА КНОПКА ЗАКРИТТЯ НАЛАШТУВАНЬ (ІКОНКА ХРЕСТИК) ===
    document.getElementById('closeSettingsIconBtn').addEventListener('click', () => {
        const settingsView = document.getElementById('settingsView');
        const mainView = document.getElementById('mainView');
        const mainMenuBtn = document.getElementById('mainMenuBtn');
        
        // 1. Екран налаштувань їде вправо
        settingsView.className = 'anim-slide-out-right';
        
        setTimeout(() => {
            settingsView.style.display = 'none';
            
            // 2. Головний екран заїжджає зліва
            mainView.className = ''; 
            mainView.style.display = 'block'; 
            void mainView.offsetWidth; 
            mainView.classList.add('anim-slide-left'); 
            
            // 3. Повертаємо гамбургер
            mainMenuBtn.style.opacity = '1';
            mainMenuBtn.classList.remove('menu-open');
            
            // Стискаємо вікно
            setTimeout(() => { document.body.style.height = 'auto'; }, 10);
        }, 250); // Час збігається з анімацією slideOutRight
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

    // Захист від перенавантаження Chrome Storage (Debounce)
    let saveTimeout;
    const safeSaveToCache = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveStateToCache, 400); // Зберігає лише коли перестали друкувати на 400мс
    };

    document.getElementById('amount').addEventListener('input', () => {
        updatePreview();
        safeSaveToCache();
    });
    document.getElementById('phone').addEventListener('input', safeSaveToCache);
    document.getElementById('message').addEventListener('input', () => {
        safeSaveToCache();
        updateSmsCounter(); 
        updateTranslitBtnState(); 
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
            resetButton('sendBtn');
            
            // Викликаємо нашу нову функцію
            showUpdateUI("9.9.9");
            
            // Автоматично відкриваємо меню, щоб користувач побачив зміну
            document.getElementById('mainMenuBtn').click();
            
            // Тестово малюємо бейдж на самій іконці хрому (бо бекграунд це робить автоматично, а ми симулюємо)
            chrome.action.setBadgeText({ text: '1' });
            chrome.action.setBadgeBackgroundColor({ color: '#811e71' });

        }, 600);
        return;
    }

    // === ОСНОВНА ЛОГІКА ВІДПРАВКИ SMS ===
    // <--- ДОДАНО: БЛОКУЄМО, ЯКЩО НЕ В КАРТЦІ АБОНЕНТА --->
    if (!isValidSubscriber) {
        showButtonStatus('sendBtn', 'Відкрийте картку абонента!', 'error');
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

    // ДОДАНО: Контролер для таймауту запиту (10 секунд)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch('https://api.turbosms.ua/message/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ "recipients": [phone], "sms": { "sender": currentSender, "text": text } }),
        signal: controller.signal // <--- Передаємо сигнал
    })
    .then(response => {
        clearTimeout(timeoutId); // <--- Скасовуємо таймаут, якщо відповідь прийшла
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
        clearTimeout(timeoutId);
        console.error("Помилка відправки SMS:", error);
        // ДОДАНО: Обробка помилки таймауту
        if (error.name === 'AbortError') {
            showButtonStatus('sendBtn', 'Сервер TurboSMS не відповідає!', 'error');
        } else {
            showButtonStatus('sendBtn', 'Помилка з\'єднання з API!', 'error');
        }
    });
});
});

chrome.tabs.onActivated.addListener(() => {
    if (isSidePanel) checkAuthAndParse();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active && isSidePanel) {
        checkAuthAndParse();
    }
});