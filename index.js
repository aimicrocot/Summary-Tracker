import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Summary-Tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
    skipCount: 2,
    scanInterval: 1,
    isHidden: false,
    factsByChatId: {},
    lastScannedByChatId: {},
    compressAfter: 20,
    layerSummaryByChatId: {},
    useCustomProvider: false,
    customApiUrl: "",
    customApiKey: "",
    customApiModel: ""
};

let hiddenMessagesBuffer = []; // { index, message } для точного возврата
let hiddenBufferChatId = null; // чат, которому принадлежит буфер — индексы не переносимы между чатами
let isScanning = false; // флаг активного скана через generateRaw
let restoreSafetyTimer = null; // отложенная страховка возврата на случай упавшей генерации

// --- ХЕЛПЕРЫ ---

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getSkipCount() {
    const raw = parseInt(extension_settings[extensionName].skipCount);
    return Number.isFinite(raw) && raw >= 2 ? raw : 2;
}

function getScanInterval() {
    const raw = parseInt(extension_settings[extensionName].scanInterval);
    return Number.isFinite(raw) && raw >= 1 ? raw : 1;
}

function getCompressAfter() {
    const raw = parseInt(extension_settings[extensionName].compressAfter);
    return Number.isFinite(raw) && raw >= 2 ? raw : 20;
}

function getChatArray() {
    const chat = getContext()?.chat;
    return Array.isArray(chat) ? chat : null;
}

function updateHideButton() {
    const hasMemory = buildFullContext().length > 0;
    const isHidden = extension_settings[extensionName].isHidden;
    if (!hasMemory) {
        $("#fmt_toggle_hide").val("No facts").prop("disabled", true);
    } else {
        $("#fmt_toggle_hide").val(isHidden ? "Show" : "Hide").prop("disabled", false);
    }
}

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

async function callSummarizerLLM(promptText, systemPrompt) {
    const useCustom = extension_settings[extensionName].useCustomProvider;
    if (!useCustom) {
        // Параметр называется systemPrompt — ключ `system` ядро молча игнорирует.
        return await window.SillyTavern.getContext().generateRaw({
            prompt: promptText,
            quietToLoud: false,
            systemPrompt: systemPrompt
        });
    }
    return await sendCustomProviderRequest(promptText, systemPrompt);
}

async function sendCustomProviderRequest(userPrompt, systemPrompt) {
    const apiUrl = extension_settings[extensionName].customApiUrl;
    const apiKey = extension_settings[extensionName].customApiKey;
    const model = extension_settings[extensionName].customApiModel;

    if (!apiUrl || !model) {
        throw new Error("Custom provider URL or model not configured");
    }

    let endpoint = apiUrl.replace(/\/+$/, "");
    if (!endpoint.endsWith("/chat/completions")) {
        endpoint = /\/v\d+([a-z]*)?$/.test(endpoint) || endpoint.endsWith("/openai")
            ? endpoint + "/chat/completions"
            : endpoint + "/v1/chat/completions";
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`Custom provider request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Custom provider returned empty response");
    return content;
}

async function testCustomProviderConnection() {
    try {
        const result = await sendCustomProviderRequest(
            "Respond with exactly: CONNECTION_OK",
            "You are a test assistant."
        );
        toastr.success(`Соединение работает! Ответ: "${result.substring(0, 80)}"`, "Summary Tracker");
    } catch (error) {
        toastr.error(`Ошибка соединения: ${error.message}`, "Summary Tracker");
    }
}

function getLayerSummary() {
    const chatId = getCurrentChatId();
    if (!chatId) return "";
    return extension_settings[extensionName].layerSummaryByChatId[chatId] || "";
}

function setLayerSummary(text) {
    const chatId = getCurrentChatId();
    if (!chatId) return;
    extension_settings[extensionName].layerSummaryByChatId[chatId] = text;
}

async function maybeCompressFacts() {
    const compressAfter = getCompressAfter();
    const facts = getCurrentFacts();
    if (facts.length < compressAfter) return;

    const existingLayer = getLayerSummary();
    const promptText = `TASK: Compress the following list of facts into a single concise paragraph that preserves all key story details for context continuity. Do not use markdown, headers, or lists — output plain text only, one paragraph. Write in the same language as the input.\n\nEXISTING COMPRESSED SUMMARY (merge with this, do not repeat, keep or update as needed):\n${existingLayer || "(none yet)"}\n\nNEW FACTS TO COMPRESS:\n${facts.join("\n")}`;

    toastr.info(`Сжатие ${facts.length} фактов в единый саммари...`, "Summary Tracker");

    try {
        const response = await callSummarizerLLM(
            promptText,
            "You are a helpful assistant. Compress the facts into a single concise paragraph. Output only plain text, no markdown, no lists, no headers."
        );

        const compressed = typeof response === "string" ? response.trim() : "";
        if (compressed.length > 10) {
            setLayerSummary(compressed);
            setCurrentFacts([]);
            saveSettingsDebounced();
            toastr.success("Саммари сжат!", "Summary Tracker");
        } else {
            // Пустой ответ не должен уничтожать накопленные факты.
            console.warn(`[${extensionName}] Compression returned too short a result, facts kept`);
        }
    } catch (error) {
        console.error(`[${extensionName}] Compression error:`, error);
        toastr.error("Ошибка сжатия", "Summary Tracker");
    }
}

function buildFullContext() {
    const layerSummary = getLayerSummary();
    const facts = getCurrentFacts();
    const parts = [];
    if (layerSummary) parts.push(layerSummary);
    if (facts && facts.length > 0) parts.push(facts.join(" "));
    return parts.join(" ");
}

// --- ФУНКЦИИ ВИЗУАЛИЗАЦИИ И СКРЫТИЯ ---

function applyVisualHiding() {
    const context = getContext();
    const chat = getChatArray();
    if (!chat) {
        context.setExtensionPrompt(extensionName, "", 1, 9999, false, 0);
        return;
    }

    const skipCount = getSkipCount();
    const cutOffIndex = chat.length - skipCount;
    const fullContext = buildFullContext();
    // Резать сообщения из контекста можно только когда есть чем их заменить,
    // иначе получается чистая потеря контекста.
    const active = extension_settings[extensionName].isHidden && fullContext.length > 0;

    // Расставляем нашу пометку extra.fmt_skip — не трогаем extra.skip (это призрак пользователя)
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].extra) chat[i].extra = {};
        chat[i].extra.fmt_skip = (active && i < cutOffIndex);
    }

    // Визуальное скрытие через CSS — не трогаем атрибут is_system (это тоже механизм призрака)
    $(".mes").each(function() {
        const mesId = parseInt($(this).attr("mesid"));
        if (active && mesId >= 0 && mesId < cutOffIndex) {
            $(this).addClass("fmt-hidden");
        } else {
            $(this).removeClass("fmt-hidden");
        }
    });

    if (active && cutOffIndex > 0) {
        context.setExtensionPrompt(extensionName, fullContext, 1, 9999, false, 0);
    } else {
        context.setExtensionPrompt(extensionName, "", 1, 9999, false, 0);
    }
}

// --- ВЫРЕЗАНИЕ И ВОЗВРАТ СООБЩЕНИЙ ---

function stripHiddenMessages() {
    const chat = getChatArray();
    if (!chat) return 0;

    const toRemove = [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].extra && chat[i].extra.fmt_skip === true) {
            toRemove.push(i);
        }
    }
    if (toRemove.length === 0) return 0;

    hiddenMessagesBuffer = toRemove.map(i => ({ index: i, message: chat[i] }));
    hiddenBufferChatId = getCurrentChatId();
    for (const i of toRemove) {
        chat.splice(i, 1);
    }
    return hiddenMessagesBuffer.length;
}

function restoreHiddenMessages(reason) {
    if (hiddenMessagesBuffer.length === 0) return 0;

    const chat = getChatArray();
    // Индексы буфера действительны только для того чата, из которого он собран.
    if (!chat || hiddenBufferChatId !== getCurrentChatId()) {
        console.warn(`[${extensionName}] Buffer dropped, chat changed (${reason})`);
        hiddenMessagesBuffer = [];
        hiddenBufferChatId = null;
        return 0;
    }

    const count = hiddenMessagesBuffer.length;
    // Буфер отсортирован по убыванию индекса — вставляем с конца, от меньшего индекса к большему.
    for (let j = hiddenMessagesBuffer.length - 1; j >= 0; j--) {
        const { index, message } = hiddenMessagesBuffer[j];
        chat.splice(index, 0, message);
    }
    hiddenMessagesBuffer = [];
    hiddenBufferChatId = null;
    console.log(`[${extensionName}] Restored ${count} messages (${reason})`);
    return count;
}

// --- ФУНКЦИИ УПРАВЛЕНИЯ ФАКТАМИ ---

function deleteFact(index) {
    const facts = getCurrentFacts();
    facts.splice(index, 1);
    setCurrentFacts(facts);
    if (buildFullContext().length === 0) {
        extension_settings[extensionName].isHidden = false;
    }
    saveSettingsDebounced();
    renderFacts();
    toastr.info("Факт удален", "Summary Tracker");
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
        toastr.success("Факт обновлен", "Summary Tracker");
    }
}

function renderFacts() {
    const listContainer = $("#fmt_facts_list");
    const facts = getCurrentFacts();

    $("#fmt_facts_count").text(facts ? facts.length : 0);

    // Блок списка фактов в example.html может быть закомментирован — тогда рендер пропускаем.
    if (listContainer.length === 0) {
        applyVisualHiding();
        updateHideButton();
        renderSummary();
        return;
    }

    if (!facts || facts.length === 0) {
        listContainer.html('<small style="opacity:0.5;">Empty...</small>');
        applyVisualHiding();
        updateHideButton();
        renderSummary();
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    facts.forEach((fact, index) => {
        html += `
            <div class="fmt-fact-item" style="display: flex; justify-content: space-between; align-items: flex-start; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                <div class="fmt-fact-text" style="font-size: 0.9em; flex-grow: 1; margin-right: 10px; word-break: break-word; color: #e0e0e0;">${escapeHtml(fact)}</div>
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
    updateHideButton();
    renderSummary();
}

function renderSummary() {
    const container = $("#fmt_summary_combined");
    const combinedText = buildFullContext();

    if (!combinedText) {
        container.html('<small style="opacity:0.5;">Empty...</small>');
        return;
    }
    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
            <div id="fmt_summary_text" style="font-size: 0.9em; flex-grow: 1; margin-right: 10px; word-break: break-word; color: #e0e0e0;">${escapeHtml(combinedText)}</div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
                <i class="fa-solid fa-pen-to-square" id="fmt_summary_edit_btn" style="cursor: pointer; color: #4a9eff; font-size: 0.9em;" title="Редактировать"></i>
                <i class="fa-solid fa-trash" id="fmt_summary_delete_btn" style="cursor: pointer; color: #ff5555; font-size: 0.9em;" title="Удалить"></i>
            </div>
        </div>`;
    container.html(html);

    $("#fmt_summary_delete_btn").off("click").on("click", function() {
        if (confirm("Delete summary?")) {
            setCurrentFacts([]);
            setLayerSummary("");
            extension_settings[extensionName].isHidden = false;
            saveSettingsDebounced();
            renderFacts();
            toastr.info("Summary deleted", "Summary Tracker");
        }
    });

    $("#fmt_summary_edit_btn").off("click").on("click", function() {
        const current = buildFullContext();
        const edited = prompt("Edit summary:", current);
        if (edited !== null && edited.trim() !== "") {
            setLayerSummary(edited.trim());
            setCurrentFacts([]);
            saveSettingsDebounced();
            renderFacts();
            toastr.success("Summary updated", "Summary Tracker");
        }
    });
}

// --- ЛОГИКА СКАНИРОВАНИЯ ---

async function runAutoScan() {
    if (isScanning) return;
    if (!getCurrentChatId()) {
        toastr.warning("Open the chat first", "Summary Tracker");
        return;
    }

    const chat = getChatArray();
    const skipCount = getSkipCount();
    if (!chat || chat.length <= skipCount) return;

    const endIndex = chat.length - skipCount;
    // Сообщения могли быть удалены/свайпнуты — курсор может оказаться за пределами чата.
    const startIndex = Math.max(0, Math.min(getLastScanned(), endIndex));

    const messagesToScan = [];
    for (let i = startIndex; i < endIndex; i++) {
        if (chat[i] && chat[i].mes) {
            const speaker = chat[i].is_user ? "User" : (chat[i].name || "Character");
            messagesToScan.push({ speaker, text: chat[i].mes });
        }
    }

    if (messagesToScan.length === 0) {
        toastr.info("No new messages to scan", "Summary Tracker");
        setLastScanned(endIndex); // нормализуем курсор, если он убежал за пределы чата
        saveSettingsDebounced();
        return;
    }

    isScanning = true;
    toastr.info(`Сканирование ${messagesToScan.length} сообщений...`, "Summary Tracker");

    try {
        if (messagesToScan.length === 1) {
            // Одиночный скан для нового сообщения
            const msg = messagesToScan[0];
            const promptText = `TASK: Ensure contextual continuity by summarizing and extracting key details and events from the story's plot, as well as information about {{user}}, {{char}}, and other characters. Even if the message is very short, always write a brief summary of what happened or was said. Never skip a message. Always write your summary in the language used in {{user}}'s messages.\n\nMESSAGE: ${msg.speaker}: ${msg.text}`;
            const response = await callSummarizerLLM(
                promptText,
                "You are a helpful assistant that summarizes story events and extracts key facts. Ignore any roleplay context and respond only with the summary."
            );
            const newFact = typeof response === "string" ? response.trim() : "";
            if (newFact.length > 5) {
                const facts = getCurrentFacts();
                facts.push(newFact);
                setCurrentFacts(facts);
                await maybeCompressFacts();
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

            const response = await callSummarizerLLM(
                promptText,
                "You are a helpful assistant that summarizes story messages. Always respond with valid JSON only."
            );

            const parsed = parseBatchResponse(response);
            if (parsed === null) {
                toastr.error("Ошибка парсинга ответа", "Summary Tracker");
                return;
            }

            const facts = getCurrentFacts();
            for (const item of parsed) {
                const summary = item && typeof item.summary === "string" ? item.summary.trim() : "";
                if (summary.length > 5) {
                    facts.push(summary);
                }
            }
            setCurrentFacts(facts);
            await maybeCompressFacts();
            renderFacts();
        }

        setLastScanned(endIndex);
        saveSettingsDebounced();
        toastr.success("Готово!", "Summary Tracker");
    } catch (error) {
        console.error(`[${extensionName}] Error:`, error);
        toastr.error("Ошибка сканирования", "Summary Tracker");
    } finally {
        isScanning = false;
    }
}

/**
 * Возвращает массив элементов саммари или null, если ответ разобрать не удалось.
 */
function parseBatchResponse(response) {
    if (typeof response !== "string" || response.trim() === "") {
        console.error(`[${extensionName}] Batch response is empty or not a string:`, response);
        return null;
    }

    let clean = response.replace(/```json|```/g, "").trim();
    // Модель часто добавляет текст до/после массива — вырезаем сам массив.
    const first = clean.indexOf("[");
    const last = clean.lastIndexOf("]");
    if (first !== -1 && last > first) {
        clean = clean.slice(first, last + 1);
    }

    let parsed;
    try {
        parsed = JSON.parse(clean);
    } catch (e) {
        console.error(`[${extensionName}] Failed to parse batch response:`, e, response);
        return null;
    }

    if (Array.isArray(parsed)) return parsed;
    // Иногда приходит одиночный объект вместо массива.
    if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") return [parsed];

    console.error(`[${extensionName}] Batch response is not an array:`, parsed);
    return null;
}

async function handleChatEvent() {
    if (!extension_settings[extensionName].autoScan) return;
    const chat = getChatArray();
    if (!chat || chat.length === 0) return;
    const scanInterval = getScanInterval();
    const skipCount = getSkipCount();
    const endIndex = chat.length - skipCount;
    if (endIndex <= 0) return;
    const lastScanned = Math.max(0, Math.min(getLastScanned(), endIndex));
    if ((endIndex - lastScanned) >= scanInterval) {
        await runAutoScan();
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function updateMaxSkip() {
    const chatLength = getChatArray()?.length || 0;
    $("#fmt_skip_count").attr("max", chatLength);
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings = extension_settings[extensionName];

    // Поключевое слияние: старые установки расширения не пересоздаются с нуля,
    // но получают недостающие поля новых версий.
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = (value && typeof value === "object") ? structuredClone(value) : value;
        }
    }

    $("#fmt_auto_scan").prop("checked", settings.autoScan);
    $("#fmt_skip_count").val(getSkipCount());
    $("#fmt_scan_interval").val(getScanInterval());
    $("#fmt_compress_after").val(getCompressAfter());
    $("#fmt_use_custom_provider").prop("checked", settings.useCustomProvider);
    $("#fmt_custom_api_url").val(settings.customApiUrl);
    $("#fmt_custom_api_key").val(settings.customApiKey);
    $("#fmt_custom_api_model").val(settings.customApiModel);
    $("#fmt_custom_provider_panel").css("display", settings.useCustomProvider ? "block" : "none");

    const autoEnabled = settings.autoScan;
    $("#fmt_scan_interval").prop("disabled", !autoEnabled);
    $("#fmt_scan_interval_row").css("display", autoEnabled ? "flex" : "none");

    if (buildFullContext().length === 0) {
        settings.isHidden = false;
    }

    updateMaxSkip();
    renderFacts();
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        $("#fmt_auto_scan").on("input", (e) => {
            const checked = Boolean($(e.target).prop("checked"));
            extension_settings[extensionName].autoScan = checked;
            saveSettingsDebounced();
            $("#fmt_scan_interval").prop("disabled", !checked);
            $("#fmt_scan_interval_row").css("display", checked ? "flex" : "none");
        });

        $("#fmt_skip_count").on("input", (e) => {
            const raw = parseInt($(e.target).val());
            extension_settings[extensionName].skipCount = Number.isFinite(raw) && raw >= 2 ? raw : 2;
            saveSettingsDebounced();
            applyVisualHiding();
        });

        $("#fmt_scan_interval").on("input", (e) => {
            const raw = parseInt($(e.target).val());
            extension_settings[extensionName].scanInterval = Number.isFinite(raw) && raw >= 1 ? raw : 1;
            saveSettingsDebounced();
        });

        $("#fmt_compress_after").on("input", (e) => {
            const raw = parseInt($(e.target).val());
            extension_settings[extensionName].compressAfter = Number.isFinite(raw) && raw >= 2 ? raw : 20;
            saveSettingsDebounced();
        });

        $("#fmt_use_custom_provider").on("input", (e) => {
            const checked = Boolean($(e.target).prop("checked"));
            extension_settings[extensionName].useCustomProvider = checked;
            saveSettingsDebounced();
            $("#fmt_custom_provider_panel").css("display", checked ? "block" : "none");
        });

        $("#fmt_custom_api_url").on("input", (e) => {
            extension_settings[extensionName].customApiUrl = $(e.target).val().trim();
            saveSettingsDebounced();
        });

        $("#fmt_custom_api_key").on("input", (e) => {
            extension_settings[extensionName].customApiKey = $(e.target).val().trim();
            saveSettingsDebounced();
        });

        $("#fmt_custom_api_model").on("input", (e) => {
            extension_settings[extensionName].customApiModel = $(e.target).val().trim();
            saveSettingsDebounced();
        });

        $("#fmt_test_custom_provider").on("click", testCustomProviderConnection);

        $("#fmt_manual_scan").on("click", runAutoScan);

        $("#fmt_clear_facts").on("click", () => {
            if (confirm("Очистить всё?")) {
                setCurrentFacts([]);
                setLayerSummary("");
                setLastScanned(0);
                extension_settings[extensionName].isHidden = false;
                saveSettingsDebounced();
                renderFacts();
            }
        });

        $("#fmt_toggle_hide").on("click", () => {
            if (buildFullContext().length === 0) return;
            extension_settings[extensionName].isHidden = !extension_settings[extensionName].isHidden;
            saveSettingsDebounced();
            applyVisualHiding();
            updateHideButton();
        });

        loadSettings();

        eventSource.on(event_types.GENERATION_STARTED, (data, _extraData, isDryRun) => {
            clearTimeout(restoreSafetyTimer);
            if (isScanning) return;
            if (isDryRun) return;
            if (hiddenMessagesBuffer.length > 0) return;
            stripHiddenMessages();
        });

        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
            clearTimeout(restoreSafetyTimer);
            const bufferLength = restoreHiddenMessages("message rendered");

            if (bufferLength > 0) {
                // ST пронумеровал новое сообщение по укороченному чату — чиним дубли mesid.
                const mesidSeen = new Set();
                $('.mes').each(function() {
                    const mesidAttr = $(this).attr('mesid');
                    if (mesidAttr === undefined || mesidAttr === '') return;
                    const mesid = parseInt(mesidAttr);
                    if (mesidSeen.has(mesid)) {
                        $(this).attr('mesid', mesid + bufferLength);
                    } else {
                        mesidSeen.add(mesid);
                    }
                });
            }

            applyVisualHiding();
            // Не блокируем пайплайн ST: он ждёт этот обработчик перед сохранением чата.
            handleChatEvent().catch(err => console.error(`[${extensionName}] Auto-scan failed:`, err));
        });

        eventSource.on(event_types.GENERATION_STOPPED, () => {
            clearTimeout(restoreSafetyTimer);
            if (restoreHiddenMessages("generation stopped") > 0) {
                applyVisualHiding();
            }
        });

        // Страховка на случай упавшей генерации, когда ни одно сообщение не отрендерилось
        // и вырезанные сообщения иначе пропали бы навсегда.
        // Восстанавливаем НЕ сразу: в стриминге GENERATION_ENDED приходит раньше
        // CHARACTER_MESSAGE_RENDERED (script.js:3736 → 3741), а тому обработчику нужен
        // непустой буфер, чтобы починить дублирующиеся mesid.
        eventSource.on(event_types.GENERATION_ENDED, () => {
            clearTimeout(restoreSafetyTimer);
            restoreSafetyTimer = setTimeout(() => {
                if (hiddenMessagesBuffer.length === 0) return;
                console.warn(`[${extensionName}] Safety net triggered — generation ended without rendering`);
                if (restoreHiddenMessages("safety net") > 0) {
                    applyVisualHiding();
                }
            }, 2000);
        });

        eventSource.on(event_types.MESSAGE_RECEIVED, updateMaxSkip);

        eventSource.on(event_types.CHAT_CHANGED, () => {
            // Индексы буфера принадлежат старому чату — переносить их нельзя.
            clearTimeout(restoreSafetyTimer);
            hiddenMessagesBuffer = [];
            hiddenBufferChatId = null;
            if (buildFullContext().length === 0) {
                extension_settings[extensionName].isHidden = false;
            }
            updateMaxSkip();
            renderFacts();
        });

        // Отладочный API для проверки сценариев из консоли DevTools.
        window.SummaryTracker = {
            version: "1.1.0",
            get settings() { return extension_settings[extensionName]; },
            get isScanning() { return isScanning; },
            getHiddenBuffer: () => hiddenMessagesBuffer,
            getHiddenBufferChatId: () => hiddenBufferChatId,
            hasSafetyTimer: () => restoreSafetyTimer !== null,
            getCurrentChatId, getCurrentFacts, setCurrentFacts,
            getLastScanned, setLastScanned,
            getLayerSummary, setLayerSummary, buildFullContext,
            getSkipCount, getScanInterval, getCompressAfter,
            escapeHtml, parseBatchResponse,
            stripHiddenMessages, restoreHiddenMessages,
            applyVisualHiding, renderFacts, renderSummary, updateHideButton, loadSettings,
            runAutoScan, maybeCompressFacts, handleChatEvent,
            callSummarizerLLM, sendCustomProviderRequest, testCustomProviderConnection
        };

        console.log(`[${extensionName}] ✅ Loaded (v1.1.0). Debug API: window.SummaryTracker`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
