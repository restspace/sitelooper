/**
 * grafana fwgr88-luna-n1 05-set (s_7bf4f0): a read of the JSON model editor's
 * last line published "}", and unfreezeExpectations wildcarded every "}" in
 * the step's expectations, markers included. Both replays fell back at the
 * editor step (`… none of the 1 recorded page change(s) appeared (- textbox
 * "Editor content;…": {{*{{*}}{{*}})`), the pin was demoted and compile
 * refused the flow. Lines below are the recorded "before" side of the
 * skill's own transforms.
 */
import { describe, expect, it } from 'vitest';
import { maskPublishedValues } from '../src/skills/compile.js';

const EDITOR = '- textbox "Editor content;Press Alt+F1 for Accessibility Options.": {{*}}';

describe('maskPublishedValues never rewrites a marker (fwgr88-luna 05-set)', () => {
  it('leaves {{v1}}, {{v4}} and {{*}} alone when a read published "}"', () => {
    expect(maskPublishedValues('- link "{{v1}}"', ['}'])).toBe('- link "{{v1}}"');
    expect(maskPublishedValues('- textbox "New tag (enter key to add)": {{v4}}', ['}'])).toBe('- textbox "New tag (enter key to add)": {{v4}}');
    expect(maskPublishedValues(EDITOR, ['}'])).toBe(EDITOR);
  });

  it('skips a published value with no letter or digit', () => {
    expect(maskPublishedValues('- cell "a } b"', ['}'])).toBe('- cell "a } b"');
  });

  it('still wildcards a published value beside a marker', () => {
    expect(maskPublishedValues('- row "{{v1}} S00024 draft"', ['S00024'])).toBe('- row "{{v1}} {{*}} draft"');
  });
});
