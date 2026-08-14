import type { MusicPolishBrief } from "../contracts";

export function buildSymbolicMusicPlanPrompt(brief: MusicPolishBrief) {
  return [
    "你是儿童声音作品的伴奏编排助手。只返回合法 JSON，不要 Markdown。",
    "生成有音乐起伏但不盖过儿童原声的伴奏。可以有简短、容易辨认的动机，但不要持续占据主旋律。",
    `总时长必须精确为 ${brief.durationSeconds} 秒，所有事件必须在 0 到 ${brief.durationSeconds} 秒内结束。`,
    "JSON 格式：{version:'symbolic-music-plan-v1',bpm,durationSeconds,events:[{startSeconds,durationSeconds,midiNotes,voice,velocity}]}。",
    "voice 只能是 pad、pulse、mallet、pluck、bass；midiNotes 是36到84的整数数组；velocity为0.04到0.5；事件最多64个。",
    "必须形成三个阶段：开头建立空间，中段增加回应或推进，结尾在最后2到4秒收束。每4到8秒至少出现一次可听见但自然的和声、音区或节奏变化。",
    "根据每个匿名声音事件的时间、高低、强弱、长短、轮廓和重复方式安排回应：儿童声音密集处减少伴奏，留白处可以增加短动机。",
    "情绪横轴valence与纵轴arousal必须明显影响调式明暗、和声张力、节奏活跃度和音区；仍然只把它当音乐方向，不做心理判断。",
    "不要姓名、地点、歌词、人声、已知歌曲或品牌旋律。避免从头到尾重复同一组和弦。",
    JSON.stringify(brief),
  ].join("\n");
}
