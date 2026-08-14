export function StatusBadge({ children, tone = "sage" }: { children: React.ReactNode; tone?: "sage" | "yellow" | "rose" | "ink" }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export function MockNotice() {
  return <div className="mock-notice"><span>演示模式</span> 声卡和姓名为虚构数据；原声为已确认可公开使用的示例音频；AI 背景仍是明确标记的缓存或本地 Mock。</div>;
}
