import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

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
    if (!extension_settings[extensionName].facts) {
        extension_settings[extensionName].facts = [];
    }
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
    renderFacts();
}

function renderFacts() {
    const listContainer = $("#fmt_facts_list");
    const facts = extension_settings[extensionName].facts;

    if (facts.length === 0) {
        listContainer.html('<small style="opacity:0.5;">Список пуст...</small>');
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    facts.forEach((fact, index) => {
        html += `
            <div class="fmt-fact-item" style="display: flex; justify-content: space-between; align-items: flex-start; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                <div class="fmt-fact-text" style="font-size: 0.9em; flex-grow: 1; margin-right: 10px; word-break: break-word;">${fact}</div>
                <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <i class="fa-solid fa-pen-to-square fmt-edit-btn" data-index="${index}" style="cursor: pointer; color: #4a9eff; font-size: 0.9em;" title="Редактировать"></i>
                    <i class="fa-solid fa-trash fmt-delete-btn" data-index="${index}" style="cursor: pointer; color: #ff5555; font-size: 0.9em;" title="Удалить"></i>
                </div>
            </div>`;
    });
    html += '</div>';
    listContainer.html(html);

    // Вешаем события на новые кнопки
    $(".fmt-delete-btn").on("click", function() {
        const index = $(this).data("index");
        deleteFact(index);
    });

    $(".fmt-edit-btn").on("click", function() {
        const index = $(this).data("index");
        editFact(index);
    });
}

function onAutoScanChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoScan = value;
    saveSettingsDebounced();
}

function clearFacts() {
    if (confirm("Вы уверены, что хотите удалить все найденные факты?")) {
        extension_settings[extensionName].facts = [];
        saveSettingsDebounced();
        renderFacts();
        toastr.info("Список очищен");
    }
}

async function runAutoScan() {
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
            console.log(`[${extensionName}] Авто-факт добавлен: ${newFact}`);
        }
    } catch (error) {
        console.error(`[${extensionName}] Ошибка авто-скана:`, error);
    }
}

async function handleChatEvent() {
    if (!extension_settings[extensionName].autoScan) return;

    const context = getContext();
    const chat = context.chat;

    if (chat && chat.length > 0 && chat.length % 4 === 0) {
        toastr.info("Авто-сканирование фактов...", "Facts Memory Tracker");
        await runAutoScan();
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", onAutoScanChange);
        $("#fmt_manual_scan").on("click", async () => {
            toastr.info("Анализирую...");
            await runAutoScan();
            toastr.success("Готово!");
        });
        $("#fmt_clear_facts").on("click", clearFacts);
       
        loadSettings();

        // Подписка на события чата
        eventSource.on(event_types.MESSAGE_RECEIVED, handleChatEvent);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleChatEvent);

        console.log(`[${extensionName}] ✅ Safe Automation Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
