import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Facts-Memory-Tracker";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    autoScan: false,
    skipCount: 2,
    facts: [] 
};

// --- ФУНКЦИИ УПРАВЛЕНИЯ ---

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

    // Создаем контейнер-список
    let html = '<div class="fmt-list-container">';
    
    facts.forEach((fact, index) => {
        html += `
            <div class="fmt-fact-item">
                <div class="fmt-fact-text">${fact}</div>
                <div class="fmt-fact-controls">
                    <i class="fa-solid fa-pen-to-square fmt-edit-btn" data-index="${index}" title="Редактировать"></i>
                    <i class="fa-solid fa-trash fmt-delete-btn" data-index="${index}" title="Удалить"></i>
                </div>
            </div>`;
    });
    
    html += '</div>';
    listContainer.html(html);

    // Обработчики событий
    $(".fmt-delete-btn").off("click").on("click", function() {
        deleteFact($(this).data("index"));
    });

    $(".fmt-edit-btn").off("click").on("click", function() {
        editFact($(this).data("index"));
    });
}

// --- ЛОГИКА СКАНИРОВАНИЯ (БЕЗ ИЗМЕНЕНИЙ ФУНКЦИОНАЛА) ---

async function runAutoScan() {
    const context = getContext();
    const chat = context.chat;
    const skipCount = parseInt(extension_settings[extensionName].skipCount) || 2;

    if (!chat || chat.length <= skipCount) return;

    const endIndex = chat.length - skipCount;
    let targetText = "";

    for (let i = 0; i < endIndex; i++) {
        if (chat[i] && chat[i].mes) {
            const speaker = chat[i].is_user ? "User" : (chat[i].name || "Character");
            targetText += `${speaker}: ${chat[i].mes}\n`;
        }
    }

    if (targetText.trim() === "") return;

    const promptText = `TASK: Extract facts ONLY from the "NEW CHAT DATA" provided below. 
STRICT RULES:
1. Ignore any previous knowledge about the character.
2. Use ONLY information explicitly mentioned in the text below.
3. Respond with complete, finished sentences.
4. If multiple facts are found, put each on a NEW LINE.
5. If no new facts are found, respond with "No new facts".

NEW CHAT DATA:
${targetText}`;

    try {
        const response = await window.SillyTavern.getContext().generateRaw({
            prompt: promptText,
            text: promptText 
        });
        
        if (response) {
            // 1.2 РАЗДЕЛЕНИЕ ОТВЕТА: Разрезаем текст по переносу строки
            const lines = response.split('\n');
            
            lines.forEach(line => {
                // 1.3 ОЧИСТКА: Убираем лишние пробелы и возможную нумерацию (типа "1. ")
                const cleanFact = line.replace(/^\d+\.\s*/, '').trim();
                
                // 1.4 ПРОВЕРКА: Сохраняем только если это не отказ ИИ и строка не пустая
                if (cleanFact.length > 5 && 
                    !cleanFact.toLowerCase().includes("no new facts") && 
                    !cleanFact.toLowerCase().includes("no information")) {
                    
                    extension_settings[extensionName].facts.push(cleanFact);
                }
            });
            
            saveSettingsDebounced();
            renderFacts();
        }
    } catch (error) {
        console.error(`[${extensionName}] Ошибка сканирования:`, error);
    }
}

async function handleChatEvent() {
    if (!extension_settings[extensionName].autoScan) return;
    const chat = getContext().chat;
    if (chat && chat.length > 0 && chat.length % 4 === 0) {
        await runAutoScan();
    }
}

// --- ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ ---

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

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);
       
        $("#fmt_auto_scan").on("input", (e) => {
            extension_settings[extensionName].autoScan = Boolean($(e.target).prop("checked"));
            saveSettingsDebounced();
        });

        $("#fmt_skip_count").on("input", (e) => {
            let val = parseInt($(e.target).val());
            const max = parseInt($(e.target).attr("max")) || 2;
            if (val < 2) val = 2;
            if (val > max) val = max;
            $(e.target).val(val);
            extension_settings[extensionName].skipCount = val;
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
        eventSource.on(event_types.MESSAGE_RECEIVED, updateMaxSkip);
        
        console.log(`[${extensionName}] ✅ Full Control Loaded`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Load failed:`, error);
    }
});
