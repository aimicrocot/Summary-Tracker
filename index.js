import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "facts-memory-tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Настройки по умолчанию теперь включают массив фактов
const defaultSettings = {
    autoScan: false,
    facts: [] 
};

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    // Если по какой-то причине фактов нет, создаем пустой массив
    if (!extension_settings[extensionName].facts) {
        extension_settings[extensionName].facts = [];
    }

    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
    renderFacts(); // Отрисовываем список при загрузке
}

// Функция для отрисовки списка на экране
function renderFacts() {
    const listContainer = $("#fmt_facts_list");
    const facts = extension_settings[extensionName].facts;

    if (facts.length === 0) {
        listContainer.html('<small style="opacity:0.5;">Список пуст...</small>');
        return;
    }

    let html = '<ul style="padding-left: 20px; margin: 0;">';
    facts.forEach((fact, index) => {
        html += `<li style="margin-bottom: 5px;">${fact}</li>`;
    });
    html += '</ul>';
    listContainer.html(html);
}

function onAutoScanChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoScan = value;
    saveSettingsDebounced();
}

// Очистка списка
function clearFacts() {
    if (confirm("Вы уверены, что хотите удалить все найденные факты?")) {
        extension_settings[extensionName].facts = [];
        saveSettingsDebounced();
        renderFacts();
        toastr.info("Список очищен");
    }
}

async function onManualScanClick() {
    const context = getContext();
    const chat = context.chat;
    
    if (!chat || chat.length === 0) {
        toastr.info("Чат пуст.");
        return;
    }

    toastr.info("Анализирую...", "Facts Memory Tracker");
    
    const lastMessage = chat[chat.length - 1].mes;
    const promptText = `Analyze the following text and extract one short factual statement about the character. Respond ONLY with the fact: "${lastMessage}"`;

    try {
        const response = await window.SillyTavern.getContext().generateRaw({
            prompt: promptText,
            text: promptText 
        });
        
        if (response) {
            const newFact = response.trim();
            
            // СОХРАНЕНИЕ: Добавляем в массив и сохраняем в ST
            extension_settings[extensionName].facts.push(newFact);
            saveSettingsDebounced();
            
            // Обновляем UI
            renderFacts();
            toastr.success("Факт добавлен в список!");
        }
    } catch (error) {
        console.error(`[${extensionName}] Ошибка:`, error);
        toastr.error("ИИ не ответил.");
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", onAutoScanChange);
        $("#fmt_manual_scan").on("click", onManualScanClick);
        $("#fmt_clear_facts").on("click", clearFacts); // Кнопка очистки
       
        loadSettings();
        console.log(`[${extensionName}] ✅ Stage 5 (Persistence) Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
