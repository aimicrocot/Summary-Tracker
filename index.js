import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "facts-memory-tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
    facts: [] 
};

// --- ФУНКЦИИ УПРАВЛЕНИЯ (объявлены в начале для доступности) ---

function deleteFact(index) {
    extension_settings[extensionName].facts.splice(index, 1);
    saveSettingsDebounced();
    renderFacts();
    toastr.info("Факт удален");
}

function editFact(index) {
    const currentFact = extension_settings[extensionName].facts[index];
    const newFact = prompt("Редактирование факта:", currentFact);
    
    if (newFact !== null && newFact.trim() !== "") {
        extension_settings[extensionName].facts[index] = newFact.trim();
        saveSettingsDebounced();
        renderFacts();
        toastr.success("Факт обновлен");
    }
}

function renderFacts() {
    const listContainer = $("#fmt_facts_list");
    const facts = extension_settings[extensionName].facts;

    if (!facts || facts.length === 0) {
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

    // Привязываем события заново при каждой отрисовке
    $(".fmt-delete-btn").off("click").on("click", function() {
        deleteFact($(this).data("index"));
    });

    $(".fmt-edit-btn").off("click").on("click", function() {
        editFact($(this).data("index"));
    });
}

// --- ЛОГИКА СКАНИРОВАНИЯ ---

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
            // Минимальная проверка на мусор
            if (newFact.length > 5 && !newFact.includes("does not contain")) {
                extension_settings[extensionName].facts.push(newFact);
                saveSettingsDebounced();
                renderFacts();
            }
        }
    } catch (error) {
        console.error(`[${extensionName}] Ошибка:`, error);
    }
}

async function handleChatEvent() {
    if (!extension_settings[extensionName].autoScan) return;
    const chat = getContext().chat;
    if (chat && chat.length > 0 && chat.length % 4 === 0) {
        await runAutoScan();
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
    renderFacts();
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", (e) => {
            extension_settings[extensionName].autoScan = Boolean($(e.target).prop("checked"));
            saveSettingsDebounced();
        });

        $("#fmt_manual_scan").on("click", async () => {
            toastr.info("Сканирую...");
            await runAutoScan();
            toastr.success("Готово!");
        });

        $("#fmt_clear_facts").on("click", () => {
            if (confirm("Очистить всё?")) {
                extension_settings[extensionName].facts = [];
                saveSettingsDebounced();
                renderFacts();
            }
        });
       
        loadSettings();
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleChatEvent);
        
        console.log(`[${extensionName}] ✅ Full Control Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
