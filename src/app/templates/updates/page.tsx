import { Suspense } from "react";
import { RecruitmentUpdates } from "@/components/recruitment-updates";
export default function Page() {
  return (
    <Suspense fallback={<p>読み込み中…</p>}>
      <RecruitmentUpdates />
    </Suspense>
  );
}
