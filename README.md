# Trailglow

**Your life as a line of light.** An Obsidian plugin that turns your daily notes into a neon timeline: every day the line moves forward, and you decide whether to leave a mark on it.

> 🇮🇹 Italiano più sotto → [Italiano](#italiano)

<!-- TODO: add a screenshot or GIF of the neon line here, e.g. docs/screenshot.png -->

> [!NOTE]
> Trailglow is an early project (v0.4). The interface is currently in **Italian**; an English interface is on the roadmap.

---

## What it does

- **A neon line on a black background** that grows one day at a time.
- **One star, one colour, one wave.** Mark how the day went (Top, Good, So-so, Heavy). The line takes that colour and rises or dips. Heavy days dip *less* than good days rise (adjustable), so looking back at a dark period doesn't feel crushing.
- **Write only if you want.** No streaks, no guilt. An empty day is still life: the line just goes on, white.
- **Four zoom levels:** week, month, year, life. The further you zoom out, the smoother the wave becomes, showing the seasons of your life instead of single days.
- **Your past has a shape too.** On first launch you set your birth year and, if you want, answer a few general questions about past periods. You can also mark important years and important days (an engagement, a wedding, a birth, a loss). The remembered past is drawn fainter than the days you actually recorded.
- **Replies from the future.** The words you wrote on a past day stay as they were, but you can reply to the person you were then, dated today. On the life view each reply becomes an arc of light from that day to now.
- **The future (optional):** in the life view the line can continue as a dashed path ahead of you.

## Your data stays yours

- **Everything is plain Markdown in your vault.** No account, no server, no tracking.
- Each day is a normal note named `YYYY-MM-DD.md`. You can read, edit, sync and back it up with any tool, with or without Trailglow.
- Uninstalling the plugin removes the view, **not your notes**.

## How a day is stored

```markdown
---
mood: bella
evento: The day we got engaged
---

Text you wrote that day.

## Risposte dal futuro

### 2026-11-09
What you replied later, dated the day you wrote it.
```

| Field | Meaning | Values |
|---|---|---|
| `mood` | How the day went | `top`, `bella`, `cosi`, `pesante` (also accepted: `great`/`good`/`meh`/`bad`, or `4`…`1`) |
| `evento` | Marks an important day (shown as a bright dot on the life view) | any text |
| body | Your note for that day | free text |
| `## Risposte dal futuro` | Replies to that day, one `### YYYY-MM-DD` heading each | free text |

The general questions about your past (chapters) and the important periods are stored in the plugin's settings file (`.obsidian/plugins/trailglow/data.json`).

### Where notes are saved

You choose the folder name during setup (and can change it any time). By default days are also split by year and month:

```
<your folder>/
  2026/
    11/
      2026-11-09.md
```

Trailglow only reads daily notes inside that folder and its subfolders.

---

## Installation

### Manual (for now)

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest).
2. In your vault, open the hidden folder `.obsidian/plugins/` and create a folder named `trailglow`.
3. Put the three files inside it.
4. In Obsidian: **Settings → Community plugins** → turn on community plugins → reload the list → enable **Trailglow**.

> Tip: try it first in a new, empty vault.

### Obsidian community store

Not available yet. Once the plugin is approved it will be installable directly from **Settings → Community plugins → Browse**.

---

## Getting started

Open Trailglow from the ribbon icon (the pulse icon) or with `Ctrl/Cmd + P` → **Trailglow: Apri la linea**. The first time, a short setup starts:

1. **Birth year** — sets where your line begins.
2. **Folder** — where your days will be saved. Name it whatever you like, or pick an existing folder. Choose whether to split by year and month.
3. **Your past** — leave it blank and start from today, or give it a shape with one question per life period (*"Looking back now, how was that time?"*). Every answer is optional.
4. **Important periods and days** (optional) — add ranges of years and single days that stood out. For days that can't be judged, use **"Segna e basta"**: the day is marked on the line without a colour.

## Everyday use

- **"Com'è andata oggi?"** (How did today go?) opens today's page: pick a star, write if you want.
- **Tap any day on the line** to open its page:
  - an empty past day lets you add a memory;
  - a past day you already wrote on is **locked** and shows **Risposte dal futuro**, where you can reply to yourself.
- **Life view:** toggle the future, open **Modella il passato** (shape your past) to edit periods and important days.
- **↺** (top right) restarts the setup without touching your notes.

### Commands

| Command | What it does |
|---|---|
| Trailglow: Apri la linea | Opens the view |
| Trailglow: Com'è andata oggi? | Opens today's page |
| Trailglow: Metti in ordine le giornate | Moves daily notes left outside the diary folder (or not in the right year/month subfolder) into place |
| Trailglow: Crea dati di prova | Creates 120 days of sample notes in a `Trailglow demo` subfolder, to try the plugin |

### Settings

| Setting | Description |
|---|---|
| Cartella del diario | Your diary folder. If you rename it, Trailglow offers to move your days from the old one. |
| Dividi per anno e mese | Save days as `folder/YYYY/MM/YYYY-MM-DD.md` |
| Quanto scendono i giorni pesanti | How much heavy days dip (0 = never, 1 = as much as good days rise) |
| Rifai l'inizio | Restart the setup. Notes are not touched. |

---

## FAQ

**Can I use my existing daily notes?** Yes. Point the diary folder to where they are (any note named `YYYY-MM-DD.md` inside it) and add `mood:` to the frontmatter of the days you want to colour.

**Does it work on mobile?** It's built to work on Obsidian mobile too, but it has mainly been tested on desktop so far.

**What if I rename or move my folder?** Change it in the settings: Trailglow asks whether to move your days. Obsidian updates links automatically.

**Is it a therapy app?** No. It's a place to look back at your life. If you're going through a hard time, please talk to someone you trust or a professional.

## Roadmap

- English interface (and language choice)
- Store chapters and periods in a Markdown file inside the vault, for full portability
- Optional encryption of the diary folder
- Drawing your past by hand on the line
- Customisable colours

## Contributing

Issues and pull requests are welcome. Please describe what you expected and what happened, with your Obsidian version and OS.

## License

[MIT](LICENSE)

---

## Italiano

**La tua vita come una linea di luce.** Un plugin per Obsidian che trasforma le note giornaliere in una linea temporale neon: ogni giorno la linea va avanti, e tu decidi se lasciarci un segno.

### Cosa fa
- Una linea neon su sfondo nero che avanza un giorno alla volta.
- Una stellina per com'è andata (Top, Bella, Così così, Pesante): la linea prende quel colore e sale o scende come un'onda. I giorni pesanti scendono meno di quanto salgono quelli belli.
- Scrivi solo se vuoi: niente serie, niente sensi di colpa. Il giorno vuoto è comunque vita.
- Quattro zoom: settimana, mese, anno, vita.
- Il passato ha una forma: anno di nascita, domande generali sui periodi della vita, periodi e giorni importanti ("Segna e basta" per i giorni che non si giudicano). Il passato ricordato è più tenue di quello vissuto.
- Risposte dal futuro: le parole di un giorno passato restano com'erano, ma puoi rispondere al te di allora. Nella vista Vita diventano archi di luce.

### I tuoi dati
Tutto è Markdown nel tuo vault: nessun account, nessun server. Ogni giornata è una nota `YYYY-MM-DD.md` (vedi la tabella dei campi sopra). Disinstallando il plugin le note restano.

### Installazione
1. Scarica `main.js`, `manifest.json` e `styles.css` dall'ultima release.
2. Nel vault apri la cartella nascosta `.obsidian/plugins/` e crea una cartella `trailglow`.
3. Copia dentro i tre file.
4. In Obsidian: Impostazioni → Plugin della community → attivali → ricarica → attiva **Trailglow**.

### Primo avvio
Anno di nascita → cartella dove salvare le giornate (nome libero, o una cartella che hai già) → passato bianco oppure qualche domanda → se vuoi, periodi e giorni importanti.

### Uso
- **"Com'è andata oggi?"** apre la pagina di oggi.
- **Tocca un giorno** sulla linea per aprirlo: nei giorni passati già scritti trovi le **Risposte dal futuro**.
- **Vista Vita:** futuro on/off e **Modella il passato**.
- **↺** rifà l'inizio senza toccare le note.
- **Metti in ordine le giornate** (comando o impostazioni) sposta nel diario le note rimaste fuori.

### Licenza
[MIT](LICENSE)
