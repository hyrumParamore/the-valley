# The Valley — Web Prototype

A web-based build of the 30-day MVP vertical slice from the original design docs
(`TheValley_GameDesignDoc.docx`, `TheValley_TechArchitecture.docx`,
`TheValley_MVP_Checklist.md`). Pure HTML5 Canvas + WebAudio — no engine, no
assets, no build step. All art and sound are generated in code.

## Play

Open `index.html` in any modern browser (double-click works), or serve the
folder for best results:

```
cd the-valley-web && python3 -m http.server 8080
```

**Controls:** WASD / arrows to move · E to interact · M to mute · Shift+N to start a new valley

## The loop (3–5 minute vertical slice)

1. Wake at the camp in a dark, silent valley. Walk north to the dormant ancient structure.
2. Follow the dry channel west into the spring cavern. Awaken the spring — water
   flows back along the aqueduct to the structure's basin. **First restoration:**
   the lower windows light, and rubble shifts in the north.
3. North, behind the structure, awaken the upper falls — the old cistern fills
   and a waterfall cascades down the structure's face. The mural lights, fireflies
   return, and the bramble withers in the east.
4. East in the garden terrace, awaken the last spring. Its water powers the
   **watermill** on the way home (craft stone bricks there to rebuild the plaza
   fountain). Full restoration — the valley breathes again.

## Architecture (ported from the Godot tech doc)

| Godot design | Web implementation |
|---|---|
| EventBus autoload | `js/eventbus.js` — same signal names |
| ResourceFlowManager (tick-based, 0.5s) | `js/flow.js` — flow math has zero rendering dependency |
| CanvasModulate + PointLight2D | `js/main.js` lighting pass — ambient darkness + punched radial lights, warms with restoration |
| .tres data / tilesets | `js/tiles.js` — procedural seeded pixel tiles |
| AudioManager (layers, crossfade) | `js/audio.js` — synthesized wind / hum / water, proximity-mixed, generative music after stage 1 |
| SaveManager (versioned JSON) | localStorage, version-numbered |

Optional: drop the cover art into the folder as `cover.png` and the title
screen will use it.
