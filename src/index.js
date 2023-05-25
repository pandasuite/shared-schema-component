import PandaBridge from 'pandasuite-bridge';
import { io } from 'socket.io-client';
import { create } from 'jsondiffpatch';

import merge from 'lodash/merge';
import compact from 'lodash/compact';
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';
import pull from 'lodash/pull';
import remove from 'lodash/remove';
import isArray from 'lodash/isArray';
import isEmpty from 'lodash/isEmpty';

import JSONPointer from '@beingenious/jsonpointer';

import './index.css';

const diffpatcher = create();
const NUMERIC_DIFFERENCE = -8;

const numericDiffFilter = (context) => {
  if (typeof context.left === 'number' && typeof context.right === 'number' && context.right !== context.left) {
    context.setResult([0, context.right - context.left, NUMERIC_DIFFERENCE]).exit();
  }
};
numericDiffFilter.filterName = 'numeric';
diffpatcher.processor.pipes.diff.before('trivial', numericDiffFilter);

let properties = null;
let socket = null;
let schema = {};

const initSocketIO = () => {
  const { url } = properties || {};
  let { room } = properties || {};

  if (!url) {
    return;
  }

  if (PandaBridge.isStudio && isEmpty(room)) {
    room = Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15);

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
    schema = newSchema;

    PandaBridge.send(PandaBridge.UPDATED, {
      queryable: schema,
    });
  });
};

const getPointer = (data, pointer) => {
  let resolvedPointer = [];

  const value = JSONPointer.resolvePointer(
    data,
    JSONPointer.getPointerByJSONPointer(pointer),
    {
      unitPool: {
        language: navigator.language.replace('-', '_'),
      },
    }, undefined, undefined, resolvedPointer,
  );

  if (!value) {
    resolvedPointer = compact(pointer.replace(/@[^:]+:/g, '').split('/'));
  }
  return resolvedPointer;
};

PandaBridge.init(() => {
  PandaBridge.onLoad((pandaData) => {
    properties = pandaData.properties;

    if (document.readyState === 'complete') {
      initSocketIO();
    } else {
      document.addEventListener('DOMContentLoaded', initSocketIO, false);
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

  PandaBridge.listen('change', ([{ data: key, function: func, value }]) => {
    const pointer = getPointer(schema, key);
    const newSchema = merge({}, schema);

    const existingValue = get(schema, pointer);

    if (func === 'set') {
      set(newSchema, pointer, value);
    } else if (func === 'inc') {
      set(newSchema, pointer, (parseFloat(existingValue) || 0) + parseInt(value));
    } else if (func === 'dec') {
      set(newSchema, pointer, (parseFloat(existingValue) || 0) - parseInt(value));
    } else if (func === 'del') {
      unset(newSchema, pointer);
    } else if (func === 'add') {
      const existingArray = get(newSchema, pointer);

      if (!isArray(existingArray)) {
        set(newSchema, pointer, [value]);
      } else {
        existingArray.push(value);
      }
    } else if (func === 'delbyid') {
      const existingArray = get(newSchema, pointer);

      if (isArray(existingArray)) {
        remove(existingArray, (row) => row.id === value);
      }
    } else if (func === 'delbyvalue') {
      const existingArray = get(newSchema, pointer);

      if (isArray(existingArray)) {
        pull(existingArray, value);
      }
    }

    const patch = diffpatcher.diff(schema, newSchema);
    if (patch) {
      socket.emit('schema', patch);
    }
  });

  PandaBridge.listen('reset', () => {
    socket.emit('reset');
  });
});
