import { readFileSync } from 'node:fs';

describe('help-circle icon asset', () => {
  test('contains SVG markup instead of a broken 404 payload', () => {
    const content = readFileSync(new URL('./help-circle.svg', import.meta.url), 'utf8');

    expect(content).toContain('<svg');
    expect(content).toContain('</svg>');
    expect(content).not.toContain('404: Not Found');
  });
});
