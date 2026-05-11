# DubMux

Windows desktop utility for batch-adding external audio tracks to episodic video files with automatic episode matching and FFmpeg muxing.

## Current increment

This repository currently contains the first implementation slice:

- Tauri desktop shell
- React + TypeScript frontend
- Native folder picker
- Top-level folder scan through a Rust command
- Episode number extraction with built-in patterns and custom regex
- Preview table for matched, unmatched, and conflicting files

FFmpeg integration is intentionally deferred to the next increment.

## Prerequisites

- Node.js 20+
- Yarn Classic 1.x
- Rust stable with MSVC toolchain
- WebView2 Runtime on Windows

## Install

```powershell
yarn install
```

## Run in development

```powershell
yarn tauri dev
```

## Run tests

```powershell
yarn test
```

## First implementation notes

- Folder scan is top-level only for now.
- Supported video extensions: `.mkv`, `.mp4`, `.avi`
- Supported audio extensions: `.aac`, `.m4a`, `.mp3`, `.flac`, `.wav`, `.mka`
- Custom regex must expose the episode number in capture group 1.

# GreetingApp - C# WPF Application

Простое десктоп приложение на C# с использованием фреймворка WPF (Windows Presentation Foundation).

## Описание

Приложение отображает приветственное окно с русским текстом "Добро пожаловать!" и кнопкой для закрытия.

## Структура проекта

- `GreetingApp.csproj` - файл проекта с конфигурацией
- `App.xaml` / `App.xaml.cs` - главное приложение
- `MainWindow.xaml` / `MainWindow.xaml.cs` - главное окно с UI

## Требования

- **.NET 8.0 SDK** или выше
- **Visual Studio Code** с расширениями для C#
- Опционально: Visual Studio 2022

## Установка .NET SDK

Скачайте и установите .NET SDK с официального сайта:
https://dotnet.microsoft.com/download

## Компиляция и запуск

### Скомпилировать:

```bash
dotnet build
```

### Запустить:

```bash
dotnet run
```

## Рекомендуемые расширения для VS Code

- C# (powered by OmniSharp)
- C# Dev Kit
- XAML Styler

## Возможные улучшения

- Добавить больше элементов управления
- Создать диалоги и формы
- Добавить логику приложения
- Оформление и стили

---

Автор: Созданно с помощью GitHub Copilot
