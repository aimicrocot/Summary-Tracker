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
}

// ОСНОВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ
async function onManualScanClick() {
    const context = getContext();
    const chat = context.chat;
    
    if (!chat || chat.length === 0) {
        toastr.info("Чат пуст. Напишите что-нибудь.");
        return;
    }

    toastr.info("Связываюсь с ИИ...", "Facts Memory Tracker");
    
    const lastMessage = chat[chat.length - 1].mes;
    // Используем простой промпт на русском, чтобы не путать модель форматами
    const promptText = `Проанализируй текст и выдели 1 короткий факт о персонаже: "${lastMessage}". Ответь ТОЛЬКО самим фактом, без лишних слов.`;

    try {
        console.log(`[${extensionName}] Отправка запроса...`);
        
        // Передаем только текст запроса. 
        // Дублируем ключи text и prompt для совместимости с разными версиями ST
        const response = await window.SillyTavern.getContext().generateRaw({
            text: promptText,
            prompt: promptText
        });
        
        if (response) {
            console.log(`[${extensionName}] ИИ ответил:`, response);
            
            // Выводим текст в наш HTML-блок
            $("#fmt_last_fact_display").text(response.trim());
            
            toastr.success("Факт успешно извлечен!");
        } else {
            throw new Error("Пустой ответ от ИИ");
        }
        
    } catch (error) {
        console.error(`[${extensionName}] Ошибка генерации:`, error);
        toastr.error("ИИ не смог ответить. Проверь консоль.");
        $("#fmt_last_fact_display").text("Ошибка генерации. Смотри консоль (F12).");
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", onAutoScanChange);
        $("#fmt_manual_scan").on("click", onManualScanClick);
       
        loadSettings();
        console.log(`[${extensionName}] ✅ Stage 4 (Display) Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
