// Every category pack must be imported here. To add one: drop a JSON file in
// ./categories (see ./categories/README.md) and add it to this list.

import type { CategoryPack } from "@/lib/categories";
import adamToNoah from "./categories/adam-to-noah.json";
import africa from "./categories/africa.json";
import apostles from "./categories/apostles.json";
import armorOfGod from "./categories/armor-of-god.json";
import bibleBooks from "./categories/bible-books.json";
import constellations from "./categories/constellations.json";
import elements from "./categories/elements.json";
import europe from "./categories/europe.json";
import fruitOfSpirit from "./categories/fruit-of-spirit.json";
import genealogy from "./categories/genealogy.json";
import iAm from "./categories/i-am.json";
import judges from "./categories/judges.json";
import kings from "./categories/kings.json";
import mbta from "./categories/mbta.json";
import mountains from "./categories/mountains.json";
import paulPlaces from "./categories/paul-places.json";
import pixar from "./categories/pixar.json";
import plagues from "./categories/plagues.json";
import pokemonGen1 from "./categories/pokemon-gen1.json";
import presidents from "./categories/presidents.json";
import prophets from "./categories/prophets.json";
import sevenChurches from "./categories/seven-churches.json";
import shakespeare from "./categories/shakespeare.json";
import stateCapitals from "./categories/state-capitals.json";
import tribes from "./categories/tribes.json";
import usStates from "./categories/us-states.json";
import women from "./categories/women.json";

export const PACKS = [
  adamToNoah,
  africa,
  apostles,
  armorOfGod,
  bibleBooks,
  constellations,
  elements,
  europe,
  fruitOfSpirit,
  genealogy,
  iAm,
  judges,
  kings,
  mbta,
  mountains,
  paulPlaces,
  pixar,
  plagues,
  pokemonGen1,
  presidents,
  prophets,
  sevenChurches,
  shakespeare,
  stateCapitals,
  tribes,
  usStates,
  women,
] as CategoryPack[];
