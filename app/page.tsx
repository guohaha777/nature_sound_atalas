import type { Metadata } from "next";
import { HomePage } from "@/src/page-shells/HomePage";

export const metadata: Metadata = {
  title: "万物声谱｜让孩子把听见的世界变成音乐",
  description: "孩子先记录、先选择，原声先成为作品；AI 只在下面加一层轻轻的背景。",
};

export default function Home() {
  return <HomePage />;
}
