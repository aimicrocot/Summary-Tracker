# Summary Tracker

## Eng ReadMe

<details>

### About
  
A minimalist extension that allows hiding messages from the context and summarizing their essence, sending only the most important information to the chat context to save tokens (work in progress). Designed for max token/cost savings during RP, extending API key lifespan, and preserving context coherence.

### Features

- You control how many of the most recent messages remain visible; at minimum, this includes the latest message from the bot and the user
- All other messages are automatically hidden, and their key points are also extracted automatically—no manual selection required
- The process runs in parallel, meaning it does not affect the model’s intelligence
- There are no additional injections or token overhead—only a concise summary of past messages
- There is an option to manually scan messages via a button.

### Installation

1. Open SillyTavern

2. Go to the Extensions → Install Extension

3. Paste the link to this GitHub repository

4. Refresh the SillyTavern page (F5)

### Testing

Look for extension in the list of extensions in SillyTavern.

### Inspired by

Extension with similar functionality that I’ve seen:

https://github.com/Kristyku/InlineSummary

</details>

## Прочти меня

### О расширении

Минималистичное расширение, которое позволяет скрывать сообщения из контекста и вытаскивать их суть, отправляя в контекст чата только самую важную информацию (в разработке). Создано для максимальной экономии токенов/денег во время РП, продления жизни api-ключей и сохранения связности контекста.

### Особенности

- Вы контролируете число последних сообщений, которые не скрываются; минимально это последнее сообщение бота и юзера
- Остальные сообщения скрываются автоматически, и суть из них собирается тоже автоматически, их не надо выбирать вручную
- Процесс проходит параллельно, то есть построен так, что не влияет на интеллект модели
- Нет никаких дополнительных инжектов или траты токенов на что-то ещё, только сканирование и краткое саммари сообщений
- Есть возможность ручного скана через кнопку

### Установка

1. Откройте SillyTavern

2. Перейдите в Extensions → Install Extension

3. Вставьте ссылку на этот GitHub-репозиторий

4. Обновите страницу SillyTavern (F5)

### Тестирование

Найдите название расширения в списке расширений в SillyTavern.

### Вдохновлено

Расширенияме с похожим функционалом, которое мне встретилось:

https://github.com/Kristyku/InlineSummary
