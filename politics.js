// Elections. Every five nights the valley picks a mayor, and the mayor's policies hold until the next vote.
// Three of these stand each time. Comrade Posad always stands, because he always does.

export const CANDIDATES = {
  grubb: { name: "Mayor Grubb", slogan: "Stability. Continuity. Canapés.", desc: "Shop prices -10%. Grubb Civic Holdings soars.", mods: { discount: 0.1 }, stock: { GRUB: 0.3 } },
  haddock: { name: "Sergeant Haddock", slogan: "Law. Order. More grenades.", desc: "+15% damage to the dead. A free grenade for everyone each dawn.", mods: { dmg: 1.15 }, dawn: "grenade", stock: { BOOM: 0.25 } },
  morwen: { name: "Morwen of the Reeds", slogan: "Return to the soil.", desc: "Crops grow 50% faster. You get hungry and thirsty 30% slower.", mods: { grow: 1.5, hunger: 0.7 }, stock: { FARM: 0.25 } },
  vex: { name: "Vex", slogan: "Free markets. Free samples.", desc: "Shop prices -20%. No stock trading fees.", mods: { discount: 0.2, fee: 0 }, stock: { VEX: 0.35 } },
  aldous: { name: "Brother Aldous", slogan: "Keep the Hearth burning.", desc: "The Hearth slowly repairs itself. Everyone is healed at dawn.", mods: { hearthRegen: 3 }, dawn: "heal", stock: { GRUB: -0.1 } },
  posad: { name: "Comrade Posad", slogan: "Nuclear war will usher in the workers' paradise. And the saucers.", desc: "GUARANTEES A NUKE. Every dawn, all gold is shared out equally.", posadist: true, dawn: "share", stock: { BNKR: 0.9, SLOP: -0.25, GRUB: -0.25, VEX: -0.25 } },
};
export const ELECT_EVERY = 5;
// the ballot: always the Posadist, plus two others (never the sitting mayor twice in a row unless the dice insist)
export function ballot(current) {
  const pool = Object.keys(CANDIDATES).filter((k) => k !== "posad");
  pool.sort(() => Math.random() - 0.5);
  const two = pool.filter((k) => k !== current).slice(0, 2);
  return [...two, "posad"].sort(() => Math.random() - 0.5);
}
