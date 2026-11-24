/** The 40 cartoon game pieces (images in public/pieces/<id>.webp). */
export const PIECES = [
  { id: "rocket", label: "Rocket" },
  { id: "robot", label: "Robot" },
  { id: "dino", label: "Dino" },
  { id: "unicorn", label: "Unicorn" },
  { id: "fox", label: "Fox" },
  { id: "bee", label: "Bee" },
  { id: "turtle", label: "Turtle" },
  { id: "cupcake", label: "Cupcake" },
  { id: "ninja", label: "Ninja" },
  { id: "alien", label: "Alien" },
  { id: "monkey", label: "Monkey" },
  { id: "ghost", label: "Ghost" },
  { id: "king", label: "King" },
  { id: "penguin", label: "Penguin" },
  { id: "dragon", label: "Dragon" },
  { id: "wizard", label: "Wizard" },
  { id: "pirate", label: "Pirate" },
  { id: "owl", label: "Owl" },
  { id: "cactus", label: "Cactus" },
  { id: "cat", label: "Cat" },
  { id: "boss", label: "Boss" },
  { id: "chef", label: "Chef" },
  { id: "detective", label: "Detective" },
  { id: "traveler", label: "Traveler" },
  { id: "golfer", label: "Golfer" },
  { id: "guitarist", label: "Guitarist" },
  { id: "scientist", label: "Scientist" },
  { id: "artist", label: "Artist" },
  { id: "astronaut", label: "Astronaut" },
  { id: "surfer", label: "Surfer" },
  { id: "cowboy", label: "Cowboy" },
  { id: "hiker", label: "Hiker" },
  { id: "barista", label: "Barista" },
  { id: "magician", label: "Magician" },
  { id: "captain", label: "Captain" },
  { id: "grandma", label: "Bookworm" },
  { id: "gardener", label: "Gardener" },
  { id: "racer", label: "Racer" },
  { id: "emperor", label: "Emperor" },
  { id: "queen", label: "Queen" },
] as const;

export type PieceId = (typeof PIECES)[number]["id"];
export const PIECE_IDS = PIECES.map((p) => p.id) as unknown as [PieceId, ...PieceId[]];

export function isPiece(v: unknown): v is PieceId {
  return typeof v === "string" && PIECES.some((p) => p.id === v);
}

/** A player who uploaded a photo has piece "photo:<playerId>:<version>". */
export function photoPiece(playerId: string, version: number): string {
  return `photo:${playerId}:${version}`;
}

export function isPhotoPiece(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("photo:");
}

export function pieceSrc(id: string): string {
  if (id.startsWith("photo:")) {
    const [, playerId, version] = id.split(":");
    return `/api/photos/${playerId}?v=${version ?? "0"}`;
  }
  return `/pieces/${id}.webp`;
}

export function pieceLabel(id: string | null | undefined): string {
  return PIECES.find((p) => p.id === id)?.label ?? "Player";
}
