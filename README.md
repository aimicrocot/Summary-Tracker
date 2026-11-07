# Summary Tracker 
## Eng ReadMe

<details>

### About the Extension

A minimalist extension that hides messages from the context and extracts their essence, sending only the most important information into the chat context. It is designed to maximize token/cost efficiency, extend API key lifespan, and maintain context coherence during roleplay.

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
