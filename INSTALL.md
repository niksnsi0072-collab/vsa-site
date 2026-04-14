# Установка сайта ВСА на сервер

## Требования
- Node.js версии 18 или выше (https://nodejs.org)
- Любой VPS/хостинг с поддержкой Node.js (например: Timeweb, Selectel, REG.RU)

## Шаги установки

### 1. Скопировать папку проекта на сервер
Загрузить все файлы на сервер (через FTP, SSH, панель хостинга).

### 2. Установить зависимости
Открыть терминал в папке проекта и выполнить:
```
npm install
```

### 3. Настроить пароль админки
Открыть файл `.env` и изменить:
```
ADMIN_PASSWORD=ваш_надёжный_пароль
SESSION_SECRET=любая_случайная_строка
PORT=3000
```

### 4. Запустить сервер
```
node server.js
```
Сайт будет доступен на порте 3000.

### 5. Автозапуск (рекомендуется)
Чтобы сервер работал постоянно и перезапускался автоматически:
```
npm install -g pm2
pm2 start server.js --name vsa-site
pm2 save
pm2 startup
```

### 6. Привязка домена
Настроить nginx как прокси на порт 3000:
```nginx
server {
    listen 80;
    server_name ooovsa.ru www.ooovsa.ru;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Использование

- **Сайт**: http://ваш-домен/
- **Админ-панель**: http://ваш-домен/admin.html
- **Пароль по умолчанию**: указан в файле `.env`

## Структура файлов
```
проект/
  server.js          — сервер
  .env               — настройки (пароль, порт)
  data/vacancies.json — данные вакансий
  admin.html          — панель администратора
  index.html          — главная страница
  about.html          — о компании
  services.html       — услуги
  partners.html       — партнёры
  vacancies.html      — вакансии
  css/style.css       — стили
  js/main.js          — скрипты
  images/             — изображения
```
