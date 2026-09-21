"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Button, GlassPanel, ShimmerText } from "@/components/ui";
import { getDesktopBridge } from "@/lib/desktop-bridge";

const STATUS_TEXT: Record<DesktopJevConnectionStatus, string> = {
  ready: "已安全保存，可在本地资源的选片面板中使用",
  not_configured: "尚未保存 API Key",
  key_unavailable: "已保存的 API Key 无法解密，请重新输入",
  secure_storage_unavailable: "Windows 安全存储当前不可用",
  unsupported: "当前平台不支持此连接方式",
};

export function JevConnectionSettings() {
  const [state, setState] = useState<DesktopJevConnectionState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getJevConnectionState) return;
    void bridge
      .getJevConnectionState()
      .then(setState)
      .catch(() => setError("Jev 连接状态暂时无法读取，请重新打开 Bandi。"));
  }, []);

  async function save() {
    const bridge = getDesktopBridge();
    if (!bridge?.saveJevApiKey || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await bridge.saveJevApiKey({ apiKey });
      if (!result.ok || !result.state) {
        setError(result.error || "API Key 未能安全保存。");
        return;
      }
      setState(result.state);
      setApiKey("");
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!state && !error) return null;

  return (
    <GlassPanel variant="elevated" className="p-5">
      <header className="flex items-start gap-3">
        <KeyRound
          size={16}
          className="mt-0.5 shrink-0 text-[color:var(--accent)]"
        />
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
            Jev 选片连接
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--text-muted)]">
            Bandi 主进程直接连接 TypeSafe，不需要安装或选择 Jev Lab。
          </p>
        </div>
      </header>

      <div className="mt-5 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck
            size={15}
            className="mt-0.5 shrink-0 text-[color:var(--status-success)]"
          />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[color:var(--text-primary)]">
              {state ? STATUS_TEXT[state.status] : "状态读取失败"}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[color:var(--text-secondary)]">
              Key 由 Electron 调用 Windows 系统加密后写入本机配置；界面、日志和仓库都不会保存明文。保存动作不会请求 TypeSafe。
            </p>
          </div>
        </div>

        <label
          htmlFor="typesafe-api-key"
          className="mt-4 block text-[11px] font-medium text-[color:var(--text-muted)]"
        >
          {state?.configured ? "替换 TypeSafe API Key" : "TypeSafe API Key"}
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="typesafe-api-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            maxLength={1024}
            onChange={(event) => {
              setApiKey(event.currentTarget.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="粘贴 API Key；保存后不再显示"
            className="h-9 min-w-0 flex-1 rounded-[7px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-base)] px-3 font-mono text-[12px] text-[color:var(--text-primary)] outline-none transition-colors placeholder:font-sans placeholder:text-[color:var(--text-muted)] hover:border-[color:var(--border-default)] focus:border-[color:var(--accent-muted)]"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!state?.available || apiKey.trim().length < 16 || saving}
            onClick={save}
            leftIcon={
              saving ? (
                <LoaderCircle size={12} className="animate-spin" />
              ) : (
                <ShieldCheck size={12} />
              )
            }
          >
            {saving ? <ShimmerText text="安全保存中…" /> : "安全保存"}
          </Button>
        </div>

        {(error || saved) && (
          <div className="mt-2 min-h-4 text-[10px]">
            {error ? (
              <span className="text-[color:var(--status-error)]">{error}</span>
            ) : (
              <span className="flex items-center gap-1 text-[color:var(--text-muted)]">
                <CheckCircle2
                  size={11}
                  className="text-[color:var(--status-success)]"
                />
                已加密保存；现在可以从片库点击“开始 Jev 判断”
              </span>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
