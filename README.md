# Summary Tracker

## Eng ReadMe

<details>

### About the Extension

A minimalist extension that hides messages from the context and extracts their essence, sending only the most important information into the chat context. It is designed to maximize token/cost efficiency, extend API key lifespan, and maintain context coherence during roleplay.

### Features

* You control how many of the most recent messages remain visible; at minimum, the latest message from both the bot and the user
* All other messages can be hidden by pressing the "Hide" button, and their essence is collected by pressing the "Scan" button—no need to select messages manually
* The process is designed so it does not affect the model’s intelligence, no additional injections or token usage for anything else—only scanning and concise summarization of messages
* Option to automatically scan every 4 messages
* Uses your current model that you are roleplaying with

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

An extension with similar functionality that I came across: [https://github.com/Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary)


</details>

## Прочти меня

### О расширении

Минималистичное расширение, которое скрывает сообщения из контекста и вытаскивает их суть в виде саммари, отправляя в контекст чата только его. Нужно для максимальной экономии токенов/денег, продления жизни API-ключей и сохранения связности контекста во время РП.

### Особенности

- Вы контролируете число последних сообщений, которые не скрываются; минимально это последнее сообщение бота и юзера, сообщения не надо выбирать вручную
- Остальные сообщения скрываются при нажатии на кнопку "Скрыть", и суть из них собирается при нажатии на кнопку "Сканировать"
- Процесс построен так, что не влияет на интеллект модели, нет никаких дополнительных инжектов или траты токенов на что-то ещё, только сканирование и краткое саммари сообщений
- Есть возможность автоматического скана каждые 4 сообщения
- Используется ваша текущая модель, с которой вы в РП

### Механизм скрытия

Сообщения вырезаются из контекста за счёт splice. Для проверки прейдите в консоль devtools, введите команду на проверку (почти любая нейросеть вам легко это напишет) посмотрите результат, если хотите удостовериться, что расширение рабочее.

Chat history не отобразит вырезку сообщений расширением. Они вырезаются из контекста на время генерации ответа нейросетью, а потом возвращаются. Так что полные сообщения не потеряются, если вы захотите их вернуть, и не забивают контекст чата, когда модель генерирует ответ.

Вырезка через splice не конфликтует со скрытием сообщений (когда вы нажимаете на иконку Глаза, и на сообщение вешается иконка Призрака). Есть если вы скроете призраком сообщение, не собираясь использовать его содержание, оно не будет конфликтовать со скрытием через splice, потому что это другой механизм. Плюс, чтобы не было путанницы со скрытием через призрака, скрытые сообщения вообще не отображаются в чате, а вернуть их как в контекст чата, так и визуально всегда можно кнопкой Show

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

Встретившееся расширение с похожим функционалом (но сообщения для скрытия надо выбирать вручную): https://github.com/Kristyku/InlineSummary
