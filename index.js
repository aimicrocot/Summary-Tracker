// Импорты из ядра SillyTavern
import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "facts-memory-tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Настройки по умолчанию
const defaultSettings = {
    autoScan: false,
};

// Загрузка настроек
function loadSettings() {
    // Инициализируем настройки расширения, если их нет
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    // Слияние с настройками по умолчанию
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Устанавливаем состояние чекбокса в UI
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
}

// Обработка изменения чекбокса
function onAutoScanChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoScan = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Auto-scan toggled:`, value);
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading Stage 2...`);
   
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        // Привязываем событие к чекбоксу
        $("#fmt_auto_scan").on("input", onAutoScanChange);
       
        // Загружаем сохраненные настройки
        loadSettings();
       
        console.log(`[${extensionName}] ✅ Stage 2 loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
