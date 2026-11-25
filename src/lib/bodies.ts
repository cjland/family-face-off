/**
 * Costume bodies for players who use their own face photo (owner-supplied art in
 * public/bodies/<id>.webp, each with a transparent face hole). `face` is the hole's
 * center and radius as fractions of the square image; the photo is drawn behind it.
 */
export const BODIES = [
  { id: "hero", label: "Superhero", face: { cx: 0.5982, cy: 0.2091, r: 0.1764 } },
  { id: "astro", label: "Astronaut", face: { cx: 0.5474, cy: 0.2391, r: 0.1788 } },
  { id: "chef", label: "Chef", face: { cx: 0.4592, cy: 0.3469, r: 0.1565 } },
  { id: "wizard", label: "Wizard", face: { cx: 0.4898, cy: 0.3254, r: 0.1542 } },
  { id: "scientist", label: "Scientist", face: { cx: 0.5648, cy: 0.2907, r: 0.1574 } },
  { id: "coach", label: "Coach", face: { cx: 0.4982, cy: 0.2644, r: 0.1565 } },
  { id: "pirate", label: "Pirate", face: { cx: 0.5252, cy: 0.2986, r: 0.1511 } },
  { id: "detective", label: "Detective", face: { cx: 0.5576, cy: 0.277, r: 0.1619 } },
  { id: "cowboy", label: "Cowboy", face: { cx: 0.5068, cy: 0.2534, r: 0.1507 } },
  { id: "king", label: "Royalty", face: { cx: 0.488, cy: 0.2595, r: 0.1581 } },
  { id: "casual", label: "Hoodie", face: { cx: 0.5045, cy: 0.2941, r: 0.1606 } },
  { id: "explorer", label: "Explorer", face: { cx: 0.5023, cy: 0.3179, r: 0.1629 } },
  { id: "starhero", label: "Star hero", face: { cx: 0.5445, cy: 0.29, r: 0.1655 } },
  { id: "spacewalker", label: "Space walker", face: { cx: 0.532, cy: 0.2785, r: 0.1849 } },
  { id: "headchef", label: "Head chef", face: { cx: 0.4554, cy: 0.3482, r: 0.1562 } },
  { id: "soccer", label: "Soccer star", face: { cx: 0.5322, cy: 0.2916, r: 0.1574 } },
  { id: "rocker", label: "Rock star", face: { cx: 0.464, cy: 0.2793, r: 0.1599 } },
  { id: "starwizard", label: "Star wizard", face: { cx: 0.5155, cy: 0.3274, r: 0.1571 } },
  { id: "rancher", label: "Ranch hand", face: { cx: 0.4276, cy: 0.3073, r: 0.1537 } },
  { id: "monarch", label: "King", face: { cx: 0.4548, cy: 0.3029, r: 0.1553 } },
] as const;

export type BodyId = (typeof BODIES)[number]["id"];
export const DEFAULT_BODY: BodyId = "hero";

export function isBody(v: unknown): v is BodyId {
  return typeof v === "string" && BODIES.some((b) => b.id === v);
}

export function bodyFace(id: BodyId) {
  return BODIES.find((b) => b.id === id)!.face;
}
