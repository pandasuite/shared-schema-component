import PandaBridge from 'pandasuite-bridge';
import { io } from 'socket.io-client';
import { create } from 'jsondiffpatch';

import merge from 'lodash/merge';
import isEmpty from 'lodash/isEmpty';

import { ModifyData } from '@beingenious/jsonpointer';

import './index.css';

const diffpatcher = create();
const NUMERIC_DIFFERENCE = -8;

const numericDiffFilter = (context) => {
  if (
    typeof context.left === 'number' &&
    typeof context.right === 'number' &&
    context.right !== context.left
  ) {
    context
      .setResult([0, context.right - context.left, NUMERIC_DIFFERENCE])
      .exit();
  }
};
numericDiffFilter.filterName = 'numeric';
diffpatcher.processor.pipes.diff.before('trivial', numericDiffFilter);

// Changes other than increments go as values, and texts whole, so that a
// change sent twice, or diffed from a schema the server has since moved past,
// lands the same (#4). Increments keep the differences above, which the server
// adds up.
const valuePatcher = create({ textDiff: { minLength: Infinity } });
const ADDITIVE_FUNCTIONS = ['inc', 'dec'];

let properties = null;
let socket = null;
let schema = {};
let reactModule = null;

const initSocketIO = () => {
  const { url } = properties || {};
  let { room } = properties || {};

  if (!url) {
    return;
  }

  if (PandaBridge.isStudio && isEmpty(room)) {
    room =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    PandaBridge.send(PandaBridge.UPDATED, {
      properties: [
        {
          id: 'room',
          value: room,
        },
      ],
    });
  }

  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname;

  socket = io(parsedUrl.origin, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    query: {
      room,
    },
    path,
  });

  socket.on('connect', () => {
    PandaBridge.send('onSignedIn');
  });

  socket.on('disconnect', (reason) => {
    PandaBridge.send('onSignedOut');

    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.on('schema', (newSchema) => {
    // Ne mettre à jour que si le schéma a vraiment changé
    const patch = diffpatcher.diff(schema, newSchema);
    if (!patch) {
      return;
    }

    schema = newSchema;

    PandaBridge.send(PandaBridge.UPDATED, {
      queryable: schema,
    });

    if (PandaBridge.isStudio && reactModule) {
      reactModule.updateReactSchema(schema);
    }
  });
};

const emitSchemaChange = (newSchema) => {
  if (!newSchema || !socket) {
    return;
  }
  const patch = valuePatcher.diff(schema, newSchema);
  if (patch) {
    socket.emit('schema', patch);
  }
};

const initSharedSchema = () => {
  initSocketIO();
  if (PandaBridge.isStudio) {
    import('./ReactInitializer').then((module) => {
      reactModule = module;
      module.initReact(schema, emitSchemaChange);
    });
  }
};

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSharedSchema, false);
    } else {
      initSharedSchema();
    }
  });

  PandaBridge.onUpdate((pandaData) => {
    properties = pandaData.properties;

    if (socket) {
      socket.disconnect();
    }
    initSocketIO();
  });

  /* Actions */

  PandaBridge.listen('change', ([payload]) => {
    const op =
      payload?.modify && typeof payload.modify === 'object'
        ? payload.modify
        : payload;
    // Actions saved before the `modify` parameter (2.2.0) store the target
    // and the function as `data` and `function`.
    const { property, data, func, function: legacyFunc, value } = op || {};
    const modifyFunc = func ?? legacyFunc;

    const newSchema = merge({}, schema);

    const changed = ModifyData.applyInPlace(
      newSchema,
      {
        property: property ?? data,
        func: modifyFunc,
        value,
      },
      {
        obj: {
          unitPool: {
            language: navigator.language.replace('-', '_'),
          },
        },
      },
    );

    const patcher = ADDITIVE_FUNCTIONS.includes(modifyFunc)
      ? diffpatcher
      : valuePatcher;
    const patch = patcher.diff(schema, newSchema);
    if (changed && patch) {
      socket.emit('schema', patch);
    }
  });

  PandaBridge.listen('reset', () => {
    socket.emit('reset');
  });
});
