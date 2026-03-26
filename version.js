document.addEventListener('DOMContentLoaded', () => {
    const versionElement = document.getElementById('app-version');

    // Перевіряємо, чи сторінка відкрита всередині встановленого розширення
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        versionElement.textContent = chrome.runtime.getManifest().version;
    } 
    // Якщо ви просто двічі клікнули по index.html на комп'ютері для перевірки
    else {
        fetch('manifest.json')
            .then(response => response.json())
            .then(data => {
                versionElement.textContent = data.version;
            })
            .catch(error => {
                versionElement.textContent = "Помилка завантаження";
                console.error("Не вдалося отримати версію:", error);
            });
    }
});