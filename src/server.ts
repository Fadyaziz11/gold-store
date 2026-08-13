import "./lib/error-capture";

import { createClient } from "@supabase/supabase-js";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type WorkerEnv = {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
};

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

const DEFAULT_SUPABASE_URL = "https://pjlfnhhogzheqesvkzdq.supabase.co";

type ProcessLike = { env?: Record<string, string | undefined> };

function runtimeProcessEnv(): Record<string, string | undefined> {
  return ((globalThis as typeof globalThis & { process?: ProcessLike }).process?.env ?? {});
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleCreateEmployee(request: Request, env: WorkerEnv): Promise<Response | null> {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/api/admin/create-employee") return null;

  const processEnv = runtimeProcessEnv();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? processEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json({ error: "إعداد الخادم ناقص: SUPABASE_SERVICE_ROLE_KEY" }, 500);

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json({ error: "جلسة المدير مطلوبة" }, 401);

  const supabaseUrl =
    env.SUPABASE_URL ??
    env.VITE_SUPABASE_URL ??
    processEnv.SUPABASE_URL ??
    processEnv.VITE_SUPABASE_URL ??
    DEFAULT_SUPABASE_URL;
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: actor, error: actorError } = await adminClient.auth.getUser(accessToken);
  if (actorError || !actor.user) return json({ error: "جلسة المدير غير صالحة" }, 401);

  const { data: roles, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", actor.user.id);
  if (roleError) return json({ error: "تعذر التحقق من صلاحيات المدير" }, 500);
  if (!(roles ?? []).some((row) => row.role === "admin")) return json({ error: "هذا الإجراء متاح للمدير فقط" }, 403);

  const body = (await request.json().catch(() => null)) as {
    fullName?: string;
    email?: string;
    password?: string;
  } | null;
  const fullName = body?.fullName?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  if (!fullName || !email || password.length < 6) {
    return json({ error: "الاسم والبريد وكلمة المرور (6 أحرف على الأقل) مطلوبة" }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase().includes("already")
      ? "هذا البريد مستخدم بالفعل"
      : createError?.message ?? "تعذر إنشاء حساب الموظف";
    return json({ error: message }, createError?.status && createError.status >= 400 ? createError.status : 400);
  }

  return json({ userId: created.user.id });
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const employeeResponse = await handleCreateEmployee(request, (env ?? {}) as WorkerEnv);
      if (employeeResponse) return employeeResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
