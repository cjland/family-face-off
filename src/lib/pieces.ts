import { BODIES } from "@/lib/bodies";
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

/**
 * Character groups of 20; each game picks which groups players choose from (all by default).
 * Add a group by adding its 20 pieces to PIECES and a line here.
 */
export const PIECE_GROUPS = [
  { id: "creatures", label: "Creatures & Things", about: "Rocket, dino, unicorn, ghost, dragon…", pieces: PIECES.slice(0, 20).map((p) => p.id) },
  { id: "people", label: "People & Pros", about: "Chef, detective, astronaut, surfer, queen…", pieces: PIECES.slice(20, 40).map((p) => p.id) },
] as const;
export type PieceGroupId = (typeof PIECE_GROUPS)[number]["id"];
export const PIECE_GROUP_IDS = PIECE_GROUPS.map((g) => g.id) as unknown as [PieceGroupId, ...PieceGroupId[]];

/** The pieces players can pick from in a game with these groups (all pieces if none). */
export function piecesForGroups(groups: readonly string[] | undefined): (typeof PIECES)[number][] {
  const chosen = PIECE_GROUPS.filter((g) => groups?.includes(g.id));
  if (!chosen.length) return [...PIECES];
  const ids = new Set<string>(chosen.flatMap((g) => g.pieces));
  return PIECES.filter((p) => ids.has(p.id));
}
export const PIECE_IDS = PIECES.map((p) => p.id) as unknown as [PieceId, ...PieceId[]];

export function isPiece(v: unknown): v is PieceId {
  return typeof v === "string" && PIECES.some((p) => p.id === v);
}

/** A player who uploaded a photo has piece "photo:<playerId>:<version>:<body>". */
export function photoPiece(playerId: string, version: number, body: string): string {
  return `photo:${playerId}:${version}:${body}`;
}

export function isPhotoPiece(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("photo:");
}

export function parsePhotoPiece(v: string): { playerId: string; version: string; body: string | null } {
  const [, playerId, version, body] = v.split(":");
  return { playerId, version: version ?? "0", body: body ?? null };
}

export function pieceSrc(id: string): string {
  if (id.startsWith("photo:")) {
    const { playerId, version } = parsePhotoPiece(id);
    return `/api/photos/${playerId}?v=${version}`;
  }
  return `/pieces/${id}.webp`;
}

export function pieceLabel(id: string | null | undefined): string {
  if (id?.startsWith("mash:")) {
    const [, head, body] = id.split(":");
    return `${PIECES.find((p) => p.id === head)?.label ?? "Mystery"} ${BODIES.find((b) => b.id === body)?.label ?? ""}`.trim();
  }
  return PIECES.find((p) => p.id === id)?.label ?? "Player";
}
