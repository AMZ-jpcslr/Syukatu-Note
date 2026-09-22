import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>ページが見つかりません</h1>
      <Link href="/">ホームに戻る</Link>
    </div>
  );
}
