import { WorkDetailPage } from "@/src/page-shells/WorkDetailPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkDetailPage workId={id} />;
}
