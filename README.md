# Kind's agent

A local desktop app that connects to WhatsApp on the user's own computer, stores chats locally, and creates summaries.

## Goal
This build is meant for normal friends, not developers. The final delivery should be an installer or portable app, so the user can double-click and use it.

## User experience target
- User downloads installer or portable build
- User opens app
- User clicks **Connect WhatsApp**
- User scans QR
- User clicks a chat
- User gets a summary

## Build for GUI installation
After dependencies are installed once by the app builder, create end-user distributables:
- `npm run dist:win` for Windows installer + portable EXE
- `npm run dist:mac` for macOS DMG
- `npm run dist:linux` for Linux AppImage

Electron packaging guidance recommends using packaging/distribution tooling like Electron Forge or electron-builder to produce installable distributables for end users, including installers such as DMG and NSIS. The electron-builder docs specifically note default targets like DMG on macOS and NSIS on Windows. [web:170][web:163][web:172]

## Important note
This repo is the source project. Your friend should not run commands. You should build the installer once, then send your friend the generated installer file.


## macOS build
To create a Mac installer, build a **DMG** target. electron-builder supports `dmg` as a macOS target, and its macOS docs show `electron-builder --mac dmg` as the direct build command. [web:177][web:178][web:187]

In this project, the packaged script is:
- `npm run dist:mac`

That produces a DMG you can send to your friend so they can install the app through a normal macOS GUI flow instead of using terminal commands. Packaging docs for Electron apps describe OS-specific packaged outputs such as DMG on macOS. [web:170][web:190]


## Switchable summary backends
The app now supports three summary backends in settings: OpenAI, LM Studio, and Ollama. LM Studio exposes an OpenAI-compatible local server on localhost, while Ollama exposes a local chat API and supports structured outputs through its chat endpoint. [web:193][web:194][web:198][web:207]


## Guided setup and discovery
The app now includes a first-run wizard, backend connection testing, and model discovery. LM Studio exposes model listing endpoints such as `GET /api/v0/models`, and newer LM Studio docs also describe `/api/v1/models`. Ollama exposes `GET /api/tags` to list installed local models. These endpoints are used to help the user discover usable local models from the GUI. [web:209][web:210][web:214][web:207]


## Polished Mac setup
The app now includes backend status badges, setup presets, and guidance for a DMG-style Mac install experience. electron-builder supports DMG as a macOS target, which is the normal GUI installer flow for Mac users. [web:177][web:178]


## Secure local OpenAI key entry
The app now supports local OpenAI key entry without storing the secret in normal settings. Electron's `safeStorage` encrypts strings using OS-backed protection, and on macOS the encryption availability is tied to Keychain availability. OpenAI's API key safety guidance says keys should never be deployed in client-side apps or bundled into installers, so the app now uses a local secure-entry flow instead of embedding a key. [web:244][web:246][web:225]
