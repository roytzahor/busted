import { createHash } from "crypto";

function sortObject(obj: Record<string, string>): Record<string, string> {
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, string>>((result, key) => {
      result[key] = obj[key];
      return result;
    }, {});
}

export function getShanghaiTimestamp(date: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function signAffiliateRequest(
  parameters: Record<string, string>,
  appSecret: string,
): string {
  const sorted = sortObject(parameters);
  const concatenated = Object.keys(sorted).reduce(
    (acc, key) => `${acc}${key}${sorted[key]}`,
    "",
  );
  const signed = `${appSecret}${concatenated}${appSecret}`;
  return createHash("md5").update(signed, "utf8").digest("hex").toUpperCase();
}
