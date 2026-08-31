# Neon Pong

Ping-Pong fürs Handy: Touch-Steuerung, drei Schwierigkeitsgrade, offline spielbar.
Läuft als PWA — auf iPhone und Android über „Zum Home-Bildschirm hinzufügen"
installierbar und danach im Vollbild ohne Browser-Leiste.

## Aufs Handy bekommen

1. Die Seite am Handy im Browser öffnen (gehostete URL oder `npm start` im gleichen WLAN).
2. **Android/Chrome:** Menü ⋮ → *App installieren*.
   **iPhone/Safari:** Teilen-Symbol → *Zum Home-Bildschirm*.
3. Das Icon liegt danach auf dem Homescreen, das Spiel startet im Vollbild und
   läuft auch ohne Internet (Service Worker cacht alles).

Alternativ: `dist/neon-pong.html` ist eine einzelne, komplett eigenständige Datei —
per AirDrop/Mail aufs Handy schicken und direkt öffnen.

## Spielen

- **Steuerung:** Finger irgendwo auf dem Feld ziehen, der Schläger folgt.
  Am Desktop: Maus oder ← / →.
- **Ziel:** Erster auf 7 Punkte, mit zwei Punkten Vorsprung.
- Wo der Ball den Schläger trifft, bestimmt den Winkel; ein bewegter Schläger
  gibt zusätzlich Effet mit.
- Der Ball wird mit jedem Schlag schneller, und ab dem 6. Schlag eines
  Ballwechsels schrumpfen **beide** Schläger — ein Ballwechsel endet also immer.
- Pause und Ton oben rechts. Ergebnisse und Bestleistung landen in `localStorage`.

## Schwierigkeitsgrade

Die Gegner-KI kennt die Flugbahn, sieht den Ball aber erst ab einer bestimmten
Feldhöhe (`aiSee`) — und je schneller der Ball, desto später (`aiFade`). Das ist
der eigentliche Regler: er entscheidet, wie viel Zeit der Schläger zum Laufen hat.

| Stufe  | Ballstart | KI-Tempo | Streuung | Sicht |
|--------|-----------|----------|----------|-------|
| Leicht | 500 px/s  | 430 px/s | ±80 px   | 40 %  |
| Normal | 560 px/s  | 620 px/s | ±44 px   | 70 %  |
| Schwer | 640 px/s  | 880 px/s | ±20 px   | 100 % |

## Entwicklung

```bash
npm start          # lokaler Server auf http://localhost:8099
npm run icons      # PWA-Icons neu erzeugen (reines Node, keine Abhängigkeiten)
npm run build      # dist/neon-pong.html + dist/artifact.html bauen
```

Keine Build-Kette, keine Dependencies: `index.html` lädt drei Skripte direkt.

```
index.html            Markup: Canvas, Menü-, Pause- und Ergebnis-Panel
css/style.css         Oberfläche (das Spielfeld selbst wird gezeichnet)
js/game.js            Spielfeld, Physik, Gegner-KI, Rendering
js/main.js            Eingabe, Screens, Speicherung, Render-Loop
js/audio.js           WebAudio-Töne, ohne Sounddateien
sw.js                 Offline-Cache — bei Asset-Änderungen CACHE hochzählen
tools/make-icons.mjs  erzeugt die PNG-Icons
tools/build-single.mjs bündelt alles in eine Datei
```

Das Spielfeld rechnet in festen Logikeinheiten (600 breit, Höhe passt sich dem
Seitenverhältnis an, 760–1500). Alle Positionen sind geräteunabhängig; nur beim
Zeichnen wird skaliert. Kollisionen laufen in Teilschritten von maximal 8 px,
damit auch der schnellste Ball keinen Schläger durchtunnelt.
