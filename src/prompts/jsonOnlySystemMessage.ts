/**
 * 所有走 OpenAI 兼容接口的语言模型任务共用的系统指令。
 * 只负责约束返回格式，不承载任何创作意图——创作意图写在各自的 prompt 文件里。
 */
export const JSON_ONLY_SYSTEM_MESSAGE = "只返回合法 JSON，不要返回 Markdown。";
