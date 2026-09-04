/**
 * 全部联网模型提示词集中在这个目录：一个模型任务一个文件。
 * 要调整 AI 的表现，改这里即可，不需要动业务代码或接口。
 *
 * - musicIdeaPrompt：让语言模型给出一句动机与四段性格，由程序发展成伴奏（Plan B）。
 * - funMusicPrompt：让音乐模型直接生成背景音频。
 * - compositionAdvicePrompt：让语言模型解释作品并给孩子一条建议。
 * - jsonOnlySystemMessage：各语言模型任务共用的返回格式约束。
 */
export { buildFunMusicPromptV1 } from "./funMusicPromptV1";
export { buildFunMusicPromptV2, FUN_MUSIC_PROMPT_VERSION } from "./funMusicPromptV2";
export * from "./compositionAdvicePrompt";
export * from "./musicIdeaPrompt";
export { JSON_ONLY_SYSTEM_MESSAGE } from "./jsonOnlySystemMessage";
