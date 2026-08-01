// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  renderSequenceDiagram,
  renderSequenceDiagrams,
} from '../../src/render/mermaid/sequence.js';
import { makeUseCase } from './fixtures.js';
import { assertValidMermaid } from './helpers/mermaid.js';

describe('renderSequenceDiagram', () => {
  it('renders participants, messages and failure notes', () => {
    expect(renderSequenceDiagram(makeUseCase())).toMatchSnapshot();
  });

  it('emits valid Mermaid', async () => {
    await assertValidMermaid(renderSequenceDiagram(makeUseCase()));
  });

  it('handles a single-step use case with no failure paths', async () => {
    const uc = makeUseCase({
      happyPath: [{ actor: 'user', action: 'opens the app' }],
      failurePaths: [],
    });
    await assertValidMermaid(renderSequenceDiagram(uc));
  });

  it('joins multiple use cases', () => {
    const out = renderSequenceDiagrams([makeUseCase(), makeUseCase({ id: 'uc2' })]);
    expect(out.split('```mermaid').length - 1).toBe(2);
  });
});
