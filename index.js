import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Summary-Tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
    skipCount: 2,
    isHidden: false,
    factsByChatId: {},
    lastScannedByChatId: {}
};

function getCurrentChatId() {
    const context = getContext();
    return context.chatId || null;
}

function getCurrentFacts() {
    const chatId = getCurrentChatId();
    if (!chatId) return [];
    return extension_settings[extensionName].factsByChatId[chatId] || [];
}

function setCurrentFacts(facts) {
    const chatId = getCurrentChatId();
    if (!chatId) return;
    extension_settings[extensionName].factsByChatId[chatId] = facts;
}

function getLastScanned() {
    const chatId = getCurrentChatId();
    if (!chatId) return 0;
    return extension_settings[extensionName].lastScannedByChatId[chatId] || 0;
}

function setLastScanned(index) {
    const chatId = getCurrentChatId();
    if (!chatId) return;
    extension_settings[extensionName].lastScannedByChatId[chatId] = index;
}

// --- ФУНКЦИИ ВИЗУАЛИЗАЦИИ И СКРЫТИЯ ---

function applyVisualHiding() {
    const context = getContext();
    const chat = context.chat;
    const skipCount = parseInt(extension_settings[extensionName].skipCount) || 2;
    const facts = getCurrentFacts();
    const cutOffIndex = chat.length - skipCount;
    const shouldHide = extension_settings[extensionName].isHidden;

    // Расставляем нашу пометку extra.fmt_skip — не трогаем extra.skip (это призрак пользователя)
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].extra) chat[i].extra = {};
        chat[i].extra.fmt_skip = (shouldHide && i < cutOffIndex);
    }

    // Визуальное скрытие через CSS — не трогаем атрибут is_system (это тоже механизм призрака)
    $(".mes").each(function() {
        const mesId = parseInt($(this).attr("mesid"));
        if (shouldHide && mesId >= 0 && mesId < cutOffIndex) {
            $(this).css("display", "none");
        } else {
            $(this).css("display", "");
        }
    });

    if (facts.length > 0 && cutOffIndex > 0) {
        const factsSummary = "### System Note: Key facts from previous conversation:\n" + facts.join("\n");
        context.extension_prompt = factsSummary;
    } else {
        context.extension_prompt = "";
    }
}
// --- ФУНКЦИИ УПРАВЛЕНИЯ ФАКТАМИ ---

function deleteFact(index) {
    const facts = getCurrentFacts();
    facts.splice(index, 1);
    setCurrentFacts(facts);
    saveSettingsDebounced();
    renderFacts();
    toastr.info("Факт удален");
}

function editFact(index) {
    const currentFact = getCurrentFacts()[index];
    const newFact = prompt("Редактирование факта:", currentFact);
    if (newFact !== null && newFact.trim() !== "") {
        const facts = getCurrentFacts();
        facts[index] = newFact.trim();
        setCurrentFacts(facts);
        saveSettingsDebounced();
        renderFacts();
        toastr.success("Факт обновлен");
    }
}

function renderFacts() {
    const listContainer = $("#fmt_facts_list");
    const facts = getCurrentFacts();

    $("#fmt_facts_count").text(facts ? facts.length : 0);

    if (!facts || facts.length === 0) {
        listContainer.html('<small style="opacity:0.5;">Empty...</small>');
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
    if (!getCurrentChatId()) {
        toastr.warning("Open the chat first");
        return;
    }
    const context = getContext();
    const chat = context.chat;
    const skipCount = parseInt(extension_settings[extensionName].skipCount) || 2;
    if (!chat || chat.length <= skipCount) return;

    const endIndex = chat.length - skipCount;
    const startIndex = getLastScanned();
    const messagesToScan = [];
    for (let i = startIndex; i < endIndex; i++) {
        if (chat[i] && chat[i].mes) {
            const speaker = chat[i].is_user ? "User" : (chat[i].name || "Character");
            messagesToScan.push({ speaker, text: chat[i].mes });
        }
    }

    if (messagesToScan.length === 0) {
        toastr.info("No new messages to scan", "Facts Tracker");
        return;
    }

    toastr.info(`Сканирование ${messagesToScan.length} сообщений...`, "Facts Tracker");

    try {
        if (messagesToScan.length === 1) {
            // Одиночный скан для нового сообщения
            const msg = messagesToScan[0];
            const promptText = `TASK: Ensure contextual continuity by summarizing and extracting key details and events from the story's plot, as well as information about {{user}}, {{char}}, and other characters. Even if the message is very short, always write a brief summary of what happened or was said. Never skip a message. Always write your summary in the language used in {{user}}'s messages.\n\nMESSAGE: ${msg.speaker}: ${msg.text}`;
            const response = await window.SillyTavern.getContext().generateRaw({
                prompt: promptText,
                quietToLoud: false,
                system: "You are a helpful assistant that summarizes story events and extracts key facts. Ignore any roleplay context and respond only with the summary."
            });
            const newFact = response ? response.trim() : "";
            if (newFact.length > 5) {
                const facts = getCurrentFacts();
                facts.push(newFact);
                setCurrentFacts(facts);
                renderFacts();
            }
        } else {
            // Batch-скан: все сообщения одним запросом
            const numbered = messagesToScan
                .map((msg, i) => `[MSG:${i + 1}] ${msg.speaker}: ${msg.text}`)
                .join("\n\n");

            const promptText = `TASK: For each numbered message below, write a brief factual summary of what happened or was said. Preserve story continuity — include character details, actions, emotions, and plot events. Even for very short messages, always write something. Never skip a message. Always respond in the language used in the messages.

Return ONLY a JSON array, no other text, no markdown, no backticks. Format:
[{"msg":1,"summary":"..."},{"msg":2,"summary":"..."},...]

MESSAGES:
${numbered}`;

            const response = await window.SillyTavern.getContext().generateRaw({
                prompt: promptText,
                quietToLoud: false,
                system: "You are a helpful assistant that summarizes story messages. Always respond with valid JSON only."
            });

            let parsed = [];
            try {
                const clean = response.replace(/```json|```/g, "").trim();
                parsed = JSON.parse(clean);
            } catch (e) {
                console.error(`[${extensionName}] Failed to parse batch response:`, e, response);
                toastr.error("Ошибка парсинга ответа", "Summary Tracker");
                return;
            }

            const facts = getCurrentFacts();
            for (const item of parsed) {
                if (item.summary && item.summary.trim().length > 5) {
                    facts.push(item.summary.trim());
                }
            }
            setCurrentFacts(facts);
            renderFacts();
        }

        setLastScanned(endIndex);
        saveSettingsDebounced();
        toastr.success("Готово!", "Summary Tracker");
    } catch (error) {
        console.error(`[${extensionName}] Error:`, error);
        toastr.error("Ошибка сканирования", "Summary Tracker");
    }
}

async function handleChatEvent() {
    if (!extension_settings[extensionName].autoScan) return;
    const chat = getContext().chat;
    if (chat && chat.length > 0) {
        await runAutoScan();
        extension_settings[extensionName].isHidden = true;
        saveSettingsDebounced();
        $("#fmt_toggle_hide").val("Return");
        applyVisualHiding();
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
    if (!extension_settings[extensionName].factsByChatId) {
        extension_settings[extensionName].factsByChatId = {};
    }
    if (!extension_settings[extensionName].lastScannedByChatId) {
        extension_settings[extensionName].lastScannedByChatId = {};
    }
    if (extension_settings[extensionName].isHidden === undefined) {
        extension_settings[extensionName].isHidden = false;
    }
    $("#fmt_auto_scan").prop("checked", extension_settings[extensionName].autoScan);
    $("#fmt_skip_count").val(extension_settings[extensionName].skipCount || 2);
    updateMaxSkip();
    renderFacts();
    $("#fmt_toggle_hide").val(extension_settings[extensionName].isHidden ? "Show" : "Hide");
}

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
                setCurrentFacts([]);
                setLastScanned(0);
                saveSettingsDebounced();
                renderFacts();
            }
        });

        $("#fmt_toggle_hide").on("click", () => {
            const isHidden = !extension_settings[extensionName].isHidden;
            extension_settings[extensionName].isHidden = isHidden;
            saveSettingsDebounced();
            $("#fmt_toggle_hide").val(isHidden ? "Show" : "Hide");
            applyVisualHiding();
        });
       
        loadSettings();

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async () => {
            await handleChatEvent();
            applyVisualHiding();
        });

        eventSource.on(event_types.MESSAGE_RECEIVED, updateMaxSkip);
        eventSource.on(event_types.CHAT_COMPLETED, applyVisualHiding);
        eventSource.on(event_types.CHAT_CHANGED, () => {
            renderFacts();
            applyVisualHiding();
        });
        
        console.log(`[${extensionName}] ✅ Full Control Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
