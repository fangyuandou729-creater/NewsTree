import type { TreeStats } from "./types";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function nextTreeAfterOrganize(tree: TreeStats) {
  const today = todayKey();
  const alreadyOrganizedToday = tree.lastOrganizedDate === today;
  return {
    ...tree,
    totalDays: alreadyOrganizedToday ? tree.totalDays : tree.totalDays + 1,
    lastOrganizedDate: today
  };
}
