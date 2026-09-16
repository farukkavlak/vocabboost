// Measures the memory the local model takes and whether closing its page gives it back.
// Slow (about a minute) and depends on the machine, so it runs only with
// `npm run test:memory`.
import { execSync } from "node:child_process";
import { test, expect, lookup, watchPage } from "./fixture";

interface Process {
  pid: number;
  parent: number;
  kb: number;
  command: string;
}

function processes(): Process[] {
  return execSync("ps -axo pid=,ppid=,rss=,command=")
    .toString()
    .trim()
    .split("\n")
    .map((line) => {
      const [, pid, parent, kb, command] =
        /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)!;
      return { pid: +pid!, parent: +parent!, kb: +kb!, command: command! };
    });
}

/** Resident memory, in MB, of the extension's own renderer process. */
function extensionMB(): number {
  const all = processes();
  const browser = all.find(
    (p) =>
      p.command.includes("--load-extension=") && !p.command.includes("--type="),
  )!;
  const extension = all.find(
    (p) =>
      p.parent === browser.pid && p.command.includes("--extension-process"),
  )!;
  return Math.round(extension.kb / 1024);
}

test("@memory the model's memory goes back after its page closes", async ({
  context,
  worker,
}) => {
  test.setTimeout(120_000);
  const page = await watchPage(context);
  await page.waitForTimeout(3000);
  const before = extensionMB();

  await page.evaluate(() =>
    window.showCaption(["he had to run the department"]),
  );
  await lookup(worker);
  await page.getByRole("button", { name: "run", exact: true }).click();
  await expect(page.locator("#vocab-meaning .sense").first()).toBeVisible();
  await page.waitForTimeout(3000);
  const loaded = extensionMB();

  // What the idle timer does after two minutes.
  await worker.evaluate(() => chrome.offscreen.closeDocument());
  // The memory is handed back gradually, within about half a minute.
  await expect
    .poll(extensionMB, { timeout: 60_000, intervals: [5000] })
    .toBeLessThan(before + 100);

  console.log(
    `extension process: ${before} MB, ${loaded} MB with the model, ${extensionMB()} MB after`,
  );
  expect(loaded - before).toBeGreaterThan(200);
});
