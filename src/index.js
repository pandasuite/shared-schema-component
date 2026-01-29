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
  const patch = diffpatcher.diff(schema, newSchema);
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
    const { property, func, value } = op || {};

    const newSchema = merge({}, schema);

    const changed = ModifyData.applyInPlace(
      newSchema,
      {
        property,
        func,
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

    const patch = diffpatcher.diff(schema, newSchema);
    if (changed && patch) {
      socket.emit('schema', patch);
    }
  });

  PandaBridge.listen('reset', () => {
    socket.emit('reset');
  });
});
