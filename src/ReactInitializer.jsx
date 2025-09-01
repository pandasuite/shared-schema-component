import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSONEditor } from '@beingenious/jsoneditor';
import '@beingenious/jsoneditor/dist/style.css';

let root = null;
let currentSchema = null;

function JSONEditorWrapper({ data }) {
  return (
    <JSONEditor
      data={data}
      config={{
        title: null,
        viewSwitchControl: true,
        buttonSave: false,
        readOnly: true,
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
