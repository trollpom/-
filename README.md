# TIC TAC THREE — Современные крестики-нолики

Красивая, современная игра крестики-нолики 3×3 с выбором дизайна, звуками, живой анимацией фона и режимами.

## ✨ Особенности

**Поле:** классическое 3×3 с анимациями `popIn`, подсветкой выигрышной линии, конфетти.

**3 Дизайна:**
- **Nebula** — темный, неоновый, стеклянный морфизм, космические градиенты
- **Frost** — светлый минимализм, frosted glass
- **Clay** — пастельный клейморфизм, мягкий 3D

**3 Набора фигур:**
- **Classic** ×○, **Cosmic** ✦☾, **Neo Pop** ⚡◍

**3 Режима игры:**
- 🤖 С ботом (3 сложности: Easy, Medium, Impossible - minimax)
- 👥 Друг vs Друг на одном устройстве
- 🌐 Онлайн P2P через PeerJS (код комнаты 6 символов)

**Правило «Три фигуры»:**
- У каждого макс 3 метки, 4-й ход стирает старейшую. Ничьих нет.

**🔊 Звуки:** процедурный Web Audio движок (X/O/hover/click/win/draw/remove)

**🌌 Фон:** canvas с частицами + связи + параллакс + зерно (SVG turbulence)

---

## 🚀 Как запустить в WEB

### 1. Локально (dev)
```bash
git clone https://github.com/trollpom/-.git
cd -
npm install
npm run dev
# открой http://localhost:5173
```

### 2. Продакшн сборка (статичный сайт)
```bash
npm run build
# файлы появятся в /dist
npm run preview
# превью на http://localhost:4173
```
Папку `dist` можно залить куда угодно:
- **Vercel / Netlify / GitHub Pages**: просто залей `dist`
- **Любой хостинг**: скопируй содержимое `dist` на сервер
- **Локально открыть**: `npx serve dist`

### 3. Онлайн без сборки (просто открыть)
Так как игра — это 1 HTML + CSS + JS, можно просто открыть `index.html` через Live Server в VSCode. PeerJS для онлайна требует HTTPS, но локально тоже работает.

---

## 💻 Как собрать EXE (десктоп)

Проект уже подготовлен под Electron.

### Что установлено:
- `electron` — оболочка браузера
- `electron-builder` — сборщик в .exe / .AppImage
- `electron-main.cjs` — главный процесс

### Быстрый старт в окне приложения:
```bash
npm install
npm run electron:dev
# откроется Vite dev сервер + окно Electron с игрой
```
Или если уже собран `dist`:
```bash
npm run build
npm run electron
```

### Собрать инсталлятор .exe (Windows)
На Windows машине:
```bash
npm install
npm run build:exe
# результат: dist/ -> TIC TAC THREE Setup 1.0.0.exe  и TIC TAC THREE 1.0.0.exe (portable)
```

На Linux/Mac для Windows (нужен wine):
```bash
sudo apt install wine
npm run build:exe
```

### Собрать для всех платформ:
```bash
npm run build:exe:all
# создает:
# - win: .exe installer + portable
# - linux: .AppImage
```

Файлы появляются в папке `release/` или `dist/` (смотрит electron-builder).

### Структура для exe:
```
dist/
  index.html
  style.css
  main.js / audio.js / bg.js
  icon.png
electron-main.cjs
```

### Портативный вариант без установки:
Просто возьми `TIC TAC THREE 1.0.0.exe` (portable) — один файл, запускается где угодно, ничего не устанавливает.

---

## 🛠 Стек
- Vanilla JS, CSS vars для тем, Vite
- PeerJS 1.5.4
- Electron 30 + electron-builder 24
- Google Fonts: Syne, Space Grotesk, JetBrains Mono

## 🎮 Управление
- R — сброс раунда, N — следующий, M — mute
- Клик по дизайну/фигурам меняет на лету
- В режиме «Три фигуры» видишь, какая метка исчезнет

Хочешь деплой в 1 клик? Могу добавить `vercel.json` и GitHub Actions для автосборки exe.
