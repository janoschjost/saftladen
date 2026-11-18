// Records the credits scene for the README: `npm run dev` in another terminal, then `node scripts/record-credits.mjs [url]`.
// Writes docs/credits.gif (needs ffmpeg).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5175/credits';
const SECONDS = 13;
const dir = mkdtempSync(join(tmpdir(), 'credits-'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 }, recordVideo: { dir, size: { width: 1000, height: 620 } } });
await page.goto(url);
await page.waitForTimeout(SECONDS * 1000);
await page.close();
await browser.close();
const video = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
const palette = join(dir, 'palette.png');
const filters = 'fps=8,scale=600:-1:flags=lanczos';
execFileSync('ffmpeg', ['-y', '-ss', '1', '-i', video, '-vf', `${filters},palettegen=max_colors=64:stats_mode=diff`, palette], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-ss', '1', '-i', video, '-i', palette, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`, 'docs/credits.gif'], { stdio: 'inherit' });
rmSync(dir, { recursive: true, force: true });
