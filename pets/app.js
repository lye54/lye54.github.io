"use strict";

const petList = document.querySelector("#pet-list");
const emptyState = document.querySelector("#empty-state");
const storageStatus = document.querySelector("#storage-status");
const petDialog = document.querySelector("#pet-dialog");
const petForm = document.querySelector("#pet-form");
const logDialog = document.querySelector("#log-dialog");
const logForm = document.querySelector("#log-form");
const photoInput = document.querySelector("#pet-photo");
const photoPreview = document.querySelector("#photo-preview");
const photoPlaceholder = document.querySelector("#photo-placeholder");
const photoStatus = document.querySelector("#photo-status");
const removePhoto = document.querySelector("#remove-photo");
const savePet = document.querySelector("#save-pet");
const profileFields = ["name", "species", "breed", "birthday", "age", "weight", "notes"];
let pets = [];
let storageReadable = true;
let editingId = null;
let loggingId = null;
let draftPhoto = "";
let photoRequest = 0;
let photoLoading = false;

function showStorageError(message) {
  storageStatus.textContent = message;
  storageStatus.hidden = false;
}

function loadPets() {
  try {
    const saved = localStorage.getItem("pets");
    if (saved === null) return;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every((pet) =>
      pet && typeof pet === "object" &&
      (typeof pet.id === "string" || typeof pet.id === "number") &&
      typeof pet.name === "string" &&
      (pet.logs === undefined || Array.isArray(pet.logs))
    ) || new Set(parsed.map((pet) => pet.id)).size !== parsed.length) {
      throw new Error("Invalid pet data");
    }
    pets = parsed.map((pet) => ({ ...pet, logs: pet.logs || [], photo: pet.photo || "" }));
  } catch {
    storageReadable = false;
    showStorageError("Saved pets could not be read. Saving is disabled to protect existing data. Check your browser storage settings or recover the saved data before trying again.");
    document.querySelector("#add-pet").disabled = true;
  }
}

function savePets(nextPets) {
  if (!storageReadable) return false;
  try {
    localStorage.setItem("pets", JSON.stringify(nextPets));
  } catch (error) {
    const message = error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
      ? "Browser storage is full. Your changes were not saved. Remove a photo or unused pet to free space, then try again."
      : "Your changes were not saved. Browser storage is unavailable; check your browser settings and try again.";
    showStorageError(message);
    alert(message);
    return false;
  }
  pets = nextPets;
  storageStatus.hidden = true;
  renderPets();
  return true;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label, onClick, className = "text-button") {
  const button = element("button", className, label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function isPhoto(photo) {
  return typeof photo === "string" && /^data:image\/(jpeg|png|gif|webp|avif|bmp);base64,/i.test(photo);
}

function initial(name) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() || "?";
}

function renderPets() {
  petList.replaceChildren();
  emptyState.hidden = pets.length > 0 || !storageReadable;
  for (const pet of pets) {
    const card = element("article", "pet-card");
    const heading = element("div", "pet-heading");
    if (isPhoto(pet.photo)) {
      const photo = element("img", "pet-photo");
      photo.src = pet.photo;
      photo.alt = `Photo of ${pet.name}`;
      photo.width = 88;
      photo.height = 88;
      heading.append(photo);
    } else {
      const placeholder = element("span", "pet-photo photo-placeholder", initial(pet.name));
      placeholder.setAttribute("aria-hidden", "true");
      heading.append(placeholder);
    }
    const title = element("div");
    title.append(element("h2", "", pet.name), element("p", "muted", pet.species || "Pet"));
    heading.append(title);
    card.append(heading);
    const details = element("dl", "pet-details");
    for (const [field, label] of [["breed", "Breed"], ["birthday", "Birthday"], ["age", "Age"], ["weight", "Weight"]]) {
      if (pet[field]) details.append(element("dt", "", label), element("dd", "", pet[field]));
    }
    card.append(details);
    if (pet.notes) card.append(element("p", "", pet.notes));
    const actions = element("div", "card-actions");
    actions.append(
      action("Edit pet", () => openPetForm(pet)),
      action("Add care note", () => openLogForm(pet)),
      action("Delete pet", () => {
        if (confirm(`Delete ${pet.name} and all their care notes? This cannot be undone.`)) {
          savePets(pets.filter((item) => item.id !== pet.id));
        }
      }, "text-button danger")
    );
    card.append(actions);
    const logSection = element("section", "care-log");
    logSection.append(element("h3", "", "Care notes"));
    if (!pet.logs.length) logSection.append(element("p", "muted", "No care notes yet."));
    const logs = element("ul");
    const sortedLogs = pet.logs.filter((log) => log && typeof log.date === "string")
      .slice().sort((a, b) => b.date.localeCompare(a.date));
    for (const log of sortedLogs) {
      const entry = element("li");
      const date = element("time", "", log.date);
      date.dateTime = log.date;
      entry.append(date, element("span", "", log.text || ""));
      logs.append(entry);
    }
    if (logs.childElementCount) logSection.append(logs);
    card.append(logSection);
    petList.append(card);
  }
}

function updatePhotoPreview() {
  const hasPhoto = isPhoto(draftPhoto);
  photoPreview.hidden = !hasPhoto;
  if (hasPhoto) photoPreview.src = draftPhoto;
  else photoPreview.removeAttribute("src");
  photoPlaceholder.hidden = hasPhoto;
  photoPlaceholder.textContent = initial(petForm.elements.namedItem("name").value);
  removePhoto.hidden = !draftPhoto && !photoLoading;
  savePet.disabled = photoLoading || !storageReadable;
}

function resetPhotoRequest() {
  photoRequest += 1;
  photoLoading = false;
  photoInput.value = "";
  photoStatus.textContent = "";
}

function openPetForm(pet = null) {
  petForm.reset();
  resetPhotoRequest();
  editingId = pet ? pet.id : null;
  draftPhoto = pet?.photo || "";
  document.querySelector("#pet-dialog-title").textContent = pet ? "Edit pet" : "Add pet";
  for (const field of profileFields) petForm.elements.namedItem(field).value = pet?.[field] || "";
  updatePhotoPreview();
  petDialog.showModal();
  petForm.elements.namedItem("name").focus();
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty image");
        const scale = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const photo = canvas.toDataURL("image/jpeg", 0.8);
        if (!photo.startsWith("data:image/jpeg;base64,")) throw new Error("Could not encode image");
        resolve(photo);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    image.src = url;
  });
}

photoInput.addEventListener("change", async () => {
  const request = ++photoRequest;
  const file = photoInput.files[0];
  photoLoading = false;
  photoStatus.textContent = "";
  if (!file) {
    updatePhotoPreview();
    return;
  }
  if (!file.type.startsWith("image/")) {
    photoInput.value = "";
    photoStatus.textContent = "Please choose an image file.";
    updatePhotoPreview();
    return;
  }
  photoLoading = true;
  photoStatus.textContent = "Preparing photo…";
  updatePhotoPreview();
  try {
    const photo = await resizePhoto(file);
    if (request !== photoRequest) return;
    draftPhoto = photo;
    photoStatus.textContent = "Photo ready. Save the pet to keep it.";
  } catch {
    if (request !== photoRequest) return;
    photoStatus.textContent = "This image could not be read. Try a JPEG, PNG, or another supported image. Your previous photo is unchanged.";
  } finally {
    if (request === photoRequest) {
      photoLoading = false;
      photoInput.value = "";
      updatePhotoPreview();
    }
  }
});

removePhoto.addEventListener("click", () => {
  resetPhotoRequest();
  draftPhoto = "";
  photoStatus.textContent = "Photo removed from this draft. Save the pet to keep this change.";
  updatePhotoPreview();
});

petForm.elements.namedItem("name").addEventListener("input", updatePhotoPreview);
document.querySelector("#add-pet").addEventListener("click", () => openPetForm());
document.querySelector("#cancel-pet").addEventListener("click", () => {
  resetPhotoRequest();
  petDialog.close();
});
petDialog.addEventListener("cancel", resetPhotoRequest);
petDialog.addEventListener("close", resetPhotoRequest);

petForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (photoLoading) return;
  const fields = Object.fromEntries(profileFields.map((field) => [field, petForm.elements.namedItem(field).value.trim()]));
  if (!fields.name || !fields.species) {
    alert("Please enter a name and species, not just spaces.");
    return;
  }
  const existing = pets.find((pet) => pet.id === editingId);
  const pet = { ...existing, ...fields, id: existing?.id ?? crypto.randomUUID(), logs: existing?.logs || [], photo: draftPhoto };
  const nextPets = existing ? pets.map((item) => item.id === editingId ? pet : item) : [...pets, pet];
  if (savePets(nextPets)) petDialog.close();
});

function openLogForm(pet) {
  loggingId = pet.id;
  logForm.reset();
  document.querySelector("#log-dialog-title").textContent = `Care note for ${pet.name}`;
  const today = new Date();
  logForm.elements.namedItem("date").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  logDialog.showModal();
}

document.querySelector("#cancel-log").addEventListener("click", () => logDialog.close());
logForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const date = logForm.elements.namedItem("date").value;
  const text = logForm.elements.namedItem("text").value.trim();
  if (!date || !text) {
    alert("Please enter a date and a care note.");
    return;
  }
  const nextPets = pets.map((pet) => pet.id === loggingId
    ? { ...pet, logs: [...pet.logs, { id: crypto.randomUUID(), date, text }] }
    : pet);
  if (savePets(nextPets)) logDialog.close();
});

try {
  if (localStorage.getItem("theme") === "night") document.documentElement.dataset.theme = "night";
} catch {
  // Theme preference is optional when browser storage is unavailable.
}
document.querySelector("#theme-toggle").addEventListener("click", () => {
  const night = document.documentElement.dataset.theme !== "night";
  if (night) document.documentElement.dataset.theme = "night";
  else delete document.documentElement.dataset.theme;
  try {
    if (night) localStorage.setItem("theme", "night");
    else localStorage.removeItem("theme");
  } catch {
    // Keep the theme usable even if its preference cannot be saved.
  }
});

loadPets();
renderPets();
