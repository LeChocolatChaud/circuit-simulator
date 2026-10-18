import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Solution ready');
});

test('inspects element power, node voltage, and branch current', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Inspect R1', exact: true }).click();
  const popup = page.getByRole('complementary', {
    name: 'Measurement inspector',
  });
  await expect(popup).toContainText('8 V');
  await expect(popup).toContainText('4 mA');
  await expect(popup).toContainText('32 mW');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Inspect node R1.N', exact: true })
    .click();
  await expect(popup).toContainText('4 V');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Wire W1', exact: true })
    .locator('.wire-pick-target')
    .click();
  await expect(popup).toContainText('-4 mA');
});

test('edits values, labels, and reference; keeps measurements stale until rerun', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Inspect R1', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'resistance', exact: true })
    .fill('1kOhm');
  await page
    .getByRole('textbox', { name: 'resistance', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('complementary', { name: 'Measurement inspector' }),
  ).toContainText('Run analysis to update');
  await page
    .getByRole('button', { name: 'Run analysis', exact: false })
    .click();
  await expect(page.getByRole('status')).toHaveText('Solution ready');
  await expect(
    page.getByRole('complementary', { name: 'Measurement inspector' }),
  ).toContainText('6 mA');
  await page
    .getByRole('textbox', { name: 'Element or node label' })
    .fill('Series resistor');
  await page
    .getByRole('textbox', { name: 'Element or node label' })
    .press('Enter');
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/label="Series resistor"/);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Inspect node V1.P', exact: true })
    .click();
  await page.getByRole('button', { name: 'Set as reference' }).click();
  await page
    .getByRole('button', { name: 'Run analysis', exact: false })
    .click();
  await expect(page.getByRole('status')).toHaveText('Solution ready');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Inspect node R1.N', exact: true })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'Measurement inspector' }),
  ).toContainText('-6 V');
});

test('retains the last valid schematic through text errors and supports undo/redo', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: 'Circuit description' });
  const original = await editor.inputValue();
  await editor.fill(`${original}\ninvalid declaration`);
  await expect(page.getByLabel('Circuit diagnostics')).toContainText(
    'Unknown declaration',
  );
  await expect(
    page.getByRole('button', { name: 'Inspect R1', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Run analysis', exact: false }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).toHaveValue(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor).toHaveValue(`${original}\ninvalid declaration`);
});

test('runs transient analysis and updates the time cursor and inspector', async ({
  page,
}) => {
  await page.getByRole('combobox', { name: 'Load example' }).selectOption('rc');
  await page
    .getByRole('button', { name: 'Run analysis', exact: false })
    .click();
  await expect(page.getByRole('status')).toHaveText('Solution ready');
  await expect(page.getByLabel('Transient waveform')).toBeVisible();
  await page.getByRole('slider', { name: 'Time cursor' }).fill('100');
  await page
    .getByRole('button', { name: 'Inspect node R1.N', exact: true })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'Measurement inspector' }),
  ).toContainText('3.151 V');
  await expect(page.getByLabel('Waveform viewer')).toContainText('10 ms');
});

test('pins labels, saves locally, exports and imports versioned projects', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Inspect node R1.N', exact: true })
    .click();
  const pin = page.getByRole('textbox', { name: 'Pinned measurement label' });
  await pin.fill('Measured output');
  await pin.press('Enter');
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/Measured output/);
  await expect(page.getByText('Saved on this device')).toBeVisible();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export project' }).click(),
  ]);
  expect(file.suggestedFilename()).toBe('voltage-divider.circuit.json');
  const path = await file.path();
  expect(path).not.toBeNull();
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/Measured output/);
  await page.getByRole('button', { name: 'New circuit', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Untitled circuit',
  );
  await page.getByLabel('Project file').setInputFiles(path!);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Voltage divider',
  );
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/Measured output/);
});

test('adds and connects components and arranges the schematic', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add Resistor', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Inspect R3', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Connect nodes', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect node R3.P', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect node V1.P', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/wire W4 R3.P V1.P/);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Arrange', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/# Click an element/);
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/resistor R3.*rotate=/);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Layout failed' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: '/tmp/circuit-studio-arranged.png',
    fullPage: true,
  });
});

test('reports floating voltages without treating zero current as unknown', async ({
  page,
}) => {
  await page
    .getByRole('combobox', { name: 'Load example' })
    .selectOption('open');
  await page
    .getByRole('button', { name: 'Run analysis', exact: false })
    .click();
  await expect(page.getByRole('status')).toHaveText('Solution ready');
  await expect(page.getByLabel('Circuit diagnostics')).toContainText(
    'Indeterminate node voltage',
  );
  await page.getByRole('button', { name: 'Inspect R2', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Measurement inspector' }),
  ).toContainText('0 A');
});

test('works at a narrow viewport without document overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('button', { name: 'Run analysis', exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: '/tmp/circuit-studio-mobile.png',
    fullPage: true,
  });
});

test('renders the complete workbench without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Solution ready');
  await page.screenshot({
    path: '/tmp/circuit-studio-desktop.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('moves and rotates a component and avoids terminal-name collisions after deletion', async ({
  page,
}) => {
  const editor = page.getByRole('textbox', { name: 'Circuit description' });
  const before = await editor.inputValue();
  const box = await page
    .getByRole('button', { name: 'Inspect R1', exact: true })
    .locator('.component-hit')
    .boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 40,
    box!.y + box!.height / 2 + 20,
  );
  await page.mouse.up();
  await expect(editor).not.toHaveValue(before);
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  await expect(editor).toHaveValue(/resistor R1.*rotate=90/);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Add Resistor', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Add Resistor', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Inspect R3', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Run analysis', exact: false }),
  ).toBeEnabled();
  expect(await editor.inputValue()).toContain('resistor R3');
});

test('imports plain circuit text with automatic layout and reports unavailable browser storage', async ({
  page,
}) => {
  const source =
    'circuit "Imported circuit"\nnode a\nnode gnd\nreference gnd\nvoltage_source V1 (a,gnd) dc=5V\nresistor R1 (a,gnd) resistance=1kOhm\nanalysis dc\n';
  await page.getByLabel('Project file').setInputFiles({
    name: 'simple.cir',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Imported circuit',
  );
  const editor = page.getByRole('textbox', { name: 'Circuit description' });
  await expect(editor).toHaveValue(/node a at=\(/);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await editor.fill(
    `${await editor.inputValue()}\n# Keep working without storage\n`,
  );
  await expect(
    page.getByText('Local save unavailable · export a copy'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export project' }),
  ).toBeEnabled();
});

test('right-click opens the site inspector and its expanded contents scroll without zooming the canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .getByRole('button', { name: 'Inspect V1', exact: true })
    .click({ button: 'right' });
  const inspector = page.getByRole('complementary', {
    name: 'Measurement inspector',
  });
  await expect(inspector).toBeVisible();
  await expect(
    inspector
      .locator('.inspector-heading')
      .getByRole('button', { name: 'Rotate', exact: true }),
  ).toBeVisible();
  await inspector.getByText('Terminals & model settings').click();
  const scroll = page.getByLabel('Inspector details');
  await scroll.hover();
  await page.mouse.wheel(0, 600);
  await expect(
    inspector.getByRole('combobox', { name: 'Source waveform' }),
  ).toBeVisible();
  await inspector
    .getByRole('combobox', { name: 'Source waveform' })
    .selectOption('pulse');
  await scroll.hover();
  const scale = await page.locator('.zoom-controls > span').textContent();
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    inspector.getByRole('textbox', { name: 'Period', exact: true }),
  ).toBeInViewport();
  expect(await page.locator('.zoom-controls > span').textContent()).toBe(scale);
  await expect(
    inspector
      .locator('.inspector-heading')
      .getByRole('button', { name: 'Rotate', exact: true }),
  ).toBeInViewport();
  const box = await inspector.boundingBox();
  const canvas = await page.locator('.canvas').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    canvas!.y + canvas!.height + 1,
  );
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .locator('.schematic')
    .click({ button: 'right', position: { x: 12, y: 12 } });
  await expect(
    page.getByRole('menu', { name: 'Canvas actions' }),
  ).toBeVisible();
});

test('persists dark mode and expands the visual editor', async ({ page }) => {
  await page
    .getByRole('button', { name: 'Switch to dark mode', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const before = await page.locator('.canvas').boundingBox();
  await page
    .getByRole('button', { name: 'Expand editor', exact: true })
    .click();
  const after = await page.locator('.canvas').boundingBox();
  expect(after!.width).toBeGreaterThan(before!.width);
  expect(after!.height).toBeGreaterThan(before!.height);
  await page
    .getByRole('button', { name: 'Inspect R1', exact: true })
    .click({ button: 'right' });
  await page.screenshot({
    path: '/tmp/circuit-studio-dark-expanded.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Restore editor', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Switch to light mode', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('new elements have permanent endpoint nodes and context inspection after rotation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add Resistor', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Circuit description' });
  expect(await editor.inputValue()).toMatch(/resistor R3 resistance=1kOhm/);
  expect(await editor.inputValue()).not.toContain('node R3_p');
  await page
    .getByRole('button', { name: 'Rotate element', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  const centers = await page.evaluate(() => {
    const matrix = (selector: string) => {
      const element = document.querySelector(selector) as SVGGraphicsElement;
      return element.transform.baseVal.consolidate()!.matrix;
    };
    const c = matrix('[data-kind="component"][data-id="R3"]');
    const p = matrix('[data-kind="node"][data-id="R3.P"]');
    const n = matrix('[data-kind="node"][data-id="R3.N"]');
    return {
      c: { x: c.e, y: c.f },
      p: { x: p.e, y: p.f },
      n: { x: n.e, y: n.f },
    };
  });
  expect(centers.p).toEqual({ x: centers.c.x, y: centers.c.y - 48 });
  expect(centers.n).toEqual({ x: centers.c.x, y: centers.c.y + 48 });
  await page
    .getByRole('button', { name: 'Inspect node R3.P', exact: true })
    .click({ button: 'right' });
  await expect(
    page.getByRole('complementary', { name: 'Measurement inspector' }),
  ).toContainText('R3.P');
});
