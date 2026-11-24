import { GROUND_Y, PX_PER_CM, WORLD_HEIGHT_CM, WORLD_HEIGHT_PX } from "./ruler.js";

const INITIAL_HEIGHT_CM = 200;
const MIN_HEIGHT_CM = 1;
const MIN_GAP_PX = 8;
const CONTROL_WIDTH_PX = 340;
const BASE_CHARACTER_HEIGHT_PX = 200;
const MIN_ZOOM = 0.0001;
const MAX_ZOOM = 22;
const MAX_RENDERED_SCREEN_PX = 800;
const UNIT_TO_CM = { cm: 1, m: 100, km: 100000 };
const FALLBACK_CHARACTER_IMAGE = "assets/characters/char-default.png";
const MAX_CAMERA_OFFSET_PX = 16000000;

export class AnimeHeightGame {
  constructor(elements) {
    this.stage = elements.stage;
    this.world = elements.world;
    this.layer = elements.layer;
    this.zoomLabel = elements.zoomLabel;
    this.toast = elements.toast;
    this.alignmentGuide = elements.alignmentGuide;
    this.ruler = elements.ruler;
    this.rulerLabels = elements.rulerLabels;
    this.dock = elements.dock;
    this.roundProgress = elements.roundProgress;
    this.nextButton = elements.nextButton;
    this.layoutOriginX = 350;
    this.zoom = 0.3;
    this.camera = { x: 0, y: 0 };
    this.cards = [];
    this.characters = [];
    this.activeCharacterIndex = 0;
    this.currentState = null;
    this.focusedCharacter = null;
    this.cameraAnimationFrame = null;
  }

  start(characters) {
    this.characters = characters;
    this.world.style.height = "0px";
    const stageHeight = this.stage.clientHeight;
    this.zoom = Math.max(0.16, Math.min(2.2, (stageHeight - 220) / (INITIAL_HEIGHT_CM * PX_PER_CM)));
    this.initialZoom = this.zoom;
    this.layer.replaceChildren();
    this.cards = [];
    this.activeCharacterIndex = 0;
    this.nextButton.hidden = true;
    this.nextButton.disabled = true;
    this.nextButton.addEventListener("click", () => this.advanceCharacter());
    this.roundProgress.textContent = `1 / ${characters.length}`;
    this.currentState = this.createCard(characters[0]);
    this.cards.push(this.currentState);
    this.layoutCards();
    this.bindViewControls();
    this.resetView();
  }

  advanceCharacter() {
    if (!this.currentState?.locked || this.activeCharacterIndex >= this.characters.length - 1) return;

    this.activeCharacterIndex += 1;
    this.roundProgress.textContent = `${this.activeCharacterIndex + 1} / ${this.characters.length}`;
    this.nextButton.hidden = true;
    this.nextButton.disabled = true;

    const state = this.createCard(this.characters[this.activeCharacterIndex]);
    const rightEdge = Math.max(...this.cards.map((card) => card.x + card.widthPx));
    state.x = rightEdge + MIN_GAP_PX / this.initialZoom;
    this.cards.push(state);
    this.currentState = state;
    this.layoutCards();
    this.dock.scrollTo({ left: this.dock.scrollWidth, behavior: "smooth" });
    this.centerOnCharacter(state);
  }

  createCard(character) {
    const card = document.createElement("article");
    card.className = "character-card";
    card.dataset.id = character.id;
    card.dataset.locked = "false";

    const visual = document.createElement("div");
    visual.className = "character-visual";

    const image = document.createElement("img");
    image.className = "character-image";
    image.alt = character.name;
    image.draggable = false;
    const characterImage = /\.png(?:$|[?#])/i.test(character.image)
      ? character.image
      : FALLBACK_CHARACTER_IMAGE;
    image.src = characterImage;

    const silhouette = document.createElement("img");
    silhouette.className = "character-silhouette";
    silhouette.alt = "";
    silhouette.draggable = false;
    silhouette.src = characterImage;
    silhouette.setAttribute("aria-hidden", "true");

    const placeholder = document.createElement("div");
    placeholder.className = "character-placeholder";
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", `Silhouette de ${character.name}`);
    placeholder.hidden = true;

    visual.append(image, silhouette, placeholder);

    const controls = document.createElement("div");
    controls.className = "character-controls";
    controls.innerHTML = `
      <button type="button" class="character-name">${this.escapeHtml(character.name)}</button>
      <div class="estimate-row">
        <button type="button" class="size-minus" aria-label="Rétrécir ${this.escapeHtml(character.name)}">−</button>
        <div class="estimate-field">
          <input class="estimate-input" type="number" min="1" step="any" value="${INITIAL_HEIGHT_CM}" aria-label="Hauteur estimée pour ${this.escapeHtml(character.name)}">
          <button type="button" class="estimate-unit" aria-label="Changer l'unité pour ${this.escapeHtml(character.name)}">cm</button>
        </div>
        <button type="button" class="size-plus" aria-label="Agrandir ${this.escapeHtml(character.name)}">+</button>
      </div>
      <button type="button" class="validate-button">Valider</button>
    `;
    card.append(visual);
    this.layer.append(card);
    this.dock.append(controls);

    const state = {
      character,
      card,
      visual,
      image,
      silhouette,
      placeholder,
      controls,
      estimateCm: INITIAL_HEIGHT_CM,
      estimateUnit: "cm",
      heightPx: INITIAL_HEIGHT_CM * PX_PER_CM,
      x: 0,
      widthPx: 0,
      y: GROUND_Y - INITIAL_HEIGHT_CM * PX_PER_CM,
      imageRatio: null,
      dragging: false,
      locked: false,
        suppressNameClick: false,
        isVisuallyCapped: false
    };

    const handleImageError = (event) => {
      const failedImage = event.currentTarget;
      if (failedImage.dataset.fallback !== "true") {
        failedImage.dataset.fallback = "true";
        failedImage.src = FALLBACK_CHARACTER_IMAGE;
        return;
      }
      image.hidden = true;
      silhouette.hidden = true;
      placeholder.hidden = false;
    };
    image.addEventListener("error", handleImageError);
    silhouette.addEventListener("error", handleImageError);

    image.addEventListener("load", () => {
      if (image.naturalHeight > 0) state.imageRatio = image.naturalWidth / image.naturalHeight;
      this.applyCardHeight(state);
      this.layoutCards();
    });
    silhouette.addEventListener("load", () => {
      if (silhouette.naturalHeight > 0) state.imageRatio = silhouette.naturalWidth / silhouette.naturalHeight;
      this.applyCardHeight(state);
      this.layoutCards();
    });

    this.bindCardInteractions(state);
    this.updateCard(state);
    return state;
  }

  bindCardInteractions(state) {
    const minus = state.controls.querySelector(".size-minus");
    const plus = state.controls.querySelector(".size-plus");
    const estimateInput = state.controls.querySelector(".estimate-input");
    const estimateUnit = state.controls.querySelector(".estimate-unit");
    const validate = state.controls.querySelector(".validate-button");
    const name = state.controls.querySelector(".character-name");

    name.addEventListener("click", () => {
      if (state.suppressNameClick) {
        state.suppressNameClick = false;
        return;
      }
      this.centerOnCharacter(state);
    });
    minus.addEventListener("click", () => this.changeEstimate(
      state,
      state.estimateCm / UNIT_TO_CM[state.estimateUnit] - 1
    ));
    plus.addEventListener("click", () => this.changeEstimate(
      state,
      state.estimateCm / UNIT_TO_CM[state.estimateUnit] + 1
    ));
    estimateInput.addEventListener("change", () => this.changeEstimate(state, estimateInput.value));
    estimateUnit.addEventListener("click", () => {
      const units = Object.keys(UNIT_TO_CM);
      state.estimateUnit = units[(units.indexOf(state.estimateUnit) + 1) % units.length];
      this.updateCard(state);
    });

    validate.addEventListener("click", () => this.validateCard(state));
    this.bindDockReordering(state, name);

    state.card.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".character-controls")) return;
      event.preventDefault();
      this.cancelCameraAnimation();
      state.dragging = true;
      state.card.classList.add("dragging");
      const startX = event.clientX;
      const startWorldX = state.x;
      state.card.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        const nextX = startWorldX + (moveEvent.clientX - startX) / this.zoom;
        const maxX = Math.max(40, MAX_CAMERA_OFFSET_PX - state.widthPx);
        state.x = Math.min(maxX, Math.max(40, nextX));
        this.updateCard(state);
        this.showAlignmentGuide(state);
      };
      const end = () => {
        state.dragging = false;
        state.card.classList.remove("dragging");
        this.hideAlignmentGuide();
        state.card.removeEventListener("pointermove", move);
        state.card.removeEventListener("pointerup", end);
        state.card.removeEventListener("pointercancel", end);
        this.finishCardDrag(state);
      };
      state.card.addEventListener("pointermove", move);
      state.card.addEventListener("pointerup", end);
      state.card.addEventListener("pointercancel", end);
    });

  }

  changeEstimate(state, value) {
    if (state.locked) return;
    const numericValue = Number(value);
    const estimateCm = numericValue * UNIT_TO_CM[state.estimateUnit];
    if (!Number.isFinite(estimateCm) || estimateCm < MIN_HEIGHT_CM
      || estimateCm > Number.MAX_VALUE / PX_PER_CM) {
      this.updateCard(state);
      this.showToast("Entre une taille positive et finie.");
      return;
    }

    const wasVisuallyCapped = state.isVisuallyCapped;
    state.estimateCm = Math.max(MIN_HEIGHT_CM, Math.round(estimateCm));
    state.heightPx = Math.min(state.estimateCm * PX_PER_CM, WORLD_HEIGHT_PX);
    state.y = GROUND_Y - state.heightPx;
    state.isVisuallyCapped = state.estimateCm * PX_PER_CM > WORLD_HEIGHT_PX;
    this.refreshCardWidth(state);
    this.updateCard(state);
    this.layoutCards();
    if (state.isVisuallyCapped && !wasVisuallyCapped) {
      this.showToast("La valeur est conservée; l’affichage est limité à 50 km.");
    }
  }

  updateCard(state) {
    const imageRatio = state.imageRatio || 0.46;
    const renderedWidthPx = state.heightPx * imageRatio;
    const baseWidthPx = BASE_CHARACTER_HEIGHT_PX * imageRatio;
    state.card.style.left = `${state.x + (state.widthPx - renderedWidthPx) / 2}px`;
    state.card.style.top = `${-BASE_CHARACTER_HEIGHT_PX}px`;
    state.card.style.width = `${baseWidthPx}px`;
    state.card.style.setProperty("--ui-scale", String(this.controlScale()));
    state.visual.style.width = `${baseWidthPx}px`;
    state.visual.style.height = `${BASE_CHARACTER_HEIGHT_PX}px`;
    state.visual.style.transform = `scale(${state.heightPx / BASE_CHARACTER_HEIGHT_PX})`;
    state.controls.style.top = `${state.heightPx + 8}px`;

    const value = state.controls.querySelector(".estimate-input");
    value.value = String(state.estimateCm / UNIT_TO_CM[state.estimateUnit]);
    value.min = String(MIN_HEIGHT_CM / UNIT_TO_CM[state.estimateUnit]);
    value.setAttribute("aria-label", `Hauteur estimée en ${state.estimateUnit} pour ${state.character.name}`);
    const unit = state.controls.querySelector(".estimate-unit");
    unit.textContent = state.estimateUnit;
    unit.setAttribute("aria-label", `Unité ${state.estimateUnit} pour ${state.character.name}. Cliquer pour changer.`);

    this.applyCardHeight(state);
  }

  applyCardHeight(state) {
    state.image.style.height = `${BASE_CHARACTER_HEIGHT_PX}px`;
    state.image.style.width = "auto";
    state.silhouette.style.height = `${BASE_CHARACTER_HEIGHT_PX}px`;
    state.silhouette.style.width = "auto";
    state.placeholder.style.height = `${BASE_CHARACTER_HEIGHT_PX}px`;
    state.placeholder.style.width = `${BASE_CHARACTER_HEIGHT_PX * 0.46}px`;
    if (state.locked) {
      const actualHeightPx = Math.min(state.character.height * PX_PER_CM, WORLD_HEIGHT_PX);
      state.silhouette.style.transform =
        `translateX(-50%) scale(${actualHeightPx / Math.max(state.heightPx, 1)})`;
    } else {
      state.silhouette.style.removeProperty("transform");
    }
    this.refreshCardWidth(state);
  }

  refreshCardWidth(state) {
    const maxFigureHeight = Math.max(
      state.heightPx,
      state.locked ? state.character.height * PX_PER_CM : 0
    );
    const figureWidth = maxFigureHeight * (state.imageRatio || 0.46);
    state.widthPx = Math.max(CONTROL_WIDTH_PX / this.initialZoom, figureWidth);
  }

  controlScale() {
    return Math.min(1 / this.zoom, 1 / this.initialZoom);
  }

  maxZoom() {
    let extent = 5000;
    let tallestCharacter = 1;
    for (const state of this.cards) {
      extent = Math.max(extent, state.x + state.widthPx, state.heightPx);
      tallestCharacter = Math.max(tallestCharacter, state.heightPx);
    }
    return Math.max(MIN_ZOOM, Math.min(
      MAX_ZOOM,
      MAX_CAMERA_OFFSET_PX / extent,
      MAX_RENDERED_SCREEN_PX / tallestCharacter
    ));
  }

  layoutCards() {
    if (!this.cards.length) return;

    for (const state of this.cards) this.refreshCardWidth(state);
    const ordered = [...this.cards].sort((a, b) => a.x - b.x);
    let nextX = this.layoutOriginX;

    for (const state of ordered) {
      state.x = nextX;
      this.updateCard(state);
      nextX = state.x + state.widthPx + MIN_GAP_PX / this.initialZoom;
    }

    if (this.zoom > this.maxZoom()) {
      this.zoomAt(
        this.stage.clientWidth / 2,
        this.stage.clientHeight / 2,
        this.maxZoom() / this.zoom
      );
    }
  }

  finishCardDrag(state) {
    const ordered = this.cards
      .filter((card) => card !== state)
      .sort((a, b) => a.x - b.x);
    const centerX = state.x + state.widthPx / 2;
    const insertionIndex = ordered.findIndex((card) => centerX < card.x + card.widthPx / 2);
    ordered.splice(insertionIndex < 0 ? ordered.length : insertionIndex, 0, state);

    this.applyCardOrder(ordered);
  }

  applyCardOrder(ordered) {
    const beforeCards = this.captureRects(this.cards.map((card) => card.card));
    const beforeDock = this.captureRects(this.cards.map((card) => card.controls));
    let nextX = this.layoutOriginX;
    for (const card of ordered) {
      card.x = nextX;
      nextX += card.widthPx + MIN_GAP_PX / this.initialZoom;
    }
    this.layoutCards();
    this.reorderDock();
    this.animatePositions(this.cards.map((card) => card.card), beforeCards, this.zoom);
    this.animatePositions(this.cards.map((card) => card.controls), beforeDock, 1);
  }

  captureRects(elements) {
    return new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
  }

  animatePositions(elements, beforeRects, coordinateScale) {
    for (const element of elements) {
      const before = beforeRects.get(element);
      const after = element.getBoundingClientRect();
      const deltaX = (before.left - after.left) / coordinateScale;
      const deltaY = (before.top - after.top) / coordinateScale;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

      element.style.transition = "none";
      element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      element.getBoundingClientRect();
      requestAnimationFrame(() => {
        element.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
        element.style.transform = "translate(0, 0)";
      });

      const finish = (event) => {
        if (event.propertyName !== "transform") return;
        element.style.removeProperty("transition");
        element.style.removeProperty("transform");
        element.removeEventListener("transitionend", finish);
      };
      element.addEventListener("transitionend", finish);
    }
  }

  bindDockReordering(state, handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const controlRect = state.controls.getBoundingClientRect();
      const grabOffsetX = startX - controlRect.left;
      const grabOffsetY = startY - controlRect.top;
      let dragged = false;
      let ghost = null;
      handle.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 8) return;
        moveEvent.preventDefault();
        if (!dragged) {
          state.controls.classList.add("dock-drag-source");
          ghost = state.controls.cloneNode(true);
          ghost.classList.add("dock-drag-ghost");
          ghost.style.width = `${controlRect.width}px`;
          ghost.style.position = "fixed";
          ghost.style.left = `${moveEvent.clientX - grabOffsetX}px`;
          ghost.style.top = `${moveEvent.clientY - grabOffsetY}px`;
          ghost.style.transform = "none";
          ghost.style.margin = "0";
          ghost.style.zIndex = "1000";
          ghost.style.pointerEvents = "none";
          ghost.style.transition = "none";
          document.body.append(ghost);
        }
        dragged = true;
        ghost.style.left = `${moveEvent.clientX - grabOffsetX}px`;
        ghost.style.top = `${moveEvent.clientY - grabOffsetY}px`;

        let closestCard = null;
        let closestDistance = Number.POSITIVE_INFINITY;
        for (const card of this.cards) {
          card.controls.classList.remove("dock-drop-target");
          if (card === state) continue;
          const rect = card.controls.getBoundingClientRect();
          const distance = Math.hypot(
            moveEvent.clientX - (rect.left + rect.width / 2),
            moveEvent.clientY - (rect.top + rect.height / 2)
          );
          if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
          }
        }
        if (closestCard) closestCard.controls.classList.add("dock-drop-target");
      };
      const end = (endEvent) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        state.controls.classList.remove("dock-drag-source");
        this.cards.forEach((card) => card.controls.classList.remove("dock-drop-target"));
        if (ghost) ghost.remove();

        if (dragged) {
          state.suppressNameClick = true;
          if (endEvent.type === "pointerup") {
            this.finishDockDrag(state, endEvent.clientX, endEvent.clientY);
          }
          setTimeout(() => { state.suppressNameClick = false; }, 0);
        }
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }

  finishDockDrag(state, clientX, clientY) {
    const ordered = this.cards
      .filter((card) => card !== state)
      .sort((a, b) => a.x - b.x);
    const insertionIndex = ordered.findIndex((card) => {
      const rect = card.controls.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      if (clientY < centerY - rect.height / 2) return true;
      if (clientY > centerY + rect.height / 2) return false;
      return clientX < rect.left + rect.width / 2;
    });
    ordered.splice(insertionIndex < 0 ? ordered.length : insertionIndex, 0, state);
    this.applyCardOrder(ordered);
  }

  reorderDock() {
    this.cards.slice().sort((a, b) => a.x - b.x)
      .forEach((state) => this.dock.append(state.controls));
  }

  showAlignmentGuide(state) {
    const screenX = this.camera.x + (state.x + state.widthPx / 2) * this.zoom;
    this.alignmentGuide.style.left = `${screenX}px`;
    this.alignmentGuide.hidden = false;
  }

  hideAlignmentGuide() {
    this.alignmentGuide.hidden = true;
  }

  validateCard(state) {
    if (state.locked) return;
    state.locked = true;
    state.card.dataset.locked = "true";
    state.card.classList.add("validated");

    const realCm = state.character.height;
    const difference = state.estimateCm - realCm;
    const absoluteDifference = Math.abs(difference);
    const tone = absoluteDifference <= 3 ? "good" : absoluteDifference <= 8 ? "fair" : "poor";
    const label = absoluteDifference <= 3 ? "Excellent" : absoluteDifference <= 8 ? "Presque" : "Différence";
    const displayedDifference = difference > 0 ? `+${difference}` : String(difference);
    state.card.classList.toggle("actual-in-front", realCm < state.estimateCm);

    const result = document.createElement("div");
    result.className = "result";
    result.innerHTML = `
      <div class="result-item">Estimation<strong>${state.estimateCm} cm</strong></div>
      <div class="result-item">Réelle<strong>${realCm} cm</strong></div>
      <div class="result-item ${tone}">${label}<strong>${label === "Différence" ? displayedDifference : absoluteDifference} cm</strong></div>
    `;
    state.controls.querySelector(".validate-button").textContent = "Validé";
    state.controls.querySelector(".validate-button").disabled = true;
    state.controls.querySelector(".estimate-input").disabled = true;
    state.controls.querySelector(".estimate-unit").disabled = true;
    state.controls.querySelector(".size-minus").disabled = true;
    state.controls.querySelector(".size-plus").disabled = true;
    state.controls.append(result);
    this.layoutCards();
    const hasNextCharacter = this.activeCharacterIndex < this.characters.length - 1;
    this.showToast(
      `${state.character.name} : vraie taille ${realCm} cm${hasNextCharacter ? "" : " — Partie terminée."}`
    );
    if (hasNextCharacter) {
      this.nextButton.hidden = false;
      this.nextButton.disabled = false;
    }
    this.alignGround();
  }

  bindViewControls() {
    this.stage.addEventListener("wheel", (event) => {
      if (this.dock.contains(event.target)) {
        event.preventDefault();
        this.dock.scrollLeft += event.deltaX || event.deltaY;
        return;
      }

      event.preventDefault();
      const cardElement = event.target.closest(".character-card");
      const state = cardElement ? this.cards.find((card) => card.card === cardElement) : null;
      if (event.shiftKey && state && !state.locked) {
        this.changeEstimate(state, state.estimateCm + (event.deltaY < 0 ? 1 : -1));
        return;
      }
      this.zoomAt(
        event.clientX - this.stage.getBoundingClientRect().left,
        event.clientY - this.stage.getBoundingClientRect().top,
        event.deltaY < 0
          ? (this.zoom < 0.08 ? 1.35 : 1.12)
          : 1 / (this.zoom < 0.08 ? 1.35 : 1.12)
      );
    }, { passive: false });

    this.stage.addEventListener("pointerdown", (event) => {
      if (event.target !== this.stage && event.target !== this.world && event.target !== this.layer) return;
      event.preventDefault();
      this.cancelCameraAnimation();
      this.stage.classList.add("panning");
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const startCamera = { ...this.camera };
      this.stage.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        this.camera.x = startCamera.x + moveEvent.clientX - startClientX;
        this.camera.y = startCamera.y + moveEvent.clientY - startClientY;
        this.applyCamera();
      };
      const end = () => {
        this.stage.classList.remove("panning");
        this.stage.removeEventListener("pointermove", move);
        this.stage.removeEventListener("pointerup", end);
        this.stage.removeEventListener("pointercancel", end);
      };
      this.stage.addEventListener("pointermove", move);
      this.stage.addEventListener("pointerup", end);
      this.stage.addEventListener("pointercancel", end);
    });

    this.stage.addEventListener("zoom-control", (event) => {
      const rect = this.stage.getBoundingClientRect();
      const step = this.zoom < 0.08 ? 1.35 : 1.18;
      const focusedY = this.focusedCharacter
        ? this.camera.y + (this.focusedCharacter.y - GROUND_Y + this.focusedCharacter.heightPx / 2) * this.zoom
        : this.floorScreenY();
      this.zoomAt(rect.width / 2, focusedY, event.detail > 0 ? step : 1 / step);
    });
    this.stage.addEventListener("center-view", () => this.centerView());
    this.stage.addEventListener("reset-view", () => this.resetView());
  }

  zoomAt(screenX, screenY, factor) {
    this.cancelCameraAnimation();
    const nextZoom = Math.max(MIN_ZOOM, Math.min(this.maxZoom(), this.zoom * factor));
    const worldX = (screenX - this.camera.x) / this.zoom;
    const worldY = (screenY - this.camera.y) / this.zoom;
    this.camera.x = screenX - worldX * nextZoom;
    this.camera.y = screenY - worldY * nextZoom;
    this.zoom = nextZoom;
    this.applyCamera();
  }

  applyCamera() {
    this.camera.x = Math.max(-MAX_CAMERA_OFFSET_PX, Math.min(MAX_CAMERA_OFFSET_PX, this.camera.x));
    this.camera.y = Math.max(-MAX_CAMERA_OFFSET_PX, Math.min(MAX_CAMERA_OFFSET_PX, this.camera.y));
    this.world.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.zoom})`;
    this.stage.scrollLeft = 0;
    this.stage.scrollTop = 0;
    this.cards.forEach((state) => state.card.style.setProperty("--ui-scale", String(this.controlScale())));
    const percent = this.zoom * 100;
    this.zoomLabel.textContent = `${percent >= 10 ? Math.round(percent) : Number(percent.toPrecision(2))}%`;
    this.renderRuler();
  }

  renderRuler() {
    const height = this.stage.clientHeight;
    const firstCm = Math.max(0, (this.camera.y - height) / (this.zoom * PX_PER_CM));
    const lastCm = Math.min(WORLD_HEIGHT_CM, this.camera.y / (this.zoom * PX_PER_CM));
    const targetIntervalCm = 72 / (PX_PER_CM * this.zoom);
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, targetIntervalCm)));
    const fraction = targetIntervalCm / magnitude;
    const leadingDigit = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    const labelStepCm = Math.max(1, Math.round(leadingDigit * magnitude));
    const minorStepCm = labelStepCm >= 5 ? Math.max(1, Math.round(labelStepCm / 5)) : labelStepCm;
    const startCm = Math.floor(firstCm / minorStepCm) * minorStepCm;
    const endCm = Math.ceil(lastCm / minorStepCm) * minorStepCm;
    const marks = document.createDocumentFragment();
    const labels = document.createDocumentFragment();
    const meterLabels = [];

    for (let cm = startCm; cm <= endCm; cm += minorStepCm) {
      if (cm < 0 || cm > WORLD_HEIGHT_CM) continue;
      const screenY = this.camera.y - cm * PX_PER_CM * this.zoom;
      if (screenY < -2 || screenY > height + 2) continue;

      const line = document.createElement("div");
      const isMajorMark = cm === 0 || cm % labelStepCm === 0;
      line.className = cm === 0 ? "ground-line" : isMajorMark
        ? "meter-line"
        : "minor-line";
      line.style.top = `${screenY}px`;
      marks.append(line);

      if (cm % labelStepCm !== 0) continue;

      meterLabels.push({ cm, screenY });
    }

    let previousLabelBottom = -Infinity;
    for (const { cm, screenY } of meterLabels.sort((a, b) => a.screenY - b.screenY)) {
      const top = Math.max(2, screenY - 21, previousLabelBottom + 2);
      if (top + 17 > height) continue;

      const label = document.createElement("div");
      label.className = "ruler-label";
      label.style.top = `${top}px`;
      label.textContent = this.formatMeasure(cm, labelStepCm);
      labels.append(label);
      previousLabelBottom = top + 17;
    }

    this.ruler.replaceChildren(marks);
    this.rulerLabels.replaceChildren(labels);
  }

  formatMeasure(cm, intervalCm) {
    if (cm === 0) return "0 m";
    const format = (value, maximumFractionDigits = 2) => new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits
    }).format(value);
    if (cm >= 100000) {
      const kmDecimals = Math.min(6, Math.max(2, Math.ceil(-Math.log10(intervalCm / 100000))));
      return `${format(cm / 100000, kmDecimals)} km`;
    }
    if (cm >= 100) return `${format(cm / 100)} m`;
    return `${cm} cm`;
  }

  resetView() {
    this.zoom = Math.min(this.initialZoom, this.maxZoom());
    this.centerView();
  }

  centerOnCharacter(state) {
    const visibleHeight = this.stage.clientHeight - this.dock.offsetHeight - 24;
    const targetY = Math.max(0, visibleHeight / 2);
    const targetZoom = Math.min(this.maxZoom(), Math.max(
      MIN_ZOOM,
      visibleHeight * 0.82 / Math.max(state.heightPx, 1)
    ));
    this.focusedCharacter = state;
    const targetX = this.stage.clientWidth / 2 - (state.x + state.widthPx / 2) * targetZoom;
    const targetCameraY = targetY - (state.y - GROUND_Y + state.heightPx / 2) * targetZoom;
    this.animateCameraTo(targetX, targetCameraY, targetZoom);
  }

  animateCameraTo(targetX, targetY, targetZoom) {
    this.cancelCameraAnimation();
    const start = { ...this.camera, zoom: this.zoom };
    const startedAt = performance.now();
    const duration = 360;

    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      this.camera.x = start.x + (targetX - start.x) * eased;
      this.camera.y = start.y + (targetY - start.y) * eased;
      this.zoom = start.zoom + (targetZoom - start.zoom) * eased;
      this.applyCamera();

      if (progress < 1) {
        this.cameraAnimationFrame = requestAnimationFrame(animate);
      } else {
        this.cameraAnimationFrame = null;
      }
    };

    this.cameraAnimationFrame = requestAnimationFrame(animate);
  }

  cancelCameraAnimation() {
    if (this.cameraAnimationFrame !== null) {
      cancelAnimationFrame(this.cameraAnimationFrame);
      this.cameraAnimationFrame = null;
    }
  }

  floorScreenY() {
    const rect = this.stage.getBoundingClientRect();
    const controlsHeight = Math.max(150, ...this.cards.map((state) => state.controls.offsetHeight));
    return rect.height - controlsHeight - 28;
  }

  alignGround() {
    this.cancelCameraAnimation();
    this.camera.y = this.floorScreenY();
    this.applyCamera();
  }

  centerView() {
    this.cancelCameraAnimation();
    const rect = this.stage.getBoundingClientRect();
    const left = this.cards.length ? Math.min(...this.cards.map((state) => state.x)) : 0;
    const right = this.cards.length
      ? Math.max(...this.cards.map((state) => state.x + state.widthPx))
      : 250;
    const center = (left + right) / 2;
    this.focusedCharacter = null;
    this.camera.x = rect.width / 2 - center * this.zoom;
    this.camera.y = this.floorScreenY();
    this.applyCamera();
  }

  showToast(message) {
    this.toast.textContent = message;
    this.toast.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove("visible"), 2600);
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}
