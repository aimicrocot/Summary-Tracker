# Summary Tracker (in process)

## Eng ReadMe

<details>

### About the Extension

A minimalist extension that hides messages from the context and extracts their essence, sending only the most important information into the chat context. It is designed to maximize token/cost efficiency, extend API key lifespan, and maintain context coherence during roleplay.

### Fixed & Added

* **v1.3.0** — memory moved out of the global settings file into the chat's own `chat_metadata`. Facts now travel with the chat: renaming a chat no longer wipes them, two characters with identically named chat files no longer share memory, and exporting a chat carries its summary along. Data saved by v1.2.0 is migrated automatically the first time you open each chat
* **v1.3.0** — the scan cursor can only move forward. Raising "Leave messages" used to rewind it and re-summarize the same messages
* **v1.3.0** — if the model returns fewer summaries than the batch contained, the cursor stops at the last confirmed one and you get a warning. Previously the missing messages were dropped from memory silently
* **v1.3.0** — long scans are split into chunks (20 messages / 24k characters) and sent one after another, so the first scan of a large chat no longer overflows the context or gets rejected by the provider
* **v1.3.0** — ghost-hidden messages (`is_system`) are skipped by the scanner too, so scanning and hiding finally operate on the same set of messages
* **v1.3.0** — swipes no longer hide one message too many, and other extensions' background generations (built-in Summarize, `/gen`, image prompts) receive the full untruncated history
* **v1.3.0** — the custom provider request has a 60-second timeout, sends `max_tokens`, and falls back to `reasoning_content` when a reasoning model leaves `content` empty. A hung provider no longer freezes auto-scanning until you reload the page
* **v1.3.0** — the extension folder is resolved at runtime, so a ZIP install into a differently named folder works; a failed load now shows an error instead of failing silently
* **v1.3.0** — deleting the summary (the trash icon) now also resets the scan cursor. Previously Scan answered "No new messages to scan" right after a delete, and the chat could never be re-summarized
* **v1.3.0** — pressing Scan when every message fits inside the "leave visible" window now says so instead of doing nothing at all
* **v1.3.0** — the summary is edited in a real textarea instead of a browser `prompt()`
* **v1.2.0** — hiding no longer modifies the real chat array. The extension now uses SillyTavern's official `generate_interceptor` hook, which receives a *copy* of the history. This fixes truncated chats being written to disk, streaming text landing in the wrong message bubble, and swipe/continue overwriting an earlier message
* **v1.2.0** — a scan is now bound to the chat it started in, so switching chats mid-summarization no longer writes facts into the wrong chat
* **v1.2.0** — if the model replies with plain text instead of JSON, the reply is stored as a single fact and the scan cursor moves on, instead of re-sending the same range to the model on every new message
* Fixed a bug with visual hiding of messages, when it showed empty space instead of messages
* Added an option to set the summarization frequency when auto-scanning is enabled. The value specifies how many messages should pass between summarizations; 1 means every message is summarized

### Features

* You control how many of the most recent messages remain visible; at minimum, the latest message from both the bot and the user
* All other messages can be hidden by pressing the "Hide" button, and their essence is collected by pressing the "Scan" button—no need to select messages manually
* The hidden messages are replaced by a single compact summary injected at the top of the history. That injection is the only thing the extension adds to your prompt—there is no other overhead, no extra instructions, and no token usage beyond the scan requests themselves
* Optional auto-scanning and auto-hiding
* Uses your current model that you are roleplaying with, or a separate cheap model via the custom provider settings

### One side effect worth knowing

SillyTavern builds the text it scans for World Info from the same trimmed copy the extension returns, so hidden messages stop triggering lorebook entries — their content survives only inside the summary. If a lorebook entry depends on a keyword from an old message, add that keyword to the summary by hand or keep those messages visible.

### Where the memory is stored

Since v1.3.0 facts and the scan cursor live in the chat's own `chat_metadata`, i.e. inside the chat file itself. They survive a rename, they are never shared between two chats that happen to have the same file name, and they are included when you export the chat. Memory saved by v1.2.0 in `settings.json` is migrated on first open of each chat and removed from the settings file.

Global options (auto-scan, auto-hide, "leave messages", scan interval, compression threshold, custom provider) stay in `settings.json` as before. Note that the custom provider API key is stored there in plain text and ends up in a settings export.

### Installation

1. Open SillyTavern

2. Go to Extensions → Install Extension

3. Paste the link to this GitHub repository

4. Refresh the SillyTavern page (F5)

### Usage

Find the extension name in the list of extensions in SillyTavern.

### Contacts

My Telegram-channel: [@sillytavern1](https://t.me/sillytavern1)

### Inspired by

- [https://github.com/Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary)
- [https://github.com/Lodactio/Extension-Summaryception](https://github.com/Lodactio/Extension-Summaryception)


</details>

## Прочти меня

### О расширении

Минималистичное расширение, которое скрывает сообщения из контекста и вытаскивает их суть в виде саммари, отправляя в контекст чата только его. Нужно для максимальной экономии токенов/денег, продления жизни API-ключей и сохранения связности контекста во время РП.

### Исправлено и добавлено

* **v1.3.0** — память переехала из общего файла настроек в `chat_metadata` самого чата. Теперь факты живут вместе с чатом: переименование чата их больше не стирает, два персонажа с одинаковым именем файла чата больше не делят одну память, а при экспорте чата саммари уезжает вместе с ним. Данные, накопленные в v1.2.0, переносятся автоматически при первом открытии каждого чата
* **v1.3.0** — курсор сканирования может только идти вперёд. Раньше увеличение «Leave messages» откатывало его назад, и одни и те же сообщения суммаризировались повторно
* **v1.3.0** — если модель вернула меньше саммари, чем было сообщений в пачке, курсор останавливается на последнем подтверждённом, и показывается предупреждение. Раньше недостающие сообщения молча выпадали из памяти
* **v1.3.0** — длинный скан режется на пачки (20 сообщений / 24 тысячи символов) и отправляется последовательно, поэтому первый скан большого чата больше не переполняет контекст и не отлетает у провайдера
* **v1.3.0** — сообщения, скрытые «призраком» (`is_system`), теперь пропускает и сканер: скан и скрытие наконец работают с одним и тем же набором сообщений
* **v1.3.0** — при свайпе больше не прячется одно лишнее сообщение, а фоновые генерации других расширений (встроенный Summarize, `/gen`, промпты для картинок) получают полную необрезанную историю
* **v1.3.0** — у запроса к кастомному провайдеру появился таймаут в 60 секунд и `max_tokens`, а при пустом `content` читается `reasoning_content` (так отвечают reasoning-модели). Зависший провайдер больше не блокирует автоскан до перезагрузки страницы
* **v1.3.0** — папка расширения определяется во время выполнения, поэтому установка ZIP-архивом в папку с другим именем тоже работает; при неудачной загрузке теперь показывается ошибка, а не тишина
* **v1.3.0** — удаление саммари (иконка корзины) теперь сбрасывает и курсор сканирования. Раньше сразу после удаления Scan отвечал «No new messages to scan», и чат было невозможно просаммаризировать заново
* **v1.3.0** — если все сообщения попадают в окно «оставить видимыми», Scan теперь так и говорит, а не молчит, будто кнопка сломана
* **v1.3.0** — саммари правится в обычной textarea, а не в браузерном `prompt()`
* **v1.2.0** — скрытие больше не меняет реальный массив чата. Расширение перешло на штатный хук SillyTavern `generate_interceptor`, который получает *копию* истории. Это чинит запись обрезанного чата на диск, попадание стриминга в чужой пузырь сообщения и перезапись старого сообщения при свайпе и Continue
* **v1.2.0** — скан привязан к тому чату, в котором был начат: переключение чата во время саммаризации больше не записывает факты в чужой чат
* **v1.2.0** — если модель ответила обычным текстом вместо JSON, ответ сохраняется одним фактом и курсор сдвигается вперёд, а не гоняет один и тот же диапазон через модель на каждом новом сообщении
* Исправлена ​​ошибка визуального скрытия сообщений, когда вместо сообщений отображалось пустое пространство
* Добавлена ​​возможность ввести число, через сколько сообщений будет происходить каждый самрайз при включенном автосканировании, где 1 означает самрайз каждого сообщения

### Особенности

- Вы контролируете число последних сообщений, которые не скрываются; минимально это последнее сообщение бота и юзера, сообщения не надо выбирать вручную
- Остальные сообщения скрываются при нажатии на кнопку "Скрыть", и суть из них собирается при нажатии на кнопку "Сканировать"
- Вместо скрытых сообщений в промпт уходит один компактный саммари в начале истории. Этот инжект — единственное, что расширение добавляет к промпту: никаких дополнительных инструкций и никакой траты токенов сверх самих запросов на сканирование
- Есть возможность автоскана и автоскрытия
- Используется ваша текущая модель, с которой вы в РП, либо отдельная дешёвая модель через настройки custom provider

### Механизм скрытия

Расширение регистрирует `generate_interceptor` — это официальная точка расширения SillyTavern, тем же способом работают встроенные Vector Storage и Stable Diffusion. Прямо перед сборкой промпта ядро отдаёт расширению **копию** истории (`coreChat`), и уже из неё выбрасываются лишние сообщения. Настоящий массив `chat` при этом не трогается вообще.

Это важно: раньше сообщения вырезались из настоящего `chat` через `splice`, и на время генерации SillyTavern успевал сохранить в файл чата укороченную историю. Теперь вырезка живёт только внутри одного промпта, поэтому ни файл чата, ни нумерация сообщений, ни стриминг, ни свайпы не страдают.

Вместо вырезанных сообщений в начало истории подставляется накопленный саммари через `setExtensionPrompt`.

Скрытие не конфликтует со скрытием сообщений «призраком» (иконка Глаза, `is_system`) — это независимый механизм. Сообщения, скрытые призраком, расширение вообще не считает: и граница «оставить N последних», и курсор сканирования отсчитываются только по тем сообщениям, которые реально уходят модели.

Визуально скрытые сообщения не отображаются в чате (CSS-класс `fmt-hidden`), вернуть их и в контекст, и на экран всегда можно кнопкой Show.

Один побочный эффект, о котором стоит знать: SillyTavern собирает текст для сканирования World Info (`chatForWI`) уже после интерцепторов, из той же обрезанной копии. Значит скрытые сообщения перестают триггерить записи лорбука — их содержимое живёт только в саммари. Если запись лорбука завязана на ключевое слово из давнего сообщения, добавьте это слово в саммари вручную или оставьте такие сообщения видимыми.

Пока идёт фоновая генерация другого расширения (встроенный Summarize, `/gen`, промпт для картинки — всё, что ядро помечает как `quiet`), история не обрезается вообще: этим инструментам нужен полный текст.

### Где лежит память

С v1.3.0 факты и курсор сканирования хранятся в `chat_metadata` конкретного чата, то есть внутри самого файла чата. Они переживают переименование, никогда не смешиваются между чатами с одинаковым именем файла и уезжают вместе с чатом при экспорте. Память, накопленная в v1.2.0 в `settings.json`, переносится при первом открытии чата и удаляется из файла настроек.

Глобальные настройки (автоскан, автоскрытие, «оставить N последних», интервал скана, порог сжатия, кастомный провайдер) по-прежнему живут в `settings.json`. Учтите, что ключ кастомного провайдера хранится там открытым текстом и попадает в экспорт настроек.

### Проверка, что всё работает

Откройте консоль DevTools (F12) — расширение публикует отладочный API `window.SummaryTracker`. Например, `SummaryTracker.buildFullContext()` покажет текст, который уходит в промпт вместо скрытых сообщений, `SummaryTracker.readState()` — весь объект памяти текущего чата (факты, сжатый слой, курсор), а `SummaryTracker.isHidingActive()` — активно ли сейчас скрытие.

### Установка

1. Откройте SillyTavern

2. Перейдите в Extensions → Install Extension

3. Вставьте ссылку на этот GitHub-репозиторий

4. Обновите страницу SillyTavern (F5)

### Использование

Найдите название расширения в списке расширений в SillyTavern.

### Контакты

Мой Телеграм-канал: [@sillytavern1](https://t.me/sillytavern1)

### Вдохновлено

- [https://github.com/Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary)
- [https://github.com/Lodactio/Extension-Summaryception](https://github.com/Lodactio/Extension-Summaryception)
