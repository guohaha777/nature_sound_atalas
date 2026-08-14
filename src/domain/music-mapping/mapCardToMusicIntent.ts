import type { ConfirmedSoundCard } from "../sound-card";
import { confirmedSoundCardSchema } from "../sound-card";
import { CONTOUR, DURATION_BEATS, GAIN_DB, PITCH_SHIFT } from "./mappingRulesV1";
import type { MusicIntent } from "./types";

export function mapCardToMusicIntent(card: ConfirmedSoundCard): MusicIntent {
  const parsed = confirmedSoundCardSchema.parse(card);
  const roles: MusicIntent["roleCandidates"] = [];
  if (parsed.pitch === "low") roles.push("bass");
  if (parsed.duration === "short" || parsed.pattern === "repeat" || parsed.pattern === "bursts") roles.push("rhythm");
  if (parsed.pitch !== "low" && parsed.contour !== "flat") roles.push("melody");
  if (parsed.duration === "long" || parsed.pattern === "fade-in") roles.push("texture");
  if (!roles.length) roles.push("texture");

  return {
    sourceKey: parsed.source.normalizedKey,
    semitoneShift: PITCH_SHIFT[parsed.pitch],
    durationBeats: DURATION_BEATS[parsed.duration],
    contour: { kind: parsed.contour, ...CONTOUR[parsed.contour] },
    gainDb: GAIN_DB[parsed.intensity],
    pattern: parsed.pattern,
    roleCandidates: roles,
    explanationKey: `${parsed.pitch}.${parsed.duration}.${parsed.contour}.${parsed.intensity}.${parsed.pattern}`,
    mappingVersion: "music-mapping-v1",
  };
}

