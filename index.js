import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Facts-Memory-Tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
    skipCount: 2,
    facts: [] 
};

// --- ФУНКЦИИ ВИЗУАЛИЗАЦИИ И СКРЫТИЯ ---

function applyVisualHiding() {
    const chat = getContext().chat;
    const skipCount = parseInt(extension_settings[extensionName].skipCount) || 2;
    const facts = extension_settings[extensionName].facts;
    const cutOffIndex = chat.length - skipCount;

    // 1. Скрываем старые сообщения в DOM
    $(".mes").each(function() {
        const mesId = parseInt($(this).attr("mesid"));
        if (mesId >= 0 && mesId < cutOffIndex) {
            $(this).addClass("fmt-hidden-message");
        } else {
            $(this).removeClass("fmt-hidden-message");
        }
    });

    // 2. Управляем блоком саммари в начале чата
    $("#fmt_summary_in_chat").remove();
    if (facts.length > 0 && cutOffIndex > 0) {
        const summaryHtml = `
            <div id="fmt_summary_in_chat" class="fmt-chat-summary-block">
                <div class="fmt-summary-header">
                    <span><i class="fa-solid fa-brain"></i> MEMORY TRACKER SUMMARY</span>
                    <span>${facts.length} facts preserved</span>
                </div>
                <div class="fmt-summary-content">${facts.join(" ")}</div>
                <div style="text-align: center; margin-top: 10px; font-size: 0.75em; opacity: 0.5;">(Нажми, чтобы временно развернуть историю)</div>
            </div>`;
        $("#chat").prepend(summaryHtml);
        
        $("#fmt_summary_in_chat").on("click", function() {
            $(".fmt-hidden-message").removeClass("fmt-hidden-message");
            $(this).fadeOut();
        });
    }
}

// --- ФУНКЦИИ УПРАВЛЕНИЯ ФАКТАМИ ---

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
        applyVisualHiding(); 
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    facts.forEach((fact, index) => {
        html += `
            <div class="fmt-fact-item" style="display: flex; justify-content: space-between; align-items: flex-start; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                <div class="fmt-fact-text" style="font-size: 0.9em; flex-grow: 1; margin-right: 10px; word-break: break-word; color: #e0e0e0;">${fact}</div>
                <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <i class="fa-solid fa-pen-to-square fmt-edit-btn" data-index="${index}" style="cursor: pointer; color: #4a9eff; font-size: 0.9em;" title="Редактировать"></i>
                    <i class="fa-solid fa-trash fmt-delete-btn" data-index="${index}" style="cursor: pointer; color: #ff5555; font-size: 0.9em;" title="Удалить"></i>
                </div>
            </div>`;
    });
    html += '</div>';
    listContainer.html(html);

    $(".fmt-delete-btn").off("click").on("click", function() { deleteFact($(this).data("index")); });
    $(".fmt-edit-btn").off("click").on("click", function() { editFact($(this).data("index")); });

    applyVisualHiding();
}

// --- ЛОГИКА СКАНИРОВАНИЯ ---

async function runAutoScan() {
    const context = getContext();
    const chat = context.chat;
    const skipCount = parseInt(extension_settings[extensionName].skipCount) || 2;
    if (!chat || chat.length <= skipCount) return;

    const endIndex = chat.length - skipCount;
    const messagesToScan = [];
    for (let i = 0; i < endIndex; i++) {
        if (chat[i] && chat[i].mes) {
            const speaker = chat[i].is_user ? "User" : (chat[i].name || "Character");
            messagesToScan.push({ speaker, text: chat[i].mes });
        }
    }

    if (messagesToScan.length === 0) return;
    toastr.info(`Сканирование ${messagesToScan.length} сообщений...`, "Facts Tracker");

    try {
        for (const msg of messagesToScan) {
            const promptText = `TASK: Extract facts about User/Character. Concise paragraph. If none, reply "No new facts".\n\nMESSAGE: ${msg.speaker}: ${msg.text}`;
            const response = await window.SillyTavern.getContext().generateRaw({ prompt: promptText });
            const newFact = response ? response.trim() : "No new facts";

            if (newFact.length > 5 && !newFact.toLowerCase().includes("no new facts")) {
                extension_settings[extensionName].facts.push(newFact);
                renderFacts();
            }
        }
        saveSettingsDebounced();
        toastr.success("Готово!", "Facts Tracker");
    } catch (error) {
        console.error(`[${extensionName}] Error:`, error);
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

function updateMaxSkip() {
    const chatLength = getContext().chat?.length || 0;
    $("#fmt_skip_count").attr("max", chatLength);
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
    $("#fmt_skip_count").val(extension_settings[extensionName].skipCount || 2);
    updateMaxSkip();
    renderFacts();
}

// Хук подмены контекста для ИИ (невидимый для юзера)
eventSource.on(event_types.GENERATE_BEFORE_COMMANDS, async () => {
    const context = getContext();
    const skipCount = parseInt(extension_settings[extensionName].skipCount) || 2;
    const facts = extension_settings[extensionName].facts;

    if (facts.length > 0 && context.chat.length > skipCount) {
        const cutOffIndex = context.chat.length - skipCount;
        const factsSummary = "System Note: Key facts from previous conversation:\n" + facts.join("\n");
        const summaryMessage = { is_user: false, is_system: true, mes: factsSummary };
        const recentMessages = context.chat.slice(cutOffIndex);
        context.chat = [summaryMessage, ...recentMessages];
    }
});

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", (e) => {
            extension_settings[extensionName].autoScan = Boolean($(e.target).prop("checked"));
            saveSettingsDebounced();
        });

        $("#fmt_skip_count").on("input", (e) => {
            let val = parseInt($(e.target).val()) || 2;
            extension_settings[extensionName].skipCount = val;
            saveSettingsDebounced();
            applyVisualHiding();
        });

        $("#fmt_manual_scan").on("click", runAutoScan);
        $("#fmt_clear_facts").on("click", () => {
            if (confirm("Очистить всё?")) {
                extension_settings[extensionName].facts = [];
                saveSettingsDebounced();
                renderFacts();
            }
        });
       
        loadSettings();
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (async () => {
            await handleChatEvent();
            applyVisualHiding();
        }));
        eventSource.on(event_types.MESSAGE_RECEIVED, updateMaxSkip);
        eventSource.on(event_types.CHAT_COMPLETED, applyVisualHiding);
        
        console.log(`[${extensionName}] ✅ Full Control Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
