// Петля обратной связи (TASK-55): жизненный цикл pending-дегустаций — add/дедуп, созревание
// («вчера и раньше», не переспрашивать в тот же день), архив протухших (>7 дней), закрытие.
// Всё на temp-каталоге, реальный data/personal не трогаем.
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  addPending, listPendings, ripePendings, markAsked, closePending, archiveStale,
} from "../scripts/lib/pending-tastings.ts";

const NOW = new Date("2026-06-12T12:00:00Z");
const at = (iso: string) => new Date(iso);

let dir: string;
beforeEach(() => { dir = mkdtempSync(`${tmpdir()}/pending-`); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("addPending", () => {
  test("создаёт запись со статусом pending", () => {
    const { record, action } = addPending(
      { beerId: "be_1", beer: "Jaws Атомная Прачечная", venue: "hophead", chat: "1", thread: "50" },
      dir, NOW,
    );
    expect(action).toBe("added");
    expect(record.status).toBe("pending");
    expect(record.id).toMatch(/^pt_[0-9a-f]{8}$/);
    expect(listPendings(dir)).toHaveLength(1);
  });

  test("открытый дубль (тот же сорт, чат, вкладка) не плодится", () => {
    const a = addPending({ beerId: "be_1", beer: "Jaws АП", chat: "1", thread: "50" }, dir, NOW);
    const byId = addPending({ beerId: "be_1", beer: "другое имя", chat: "1", thread: "50" }, dir, NOW);
    const byName = addPending({ beer: "jaws ап", chat: "1", thread: "50" }, dir, NOW);
    expect(byId.action).toBe("exists");
    expect(byId.record.id).toBe(a.record.id);
    expect(byName.action).toBe("exists");
    expect(listPendings(dir)).toHaveLength(1);
  });

  test("тот же сорт в другой вкладке/чате — отдельная запись; после close можно снова", () => {
    const a = addPending({ beerId: "be_1", beer: "X", chat: "1", thread: "50" }, dir, NOW);
    const other = addPending({ beerId: "be_1", beer: "X", chat: "1", thread: "99" }, dir, NOW);
    expect(other.action).toBe("added");
    closePending(a.record.id, dir, NOW);
    const again = addPending({ beerId: "be_1", beer: "X", chat: "1", thread: "50" }, dir, NOW);
    expect(again.action).toBe("added");
  });
});

describe("ripePendings: созревание", () => {
  test("созданное сегодня НЕ созрело, вчера — созрело", () => {
    addPending({ beer: "Сегодня", chat: "1" }, dir, at("2026-06-12T09:00:00Z"));
    addPending({ beer: "Вчера", chat: "1" }, dir, at("2026-06-11T22:00:00Z"));
    const ripe = ripePendings(dir, NOW);
    expect(ripe.map((p) => p.beer)).toEqual(["Вчера"]);
  });

  test("спрошенное сегодня не переспрашивается, спрошенное вчера — снова созрело", () => {
    const a = addPending({ beer: "A", chat: "1" }, dir, at("2026-06-10T10:00:00Z"));
    const b = addPending({ beer: "B", chat: "1" }, dir, at("2026-06-10T10:00:00Z"));
    markAsked(a.record.id, dir, at("2026-06-12T10:00:00Z")); // сегодня
    markAsked(b.record.id, dir, at("2026-06-11T10:00:00Z")); // вчера
    expect(ripePendings(dir, NOW).map((p) => p.beer)).toEqual(["B"]);
  });

  test("ровно 7 дней — ещё созрело, 8 дней — уже нет (уйдёт в архив)", () => {
    addPending({ beer: "Семь", chat: "1" }, dir, at("2026-06-05T10:00:00Z"));
    addPending({ beer: "Восемь", chat: "1" }, dir, at("2026-06-04T10:00:00Z"));
    expect(ripePendings(dir, NOW).map((p) => p.beer)).toEqual(["Семь"]);
  });

  test("closed/stale не достаются", () => {
    const a = addPending({ beer: "A", chat: "1" }, dir, at("2026-06-10T10:00:00Z"));
    closePending(a.record.id, dir, NOW);
    expect(ripePendings(dir, NOW)).toHaveLength(0);
  });
});

describe("archiveStale + close (AC #4)", () => {
  test("протухшие (>7 дней) архивируются молча, свежие не тронуты", () => {
    addPending({ beer: "Старый", chat: "1" }, dir, at("2026-06-01T10:00:00Z")); // 11 дней
    addPending({ beer: "Свежий", chat: "1" }, dir, at("2026-06-11T10:00:00Z"));
    expect(archiveStale(dir, NOW)).toBe(1);
    const all = listPendings(dir);
    expect(all.find((p) => p.beer === "Старый")?.status).toBe("stale");
    expect(all.find((p) => p.beer === "Свежий")?.status).toBe("pending");
  });

  test("close закрывает и не достаётся повторно; неизвестный id → null", () => {
    const a = addPending({ beer: "A", chat: "1" }, dir, at("2026-06-11T10:00:00Z"));
    expect(closePending(a.record.id, dir, NOW)?.status).toBe("closed");
    expect(ripePendings(dir, NOW)).toHaveLength(0);
    expect(closePending("pt_nope", dir, NOW)).toBeNull();
  });

  test("давно закрытые чистятся из файла при следующей записи (>30 дней)", () => {
    const a = addPending({ beer: "Древний", chat: "1" }, dir, at("2026-04-01T10:00:00Z"));
    closePending(a.record.id, dir, at("2026-04-02T10:00:00Z"));
    addPending({ beer: "Новый", chat: "1" }, dir, NOW); // триггерит чистку при save
    expect(listPendings(dir).map((p) => p.beer)).toEqual(["Новый"]);
  });
});
