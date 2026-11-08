import { expect, Page, test } from '@playwright/test';

const saved = (page: Page) => expect(page.getByTestId('spremanje')).toHaveText('✓ Spremljeno');
const step = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Koraci' }).getByRole('button', { name });

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('nacrt')).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('prvo otvaranje prikazuje primjer na hrvatskom', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Primjer: stan' })).toBeVisible();
  await expect(step(page, '1 Prostorija')).toBeVisible();
  await expect(step(page, '4 Provjera i ispis')).toBeVisible();
  await saved(page);
  await expect(page.locator('footer')).toContainText('utičnica');
  await expect(page.locator('footer')).toContainText('nabava');
});

test('nacrt ima isto mjerilo u širini i visini', async ({ page }) => {
  const svg = page.locator('svg[data-scale]');
  const scale = Number(await svg.getAttribute('data-scale'));
  expect(scale).toBeGreaterThan(20);
  const box = await page.getByTestId('mjerna-traka').boundingBox();
  expect(box!.width).toBeGreaterThan(40);

  const ratios = await svg.evaluate((el) =>
    [...el.querySelectorAll('rect[stroke="#111111"][fill="none"]')].map((r) => {
      const bb = (r as SVGRectElement).getBBox();
      return [bb.width, bb.height];
    })
  );
  // Zidovi 2,90 i 5,90 m, strop 5,90 × 2,90 m, visina 2,60 m
  const sizes = ratios.map(([w, h]) => [w / scale, h / scale]);
  expect(sizes.some(([w, h]) => Math.abs(w - 2.9) < 1e-3 && Math.abs(h - 2.6) < 1e-3)).toBe(true);
  expect(sizes.some(([w, h]) => Math.abs(w - 5.9) < 1e-3 && Math.abs(h - 2.6) < 1e-3)).toBe(true);
  expect(sizes.some(([w, h]) => Math.abs(w - 5.9) < 1e-3 && Math.abs(h - 2.9) < 1e-3)).toBe(true);
});

test('zum ne deformira nacrt', async ({ page }) => {
  const svg = page.locator('svg[data-scale]');
  const before = await svg.evaluate((el) => [el.clientWidth, el.clientHeight, Number(el.getAttribute('data-scale'))]);
  await page.getByRole('button', { name: 'Povećaj' }).click();
  const after = await svg.evaluate((el) => [el.clientWidth, el.clientHeight, Number(el.getAttribute('data-scale'))]);
  expect(after[2]).toBeCloseTo(before[2] * 1.25, 3);
  const inner = (v: number[]) => (v[0] - 68) / (v[1] - 60);
  expect(inner(after)).toBeCloseTo(inner(before), 2);
});

test('unos dimenzija zadržava upisano i javlja grešku', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const length = page.getByLabel('Dužina (m)');
  await length.fill('12');
  await length.press('Enter');
  await expect(length).toHaveValue('12,00');
  await expect(page.locator('[data-testid=nacrt]')).toContainText('12,00 × 2,60 m');

  await length.fill('0,5');
  await length.press('Enter');
  await expect(page.getByRole('alert')).toContainText('od 1,00 do 30,00');
  await expect(length).toHaveValue('0,5');
  await expect(page.locator('[data-testid=nacrt]')).toContainText('12,00 × 2,60 m');

  await length.fill('');
  await length.press('Tab');
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('otvor koji ne stane ne može se dodati, a ispravan ima visinu i parapet', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const offset = page.getByLabel('Od lijevog kuta (m)');
  await offset.fill('9');
  await offset.press('Enter');
  await expect(page.getByRole('button', { name: 'Dodaj na zid' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('prelazi rub');

  await offset.fill('0,4');
  await offset.press('Enter');
  await page.getByLabel('Visina (m)').nth(1).fill('1,25');
  await page.getByLabel('Parapet od poda (m)').fill('1,1');
  await page.getByLabel('Parapet od poda (m)').press('Enter');
  await page.getByRole('button', { name: 'Dodaj na zid' }).click();
  await expect(page.locator('[data-testid=nacrt]')).toContainText('Prozor');
  await expect(page.getByText('Otvori (4)')).toBeVisible();
  await expect(page.getByText('1,20 × 1,25 m')).toBeVisible();
});

test('dodavanje elementa, poništi i ponovi', async ({ page }) => {
  const before = await page.locator('[data-testid^=element-]').count();
  await page.getByRole('button', { name: /RK Razvodna kutija/ }).click();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(before + 1);
  await expect(page.getByText('Odabrano')).toBeVisible();

  await page.getByRole('button', { name: 'Poništi' }).click();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(before);
  await page.getByRole('button', { name: 'Ponovi' }).click();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(before + 1);
});

test('krivi element na plohi javlja poruku', async ({ page }) => {
  const svg = page.locator('svg[data-scale]');
  const scale = Number(await svg.getAttribute('data-scale'));
  await svg.click({ position: { x: 34 + 5 * scale, y: 14 + 2 * scale } });
  await page.getByRole('button', { name: /P1 Jednopolni/ }).click();
  await expect(page.getByRole('alert')).toContainText('ide na zid');
});

test('povlačenje elementa mijenja kote i jedan je korak poništavanja', async ({ page }) => {
  const element = page.getByTestId('element-U-8');
  await element.locator('rect').click();
  await expect(page.getByLabel('Naziv elementa')).toHaveValue(/U-8/);
  const before = await page.getByLabel('Od kuta (m)').inputValue();

  const box = await element.locator('rect').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 30, box!.y - 20, { steps: 5 });
  await page.mouse.move(box!.x + 45, box!.y - 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Od kuta (m)')).not.toHaveValue(before);

  await page.getByRole('button', { name: 'Poništi' }).click();
  await expect(page.getByLabel('Od kuta (m)')).toHaveValue(before);
});

test('povlačenje iz palete dodaje element na mjesto ispuštanja', async ({ page }) => {
  const before = await page.locator('[data-testid^=element-]').count();
  const item = await page.getByRole('button', { name: /U1 Jednostruka/ }).boundingBox();
  const svg = await page.locator('svg[data-scale]').boundingBox();
  await page.mouse.move(item!.x + 20, item!.y + 10);
  await page.mouse.down();
  await page.mouse.move(svg!.x + svg!.width * 0.7, svg!.y + svg!.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(before + 1);
  await expect(page.getByLabel('Naziv elementa')).toHaveValue(/Jednostruka/);
});

test('promjene ostaju nakon ponovnog učitavanja', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const height = page.getByLabel('Visina (m)').first();
  await height.fill('2,755');
  await height.press('Enter');
  await expect(page.getByTestId('spremanje')).toHaveText('Spremanje…');
  await expect(page.getByTestId('spremanje')).toHaveText('✓ Spremljeno');
  await page.reload();
  await expect(page.locator('[data-testid=nacrt]')).toContainText('2,755 m');
});

test('promjena se ne gubi ni kod trenutnog ponovnog učitavanja', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const height = page.getByLabel('Visina (m)').first();
  await height.fill('2,444');
  await height.press('Enter');
  await page.reload();
  await expect(page.locator('[data-testid=nacrt]')).toContainText('2,444 m');
});

test('smanjenje prostorije označi elemente izvan zida i nudi popravak', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const width = page.getByLabel('Širina (m)').first();
  await width.fill('3');
  await width.press('Enter');
  await expect(page.locator('footer')).toContainText('Izvan zida');
  await step(page, '4 Provjera i ispis').click();
  const fixes = page.getByRole('button', { name: 'Premjesti unutar zida' });
  const count = await fixes.count();
  expect(count).toBeGreaterThan(0);
  await fixes.first().click();
  await expect(fixes).toHaveCount(count - 1);
});

test('upravljanje projektima: novi, preimenuj, kopija, brisanje', async ({ page }) => {
  await page.getByRole('button', { name: 'Primjer: stan' }).click();
  await page.getByRole('button', { name: 'Moji projekti' }).click();
  await expect(page.getByRole('heading', { name: 'Moji projekti' })).toBeVisible();

  await page.getByRole('button', { name: 'Novi projekt' }).click();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Novi projekt' }).click();
  await page.getByRole('button', { name: 'Moji projekti' }).click();

  await page.getByRole('button', { name: 'Preimenuj Novi projekt' }).click();
  await page.getByLabel('Novi naziv').fill('Kuhinja');
  await page.getByRole('button', { name: 'Spremi' }).click();
  await expect(page.getByText('Kuhinja', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Kopiraj Kuhinja' }).click();
  await expect(page.getByText('Kuhinja (kopija)')).toBeVisible();

  await page.getByRole('button', { name: 'Obriši Kuhinja (kopija)' }).click();
  await expect(page.getByRole('dialog')).toContainText('trajno obrisan');
  await page.getByRole('dialog').getByRole('button', { name: 'Obriši' }).click();
  await expect(page.getByText('Kuhinja (kopija)')).toHaveCount(0);
});

test('izvoz i uvoz datoteke, neispravna datoteka dobiva poruku', async ({ page }) => {
  await page.getByRole('button', { name: 'Primjer: stan' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Izvezi datoteku' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Primjer- stan.elektroplan.json');
  const path = await download.path();

  await page.getByRole('button', { name: 'Primjer: stan' }).click();
  await page.getByRole('button', { name: 'Moji projekti' }).click();
  await page.getByLabel('Datoteka projekta').setInputFiles({
    name: 'los.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"nesto":1}'),
  });
  await expect(page.getByRole('alert')).toContainText('nije ElektroPlan projekt');

  await page.getByLabel('Datoteka projekta').setInputFiles(path);
  await expect(page.getByTestId('nacrt')).toBeVisible();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(18);
});

test('isti projekt ne može se uređivati u dvije kartice', async ({ page, context }) => {
  await saved(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('alert')).toContainText('već je otvoren u drugoj kartici');
  await second.close();
});

test('ispis koristi točne milimetre', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      (window as unknown as { printed: boolean }).printed = true;
    };
  });
  await page.reload();
  await step(page, '4 Provjera i ispis').click();
  await page.getByRole('button', { name: 'Ispis na A4' }).click();
  await expect(page.getByRole('dialog')).toContainText('100 %');
  await page.getByRole('button', { name: 'Otvori ispis' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: boolean }).printed)).toBe(true);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Mjerilo 1:100')).toBeVisible();
  await expect(page.getByText('Mjerilo 1:25').first()).toBeVisible();
  const bar = await page.getByText('5 cm na papiru').first().evaluate((el) => {
    const line = el.previousElementSibling as HTMLElement;
    return line.getBoundingClientRect().width;
  });
  expect(bar).toBeCloseTo((50 / 25.4) * 96, 0);
  await expect(page.getByText('5 cm na papiru = 5,00 m u prostoru')).toBeVisible();
  await expect(page.getByText('5 cm na papiru = 1,25 m u prostoru').first()).toBeVisible();
});

test('shema spajanja se otvara i zatvara', async ({ page }) => {
  await step(page, '4 Provjera i ispis').click();
  await page.getByRole('button', { name: 'Sheme spajanja' }).click();
  const tab = page.getByRole('button', { name: /Izmjenični spoj/ });
  await expect(tab).toBeVisible();
  await page.getByRole('button', { name: /Križni spoj/ }).click();
  await page.locator('button:has(svg.lucide-x)').first().click();
  await expect(tab).toHaveCount(0);
});

test('radi bez interneta nakon prvog otvaranja', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(page.getByTestId('nacrt')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('nacrt')).toBeVisible();
  await context.setOffline(false);
});

test.describe('mobitel', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true });

  test('koraci su dolje, nema vodoravnog klizanja, dodavanje dodirom', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const nav = await page.getByRole('navigation', { name: 'Koraci' }).boundingBox();
    expect(nav!.y).toBeGreaterThan(600);

    const before = await page.locator('[data-testid^=element-]').count();
    await page.getByRole('navigation', { name: 'Koraci' }).getByRole('button', { name: /Elementi/ }).tap();
    await page.getByRole('button', { name: /U2 Dvostruka/ }).tap();
    await expect(page.locator('[data-testid^=element-]')).toHaveCount(before + 1);
    await expect(page.getByLabel('Naziv elementa')).toBeVisible();

    const field = page.getByLabel('Od poda (m)');
    await field.fill('0,55');
    await field.press('Enter');
    await expect(field).toHaveValue('0,55');
  });
});
