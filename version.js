const MANIFEST_URL = 'https://raw.githubusercontent.com/ultranetpopilnya/UltraEnergy-SMS-Tool/refs/heads/main/manifest.json';
const DOWNLOAD_URL = 'https://github.com/ultranetpopilnya/UltraEnergy-SMS-Tool/archive/refs/heads/main.zip';

// Порівняння версій "1.2.3" > "1.1.0" → true
function isNewerVersion(remote, current) {
    const toArr = v => String(v).split('.').map(Number);
    const r = toArr(remote);
    const c = toArr(current);
    for (let i = 0; i < Math.max(r.length, c.length); i++) {
        const ri = r[i] || 0;
        const ci = c[i] || 0;
        if (ri > ci) return true;
        if (ri < ci) return false;
    }
    return false;
}

// Функція показу оновлення на вашій круглій кнопці
function showUpdateBanner(newVersion) {
    const vBtn = document.getElementById('versionBtn');
    const updateText = document.getElementById('updateText');
    const bannerVersion = document.getElementById('updateBannerVersion');

    if (!vBtn) return;

    if (bannerVersion) bannerVersion.textContent = newVersion;

    // Вмикаємо неонову кнопку
    vBtn.classList.add('has-update');
    vBtn.title = "Завантажити оновлення!";
    vBtn.href = DOWNLOAD_URL;
    vBtn.target = "_blank"; 

    if (updateText) updateText.style.display = 'flex';

    if (typeof chrome !== 'undefined' && chrome.action) {
        chrome.storage.local.set({ pendingUpdate: newVersion });
        chrome.action.setBadgeText({ text: '1' });
        chrome.action.setBadgeBackgroundColor({ color: [129, 30, 113, 255] });
    }
}

// Приховуємо оновлення, якщо версія вже актуальна
function hideUpdateBanner(currentVersion) {
    const vBtn = document.getElementById('versionBtn');
    const updateText = document.getElementById('updateText');

    if (!vBtn) return;

    vBtn.classList.remove('has-update');
    vBtn.removeAttribute('href');
    vBtn.removeAttribute('target');
    vBtn.title = "Поточна версія: " + currentVersion;

    if (updateText) updateText.style.display = 'none';

    if (typeof chrome !== 'undefined' && chrome.action) {
        chrome.storage.local.remove('pendingUpdate');
        chrome.action.setBadgeText({ text: '' });
    }
}

// Запит до GitHub і порівняння версій
async function checkForUpdate(currentVersion) {
    try {
        const res = await fetch(MANIFEST_URL + '?_=' + Date.now());
        if (!res.ok) return;

        const data = await res.json();
        const remoteVersion = data.version;

        // ОНОВЛЮЄМО НОМЕР ВЕРСІЇ В HTML (якщо елемент існує)
        const versionElement = document.getElementById('appVersion');
        if (versionElement) {
            versionElement.textContent = remoteVersion;
        }

        if (remoteVersion && isNewerVersion(remoteVersion, currentVersion)) {
            showUpdateBanner(remoteVersion);
        } else {
            hideUpdateBanner(currentVersion);
        }
    } catch (e) {
        console.warn('[UltraEnergy] Перевірка оновлень не вдалась:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let currentVersion = '0.0.0';
    const versionElement = document.getElementById('appVersion');

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        // === ЛОГІКА ДЛЯ POPUP РОЗШИРЕННЯ ===
        currentVersion = chrome.runtime.getManifest().version;
        
        // Відразу прописуємо локальну версію
        if (versionElement) versionElement.textContent = currentVersion;

        chrome.storage.local.get('pendingUpdate', (data) => {
            if (data.pendingUpdate && isNewerVersion(data.pendingUpdate, currentVersion)) {
                showUpdateBanner(data.pendingUpdate);
            } else {
                hideUpdateBanner(currentVersion);
            }
        });

        checkForUpdate(currentVersion);

    } else {
        // === ЛОГІКА ДЛЯ ЗОВНІШНЬОЇ ВЕБ-СТОРІНКИ ===
        // Беремо версію прямо з Github
        fetch(MANIFEST_URL + '?_=' + Date.now())
            .then(r => r.json())
            .then(data => {
                currentVersion = data.version;
                if (versionElement) versionElement.textContent = currentVersion;
            })
            .catch(err => {
                console.error('Не вдалося отримати версію:', err);
                if (versionElement) versionElement.textContent = "Помилка";
            });
    }
});