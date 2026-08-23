# Summary Tracker (in process)

## Eng ReadMe

<details>

### About the Extension

A minimalist extension that hides messages from the context and extracts their essence, sending only the most important information into the chat context. It is designed to maximize token/cost efficiency, extend API key lifespan, and maintain context coherence during roleplay.

### Fixed & Added

* **v1.2.0** — hiding no longer modifies the real chat array. The extension now uses SillyTavern's official `generate_interceptor` hook, which receives a *copy* of the history. This fixes truncated chats being written to disk, streaming text landing in the wrong message bubble, and swipe/continue overwriting an earlier message
* **v1.2.0** — a scan is now bound to the chat it started in, so switching chats mid-summarization no longer writes facts into the wrong chat
* **v1.2.0** — if the model replies with plain text instead of JSON, the reply is stored as a single fact and the scan cursor moves on, instead of re-sending the same range to the model on every new message
* Fixed a bug with visual hiding of messages, when it showed empty space instead of messages
* Added an option to set the summarization frequency when auto-scanning is enabled. The value specifies how many messages should pass between summarizations; 1 means every message is summarized

### Features

* You control how many of the most recent messages remain visible; at minimum, the latest message from both the bot and the user
* All other messages can be hidden by pressing the "Hide" button, and their essence is collected by pressing the "Scan" button—no need to select messages manually
* The process is designed so it does not affect the model’s intelligence, no additional injections or token usage for anything else—only scanning and concise summarization of messages
* Optional auto-scanning and auto-hiding
* Uses your current model that you are roleplaying with, or a separate cheap model via the custom provider settings

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

* **v1.2.0** — скрытие больше не меняет реальный массив чата. Расширение перешло на штатный хук SillyTavern `generate_interceptor`, который получает *копию* истории. Это чинит запись обрезанного чата на диск, попадание стриминга в чужой пузырь сообщения и перезапись старого сообщения при свайпе и Continue
* **v1.2.0** — скан привязан к тому чату, в котором был начат: переключение чата во время саммаризации больше не записывает факты в чужой чат
* **v1.2.0** — если модель ответила обычным текстом вместо JSON, ответ сохраняется одним фактом и курсор сдвигается вперёд, а не гоняет один и тот же диапазон через модель на каждом новом сообщении
* Исправлена ​​ошибка визуального скрытия сообщений, когда вместо сообщений отображалось пустое пространство
* Добавлена ​​возможность ввести число, через сколько сообщений будет происходить каждый самрайз при включенном автосканировании, где 1 означает самрайз каждого сообщения

### Особенности

- Вы контролируете число последних сообщений, которые не скрываются; минимально это последнее сообщение бота и юзера, сообщения не надо выбирать вручную
- Остальные сообщения скрываются при нажатии на кнопку "Скрыть", и суть из них собирается при нажатии на кнопку "Сканировать"
- Процесс построен так, что не влияет на интеллект модели, нет никаких дополнительных инжектов или траты токенов на что-то ещё, только сканирование и краткое саммари сообщений
- Есть возможность автоскана и автоскрытия
- Используется ваша текущая модель, с которой вы в РП, либо отдельная дешёвая модель через настройки custom provider

### Механизм скрытия

Расширение регистрирует `generate_interceptor` — это официальная точка расширения SillyTavern, тем же способом работают встроенные Vector Storage и Stable Diffusion. Прямо перед сборкой промпта ядро отдаёт расширению **копию** истории (`coreChat`), и уже из неё выбрасываются лишние сообщения. Настоящий массив `chat` при этом не трогается вообще.

Это важно: раньше сообщения вырезались из настоящего `chat` через `splice`, и на время генерации SillyTavern успевал сохранить в файл чата укороченную историю. Теперь вырезка живёт только внутри одного промпта, поэтому ни файл чата, ни нумерация сообщений, ни стриминг, ни свайпы не страдают.

Вместо вырезанных сообщений в начало истории подставляется накопленный саммари через `setExtensionPrompt`.

Скрытие не конфликтует со скрытием сообщений «призраком» (иконка Глаза, `is_system`) — это независимый механизм. Более того, сообщения, скрытые призраком, расширение вообще не считает: граница «оставить N последних» отсчитывается по тем сообщениям, которые реально уходят модели.

Визуально скрытые сообщения не отображаются в чате (CSS-класс `fmt-hidden`), вернуть их и в контекст, и на экран всегда можно кнопкой Show.

### Проверка, что всё работает

Откройте консоль DevTools (F12) — расширение публикует отладочный API `window.SummaryTracker`. Например, `SummaryTracker.buildFullContext(SummaryTracker.getCurrentChatId())` покажет текст, который уходит в промпт вместо скрытых сообщений, а `SummaryTracker.isHidingActive(SummaryTracker.getCurrentChatId())` — активно ли сейчас скрытие.

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
