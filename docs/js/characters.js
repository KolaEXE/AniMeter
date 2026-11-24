export const fallbackCharacters = [
  { id: 1, name: "Monkey D. Luffy", image: "assets/characters/luffy.png", height: 174 },
  { id: 2, name: "Roronoa Zoro", image: "assets/characters/zoro.png", height: 181 },
  { id: 3, name: "Naruto Uzumaki", image: "assets/characters/naruto.png", height: 180 },
  { id: 4, name: "Levi Ackerman", image: "assets/characters/levi.png", height: 160 },
  { id: 5, name: "Satoru Gojo", image: "assets/characters/gojo.png", height: 190 }
];

export async function loadCharacters() {
  try {
    const response = await fetch("data/characters.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`JSON HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Le JSON doit contenir un tableau.");

    return data
      .filter((character) => character && character.id != null && character.name)
      .map((character) => ({
        id: String(character.id),
        name: String(character.name),
        image: String(character.image || ""),
        height: Number(character.height)
      }))
      .filter((character) => Number.isFinite(character.height) && character.height > 0);
  } catch (error) {
    console.warn("Chargement JSON impossible, utilisation des personnages de demonstration.", error);
    return fallbackCharacters.map((character) => ({ ...character }));
  }
}
