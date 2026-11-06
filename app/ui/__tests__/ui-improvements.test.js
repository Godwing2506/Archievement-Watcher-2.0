"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = "";
    this.classList = {
      add: jest.fn(),
      remove: jest.fn()
    };
  }

  set textContent(value) {
    this.text = value;
  }

  get textContent() {
    return this.text || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  querySelector(selector) {
    const className = selector.slice(1);
    return this.children.find((child) =>
      child.className.split(" ").includes(className)
    ) || null;
  }
}

function loadUiImprovements() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "ui-improvements.js"),
    "utf8"
  );
  const body = new FakeElement("body");
  const context = {
    document: {
      body,
      readyState: "loading",
      createElement: (tagName) => new FakeElement(tagName),
      addEventListener: jest.fn()
    },
    setTimeout: jest.fn(),
    clearTimeout: jest.fn(),
    console
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { window: context, body };
}

describe("showToast", () => {
  it("renders untrusted messages as text and exposes an accessible status", () => {
    const { window, body } = loadUiImprovements();
    const message = '<img src=x onerror="alert(1)">';

    const toast = window.showToast(message, "info", 0);
    const messageElement = toast.querySelector(".toast-message");

    expect(messageElement.textContent).toBe(message);
    expect(toast.innerHTML).toBeUndefined();
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.getAttribute("aria-live")).toBe("polite");
    expect(body.children).toContain(toast);
  });

  it("announces errors assertively", () => {
    const { window } = loadUiImprovements();

    const toast = window.showToast("Scan failed", "error", 0);

    expect(toast.getAttribute("role")).toBe("alert");
    expect(toast.getAttribute("aria-live")).toBe("assertive");
  });
});
