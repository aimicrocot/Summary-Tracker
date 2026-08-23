import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Summary-Tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionVersion = "1.2.0";

const defaultSettings = {
    autoScan: false,
    autoHide: false,
    skipCount: 2,
    scanInterval: 1,
    isHiddenByChatId: {},
    factsByChatId: {},
    lastScannedByChatId: {},
    compressAfter: 20,
    layerSummaryByChatId: {},
    useCustomProvider: false,
    customApiUrl: "",
    customApiKey: "",
    customApiModel: ""
};

let isScanning = false; // одновременно допускаем только один запрос к суммаризатору
let pendingLegacyHidden = null; // глобальный isHidden из старых версий ждёт открытия чата

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

function getCurrentChatId() {
    return getContext()?.chatId || null;
}

// --- ХРАНИЛИЩЕ (всё на чат: индексы и память одного чата не имеют смысла в другом) ---
// Геттеры и сеттеры принимают chatId явно, потому что скан асинхронный: пока идёт
// запрос к модели, пользователь может уйти в другой чат, и «текущий» чат уже не тот,
// для которого сканирование начиналось.

function getIsHidden(chatId) {
    if (!chatId) return false;
    return extension_settings[extensionName].isHiddenByChatId[chatId] === true;
}

function setIsHidden(chatId, value) {
    if (!chatId) return;
    extension_settings[extensionName].isHiddenByChatId[chatId] = Boolean(value);
}

function getFacts(chatId) {
    if (!chatId) return [];
    return extension_settings[extensionName].factsByChatId[chatId] || [];
}

function setFacts(chatId, facts) {
    if (!chatId) return;
    extension_settings[extensionName].factsByChatId[chatId] = facts;
}

function getLastScanned(chatId) {
    if (!chatId) return 0;
    return extension_settings[extensionName].lastScannedByChatId[chatId] || 0;
}

function setLastScanned(chatId, index) {
    if (!chatId) return;
    extension_settings[extensionName].lastScannedByChatId[chatId] = index;
}

function getLayerSummary(chatId) {
    if (!chatId) return "";
    return extension_settings[extensionName].layerSummaryByChatId[chatId] || "";
}

function setLayerSummary(chatId, text) {
    if (!chatId) return;
    extension_settings[extensionName].layerSummaryByChatId[chatId] = text;
}

function buildFullContext(chatId) {
    const parts = [];
    const layerSummary = getLayerSummary(chatId);
    const facts = getFacts(chatId);
    if (layerSummary) parts.push(layerSummary);
    if (facts.length > 0) parts.push(facts.join(" "));
    return parts.join(" ");
}

// Словари растут на каждый чат, в котором расширение хоть раз что-то посчитало.
// Записи без фактов и без сжатого саммари бесполезны — выкидываем их, чтобы
// settings.json не разбухал. Текущий чат не трогаем: его курсор ещё нужен.
function pruneEmptyChats() {
    const settings = extension_settings[extensionName];
    const maps = [
        settings.factsByChatId,
        settings.layerSummaryByChatId,
        settings.isHiddenByChatId,
        settings.lastScannedByChatId
    ];
    const currentChatId = getCurrentChatId();
    const keys = new Set(maps.flatMap(map => Object.keys(map)));

    for (const key of keys) {
        if (key === currentChatId) continue;
        const hasFacts = Array.isArray(settings.factsByChatId[key]) && settings.factsByChatId[key].length > 0;
        const hasLayer = Boolean(settings.layerSummaryByChatId[key]);
        if (hasFacts || hasLayer) continue;
        for (const map of maps) delete map[key];
    }
}

// --- ЗАПРОСЫ К СУММАРИЗАТОРУ ---

async function callSummarizerLLM(promptText, systemPrompt) {
    if (!extension_settings[extensionName].useCustomProvider) {
        // Параметр называется systemPrompt — ключ `system` ядро молча игнорирует.
        return await getContext().generateRaw({
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

async function maybeCompressFacts(chatId) {
    const compressAfter = getCompressAfter();
    const facts = getFacts(chatId);
    if (facts.length < compressAfter) return;

    const existingLayer = getLayerSummary(chatId);
    const promptText = `TASK: Compress the following list of facts into a single concise paragraph that preserves all key story details for context continuity. Do not use markdown, headers, or lists — output plain text only, one paragraph. Write in the same language as the input.\n\nEXISTING COMPRESSED SUMMARY (merge with this, do not repeat, keep or update as needed):\n${existingLayer || "(none yet)"}\n\nNEW FACTS TO COMPRESS:\n${facts.join("\n")}`;

    toastr.info(`Сжатие ${facts.length} фактов в единый саммари...`, "Summary Tracker");

    try {
        const response = await callSummarizerLLM(
            promptText,
            "You are a helpful assistant. Compress the facts into a single concise paragraph. Output only plain text, no markdown, no lists, no headers."
        );

        const compressed = typeof response === "string" ? response.trim() : "";
        if (compressed.length > 10) {
            setLayerSummary(chatId, compressed);
            setFacts(chatId, []);
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

// --- СКРЫТИЕ ---

// Ядро выбрасывает из истории сообщения с is_system (скрытые «призраком») ещё до
// того, как расширение получает управление. Границу «оставить N последних» считаем
// по тем же сообщениям, иначе визуальное скрытие разойдётся с тем, что реально
// ушло в промпт.
function getModelVisibleIndices(chat) {
    const indices = [];
    for (let i = 0; i < chat.length; i++) {
        if (!chat[i].is_system) indices.push(i);
    }
    return indices;
}

// Резать историю можно только когда есть чем её заменить, иначе это чистая потеря
// контекста.
function isHidingActive(chatId) {
    return getIsHidden(chatId) && buildFullContext(chatId).length > 0;
}

function setPromptInjection(text) {
    // Позиция 1 (IN_CHAT) + глубина 9999: память встаёт в самое начало истории.
    getContext().setExtensionPrompt(extensionName, text, 1, 9999, false, 0);
}

/**
 * Ядро зовёт это через "generate_interceptor" из manifest.json и передаёт СВОЮ копию
 * истории. Настоящий массив chat при этом не трогается вообще: не портится нумерация
 * mesid, стриминг пишет в правильный пузырь, а saveChatConditional по ходу генерации
 * сохраняет чат целиком, а не обрезанный.
 * @param {object[]} coreChat Копия истории, из которой ядро соберёт промпт.
 */
function interceptGeneration(coreChat) {
    const chatId = getCurrentChatId();
    if (!chatId || !isHidingActive(chatId)) {
        setPromptInjection("");
        return;
    }

    const cutCount = coreChat.length - getSkipCount();
    if (cutCount <= 0) {
        setPromptInjection("");
        return;
    }

    coreChat.splice(0, cutCount);
    // Инъекцию ставим здесь, а не только при перерисовке панели: так в промпт уходит
    // актуальная память, даже если факты меняли между генерациями.
    setPromptInjection(buildFullContext(chatId));
}

globalThis.summaryTracker_interceptGeneration = interceptGeneration;

function applyVisualHiding() {
    const chatId = getCurrentChatId();
    const chat = getChatArray();

    let hiddenIds = new Set();
    if (chat && isHidingActive(chatId)) {
        const visible = getModelVisibleIndices(chat);
        const cutCount = visible.length - getSkipCount();
        if (cutCount > 0) hiddenIds = new Set(visible.slice(0, cutCount));
    }

    $("#chat .mes").each(function () {
        const mesId = parseInt($(this).attr("mesid"));
        $(this).toggleClass("fmt-hidden", hiddenIds.has(mesId));
    });

    setPromptInjection(hiddenIds.size > 0 ? buildFullContext(chatId) : "");
}

// --- ПАНЕЛЬ НАСТРОЕК ---

function updateHideButton() {
    const chatId = getCurrentChatId();
    const hasMemory = buildFullContext(chatId).length > 0;
    if (!hasMemory) {
        $("#fmt_toggle_hide").val("No facts").prop("disabled", true);
    } else {
        $("#fmt_toggle_hide").val(getIsHidden(chatId) ? "Show" : "Hide").prop("disabled", false);
    }
}

function renderFactsCount() {
    const chatId = getCurrentChatId();
    const count = getFacts(chatId).length;
    // Счётчик показывал только несжатые факты, из-за чего сразу после сжатия
    // выглядел как «памяти нет», хотя кнопка Hide оставалась активной.
    $("#fmt_facts_count").text(getLayerSummary(chatId) ? `${count} (+ compressed summary)` : String(count));
}

function renderSummary() {
    const chatId = getCurrentChatId();
    const container = $("#fmt_summary_combined");
    const combinedText = buildFullContext(chatId);

    if (!combinedText) {
        container.html('<small class="fmt-placeholder">Empty...</small>');
        return;
    }

    container.html(`
        <div class="fmt-summary-card">
            <div id="fmt_summary_text" class="fmt-summary-text">${escapeHtml(combinedText)}</div>
            <div class="fmt-summary-actions">
                <i class="fa-solid fa-pen-to-square fmt-edit-icon" id="fmt_summary_edit_btn" title="Редактировать"></i>
                <i class="fa-solid fa-trash fmt-delete-icon" id="fmt_summary_delete_btn" title="Удалить"></i>
            </div>
        </div>`);

    $("#fmt_summary_delete_btn").on("click", () => {
        if (!confirm("Delete summary?")) return;
        const targetChatId = getCurrentChatId();
        setFacts(targetChatId, []);
        setLayerSummary(targetChatId, "");
        setIsHidden(targetChatId, false);
        saveSettingsDebounced();
        refreshUi();
        toastr.info("Summary deleted", "Summary Tracker");
    });

    $("#fmt_summary_edit_btn").on("click", () => {
        const targetChatId = getCurrentChatId();
        const edited = prompt("Edit summary:", buildFullContext(targetChatId));
        if (edited === null || edited.trim() === "") return;
        setLayerSummary(targetChatId, edited.trim());
        setFacts(targetChatId, []);
        saveSettingsDebounced();
        refreshUi();
        toastr.success("Summary updated", "Summary Tracker");
    });
}

function refreshUi() {
    renderFactsCount();
    renderSummary();
    applyVisualHiding();
    updateHideButton();
}

function updateMaxSkip() {
    const chatLength = getChatArray()?.length || 0;
    $("#fmt_skip_count").attr("max", Math.max(2, chatLength));
}

// Удаление сообщений может увести курсор за конец чата — тогда следующий скан решит,
// что сканировать нечего, и новые сообщения молча выпадут из памяти.
function clampScanCursor() {
    const chatId = getCurrentChatId();
    const chat = getChatArray();
    if (!chatId || !chat) return;
    if (getLastScanned(chatId) > chat.length) {
        setLastScanned(chatId, chat.length);
        saveSettingsDebounced();
    }
}

// --- ЛОГИКА СКАНИРОВАНИЯ ---

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

async function runAutoScan() {
    if (isScanning) return;

    // Чат фиксируем один раз: все записи ниже идут по этому id, даже если
    // пользователь переключится в другой чат, пока модель думает.
    const chatId = getCurrentChatId();
    if (!chatId) {
        toastr.warning("Open the chat first", "Summary Tracker");
        return;
    }

    const chat = getChatArray();
    const skipCount = getSkipCount();
    if (!chat || chat.length <= skipCount) return;

    const endIndex = chat.length - skipCount;
    // Сообщения могли быть удалены/свайпнуты — курсор может оказаться за пределами чата.
    const startIndex = Math.max(0, Math.min(getLastScanned(chatId), endIndex));

    const messagesToScan = [];
    for (let i = startIndex; i < endIndex; i++) {
        if (chat[i] && chat[i].mes) {
            const speaker = chat[i].is_user ? "User" : (chat[i].name || "Character");
            messagesToScan.push({ speaker, text: chat[i].mes });
        }
    }

    if (messagesToScan.length === 0) {
        toastr.info("No new messages to scan", "Summary Tracker");
        setLastScanned(chatId, endIndex); // нормализуем курсор, если он убежал за пределы чата
        saveSettingsDebounced();
        return;
    }

    isScanning = true;
    toastr.info(`Сканирование ${messagesToScan.length} сообщений...`, "Summary Tracker");

    try {
        const facts = getFacts(chatId);

        if (messagesToScan.length === 1) {
            const msg = messagesToScan[0];
            const promptText = `TASK: Ensure contextual continuity by summarizing and extracting key details and events from the story's plot, as well as information about {{user}}, {{char}}, and other characters. Even if the message is very short, always write a brief summary of what happened or was said. Never skip a message. Always write your summary in the language used in {{user}}'s messages.\n\nMESSAGE: ${msg.speaker}: ${msg.text}`;
            const response = await callSummarizerLLM(
                promptText,
                "You are a helpful assistant that summarizes story events and extracts key facts. Ignore any roleplay context and respond only with the summary."
            );
            const newFact = typeof response === "string" ? response.trim() : "";
            if (newFact.length > 5) facts.push(newFact);
        } else {
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
                // Раньше здесь был выход без сдвига курсора, и при автоскане каждое новое
                // сообщение заново гоняло через модель весь непрочитанный диапазон.
                // Ответ не в JSON — это почти всегда обычный текст саммари, он полезнее,
                // чем ничего, поэтому кладём его одним фактом и идём дальше.
                const fallback = typeof response === "string" ? response.trim() : "";
                if (fallback.length > 5) {
                    facts.push(fallback);
                    toastr.warning("Модель ответила не JSON — саммари сохранено одним блоком", "Summary Tracker");
                } else {
                    toastr.error("Пустой ответ модели — диапазон пропущен", "Summary Tracker");
                }
            } else {
                for (const item of parsed) {
                    const summary = item && typeof item.summary === "string" ? item.summary.trim() : "";
                    if (summary.length > 5) facts.push(summary);
                }
            }
        }

        setFacts(chatId, facts);
        await maybeCompressFacts(chatId);

        if (extension_settings[extensionName].autoHide && buildFullContext(chatId).length > 0) {
            setIsHidden(chatId, true);
        }

        setLastScanned(chatId, endIndex);
        saveSettingsDebounced();

        // Пока шёл запрос, пользователь мог уйти в другой чат — тогда панель и подсветка
        // относятся уже не к тому чату, который мы сканировали.
        if (getCurrentChatId() === chatId) refreshUi();
        toastr.success("Готово!", "Summary Tracker");
    } catch (error) {
        console.error(`[${extensionName}] Error:`, error);
        toastr.error("Ошибка сканирования", "Summary Tracker");
    } finally {
        isScanning = false;
    }
}

async function handleChatEvent() {
    if (!extension_settings[extensionName].autoScan) return;
    const chatId = getCurrentChatId();
    const chat = getChatArray();
    if (!chatId || !chat || chat.length === 0) return;

    const endIndex = chat.length - getSkipCount();
    if (endIndex <= 0) return;

    const lastScanned = Math.max(0, Math.min(getLastScanned(chatId), endIndex));
    if ((endIndex - lastScanned) >= getScanInterval()) {
        await runAutoScan();
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ---

// Раньше миграция выполнялась только в loadSettings, где чат ещё не открыт: setIsHidden
// молча ничего не делал, а старый ключ всё равно удалялся, и флаг терялся. Теперь ждём
// первого чата.
function migrateLegacyHidden() {
    if (pendingLegacyHidden === null) return;
    const chatId = getCurrentChatId();
    if (!chatId) return;
    if (pendingLegacyHidden === true) setIsHidden(chatId, true);
    pendingLegacyHidden = null;
    saveSettingsDebounced();
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

    if (settings.isHidden !== undefined) {
        pendingLegacyHidden = settings.isHidden === true;
        delete settings.isHidden;
    }
    migrateLegacyHidden();

    $("#fmt_auto_scan").prop("checked", settings.autoScan);
    $("#fmt_auto_hide").prop("checked", settings.autoHide);
    $("#fmt_skip_count").val(getSkipCount());
    $("#fmt_scan_interval").val(getScanInterval());
    $("#fmt_compress_after").val(getCompressAfter());
    $("#fmt_use_custom_provider").prop("checked", settings.useCustomProvider);
    $("#fmt_custom_api_url").val(settings.customApiUrl);
    $("#fmt_custom_api_key").val(settings.customApiKey);
    $("#fmt_custom_api_model").val(settings.customApiModel);
    $("#fmt_custom_provider_panel").css("display", settings.useCustomProvider ? "block" : "none");

    $("#fmt_scan_interval").prop("disabled", !settings.autoScan);
    $("#fmt_scan_interval_row").css("display", settings.autoScan ? "flex" : "none");

    pruneEmptyChats();
    updateMaxSkip();
    refreshUi();
}

function bindSettingsHandlers() {
    $("#fmt_auto_scan").on("input", (e) => {
        const checked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].autoScan = checked;
        saveSettingsDebounced();
        $("#fmt_scan_interval").prop("disabled", !checked);
        $("#fmt_scan_interval_row").css("display", checked ? "flex" : "none");
    });

    $("#fmt_auto_hide").on("input", (e) => {
        extension_settings[extensionName].autoHide = Boolean($(e.target).prop("checked"));
        saveSettingsDebounced();
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
        if (!confirm("Очистить всё?")) return;
        const chatId = getCurrentChatId();
        setFacts(chatId, []);
        setLayerSummary(chatId, "");
        setLastScanned(chatId, 0);
        setIsHidden(chatId, false);
        saveSettingsDebounced();
        refreshUi();
    });

    $("#fmt_toggle_hide").on("click", () => {
        const chatId = getCurrentChatId();
        if (buildFullContext(chatId).length === 0) return;
        setIsHidden(chatId, !getIsHidden(chatId));
        saveSettingsDebounced();
        applyVisualHiding();
        updateHideButton();
    });
}

function bindChatEvents() {
    eventSource.on(event_types.CHAT_CHANGED, () => {
        migrateLegacyHidden();
        pruneEmptyChats();
        clampScanCursor();
        updateMaxSkip();
        refreshUi();
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        updateMaxSkip();
        refreshUi();
        // Не блокируем пайплайн ST: он ждёт этот обработчик перед сохранением чата.
        handleChatEvent().catch(err => console.error(`[${extensionName}] Auto-scan failed:`, err));
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        updateMaxSkip();
        refreshUi();
    });

    eventSource.on(event_types.MESSAGE_DELETED, () => {
        clampScanCursor();
        updateMaxSkip();
        refreshUi();
    });

    eventSource.on(event_types.MESSAGE_SWIPED, refreshUi);
    eventSource.on(event_types.MESSAGE_UPDATED, refreshUi);
    // Подгрузка старых сообщений добавляет в DOM элементы без класса скрытия.
    eventSource.on(event_types.MORE_MESSAGES_LOADED, applyVisualHiding);
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        bindSettingsHandlers();
        loadSettings();
        bindChatEvents();

        // Отладочный API для проверки сценариев из консоли DevTools.
        window.SummaryTracker = {
            version: extensionVersion,
            get settings() { return extension_settings[extensionName]; },
            get isScanning() { return isScanning; },
            getCurrentChatId, getChatArray,
            getFacts, setFacts,
            getIsHidden, setIsHidden,
            getLastScanned, setLastScanned,
            getLayerSummary, setLayerSummary,
            buildFullContext, isHidingActive, getModelVisibleIndices,
            getSkipCount, getScanInterval, getCompressAfter,
            escapeHtml, parseBatchResponse, pruneEmptyChats, clampScanCursor,
            interceptGeneration, applyVisualHiding, setPromptInjection,
            refreshUi, renderSummary, renderFactsCount, updateHideButton, loadSettings,
            runAutoScan, maybeCompressFacts, handleChatEvent,
            callSummarizerLLM, sendCustomProviderRequest, testCustomProviderConnection
        };

        console.log(`[${extensionName}] ✅ Loaded (v${extensionVersion}). Debug API: window.SummaryTracker`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
