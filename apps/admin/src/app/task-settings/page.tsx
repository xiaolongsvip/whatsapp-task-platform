"use client";

// The task-settings list reuses the existing task-list implementation.
// Keeping this as a separate route isolates its navigation state from the
// top-level Task Management entry without changing that page or its behavior.
export { default } from "../tasks/page";
