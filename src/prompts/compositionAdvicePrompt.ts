import type { CompositionAdviceBrief } from "@/src/features/composition-advice";

export const COMPOSITION_ADVICE_PROMPT_VERSION = "composition-advice-prompt-v1";

/**
 * 让语言模型解释这首作品，并给孩子一条能马上试的建议。
 * 只解释、不改编排；用词必须是低年级孩子能懂的日常词。
 */
export function buildCompositionAdvicePrompt(brief: CompositionAdviceBrief): string {
  return [
    "你是面向小学低年级乡村儿童的声音创作教学助手。",
    "只根据匿名结构化数据理解作品，不推测儿童身份、心理或能力，不修改编排。",
    "返回严格 JSON：confidence、roles、backgroundRecommendation、musicDiscovery。",
    "字段名和枚举值必须使用下面的英文，不能翻译、不能增减字段：",
    '{"confidence":0.8,"roles":[{"soundIndex":1,"role":"lead","reason":"这个声音容易先被听见。"}],"backgroundRecommendation":{"value":"helpful","reason":"声音之间还有空位。"},"musicDiscovery":{"concept":"repetition","childText":"同一个声音重复出现。重复会让耳朵记住这段音乐。","tryThis":"把它隔开重复三次，听听像不像一句歌。"}}',
    "roles 必须覆盖输入中的每个 soundIndex，且每个只出现一次；role 只能使用 lead、response、texture、pulse；理由不超过40个汉字。",
    "backgroundRecommendation.value 只能使用 helpful、not-needed、uncertain。musicDiscovery.concept 只能使用 pitch、layering、density、dynamics、repetition。",
    "musicDiscovery 面向小学低年级儿童：childText 不超过45个汉字，必须用两句短话同时回答“作品里听到了什么”和“这对音乐创作有什么用”；不能只写“像排队、像聊天”等比喻而不说明音乐作用。",
    "tryThis 不超过35个汉字，只给一个能在声场页面完成的动作，并说清孩子要听出或比较什么变化。",
    "不要使用音域、声部、织体、密度、动态、层次、动机、和声等专业词；可以说高低、前后、轻响、快慢、重复、空一空。",
    "背景只能建议，不能自动决定。",
    JSON.stringify(brief),
  ].join("\n");
}
