<div align="center">

<img src="public/lumina.svg" alt="Lumina Note Logo" width="120" height="120" />

# ✨ Lumina Note

**Local-first · AI-powered · Modern knowledge base**

Build your second brain with a Markdown note app deeply integrated with AI Agents.

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-Backend-dea584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square)](LICENSE)

[中文文档 / Chinese README](./README.md)

</div>

<br/>

---

## 🎯 What is Lumina Note?

Lumina Note is not just a Markdown editor – it is an **LLM-native knowledge workspace**:

- Local Markdown vault, Git-friendly
- Built-in multi-provider LLM client (8 providers)
- Full-featured Agent system with tools
- RAG semantic search on your own notes
- PDF reader + annotation system
- Dataview-style databases driven by YAML
- Bilibili video notes, voice notes, daily notes

---

## ✨ Core Features

### 📝 Immersive Editing

- **Three editor modes**: **Source / Live Preview / Reading**
- **WikiLinks**: `[[WikiLinks]]` to build a graph-like knowledge network
- **Beautiful formatting**: LaTeX math (KaTeX), Mermaid, Obsidian-style callouts `> [!info]`
- **Syntax highlighting**: CodeMirror 6 with hundreds of languages
- **Split view editor**:
  - Horizontal / vertical split
  - Draggable divider with live resize
  - **Active pane tracking**: the pane you clicked last becomes the target when opening files

### 🕸️ Knowledge Graph

- Canvas-based, high-performance visualization of your vault
- Folders shown as **spiky balls**, children inherit folder color
- `[[WikiLinks]]` automatically become edges between notes
- Right-click a node to open an **isolated view** (node + neighbors)
- Physics simulation for natural clustering & interactive dragging/zooming

### 🤖 AI Agent System

- **Multi-provider LLM support**:
  - Anthropic, OpenAI, Gemini, DeepSeek, Moonshot (Kimi), Groq, OpenRouter, Ollama (local)
- **Agent modes**: editor, organizer, researcher, writer
- **Tooling**: read/edit/create/move/search notes, database tools, RAG search, grep, etc.
- **Real-time edit preview**: animated diff playback inside the editor
- **RAG semantic search**: vector DB + optional reranker
- **AI floating ball**: draggable assistant that doesn’t break your flow
- **Voice input**: streaming STT with auto-stop and animation

### 🎬 Bilibili Video Notes

- Play Bilibili videos inside the app (Tauri multi-WebView)
- Send special-prefixed danmaku to create timestamped notes
- Click timestamps in notes to jump the video
- Notes are saved as Markdown and reloaded automatically next time

### 📄 PDF Intelligent Reader & Annotations

Optimized for academic and research workflows.

- **Interactive element detection**: detect text, images, tables, etc.
- **Annotation system**:
  - Highlight / underline selected text (5 colors)
  - Add textual notes to highlights
- **Annotation storage**:
  - Saved as pure Markdown files: `yourfile.pdf.annotations.md`
  - Lives next to the PDF, Git-friendly and editable in any editor
- **Bi-directional jumping**:
  - From PDF → annotation file
  - From annotation file → back to the exact PDF location via `lumina://pdf` links
  - **Ctrl+Click** opens the PDF in split view and jumps to the annotation
- **Thumbnails & outline**: page thumbnails and table-of-contents sidebar
- **Full-text search**: in-document search with highlight
- **AI integration**: send selected PDF content to AI for summarization/translation

### 🎨 Themes

- **15 built-in themes**, each with **light + dark** variants (30 looks in total)
- Themes affect headings/links/code/blockquote and 17+ Markdown elements
- Custom title bar that follows theme colors, with window controls
- All theme settings are managed in the **Settings panel** (bottom-left gear icon)

### 📊 Dataview-style Databases

- YAML frontmatter-driven: **notes are the source of truth**
- Table and Kanban views
- 7 column types: text, number, select, multi-select, date, checkbox, URL
- Database definitions stored as `.db.json` (structure only, no row data)
- File tree integration: database icons, click to open views
- Fully Git-friendly and plaintext-friendly

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Rust** ≥ 1.70
- npm or pnpm

### Install & Run

1. **Clone the repo**

```bash
git clone https://github.com/blueberrycongee/Lumina-Note.git
cd Lumina-Note
```

2. **Install dependencies**

```bash
npm install
# or
# pnpm install
```

3. **Run in dev mode**

```bash
npm run tauri dev
```

4. **Build production app**

```bash
npm run tauri build
```

### Optional: PDF element recognition backend

To enable advanced interactive PDF element selection:

1. Install Python deps (first time only):

```bash
cd scripts
pip install flask flask-cors pymupdf
```

2. Start the server:

```bash
python simple_pdf_server.py
```

The server runs at `http://localhost:8080`.

> Note: In the long term this Python service will be migrated to a Rust Tauri command so no extra runtime is required.

---

## 📖 Usage Guide

### 1. Choosing a Vault (Workspace)

- On first launch you will be asked to select a folder as your **vault**.
- ⚠️ **Important**: do **not** choose huge directories (like your entire `Documents` or home folder).
  - Too many files will slow down **indexing and RAG semantic search**.
  - Recommended: create a dedicated folder like `~/LuminaVault` or `~/Notes`.

### 2. Basic Editing

- **Create a note**: sidebar `+` button or `Ctrl+N`.
- **Switch editor mode** (buttons in the top-right of editor):
  - **Source** – raw Markdown
  - **Live Preview** – rendered view while typing (recommended)
  - **Reading** – clean reading view, no editing
- **WikiLinks**: type `[[` to link to other notes (with auto-complete).
- **Tags**: use `#tag` anywhere in the note; tags are indexed in the right sidebar.

### 3. Daily Quick Notes 📅

- Click the **calendar icon** in the sidebar.
- Creates a new Markdown file named like `Quick_2025-12-02_06-00.md`.
- Perfect for meeting notes, daily logs, and scratch ideas.

### 4. Voice Notes 🎤

- Click the **microphone icon** in the sidebar.
- Speech is transcribed live into the editor.
- Recording auto-stops after a few seconds of silence.
- Button shows an animated ripple while recording.
- Implemented with the browser’s Web Speech API – no extra install needed.

### 5. Knowledge Graph 🕸️

- Open via the sidebar graph icon or command palette.
- Interactions:
  - Click a node to open its note.
  - Drag nodes to reposition them.
  - Right-click a node to open an **isolated view** (only that node + neighbors).
  - Scroll to zoom in/out.
- Visual features:
  - Folders as **spiky balls**, auto-colored per folder.
  - Child notes inherit folder color.
  - `[[WikiLinks]]` become edges between notes.

### 6. Theme Settings 🎨

- Click the **gear icon** in the bottom-left to open **Settings**.
- Choose from **15 built-in themes**, each with light & dark mode.
- Quickly toggle light/dark via the **sun/moon icon** in the title bar.

### 7. Using the AI Assistant 

1. **Configure API keys**:
   - Open **Settings → AI Settings** (bottom-left gear icon)
   - Choose a provider and fill in your API key / base URL if needed
   - Click **Save**

2. **Supported providers (8)**:
   - Anthropic, OpenAI, Gemini, DeepSeek, Moonshot, Groq, OpenRouter, Ollama (local).

3. **Where you can use AI (all support Chat & Agent modes)**:
   - **Right-side AI panel**  
     Use the AI tab in the right sidebar to chat or run agents with the current note as context.
   - **Floating AI ball**  
     Enable in Settings. A draggable floating button appears; click it to open Chat / Agent anywhere without leaving your current view.
   - **Main-view AI mode (left ribbon button)**  
     Click the AI icon in the left ribbon to open a **full-screen AI view** in the main area – ideal for long conversations or complex Agent workflows.

4. **RAG semantic search**:
   - Turn on **RAG indexing** in Settings.
   - The Agent can then semantically search your whole vault to answer questions.
   - Note: the first indexing pass can be slow on very large vaults, so keep your workspace reasonably sized.

### 8. PDF Annotations

1. Open a PDF from the sidebar.
2. Select text to bring up the annotation toolbar.
3. Choose highlight color / underline or add a text note.
4. An annotation Markdown file `<pdfname>.annotations.md` is created/updated automatically.
5. In the annotation file, use the `[📍 Jump]` links:
   - Normal click: open PDF in the main pane and jump.
   - **Ctrl+Click**: open PDF in the split pane and jump.

### 9. Split View Editing

- Toggle split view via the editor toolbar.
- Click left/right pane to mark it as **active** (highlighted border).
- When split view is on, opening a file from the sidebar will open it in the active pane.
- Drag the divider to resize panes.

### 10. Dataview-style Database

- Define database structure in a `.db.json` file.
- Attach notes to a database via YAML frontmatter (`db: projects`).
- Use table or Kanban view to browse & edit; changes sync back into note YAML.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :------- | :----- |
| `Ctrl/Cmd + P` | Command palette |
| `Ctrl/Cmd + S` | Save current file |
| `Ctrl/Cmd + N` | New note |
| `Ctrl/Cmd + Shift + F` | Global search (semantic + keyword) |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + Click` | Open link in split pane |

---

## 🛠️ Architecture (High-level)

See the Chinese README or `docs/` for more implementation details. In short:

- **Frontend**: React 18 + TypeScript + Tailwind + Zustand + CodeMirror 6
- **Backend**: Tauri v2 + Rust commands for filesystem and vector DB
- **RAG**: SQLite-based vector store, multiple embedding backends, optional reranker

---

## 📄 License

Lumina Note is open-sourced under the [Apache 2.0 License](./LICENSE).
