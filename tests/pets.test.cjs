const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "pets/app.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "pets/index.html"), "utf8");
const photo = "data:image/jpeg;base64,cGhvdG8=";

class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.value = "";
    this.files = [];
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.dataset = {};
  }
  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }
  async fire(type) {
    await Promise.all((this.listeners[type] || []).map((listener) => listener({ preventDefault() {} })));
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; delete this[key]; }
  get childElementCount() { return this.children.length; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; void this.fire("close"); }
  reset() {
    for (const field of Object.values(this.fields || {})) field.value = "";
  }
}

function setup(saved = [], options = {}) {
  const nodes = Object.fromEntries([...markup.matchAll(/id="([^"]+)"/g)].map((match) => [`#${match[1]}`, new Element()]));
  for (const [id, fields] of [["pet-form", ["name", "species", "breed", "birthday", "age", "weight", "notes"]], ["log-form", ["date", "text"]]]) {
    const form = nodes[`#${id}`];
    form.fields = Object.fromEntries(fields.map((field) => [field, new Element("input")]));
    form.elements = { namedItem: (name) => form.fields[name] };
  }
  const storage = new Map([["pets", typeof saved === "string" ? saved : JSON.stringify(saved)]]);
  const alerts = [];
  const images = [];
  const canvases = [];
  const revoked = [];
  let failure = options.writeError;
  let sequence = 0;
  const document = {
    documentElement: new Element("html"),
    querySelector(selector) {
      assert.ok(nodes[selector], `Missing selector ${selector}`);
      return nodes[selector];
    },
    createElement(tag) {
      const element = new Element(tag);
      if (tag === "canvas") {
        canvases.push(element);
        element.getContext = () => options.noCanvas ? null : {
          set fillStyle(value) { element.fillStyle = value; },
          fillRect: (...args) => { element.fill = args; },
          drawImage: (...args) => { element.draw = args; },
        };
        element.toDataURL = (type, quality) => {
          element.encoding = { type, quality };
          if (options.exportError) throw new Error("Encoding failed");
          return photo;
        };
      }
      return element;
    },
  };
  const context = vm.createContext({
    document,
    localStorage: {
      getItem(key) {
        if (options.readError) throw new Error("Storage denied");
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (failure) throw Object.assign(new Error("Storage failure"), { name: failure });
        storage.set(key, value);
      },
      removeItem: (key) => storage.delete(key),
    },
    alert: (message) => alerts.push(message),
    confirm: () => options.confirm !== false,
    crypto: { randomUUID: () => `id-${++sequence}` },
    URL: { createObjectURL: () => `blob:${images.length}`, revokeObjectURL: (url) => revoked.push(url) },
    Image: class {
      constructor() { images.push(this); }
      succeed(width = 1000, height = 500) {
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload();
      }
      fail() { this.onerror(); }
    },
  });
  vm.runInContext(source, context);
  return {
    nodes, document, storage, alerts, images, canvases, revoked,
    field: (name) => nodes["#pet-form"].fields[name],
    saved: () => JSON.parse(storage.get("pets")),
    failWrites: (name) => { failure = name; },
    async open(pet = null) {
      if (pet) {
        context.testPet = pet;
        vm.runInContext("openPetForm(testPet)", context);
      } else await nodes["#add-pet"].fire("click");
    },
    select(type = "image/png") {
      nodes["#pet-photo"].files = [{ type }];
      return nodes["#pet-photo"].fire("change");
    },
    submit: () => nodes["#pet-form"].fire("submit"),
  };
}

function allNodes(node) {
  return [node, ...node.children.flatMap(allNodes)];
}

function button(app, text) {
  return allNodes(app.nodes["#pet-list"]).find((node) => node.tagName === "button" && node.textContent === text);
}

function pet(overrides = {}) {
  return { id: "existing", name: "Milo", species: "Cat", logs: [], ...overrides };
}

test("static page has an accessible image input and no external runtime scripts", () => {
  assert.match(markup, /<input id="pet-photo" type="file" accept="image\/\*"/);
  assert.match(markup, /<label for="pet-photo">/);
  assert.doesNotMatch(markup, /(?:src|href)="https?:/);
  assert.match(fs.readFileSync(path.join(root, "pets/styles.css"), "utf8"), /object-fit: cover/);
});

test("legacy pets without photos render an initial and add/edit preserve care notes", async () => {
  const logs = [{ id: "log", date: "2026-01-01", text: "Vet check" }];
  const app = setup([pet({ logs, customField: "keep" })]);
  assert.ok(allNodes(app.nodes["#pet-list"]).some((node) => node.textContent === "M"));
  await app.open(pet({ logs, customField: "keep" }));
  app.field("name").value = "Mila";
  await app.submit();
  assert.equal(app.saved()[0].photo, "");
  assert.equal(app.saved()[0].customField, "keep");
  assert.deepEqual(app.saved()[0].logs, logs);
  await app.open();
  app.field("name").value = " Luna ";
  app.field("species").value = "Dog";
  await app.submit();
  assert.equal(app.saved()[1].name, "Luna");
  assert.notEqual(app.saved()[1].id, app.saved()[0].id);
});

test("photo processing uses aspect-preserving JPEG at 80% with a white background", async () => {
  for (const [width, height, expected] of [[1600, 800, [400, 200]], [300, 900, [133, 400]], [80, 40, [80, 40]], [2000, 2000, [400, 400]], [10000, 1, [400, 1]]]) {
    const app = setup();
    await app.open();
    app.field("name").value = "Luna";
    app.field("species").value = "Dog";
    const processing = app.select();
    assert.equal(app.nodes["#save-pet"].disabled, true);
    await app.submit();
    assert.deepEqual(app.saved(), []);
    app.images[0].succeed(width, height);
    await processing;
    assert.deepEqual([app.canvases[0].width, app.canvases[0].height], expected);
    assert.deepEqual(app.canvases[0].encoding, { type: "image/jpeg", quality: 0.8 });
    assert.equal(app.canvases[0].fillStyle, "#ffffff");
    assert.deepEqual(app.canvases[0].fill, [0, 0, ...expected]);
    assert.deepEqual(app.canvases[0].draw.slice(1), [0, 0, ...expected]);
    assert.equal(app.revoked.length, 1);
    assert.equal(app.nodes["#save-pet"].disabled, false);
    assert.equal(app.nodes["#photo-preview"].src, photo);
    await app.submit();
    assert.equal(app.saved()[0].photo, photo);
    assert.ok(allNodes(app.nodes["#pet-list"]).some((node) => node.tagName === "img" && node.src === photo));
    const reloaded = setup(app.saved());
    assert.ok(allNodes(reloaded.nodes["#pet-list"]).some((node) => node.src === photo));
  }
});

test("editing preserves, replaces, removes, or cancels a photo without losing logs", async () => {
  const existing = pet({ photo: "data:image/png;base64,b2xk", logs: [{ date: "2026-01-02", text: "Walk" }] });
  const app = setup([existing]);
  await button(app, "Edit pet").fire("click");
  await app.submit();
  assert.equal(app.saved()[0].photo, existing.photo);
  await button(app, "Edit pet").fire("click");
  let processing = app.select();
  app.images[0].succeed();
  await processing;
  await app.nodes["#cancel-pet"].fire("click");
  assert.equal(app.saved()[0].photo, existing.photo);
  await button(app, "Edit pet").fire("click");
  processing = app.select();
  app.images[1].succeed();
  await processing;
  await app.submit();
  assert.equal(app.saved()[0].photo, photo);
  await button(app, "Edit pet").fire("click");
  await app.nodes["#remove-photo"].fire("click");
  assert.equal(app.nodes["#photo-preview"].hidden, true);
  await app.submit();
  assert.equal(app.saved()[0].photo, "");
  assert.deepEqual(app.saved()[0].logs, existing.logs);
});

test("bad uploads retain the previous photo and release failed image URLs", async () => {
  for (const options of [{}, { noCanvas: true }, { exportError: true }]) {
    const existing = pet({ photo });
    const app = setup([existing], options);
    await app.open(existing);
    await app.select("text/plain");
    assert.equal(app.images.length, 0);
    assert.match(app.nodes["#photo-status"].textContent, /choose an image/);
    const processing = app.select();
    if (options.noCanvas || options.exportError) app.images[0].succeed();
    else app.images[0].fail();
    await processing;
    assert.equal(app.revoked.length, 1);
    assert.equal(app.nodes["#save-pet"].disabled, false);
    assert.match(app.nodes["#photo-status"].textContent, /could not be read/);
    await app.submit();
    assert.equal(app.saved()[0].photo, photo);
  }
});

test("new selections and removal supersede pending photo processing", async () => {
  const app = setup();
  await app.open();
  const first = app.select();
  const second = app.select();
  app.images[0].succeed();
  await first;
  assert.equal(app.nodes["#save-pet"].disabled, true);
  await app.nodes["#remove-photo"].fire("click");
  app.images[1].succeed();
  await second;
  assert.equal(app.nodes["#photo-preview"].hidden, true);
  assert.equal(app.nodes["#save-pet"].disabled, false);
  assert.equal(app.revoked.length, 2);
});

test("closing the dialog ignores a pending photo even after a different pet is opened", async () => {
  const app = setup();
  await app.open();
  const processing = app.select();
  await app.nodes["#pet-dialog"].fire("cancel");
  app.nodes["#pet-dialog"].close();
  await app.open();
  app.images[0].succeed();
  await processing;
  assert.equal(app.nodes["#photo-preview"].hidden, true);
  assert.equal(app.nodes["#save-pet"].disabled, false);
});

test("quota failure preserves saved data, cards and draft; removing a photo allows retry", async () => {
  const existing = pet({ photo });
  const app = setup([existing], { writeError: "QuotaExceededError" });
  await app.open(existing);
  app.field("name").value = "Mila";
  await app.submit();
  assert.deepEqual(app.saved(), [existing]);
  assert.equal(app.nodes["#pet-dialog"].open, true);
  assert.equal(app.field("name").value, "Mila");
  assert.equal(app.nodes["#photo-preview"].src, photo);
  assert.ok(allNodes(app.nodes["#pet-list"]).some((node) => node.textContent === "Milo"));
  assert.match(app.alerts[0], /storage is full/);
  await app.nodes["#remove-photo"].fire("click");
  app.failWrites(null);
  await app.submit();
  assert.equal(app.saved()[0].name, "Mila");
  assert.equal(app.saved()[0].photo, "");
  assert.equal(app.nodes["#storage-status"].hidden, true);
});

test("care notes and deletion are transactional too", async () => {
  const existing = pet({ photo });
  const app = setup([existing]);
  await button(app, "Add care note").fire("click");
  app.nodes["#log-form"].fields.date.value = "2026-10-01";
  app.nodes["#log-form"].fields.text.value = " Grooming ";
  app.failWrites("SecurityError");
  await app.nodes["#log-form"].fire("submit");
  assert.deepEqual(app.saved(), [existing]);
  assert.equal(app.nodes["#log-dialog"].open, true);
  assert.match(app.alerts[0], /storage is unavailable/);
  app.failWrites(null);
  await app.nodes["#log-form"].fire("submit");
  assert.equal(app.saved()[0].photo, photo);
  assert.equal(app.saved()[0].logs[0].text, "Grooming");
  app.failWrites("QuotaExceededError");
  await button(app, "Delete pet").fire("click");
  assert.equal(app.saved().length, 1);
  app.failWrites(null);
  await button(app, "Delete pet").fire("click");
  assert.deepEqual(app.saved(), []);
  assert.equal(app.nodes["#empty-state"].hidden, false);
});

test("malformed and unreadable storage cannot overwrite previous data", async () => {
  for (const [saved, options] of [["broken json", {}], [{}, {}], [[pet(), pet()], {}], [[], { readError: true }]]) {
    const app = setup(saved, options);
    const original = app.storage.get("pets");
    assert.equal(app.nodes["#add-pet"].disabled, true);
    assert.equal(app.nodes["#storage-status"].hidden, false);
    await app.open();
    app.field("name").value = "Luna";
    app.field("species").value = "Dog";
    await app.submit();
    assert.equal(app.storage.get("pets"), original);
  }
});

test("user text is rendered as text and remote photo URLs are not loaded", () => {
  const name = '<img src=x onerror="alert(1)">';
  const app = setup([pet({ name, photo: "https://example.com/photo.jpg", notes: "<script>bad</script>" })]);
  const nodes = allNodes(app.nodes["#pet-list"]);
  assert.ok(nodes.some((node) => node.textContent === name));
  assert.ok(nodes.some((node) => node.textContent === "<script>bad</script>"));
  assert.ok(!nodes.some((node) => node.tagName === "img"));
});

test("theme toggles remain usable if preference storage is full", async () => {
  const app = setup([], { writeError: "QuotaExceededError" });
  await app.nodes["#theme-toggle"].fire("click");
  assert.equal(app.document.documentElement.dataset.theme, "night");
  await app.nodes["#theme-toggle"].fire("click");
  assert.equal(app.document.documentElement.dataset.theme, undefined);
  assert.equal(app.alerts.length, 0);
});

test("care notes render newest-first and canceled deletion leaves data intact", async () => {
  const existing = pet({ logs: [
    { date: "2026-01-01", text: "Old note" },
    { date: "2026-10-01", text: "New note" },
  ] });
  const app = setup([existing], { confirm: false });
  const dates = allNodes(app.nodes["#pet-list"]).filter((node) => node.tagName === "time");
  assert.deepEqual(dates.map((node) => node.dateTime), ["2026-10-01", "2026-01-01"]);
  await button(app, "Delete pet").fire("click");
  assert.deepEqual(app.saved(), [existing]);
});
