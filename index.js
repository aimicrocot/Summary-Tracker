import { extension_settings, getContext, eventSource, event_types } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "facts-memory-tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
    facts: [] 
};

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    if (!extension_settings[extensionName].facts) extension_settings[extensionName].facts = [];

    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
    renderFacts();
}

// Рендер списка с кнопками удаления
function renderFacts() {
    const listContainer = $("#fmt_facts_list");
    const facts = extension_settings[extensionName].facts;

    if (facts.length === 0) {
        listContainer.html('<small style="opacity:0.5;">Список пуст...</small>');
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 5px;">';
    facts.forEach((fact, index) => {
        html += `
            <div style="display: flex; justify-content: space-between; align-items: start; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 3px;">
                <span style="font-size: 0.9em; line-height: 1.2;">• ${fact}</span>
                <i class="fa-solid fa-trash fmt-delete-btn" data-index="${index}" style="cursor: pointer; color: #ff5555; margin-left: 10px; font-size: 0.8em;"></i>
            </div>`;
    });
    html += '</div>';
    listContainer.html(html);

    // Вешаем клик на корзинки
    $(".fmt-delete-btn").on("click", function() {
        const index = $(this).data("index");
        deleteFact(index);
    });
}

function deleteFact(index) {
    extension_settings[extensionName].facts.splice(index, 1);
    saveSettingsDebounced();
    renderFacts();
}

function onAutoScanChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoScan = value;
    saveSettingsDebounced();
    console.log(`[${extensionName}] Auto-scan set to:`, value);
}

function clearFacts() {
    if (confirm("Удалить все факты?")) {
        extension_settings[extensionName].facts = [];
        saveSettingsDebounced();
        renderFacts();
    }
}

// ОСНОВНАЯ ЛОГИКА СКАНЕРА (вынесена в отдельную функцию)
async function runScan() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;

    const lastMessage = chat[chat.length - 1].mes;
    const promptText = `Analyze the following text and extract one short factual statement about the character. Respond ONLY with the fact: "${lastMessage}"`;

    try {
        const response = await window.SillyTavern.getContext().generateRaw({
            prompt: promptText,
            text: promptText 
        });
        
        if (response) {
            const newFact = response.trim();
            extension_settings[extensionName].facts.push(newFact);
            saveSettingsDebounced();
            renderFacts();
            return newFact;
        }
    } catch (error) {
        console.error(`[${extensionName}] Scan failed:`, error);
    }
}

// Обработчик новых сообщений
async function onMessageReceived() {
    if (!extension_settings[extensionName].autoScan) return;

    const context = getContext();
    const chat = context.chat;

    // Проверяем: если количество сообщений кратно 4 (и не равно 0)
    if (chat && chat.length > 0 && chat.length % 4 === 0) {
        console.log(`[${extensionName}] Авто-сканирование (сообщение #${chat.length})`);
        toastr.info("Авто-сканирование фактов...");
        await runScan();
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", onAutoScanChange);
        $("#fmt_manual_scan").on("click", async () => {
            toastr.info("Ручное сканирование...");
            await runScan();
        });
        $("#fmt_clear_facts").on("click", clearFacts);
       
        loadSettings();

        // ПОДКЛЮЧАЕМ СЛУШАТЕЛЬ СОБЫТИЙ ST
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);

        console.log(`[${extensionName}] ✅ Stage 6 (Auto-Scan) Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
