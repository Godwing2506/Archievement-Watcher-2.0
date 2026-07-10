'use strict';

const { ipcRenderer } = require('electron');

const template = `
    
    <link rel="stylesheet" href="../resources/css/normalize.css" type="text/css"/>
    <link rel="stylesheet" href="../resources/css/fontawesome.css" type="text/css"/>
    <link rel="stylesheet" href="../resources/css/common.css" type="text/css" />

    <style>
    
      :host { 
          position: relative;
          width: 100%;
          height: 30px;
          z-index: 999;
          display: flex;
          color: #50525b;
          -webkit-app-region: drag;
          cursor: default;
      }

      ul { 
          position: absolute;
          right: 0;
          top: 0;
          z-index: 99;
          direction: rtl;
          height: 100%;
      }

      ul > li {
          display: inline-block;
          font-size: 12px;
          -webkit-app-region: no-drag;
          width: 45px;
          height: 100%;
          box-sizing: border-box;
          text-align: center;
          vertical-align: middle;
          line-height: 30px;
      }
      ul > li { background-color: transparent;}
      ul > li:hover { background-color: rgba(255,255,255,0.20); color: #dedede}
      ul > li svg {
          width: 11px;
          height: 11px;
          vertical-align: middle;
          display: inline-block;
      }
      ul > li#btn-close:hover { background-color: rgba(215,40,40,0.9);}
      :host(.animate) ul > li#btn-settings:hover i { transform: rotate(180deg); transition: 1.0s; }
      
    </style>
    
    <ul>
      <li id="btn-close" title="Cerrar" aria-label="Cerrar"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></li>
      <li id="btn-maximize" title="Maximizar" aria-label="Maximizar"><svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></li>
      <li id="btn-settings" title="Ajustes" aria-label="Ajustes"><i class="fas fa-cog"></i></li>
      <li id="btn-minimize" title="Minimizar" aria-label="Minimizar"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 7.5 H8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></li>
    </ul>
`;

export default class titleBar extends HTMLElement {
    constructor() {
      super();

      this.attachShadow({mode: 'open'}).innerHTML = template;

      this.closeBtn = this.shadowRoot.querySelector("#btn-close");
      this.maximizeBtn = this.shadowRoot.querySelector("#btn-maximize");
      this.settingsBtn = this.shadowRoot.querySelector("#btn-settings");
      this.minimizeBtn = this.shadowRoot.querySelector("#btn-minimize");

    }
    
    /* Life Cycle */
    connectedCallback() {
      this.closeBtn.addEventListener('click', this.close.bind(this));
      this.maximizeBtn.addEventListener('click', this.maximize.bind(this));
      this.settingsBtn.addEventListener('click', this.settings.bind(this));
      this.minimizeBtn.addEventListener('click', this.minimize.bind(this));
      
      const defaults = [
		ipcRenderer.invoke('win-isMinimizable'),
		ipcRenderer.invoke('win-isMaximizable')
      ];

      Promise.allSettled(defaults).then((promises)=> {
		
		const [ isMinimizable, isMaximizable ] = promises;
      
		if (isMinimizable.value === true) this.setAttribute('minimizable', '');
		if (isMaximizable.value === true) this.setAttribute('maximizable', '');
      
		this.update();
      });
    }
    
    disconnectedCallback() {
      this.closeBtn.removeEventListener('click', this.close.bind(this));
      this.maximizeBtn.removeEventListener('click', this.maximize.bind(this));
      this.settingsBtn.removeEventListener('click', this.settings.bind(this));
      this.minimizeBtn.removeEventListener('click', this.minimize.bind(this));
    } 
    
    /* Update */
    
    static get observedAttributes() {
      return ['maximizable', 'minimizable', 'insettings'];
    }
    
    attributeChangedCallback(name, oldValue, newValue) {
      this.update();
    }
    
    update(){
      if (this.hasAttribute('maximizable')) {
        this.maximizeBtn.style["display"] = "inline-block";
      } else {
        this.maximizeBtn.style["display"] = "none";
      }
      
      if (this.hasAttribute('minimizable')) {
        this.minimizeBtn.style["display"] = "inline-block";
      } else {
        this.minimizeBtn.style["display"] = "none";
      }
      
      if(this.hasAttribute('insettings')) {
        this.settingsBtn.style["pointer-events"] = "none";
      } else {
        this.settingsBtn.style["pointer-events"] = "initial";
      }
    }
    
    /* Getter/Setter */
    get maximizable() {
      return this.hasAttribute('maximizable');
    }

    set maximizable(isMaximizable) {
      if (isMaximizable) {
        this.setAttribute('maximizable', '');
      } else {
        this.removeAttribute('maximizable');
      }
    }
    
    get minimizable() {
      return this.hasAttribute('minimizable');
    }

    set minimizable(isMinimizable) {
      if (isMinimizable) {
        this.setAttribute('minimizable', '');
      } else {
        this.removeAttribute('minimizable');
      }
    }
    
    get inSettings() {
      return this.hasAttribute('inSettings');
    }
    
    set inSettings(isInSettings) {
      if (isInSettings) {
        this.setAttribute('inSettings', '');
      } else {
        this.removeAttribute('inSettings');
      }
    }
    
    /* Custom method */
    close() {
      //this.dispatchEvent(new CustomEvent('close'));
      ipcRenderer.invoke('win-close');
    }
    
    maximize() {
      //this.dispatchEvent(new CustomEvent('maximize'));
      ipcRenderer.invoke('win-maximize');
    }

    settings() {
      this.dispatchEvent(new CustomEvent('open-settings'));
    }
    
    minimize() {
      //this.dispatchEvent(new CustomEvent('minimize'));
      ipcRenderer.invoke('win-minimize');
    }
    
}