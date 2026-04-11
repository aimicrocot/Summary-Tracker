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
    
    let html = '<ul style="padding-left: 20px; margin: 0;">';
    facts.forEach((fact) => {
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
