// Shared by extension, paste UI and server. Never return raw DOM or form values.
export function cleanSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return "";
    // Query/hash/path parameters can carry session IDs. Only retain conservative route segments.
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname
      .split("/")
      .filter(
        (p) =>
          p &&
          !/[;=@%]/.test(p) &&
          !/(?:token|session|csrf|auth|callback)/i.test(p) &&
          !/[a-z0-9_-]{24}/i.test(p),
      )
      .join("/");
    return url.toString();
  } catch {
    return "";
  }
}
const personalLine =
  /(?:氏名|お名前|ふりがな|フリガナ|住所|電話番号|メールアドレス|生年月日|学生番号|会員番号|ログインID|パスワード|password|csrf|session.?id|access.?token|refresh.?token|cookie|志望動機|自己PR|自己ＰＲ|ガクチカ|あなたの回答|回答内容|回答本文|ES回答|エントリーシート回答)/i;
export function cleanText(value: string, max = 50000): string {
  return value
    .normalize("NFKC")
    .slice(0, max)
    .split(/\r?\n/)
    .filter((line) => !personalLine.test(line))
    .map((line) =>
      line
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[非表示]")
        .replace(/(?:\+81[- ]?|0)\d{1,4}[- ]?\d{2,4}[- ]?\d{4}\b/g, "[非表示]")
        .replace(/(?:〒\s*)?\d{3}-\d{4}/g, "[非表示]")
        .replace(
          /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)\S*(?:市|区|町|村)\S+/g,
          "[非表示]",
        )
        .replace(
          /[^\s。、：:【】「」]{1,20}\s*(?:様|さん)(?=[\s、。!！]|$)/g,
          "[非表示]",
        )
        .replace(/(?:https?:\/\/)[^\s<>]+/g, (url) => cleanSourceUrl(url))
        .replace(/[A-Za-z0-9_+/=-]{32,}/g, "[非表示]")
        .replace(/[\t ]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}
export const scheduleWords =
  /締切|期限|応募|エントリー|受付|採用|新卒|選考|面接|面談|インターン|イベント|説明会|予約|Webテスト|適性検査|SPI|コーディング|ES\b|エントリーシート|workshop|intern|selection|entry|WEB[:：]|ラボ/i;
export function sanitizedLines(text: string): string[] {
  const lines = text
    .normalize("NFKC")
    .slice(0, 50000)
    .split(/\r?\n/)
    .map((line) => line.trim());
  let privateSection = false;
  return lines
    .filter((line) => {
      // Long prose is never needed to extract a date and can contain an applicant's essay.
      if (line.length > 500) return false;
      if (
        /^(?:設問|質問|回答(?:内容|本文|[:：]|$)|Q\d|A\d|学歴|職歴|プロフィール|個人情報|志望動機|自己PR|ガクチカ|ES回答|あなたの回答)/i.test(
          line,
        )
      ) {
        privateSection = true;
        return false;
      }
      if (
        /^(?:お知らせ|募集(?:要項|情報)?|応募(?:要項|情報)?|選考(?:フロー|プロセス|情報)?|イベント(?:情報|予約|日程)?|説明会(?:予約|日程)?)[\s:：]*$/.test(
          line,
        )
      )
        privateSection = false;
      return !privateSection && !/私は|私が|私の強み|私の経験/.test(line);
    })
    .map((line) => cleanText(line))
    .filter(Boolean);
}
export function shortEvidence(text: string): string {
  // Preserve scheduling evidence, never long free-form essay paragraphs.
  return cleanText(text, 1000)
    .split("\n")
    .filter(
      (line) =>
        line.length <= 360 &&
        (scheduleWords.test(line) || /\d{1,2}[月/:-]\d/.test(line)),
    )
    .slice(0, 3)
    .join("\n")
    .slice(0, 360);
}
