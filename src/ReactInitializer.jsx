import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSONEditor } from '@beingenious/jsoneditor';
import '@beingenious/jsoneditor/dist/style.css';
import PandaBridge, { Binder } from 'pandasuite-bridge';
import cloneDeep from 'lodash/cloneDeep';

let root = null;
let currentSchema = null;
let onSchemaChangeCallback = null;

function JSONEditorWrapper({ data, onDataChange }) {
  const safeData = React.useMemo(() => (data ? cloneDeep(data) : {}), [data]);

  const { __ps_externalPaths: externalPaths, __ps_screens: rawScreens } =
    PandaBridge.properties || {};

  let jsonEditorMisc = { screens: [] };

  if (Array.isArray(rawScreens)) {
    const screens = rawScreens
      .map((item) => item && item.value)
      .filter((value) => value && value.did)
      .map((value) => ({
        id: value.did,
        name: value.name || value.did,
      }));

    jsonEditorMisc = { screens };
  }

  return (
    <JSONEditor
      data={safeData}
      misc={jsonEditorMisc}
      onChange={onDataChange}
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

function handleDataChange(newData) {
  if (onSchemaChangeCallback) {
    onSchemaChangeCallback(newData);
  }
}

export function initReact(initialSchema = {}, onSchemaChange = null) {
  currentSchema = initialSchema;
  onSchemaChangeCallback = onSchemaChange;

  const rootEl = document.createElement('div');
  rootEl.id = 'react-root';
  document.body.appendChild(rootEl);

  root = createRoot(rootEl);
  root.render(
    <JSONEditorWrapper data={currentSchema} onDataChange={handleDataChange} />,
  );
}

export function updateReactSchema(newSchema = {}) {
  if (!root) return;

  currentSchema = newSchema;
  root.render(
    <JSONEditorWrapper data={currentSchema} onDataChange={handleDataChange} />,
  );
}
