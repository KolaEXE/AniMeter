import { loadCharacters } from "./characters.js";
import { buildRuler } from "./ruler.js";
import { AnimeHeightGame } from "./game.js";

const hub = document.querySelector("#hub");
const gameSection = document.querySelector("#game");
const startButton = document.querySelector("#start-button");
const characterCount = document.querySelector("#character-count");

let characters = [];

async function initialise() {
  characters = await loadCharacters();
  characterCount.textContent = `${characters.length} personnage${characters.length > 1 ? "s" : ""} disponible${characters.length > 1 ? "s" : ""}`;
  buildRuler(document.querySelector("#ruler"));
}

startButton.addEventListener("click", () => {
  hub.hidden = true;
  gameSection.hidden = false;
  const game = new AnimeHeightGame({
    stage: document.querySelector("#stage"),
    world: document.querySelector("#world"),
    layer: document.querySelector("#characters-layer"),
    ruler: document.querySelector("#ruler"),
    rulerLabels: document.querySelector("#ruler-labels"),
    dock: document.querySelector("#character-dock"),
    roundProgress: document.querySelector("#round-progress"),
    nextButton: document.querySelector("#next-character"),
    zoomLabel: document.querySelector("#zoom-label"),
    toast: document.querySelector("#toast"),
    alignmentGuide: document.querySelector("#alignment-guide")
  });
  game.start(characters);
});

document.querySelector("#zoom-in").addEventListener("click", () => {
  document.querySelector("#stage").dispatchEvent(new CustomEvent("zoom-control", { detail: 1 }));
});
document.querySelector("#zoom-out").addEventListener("click", () => {
  document.querySelector("#stage").dispatchEvent(new CustomEvent("zoom-control", { detail: -1 }));
});
document.querySelector("#center-view").addEventListener("click", () => {
  document.querySelector("#stage").dispatchEvent(new CustomEvent("center-view"));
});
document.querySelector("#reset-view").addEventListener("click", () => {
  document.querySelector("#stage").dispatchEvent(new CustomEvent("reset-view"));
});

initialise();
