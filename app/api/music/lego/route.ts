import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 用本地 ACE-Step 的 lego 任务，为孩子编排好的原声生成一层背景。
 *
 * 与 Fun-Music 那条路的根本区别：模型这次**听得到**孩子的声音。
 * 前端把编排渲染成的混音上传上来，模型据此生成一条配得上它的新轨道，
 * 而不是只凭一段文字描述凭空生成。
 *
 * 服务跑在本机，权重在磁盘上，推理不出这台电脑，也不需要联网。
 */
export async function POST(request: Request) {
  const endpoint = process.env.ACESTEP_API_ENDPOINT?.trim() || "http://127.0.0.1:8001";
  const model = process.env.ACESTEP_MODEL?.trim() || "acestep-v15-base";

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const prompt = String(form?.get("prompt") ?? "").trim();
  const globalCaption = String(form?.get("globalCaption") ?? "").trim();
  if (!(audio instanceof File) || !prompt) {
    return Response.json({ message: "缺少编排混音或背景描述，无法生成背景。" }, { status: 400 });
  }
  if (audio.size > MAX_UPLOAD_BYTES) {
    return Response.json({ message: "编排混音过大，无法生成背景。" }, { status: 413 });
  }

  // ACE-Step 只接受系统临时目录内的路径，其它位置一律拒绝。
  // 用一次性目录存放，生成结束后立即删除，不留下孩子的录音。
  let workingDir: string | null = null;
  try {
    workingDir = await mkdtemp(join(tmpdir(), "wanwu-lego-"));
    const sourcePath = join(workingDir, "arrangement.wav");
    await writeFile(sourcePath, Buffer.from(await audio.arrayBuffer()));

    // 服务只加载启动时指定的那一个 DiT 权重；请求里的 model 对不上时它不会报错，
    // 而是拿已加载的那个悄悄顶上（turbo 只跑 8 步、且不支持 lego）。
    // 那样生成出来的东西会被我们标成 base，等于谎报来源，所以宁可在这里挡住。
    const loaded = await readLoadedModel(endpoint);
    if (loaded !== model) {
      return Response.json(
        { message: `本地音乐模型加载的是 ${loaded ?? "未知模型"}，不是 ${model}，已停止生成以免标错来源。` },
        { status: 503 },
      );
    }

    const submitted = await callAceStep(endpoint, "/release_task", {
      task_type: "lego",
      model,
      src_audio_path: sourcePath,
      prompt,
      global_caption: globalCaption,
      lyrics: "",
      inference_steps: 50,
      guidance_scale: 7,
      use_random_seed: false,
      seed: readSeed(form?.get("seed")),
      batch_size: 1,
    });
    const taskId = submitted?.task_id;
    if (typeof taskId !== "string" || taskId.length === 0) {
      return Response.json({ message: "本地音乐模型没有接受这次生成请求。" }, { status: 502 });
    }

    const filePath = await waitForAudio(endpoint, taskId);
    if (!filePath) {
      return Response.json({ message: "本地音乐模型生成超时，请重试或使用本地音符背景。" }, { status: 504 });
    }
    const audioResponse = await fetch(new URL(filePath, endpoint));
    if (!audioResponse.ok) {
      return Response.json({ message: "取回生成的背景音频失败。" }, { status: 502 });
    }
    return new Response(await audioResponse.arrayBuffer(), {
      headers: {
        "Content-Type": "audio/mpeg",
        // 背景的来源信息随音频一起回给前端，界面据此如实标注。
        "X-Polish-Provider": "ace-step-local",
        "X-Polish-Model": model,
        "X-Polish-Task": "lego",
      },
    });
  } catch (error) {
    const offline = error instanceof TypeError || (error as { cause?: { code?: string } })?.cause?.code === "ECONNREFUSED";
    return Response.json(
      { message: offline ? "本地音乐模型没有启动，将使用本地音符背景。" : "生成背景时出错，请重试。" },
      { status: offline ? 503 : 502 },
    );
  } finally {
    if (workingDir) await rm(workingDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 20 秒作品的混音约 3.5MB；留出余量但挡住明显异常的上传。 */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const GENERATION_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 3_000;

/** 服务启动时加载哪个权重就只能用哪个，这里先问清楚，避免被悄悄换成另一个模型。 */
async function readLoadedModel(endpoint: string): Promise<string | null> {
  const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`ACE-Step /health 返回 ${response.status}`);
  const body = await response.json() as { data?: { loaded_model?: unknown } };
  const loaded = body.data?.loaded_model;
  return typeof loaded === "string" && loaded.length > 0 ? loaded : null;
}

async function callAceStep(endpoint: string, path: string, payload: unknown) {
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`ACE-Step ${path} 返回 ${response.status}`);
  const body = await response.json() as { data?: Record<string, unknown> } & Record<string, unknown>;
  return (body.data ?? body) as Record<string, unknown> | undefined;
}

async function waitForAudio(endpoint: string, taskId: string): Promise<string | null> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const results = await callAceStep(endpoint, "/query_result", { task_id_list: JSON.stringify([taskId]) });
    for (const item of (results as unknown as Array<Record<string, unknown>>) ?? []) {
      if (item.task_id !== taskId) continue;
      for (const entry of parseResult(item.result)) {
        if (typeof entry.file === "string" && entry.file.length > 0) return entry.file;
      }
      if (item.status === "failed" || item.status === "error") return null;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}

/** 服务端有时把结果数组序列化成字符串再返回。 */
function parseResult(value: unknown): Array<{ file?: unknown }> {
  const parsed = typeof value === "string" ? safeParse(value) : value;
  return Array.isArray(parsed) ? parsed as Array<{ file?: unknown }> : [];
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readSeed(value: FormDataEntryValue | null | undefined): number {
  const parsed = Number(value);
  // 固定种子：同一份编排重新生成能复现，方便对照调提示词。
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 42;
}
