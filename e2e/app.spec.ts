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
  await expect.poll(async () => Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(20);
  const box = await page.getByTestId('mjerna-traka').boundingBox();
  expect(box!.width).toBeGreaterThan(40);

  // Mjerilo i dimenzije čitaju se u istom trenutku, da promjena veličine ne utječe na rezultat.
  const { scale, ratios } = await svg.evaluate((el) => ({
    scale: Number(el.getAttribute('data-scale')),
    ratios: [...el.querySelectorAll('rect[stroke="#111111"][fill="none"]')].map((r) => {
      const bb = (r as SVGRectElement).getBBox();
      return [bb.width, bb.height];
    }),
  }));
  // Zidovi 2,90 i 5,90 m, strop 5,90 × 2,90 m, visina 2,60 m
  const sizes = ratios.map(([w, h]) => [w / scale, h / scale]);
  expect(sizes.some(([w, h]) => Math.abs(w - 2.9) < 1e-3 && Math.abs(h - 2.6) < 1e-3)).toBe(true);
  expect(sizes.some(([w, h]) => Math.abs(w - 5.9) < 1e-3 && Math.abs(h - 2.6) < 1e-3)).toBe(true);
  expect(sizes.some(([w, h]) => Math.abs(w - 5.9) < 1e-3 && Math.abs(h - 2.9) < 1e-3)).toBe(true);
});

test('kotačić zumira oko pokazivača, povlačenje podloge pomiče nacrt', async ({ page }) => {
  const svg = page.locator('svg[data-scale]');
  const area = (await page.getByTestId('nacrt').boundingBox())!;
  const before = Number(await svg.getAttribute('data-scale'));
  const box1 = (await page.getByTestId('element-U-8').locator('rect').boundingBox())!;
  await page.mouse.move(box1.x, box1.y);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => Number(await svg.getAttribute('data-scale'))).toBeGreaterThan(before * 1.3);
  const box2 = (await page.getByTestId('element-U-8').locator('rect').boundingBox())!;
  expect(Math.abs(box2.x - box1.x)).toBeLessThan(3);
  expect(Math.abs(box2.y - box1.y)).toBeLessThan(3);

  const start = await svg.evaluate((el) => el.style.transform);
  await page.mouse.move(area.x + 10, area.y + area.height - 80);
  await page.mouse.down();
  await page.mouse.move(area.x + 70, area.y + area.height - 50, { steps: 4 });
  await page.mouse.up();
  expect(await svg.evaluate((el) => el.style.transform)).not.toBe(start);
});

test('vrata se povlače po podu i zaključaju, kote su vidljive', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const door = page.getByTestId('otvor-door-west').locator('rect');
  const box = (await door.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 - 60, { steps: 6 });
  await expect(page.getByTestId('otvor-status')).toContainText('Vrata do poda');
  await page.mouse.up();
  await expect(page.getByTestId('otvor-status')).toHaveCount(0);
  const after = (await door.boundingBox())!;
  expect(after.x).toBeGreaterThan(box.x + 4);
  expect(after.y + after.height).toBeCloseTo(box.y + box.height, 0);
  await page.getByRole('button', { name: 'Poništi' }).click();
  expect((await door.boundingBox())!.x).toBeCloseTo(box.x, 0);
});

test('namještaj se dodaje, spaja i ne ide preko vrata', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const add = async (room: string, name: RegExp) => {
    await page.getByRole('button', { name: 'Dodaj novi element' }).click();
    await page.getByRole('button', { name: room, exact: true }).click();
    await page.getByRole('button', { name }).click();
    await page.getByLabel('Zid elementa').selectOption('north');
    await page.getByRole('button', { name: 'Dodaj element', exact: true }).click();
  };
  await add('Kuhinja', /^Hladnjak\s*60/);
  await add('Ostalo', /^Ormar 100/);
  const fridge = page.getByTestId('namjestaj-Hladnjak').locator('rect');
  const wardrobe = page.getByTestId('namjestaj-Ormar 100').locator('rect');
  const a = (await fridge.boundingBox())!;
  const b = (await wardrobe.boundingBox())!;
  // Stoje jedan uz drugi
  expect(Math.abs(a.x + a.width - b.x)).toBeLessThan(1.5);

  // Povlačenje preko susjeda se odbija i element ostaje gdje je bio
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, b.y + b.height / 2, { steps: 6 });
  await expect(page.getByTestId('otvor-status')).toContainText('Preklapa');
  await page.mouse.up();
  expect((await wardrobe.boundingBox())!.x).toBeCloseTo(b.x, 0);

  // Sloj se može sakriti
  await page.getByRole('button', { name: 'Slojevi' }).click();
  await page.getByLabel('Namještaj').uncheck();
  await expect(page.getByTestId('namjestaj-Hladnjak')).toHaveCount(0);
});

test('kategorija se sklapa, ostaje vidljiva i pamti se', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const header = page.getByTestId('sekcija-prostorija-otvori');
  await expect(page.getByRole('button', { name: 'Dodaj', exact: true })).toBeVisible();
  await header.click();
  await expect(page.getByRole('button', { name: 'Dodaj', exact: true })).toHaveCount(0);
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(header).toContainText('3');
  await page.reload();
  await expect(page.getByTestId('nacrt')).toBeVisible();
  await step(page, '1 Prostorija').click();
  await expect(page.getByTestId('sekcija-prostorija-otvori')).toHaveAttribute('aria-expanded', 'false');
});

test('3D prikaz s namještajem radi bez grešaka', async ({ page }) => {
  await page.getByRole('button', { name: '3D' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Slojevi' }).click();
  await page.getByLabel('Namještaj').uncheck();
  await page.waitForTimeout(200);
  await page.getByLabel('Namještaj').check();
  await page.waitForTimeout(200);
});

test('katalog vodi od izbora preko prilagodbe do potvrde', async ({ page }) => {
  await step(page, '1 Prostorija').click();
  const before = await page.locator('[data-testid^=namjestaj-]').count();
  await page.getByRole('button', { name: 'Dodaj novi element' }).click();
  await page.getByRole('button', { name: 'Dnevni boravak', exact: true }).click();
  await page.getByRole('button', { name: /^Viseći regal 120/ }).click();
  await expect(page.locator('[data-testid^=namjestaj-]')).toHaveCount(before);
  await page.getByLabel('Širina', { exact: true }).fill('1,1');
  await page.getByLabel('Širina', { exact: true }).press('Enter');
  await page.getByLabel('Zid elementa').selectOption('north');
  await page.getByRole('button', { name: 'Dodaj i nastavi' }).click();
  await expect(page.locator('[data-testid^=namjestaj-]')).toHaveCount(before + 1);
  await expect(page.getByRole('button', { name: /^Viseći regal 80/ })).toBeVisible();
  await page.getByRole('button', { name: 'Odustani' }).click();
  await expect(page.getByTestId('namjestaj-Viseći regal 120').locator('title')).toContainText('1,10 × 0,35 × 0,30');
});

test('obavijest o pećnici nudi rješenje koje je stvarno uklanja', async ({ page }) => {
  await expect(page.locator('footer')).toContainText('SK-3 87');
  await step(page, '4 Provjera i ispis').click();
  await expect(page.getByTestId('nacrt').locator('..').locator('..')).toBeVisible();
  await expect(page.getByText(/Rješenje: fiksni priključak/)).toBeVisible();

  await page.getByRole('button', { name: 'Prikaži rješenja' }).click();
  await expect(page.getByTestId('promjene-mreze')).toContainText('fiksni priključak');
  await page.getByRole('button', { name: 'Odustani' }).click();
  await expect(page.locator('footer')).toContainText('SK-3 87');

  await page.getByRole('button', { name: 'Prikaži rješenja' }).click();
  await page.getByRole('button', { name: 'Primijeni' }).click();
  await expect(page.locator('footer')).not.toContainText('SK-3');
  await expect(page.getByRole('button', { name: 'Prikaži rješenja' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Poništi' }).click();
  await expect(page.locator('footer')).toContainText('SK-3 87');
});

test('tipka u koraku trošila traži potvrdu i ispisuje promjene', async ({ page }) => {
  await step(page, '3 Trošila i krugovi').click();
  await page.getByRole('button', { name: /^Ugradbena pećnica\s*3200/ }).click();
  const before = await page.locator('[data-testid^=element-]').count();
  await page.getByRole('button', { name: 'Automatski prilagodi mrežu' }).click();
  await expect(page.getByTestId('promjene-mreze')).toContainText('Ugradbena pećnica');
  await page.getByRole('button', { name: 'Odustani' }).click();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(before);
  await page.getByRole('button', { name: 'Automatski prilagodi mrežu' }).click();
  await page.getByRole('button', { name: 'Primijeni' }).click();
  await expect(page.locator('[data-testid^=element-]')).toHaveCount(before + 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('trošilo se dodjeljuje povlačenjem na utičnicu i vidi se kao tag', async ({ page }) => {
  await step(page, '3 Trošila i krugovi').click();
  await page.getByRole('button', { name: /Mikrovalna/ }).click();
  const row = page.getByTestId('trosilo-Mikrovalna pećnica');
  await expect(row).toBeVisible();
  const from = (await row.boundingBox())!;
  const socket = (await page.getByTestId('element-U-8').locator('rect').boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(socket.x + 2, socket.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('tag-U-8')).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Odvoji Mikrovalna pećnica' }).first()).toBeVisible();
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
  await expect(page.getByLabel('Od lijevog kuta (m)')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click();
  const offset = page.getByLabel('Od lijevog kuta (m)');
  await offset.fill('9');
  await offset.press('Enter');
  await expect(page.getByRole('button', { name: 'Dodaj na zid' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('prelazi rub');

  await offset.fill('0,4');
  await offset.press('Enter');
  await page.getByLabel('Visina (m)', { exact: true }).nth(1).fill('1,25');
  await page.getByLabel('Parapet od poda (m)').fill('1,1');
  await page.getByLabel('Parapet od poda (m)').press('Enter');
  await page.getByRole('button', { name: 'Dodaj na zid' }).click();
  await expect(page.locator('[data-testid=nacrt]')).toContainText('Prozor');
  await expect(page.getByTestId('sekcija-prostorija-otvori')).toContainText('4');
  await expect(page.getByLabel('Od lijevog kuta (m)')).toHaveCount(0);
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
  const padding = await page.locator('.print-page').first().evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.paddingLeft, style.paddingTop, style.paddingRight, style.paddingBottom].map(parseFloat);
  });
  const mm = 96 / 25.4;
  expect(padding[0]).toBeCloseTo(15 * mm, 0);
  expect(padding[1]).toBeCloseTo(12 * mm, 0);
  expect(padding[2]).toBeCloseTo(10 * mm, 0);
  expect(padding[3]).toBeCloseTo(12 * mm, 0);
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
