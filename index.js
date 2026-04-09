// Импорты (только проверенные и 100% рабочие!)
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "facts-memory-tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
};

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
}

function onAutoScanChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoScan = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Auto-scan toggled:`, value);
}

// ФУНКЦИЯ СКАНЕР
async function onManualScanClick() {
    const context = getContext();
    const chat = context.chat;
    
    if (!chat || chat.length <= 4) {
        toastr.info("Нужно больше 4 сообщений для анализа.");
        return;
    }

    toastr.info("Пытаюсь сгенерировать факт...", "Facts Memory Tracker");
    
    const targetIndex = chat.length - 1; // Берем самое последнее сообщение для теста
    const messageToAnalyze = chat[targetIndex].mes;
    
    const prompt = `Проанализируй текст и выдели 1 факт о персонаже: "${messageToAnalyze}". Ответь коротко.`;

    try {
        console.log(`[${extensionName}] Пробую альтернативный метод генерации...`);
        
        // Попытка использовать глобальную функцию SillyTavern
        // Это самый современный и безопасный способ для расширений
        const generatedText = await window.SillyTavern.getContext().generateRaw(prompt);
        
        if (generatedText) {
            console.log(`[${extensionName}] ИИ ответил:`, generatedText);
            toastr.success("Факт получен! См. консоль.", "Facts Memory Tracker");
        } else {
            throw new Error("ИИ вернул пустой ответ.");
        }
        
    } catch (error) {
        console.error(`[${extensionName}] Ошибка метода SillyTavern:`, error);
        
        // Если метод выше не сработал, пробуем последний "дикий" вариант
        try {
            console.log(`[${extensionName}] Пробую прямой вызов API...`);
            const { generateRaw } = await import("../../../../script.js");
            const altResult = await generateRaw(prompt);
            console.log(`[${extensionName}] ИИ ответил (метод 2):`, altResult);
            toastr.success("Факт получен через script.js!", "Facts Memory Tracker");
        } catch (finalError) {
            console.error(`[${extensionName}] Все методы генерации провалены.`);
            toastr.error("Не удалось подключиться к ИИ. Проверь консоль.");
        }
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", onAutoScanChange);
        $("#fmt_manual_scan").on("click", onManualScanClick); // Привязка кнопки
       
        loadSettings();
        console.log(`[${extensionName}] ✅ Safe Stage 4 Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
