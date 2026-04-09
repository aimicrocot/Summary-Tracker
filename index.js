// Импорты из ядра SillyTavern
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// Имя расширения ДОЛЖНО точно совпадать с именем папки на GitHub/в SillyTavern
const extensionName = "facts-memory-tracker"; 
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Инициализация расширения
jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
   
    try {
        // Загрузка HTML из файла
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
       
        // Добавление в панель настроек (правая колонка для UI расширений, там же где и Саммари)
        $("#extensions_settings2").append(settingsHtml);
       
        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});