// Импорты из ядра SillyTavern
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "facts-memory-tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
};

// Загрузка настроек
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    // Устанавливаем галочку в UI согласно сохраненным настройкам
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
}

// Сохранение при переключении чекбокса
function onAutoScanChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoScan = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Auto-scan toggled:`, value);
}

// ФУНКЦИЯ СКАНЕР: выполняется при нажатии кнопки
async function onManualScanClick() {
    console.log(`[${extensionName}] Manual scan triggered...`);
    
    // Получаем текущий контекст чата
    const context = getContext();
    const chat = context.chat; 
    
    if (!chat || chat.length === 0) {
        console.warn(`[${extensionName}] Chat is empty!`);
        toastr.warning("Чат пуст, нечего сканировать.");
        return;
    }

    // Выводим информацию в консоль для проверки
    console.log(`[${extensionName}] Сообщений в чате: ${chat.length}`);
    const lastMessage = chat[chat.length - 1];
    console.log(`[${extensionName}] Последнее сообщение:`, lastMessage.mes);
    
    // Показываем уведомление в интерфейсе ST
    toastr.info(`Найдено сообщений: ${chat.length}. Текст последнего лога в консоли (F12).`, "Facts Memory Tracker");
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading Stage 3...`);
   
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        // Привязываем события к элементам интерфейса
        $("#fmt_auto_scan").on("input", onAutoScanChange);
        $("#fmt_manual_scan").on("click", onManualScanClick);
       
        loadSettings();
       
        console.log(`[${extensionName}] ✅ Stage 3 loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load Stage 3:`, error);
    }
});
