import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'jsondiffpatch';

// The host (PandaSuite bridge), the room's socket and the Studio editor are
// the boundaries: each records what the component does with it. The room
// server applies patches as the real one does, and answers only when told to.
const host = vi.hoisted(() => ({ listeners: {}, sent: [], isStudio: false }));
const room = vi.hoisted(() => ({ handlers: {}, emitted: [] }));
const editor = vi.hoisted(() => ({ onChange: null }));

vi.mock('pandasuite-bridge', () => ({
  default: {
    UPDATED: '__ps_updated',
    get isStudio() {
      return host.isStudio;
    },
    init: (callback) => callback(),
    onLoad: (callback) => {
      host.listeners.load = callback;
    },
    onUpdate: (callback) => {
      host.listeners.update = callback;
    },
    listen: (name, callback) => {
      host.listeners[name] = callback;
    },
    send: (event, args) => host.sent.push({ event, args }),
    followStudioAppearance: () => {},
  },
}));
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event, handler) => {
      room.handlers[event] = handler;
    },
    emit: (event, patch) => room.emitted.push({ event, patch }),
    connect: () => {},
    disconnect: () => {},
  }),
}));
vi.mock('../src/ReactInitializer', () => ({
  initReact: (schema, onChange) => {
    editor.onChange = onChange;
  },
  updateReactSchema: () => {},
}));

const LONG =
  'This is a fairly long biography text that goes well beyond sixty characters in total.';
const EDITED =
  'This is a fairly long biography text, now edited, that goes well beyond sixty characters in total.';

const patcher = create();
const addNumbers = (context) => {
  if (Array.isArray(context.delta) && context.delta[2] === -8) {
    context.setResult(context.left + context.delta[1]).exit();
  }
};
addNumbers.filterName = 'numeric';
patcher.processor.pipes.patch.before('trivial', addNumbers);

let stored;
let answered;
const broadcast = () => room.handlers.schema(patcher.clone(stored));
// The server applies each patch it has not answered yet and broadcasts its schema after each one.
const answer = () => {
  room.emitted.slice(answered).forEach(({ patch }) => {
    stored = patcher.patch(stored, patcher.clone(patch));
    broadcast();
  });
  answered = room.emitted.length;
};
// The server loses the patches it has not answered yet.
const lose = () => {
  answered = room.emitted.length;
};
const shownToHost = () =>
  host.sent
    .filter((m) => m.args && m.args.queryable)
    .map((m) => m.args.queryable);

const start = async ({ studio }) => {
  vi.resetModules();
  host.listeners = {};
  host.sent = [];
  host.isStudio = studio;
  room.handlers = {};
  room.emitted = [];
  editor.onChange = null;
  stored = { firstName: 'Ana', credits: 10, bio: LONG };
  answered = 0;
  await import('../src/index');
  host.listeners.load({
    properties: {
      url: 'https://rooms.example/mo/socket/schema/',
      room: 'test',
    },
  });
  if (studio) {
    await vi.waitFor(() => expect(editor.onChange).toBeTypeOf('function'));
  }
  broadcast();
};

beforeEach(() => {
  vi.stubGlobal('document', { readyState: 'complete' });
  vi.stubGlobal('navigator', { language: 'en-US' });
});

describe('Studio editor', () => {
  it('stores an edit once when the editor reports it twice', async () => {
    await start({ studio: true });
    const data = patcher.clone(stored);
    data.credits = 42;
    data.bio = EDITED;

    editor.onChange(data);
    editor.onChange(data);
    answer();

    expect(stored).toEqual({ firstName: 'Ana', credits: 42, bio: EDITED });
    expect(shownToHost().at(-1)).toEqual(stored);
  });

  it('sends a changed text as its new value alone', async () => {
    await start({ studio: true });
    const data = patcher.clone(stored);
    data.bio = EDITED;

    editor.onChange(data);

    expect(room.emitted.map(({ patch }) => patch)).toEqual([{ bio: [EDITED] }]);
  });

  it('stores the last of two edits made before the server answers', async () => {
    await start({ studio: true });
    const data = patcher.clone(stored);
    data.credits = 42;
    editor.onChange(data);
    data.credits = 50;
    editor.onChange(data);
    answer();

    expect(stored.credits).toBe(50);
  });

  it('sends again an edit the server did not apply', async () => {
    await start({ studio: true });
    const data = patcher.clone(stored);
    data.credits = 42;
    editor.onChange(data);
    lose();
    data.firstName = 'Zed';
    editor.onChange(data);
    answer();

    expect(stored).toMatchObject({ firstName: 'Zed', credits: 42 });
  });
});

describe('change action', () => {
  const change = (modify) => host.listeners.change([{ modify }]);

  it('stores a set once when fired twice before the server answers', async () => {
    await start({ studio: false });
    change({ property: '/credits', func: 'set', value: 42 });
    change({ property: '/credits', func: 'set', value: 42 });
    answer();

    expect(stored.credits).toBe(42);
  });

  it('keeps both increments fired before the server answers', async () => {
    await start({ studio: false });
    change({ property: '/credits', func: 'inc', value: 3 });
    change({ property: '/credits', func: 'inc', value: 3 });
    answer();

    expect(stored.credits).toBe(16);
  });
});
