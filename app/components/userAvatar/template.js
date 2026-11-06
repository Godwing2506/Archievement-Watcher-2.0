const template = `
  <style>
    :host {
      display: block;
      position: relative;
      box-sizing: content-box;
      width: 96px;
      height: 96px;
      margin: 10px;
      overflow: hidden;
      border: solid white 2px;
      background: url(../resources/img/avatar.png) center / cover no-repeat;
      background-color: #27374a;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2), 0 6px 20px rgba(0, 0, 0, 0.19);
    }

    :host(.round) {
      border-radius: 50%;
    }

    :host(:hover) {
      cursor: pointer;
      box-shadow: rgba(198, 212, 223, 0.5) 0 0 8px 2px;
    }

    #avatar-image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      transform-origin: center;
      user-select: none;
      -webkit-user-drag: none;
    }

    #avatar-image[aria-disabled="true"] {
      cursor: wait;
    }

    #avatar-editor {
      width: min(340px, calc(100vw - 32px));
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 20px;
      border: 1px solid rgba(102, 192, 244, 0.45);
      border-radius: 12px;
      color: #d9dfe4;
      background: #17212d;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
      font: 14px/1.45 system-ui, sans-serif;
    }

    #avatar-editor::backdrop {
      background: rgba(3, 8, 14, 0.76);
      backdrop-filter: blur(3px);
    }

    #avatar-editor h2 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    #avatar-editor .instructions {
      margin: 0 0 14px;
      color: #b7c5d3;
    }

    #crop-viewport {
      position: relative;
      width: min(256px, calc(100vw - 80px));
      aspect-ratio: 1;
      margin: 0 auto 16px;
      overflow: hidden;
      border: 1px solid rgba(102, 192, 244, 0.65);
      background: #0c131c;
      cursor: grab;
      touch-action: none;
    }

    #crop-viewport.round {
      border-radius: 50%;
    }

    #crop-viewport:active {
      cursor: grabbing;
    }

    #crop-image {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      transform-origin: center;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }

    #avatar-editor label {
      display: block;
      margin-bottom: 6px;
      font-weight: 600;
    }

    #zoom-control {
      display: block;
      width: 100%;
      margin: 0 0 18px;
      accent-color: #66c0f4;
    }

    #avatar-editor .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    #avatar-editor button {
      min-height: 34px;
      padding: 6px 12px;
      border: 1px solid rgba(177, 196, 214, 0.35);
      border-radius: 6px;
      color: #d9dfe4;
      background: #263648;
      font: inherit;
      cursor: pointer;
    }

    #avatar-editor button[data-action="save"] {
      border-color: #66c0f4;
      color: #10202d;
      background: #66c0f4;
      font-weight: 700;
    }

    #avatar-editor button:focus-visible,
    #zoom-control:focus-visible,
    #crop-viewport:focus-visible {
      outline: 2px solid #9edbff;
      outline-offset: 3px;
    }
  </style>

  <img id="avatar-image" alt="" draggable="false">

  <dialog id="avatar-editor" aria-labelledby="avatar-editor-title" aria-describedby="avatar-editor-instructions">
    <h2 id="avatar-editor-title">Adjust profile image</h2>
    <p class="instructions" id="avatar-editor-instructions"></p>
    <div id="crop-viewport" role="img" tabindex="0">
      <img id="crop-image" alt="" draggable="false">
    </div>
    <label id="zoom-label" for="zoom-control">Zoom</label>
    <input id="zoom-control" type="range" min="1" max="4" step="0.05" value="1">
    <div class="actions">
      <button type="button" data-action="cancel">Cancel</button>
      <button type="button" data-action="save">Save image</button>
    </div>
  </dialog>
`;

export { template };
