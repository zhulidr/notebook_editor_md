import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { closeCanvas, renderCanvas } from './canvas';

describe('canvas drag persistence', () => {
  let view: EditorView | undefined;
  let parent: HTMLElement | undefined;

  afterEach(() => {
    closeCanvas();
    view?.destroy();
    parent?.remove();
    view = undefined;
    parent = undefined;
  });

  it('将拖动后的节点坐标回写到 Canvas JSON 文档', () => {
    const source = JSON.stringify({
      nodes: [{ id: 'card-1', x: 100, y: 60, width: 180, height: 60, text: '任务' }],
      edges: [],
    }, null, 2);
    parent = document.createElement('div');
    const editorHost = document.createElement('div');
    document.body.append(parent, editorHost);
    view = new EditorView({ parent, state: EditorState.create({ doc: source }) });

    renderCanvas(source, editorHost, view);
    const board = editorHost.querySelector<HTMLElement>('.canvas-board')!;
    const node = editorHost.querySelector<HTMLElement>('.canvas-node')!;
    Object.defineProperty(board, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    Object.defineProperty(node, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 60, width: 180, height: 60 }),
    });

    node.querySelector<HTMLElement>('.canvas-node-label')!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 80 }),
    );
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 270, clientY: 180 }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(JSON.parse(view.state.doc.toString()).nodes[0]).toMatchObject({ x: 250, y: 160 });
  });
});
