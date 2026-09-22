"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>画面を表示できませんでした</h1>
      <p>再度読み込んでください。保存済みデータは削除されません。</p>
      <button className="btn btn-primary" onClick={reset}>
        再読み込み
      </button>
    </div>
  );
}
