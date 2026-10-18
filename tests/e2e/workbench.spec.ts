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
    .getByRole('button', { name: 'Inspect node out', exact: true })
    .click();
  await expect(popup).toContainText('4 V');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Wire W1', exact: true }).click();
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
    .getByRole('button', { name: 'Inspect node supply', exact: true })
    .click();
  await page.getByRole('button', { name: 'Set as reference' }).click();
  await page
    .getByRole('button', { name: 'Run analysis', exact: false })
    .click();
  await expect(page.getByRole('status')).toHaveText('Solution ready');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Inspect node out', exact: true })
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
    .getByRole('button', { name: 'Inspect node out', exact: true })
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
    .getByRole('button', { name: 'Inspect node out', exact: true })
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
    .getByRole('button', { name: 'Inspect node R3_p0', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect node supply', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/wire W2 R3_p0 supply/);
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Arrange', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await expect(
    page.getByRole('textbox', { name: 'Circuit description' }),
  ).toHaveValue(/# A simple starting point/);
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
    page.getByRole('button', { name: 'Inspect R4', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Run analysis', exact: false }),
  ).toBeEnabled();
  expect(await editor.inputValue()).not.toContain('resistor R3');
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
