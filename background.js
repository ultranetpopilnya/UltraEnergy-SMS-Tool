// Скидаємо старе налаштування Chrome, щоб по кліку на іконку знову відкривався Popup
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error("Помилка налаштування панелі:", error));

// Відновлюємо значок після перезапуску service worker, але одразу перевіряємо актуальність
chrome.storage.local.get(['updateAvailable'], (data) => {
    if (data.updateAvailable) {
        // Тимчасово показуємо бейдж (щоб користувач бачив його без затримок)
        chrome.action.setBadgeText({ text: '1' });
        chrome.action.setBadgeBackgroundColor({ color: '#811e71' });
        
        // Робимо фонову перевірку. Якщо версію на GitHub відкотили назад 
        // або користувач вже оновився, бейдж сам зникне.
        checkForUpdates(); 
    }
});


console.log("Background оновлено: бокова панель більше не відкривається примусово.");

const MANIFEST_URL = 'https://raw.githubusercontent.com/ultranetpopilnya/UltraEnergy-SMS-Tool/refs/heads/main/manifest.json';

// 1. Створюємо таймер на перевірку (щогодини)
chrome.alarms.create('periodicUpdateCheck', { periodInMinutes: 60 });

// 2. Слухаємо події: спрацювання таймера або відкриття розширення (через повідомлення)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'periodicUpdateCheck') checkForUpdates();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHECK_FOR_UPDATE_NOW') {
        checkForUpdates().then(result => sendResponse(result));
        return true; // Важливо для асинхронної відповіді
    }
});

// Головна функція перевірки
async function checkForUpdates() {
    try {
        const currentVersion = chrome.runtime.getManifest().version;
        const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`);
        const data = await response.json();
        
        const isNew = isNewerVersion(data.version, currentVersion);

        if (isNew) {
            // Малюємо одиницю на іконці
            chrome.action.setBadgeText({ text: '1' });
            chrome.action.setBadgeBackgroundColor({ color: '#811e71' });
            // Зберігаємо інфо про нову версію
            await chrome.storage.local.set({ updateAvailable: true, newVersion: data.version });
        } else {
            chrome.action.setBadgeText({ text: '' });
            await chrome.storage.local.set({ updateAvailable: false });
        }
        return { isNew, version: data.version };
    } catch (e) {
        console.error('Помилка перевірки оновлень:', e);
        return { isNew: false };
    }
}

// Допоміжна функція порівняння
function isNewerVersion(remote, current) {
    const r = remote.split('.').map(Number);
    const c = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((r[i] || 0) > (c[i] || 0)) return true;
        if ((r[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
}