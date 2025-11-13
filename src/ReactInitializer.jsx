import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSONEditor } from '@beingenious/jsoneditor';
import '@beingenious/jsoneditor/dist/style.css';
import PandaBridge, { Binder } from 'pandasuite-bridge';

let root = null;
let currentSchema = null;

function JSONEditorWrapper({ data }) {
  const { __ps_externalPaths: externalPaths } = PandaBridge.properties || {};

  return (
    <JSONEditor
      data={data}
      externalPaths={externalPaths}
      bindingResolvers={{
        resolveShortTags: Binder.resolveShortTags,
        compatExpression: Binder.compatExpression,
      }}
      config={{
        title: null,
        viewSwitchControl: true,
        buttonSave: false,
        readOnly: false,
        view: 'raw',
        gridView: {
          sideBar: false,
        },
        rawView: {
          importJson: false,
          exportJson: false,
          formatJson: false,
          compressJson: false,
        },
      }}
    />
  );
}

export function initReact(initialSchema = {}) {
  currentSchema = initialSchema;

  const rootEl = document.createElement('div');
  rootEl.id = 'react-root';
  document.body.appendChild(rootEl);

  root = createRoot(rootEl);
  root.render(<JSONEditorWrapper data={currentSchema} />);
}

export function updateReactSchema(newSchema = {}) {
  if (!root) return;

  currentSchema = newSchema;
  root.render(<JSONEditorWrapper data={currentSchema} />);
}
